/**
 * Scores a prospect 1–10 for fit with Unlockd.art. The target-customer
 * definition comes from src/lib/icp.ts (shared with the email-generation
 * prompts) plus the discovering brief's own targeting fields — NEVER from
 * hardcoded niches/geography in this file. When a brief context is given,
 * its niche and market are correct by construction: the scorer judges
 * business quality and website need, not niche/country fit.
 *
 * 10 = obvious win (clear budget signals, weak/dated site, buying triggers)
 *  5 = uncertain — needs operator judgement
 *  1 = wrong fit (hard exclusion, dead business, already premium-grade site)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";
import { ICP, GROUP_A_NICHE_RE, GROUP_B_NICHE_RE, countryName } from "@/lib/icp";
import { classifyClaudeError, API_CREDIT_OR_AUTH_ERROR } from "@/lib/claudeError";

const MODEL = "claude-haiku-4-5-20251001";

export interface QualityScore {
  score: number; // 1–10
  note: string; // short English explanation
}

/** Targeting fields of the SearchBrief that discovered the prospect. */
export interface ScoringBriefContext {
  niche: string;
  city: string | null;
  country: string;
  language: string;
}

export interface ProspectScoringInput {
  firmaNaziv: string;
  nisa: string;
  grad: string;
  website: string | null;
  opisFirme: string | null;
  napomena: string | null;
  siteSnapshot: SiteSnapshot | null;
  pagespeed: PageSpeedSnapshot | null;
}

function describeBriefNiche(niche: string): string {
  // Sirene briefs carry NAF code baskets ("41.20A,43.22A,…") as their niche.
  return /^\d{2}\./.test(niche.trim())
    ? `French industrial registry NAF codes ${niche} (Group A industrial/B2B SMEs)`
    : `"${niche}"`;
}

export function buildScoringPrompt(
  p: ProspectScoringInput,
  briefCtx: ScoringBriefContext | null = null
): string {
  const facts: string[] = [];
  if (p.siteSnapshot?.ok) {
    if (p.siteSnapshot.title) facts.push(`Site title: "${p.siteSnapshot.title}"`);
    if (p.siteSnapshot.h1) facts.push(`H1: "${p.siteSnapshot.h1}"`);
    facts.push(`Platform: ${p.siteSnapshot.signals.techHints.join(", ") || "unknown"}`);
    facts.push(`Mobile responsive: ${p.siteSnapshot.signals.responsiveViewport ? "yes" : "no"}`);
    facts.push(`Booking/reservation widget: ${p.siteSnapshot.signals.hasReservation ? "yes" : "no"}`);
    facts.push(`Contact form: ${p.siteSnapshot.signals.hasContactForm ? "yes" : "no"}`);
    facts.push(`Image count: ${p.siteSnapshot.signals.approxImageCount}`);
  } else if (p.website) {
    facts.push(`Site exists (${p.website}) but scrape failed.`);
  } else {
    facts.push("No website.");
  }
  if (p.pagespeed?.ok && p.pagespeed.performanceScore !== null) {
    facts.push(`Lighthouse mobile score: ${p.pagespeed.performanceScore}/100`);
    if (p.pagespeed.lcpMs) facts.push(`LCP: ${(p.pagespeed.lcpMs / 1000).toFixed(1)}s`);
  }

  const targetingBlock = briefCtx
    ? `This prospect was discovered by a targeting brief hunting: ${describeBriefNiche(briefCtx.niche)}${
        briefCtx.city ? ` in ${briefCtx.city}` : ""
      } (${countryName(briefCtx.country)}). The niche and market are correct by construction — do NOT downgrade for niche or geography. Score on business quality and website need.`
    : `No targeting brief — judge fit against Group A / Group B above.`;

  return `Score this prospect 1–10 for fit with Unlockd.art (Paris studio — ${ICP.services.en}; deal sizes ${ICP.dealSizes}).

Target customer profile:
  Group A — ${ICP.groupA.en}.
  Group B — ${ICP.groupB.en}.
Valid markets: ${ICP.markets.en}. Valid outreach languages: French, Dutch.

HARD EXCLUSIONS — score 1–3 regardless of other signals: ${ICP.exclusions.en} — anyone with an in-house IT/marketing team.

${targetingBlock}

Prospect:
- Company: ${p.firmaNaziv}
- Niche: ${p.nisa}
- City: ${p.grad}
- Website: ${p.website || "none"}
- Description: ${p.opisFirme || "none"}
- Operator notes: ${p.napomena || "none"}

Technical signals:
${facts.map((f) => `- ${f}`).join("\n")}

Scale 1–10:
- 10 = obvious win: solid business in the target profile, weak or dated site, clear budget signals (premium location, established business, strong ratings).
- 7–9 = strong fit, minor caveats (e.g. decent site but outdated design, or smaller city).
- 4–6 = uncertain — may convert but needs operator judgement.
- 1–3 = poor fit: hard exclusion (has in-house IT/marketing), dead business, or already premium-grade site with no need to change.

Respond with JSON only, no markdown or surrounding text:
{"score": 7, "note": "Short English explanation (max 80 chars): why this number."}`;
}

