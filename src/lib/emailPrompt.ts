// Niche-agnostic Claude prompts.
//
// Claude now receives a stack of verified facts:
//   - Site scrape facts (title, H1, signals)
//   - PageSpeed/Lighthouse metrics
//   - Decision-makers extracted from team/contact pages
//   - One curated case study from the same niche, when one exists
//   - Google rating + review count (parsed out of the operator note string)
// and is explicitly told to use those facts instead of inventing observations.
//
// Copy goals: open on a fact about THE PROSPECT (never the sender), stay short
// enough to read on a phone in 10s, branch the pitch on what the prospect
// actually has online (no site / social-only / a real URL), and never blanket-
// praise an existing site. The signature is appended server-side (see
// sendEmail.ts), so the prompt asks Claude to end at the last sentence.

import type { SiteSnapshot } from "@/lib/scrapeSite";
import { snapshotToPromptFacts } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";
import { pagespeedToPromptFacts } from "@/lib/pagespeed";
import type { DecisionMakerResult } from "@/lib/decisionMakers";
import { decisionMakersToPromptFacts, pickGreetingName } from "@/lib/decisionMakers";
import { buildVoiceGuideForPrompt } from "@/lib/voiceProfile";
import type { AuditResult } from "@/lib/auditFindings";
import { ICP, GROUP_A_NICHE_RE, GROUP_B_NICHE_RE } from "@/lib/icp";

export type Lang = "fr" | "nl";

// Client-type / exclusion sentences are interpolated from src/lib/icp.ts —
// the same source the quality scorer reads — so the email persona and the
// scorer can never target different ICPs again.
const EMAIL_SYSTEM_FR = `Tu es Temim Turkusic, fondateur d'Unlockd.art, un studio parisien qui livre trois choses : ${ICP.services.fr}. Tes clients types : (1) ${ICP.groupA.fr}. (2) ${ICP.groupB.fr}. JAMAIS de ${ICP.exclusions.fr}, ces gens ont déjà leur équipe ou délèguent en interne. Tu écris dans TA voix (jamais dans celle d'une IA). Tes emails sont très personnalisés, courts, vivants. Jamais agressifs. Jamais génériques. En français impeccable mais parlé.

La première phrase parle toujours d'EUX, jamais de toi : leur note Google, leur score mobile, l'absence de site. Tu n'écris JAMAIS "je me permets de vous contacter", "permettez-moi de me présenter", ni "j'espère que vous allez bien".

Règle absolue : tu n'inventes JAMAIS un détail spécifique sur le site, l'équipe, l'historique, le produit ou les chiffres du prospect. Si tu disposes de "Faits vérifiés", utilise-les littéralement (titre du site, H1, score Lighthouse, prénom du décideur, note Google, signaux détectés). Sans fait vérifié pertinent, reste sur une observation sectorielle juste, jamais une fausse précision.

Si un site existe déjà, tu ne le complimentes JAMAIS à l'aveugle : beaucoup de petites entreprises ont un Wix mort, une page vide ou parquée. Tu juges sur les faits. Un score Lighthouse mobile bas (<50) est ton accroche la plus forte : cite le chiffre exact dans l'email initial.

Chaque email se lit en 10 secondes sur un téléphone. Un seul appel à l'action, peu engageant : proposer une maquette gratuite. Jamais "en savoir plus".

Tu n'utilises jamais de tiret long : ni cadratin (—) ni demi-cadratin (–). Une virgule ou deux phrases à la place. Les traits d'union normaux (rendez-vous) restent autorisés.

IMPORTANT: Respond ONLY with a valid JSON array. No explanation, no markdown, no code blocks. Just the raw JSON array starting with [ and ending with ].`;

