/**
 * Generates a tailored French sales proposal for one prospect. Three tiers
 * (Essential / Pro / Bespoke), per-niche scope, value calculator that turns
 * concrete numbers (rooms / covers / properties) into projected annual upside.
 *
 * Lives on Prospect.proposalContent as JSON. The proposal page re-uses cached
 * content unless the operator regenerates.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";

const MODEL = "claude-sonnet-4-6";

export interface ProposalContent {
  intro: string;
  challenge: string;
  approach: string;
  scope: {
    tier: "Essential" | "Pro" | "Bespoke";
    bullets: string[];
  }[];
  timeline: { phase: string; weeks: string; deliverable: string }[];
  pricing: {
    tier: "Essential" | "Pro" | "Bespoke";
    label: string;
    priceEur: number;
    deposit: number;
    description: string;
    recommended?: boolean;
  }[];
  valueProjection: {
    headline: string;
    rows: { label: string; value: string }[];
    breakEven: string;
  };
  closing: string;
}

export interface ProposalInput {
  firmaNaziv: string;
  kontaktIme: string | null;
  nisa: string;
  grad: string;
  website: string | null;
  qualityScore: number | null;
  qualityNote: string | null;
  siteSnapshot: SiteSnapshot | null;
  pagespeed: PageSpeedSnapshot | null;
  recommendedTier?: "Essential" | "Pro" | "Bespoke";
}

function buildPrompt(p: ProposalInput): string {
  const facts: string[] = [];
  if (p.siteSnapshot?.ok) {
    if (p.siteSnapshot.title) facts.push(`Title: "${p.siteSnapshot.title}"`);
    if (p.siteSnapshot.h1) facts.push(`H1: "${p.siteSnapshot.h1}"`);
    facts.push(`Platforma: ${p.siteSnapshot.signals.techHints.join(", ") || "nepoznata"}`);
    facts.push(`Responsive mobile: ${p.siteSnapshot.signals.responsiveViewport ? "da" : "NE"}`);
    facts.push(`Rezervacijski sistem: ${p.siteSnapshot.signals.hasReservation ? "da" : "ne"}`);
  }
  if (p.pagespeed?.ok && p.pagespeed.performanceScore !== null) {
    facts.push(`Lighthouse mobile: ${p.pagespeed.performanceScore}/100`);
    if (p.pagespeed.lcpMs) facts.push(`LCP: ${(p.pagespeed.lcpMs / 1000).toFixed(1)}s`);
  }

  return `Tu rédiges une proposition commerciale française pour Unlockd.art (studio web premium parisien). Le prospect doit recevoir un document persuasif, élégant, sobre — pas de jargon, pas de "transformer votre business".

Prospect :
- Entreprise : ${p.firmaNaziv}
- Contact : ${p.kontaktIme || "—"}
- Secteur : ${p.nisa}
- Ville : ${p.grad}
- Site : ${p.website || "—"}

Faits techniques (à utiliser dans la section "challenge") :
${facts.map((f) => `- ${f}`).join("\n")}

Trois paliers à proposer (le palier recommandé doit être marqué recommended:true) :
- Essential — €6 500 — refonte focalisée, design + dev, livré en 4 semaines
- Pro — €14 500 — refonte complète + animations sur-mesure + CMS headless + intégrations métier, 6-8 semaines${p.recommendedTier === "Pro" ? " [RECOMMANDÉ pour ce prospect]" : ""}
- Bespoke — €28 000+ — création sur-mesure complète avec photographie, copywriting, motion design, brand system, 10-14 semaines${p.recommendedTier === "Bespoke" ? " [RECOMMANDÉ pour ce prospect]" : ""}

Le palier recommandé par défaut est "${p.recommendedTier ?? "Pro"}".

Value projection (section ROI) : adapte au secteur ${p.nisa} avec des chiffres CRÉDIBLES (pas inventés) :
- Cabinet conseil / avocats / experts-comptables : dossiers entrants/mois × ticket moyen × % de leads premium supplémentaires (un site qui inspire confiance fait passer un cabinet de "demande de devis" à "rendez-vous direct")
- Agence marketing / com / RP / recrutement : nouveaux clients/an × LTV moyen × taux de signature en hausse (un site qui place le cabinet au niveau des grands cabinets parisiens)
- Architecture / studio créatif : projets/an × honoraires moyens × % de leads premium
- SaaS / éditeur logiciel : MRR cible × % conversion landing → essai × LTV (un site qui convertit 2× mieux raccourcit le payback)
- Agence digitale : nombre de projets/an × ticket moyen × % de bonds en aval (taux de conversion home → brief)
- Automatisation / outils internes : heures/mois économisées par l'équipe × coût horaire chargé → €/an récupérés
- Autre : adapter intelligemment

Le break-even doit être réaliste : "L'investissement se rentabilise en ~X mois."

Réponds UNIQUEMENT en JSON, sans markdown, sans texte autour :
{
  "intro": "Bonjour ${p.kontaktIme ? p.kontaktIme.split(" ")[0] : "[Prénom]"}, …" (2-3 phrases),
  "challenge": "Constat actuel sur leur site, en t'appuyant sur les faits ci-dessus" (3-4 phrases),
  "approach": "Notre approche pour leur secteur" (3-4 phrases),
  "scope": [
    { "tier": "Essential", "bullets": ["..."] },
    { "tier": "Pro", "bullets": ["..."] },
    { "tier": "Bespoke", "bullets": ["..."] }
  ],
  "timeline": [
    { "phase": "Discovery & wireframes", "weeks": "S1-S2", "deliverable": "..." },
    ...
  ],
  "pricing": [
    { "tier": "Essential", "label": "Essential", "priceEur": 6500, "deposit": 1500, "description": "...", "recommended": false },
    { "tier": "Pro", "label": "Pro", "priceEur": 14500, "deposit": 3500, "description": "...", "recommended": true },
    { "tier": "Bespoke", "label": "Bespoke", "priceEur": 28000, "deposit": 7000, "description": "...", "recommended": false }
  ],
  "valueProjection": {
    "headline": "...",
    "rows": [
      { "label": "Hypothèse : 8 000 nuits / an", "value": "" },
      { "label": "Conversion directe +6 pp", "value": "+480 nuits" },
      { "label": "ADR moyen", "value": "180 €" },
      { "label": "Gain annuel récupéré sur OTA", "value": "≈ 86 400 €" }
    ],
    "breakEven": "L'investissement Pro se rentabilise en moins de 2 mois."
  },
  "closing": "..." (2-3 phrases, chaleureuses, suggérant la prochaine étape)
}`;
}

export async function generateProposal(p: ProposalInput): Promise<ProposalContent | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const anthropic = new Anthropic({ apiKey });
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      messages: [{ role: "user", content: buildPrompt(p) }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") return null;
    const raw = block.text.trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(raw.slice(start, end + 1)) as ProposalContent;
  } catch (e) {
    console.warn("[proposal] failed:", e);
    return null;
  }
}
