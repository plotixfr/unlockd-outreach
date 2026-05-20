/**
 * Builds the personalised French email Unlockd sends to anyone who submits
 * their URL to the public /audit widget. The body weaves in the prospect's
 * own Lighthouse score, site signals, and one specific observation — feels
 * like a hand-written audit, not a templated drip.
 *
 * Always falls back to a static template if Claude is unreachable.
 */

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { signatureHtml, signatureText } from "@/lib/signature";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";
import { resendGate } from "@/lib/sendEmail";

const MODEL = "claude-sonnet-4-6";
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL ?? "temim@unlockd.art";
const REPLY_TO = process.env.REPLY_TO_EMAIL ?? FROM_EMAIL;
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://unlockd-outreach.vercel.app";

export interface AuditEmailInput {
  prospectId: string;
  toEmail: string;
  toName: string | null;
  websiteUrl: string;
  siteSnapshot: SiteSnapshot | null;
  pagespeed: PageSpeedSnapshot | null;
}

interface AuditCopy {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

async function generateCopy(input: AuditEmailInput): Promise<AuditCopy | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const facts: string[] = [];
  if (input.siteSnapshot?.ok) {
    if (input.siteSnapshot.title) facts.push(`Title: "${input.siteSnapshot.title}"`);
    if (input.siteSnapshot.h1) facts.push(`H1: "${input.siteSnapshot.h1}"`);
    facts.push(`Plateforme: ${input.siteSnapshot.signals.techHints.join(", ") || "non identifiée"}`);
    facts.push(`Mobile responsive: ${input.siteSnapshot.signals.responsiveViewport ? "oui" : "NON"}`);
    facts.push(`Réservation en ligne: ${input.siteSnapshot.signals.hasReservation ? "oui" : "non"}`);
  }
  if (input.pagespeed?.ok && input.pagespeed.performanceScore !== null) {
    facts.push(`Lighthouse mobile: ${input.pagespeed.performanceScore}/100`);
    if (input.pagespeed.lcpMs) facts.push(`LCP: ${(input.pagespeed.lcpMs / 1000).toFixed(1)}s`);
  }

  const firstName = input.toName?.trim().split(/\s+/)[0] ?? null;
  const greeting = firstName ? `Bonjour ${firstName}` : "Bonjour";

  const prompt = `Tu rédiges l'email d'audit que Unlockd.art (studio web premium parisien) envoie automatiquement à quelqu'un qui a soumis son URL sur notre page d'audit gratuit.

Le ton : chaleureux, précis, premium. Pas commercial. Pas de jargon. L'email doit prouver qu'on a vraiment regardé leur site, pas envoyé un template.

Destinataire :
- Email : ${input.toEmail}
- Nom : ${input.toName || "non communiqué"}
- Site : ${input.websiteUrl}

Faits techniques mesurés (à utiliser tels quels, sans inventer) :
${facts.map((f) => `- ${f}`).join("\n")}

Rédige :
1. "subject" — court (max 60 caractères), avec un fait concret de leur site si possible
2. "bodyHtml" — corps en HTML (balises p, br, strong uniquement). Commence par "${greeting}," puis :
   - 1 phrase qui montre que tu as vraiment regardé leur site (référence à un fait vérifié)
   - 2-3 phrases d'observations CONCRÈTES avec chiffres (si Lighthouse < 50, mentionne-le explicitement)
   - 1 phrase qui propose un échange : "Si vous souhaitez en discuter, je peux vous montrer concrètement ce qui changerait."
   - PAS de "j'espère que vous allez bien", PAS de "n'hésitez pas". Direct.
   - 80-150 mots maximum
   - NE PAS ajouter de signature (ajoutée automatiquement)
3. "bodyText" — version plain-text du même contenu (sans HTML)

Réponds UNIQUEMENT JSON :
{"subject":"...","bodyHtml":"<p>...</p>","bodyText":"..."}`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") return null;
    const raw = block.text.trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(raw.slice(start, end + 1)) as AuditCopy;
  } catch (e) {
    console.warn("[auditEmail] generation failed:", e);
    return null;
  }
}

function fallbackCopy(input: AuditEmailInput): AuditCopy {
  const firstName = input.toName?.trim().split(/\s+/)[0] ?? null;
  const greeting = firstName ? `Bonjour ${firstName}` : "Bonjour";
  const psiLine =
    input.pagespeed?.ok && input.pagespeed.performanceScore !== null
      ? `Votre score Lighthouse mobile est de ${input.pagespeed.performanceScore}/100. Le standard premium se situe au-dessus de 90.`
      : "J'ai regardé votre site en détail.";
  return {
    subject: `Audit de ${input.websiteUrl}`,
    bodyHtml: `<p>${greeting},</p><p>Merci d'avoir soumis votre site pour audit. ${psiLine}</p><p>Si vous souhaitez en discuter concrètement, voici 30 minutes : <a href="https://calendly.com/temim-unlockd/30min">calendly.com/temim-unlockd/30min</a></p>`,
    bodyText: `${greeting},\n\nMerci d'avoir soumis votre site pour audit. ${psiLine}\n\nSi vous souhaitez en discuter concrètement, voici 30 minutes : https://calendly.com/temim-unlockd/30min`,
  };
}

export async function sendAuditEmail(input: AuditEmailInput): Promise<{ ok: boolean; messageId?: string | null; error?: string }> {
  const copy = (await generateCopy(input)) ?? fallbackCopy(input);

  const unsubUrl = `${SITE_URL}/api/unsubscribe/${input.prospectId}`;
  const html = `${copy.bodyHtml}${signatureHtml(input.prospectId)}<p style="font-size:11px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">Vous avez reçu cet email après avoir demandé un audit gratuit sur unlockd.art. <a href="${unsubUrl}" style="color:#999;text-decoration:underline;">Se désabonner</a>.</p>`;
  const text = `${copy.bodyText}\n\n${signatureText(input.prospectId)}\n\nSe désabonner : ${unsubUrl}`;

  await resendGate();
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [input.toEmail],
    replyTo: REPLY_TO,
    subject: copy.subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>, <mailto:${REPLY_TO}?subject=Unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, messageId: data?.id ?? null };
}