const EMAIL_SYSTEM_NL = `Je bent Temim Turkusic, oprichter van Unlockd.art, een Parijse studio die drie dingen levert: ${ICP.services.nl}. Je typische klanten: (1) ${ICP.groupA.nl}. (2) ${ICP.groupB.nl}. NOOIT ${ICP.exclusions.nl}, die hebben hun eigen team of besteden intern uit. Je schrijft in JOUW stem (nooit AI-stijl). Je e-mails zijn zeer persoonlijk, kort, levendig. Nooit agressief. Nooit generiek. In foutloos maar spreektaal Nederlands.

De eerste zin gaat altijd over HEN, nooit over jou: hun Google-score, hun mobiele snelheid, het ontbreken van een site. Je schrijft NOOIT "mag ik me even voorstellen", "ik neem de vrijheid om contact op te nemen" of "ik hoop dat het goed gaat".

Absolute regel: je verzint NOOIT een specifiek detail over de site, het team, de geschiedenis, het product of de cijfers. Als je "Geverifieerde feiten" hebt, gebruik ze letterlijk (sitetitel, H1, Lighthouse score, voornaam van de beslisser, Google-score, gedetecteerde signalen). Zonder relevant feit blijf je bij een correcte sectorobservatie, nooit valse precisie.

Als er al een site bestaat, prijs je die NOOIT blind: veel kleine bedrijven hebben een dode Wix, een lege of geparkeerde pagina. Je oordeelt op de feiten. Een lage mobiele Lighthouse score (<50) is je sterkste opening: noem het exacte cijfer in de eerste e-mail.

Elke e-mail lees je in 10 seconden op een telefoon. Eén call-to-action, laagdrempelig: een gratis mockup aanbieden. Nooit "meer informatie".

Je gebruikt nooit een lange streep: niet de em-streep (—) en niet de en-streep (–). Een komma of twee zinnen in plaats daarvan. Gewone koppeltekens (Google-score) blijven toegestaan.

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
 * immediately without redeploys. Branches by prospect language — and now feeds
 * the language through to the guardrails so NL prospects get Dutch rules.
 */
export async function getEmailSystemPrompt(lang: string | null = "fr"): Promise<string> {
  const L = normalizeLang(lang);
  const voiceGuide = await buildVoiceGuideForPrompt(L);
  return `${SYSTEM_BY_LANG[L]}\n\n${VOICE_HEADER_BY_LANG[L]}\n${voiceGuide}`;
}

// Backwards-compat export — some legacy call-sites still import the constant.
// New code should use getEmailSystemPrompt(lang) so voice updates apply live.
export const EMAIL_SYSTEM_PROMPT = EMAIL_SYSTEM_FR;

const NICHE_FR_HINTS: Record<string, string> = {
  // Group A — Sirene NAF codes → human labels (single-code keys; comma
  // baskets fall through to the raw string)
  "41.20a": "construction",
  "41.20b": "construction",
  "42.99z": "génie civil",
  "43.21a": "installation électrique",
  "43.22a": "génie climatique (CVC)",
  "43.22b": "plomberie",
  "43.91a": "couverture / toiture",
  "43.99a": "étanchéité / isolation",
  "80.20z": "sécurité et surveillance",
  "81.22z": "nettoyage industriel",
  "38.11z": "collecte de déchets",
  "33.20a": "installation industrielle",
  "49.41a": "transport routier de fret",
  "52.10a": "entreposage / logistique",
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
  // Structured Google reputation. Defaults to whatever can be parsed from the
  // operator note string, but callers may override. See parseGoogleRating.
  rating?: number | null;
  reviewCount?: number | null;
}

// ── Website-presence classification ───────────────────────────────────────
// The pitch branches on what the prospect actually has online. We never assume
// "has a URL" means "has a good site": small-business URLs are routinely dead
// Wix/placeholder/parked pages, so the has-URL branch defers to the Lighthouse
// score before saying anything about quality.
export type SitePresence = "none" | "social" | "site";

// URLs that are really a social/aggregator page, not the company's own site.
const SOCIAL_ONLY_RE =
  /(facebook\.com|fb\.com|fb\.me|instagram\.com|linktr\.ee|linktree|beacons\.ai|business\.site|\bg\.page\b|page\.link|wa\.me|whatsapp\.com|linkedin\.com)/i;

export function classifyWebsitePresence(website: string | null | undefined): SitePresence {
  const w = (website ?? "").trim();
  if (!w) return "none";
  if (SOCIAL_ONLY_RE.test(w)) return "social";
  return "site";
}

// ── Group classification (drives NL formality) ────────────────────────────
// Reuses the same niche regexes the scorer uses. Group A = industrial/B2B,
// Group B = small premium lifestyle. Industrial wins ties; unknown leans B.
function prospectGroup(nisa: string): "A" | "B" | null {
  const a = GROUP_A_NICHE_RE.test(nisa);
  const b = GROUP_B_NICHE_RE.test(nisa);
  if (a) return "A";
  if (b) return "B";
  return null;
}

// NL formality: Group A → formal "u", Group B (and unknown) → informal "je".
// Whatever this returns must stay consistent across all 5 emails of a sequence.
function nlRegister(nisa: string): "u" | "je" {
  return prospectGroup(nisa) === "A" ? "u" : "je";
}

// ── Google rating, parsed out of the operator note ────────────────────────
// Discovery flattens the Places rating into the napomena string as
// "Rating: 4.5/5 (120 avis)". We lift it back out into structured numbers so
// the prompt can surface it reliably as a labeled fact + credibility hook,
// instead of hoping the model notices it inside a free-text blob.
const RATING_NOTE_RE = /Rating:\s*([\d]+(?:[.,]\d+)?)\s*\/\s*5\s*\((\d+)\s*avis\)/i;

export function parseGoogleRating(napomena: string | null | undefined): {
  rating: number | null;
  reviewCount: number | null;
} {
  if (!napomena) return { rating: null, reviewCount: null };
  const m = napomena.match(RATING_NOTE_RE);
  if (!m) return { rating: null, reviewCount: null };
  const rating = parseFloat(m[1].replace(",", "."));
  const reviewCount = parseInt(m[2], 10);
  return {
    rating: Number.isFinite(rating) ? rating : null,
    reviewCount: Number.isFinite(reviewCount) ? reviewCount : null,
  };
}

// Strip the "Rating: …" token out of the operator note so it isn't shown twice
// (once as a structured fact, once buried in the notes line).
function napomenaWithoutRating(napomena: string | null): string | null {
  if (!napomena) return napomena;
  const stripped = napomena
    .replace(RATING_NOTE_RE, "")
    .replace(/^\s*[·•|,-]\s*/, "")
    .replace(/\s*[·•|]\s*[·•|]\s*/g, " · ")
    .replace(/\s*[·•|]\s*$/, "")
    .trim();
  return stripped.length > 0 ? stripped : null;
}

function formatRatingFact(rating: number, reviewCount: number | null, lang: Lang): string {
  const r = rating.toFixed(1).replace(".", lang === "fr" ? "," : ",");
  if (reviewCount && reviewCount > 0) {
    return lang === "fr" ? `${r}/5 sur ${reviewCount} avis` : `${r}/5 uit ${reviewCount} reviews`;
  }
  return `${r}/5`;
}

// Is this rating strong enough to lead an opener with? (Group-B credibility.)
function isStrongRating(rating: number | null, reviewCount: number | null): boolean {
  return rating != null && rating >= 4.5 && (reviewCount ?? 0) >= 20;
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
      .map((f, i) => `${i + 1}. ${f.observation} -> ${f.impact} -> Fix : ${f.fix}`)
      .join("\n");
    blocks.push(
      `Audit 3-findings DÉJÀ GÉNÉRÉ pour ce prospect, Follow2 doit présenter ces 3 findings tels quels, formattés en HTML compact (chaque finding = 1 paragraphe avec <strong>n. observation</strong><br>impact<br><em>Fix : ...</em>). NE PAS reformuler ni inventer d'autres findings.\n${findingsText}`
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
      `Page d'audit DÉJÀ PRÉPARÉE pour ce prospect : ${opts.auditUrl}\n\nFollow2 doit se terminer par UNE phrase courte qui pointe vers cette URL, exemple : "J'ai préparé un audit personnalisé pour vous, <a href='${opts.auditUrl}'>les 3 points concrets ici</a>". Garde l'URL EXACTE dans un <a href>. Pas besoin de réécrire les findings dans le mail, la page les présente déjà.${mockupHint}\n\nFollow1 peut faire une légère allusion ("je vous prépare un audit ciblé, je vous l'envoie d'ici quelques jours") sans donner le lien, le lien tombe en Follow2.`
    );
  } else if (opts.mockupUrl) {
    blocks.push(
      `Mockup visuel DÉJÀ GÉNÉRÉ (image hero premium du site refait) : ${opts.mockupUrl}\n\nFollow2 doit se terminer par UNE phrase qui pointe vers le mockup, exemple : "J'ai esquissé à quoi votre site pourrait ressembler, <a href='${opts.mockupUrl}'>première impression visuelle ici</a>." (adapte la formulation mais garde l'URL telle quelle, dans un <a href>).`
    );
  }
  return blocks.length === 0 ? "" : `\n\n${blocks.join("\n\n")}`;
}

