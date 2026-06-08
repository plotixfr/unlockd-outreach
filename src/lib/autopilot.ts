/**
 * The autopilot orchestrator. Runs one SearchBrief end-to-end:
 *   discover → email-find → create → enrich → score → generate → schedule
 *
 * Each step is best-effort: a failure at any stage downgrades the prospect's
 * journey without crashing the whole run. The DiscoveryRun row tracks how
 * many prospects made it through each gate so the operator can tune briefs
 * (e.g. raise qualityThreshold if too many score < 6).
 *
 * Sending itself happens via the existing send cron — autopilot just sets
 * scheduledInitial/Follow1/2/3 dates so the cron picks them up at business
 * hours.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { searchPlaces, type DiscoveredPlace } from "@/lib/discovery";
import { searchSirene } from "@/lib/discoverySirene";
import { findEmailForSite } from "@/lib/emailFinder";
import { scrapeSite, type SiteSnapshot } from "@/lib/scrapeSite";
import { fetchPageSpeed, type PageSpeedSnapshot } from "@/lib/pagespeed";
import { findDecisionMakers, type DecisionMakerResult } from "@/lib/decisionMakers";
import { scoreProspect } from "@/lib/qualityScore";
import { buildEmailPrompt, getEmailSystemPrompt, extractJsonArray, type PromptCaseStudy } from "@/lib/emailPrompt";
import { verifyEmail } from "@/lib/verifyEmail";
import { isDomainSuppressed } from "@/lib/suppression";
import { generateAuditFindings } from "@/lib/auditFindings";
import { generateMockup } from "@/lib/mockup";
import { pickSubjectVariant } from "@/lib/subjectWinner";

const EMAIL_MODEL = "claude-sonnet-4-6";
// Throughput knobs — defaults are Vercel-Hobby-safe (60s function cap). On
// Pro (300s cap), override via env:
//   AUTOPILOT_MAX_PER_BRIEF=5
//   AUTOPILOT_CONCURRENCY=5
//   AUTOPILOT_TIME_BUDGET_MS=240000
const MAX_PROSPECTS_PER_BRIEF = Number(process.env.AUTOPILOT_MAX_PER_BRIEF ?? 2);
const RUN_TIME_BUDGET_MS = Number(process.env.AUTOPILOT_TIME_BUDGET_MS ?? 50_000);
const BRIEF_CONCURRENCY = Number(process.env.AUTOPILOT_CONCURRENCY ?? 3);
// After 3 consecutive zero-created runs, deactivate the brief to stop burning
// Places quota + Claude tokens on something that's not delivering.
const AUTO_PAUSE_AFTER_EMPTY_RUNS = 3;
// Look this many days ahead when finding the next send slot with capacity.
const SCHEDULE_LOOKAHEAD_DAYS = 30;
// A DiscoveryRun stuck in status="running" longer than this is treated as
// crashed (Vercel killed the function) and marked failed. Hobby's 60s cap
// means real runs finish in <50s; anything still "running" after 3 minutes
// is a corpse.
const STALE_RUN_MS = 3 * 60_000;
// Per-step wall-clock caps inside processPlace. One slow site (e.g. a
// CMS that times out) used to burn 30s+ of the 60s budget alone.
const SCRAPE_TIMEOUT_MS = 8_000;
const PSI_TIMEOUT_MS = 10_000;
const DM_TIMEOUT_MS = 8_000;
const EMAIL_FIND_TIMEOUT_MS = 10_000;
const GEN_TIMEOUT_MS = 22_000;
const VERIFY_TIMEOUT_MS = 9_000;
const AUDIT_TIMEOUT_MS = 22_000;
const MOCKUP_TIMEOUT_MS = 30_000;
// Toggle: defaults true if REPLICATE_API_TOKEN is set. Skips when missing
// so the autopilot doesn't error on every prospect when Replicate quota /
// billing is off.
const MOCKUP_ENABLED = !!process.env.REPLICATE_API_TOKEN;
// Toggle: defaults true. Set EMAIL_VERIFY=false to disable (e.g. if a host
// blocks outbound port 25 and every verify returns "unknown").
const EMAIL_VERIFY_ENABLED = process.env.EMAIL_VERIFY !== "false";

/**
 * Resolves to the promise's value, or null if it doesn't settle within `ms`.
 * The underlying work keeps running in the background; we just stop waiting.
 * Fine here because the serverless function itself ends soon after.
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) =>
      setTimeout(() => {
        console.log(`[autopilot] ${label} timed out after ${ms}ms`);
        resolve(null);
      }, ms)
    ),
  ]);
}

export interface BriefRunSummary {
  briefId: string;
  briefName: string;
  found: number;
  emailsFound: number;
  created: number;
  qualified: number;
  scheduled: number;
  errors: string[];
}

/**
 * Picks a slot N business days ahead in Paris time at 06:00–08:59.
 *
 * Why 06–09 and not 09–17: the send cron fires once daily at 10:00 Paris.
 * Anything scheduled after 09:00 misses that day's fire — the prospect waits
 * a full extra day. By bucketing follow-ups into the same 06–09 window as
 * initials (see slotInDay), every scheduled day's cron picks them up.
 */
