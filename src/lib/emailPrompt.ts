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
import type { AuditResult } from "@/lib/auditFindings";

export type Lang = "fr" | "nl";

const EMAIL_SYSTEM_FR = `Tu es Temim Turkusic, fondateur d'Unlockd.art, un studio parisien qui livre trois choses : identité de marque, sites web premium, et logiciel sur mesure (outils internes, automatisations, applications métier). Tes clients types : (1) PME industrielles et B2B avec budget mais SANS équipe IT interne — entreprises de construction, sécurité incendie, génie climatique (CVC), plomberie pro, électricité industrielle, sécurité, nettoyage industriel, logistique, transport, fabrication, gestion des déchets, services techniques. (2) Petits commerces premium qui ont besoin d'une vraie présence digitale — studios de yoga / pilates, instituts de beauté, spas, salons indépendants, restaurants gastronomiques, pâtisseries artisanales, fleuristes, photographes, opticiens indépendants, vétérinaires, cliniques esthétiques privées. JAMAIS d'agences marketing, cabinets de conseil, avocats, experts-comptables, startups tech, agences digitales — ces gens ont déjà leur équipe ou délèguent en interne. Tu écris dans TA voix (jamais dans celle d'une IA). Tes emails sont très personnalisés, courts, élégants. Jamais agressifs. Jamais génériques. En français impeccable mais vivant.

Règle absolue : tu ne dois JAMAIS inventer un détail spécifique sur le site, l'équipe, l'historique, le produit ou les chiffres du prospect. Si tu disposes de "Faits vérifiés", utilise-les littéralement (titre du site, H1, score Lighthouse, prénom du décideur, signaux détectés). Si tu n'as pas de fait vérifié pertinent, reste sur une observation sectorielle juste — jamais une fausse précision.

Quand un score Lighthouse mobile bas (<50) est fourni, mentionne-le explicitement dans l'email initial avec le chiffre exact — c'est ton accroche la plus forte.

IMPORTANT: Respond ONLY with a valid JSON array. No explanation, no markdown, no code blocks. Just the raw JSON array starting with [ and ending with ].`;

const EMAIL_SYSTEM_NL = `Je bent Temim Turkusic, oprichter van Unlockd.art, een Parijse studio die drie dingen levert: merkidentiteit, premium websites, en custom software (interne tools, automatiseringen, vakapplicaties). Je typische klanten: (1) Industriële en B2B MKB-bedrijven mét budget maar ZONDER interne IT — bouwbedrijven, brandbeveiliging, installatie (CV, koeling, sanitair), elektrotechniek, security, industriële schoonmaak, logistiek, transport, productie, afvalbeheer, technische dienstverleners. (2) Kleine premium ondernemingen die een echte digitale aanwezigheid nodig hebben — yoga- / pilatesstudio's, beautysalons, spa's, onafhankelijke salons, restaurants, ambachtelijke patisserie, bloemisten, fotostudio's, onafhankelijke opticiens, dierenartsen, esthetische klinieken. NOOIT marketingbureaus, adviesbureaus, advocatenkantoren, accountantskantoren, tech startups, digital agencies — die hebben hun eigen team of besteden intern uit. Je schrijft in JOUW stem (nooit AI-stijl). Je e-mails zijn zeer persoonlijk, kort, elegant. Nooit agressief. Nooit generiek. In foutloos maar levendig Nederlands.

Absolute regel: je verzint NOOIT een specifiek detail over de site, het team, de geschiedenis, het product of de cijfers van de prospect. Als je "Geverifieerde feiten" hebt, gebruik ze letterlijk (sitetitel, H1, Lighthouse score, voornaam van de beslisser, gedetecteerde signalen). Als je geen relevant feit hebt, blijf bij een correcte sectorobservatie — nooit een valse precisie.

Bij een lage mobiele Lighthouse score (<50) noem je hem expliciet in de eerste e-mail met het exacte cijfer — dat is je sterkste opening.

IMPORTANT: Respond ONLY with a valid JSON array. No explanation, no markdown, no code blocks. Just the raw JSON array starting with [ and ending with ].`;

const SYSTEM_BY_LANG: Record<Lang, string> = {
  fr: EMAIL_SYSTEM_FR,
  nl: EMAIL_SYSTEM_NL,
};

