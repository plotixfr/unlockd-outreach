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
  · "Dans l'attente de votre retour"
  · "Je reste à votre disposition"
  · "Très belle journée à vous"
  · "Bien à vous" (sauf si dans le voice profile)
  · "Solution", "valeur ajoutée", "synergie", "écosystème", "ROI" sans contexte
  · "transformer votre business" / "votre business"

- PROSCRITS de structure :
  · Pas d'énumération tricolore corporate ("X, Y et Z" trois fois dans un email)
  · Pas plus d'UN em-dash (—) par email
  · Pas de longues énumérations de bénéfices
  · Pas de "Et si…" rhétorique en ouverture

- À FAIRE pour sembler humain :
  · Une observation très précise au lieu d'une phrase générique
  · Phrases courtes alternées avec une plus longue de temps en temps
  · Un mot direct, parfois familier (jamais vulgaire)
  · Quand on cite un fait sur leur site, citer LITTÉRALEMENT (entre guillemets si possible)
  · Ne pas annoncer ce qu'on va dire — le dire`;

/**
 * Returns the full style guide block to inject into the system prompt of any
 * email-generating call. Combines the operator-specific voice (if extracted)
 * with the always-on anti-AI guardrails. Returns just the guardrails when
 * no voice has been configured yet.
 */
export async function buildVoiceGuideForPrompt(): Promise<string> {
  const voice = await getActiveVoice();
  if (!voice) return ANTI_AI_GUARDRAILS;
  return `${voice.styleDescription}\n\n${ANTI_AI_GUARDRAILS}`;
}