function nextWorkingSlot(daysAhead = 1): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  for (let i = 0; i < 7; i++) {
    const weekdayName = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short" })
      .format(d);
    if (weekdayName !== "Sat" && weekdayName !== "Sun") break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return slotInDay(d);
}

function inferNicheFromPlaceType(primaryType: string | null, briefNiche: string): string {
  if (!primaryType) return briefNiche;
  // Google Places primaryType → canonical niche label. Mapped only for
  // categories Unlockd targets (Group A B2B services). Sirene briefs pass
  // NAF codes here — leave them as-is so the email prompt sees the code
  // and the operator can map them in the UI.
  const map: Record<string, string> = {
    lawyer: "Law firm",
    accounting: "Accountant",
    consultant: "Consultancy",
    marketing_agency: "Marketing agency",
    advertising_agency: "Marketing agency",
    architect: "Architecture",
    employment_agency: "Recruiter",
    insurance_agency: "Insurance broker",
  };
  return map[primaryType] ?? briefNiche;
}

interface BriefInput {
  id: string;
  name: string;
  niche: string;
  city: string | null;
  country: string;
  query: string | null;
  source: string;
  language: string;
  minRating: number | null;
  minReviews: number | null;
  maxPerRun: number;
  qualityThreshold: number;
  autoGenerate: boolean;
  autoSchedule: boolean;
}

/**
 * Generates emails for the prospect and saves them — mirror of the
 * /api/emails/generate route, but inline so the autopilot doesn't have to
 * make an HTTP call back to itself.
 */
async function generateEmailsInline(
  prospectId: string,
  ctx: {
    site: SiteSnapshot | null;
    psi: PageSpeedSnapshot | null;
    dm: DecisionMakerResult | null;
  }
): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return 0;
  const anthropic = new Anthropic({ apiKey });

  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!prospect) return 0;

  const nicheTemplate = await prisma.nicheTemplate.findUnique({ where: { nisa: prospect.nisa } });
  const caseStudyRow =
    (await prisma.caseStudy.findFirst({
      where: { nisa: prospect.nisa, active: true },
      orderBy: { updatedAt: "desc" },
    })) ??
    (await prisma.caseStudy.findFirst({ where: { active: true }, orderBy: { updatedAt: "desc" } }));
  const caseStudy: PromptCaseStudy | null = caseStudyRow
    ? {
        title: caseStudyRow.title,
        summary: caseStudyRow.summary,
        metricLabel: caseStudyRow.metricLabel,
        metricValue: caseStudyRow.metricValue,
      }
    : null;

  // Pick up the cached 3-finding audit + mockup URL if processPlace
  // generated either; they drive Follow2 (audit findings as body) and
  // F1/F2 (mockup link as visual proof of concept).
  const audit = (prospect.auditFindings as unknown as
    | import("@/lib/auditFindings").AuditResult
    | null) ?? null;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://unlockd-outreach.vercel.app";
  const message = await withTimeout(
    anthropic.messages.create({
      model: EMAIL_MODEL,
      max_tokens: 4096,
      system: await getEmailSystemPrompt(prospect.language),
      messages: [
        {
          role: "user",
          content: buildEmailPrompt(prospect, {
            nicheHint: nicheTemplate?.promptHint,
            siteSnapshot: ctx.site,
            pagespeed: ctx.psi,
            decisionMakers: ctx.dm,
            caseStudy,
            audit,
            mockupUrl: prospect.mockupUrl,
            auditUrl: `${siteUrl}/audit/${prospect.id}`,
            lang: prospect.language,
          }),
        },
      ],
    }),
    GEN_TIMEOUT_MS,
    `generateEmails(${prospect.firmaNaziv})`
  );
  if (!message) return 0;
  const block = message.content[0];
  if (!block || block.type !== "text") return 0;
  const raw = extractJsonArray(block.text);
  let parsed: Array<{ tip?: string; subject?: string; subjectB?: string; body?: string }>;
  try {
    parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return 0;
  } catch {
    return 0;
  }
  // Bias the A/B pick toward the winner if this niche has enough open-rate
  // data; otherwise this is just 50/50 random (same behavior as before).
  const bias = await pickSubjectVariant(prospect.nisa);
  await prisma.email.createMany({
    data: parsed.map((e) => ({
      prospectId,
      tip: String(e.tip ?? "initial"),
      subject: String(e.subject ?? ""),
      subjectB: e.subjectB ? String(e.subjectB) : null,
      body: String(e.body ?? ""),
      // For prospects with both variants, follow the niche-level winner.
      // If no winner data, pickSubjectVariant returns a fresh coin-flip.
      activeSubject: e.subjectB ? bias : "A",
    })),
  });
  await prisma.prospect.update({
    where: { id: prospectId },
    data: { autoGenerated: true },
  });
  return parsed.length;
}

