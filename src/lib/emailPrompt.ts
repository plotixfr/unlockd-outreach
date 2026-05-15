// Niche-agnostic Claude prompts.
//
// The previous version forced 4 hardcoded niches into a French translation table
// and hardwired "hôtellerie / architecture / immobilier" into the system prompt.
// That made every new niche either bounce off CSV validation or produce a
// generic-feeling email. This module replaces all of that with one builder that
// passes the prospect's actual niche straight to Claude.

export const EMAIL_SYSTEM_PROMPT = `Tu es un expert en cold emails B2B francophone. Tu écris pour Unlockd.art, un studio parisien qui conçoit et développe des sites web premium et sur-mesure pour des marques exigeantes — hôtels, restaurants, architectes, agences immobilières, marques de luxe, professionnels indépendants, e-commerce haut de gamme, et tout autre secteur où l'image de marque digitale compte. Tu adaptes systématiquement le ton, les références et les arguments au secteur précis du prospect. Tu écris des emails très personnalisés, courts, professionnels et élégants. Jamais agressifs. Jamais génériques. Toujours en français impeccable.

IMPORTANT: Respond ONLY with a valid JSON array. No explanation, no markdown, no code blocks. Just the raw JSON array starting with [ and ending with ].`;

// Best-effort French translation for the most common niches. Anything not in
// the map is passed through unchanged — Claude handles the translation/context
// from the raw value (works equally well for "Spa", "Avocat", "Boutique mode",
// "Restaurant gastronomique", etc.).
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

export function buildEmailPrompt(p: PromptProspect, opts: { compact?: boolean } = {}): string {
  const nicheLabel = niceNicheLabel(p.nisa);
  const contact = [p.kontaktIme, p.kontaktPozicija].filter(Boolean).join(", ") || "Non renseigné";

  if (opts.compact) {
    return `Génère 4 cold emails pour: ${p.firmaNaziv}, secteur ${nicheLabel}, ${p.grad}. Contact: ${contact}. Site: ${p.website || "Pas de site"}. Instagram: ${p.instagram || "N/A"}. Description: ${p.opisFirme || "N/A"}. Qualité site: ${p.kvalitetSajta ?? "N/A"}/5. Notes: ${p.napomena || "Aucune"}.

Types: "initial","follow1","follow2","follow3". Adapte ton, références et arguments au secteur "${nicheLabel}". Règles: français impeccable, ton premium, balises HTML p/br/strong uniquement, max 120 mots par email, pas de prix, pas de signature ni nom de société à la fin. Pour chaque email, deux lignes d'objet "subject" (A) et "subjectB" (B) pour A/B testing.

Return ONLY: [{"tip":"initial","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow1","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow2","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow3","subject":"...","subjectB":"...","body":"<p>...</p>"}]`;
  }

  return `Génère 4 cold emails pour ce prospect.

Prospect:
- Nom: ${p.firmaNaziv}
- Contact: ${contact}
- Secteur: ${nicheLabel}
- Ville: ${p.grad}
- Site web: ${p.website || "Pas de site"}
- Instagram: ${p.instagram || "Non renseigné"}
- Description: ${p.opisFirme || "Non renseigné"}
- Qualité du site (1=mauvais, 5=excellent): ${p.kvalitetSajta ?? "Non évalué"}
- Notes: ${p.napomena || "Aucune"}

Types à générer (adapte ton, références et arguments au secteur "${nicheLabel}"):
1. "initial" — Introduction courte, observation concrète sur leur site/présence, proposition de valeur Unlockd.art adaptée au secteur
2. "follow1" — Ce qu'ils perdent sans site premium dans leur secteur (clients, image, conversions)
3. "follow2" — Preuve sociale pertinente pour le secteur ${nicheLabel}, résultat concret d'Unlockd.art
4. "follow3" — Email final très court, simple oui/non

Règles:
- Français impeccable, ton premium
- Corps HTML: balises p, br, strong uniquement
- Maximum 120 mots par email
- Ne jamais mentionner de prix
- Ne pas ajouter de signature, de nom ni de nom de société à la fin. L'email se termine par la dernière phrase du message. Aucun saut de ligne final.
- Générer deux lignes d'objet pour chaque email : "subject" (version A) et "subjectB" (version B) — tons légèrement différents pour A/B testing

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
