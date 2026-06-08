/**
 * Scores a prospect 1–10 for fit with Unlockd.art (premium web design studio).
 * Runs after the site has been scraped, so we already have title/H1/signals.
 * Used to surface the highest-value prospects in the dashboard and avoid
 * wasting the daily send cap on poor fits.
 *
 * 10 = obvious win (premium niche, weak site, clear budget signals)
 *  5 = uncertain — needs operator judgement
 *  1 = wrong fit (no site, dead business, wrong country, etc.)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";

const MODEL = "claude-haiku-4-5-20251001";

export interface QualityScore {
  score: number; // 1–10
  note: string; // short explanation in Bosnian/Serbian
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
    if (p.siteSnapshot.title) facts.push(`Title sajta: "${p.siteSnapshot.title}"`);
    if (p.siteSnapshot.h1) facts.push(`H1: "${p.siteSnapshot.h1}"`);
    facts.push(`Platforma: ${p.siteSnapshot.signals.techHints.join(", ") || "nepoznata"}`);
    facts.push(`Responsive mobile: ${p.siteSnapshot.signals.responsiveViewport ? "da" : "ne"}`);
    facts.push(`Rezervacijski sistem: ${p.siteSnapshot.signals.hasReservation ? "da" : "ne"}`);
    facts.push(`Broj slika: ${p.siteSnapshot.signals.approxImageCount}`);
  } else if (p.website) {
    facts.push(`Sajt postoji (${p.website}) ali scrape nije uspio.`);
  } else {
    facts.push("Nema sajta.");
  }
  if (p.pagespeed?.ok && p.pagespeed.performanceScore !== null) {
    facts.push(`Lighthouse mobile score: ${p.pagespeed.performanceScore}/100`);
    if (p.pagespeed.lcpMs) facts.push(`LCP: ${(p.pagespeed.lcpMs / 1000).toFixed(1)}s`);
  }

  return `Ocijeni ovaj prospect za premium web studio Unlockd.art (Paris, redizajn + razvoj sajtova za ekskluzivne brendove, deal size €5k–50k).

Prospect:
- Firma: ${p.firmaNaziv}
- Niche: ${p.nisa}
- City: ${p.grad}
- Website: ${p.website || "nema"}
- Opis: ${p.opisFirme || "nema"}
- Operator notes: ${p.napomena || "nema"}

Tehnički signali:
${facts.map((f) => `- ${f}`).join("\n")}

Skala 1–10:
- 10 = idealan: premium niša, slab sajt (loš design / spor / nemoderan), jasni signali budžeta (skupa lokacija, više objekata, premium vokabular).
- 7-9 = vrlo dobar fit, neki bumovi (npr. dobar sajt ali zastareo design, ili odlična niša ali siromašan grad)
- 4-6 = neizvjesno — može da konvertuje ali traži više rada
- 1-3 = loš fit (nema sajta a niši ne treba, mrtav biznis, pogrešan jezik/zemlja, već premium-level sajt bez potrebe za promjenom).

Odgovori SAMO JSON objektom, bez ikakvog markdown ili teksta okolo:
{"score": 7, "note": "Kratko (max 80 znakova) na bosanskom: zašto baš taj broj."}`;
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
 * Post-LLM boost: hard-coded buying-trigger heuristics that are way more
 * reliable than Claude's instinct on this. A premium brand stuck on
 * Wix/Squarespace is the single highest-conversion signal in this niche
 * (5× more likely to buy a custom build per Mailshake's 2024 study). We
 * also penalise Webflow/Shopify since those signal "team already invested
 * in their stack". Bonuses cap the score at 10.
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
  const noReservation =
    p.siteSnapshot?.ok &&
    p.siteSnapshot.signals.hasReservation === false &&
    /hotel|hôtel|restaur/i.test(p.nisa);

  if (tech.includes("Wix") || tech.includes("Squarespace")) {
    score += 2;
    notes.push("plateforme générique");
  } else if (tech.includes("WordPress")) {
    score += 1;
    notes.push("WordPress (refresh probable)");
  } else if (tech.includes("Webflow")) {
    score -= 1; // équipe déjà investie
  }
  if (lowPsi) {
    score += 1;
    notes.push("Lighthouse < 50");
  }
  if (noMobile) {
    score += 1;
    notes.push("pas de mobile viewport");
  }
  if (noReservation) {
    score += 1;
    notes.push("pas de réservation en ligne");
  }

  score = Math.max(1, Math.min(10, score));
  const note = notes.length > 0 ? `${baseNote} · +${notes.join(", ")}` : baseNote;
  return { score, note: note.slice(0, 200) };
}