/**
 * Returns the soonest weekday (0..lookahead days ahead) where the count of
 * already-scheduled initial sends is below the daily cap. Without this,
 * autopilot would dump 50 prospects onto tomorrow even though the send cron
 * can only push 30/day — the rest would pile up day after day.
 *
 * i=0 (today) is allowed when it's a Paris weekday AND we're early enough in
 * the day that prospects scheduled "now" can still ship before EOD. This is
 * what fixes the cold-start: previously the first day after a reset always
 * showed 0 sends because everything was bucketed to tomorrow.
 */
async function pickFirstAvailableDay(cap: number, lookaheadDays: number): Promise<Date> {
  // Bucket boundary = UTC midnight. Send cron runs in Paris business hours, so
  // this is a slight day-boundary skew (Paris midnight ≠ UTC midnight); not
  // meaningful for cap accounting.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const probes: { start: Date; end: Date; isToday: boolean }[] = [];
  for (let i = 0; i <= lookaheadDays; i++) {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() + i);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    const weekdayName = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short" })
      .format(start);
    if (weekdayName === "Sat" || weekdayName === "Sun") continue;
    // For today's bucket: only consider it if we're still in Paris business
    // hours (so the send cron — or the post-discovery sweep — can dispatch
    // same-day). Outside that window, fall through to tomorrow.
    if (i === 0 && !isParisBusinessWindow()) continue;
    probes.push({ start, end, isToday: i === 0 });
  }
  for (const probe of probes) {
    const count = await prisma.prospect.count({
      where: {
        scheduledInitial: { gte: probe.start, lt: probe.end },
        status: "Scheduled",
      },
    });
    if (count < cap) {
      return probe.isToday ? slotImmediate() : slotInDay(probe.start);
    }
  }
  // All days full — fall back to the last probed day. The send cron will
  // continue to drain at the cap rate.
  return slotInDay(probes[probes.length - 1]?.start ?? new Date(today.getTime() + 86400000));
}

/**
 * Returns true if "now" is a Paris weekday between 08:00 and 17:30. The upper
 * bound is intentionally a bit before the standard 18:00 cutoff used by the
 * send cron — leaves slack so a slot picked "now" still has time to ship.
 */
function isParisBusinessWindow(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  if (weekday === "Sat" || weekday === "Sun") return false;
  const minutes = hour * 60 + minute;
  return minutes >= 8 * 60 && minutes < 17 * 60 + 30;
}

/**
 * Slot for "today" bucket: a moment one minute ago. That makes the prospect
 * immediately due for the next send-sweep — which the autopilot triggers at
 * the end of its run for exactly this reason.
 */
function slotImmediate(): Date {
  return new Date(Date.now() - 60_000);
}

