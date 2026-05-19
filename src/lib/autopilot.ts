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
import { findEmailForSite } from "@/lib/emailFinder";
import { scrapeSite, type SiteSnapshot } from "@/lib/scrapeSite";
import { fetchPageSpeed, type PageSpeedSnapshot } from "@/lib/pagespeed";
import { findDecisionMakers, type DecisionMakerResult } from "@/lib/decisionMakers";
import { scoreProspect } from "@/lib/qualityScore";
import { buildEmailPrompt, getEmailSystemPrompt, extractJsonArray, type PromptCaseStudy } from "@/lib/emailPrompt";

const EMAIL_MODEL = "claude-sonnet-4-6";
const MAX_PROSPECTS_PER_BRIEF = 10;
// Vercel Pro maxDuration is 300s. Stop scheduling new briefs when we approach
// that limit so the run finishes cleanly. Next cron picks up the rest.
const RUN_TIME_BUDGET_MS = 240_000; // 4 minutes
// After 3 consecutive zero-created runs, deactivate the brief to stop burning
// Places quota + Claude tokens on something that's not delivering.
const AUTO_PAUSE_AFTER_EMPTY_RUNS = 3;
// Look this many days ahead when finding the next send slot with capacity.
const SCHEDULE_LOOKAHEAD_DAYS = 30;
// How many briefs to process simultaneously. Sequential was too slow:
// at ~95s/brief, only ~8 briefs fit in the 5-min Vercel cap, leaving most
// of the 30+ active briefs un-touched on any given cron fire.
const BRIEF_CONCURRENCY = 5;
// A DiscoveryRun stuck in status="running" longer than this is treated as
// crashed (Vercel killed the function) and marked failed so it stops blocking
// the auto-pause counter and dashboard.
const STALE_RUN_MS = 10 * 60_000;

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
 * Picks the next ~3 business-day slot in Europe/Paris for an initial send.
 * Spreads sends through 09:00–17:00 to avoid burst-y patterns that look
 * automated. Skips weekends.
 */
function nextWorkingSlot(daysAhead = 1): Date {
  const now = new Date();
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + daysAhead);
  // Find a weekday in Paris
  for (let i = 0; i < 7; i++) {
    const probe = new Date(d);
    const dow = parseInt(
      new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short" })
        .format(probe)
        .replace(/\D/g, ""),
      10
    );
    const weekdayName = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short" })
      .format(probe);
    if (weekdayName !== "Sat" && weekdayName !== "Sun") {
      d.setTime(probe.getTime());
      break;
    }
    d.setUTCDate(d.getUTCDate() + 1);
    void dow; // silence unused warning if any
  }
  // Random hour 09:00–16:59 Paris time, then back-derive UTC.
  const hourLocal = 9 + Math.floor(Math.random() * 8);
  const minute = Math.floor(Math.random() * 60);
  // Approximation: Paris is UTC+1 (winter) or UTC+2 (summer). Use a sentinel
  // that subtracts the locale-derived offset.
  const localStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T${String(hourLocal).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  // Construct a Date that the JS engine treats as that exact wall-clock time in Paris:
  // We compute the offset by formatting and parsing.
  const guessUtc = new Date(`${localStr}Z`);
  const partsHere = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(guessUtc);
  const guessedParisHour = parseInt(partsHere.find((p) => p.type === "hour")?.value ?? "0", 10);
  const offsetMs = (hourLocal - guessedParisHour) * 3600_000;
  return new Date(guessUtc.getTime() + offsetMs);
}

