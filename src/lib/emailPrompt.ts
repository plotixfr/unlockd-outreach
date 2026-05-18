// Niche-agnostic Claude prompts.
//
// Claude now receives a stack of verified facts:
//   - Site scrape facts (title, H1, signals)
//   - PageSpeed/Lighthouse metrics
//   - Decision-makers extracted from team/contact pages
//   - One curated case study from the same niche, when one exists
// and is explicitly told to use those facts instead of inventing observations.
// The signature is appended server-side (see sendEmail.ts), so the prompt asks
// Claude to end at the last sentence of the message.

import type { SiteSnapshot } from "@/lib/scrapeSite";
import { snapshotToPromptFacts } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";
import { pagespeedToPromptFacts } from "@/lib/pagespeed";
import type { DecisionMakerResult } from "@/lib/decisionMakers";
import { decisionMakersToPromptFacts, pickGreetingName } from "@/lib/decisionMakers";
import { buildVoiceGuideForPrompt } from "@/lib/voiceProfile";

const EMAIL_SYSTEM_BASE = `Tu es Temim Turkusic, fondateur d'Unlockd.art, un studio parisien qui conçoit et développe des sites web premium pour des marques exigeantes — hôtels, restaurants, architectes, agences immobilières, marques de luxe, professionnels indépendants, e-commerce haut de gamme. Tu écris dans TA voix (jamais dans celle d'une IA). Tes emails sont très personnalisés, courts, élégants. Jamais agressifs. Jamais génériques. En français impeccable mais vivant.

Règle absolue : tu ne dois JAMAIS inventer un détail spécifique sur le site, l'équipe, l'historique, le produit ou les chiffres du prospect. Si tu disposes de "Faits vérifiés", utilise-les littéralement (titre du site, H1, score Lighthouse, prénom du décideur, signaux détectés). Si tu n'as pas de fait vérifié pertinent, reste sur une observation sectorielle juste — jamais une fausse précision.

Quand un score Lighthouse mobile bas (<50) est fourni, mentionne-le explicitement dans l'email initial avec le chiffre exact — c'est ton accroche la plus forte.

IMPORTANT: Respond ONLY with a valid JSON array. No explanation, no markdown, no code blocks. Just the raw JSON array starting with [ and ending with ].`;

/**
 * Composes the full system prompt for any email generation call: combines the
 * base studio brief with the operator's voice fingerprint and the anti-AI
 * guardrails. Resolved at call time so voice-profile updates take effect
 * immediately without redeploys.
 */
export async function getEmailSystemPrompt(): Promise<string> {
  const voiceGuide = await buildVoiceGuideForPrompt();
  return `${EMAIL_SYSTEM_BASE}\n\nVOIX ET STYLE :\n${voiceGuide}`;
}

// Backwards-compat export — some legacy call-sites still import the constant.
// New code should use getEmailSystemPrompt() so voice updates apply live.
export const EMAIL_SYSTEM_PROMPT = EMAIL_SYSTEM_BASE;

const NICHE_FR_HINTS: Record<string, string> = {
  hotel: "hôtellerie",
  hôtel: "hôtellerie",
  hotellerie: "hôtellerie",
  hôtellerie: "hôtellerie",
  restaurant: "restauration",
  restauration: "restauration",
  architecture: "architecture",
  architecte: "architecture",
  property: "immobilier",
  immobilier: "immobilier",
  "real estate": "immobilier",
  spa: "spa et bien-être",
  boutique: "boutique de luxe",
  ecommerce: "e-commerce premium",
  "e-commerce": "e-commerce premium",
};

function niceNicheLabel(raw: string): string {
  const key = raw.trim().toLowerCase();
  return NICHE_FR_HINTS[key] ?? raw.trim();
}

export interface PromptProspect {
  firmaNaziv: string;
  kontaktIme: string | null;
  kontaktPozicija: string | null;
  nisa: string;
  grad: string;
  website: string | null;
  instagram: string | null;
  opisFirme: string | null;
  kvalitetSajta: number | null;
  napomena: string | null;
}

export interface PromptCaseStudy {
  title: string;
  summary: string;
  metricLabel: string | null;
  metricValue: string | null;
}

export interface BuildPromptOpts {
  compact?: boolean;
  nicheHint?: string | null;
  siteSnapshot?: SiteSnapshot | null;
  pagespeed?: PageSpeedSnapshot | null;
  decisionMakers?: DecisionMakerResult | null;
  caseStudy?: PromptCaseStudy | null;
}

function buildFactsBlock(p: PromptProspect, opts: BuildPromptOpts): string {
  const blocks: string[] = [];
  const siteFacts = snapshotToPromptFacts(opts.siteSnapshot);
  if (siteFacts) blocks.push(siteFacts);
  const psiFacts = pagespeedToPromptFacts(opts.pagespeed);
  if (psiFacts) blocks.push(psiFacts);
  const dmFacts = decisionMakersToPromptFacts(opts.decisionMakers ?? null, p.kontaktIme, p.kontaktPozicija);
  if (dmFacts) blocks.push(dmFacts);
  if (opts.caseStudy) {
    const cs = opts.caseStudy;
    const metric =
      cs.metricLabel && cs.metricValue
        ? ` (résultat concret : ${cs.metricValue} ${cs.metricLabel})`
        : "";
    blocks.push(
      `Case study à mentionner dans le follow-up #2 ("preuve sociale") : ${cs.title}${metric}. Résumé : ${cs.summary}`
    );
  }
  return blocks.length === 0 ? "" : `\n\n${blocks.join("\n\n")}`;
}