function slotInDay(dayStart: Date): Date {
  // Pick Paris time 06:00–08:59 so the scheduledInitial is always BEFORE the
  // 10:00 Paris send cron fire time (even with Hobby's ±1h drift). Anything
  // after ~09:00 risks being skipped by the cron because the prospect isn't
  // yet due at fire time, and the send cron only runs once a day — so it'd
  // sit a full extra day.
  const hourLocal = 6 + Math.floor(Math.random() * 3);
  const minute = Math.floor(Math.random() * 60);
  const localStr = `${dayStart.getUTCFullYear()}-${String(dayStart.getUTCMonth() + 1).padStart(2, "0")}-${String(dayStart.getUTCDate()).padStart(2, "0")}T${String(hourLocal).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  const guessUtc = new Date(`${localStr}Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(guessUtc);
  const guessedHour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const offsetMs = (hourLocal - guessedHour) * 3600_000;
  return new Date(guessUtc.getTime() + offsetMs);
}

/**
 * Schedule the campaign so the existing send cron picks it up. The initial
 * send goes to the next day with capacity (respects DAILY_SEND_CAP). Follow-ups
 * cascade from there with +4/+5/+7 day gaps — those don't need cap-awareness
 * because the send cron enforces it at delivery time anyway.
 */
async function scheduleInline(prospectId: string): Promise<void> {
  const cap = Number(process.env.DAILY_SEND_CAP ?? 30);
  const initial = await pickFirstAvailableDay(cap, SCHEDULE_LOOKAHEAD_DAYS);
  const baseOffset = Math.floor((initial.getTime() - Date.now()) / 86400000);
  const f1 = nextWorkingSlot(baseOffset + 4);
  const f2 = nextWorkingSlot(baseOffset + 9);
  const f3 = nextWorkingSlot(baseOffset + 16);
  // Breakup ~5 days after F3 → total ~day 21 of the sequence. Highest reply
  // rate of any cold-outbound touch in our tests; cheap to add given the
  // prospect already passed all upstream gates.
  const breakup = nextWorkingSlot(baseOffset + 21);
  await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      status: "Scheduled",
      scheduledInitial: initial,
      scheduledFollow1: f1,
      scheduledFollow2: f2,
      scheduledFollow3: f3,
      scheduledBreakup: breakup,
      autoScheduled: true,
    },
  });
}

/**
 * Process a single discovered place into a fully-pipelined prospect.
 * Each step writes back to the DB as it completes so partial failures
 * leave behind a recoverable state.
 */
