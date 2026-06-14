/**
 * "Don't sound like AI" — the operator pastes 3-5 of their own real outreach
 * emails (ideally ones that landed meetings) and Claude extracts a style
 * fingerprint. Every subsequent generated email reads in that voice.
 *
 * What we extract:
 *   - Sentence rhythm (long vs. short, paragraph length)
 *   - Opener patterns ("Bonjour X," vs. "X,", vs. punchy)
 *   - Sign-off patterns
 *   - French idioms / fillers the operator actually uses
 *   - Punctuation tendencies (em-dashes, ellipses, colons)
 *   - Subject-line tells
 *
 * What we explicitly ban (anti-AI guardrails injected into every prompt):
 *   - "Permettez-moi de me présenter"
 *   - "N'hésitez pas à"
 *   - "J'espère que vous allez bien"
 *   - "Dans l'attente de votre retour"
 *   - "Je me permets de vous contacter"
 *   - Heavy em-dash use
 *   - Tricolon constructions ("X, Y et Z")
 *   - Corporate buzzwords ("solution", "synergie", "valeur ajoutée")
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const MODEL_EXTRACT = "claude-sonnet-4-6";

export interface ExtractedStyle {
  oneLine: string;
  openerPatterns: string[];
  signoffPatterns: string[];
  idioms: string[];
  rhythmNote: string;
  vocabularyHits: string[];
  vocabularyMisses: string[];
}

/**
 * Cached single-row voice profile. We treat the most recently updated active
 * row as the "current voice" — there's only one operator so we don't need a
 * proper multi-tenant lookup. Returns null when not yet configured; the
 * email prompt then falls back to its default tone.
 */
export async function getActiveVoice(): Promise<{ styleDescription: string } | null> {
  const row = await prisma.operatorVoice.findFirst({
    where: { active: true },
    orderBy: { updatedAt: "desc" },
  });
  return row ? { styleDescription: row.styleDescription } : null;
}

/**
 * Extract a tight style guide from the operator's real emails. We ask Claude
 * to focus on actionable patterns — what to imitate, what to avoid — rather
 * than vague adjectives. The result is short enough to inject in every email
 * prompt without bloating tokens.
 */
export async function extractStyle(samples: string[]): Promise<ExtractedStyle | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (samples.length === 0) return null;

  const numbered = samples
    .map((s, i) => `--- ÉCHANTILLON ${i + 1} ---\n${s.trim()}`)
    .join("\n\n");

  const prompt = `Tu analyses ${samples.length} emails RÉELS écrits par Temim Turkusic (CEO, Unlockd.art, studio web premium parisien). Ton travail : extraire son style assez précisément pour qu'un autre rédacteur puisse imiter sa voix sans qu'on le remarque.

Concentre-toi sur des observations ACTIONNABLES :
- Comment ouvre-t-il un email (avec ou sans "Bonjour", longueur première phrase, accroche directe ou contextuelle)
- Comment signe-t-il (sec, chaleureux, ouvert)
- Quelles tournures / idiomes / fillers reviennent
- Rythme : phrases courtes/longues, paragraphes courts/denses, ponctuation préférée
- Mots qu'il utilise visiblement (à imiter)
- Mots qui ne lui ressemblent PAS et qu'on doit éviter

ÉCHANTILLONS :
${numbered}

Réponds UNIQUEMENT en JSON :
{
  "oneLine": "Une seule phrase qui capture sa voix (max 25 mots, en français)",
  "openerPatterns": ["pattern 1 (exemple court)", "pattern 2", ...],
  "signoffPatterns": ["..."],
  "idioms": ["expression qu'il utilise réellement", "..."],
  "rhythmNote": "Une phrase sur son rythme (court/long/mixte, ponctuation)",
  "vocabularyHits": ["mots/phrases caractéristiques à conserver"],
  "vocabularyMisses": ["mots/phrases corporate à éviter qui ne lui ressemblent pas"]
}`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: MODEL_EXTRACT,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") return null;
    const raw = block.text.trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(raw.slice(start, end + 1)) as ExtractedStyle;
  } catch (e) {
    console.warn("[voiceProfile] extraction failed:", e);
    return null;
  }
}

/**
 * Builds the human-readable style guide that gets injected verbatim into
 * every email-generation system prompt. The "anti-AI guardrails" are fixed
 * (we ban the same templated phrases regardless of operator voice).
 */
export function buildStyleDescription(extracted: ExtractedStyle): string {
  const parts: string[] = [];
  parts.push(`Voix de Temim, en une phrase : ${extracted.oneLine}`);
  if (extracted.rhythmNote) parts.push(`Rythme : ${extracted.rhythmNote}`);
  if (extracted.openerPatterns.length) {
    parts.push(`Ouvertures qu'il utilise : ${extracted.openerPatterns.map((p) => `« ${p} »`).join(", ")}`);
  }
  if (extracted.signoffPatterns.length) {
    parts.push(`Sign-offs qu'il utilise : ${extracted.signoffPatterns.map((p) => `« ${p} »`).join(", ")}`);
  }
  if (extracted.idioms.length) {
    parts.push(`Idiomes / tournures à conserver : ${extracted.idioms.map((p) => `« ${p} »`).join(", ")}`);
  }
  if (extracted.vocabularyHits.length) {
    parts.push(`Mots qui sonnent comme lui : ${extracted.vocabularyHits.join(", ")}`);
  }
  if (extracted.vocabularyMisses.length) {
    parts.push(`Mots qui ne lui ressemblent PAS (à éviter absolument) : ${extracted.vocabularyMisses.join(", ")}`);
  }
  return parts.join("\n");
}