const VOICE_HEADER_BY_LANG: Record<Lang, string> = {
  fr: "VOIX ET STYLE :",
  nl: "STEM EN STIJL:",
};

function normalizeLang(l: string | null | undefined): Lang {
  return l === "nl" ? "nl" : "fr";
}

/**
 * Composes the full system prompt for any email generation call: combines the
 * base studio brief with the operator's voice fingerprint and the anti-AI
 * guardrails. Resolved at call time so voice-profile updates take effect
 * immediately without redeploys. Branches by prospect language.
 */
export async function getEmailSystemPrompt(lang: string | null = "fr"): Promise<string> {
  const L = normalizeLang(lang);
  const voiceGuide = await buildVoiceGuideForPrompt();
  return `${SYSTEM_BY_LANG[L]}\n\n${VOICE_HEADER_BY_LANG[L]}\n${voiceGuide}`;
}

// Backwards-compat export — some legacy call-sites still import the constant.
// New code should use getEmailSystemPrompt(lang) so voice updates apply live.
export const EMAIL_SYSTEM_PROMPT = EMAIL_SYSTEM_FR;

const NICHE_FR_HINTS: Record<string, string> = {
  // Group A — B2B professional services
  "cabinet de conseil": "conseil B2B",
  "consulting": "conseil B2B",
  "cabinet d'avocats": "cabinet d'avocats",
  "law firm": "cabinet d'avocats",
  "expert-comptable": "expertise comptable",
  "accountant": "expertise comptable",
  "agence de communication": "agence de communication",
  "marketing agency": "agence marketing",
  "agence de relations presse": "relations presse",
  "pr agency": "relations presse",
  "cabinet de recrutement": "recrutement",
  "recruiter": "recrutement",
  "cabinet rh": "ressources humaines",
  "agence d'architecture": "architecture",
  architecture: "architecture",
  architecte: "architecture",
  "agence de traduction": "traduction professionnelle",
  "organisme de formation b2b": "formation B2B",
  // Group B — Tech / SaaS (Sirene NAF codes also accepted as fuzzy keys)
  "tech startup": "startup tech",
  "saas": "éditeur SaaS",
  "software": "édition logicielle",
  "it consulting": "conseil IT",
  "digital agency": "agence digitale",
  "63.12z": "plateforme web / SaaS",
  "62.01z": "édition logicielle",
  "62.02a": "conseil IT",
  "73.11z": "agence digitale",
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
  audit?: AuditResult | null;
  mockupUrl?: string | null;
  auditUrl?: string | null;
  lang?: Lang | string | null;
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
  if (opts.audit && opts.audit.findings.length > 0) {
    const findingsText = opts.audit.findings
      .map((f, i) => `${i + 1}. ${f.observation} → ${f.impact} → Fix : ${f.fix}`)
      .join("\n");
    blocks.push(
      `Audit 3-findings DÉJÀ GÉNÉRÉ pour ce prospect — Follow2 doit présenter ces 3 findings tels quels, formattés en HTML compact (chaque finding = 1 paragraphe avec <strong>n. observation</strong><br>→ impact<br><em>Fix : ...</em>). NE PAS reformuler ni inventer d'autres findings.\n${findingsText}`
    );
  }
  if (opts.auditUrl) {
    // The audit landing page renders findings + mockup + Calendly CTA. F2
    // links here; Claude must NOT try to reproduce all findings in the
    // email body (the landing page already does that, better).
    const mockupHint = opts.mockupUrl
      ? " La page contient aussi une direction visuelle pour leur site (mockup)."
      : "";
    blocks.push(
      `Page d'audit DÉJÀ PRÉPARÉE pour ce prospect : ${opts.auditUrl}\n\nFollow2 doit se terminer par UNE phrase courte qui pointe vers cette URL, exemple : "J'ai préparé un audit personnalisé pour vous — <a href='${opts.auditUrl}'>les 3 points concrets ici →</a>". Garde l'URL EXACTE dans un <a href>. Pas besoin de réécrire les findings dans le mail, la page les présente déjà.${mockupHint}\n\nFollow1 peut faire une légère allusion ("je vous prépare un audit ciblé, je vous l'envoie d'ici quelques jours") sans donner le lien — le lien tombe en Follow2.`
    );
  } else if (opts.mockupUrl) {
    blocks.push(
      `Mockup visuel DÉJÀ GÉNÉRÉ (image hero premium du site refait) : ${opts.mockupUrl}\n\nFollow2 doit se terminer par UNE phrase qui pointe vers le mockup, exemple : "J'ai esquissé à quoi votre site pourrait ressembler — <a href='${opts.mockupUrl}'>première impression visuelle ici</a>." (adapte la formulation mais garde l'URL telle quelle, dans un <a href>).`
    );
  }
  return blocks.length === 0 ? "" : `\n\n${blocks.join("\n\n")}`;
}