async function processPlace(
  place: DiscoveredPlace,
  brief: BriefInput,
  runId: string
): Promise<{ status: "skipped" | "created" | "qualified" | "scheduled"; reason?: string }> {
  // Already in DB? Skip silently. We dedupe on externalId and on email.
  const existing = await prisma.prospect.findFirst({
    where: { OR: [{ externalId: place.placeId }, place.website ? { website: place.website } : {}].filter(Boolean) as never },
  });
  if (existing) return { status: "skipped", reason: "already in database" };

  if (!place.website) return { status: "skipped", reason: "no website" };

  // Find an email on the prospect's site. Timeout protects against CMSes that
  // hang on contact-page fetches — within a 60s function budget, one slow
  // site can otherwise eat the whole run.
  const emailResult = await withTimeout(
    findEmailForSite(place.website),
    EMAIL_FIND_TIMEOUT_MS,
    `findEmail(${place.website})`
  );
  if (!emailResult || !emailResult.email) {
    return {
      status: "skipped",
      reason: emailResult
        ? `no email found (tried ${emailResult.tried.length} pages)`
        : "email-finder timeout",
    };
  }
  const email = emailResult.email;

  // Race-safe dedupe on email
  const dupByEmail = await prisma.prospect.findUnique({ where: { email } });
  if (dupByEmail) return { status: "skipped", reason: "email already exists" };

  // Domain-level suppression: a colleague at the same company already
  // replied / unsubscribed / bounced — don't waste a slot on a new contact
  // we're not allowed to mail. Public providers are skipped inside helper.
  if (await isDomainSuppressed(email)) {
    return { status: "skipped", reason: "domain on suppression list" };
  }

  // Email verification: MX + SMTP RCPT. Skips on "unknown" so a port-25-
  // blocked environment doesn't flag everything as bad. Catch-all domains
  // get accepted but flagged (verifyResult="catchall") so the operator can
  // see which to send to with caution.
  let verifyOutcome: Awaited<ReturnType<typeof verifyEmail>> | null = null;
  if (EMAIL_VERIFY_ENABLED) {
    verifyOutcome = await withTimeout(verifyEmail(email), VERIFY_TIMEOUT_MS, `verifyEmail(${email})`);
    if (verifyOutcome?.result === "invalid") {
      return { status: "skipped", reason: `invalid email: ${verifyOutcome.reason}` };
    }
  }

  const nicheLabel = inferNicheFromPlaceType(place.primaryType, brief.niche);

  // Create the prospect now so subsequent enrichment can update it.
  const prospect = await prisma.prospect.create({
    data: {
      firmaNaziv: place.name,
      email,
      website: place.website,
      nisa: nicheLabel,
      grad: place.city ?? brief.city ?? "Unknown",
      napomena: [
        place.rating != null ? `Rating: ${place.rating}/5 (${place.ratingCount ?? 0} avis)` : null,
        place.address ?? null,
        place.phone ?? null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
      source: brief.source,
      sourceQuery: brief.query || brief.niche,
      externalId: place.placeId,
      briefId: brief.id,
      language: brief.language,
      status: "New",
      verifiedEmail: verifyOutcome?.result === "valid",
      verifiedAt: verifyOutcome ? new Date() : null,
      verifyResult: verifyOutcome?.result ?? null,
    },
  });

  // Enrich in parallel (each best-effort). Per-step timeouts protect us
  // against slow upstreams; null result just means scoring proceeds without
  // that signal.
  const [site, psi, dm] = await Promise.all([
    withTimeout(scrapeSite(place.website).catch(() => null), SCRAPE_TIMEOUT_MS, `scrape(${place.website})`),
    withTimeout(fetchPageSpeed(place.website).catch(() => null), PSI_TIMEOUT_MS, `psi(${place.website})`),
    withTimeout(findDecisionMakers(place.website).catch(() => null), DM_TIMEOUT_MS, `dm(${place.website})`),
  ]);

  const enrichUpdate: Record<string, unknown> = {};
  if (site) {
    enrichUpdate.siteSnapshot = site;
    enrichUpdate.siteSnapshotAt = new Date();
  }
  if (psi) {
    enrichUpdate.pagespeed = psi;
    enrichUpdate.pagespeedAt = new Date();
  }
  if (dm) enrichUpdate.decisionMakers = dm;
  if (Object.keys(enrichUpdate).length > 0) {
    await prisma.prospect.update({ where: { id: prospect.id }, data: enrichUpdate as never });
  }

  // Score for fit.
  const scoring = await scoreProspect({
    firmaNaziv: place.name,
    nisa: nicheLabel,
    grad: place.city ?? brief.city ?? "Unknown",
    website: place.website,
    opisFirme: null,
    napomena: prospect.napomena,
    siteSnapshot: site,
    pagespeed: psi,
  });
  if (scoring) {
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { qualityScore: scoring.score, qualityNote: scoring.note },
    });
  }

  void runId;

  // Quality gate.
  if (!scoring || scoring.score < brief.qualityThreshold) {
    return { status: "created", reason: `score ${scoring?.score ?? "n/a"} < threshold ${brief.qualityThreshold}` };
  }

  if (!brief.autoGenerate) {
    return { status: "qualified", reason: "autoGenerate=false, awaiting manual generation" };
  }

  // Run audit + mockup in parallel — both are independent of each other and
  // each takes 15-30s. Doing them sequentially would burn 60s of budget;
  // parallel keeps the per-prospect floor under 35s.
  const [audit, mockup] = await Promise.all([
    site?.ok
      ? withTimeout(
          generateAuditFindings({
            firmaNaziv: place.name,
            nisa: nicheLabel,
            grad: place.city ?? brief.city ?? "Unknown",
            website: place.website,
            site,
            psi,
          }),
          AUDIT_TIMEOUT_MS,
          `auditFindings(${place.name})`
        )
      : Promise.resolve(null),
    MOCKUP_ENABLED
      ? withTimeout(
          generateMockup({
            id: prospect.id,
            firmaNaziv: place.name,
            nisa: nicheLabel,
            grad: place.city ?? brief.city ?? "Unknown",
          }),
          MOCKUP_TIMEOUT_MS,
          `mockup(${place.name})`
        )
      : Promise.resolve(null),
  ]);

  const enrichmentUpdate: Record<string, unknown> = {};
  if (audit) {
    enrichmentUpdate.auditFindings = audit;
    enrichmentUpdate.auditFindingsAt = new Date();
  }
  if (mockup?.ok && mockup.url) {
    enrichmentUpdate.mockupUrl = mockup.url;
    enrichmentUpdate.mockupPrompt = mockup.prompt;
    enrichmentUpdate.mockupAt = new Date();
  }
  if (Object.keys(enrichmentUpdate).length > 0) {
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: enrichmentUpdate as never,
    });
  }

  // Generate emails.
  const generated = await generateEmailsInline(prospect.id, { site, psi, dm });
  if (generated === 0) {
    return { status: "qualified", reason: "email generation failed" };
  }

  if (!brief.autoSchedule) {
    return { status: "qualified", reason: "autoSchedule=false, awaiting manual trigger" };
  }

  await scheduleInline(prospect.id);
  return { status: "scheduled" };
}