function inferNicheFromPlaceType(primaryType: string | null, briefNiche: string): string {
  if (!primaryType) return briefNiche;
  const map: Record<string, string> = {
    lodging: "Hotel",
    hotel: "Hotel",
    restaurant: "Restaurant",
    cafe: "Restaurant",
    real_estate_agency: "Property",
    spa: "Spa",
    beauty_salon: "Spa",
    art_gallery: "Galerie",
    architect: "Architecture",
    clothing_store: "Boutique",
    jewelry_store: "Boutique",
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

  const message = await anthropic.messages.create({
    model: EMAIL_MODEL,
    max_tokens: 4096,
    system: await getEmailSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildEmailPrompt(prospect, {
          nicheHint: nicheTemplate?.promptHint,
          siteSnapshot: ctx.site,
          pagespeed: ctx.psi,
          decisionMakers: ctx.dm,
          caseStudy,
        }),
      },
    ],
  });
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
  await prisma.email.createMany({
    data: parsed.map((e) => ({
      prospectId,
      tip: String(e.tip ?? "initial"),
      subject: String(e.subject ?? ""),
      subjectB: e.subjectB ? String(e.subjectB) : null,
      body: String(e.body ?? ""),
      activeSubject: e.subjectB && Math.random() < 0.5 ? "B" : "A",
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
  // Random Paris business hour 09:00–16:59 → back to UTC.
  const hourLocal = 9 + Math.floor(Math.random() * 8);
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
  const f1 = nextWorkingSlot(Math.floor((initial.getTime() - Date.now()) / 86400000) + 4);
  const f2 = nextWorkingSlot(Math.floor((initial.getTime() - Date.now()) / 86400000) + 9);
  const f3 = nextWorkingSlot(Math.floor((initial.getTime() - Date.now()) / 86400000) + 16);
  await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      status: "Scheduled",
      scheduledInitial: initial,
      scheduledFollow1: f1,
      scheduledFollow2: f2,
      scheduledFollow3: f3,
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
  if (existing) return { status: "skipped", reason: "već u bazi" };

  if (!place.website) return { status: "skipped", reason: "nema website" };

  // Find an email on the prospect's site.
  const emailResult = await findEmailForSite(place.website);
  if (!emailResult.email) {
    return { status: "skipped", reason: `nema pronađenog emaila (probano ${emailResult.tried.length} stranica)` };
  }
  const email = emailResult.email;

  // Race-safe dedupe on email
  const dupByEmail = await prisma.prospect.findUnique({ where: { email } });
  if (dupByEmail) return { status: "skipped", reason: "email već postoji" };

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
      source: "google_places",
      sourceQuery: brief.query || brief.niche,
      externalId: place.placeId,
      briefId: brief.id,
      status: "New",
    },
  });

  // Enrich in parallel (each best-effort).
  const [site, psi, dm] = await Promise.all([
    scrapeSite(place.website).catch(() => null),
    fetchPageSpeed(place.website).catch(() => null),
    findDecisionMakers(place.website).catch(() => null),
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
    return { status: "qualified", reason: "autoGenerate=false, čeka ručnu generaciju" };
  }

  // Generate emails.
  const generated = await generateEmailsInline(prospect.id, { site, psi, dm });
  if (generated === 0) {
    return { status: "qualified", reason: "generisanje neuspješno" };
  }

  if (!brief.autoSchedule) {
    return { status: "qualified", reason: "autoSchedule=false, čeka ručno pokretanje" };
  }

  await scheduleInline(prospect.id);
  return { status: "scheduled" };
}

export async function runBrief(briefId: string): Promise<BriefRunSummary> {
  const brief = await prisma.searchBrief.findUnique({ where: { id: briefId } });
  if (!brief) throw new Error(`Brief ${briefId} nije pronađen`);

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
    const places = await searchPlaces({
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
        summary.errors.push(`${place.name}: ${e instanceof Error ? e.message : "greška"}`);
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
  const briefs = await prisma.searchBrief.findMany({
    where: { active: true },
    orderBy: { lastRunAt: { sort: "asc", nulls: "first" } },
  });
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
          s.errors.push(`auto-pausiran (${AUTO_PAUSE_AFTER_EMPTY_RUNS} prazna runa za redom)`);
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
