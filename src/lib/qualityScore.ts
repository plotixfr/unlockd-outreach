/**
 * Scores a prospect 1–10 for fit with Unlockd.art. Unlockd sells three things:
 * brand identity, premium websites, and custom software / SaaS / automation.
 * Target groups: B2B professional services (consulting, law, accounting,
 * agencies) and French tech startups / SaaS / digital agencies.
 *
 * 10 = obvious win (clear budget signals, weak/dated site, buying triggers)
 *  5 = uncertain — needs operator judgement
 *  1 = wrong fit (no site needed, dead business, wrong country)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";

const MODEL = "claude-haiku-4-5-20251001";

export interface QualityScore {
  score: number; // 1–10
  note: string; // short English explanation
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

function buildScoringPrompt(p: ProspectScoringInput): string {
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

  return `Score this prospect for Unlockd.art (Paris studio — brand identity, premium websites, and custom software / SaaS / automation tools; deal size €5k–50k for sites/brand, €15k–80k for custom software).

Target groups:
  Group A — B2B professional services (consulting firms, law firms, accountants, agencies, recruiters, architecture studios). Buying trigger = need a website that signals "peer of the top tier", not a builder template.
  Group B — French tech startups / SaaS / digital agencies. Buying trigger = need a credible marketing site + automation tools to scale ops.

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
- 10 = obvious win: target niche, weak or dated site, clear budget signals (premium location, multiple offices, mature business).
- 7–9 = strong fit, minor caveats (e.g. decent site but outdated design, or great niche in a smaller city).
- 4–6 = uncertain — may convert but needs more work.
- 1–3 = poor fit (no site needed for their model, dead business, wrong language/country, already premium-grade site without need to change).

Respond with JSON only, no markdown or surrounding text:
{"score": 7, "note": "Short English explanation (max 80 chars): why this number."}`;
}

export async function scoreProspect(p: ProspectScoringInput): Promise<QualityScore | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const anthropic = new Anthropic({ apiKey });
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content: buildScoringPrompt(p) }],
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
    return null;
  }
}

/**
 * Post-LLM boosts: hard-coded buying-trigger heuristics calibrated for B2B
 * professional services (Group A) and French tech / SaaS (Group B). These
 * outperform the LLM's instinct on the buying-signal recognition task.
 */
function applyBuyingTriggerBoosts(
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
  const niche = p.nisa.toLowerCase();
  const isGroupA =
    /conseil|consulting|avocat|law|expert-comptable|accountant|agence|marketing|relations presse|pr |recrutement|hr|formation|traduction|architect/i.test(niche);
  const isGroupB =
    /tech|saas|software|logiciel|digital|62\.0|63\.1|73\.11/i.test(niche);

  // Stack signals (Group A — they're on a builder, prime to upgrade)
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

  // Group A — B2B services that need to project trust
  if (isGroupA && noContactForm) {
    score += 1;
    notes.push("no contact form (B2B trust gap)");
  }

  // Group B — tech / SaaS specific: a small marketing site is a strong signal
  // they're early stage and might want a polished v2 + automation
  if (isGroupB && p.siteSnapshot?.ok) {
    const imgs = p.siteSnapshot.signals.approxImageCount ?? 0;
    if (imgs < 5) {
      score += 1;
      notes.push("minimal site (early stage)");
    }
  }

  score = Math.max(1, Math.min(10, score));
  const note = notes.length > 0 ? `${baseNote} · +${notes.join(", ")}` : baseNote;
  return { score, note: note.slice(0, 200) };
}