export async function scoreProspect(
  p: ProspectScoringInput,
  briefCtx: ScoringBriefContext | null = null
): Promise<QualityScore | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const anthropic = new Anthropic({ apiKey });
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content: buildScoringPrompt(p, briefCtx) }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") return null;
    const raw = block.text.trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { score?: unknown; note?: unknown };
    const baseScore =
      typeof parsed.score === "number" && parsed.score >= 1 && parsed.score <= 10
        ? Math.round(parsed.score)
        : null;
    const baseNote = typeof parsed.note === "string" ? parsed.note.trim().slice(0, 200) : "";
    if (baseScore === null) return null;
    return applyBuyingTriggerBoosts(baseScore, baseNote, p);
  } catch (e) {
    console.warn("[qualityScore] failed:", e);
    // A credit/auth/quota failure is fatal and run-wide, not a per-prospect
    // flake — throw a distinct marker so it never masquerades as "scoring
    // returned null". Callers (autopilot processPlace, redrive, score route)
    // all catch per-prospect, so this surfaces loudly without crashing a run.
    if (classifyClaudeError(e)) throw new Error(API_CREDIT_OR_AUTH_ERROR);
    return null;
  }
}

/**
 * Post-LLM boosts: hard-coded buying-trigger heuristics for the two ICP
 * groups (detected via the shared multilingual niche regexes in icp.ts).
 * These outperform the LLM's instinct on buying-signal recognition.
 */
export function applyBuyingTriggerBoosts(
  baseScore: number,
  baseNote: string,
  p: ProspectScoringInput
): QualityScore {
  let score = baseScore;
  const notes: string[] = [];

  const tech = p.siteSnapshot?.signals.techHints ?? [];
  const lowPsi =
    p.pagespeed?.ok && p.pagespeed.performanceScore !== null && p.pagespeed.performanceScore < 50;
  const noMobile =
    p.siteSnapshot?.ok && p.siteSnapshot.signals.responsiveViewport === false;
  const noContactForm =
    p.siteSnapshot?.ok && p.siteSnapshot.signals.hasContactForm === false;
  const noReservation =
    p.siteSnapshot?.ok && p.siteSnapshot.signals.hasReservation === false;
  const isGroupA = GROUP_A_NICHE_RE.test(p.nisa);
  const isGroupB = GROUP_B_NICHE_RE.test(p.nisa);

  // Stack signals — a generic builder is prime to upgrade.
  if (tech.includes("Wix") || tech.includes("Squarespace")) {
    score += 2;
    notes.push("generic builder");
  } else if (tech.includes("WordPress")) {
    score += 1;
    notes.push("WordPress (refresh likely)");
  } else if (tech.includes("Webflow")) {
    score -= 1; // team already invested in a modern stack
  }

  // Performance signal — universal
  if (lowPsi) {
    score += 1;
    notes.push("Lighthouse < 50");
  }
  if (noMobile) {
    score += 1;
    notes.push("no mobile viewport");
  }

  // Group A — B2B businesses that need to project trust
  if (isGroupA && noContactForm) {
    score += 1;
    notes.push("no contact form (B2B trust gap)");
  }

  // Group B — lifestyle businesses live off bookings; a premium spot without
  // online booking is leaving money on the table (and is an easy pitch).
  if (isGroupB && noReservation) {
    score += 1;
    notes.push("no online booking");
  }

  score = Math.max(1, Math.min(10, score));
  const note = notes.length > 0 ? `${baseNote} · +${notes.join(", ")}` : baseNote;
  return { score, note: note.slice(0, 200) };
}