/**
 * Fixed anti-AI guardrails — banned phrases that scream "this is automated":
 * cliché openers, corporate filler, em-dash overdose, tricolon constructions.
 * Injected into every email prompt regardless of whether a voice profile is set.
 */
export const ANTI_AI_GUARDRAILS = `Règles strictes pour ne JAMAIS ressembler à un email automatisé :

- INTERDICTIONS ABSOLUES (formulations templates qui trahissent l'IA) :
  · "Permettez-moi de me présenter"
  · "Je me permets de vous contacter"
  · "J'espère que vous allez bien" / "Tout d'abord, j'espère que…"
  · "N'hésitez pas à"
  · "Dans l'attente de votre retour" / "Dans l'attente de votre réponse"
  · "Je reste à votre disposition"
  · "N'hésitez pas à"
  · "À l'ère du numérique" / "à l'heure du digital"
  · "Salutations distinguées" / "Cordialement," seul comme sign-off cliché
  · "Très belle journée à vous"
  · "Bien à vous" (sauf si dans le voice profile)
  · "Solution", "valeur ajoutée", "synergie", "écosystème", "ROI" sans contexte
  · "transformer votre business" / "votre business"

- PROSCRITS de structure :
  · Pas d'énumération tricolore corporate ("X, Y et Z" trois fois dans un email ; ex. interdit : "moderne, rapide et optimisé")
  · AUCUN tiret long, jamais : ni cadratin (—) ni demi-cadratin (–). Une virgule ou deux phrases à la place. Les traits d'union normaux (rendez-vous) restent autorisés.
  · Pas de longues énumérations de bénéfices
  · Pas de "Et si…" rhétorique en ouverture

- À FAIRE pour sembler humain :
  · Une observation très précise au lieu d'une phrase générique
  · Phrases courtes alternées avec une plus longue de temps en temps
  · Un mot direct, parfois familier (jamais vulgaire)
  · Quand on cite un fait sur leur site, citer LITTÉRALEMENT (entre guillemets si possible)
  · Ne pas annoncer ce qu'on va dire, le dire`;

/**
 * Dutch counterpart of {@link ANTI_AI_GUARDRAILS}. NL prospects used to get the
 * French guardrails verbatim (the only set that existed), which leaked French
 * instructions into Dutch generations. These mirror the FR bans in Dutch.
 */
export const ANTI_AI_GUARDRAILS_NL = `Strikte regels om NOOIT op een geautomatiseerde e-mail te lijken:

- ABSOLUUT VERBODEN (templateformuleringen die AI verraden):
  · "Mag ik me even voorstellen"
  · "Ik neem de vrijheid om contact op te nemen"
  · "Ik hoop dat het goed met u/je gaat"
  · "Aarzel niet om"
  · "In afwachting van uw/je reactie"
  · "Ik blijf tot uw beschikking"
  · "In het digitale tijdperk" / "in deze digitale wereld"
  · "Hoogachtend" als clichématige afsluiter
  · "Oplossing", "toegevoegde waarde", "synergie", "ecosysteem", "ROI" zonder context
  · "uw business transformeren"

- VERBODEN qua structuur:
  · Geen corporate drieslag ("X, Y en Z" drie keer in één e-mail; verboden voorbeeld: "modern, snel en geoptimaliseerd")
  · GEEN lange streep, nooit: niet de em-streep (—) en niet de en-streep (–). Een komma of twee zinnen in plaats daarvan. Gewone koppeltekens (Google-score) blijven toegestaan.
  · Geen lange opsommingen van voordelen
  · Geen retorische "Wat als…" als opening

- OM MENSELIJK TE KLINKEN:
  · Eén heel precieze observatie in plaats van een generieke zin
  · Korte zinnen, af en toe afgewisseld met een langere
  · Direct, soms informeel taalgebruik (nooit vulgair)
  · Een feit van hun site LETTERLIJK citeren (tussen aanhalingstekens indien mogelijk)
  · Niet aankondigen wat je gaat zeggen, het gewoon zeggen`;

const GUARDRAILS_BY_LANG: Record<string, string> = {
  fr: ANTI_AI_GUARDRAILS,
  nl: ANTI_AI_GUARDRAILS_NL,
};

/**
 * Returns the full style guide block to inject into the system prompt of any
 * email-generating call. Combines the operator-specific voice (if extracted)
 * with the always-on anti-AI guardrails in the prospect's language. Returns
 * just the guardrails when no voice has been configured yet.
 */
export async function buildVoiceGuideForPrompt(lang: string | null = "fr"): Promise<string> {
  const guardrails = GUARDRAILS_BY_LANG[lang === "nl" ? "nl" : "fr"];
  const voice = await getActiveVoice();
  if (!voice) return guardrails;
  return `${voice.styleDescription}\n\n${guardrails}`;
}