export function buildEmailPrompt(p: PromptProspect, opts: BuildPromptOpts = {}): string {
  const L = normalizeLang(opts.lang ?? "fr");
  const nicheLabel = niceNicheLabel(p.nisa);
  const greetingFirstName = pickGreetingName(opts.decisionMakers ?? null, p.kontaktIme);
  const factsSection = buildFactsBlock(p, opts);
  const presence = classifyWebsitePresence(p.website);
  // Structured rating: explicit opts win, else parse it out of the note.
  const parsed = parseGoogleRating(p.napomena);
  const rating = opts.rating ?? parsed.rating;
  const reviewCount = opts.reviewCount ?? parsed.reviewCount;
  const ratingFact = rating != null ? formatRatingFact(rating, reviewCount, L) : null;
  const strongRating = isStrongRating(rating, reviewCount);
  return L === "nl"
    ? buildPromptNL(p, opts, nicheLabel, greetingFirstName, factsSection, presence, ratingFact, strongRating)
    : buildPromptFR(p, opts, nicheLabel, greetingFirstName, factsSection, presence, ratingFact, strongRating);
}

// ── French ─────────────────────────────────────────────────────────────────

function siteAngleFR(presence: SitePresence): string {
  if (presence === "none")
    return `SITUATION SITE : ce prospect n'a AUCUN site web. Angle : ils existent (Google, bouche-à-oreille) mais n'ont aucune présence en ligne à eux et n'apparaissent pas vraiment dans les recherches Google. Énonce ce manque tel qu'il est, ne prédis pas la perte de clients. Tu proposes d'en CRÉER un premier vrai, jamais "refaire".`;
  if (presence === "social")
    return `SITUATION SITE : ce prospect n'a PAS de vrai site, seulement une page sur les réseaux (Facebook/Instagram). Angle : ils dépendent d'une plateforme qui décide de leur portée et de ses propres règles, et ils n'apparaissent pas dans les recherches Google. Tant qu'ils n'ont pas de site à eux, tout repose sur cette page ; si elle change de règles ou disparaît, il ne leur reste rien qui soit à eux. NE dis PAS qu'ils "ne possèdent pas" leur page (c'est faux et ça sonne comme une astuce) : l'argument, c'est la dépendance et l'invisibilité sur Google. Tu proposes un vrai site qui leur appartient.`;
  return `SITUATION SITE : ce prospect A DÉJÀ un site (URL fournie). Ne dis JAMAIS, même implicitement, qu'il n'a pas de site ou qu'on "ne trouve rien" : tu parles de l'AMÉLIORER, pas de son absence. NE SUPPOSE PAS pour autant que le site est bon (beaucoup sont des Wix morts, des pages vides ou parquées) : juge sur les faits. Si un score Lighthouse mobile bas (<50) est fourni, OUVRE avec ce chiffre exact, formulé "votre site charge à 38/100 sur mobile" ou "38/100 au test Google mobile" (jamais "votre site score 38"). Si le score est correct ou absent, ne complimente PAS le site et n'invente AUCUN défaut : appuie-toi sur la note Google comme une opportunité ratée (cette réputation mérite un site qui convertit) ou sur un fait vérifié précis.`;
}

