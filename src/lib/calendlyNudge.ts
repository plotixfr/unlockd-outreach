/**
 * Calendly-nudge generator.
 *
 * Fires for prospects who clicked the Calendly link in our outreach but
 * didn't complete a booking. The signal is "interested but uncommitted" —
 * the highest-yield warm state we get and the most time-sensitive
 * (24-72h after click is when this is worth doing).
 *
 * The email's job is NOT to re-pitch and NOT to acknowledge the click
 * (creepy). It's to lower the friction that stopped them — either by
 * offering an async-only alternative (no calendar needed) or by demonstrating
 * a specific observation about their business that signals "we already
 * understand you".
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

export interface NudgeProspect {
  firmaNaziv: string;
  kontaktIme: string | null;
  nisa: string;
  grad: string;
  website: string | null;
  napomena: string | null;
  qualityNote: string | null;
}

export interface NudgeLastEmail {
  subject: string;
  body: string;
  poslatAt: Date | null;
  tip: string;
}

export interface GeneratedNudge {
  subject: string;
  body: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractJsonObject(raw: string): string | null {
  // Strip code fences if Claude wrapped the response.
  const stripped = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return stripped.slice(start, end + 1);
}

export async function generateNudgeEmail(
  prospect: NudgeProspect,
  lastEmail: NudgeLastEmail | null
): Promise<GeneratedNudge | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const anthropic = new Anthropic({ apiKey });
  const firstName = prospect.kontaktIme?.split(/\s+/)[0] ?? null;
  const lastSubject = lastEmail?.subject ?? "notre échange";
  const cleanSubject = lastSubject.replace(/^re:\s*/i, "");
  const lastBodyExcerpt = lastEmail ? stripHtml(lastEmail.body).slice(0, 1500) : "";

  const userPrompt = `Tu écris un email de SUITE à ${prospect.firmaNaziv} (${prospect.nisa} à ${prospect.grad}).

Le prospect a vu ton dernier email mais n'a pas encore engagé une discussion concrète. Objectif: maximiser la chance qu'il réponde, sans pression et sans répéter ce qu'on a déjà dit.

CONTEXTE PROSPECT:
- Site: ${prospect.website ?? "n/c"}
- Notes: ${prospect.napomena ?? "n/c"}
${prospect.qualityNote ? `- Observation produit/marché: ${prospect.qualityNote}` : ""}

DERNIER EMAIL ENVOYÉ (sujet: "${lastSubject}"):
${lastBodyExcerpt}

INSTRUCTIONS STRICTES:
- 50-90 mots MAX dans le body
- Salutation: "${firstName ? `${firstName},` : "Bonjour,"}" ou rien si l'enchaînement coule
- ne PAS dire qu'ils ont cliqué/vu/regardé/consulté quoi que ce soit
- ne PAS écrire "petit rappel", "je voulais m'assurer", "je reviens vers vous", "avez-vous eu l'occasion"
- ne PAS re-pitcher ce qui est déjà dans le dernier email
- ne PAS demander de booker Calendly directement

CE QU'IL FAUT FAIRE — choisis UNE seule approche:
A) Une observation SPÉCIFIQUE et utile sur leur site/business (montre que tu as regardé), suivie d'une porte douce: "Si ça vous intéresse, je peux développer en 3-4 lignes par retour".
B) Une mini-question PRÉCISE qui les oblige à répondre en 1 phrase (et ouvre la conversation).
C) Une offre alternative au calendrier: "Si le calendrier n'est pas pratique, je peux vous envoyer un mini-audit écrit (5 min)".

Préfère A si tu peux trouver une observation concrète dans les données. Sinon C. B en dernier recours.

Le corps doit pouvoir s'insérer dans le thread existant — pas de "Bonjour ${prospect.firmaNaziv}", pas de présentation de Unlockd (ils savent).

Renvoie STRICTEMENT ce JSON (pas de markdown, pas de commentaire):
{"subject": "Re: ${cleanSubject}", "body": "<p>...</p><p>...</p>"}`;

  let message;
  try {
    message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 800,
      system:
        "Tu es Temim, fondateur de Unlockd Studio. Tu écris des emails B2B premium en français, courts, factuels, sans formules pompeuses. Ton: humain et direct, comme un expert qui pose une question intéressante.",
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (e) {
    console.error("[calendlyNudge] Anthropic call failed:", e);
    return null;
  }

  const block = message.content[0];
  if (!block || block.type !== "text") return null;
  const json = extractJsonObject(block.text);
  if (!json) {
    console.warn("[calendlyNudge] no JSON object in response");
    return null;
  }

  try {
    const parsed = JSON.parse(json) as { subject?: unknown; body?: unknown };
    if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
      console.warn("[calendlyNudge] parsed JSON missing subject/body");
      return null;
    }
    // Safety net: force "Re:" prefix so threading lands correctly even if
    // Claude drops it.
    const subject = /^re:\s/i.test(parsed.subject) ? parsed.subject : `Re: ${parsed.subject}`;
    return { subject, body: parsed.body };
  } catch (e) {
    console.warn("[calendlyNudge] JSON parse failed:", e);
    return null;
  }
}
