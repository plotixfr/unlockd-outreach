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
import { buildEmailPrompt, EMAIL_SYSTEM_PROMPT, extractJsonArray, type PromptCaseStudy } from "@/lib/emailPrompt";

const EMAIL_MODEL = "claude-sonnet-4-6";
const MAX_PROSPECTS_PER_BRIEF = 10;

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
    system: EMAIL_SYSTEM_PROMPT,
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
 * Schedule the campaign so the existing send cron picks it up.
 * Default cadence: initial tomorrow, then +4 / +5 / +7 days.
 */
async function scheduleInline(prospectId: string): Promise<void> {
  const initial = nextWorkingSlot(1);
  const f1 = nextWorkingSlot(5);
  const f2 = nextWorkingSlot(10);
  const f3 = nextWorkingSlot(17);
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
 * Run every active brief sequentially. Used by the daily cron. Sequential
 * (not parallel) so we don't hammer Places + Claude rate limits and so we
 * preserve a sensible total daily cap.
 */
export async function runAllActiveBriefs(): Promise<BriefRunSummary[]> {
  const briefs = await prisma.searchBrief.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });
  const out: BriefRunSummary[] = [];
  for (const b of briefs) {
    try {
      const s = await runBrief(b.id);
      out.push(s);
    } catch (e) {
      out.push({
        briefId: b.id,
        briefName: b.name,
        found: 0,
        emailsFound: 0,
        created: 0,
        qualified: 0,
        scheduled: 0,
        errors: [e instanceof Error ? e.message : "brief failed"],
      });
    }
  }
  return out;
}