const FEWSHOT_FR = `Exemples de STYLE (n'invente PAS ces faits, c'est juste le ton, la longueur et le rythme visés) :

[Site existant, score mobile bas]
objet : votre site rame sur mobile
<p>Bonjour Marc,</p><p>J'ai ouvert le site de Dupont Chauffage sur mon téléphone : 38 sur 100 au test Google mobile, la page met plusieurs secondes à charger.</p><p>Je refais des sites pour des installateurs CVC. Je peux vous faire une maquette de votre page d'accueil cette semaine, gratuitement, juste pour voir l'effet.</p><p>Je vous l'envoie ?</p>

[Pas de site, bonne note Google]
objet : rien trouvé pour vous en ligne
<p>Bonjour,</p><p>Je cherchais votre institut et je n'ai trouvé qu'une fiche Google, pas de site. 132 avis, 4,7 étoiles, mais rien à vous sur Google.</p><p>Je crée des sites pour des instituts de beauté. Je vous esquisse une page d'accueil cette semaine, gratuitement.</p><p>Ça vous dit ?</p>`;

function buildPromptFR(
  p: PromptProspect,
  opts: BuildPromptOpts,
  nicheLabel: string,
  greetingFirstName: string | null,
  factsSection: string,
  presence: SitePresence,
  ratingFact: string | null,
  strongRating: boolean,
): string {
  const contact = [p.kontaktIme, p.kontaktPozicija].filter(Boolean).join(", ") || "Non renseigné";
  const notes = napomenaWithoutRating(p.napomena);
  const hintBlock = opts.nicheHint?.trim()
    ? `\n\nInstructions spécifiques pour le secteur "${nicheLabel}" (à respecter scrupuleusement):\n${opts.nicheHint.trim()}`
    : "";
  const greetingHint = greetingFirstName
    ? `Commence par "Bonjour ${greetingFirstName}," (prénom uniquement, validé par les faits vérifiés).`
    : `Commence par "Bonjour," sans nom inventé.`;
  const siteAngle = siteAngleFR(presence);
  const ratingBlock = ratingFact
    ? `\nNote Google vérifiée : ${ratingFact}.${
        strongRating
          ? ` Note forte : utilise-la comme preuve sociale dans l'accroche, surtout sans vrai site (ex. "${ratingFact}, et personne ne peut vous trouver en ligne").`
          : ` Note moyenne : ne t'en sers que si elle aide, sans l'exagérer.`
      }`
    : "";

  if (opts.compact) {
    return `Génère 5 cold emails pour: ${p.firmaNaziv}, secteur ${nicheLabel}, ${p.grad}. Contact: ${contact}. Site: ${p.website || "Pas de site"}. Description: ${p.opisFirme || "N/A"}. Notes: ${notes || "Aucune"}.${ratingBlock}${factsSection}

