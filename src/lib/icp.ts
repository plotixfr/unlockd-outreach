/**
 * The single source of truth for Unlockd.art's ICP (ideal customer profile),
 * decided at the 2026-06-08 pivot. BOTH the email-generation system prompts
 * (emailPrompt.ts) and the quality scorer (qualityScore.ts) consume these
 * strings, so the two can never diverge again — the divergence is exactly
 * what caused the scorer to reject every prospect the briefs hunted.
 *
 * Group A — industrial/B2B SMEs with budget but NO in-house IT.
 * Group B — small premium lifestyle/service businesses.
 * Exclusions — anyone with an in-house IT/marketing team (the pre-pivot ICP).
 */

export const ICP = {
  services: {
    en: "brand identity, premium websites, and custom software / automation tools",
    fr: "identité de marque, sites web premium, et logiciel sur mesure (outils internes, automatisations, applications métier)",
    nl: "merkidentiteit, premium websites, en custom software (interne tools, automatiseringen, vakapplicaties)",
  },
  dealSizes: "€5k–50k for sites/brand, €15k–80k for custom software",
  groupA: {
    en: "Industrial / B2B SMEs with budget but NO in-house IT team — construction firms, fire safety, HVAC / climate engineering, professional plumbing, industrial electrical, security companies, industrial cleaning, logistics, transport, manufacturing, waste management, technical services",
    fr: "PME industrielles et B2B avec budget mais SANS équipe IT interne — entreprises de construction, sécurité incendie, génie climatique (CVC), plomberie pro, électricité industrielle, sécurité, nettoyage industriel, logistique, transport, fabrication, gestion des déchets, services techniques",
    nl: "Industriële en B2B MKB-bedrijven mét budget maar ZONDER interne IT — bouwbedrijven, brandbeveiliging, installatie (CV, koeling, sanitair), elektrotechniek, security, industriële schoonmaak, logistiek, transport, productie, afvalbeheer, technische dienstverleners",
  },
  groupB: {
    en: "Small premium lifestyle/service businesses that need a real digital presence — yoga / pilates studios, boutique fitness, beauty institutes, spas, independent salons, gastronomic restaurants, artisan pâtisseries, high-end florists, photographers, independent opticians, vet clinics, private aesthetic clinics, boutique hotels",
    fr: "Petits commerces premium qui ont besoin d'une vraie présence digitale — studios de yoga / pilates, instituts de beauté, spas, salons indépendants, restaurants gastronomiques, pâtisseries artisanales, fleuristes, photographes, opticiens indépendants, vétérinaires, cliniques esthétiques privées",
    nl: "Kleine premium ondernemingen die een echte digitale aanwezigheid nodig hebben — yoga- / pilatesstudio's, beautysalons, spa's, onafhankelijke salons, restaurants, ambachtelijke patisserie, bloemisten, fotostudio's, onafhankelijke opticiens, dierenartsen, esthetische klinieken",
  },
  exclusions: {
    en: "marketing agencies, consultancies, law firms, accountants, tech startups, digital agencies",
    fr: "agences marketing, cabinets de conseil, avocats, experts-comptables, startups tech, agences digitales",
    nl: "marketingbureaus, adviesbureaus, advocatenkantoren, accountantskantoren, tech startups, digital agencies",
  },
  // Brief-driven markets. Discovery briefs target these; nothing outside a
  // brief's own country is "wrong geography".
  markets: {
    en: "France, French-speaking Switzerland (Romandie), Netherlands",
    codes: ["FR", "CH", "NL"] as const,
  },
} as const;

/**
 * Multilingual (fr/nl/en) niche detectors used by the scoring boost
 * heuristics. Matched against the prospect's free-form `nisa` label, which
 * may be a French/Dutch search term or a Sirene NAF code basket.
 */
export const GROUP_A_NICHE_RE =
  /constru|bâtiment|batiment|bouw|aannemer|chauffag|\bcvc\b|hvac|climati|verwarming|plomb|sanitair|installat|électric|electric|elektr|sécurité|securite|security|beveiliging|incendie|nettoyage|schoonmaak|cleaning|logisti|transport|fret|entrepos|fabrica|productie|manufact|déchet|dechet|afval|waste|génie|toiture|couverture|étanché|etanche|isolation|\b4[123]\.\d{2}|\b80\.20|\b81\.22|\b38\.1\d|\b33\.20|\b49\.41|\b52\.10/i;

export const GROUP_B_NICHE_RE =
  /yoga|pilates|fitness|salle de sport|\bgym\b|beauté|beaute|beauty|schoonheid|institut|\bspa\b|wellness|salon|coiff|esthét|esthet|restaurant|gastro|pâtisser|patisser|boulanger|fleurist|bloemist|florist|photograph|fotostudio|fotograa|opticien|vétérinair|veterinair|dierenarts|clinique|kliniek|hôtel|hotel/i;

const COUNTRY_NAMES: Record<string, string> = {
  FR: "France",
  CH: "Switzerland (Romandie)",
  NL: "Netherlands",
};

export function countryName(code: string): string {
  return COUNTRY_NAMES[code.toUpperCase()] ?? code;
}