export function buildEmailPrompt(p: PromptProspect, opts: BuildPromptOpts = {}): string {
  const L = normalizeLang(opts.lang ?? "fr");
  const nicheLabel = niceNicheLabel(p.nisa);
  const greetingFirstName = pickGreetingName(opts.decisionMakers ?? null, p.kontaktIme);
  const factsSection = buildFactsBlock(p, opts);
  return L === "nl"
    ? buildPromptNL(p, opts, nicheLabel, greetingFirstName, factsSection)
    : buildPromptFR(p, opts, nicheLabel, greetingFirstName, factsSection);
}

function buildPromptFR(
  p: PromptProspect,
  opts: BuildPromptOpts,
  nicheLabel: string,
  greetingFirstName: string | null,
  factsSection: string,
): string {
  const contact = [p.kontaktIme, p.kontaktPozicija].filter(Boolean).join(", ") || "Non renseigné";
  const hintBlock = opts.nicheHint?.trim()
    ? `\n\nInstructions spécifiques pour le secteur "${nicheLabel}" (à respecter scrupuleusement):\n${opts.nicheHint.trim()}`
    : "";
  const greetingHint = greetingFirstName
    ? `Commence par "Bonjour ${greetingFirstName}," (prénom uniquement, validé par les faits vérifiés).`
    : `Commence par "Bonjour," sans nom inventé.`;

  if (opts.compact) {
    return `Génère 5 cold emails pour: ${p.firmaNaziv}, secteur ${nicheLabel}, ${p.grad}. Contact: ${contact}. Site: ${p.website || "Pas de site"}. Description: ${p.opisFirme || "N/A"}. Notes: ${p.napomena || "Aucune"}.${factsSection}

Types: "initial","follow1","follow2","follow3","breakup". ${greetingHint} Règles: français impeccable, ton premium, balises HTML p/br/strong uniquement, max 120 mots par email (breakup max 40 mots), pas de prix, pas de signature à la fin.${hintBlock}

Return ONLY: [{"tip":"initial","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow1","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow2","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow3","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"breakup","subject":"...","subjectB":"...","body":"<p>...</p>"}]`;
  }

  return `Génère 5 cold emails pour ce prospect.

Prospect:
- Nom: ${p.firmaNaziv}
- Contact CSV: ${contact}
- Secteur: ${nicheLabel}
- Ville: ${p.grad}
- Site web: ${p.website || "Pas de site"}
- Description: ${p.opisFirme || "Non renseigné"}
- Notes opérateur: ${p.napomena || "Aucune"}${factsSection}

Types à générer (adapte ton et arguments au secteur "${nicheLabel}"):
1. "initial" — Introduction courte. Si un score Lighthouse mobile < 50 est fourni, OUVRE l'email avec ce chiffre exact. Sinon appuie-toi sur UN fait vérifié concret. Proposition de valeur Unlockd.art adaptée.
2. "follow1" — Ce qu'ils perdent sans site premium. Si un signal négatif a été détecté, évoque-le concrètement.
3. "follow2" — Preuve sociale concrète. Si une case study a été fournie, utilise-la.
4. "follow3" — Email final très court, simple oui/non, un seul appel à l'action.
5. "breakup" — Format UNIQUEMENT: "Bonjour ${greetingFirstName ?? "[Prénom]"}, dois-je clôturer cette piste ou c'est juste un mauvais timing ?" — 1 phrase, 25-40 mots max, sans pitch. Sujet: 3-5 mots minuscules.

Règles:
- Français impeccable, ton premium
- ${greetingHint}
- Corps HTML: balises p, br, strong uniquement
- Maximum 120 mots par email (breakup max 40 mots)
- Pas de prix
- Pas de signature ni nom de société à la fin (la signature est ajoutée automatiquement après ton message)
- Deux lignes d'objet "subject" (A) et "subjectB" (B) pour A/B testing
- N'invente AUCUN fait spécifique${hintBlock}

Return ONLY the JSON array:
[{"tip":"initial","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow1","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow2","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow3","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"breakup","subject":"...","subjectB":"...","body":"<p>...</p>"}]`;
}