export async function runBrief(briefId: string): Promise<BriefRunSummary> {
  const brief = await prisma.searchBrief.findUnique({ where: { id: briefId } });
  if (!brief) throw new Error(`Brief ${briefId} not found`);

  const run = await prisma.discoveryRun.create({
    data: { briefId, status: "running" },
  });

  const summary: BriefRunSummary = {
    briefId,
    briefName: brief.name,
    found: 0,
    emailsFound: 0,
    created: 0,
    qualified: 0,
    scheduled: 0,
    errors: [],
  };

  try {
    // Route to the right discovery adapter. Google Places for B2B services
    // (Group A — consultancies, agencies, law firms via location search).
    // Sirene for FR tech startups / SaaS (Group B — NAF-code-driven from
    // the gov registry, free, no API key).
    const search = brief.source === "sirene_api" ? searchSirene : searchPlaces;
    const places = await search({
      niche: brief.niche,
      city: brief.city,
      country: brief.country,
      customQuery: brief.query,
      minRating: brief.minRating,
      minReviews: brief.minReviews,
      pageSize: Math.min(brief.maxPerRun, MAX_PROSPECTS_PER_BRIEF),
    });
    summary.found = places.length;

    for (const place of places) {
      try {
        const result = await processPlace(place, brief, run.id);
        if (result.status === "created" || result.status === "qualified" || result.status === "scheduled") {
          summary.created++;
        }
        if (result.status === "qualified" || result.status === "scheduled") summary.qualified++;
        if (result.status === "scheduled") summary.scheduled++;
        if (place.website) summary.emailsFound++;
      } catch (e) {
        summary.errors.push(`${place.name}: ${e instanceof Error ? e.message : "error"}`);
      }
    }
  } catch (e) {
    summary.errors.push(e instanceof Error ? e.message : "discovery failed");
  } finally {
    await prisma.discoveryRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: summary.errors.length > 0 && summary.created === 0 ? "failed" : "done",
        found: summary.found,
        emailsFound: summary.emailsFound,
        created: summary.created,
        qualified: summary.qualified,
        scheduled: summary.scheduled,
        errors: summary.errors.length > 0 ? summary.errors : undefined,
      },
    });
    await prisma.searchBrief.update({
      where: { id: briefId },
      data: {
        lastRunAt: new Date(),
        totalDiscovered: { increment: summary.created },
        totalQualified: { increment: summary.qualified },
      },
    });
  }

  return summary;
}

/**
 * DiscoveryRuns left in "running" longer than STALE_RUN_MS are remnants of a
 * Vercel function that got killed (5-min cap, OOM, etc). Flip them to
 * "failed" so the auto-pause counter sees them correctly and the dashboard
 * isn't littered with permanently-spinning rows.
 */
async function recoverStaleRuns(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RUN_MS);
  const res = await prisma.discoveryRun.updateMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    data: { status: "failed", finishedAt: new Date(), notes: "auto-recovered (function killed/timeout)" },
  });
  if (res.count > 0) console.log(`[autopilot] recovered ${res.count} stale running runs`);
  return res.count;
}

