/**
 * Server-side email signature. Appended after the AI body so the model can't
 * forget it, drop it, or "improve" it. Kept as table-based HTML for Gmail /
 * Outlook compatibility. Phone and Calendly link are clickable.
 *
 * Localized per prospect language (fr, nl). The CTA link wording differs but
 * the underlying URL is the same Calendly slot.
 */

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://unlockd-outreach.vercel.app";

export const SENDER_NAME = "Temim Turkusic";
export const SENDER_TITLE = "CEO";
export const SENDER_COMPANY = "Unlockd.art";
export const SENDER_PHONE_HUMAN = "+33 6 89 96 71 51";
export const SENDER_PHONE_TEL = "+33689967151";
export const SENDER_CALENDLY = "https://calendly.com/temim-unlockd/30min";
export const SENDER_SITE = "https://unlockd.art";

export type Lang = "fr" | "nl";

const BOOK_LABEL: Record<Lang, string> = {
  fr: "Réserver un échange (30 min)",
  nl: "Plan een gesprek (30 min)",
};

function calendlyLink(prospectId: string | null): string {
  if (!prospectId) return SENDER_CALENDLY;
  return `${SITE_URL}/api/track/calendly/${prospectId}`;
}

function normalizeLang(lang: string | null | undefined): Lang {
  return lang === "nl" ? "nl" : "fr";
}

export function signatureHtml(prospectId: string | null = null, lang: string | null = null): string {
  const calendly = calendlyLink(prospectId);
  const bookLabel = BOOK_LABEL[normalizeLang(lang)];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr>
    <td style="padding-top:14px;border-top:1px solid #e5e5e5;font-size:14px;color:#222;line-height:1.5;">
      <div style="font-weight:600;color:#0a0a0a;">${SENDER_NAME}</div>
      <div style="margin-top:2px;color:#666;font-size:13px;">${SENDER_TITLE} · <a href="${SENDER_SITE}" style="color:#666;text-decoration:none;">${SENDER_COMPANY}</a></div>
      <div style="margin-top:10px;font-size:13px;color:#444;">
        <a href="tel:${SENDER_PHONE_TEL}" style="color:#444;text-decoration:none;">${SENDER_PHONE_HUMAN}</a>
        &nbsp;·&nbsp;
        <a href="${calendly}" style="color:#1a73e8;text-decoration:none;">${bookLabel}</a>
      </div>
    </td>
  </tr>
</table>`;
}

export function signatureText(prospectId: string | null = null, lang: string | null = null): string {
  const bookLabel = BOOK_LABEL[normalizeLang(lang)];
  return [
    "—",
    SENDER_NAME,
    `${SENDER_TITLE} · ${SENDER_COMPANY}`,
    SENDER_PHONE_HUMAN,
    `${bookLabel}: ${calendlyLink(prospectId)}`,
  ].join("\n");
}
