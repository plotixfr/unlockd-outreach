/**
 * Reads each new prospect reply and:
 *   1. Classifies it (Interested / NotNow / WrongPerson / OutOfOffice /
 *      AutoReply / Unsubscribe / Question / Negative)
 *   2. Drafts a French response in Temim's tone, ready to be reviewed and
 *      sent. The operator opens the prospect, edits if needed, and sends.
 *
 * Saves the user the cognitive cost of context-switching back into French
 * cold-email mode for every reply — and the speed-to-reply matters more than
 * almost anything else when a prospect is currently interested.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";

export type ReplyCategory =
  | "Interested"
  | "NotNow"
  | "WrongPerson"
  | "OutOfOffice"
  | "AutoReply"
  | "Unsubscribe"
  | "Question"
  | "Negative";

export interface ReplyAnalysis {
  classification: ReplyCategory;
  draft: string;
  note: string;
}

export interface ReplyContext {
  prospectName: string;
  niche: string;
  city: string;
  contactFirstName: string | null;
  originalSubject: string | null;
  originalBody: string | null;
  replyBody: string;
}

function buildPrompt(ctx: ReplyContext): string {
  return `Tu es Temim Turkusic, fondateur d'Unlockd.art (studio web premium parisien). Un prospect t'a répondu à ta séquence cold email. Tu dois :
1. Classer la réponse dans UNE des catégories suivantes
2. Rédiger un draft de réponse en français, dans ton ton (chaleureux, direct, premium, jamais commercial)

Catégories :
- "Interested" — il/elle veut en savoir plus, parler, voir un exemple, ou prendre rdv
- "NotNow" — pas le bon moment mais ouvert plus tard
- "WrongPerson" — pas le bon contact, redirige vers quelqu'un d'autre
- "OutOfOffice" — auto-reply de congés/absence
- "AutoReply" — autre auto-reply (réception confirmée, etc.) — pas un humain
- "Unsubscribe" — demande explicite de ne plus être contacté
- "Question" — pose une question précise (prix, timing, références, scope)
- "Negative" — refuse sans détour, agressif ou clairement pas intéressé

Le draft doit :
- Commencer par "Bonjour ${ctx.contactFirstName || "[Prénom]"},"
- Faire 60–120 mots max
- Ne JAMAIS donner de prix dans le draft (Temim discute toujours prix en visio)
- Pour "Interested" → proposer un échange de 30 min, mentionner Calendly
- Pour "NotNow" → confirmer la note pour relancer dans 2-3 mois, rester chaleureux
- Pour "WrongPerson" → remercier, demander politement le bon contact
- Pour "Question" → répondre à la question si possible, sinon proposer un appel
- Pour "Negative" → un message court de remerciement et fermer poliment
- Pour "OutOfOffice"/"AutoReply"/"Unsubscribe" → laisser le draft vide ("")
- N'ajoute PAS de signature à la fin (elle est ajoutée automatiquement)

Réponse UNIQUEMENT en JSON, sans markdown :
{"classification":"Interested","draft":"Bonjour ...","note":"très brève raison en bosniaque (max 80 chars)"}

Contexte du prospect :
- Entreprise : ${ctx.prospectName}
- Secteur : ${ctx.niche}
- Ville : ${ctx.city}
- Contact connu : ${ctx.contactFirstName || "(inconnu)"}

Email original envoyé (sujet : "${ctx.originalSubject ?? "?"}") :
${ctx.originalBody?.slice(0, 1500) ?? "(non disponible)"}

RÉPONSE DU PROSPECT (à classer et à laquelle répondre) :
${ctx.replyBody.slice(0, 3000)}`;
}

export async function analyzeReply(ctx: ReplyContext): Promise<ReplyAnalysis | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const anthropic = new Anthropic({ apiKey });
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      messages: [{ role: "user", content: buildPrompt(ctx) }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") return null;
    const raw = block.text.trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      classification?: string;
      draft?: string;
      note?: string;
    };
    const validCategories: ReplyCategory[] = [
      "Interested",
      "NotNow",
      "WrongPerson",
      "OutOfOffice",
      "AutoReply",
      "Unsubscribe",
      "Question",
      "Negative",
    ];
    const cls = validCategories.includes(parsed.classification as ReplyCategory)
      ? (parsed.classification as ReplyCategory)
      : "Question";
    return {
      classification: cls,
      draft: typeof parsed.draft === "string" ? parsed.draft.trim() : "",
      note: typeof parsed.note === "string" ? parsed.note.trim().slice(0, 200) : "",
    };
  } catch (e) {
    console.warn("[replyClassifier] failed:", e);
    return null;
  }
}

/**
 * Decides what to do to the prospect record based on classification.
 * Returns the prospect-update payload (status, dates, reminder etc.) or null
 * for "leave alone".
 */
export function prospectActionFor(cls: ReplyCategory, receivedAt: Date): {
  status?: string;
  datumOdgovora?: Date | null;
  podsjetnikDatum?: Date | null;
  podsjetnikNapomena?: string | null;
} | null {
  switch (cls) {
    case "Interested":
    case "Question":
      return { status: "Replied", datumOdgovora: receivedAt };
    case "Negative":
    case "Unsubscribe":
      return { status: "Unsubscribed" };
    case "NotNow":
      // Pause campaign, set a reminder in ~90 days.
      return {
        status: "Replied",
        datumOdgovora: receivedAt,
        podsjetnikDatum: new Date(receivedAt.getTime() + 90 * 86400000),
        podsjetnikNapomena: "Reaktivacija — prospect je rekao 'možda kasnije'",
      };
    case "WrongPerson":
      return {
        status: "Replied",
        datumOdgovora: receivedAt,
        podsjetnikNapomena: "Pogrešna osoba — pronaći pravi kontakt",
      };
    case "OutOfOffice":
    case "AutoReply":
      // Don't move the prospect — they haven't actually engaged.
      return null;
    default:
      return null;
  }
}