/**
 * Round-robin briefs by country so each cron fire processes a balanced mix.
 *
 * Without this, the ORDER BY `lastRunAt asc nulls first` has no tie-breaker
 * for the "never run" pool, and Postgres returns rows in an arbitrary order.
 * With 34 FR + 8 CH briefs that are all unrun, a 60s Vercel fire might land
 * on 4 FR-only briefs and never touch Swiss for days. After interleaving
 * (FR1, CH1, FR2, CH2, ...), the smaller-pool country always gets at least
 * one brief per fire (assuming concurrency >= countries-with-work).
 *
 * Generic over country: works for FR + CH today, will scale if DE/IT/ES
 * briefs are added later without code changes.
 */
function interleaveByCountry<T extends { country: string }>(briefs: T[]): T[] {
  const buckets = new Map<string, T[]>();
  for (const b of briefs) {
    const list = buckets.get(b.country) ?? [];
    list.push(b);
    buckets.set(b.country, list);
  }
  const queues = Array.from(buckets.values());
  const out: T[] = [];
  while (queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const item = q.shift();
      if (item) out.push(item);
    }
  }
  return out;
}

/**
 * Run every active brief in parallel waves of BRIEF_CONCURRENCY. Watches
 * RUN_TIME_BUDGET_MS — when we approach Vercel's serverless ceiling, stops
 * launching new waves and returns what we have; the next cron picks up the
 * rest. Briefs that go 3 consecutive runs without creating anything get
 * auto-paused so they stop burning Places + Claude quota.
 *
 * Parallelism is essential for throughput: at ~95s/brief avg, sequential
 * processing only fits ~8 briefs in 4 minutes. With 30+ active briefs we'd
 * never catch up without rotation, and even with rotation the daily send
 * pipeline would stay underfilled.
 */
export async function runAllActiveBriefs(): Promise<BriefRunSummary[]> {
  await recoverStaleRuns();
  const startedAt = Date.now();
  // Rotate the order so the same briefs don't always get processed first
  // (and the same briefs aren't always cut off when we hit the time budget).
  const raw = await prisma.searchBrief.findMany({
    where: { active: true },
    orderBy: { lastRunAt: { sort: "asc", nulls: "first" } },
  });
  // Interleave by country so every cron fire balances FR + CH (and any future
  // markets) rather than burning the whole 60s budget on one country's
  // backlog. See interleaveByCountry comment.
  const briefs = interleaveByCountry(raw);
  const out: BriefRunSummary[] = [];

  async function runOne(b: { id: string; name: string }): Promise<BriefRunSummary> {
    try {
      const s = await runBrief(b.id);
      if (s.created === 0) {
        const recent = await prisma.discoveryRun.findMany({
          where: { briefId: b.id, status: { in: ["done", "failed"] } },
          orderBy: { startedAt: "desc" },
          take: AUTO_PAUSE_AFTER_EMPTY_RUNS,
          select: { created: true },
        });
        if (
          recent.length >= AUTO_PAUSE_AFTER_EMPTY_RUNS &&
          recent.every((r) => r.created === 0)
        ) {
          await prisma.searchBrief.update({ where: { id: b.id }, data: { active: false } });
          console.log(`[autopilot] auto-paused brief "${b.name}" after ${AUTO_PAUSE_AFTER_EMPTY_RUNS} empty runs`);
          s.errors.push(`auto-paused (${AUTO_PAUSE_AFTER_EMPTY_RUNS} empty runs in a row)`);
        }
      }
      return s;
    } catch (e) {
      return {
        briefId: b.id,
        briefName: b.name,
        found: 0,
        emailsFound: 0,
        created: 0,
        qualified: 0,
        scheduled: 0,
        errors: [e instanceof Error ? e.message : "brief failed"],
      };
    }
  }

  for (let i = 0; i < briefs.length; i += BRIEF_CONCURRENCY) {
    if (Date.now() - startedAt > RUN_TIME_BUDGET_MS) {
      console.log(
        `[autopilot] time budget exhausted (${Date.now() - startedAt}ms) — ${briefs.length - out.length} briefs deferred to next cron`
      );
      break;
    }
    const wave = briefs.slice(i, i + BRIEF_CONCURRENCY);
    const waveResults = await Promise.all(wave.map(runOne));
    out.push(...waveResults);
  }
  return out;
}
