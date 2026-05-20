/**
 * Generates sales-call talking points and discovery questions tailored to one
 * prospect. Used by the pre-meeting brief page. Caches on Prospect.proposalContent
 * (not a perfect home but avoids another column) when called from a server
 * page render so re-renders don't re-call Claude.
 *
 * Pure best-effort: returns null on failure and the brief falls back to a
 * generic checklist.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";

const MODEL = "claude-haiku-4-5-20251001";

export interface TalkingPoints {
  observations: string[];
  questions: string[];
  competitorsToMention: string[];
  pricingBand: { tier: string; rationale: string };
}

export interface TalkingPointsInput {
  firmaNaziv: string;
  nisa: string;
  grad: string;
  website: string | null;
  kontaktIme: string | null;
  qualityScore: number | null;
  qualityNote: string | null;
  siteSnapshot: SiteSnapshot | null;
  pagespeed: PageSpeedSnapshot | null;
}

function buildPrompt(p: TalkingPointsInput): string {
  const facts: string[] = [];
  if (p.siteSnapshot?.ok) {
    if (p.siteSnapshot.title) facts.push(`Title: "${p.siteSnapshot.title}"`);
    if (p.siteSnapshot.h1) facts.push(`H1: "${p.siteSnapshot.h1}"`);
    facts.push(`Tech: ${p.siteSnapshot.signals.techHints.join(", ") || "unknown"}`);
    facts.push(`Responsive mobile: ${p.siteSnapshot.signals.responsiveViewport ? "yes" : "NO"}`);
    facts.push(`Reservation system: ${p.siteSnapshot.signals.hasReservation ? "yes" : "no"}`);
    facts.push(`Images: ${p.siteSnapshot.signals.approxImageCount}`);
  }
  if (p.pagespeed?.ok) {
    facts.push(`Lighthouse mobile: ${p.pagespeed.performanceScore}/100`);
    if (p.pagespeed.lcpMs) facts.push(`LCP: ${(p.pagespeed.lcpMs / 1000).toFixed(1)}s`);
  }
  if (p.qualityScore !== null) {
    facts.push(`Internal quality score: ${p.qualityScore}/10${p.qualityNote ? ` (${p.qualityNote})` : ""}`);
  }

  return `Pripremaš mi sales call sa ovim prospektom. Daj mi:
1. 3-5 konkretnih observacija o njihovom sajtu/biznisu (na bazi činjenica, NE izmišljaj)
2. 4-6 discovery pitanja za poziv (otkrij pain points, budžet, vremenske okvire)
3. 2-3 imena premium konkurenata u njihovoj nišinjihovom gradu (za benchmark, ako znaš realne)
4. Preporučeni cjenovni nivo: "Essential" (€5-8k) / "Pro" (€10-18k) / "Bespoke" (€20k+) i kratki razlog

Prospect:
- Firma: ${p.firmaNaziv}
- Niche: ${p.nisa}
- City: ${p.grad}
- Kontakt: ${p.kontaktIme || "nepoznat"}
- Website: ${p.website || "nema"}

Tehnički signali:
${facts.map((f) => `- ${f}`).join("\n")}

Odgovori SAMO JSON, bez markdown:
{
  "observations": ["..."],
  "questions": ["..."],
  "competitorsToMention": ["..."],
  "pricingBand": { "tier": "Pro", "rationale": "..." }
}`;
}

export async function generateTalkingPoints(p: TalkingPointsInput): Promise<TalkingPoints | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const anthropic = new Anthropic({ apiKey });
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [{ role: "user", content: buildPrompt(p) }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") return null;
    const raw = block.text.trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      observations?: unknown;
      questions?: unknown;
      competitorsToMention?: unknown;
      pricingBand?: { tier?: unknown; rationale?: unknown };
    };
    return {
      observations: Array.isArray(parsed.observations) ? parsed.observations.filter((s): s is string => typeof s === "string") : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions.filter((s): s is string => typeof s === "string") : [],
      competitorsToMention: Array.isArray(parsed.competitorsToMention) ? parsed.competitorsToMention.filter((s): s is string => typeof s === "string") : [],
      pricingBand: {
        tier:
          typeof parsed.pricingBand?.tier === "string" && ["Essential", "Pro", "Bespoke"].includes(parsed.pricingBand.tier)
            ? parsed.pricingBand.tier
            : "Pro",
        rationale: typeof parsed.pricingBand?.rationale === "string" ? parsed.pricingBand.rationale : "",
      },
    };
  } catch (e) {
    console.warn("[talkingPoints] failed:", e);
    return null;
  }
}