export function buildEmailPrompt(p: PromptProspect, opts: BuildPromptOpts = {}): string {
  const nicheLabel = niceNicheLabel(p.nisa);
  const contact = [p.kontaktIme, p.kontaktPozicija].filter(Boolean).join(", ") || "Non renseigné";
  const greetingFirstName = pickGreetingName(opts.decisionMakers ?? null, p.kontaktIme);
  const hintBlock = opts.nicheHint?.trim()
    ? `\n\nInstructions spécifiques pour le secteur "${nicheLabel}" (à respecter scrupuleusement):\n${opts.nicheHint.trim()}`
    : "";
  const factsSection = buildFactsBlock(p, opts);

  const greetingHint = greetingFirstName
    ? `Commence par "Bonjour ${greetingFirstName}," (prénom uniquement, validé par les faits vérifiés).`
    : `Commence par "Bonjour," sans nom inventé.`;

  if (opts.compact) {
    return `Génère 4 cold emails pour: ${p.firmaNaziv}, secteur ${nicheLabel}, ${p.grad}. Contact: ${contact}. Site: ${p.website || "Pas de site"}. Instagram: ${p.instagram || "N/A"}. Description: ${p.opisFirme || "N/A"}. Qualité site: ${p.kvalitetSajta ?? "N/A"}/5. Notes: ${p.napomena || "Aucune"}.${factsSection}

Types: "initial","follow1","follow2","follow3". Adapte ton, références et arguments au secteur "${nicheLabel}". ${greetingHint} Règles: français impeccable, ton premium, balises HTML p/br/strong uniquement, max 120 mots par email, pas de prix, pas de signature ni nom de société à la fin (la signature est ajoutée automatiquement après ton message). Pour chaque email, deux lignes d'objet "subject" (A) et "subjectB" (B) pour A/B testing.${hintBlock}

Return ONLY: [{"tip":"initial","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow1","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow2","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow3","subject":"...","subjectB":"...","body":"<p>...</p>"}]`;
  }

  return `Génère 4 cold emails pour ce prospect.

Prospect:
- Nom: ${p.firmaNaziv}
- Contact CSV: ${contact}
- Secteur: ${nicheLabel}
- Ville: ${p.grad}
- Site web: ${p.website || "Pas de site"}
- Instagram: ${p.instagram || "Non renseigné"}
- Description: ${p.opisFirme || "Non renseigné"}
- Qualité du site (1=mauvais, 5=excellent): ${p.kvalitetSajta ?? "Non évalué"}
- Notes opérateur: ${p.napomena || "Aucune"}${factsSection}

Types à générer (adapte ton, références et arguments au secteur "${nicheLabel}"):
1. "initial" — Introduction courte. Si un score Lighthouse mobile < 50 est fourni, OUVRE l'email avec ce chiffre exact (pas de paraphrase) — c'est l'accroche la plus forte. Sinon appuie-toi sur UN fait vérifié concret (titre, H1, signal détecté). Si rien de précis n'est disponible, observation sectorielle juste. Proposition de valeur Unlockd.art adaptée au secteur.
2. "follow1" — Ce qu'ils perdent sans site premium dans leur secteur. Si un signal négatif a été détecté (LCP > 4s, pas de viewport mobile, plateforme générique type Wix, peu d'images, pas de réservation), évoque-le concrètement.
3. "follow2" — Preuve sociale concrète. Si une case study a été fournie ci-dessus, utilise-la (titre + résultat chiffré). Sinon, reste qualitatif — n'invente AUCUN chiffre.
4. "follow3" — Email final très court, simple oui/non, un seul appel à l'action.

Règles:
- Français impeccable, ton premium
- ${greetingHint}
- Corps HTML: balises p, br, strong uniquement
- Maximum 120 mots par email
- Ne jamais mentionner de prix
- Ne pas ajouter de signature, de nom ni de nom de société à la fin. La signature est ajoutée automatiquement par le système après ton message. L'email se termine par la dernière phrase utile.
- Générer deux lignes d'objet pour chaque email : "subject" (version A, sobre et direct) et "subjectB" (version B, plus orienté bénéfice ou question) — tons légèrement différents pour A/B testing
- N'invente AUCUN fait spécifique sur le prospect qui ne figure pas dans les données ci-dessus${hintBlock}

Return ONLY the JSON array, nothing else:
[{"tip":"initial","subject":"Ligne objet A...","subjectB":"Ligne objet B...","body":"<p>...</p>"},{"tip":"follow1","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow2","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow3","subject":"...","subjectB":"...","body":"<p>...</p>"}]`;
}

export function extractJsonArray(text: string): string {
  const s = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    return s.slice(start, end + 1).trim();
  }
  return s;
}