${siteAngle}

Types: "initial","follow1","follow2","follow3","breakup" (les 5 doivent vraiment différer d'angle et de CTA ; breakup = clôture légère sans pitch). ${greetingHint} Règles: ouvre sur un fait sur EUX (jamais sur toi), énonce le manque et arrête-toi (ne prédis pas la perte de clients), salutation finissant par une virgule ("Bonjour,"), français parlé, ton premium, balises HTML p/br/strong, max ~75 mots de TEXTE visible par email (breakup 35 max) et termine sur une phrase complète, un seul CTA (maquette gratuite, jamais "en savoir plus"), aucun tiret long (— ou –), jamais de liste de trois, aucun chiffre de résultat avant/après sans case study vérifié, pas de prix, pas de signature à la fin, objets de 3 à 5 mots minuscules.${hintBlock}

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
- Notes opérateur: ${notes || "Aucune"}${ratingBlock}${factsSection}

${siteAngle}

Types à générer (adapte ton et arguments au secteur "${nicheLabel}"):
Les 5 types doivent VRAIMENT différer (angle ET formulation de l'appel à l'action), pas seulement l'objet :
1. "initial" — Accroche = le fait le plus fort sur EUX (score mobile bas, note Google, absence de site). UNE valeur concrète. CTA = PROPOSER la maquette gratuite ("je vous l'envoie ?").
2. "follow1" — Relance brève qui SUPPOSE qu'ils ont vu le 1er email (ex. "je reviens vers vous"). UN angle concret EN PLUS, pas une répétition. Nudge léger, ne re-déroule pas tout le pitch ni la même phrase de CTA.
3. "follow2" — Preuve sociale concrète (case study / mockup / page d'audit si fournis ci-dessus), ou "j'ai commencé à esquisser votre page" puis propose de l'envoyer. Décris au plus DEUX éléments concrets, jamais une liste de trois ("X, Y et Z").
4. "follow3" — Très court : UNE seule question oui/non franche, sans nouvel argument ("c'est un sujet pour vous en ce moment, oui ou non ?").
5. "breakup" — Dernier message, ton léger et SANS pression, AUCUN pitch ni CTA maquette (registre différent des autres). Format : "Bonjour ${greetingFirstName ?? "[Prénom]"}, c'est mon dernier message, aucun souci si ce n'est pas le moment. Dois-je clôturer ou c'est juste un mauvais timing ?" 35 mots max. Objet : 3-5 mots minuscules.

Règles:
- Première phrase = un fait sur EUX, jamais sur toi
- Énonce le manque tel qu'il EST (pas de site, lent sur mobile, page Facebook, invisible sur Google) puis arrête-toi. Ne prédis JAMAIS la conséquence négative ("clients perdus", "il va ailleurs", "il appelle un concurrent", "il ferme la page", "des chantiers perdus"). Nommer le manque est plus fort que prédire la perte.
- Reste sur LEUR situation 1 à 2 phrases avant de dire ce que tu fais ; n'enchaîne pas brutalement sur "je crée / je fais"
- Français impeccable mais parlé, ton premium et direct
- ${greetingHint}
- La salutation finit TOUJOURS par une virgule : "Bonjour," ou "Bonjour Prénom," (jamais "Bonjour" seul, sans virgule)
- Maximum ~75 mots de TEXTE VISIBLE par email (hors balises HTML), breakup 35 max. Termine TOUJOURS sur une phrase complète, ne coupe jamais une idée.
- 5 phrases courtes maximum, lisible en 10 secondes sur mobile
- Un seul appel à l'action : proposer une maquette gratuite ("je vous fais une maquette de votre page d'accueil cette semaine, gratuitement"). Jamais "en savoir plus".
- Corps HTML: balises p, br, strong uniquement
- AUCUN tiret long (— ni –). Virgule ou deux phrases. Les traits d'union normaux (rendez-vous) sont ok.
- JAMAIS de liste de trois (deux éléments maximum) : interdit "simple, lisible et efficace", "moderne, rapide et optimisé". Coupe en deux, ou fais deux phrases.
- Ne cite JAMAIS de chiffre de résultat avant/après (ex. "de 41 à 94") sauf si un case study vérifié est fourni ci-dessus. Sans case study, reste sur une observation générale, sans chiffre inventé.
- Bannis: "à l'ère du numérique", "n'hésitez pas", "dans l'attente de votre réponse", "je reste à votre disposition", "salutations distinguées", "je me permets de vous contacter"
- Pas de prix
- Pas de signature ni nom de société à la fin (la signature est ajoutée automatiquement après ton message)
- Deux lignes d'objet "subject" (A) et "subjectB" (B), 3 à 5 mots (jamais plus de 6), minuscules, comme écrites par un humain pressé
- N'invente AUCUN fait spécifique${hintBlock}

${FEWSHOT_FR}

Return ONLY the JSON array:
[{"tip":"initial","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow1","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow2","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"follow3","subject":"...","subjectB":"...","body":"<p>...</p>"},{"tip":"breakup","subject":"...","subjectB":"...","body":"<p>...</p>"}]`;
}

// ── Dutch ────────────────────────────────────────────────────────────────────

function siteAngleNL(presence: SitePresence): string {
  if (presence === "none")
    return `SITESITUATIE: deze prospect heeft GEEN website. Insteek: ze bestaan (Google, mond-tot-mond) maar hebben geen eigen online aanwezigheid en verschijnen nauwelijks in zoekresultaten. Benoem dit gemis zoals het is, voorspel geen verloren klanten. Je stelt voor een EERSTE echte site te bouwen, niet "vernieuwen".`;
  if (presence === "social")
    return `SITESITUATIE: deze prospect heeft GEEN echte site, alleen een pagina op social (Facebook/Instagram). Insteek: ze zijn afhankelijk van een platform dat hun bereik en regels bepaalt, en ze verschijnen niet in Google-zoekresultaten. Zolang ze geen eigen site hebben, hangt alles aan die pagina; verandert die of verdwijnt die, dan houden ze niets eigens over. Zeg NIET dat ze hun pagina "niet bezitten" (dat is onjuist en klinkt als een trucje): het argument is afhankelijkheid en onvindbaarheid op Google. Je stelt een eigen site voor die van hen is.`;
  return `SITESITUATIE: deze prospect HEEFT AL een site (URL gegeven). Zeg NOOIT, ook niet impliciet, dat ze geen site hebben of dat je "niets vindt": je hebt het over de site VERBETEREN, niet over het ontbreken ervan. GA er ook NIET vanuit dat de site goed is (veel zijn dode Wix-, lege of geparkeerde pagina's): oordeel op de feiten. Als een lage mobiele Lighthouse score (<50) gegeven is, OPEN met dat exacte cijfer ("uw site laadt op 38/100 op mobiel"). Bij een goede of ontbrekende score: prijs de site NIET en verzin GEEN gebrek, maar leun op de Google-score als gemiste kans (zo'n reputatie verdient een site die converteert) of op een concreet geverifieerd signaal.`;
}

const FEWSHOT_NL_JE = `Voorbeelden van STIJL (verzin deze feiten NIET, het gaat om toon, lengte en ritme), in de JE-vorm:

[Geen site, sterke Google-score]
onderwerp: niets gevonden online
<p>Hoi Lisa,</p><p>Ik zocht jullie studio en vond alleen een Google-vermelding, geen site. 96 reviews, 4,8 sterren, maar niets eigens dat dat online laat zien.</p><p>Ik maak sites voor yogastudio's. Ik schets deze week gratis een homepage voor je, gewoon om het effect te zien.</p><p>Zal ik 'm sturen?</p>

[Bestaande site, lage mobiele score]
onderwerp: je site op mobiel
<p>Hoi Tom,</p><p>Ik opende je site op mijn telefoon: 41 op 100 bij de Google-test, de pagina laadt traag op mobiel.</p><p>Ik bouw snelle, strakke sites. Ik maak deze week gratis een mockup van je homepage.</p><p>Zal ik 'm sturen?</p>`;

const FEWSHOT_NL_U = `Voorbeelden van STIJL (verzin deze feiten NIET, het gaat om toon, lengte en ritme), in de U-vorm:

[Bestaande site, lage mobiele score]
onderwerp: uw site op mobiel
<p>Beste meneer Jansen,</p><p>Ik opende de site van Jansen Bouw op mijn telefoon: 41 op 100 bij de Google-test, de pagina laadt traag op mobiel.</p><p>Ik bouw sites voor bouwbedrijven. Ik maak deze week gratis een mockup van uw homepage, snel en strak.</p><p>Zal ik 'm opsturen?</p>

[Geen site]
onderwerp: niets gevonden online
<p>Goedendag,</p><p>Ik zocht uw bedrijf en vond alleen een Google-vermelding, geen eigen site, niets dat in Google verschijnt.</p><p>Ik bouw sites voor technische bedrijven. Ik schets deze week gratis een homepage voor u.</p><p>Zal ik die opsturen?</p>`;

function buildPromptNL(
  p: PromptProspect,
  opts: BuildPromptOpts,
  nicheLabel: string,
  greetingFirstName: string | null,
  factsSection: string,
  presence: SitePresence,
  ratingFact: string | null,
  strongRating: boolean,
): string {
  const contact = [p.kontaktIme, p.kontaktPozicija].filter(Boolean).join(", ") || "Niet ingevuld";
  const notes = napomenaWithoutRating(p.napomena);
  const hintBlock = opts.nicheHint?.trim()
    ? `\n\nSpecifieke instructies voor de sector "${nicheLabel}" (strikt te volgen):\n${opts.nicheHint.trim()}`
    : "";

  const register = nlRegister(p.nisa);
  const isJe = register === "je";
  const greetingHint = greetingFirstName
    ? isJe
      ? `Begin met "Hoi ${greetingFirstName}," (alleen voornaam, gevalideerd door geverifieerde feiten).`
      : `Begin met "Beste ${greetingFirstName}," (alleen voornaam, gevalideerd door geverifieerde feiten).`
    : isJe
      ? `Begin met "Hoi," zonder verzonnen naam.`
      : `Begin met "Goedendag," zonder verzonnen naam.`;
  const registerRule = isJe
    ? `Spreek de prospect aan met JE / JOU / JOUW (informeel, kleine premium zaak). Houd dit CONSEQUENT in alle 5 e-mails.`
    : `Spreek de prospect aan met U / UW (formeel, industrieel/B2B). Houd dit CONSEQUENT in alle 5 e-mails. U-werkwoorden krijgen ALTIJD de -t uitgang: "u wilt", "u bent", "u kunt", "u hebt", "u doet" (nooit "u wil").`;
  const siteAngle = siteAngleNL(presence);
  const fewshot = isJe ? FEWSHOT_NL_JE : FEWSHOT_NL_U;
  const youWord = isJe ? "je" : "u";
  const ratingBlock = ratingFact
    ? `\nGeverifieerde Google-score: ${ratingFact}.${
        strongRating
          ? ` Sterke score: gebruik die als sociaal bewijs in de opening, zeker zonder echte site (bv. "${ratingFact}, en toch kan niemand ${youWord} online vinden").`
          : ` Gemiddelde score: alleen gebruiken als het helpt, niet overdrijven.`
      }`
    : "";

  if (opts.compact) {
    return `Genereer 5 cold emails voor: ${p.firmaNaziv}, sector ${nicheLabel}, ${p.grad}. Contact: ${contact}. Site: ${p.website || "Geen site"}. Beschrijving: ${p.opisFirme || "N/A"}. Notities: ${notes || "Geen"}.${ratingBlock}${factsSection}

${siteAngle}
${registerRule}

Types: "initial","follow1","follow2","follow3","breakup" (de 5 moeten echt verschillen in invalshoek en CTA; breakup = luchtige afsluiter zonder pitch). ${greetingHint} Regels: open met een feit over HEN (nooit over jou), benoem het gemis en stop (voorspel geen verloren klanten), aanhef eindigt op een komma ("Hoi,"), spreektaal Nederlands, premium toon, alleen p/br/strong HTML, max ~75 woorden ZICHTBARE tekst per e-mail (breakup 35) en eindig op een volledige zin, één CTA (gratis mockup, nooit "meer informatie"), geen lange streep (— of –), nooit een drieslag, geen verzonnen voor/na-cijfer zonder geverifieerde case study, geen prijzen, geen handtekening aan het einde, onderwerpen van 3 tot 5 kleine woorden.${hintBlock}

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
- Operator notities: ${notes || "Geen"}${ratingBlock}${factsSection}

${siteAngle}
${registerRule}

Types te genereren (pas toon en argumenten aan op de sector "${nicheLabel}"):
De 5 types moeten ECHT verschillen (invalshoek ÉN formulering van de call-to-action), niet alleen het onderwerp:
1. "initial" — Opening = het sterkste feit over HEN (lage mobiele score, Google-score, geen site). ÉÉN concreet voordeel. CTA = de gratis mockup AANBIEDEN ("zal ik 'm sturen?").
2. "follow1" — Korte opvolging die AANNEEMT dat ze de eerste e-mail zagen (bv. "ik kom hier even op terug"). ÉÉN concrete extra invalshoek, geen herhaling. Lichte nudge, niet de hele pitch of dezelfde CTA-zin opnieuw.
3. "follow2" — Concreet sociaal bewijs (case study / mockup / auditpagina indien hierboven gegeven), of "ik ben je homepage al gaan schetsen" en bied aan die te sturen. Beschrijf hooguit TWEE concrete elementen, nooit een rij van drie ("X, Y en Z").
4. "follow3" — Heel kort: ÉÉN duidelijke ja/nee-vraag, geen nieuw argument ("is dit nu iets voor je, ja of nee?").
5. "breakup" — Laatste bericht, luchtige toon ZONDER druk, GEEN pitch of mockup-CTA (ander register dan de rest). Formaat: "${isJe ? `Hoi ${greetingFirstName ?? "[Voornaam]"}, dit is mijn laatste bericht, geen zorgen als het nu niet uitkomt. Moet ik dit sluiten of is het gewoon verkeerde timing?` : `Beste ${greetingFirstName ?? "[Voornaam]"}, dit is mijn laatste bericht, geen zorgen als het nu niet uitkomt. Moet ik dit sluiten of is het gewoon verkeerde timing?`}" 35 woorden max. Onderwerp: 3-5 kleine letters.

Regels:
- Eerste zin = een feit over HEN, nooit over jou
- Benoem het gemis zoals het IS (geen site, traag op mobiel, alleen een Facebookpagina, onvindbaar op Google) en stop daar. Voorspel NOOIT het gevolg ("verloren klanten", "ze gaan ergens anders heen", "ze bellen een concurrent", "ze klikken weg"). Het gemis benoemen is sterker dan het verlies voorspellen.
- Blijf 1 tot 2 zinnen bij HUN situatie voordat je zegt wat je doet; spring niet meteen naar "ik maak / ik bouw"
- Foutloos maar spreektaal Nederlands, premium en direct
- ${registerRule}
- ${greetingHint}
- De aanhef eindigt ALTIJD op een komma: "Hoi Naam," / "Hoi," / "Goedendag," (nooit "Hoi" of "Goedendag" zonder komma)
- Maximaal ~75 woorden ZICHTBARE tekst per e-mail (zonder HTML-tags), breakup 35 max. Eindig ALTIJD op een volledige zin, kap nooit een gedachte af.
- Maximaal 5 korte zinnen, leesbaar in 10 seconden op mobiel
- Eén call-to-action: een gratis mockup aanbieden ("ik maak deze week gratis een mockup van ${isJe ? "je" : "uw"} homepage"). Nooit "meer informatie".
- HTML body: alleen p, br, strong tags
- GEEN lange streep (— of –). Komma of twee zinnen. Gewone koppeltekens (Google-score) zijn ok.
- NOOIT een drieslag (maximaal twee elementen): verboden "modern, snel en geoptimaliseerd", "openingstijden, foto en kaart". Splits in twee, of maak twee zinnen.
- Noem NOOIT een voor/na-resultaatcijfer (bv. "van 41 naar 94") tenzij hierboven een geverifieerde case study staat. Zonder case study: een algemene observatie zonder verzonnen cijfers.
- Verboden: "in het digitale tijdperk", "aarzel niet om", "in afwachting van ${isJe ? "je" : "uw"} reactie", "ik blijf tot ${isJe ? "je" : "uw"} beschikking", "hoogachtend"
- Nooit prijzen noemen
- Voeg geen handtekening of bedrijfsnaam toe aan het einde (de handtekening wordt automatisch toegevoegd)
- Twee onderwerpregels "subject" (A) en "subjectB" (B), 3 tot 5 kleine woorden (nooit meer dan 6), als door een gehaast mens geschreven
- Verzin GEEN specifieke feiten${hintBlock}

${fewshot}

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