function buildPromptNL(
  p: PromptProspect,
  opts: BuildPromptOpts,
  nicheLabel: string,
  greetingFirstName: string | null,
  factsSection: string,
): string {
  const contact = [p.kontaktIme, p.kontaktPozicija].filter(Boolean).join(", ") || "Niet ingevuld";
  const hintBlock = opts.nicheHint?.trim()
    ? `\n\nSpecifieke instructies voor de sector "${nicheLabel}" (strikt te volgen):\n${opts.nicheHint.trim()}`
    : "";
  const greetingHint = greetingFirstName
    ? `Begin met "Beste ${greetingFirstName}," (alleen voornaam, gevalideerd door geverifieerde feiten).`
    : `Begin met "Goedendag," zonder verzonnen naam.`;

  if (opts.compact) {
    return `Genereer 5 cold emails voor: ${p.firmaNaziv}, sector ${nicheLabel}, ${p.grad}. Contact: ${contact}. Site: ${p.website || "Geen site"}. Beschrijving: ${p.opisFirme || "N/A"}. Notities: ${p.napomena || "Geen"}.${factsSection}

Types: "initial","follow1","follow2","follow3","breakup". ${greetingHint} Regels: foutloos Nederlands, premium toon, alleen p/br/strong HTML tags, max 120 woorden per e-mail (breakup max 40), geen prijzen, geen handtekening aan het einde.${hintBlock}

Return ONLY: [{"tip":"initial","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow1","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow2","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow3","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"breakup","subject":"...","subjectB":"...","body":"<p>...</p>"}]`;
  }

  return `Genereer 5 cold emails voor deze prospect.

Prospect:
- Naam: ${p.firmaNaziv}
- Contact CSV: ${contact}
- Sector: ${nicheLabel}
- Stad: ${p.grad}
- Website: ${p.website || "Geen website"}
- Beschrijving: ${p.opisFirme || "Niet ingevuld"}
- Operator notities: ${p.napomena || "Geen"}${factsSection}

Types te genereren (pas toon en argumenten aan op de sector "${nicheLabel}"):
1. "initial" — Korte introductie. Als een mobiele Lighthouse score < 50 wordt gegeven, OPEN de e-mail met dat exacte cijfer. Anders steun je op ÉÉN concreet geverifieerd feit. Waardevoorstel van Unlockd.art afgestemd op de sector.
2. "follow1" — Wat ze verliezen zonder een premium site. Als een negatief signaal werd gedetecteerd, noem het concreet.
3. "follow2" — Concreet sociaal bewijs. Als hierboven een case study werd gegeven, gebruik het.
4. "follow3" — Hele korte laatste e-mail, simpele ja/nee, één call-to-action.
5. "breakup" — Formaat ALLEEN: "Beste ${greetingFirstName ?? "[Voornaam]"}, moet ik dit dossier sluiten of is dit gewoon verkeerde timing?" — 1 zin, 25-40 woorden max, geen pitch. Onderwerp: 3-5 kleine letters.

Regels:
- Foutloos Nederlands, premium toon
- ${greetingHint}
- HTML body: alleen p, br, strong tags
- Maximum 120 woorden per e-mail (breakup max 40)
- Nooit prijzen noemen
- Voeg geen handtekening of bedrijfsnaam toe aan het einde (de handtekening wordt automatisch toegevoegd)
- Twee onderwerpregels "subject" (A) en "subjectB" (B) voor A/B testing
- Verzin GEEN specifieke feiten${hintBlock}

Return ONLY the JSON array:
[{"tip":"initial","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow1","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow2","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow3","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"breakup","subject":"...","subjectB":"...","body":"<p>...</p>"}]`;
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
