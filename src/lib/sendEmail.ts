import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { signatureHtml, signatureText } from "@/lib/signature";

/**
 * Returns a thum.io screenshot URL for the prospect's site. We use thum.io's
 * unauthenticated tier — they cache by URL, so opens of the same email don't
 * re-render. Returns null when the site URL is missing or malformed.
 */
function siteScreenshotUrl(siteUrl: string | null | undefined): string | null {
  if (!siteUrl) return null;
  try {
    // thum.io ignores protocol if missing; we still pass a clean URL.
    const u = new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`);
    return `https://image.thum.io/get/png/width/600/${u.toString()}`;
  } catch {
    return null;
  }
}


const resend = new Resend(process.env.RESEND_API_KEY);
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://unlockd-outreach.vercel.app";
const FROM_EMAIL = process.env.FROM_EMAIL ?? "temim@unlockd.art";
const REPLY_TO = process.env.REPLY_TO_EMAIL ?? FROM_EMAIL;
const BCC_EMAIL = process.env.BCC_EMAIL ?? "temim.fr@gmail.com";
export const DAILY_SEND_CAP = Number(process.env.DAILY_SEND_CAP ?? 30);

type StatusField =
  | "datumPrvogMaila"
  | "datumFollowUp1"
  | "datumFollowUp2"
  | "datumFollowUp3";

export const TIP_TO_STATUS: Record<string, { status: string; field: StatusField }> = {
  initial: { status: "Emailed", field: "datumPrvogMaila" },
  follow1: { status: "Follow1", field: "datumFollowUp1" },
  follow2: { status: "Follow2", field: "datumFollowUp2" },
  follow3: { status: "Follow3", field: "datumFollowUp3" },
};

/**
 * Builds the final HTML body sent to Resend.
 * - The signature is appended server-side so the AI can't drop or "improve" it.
 * - Open-tracking pixel is only added to the initial send (follow-ups in the
 *   same thread don't need a second pixel; multiple pixels are a spam signal).
 * - Unsubscribe footer is included on every send (legal + List-Unsubscribe
 *   header pairing for RFC 8058 one-click).
 */
function buildHtml(
  body: string,
  emailId: string,
  prospectId: string,
  opts: { includePixel: boolean; siteUrl?: string | null; includeScreenshot: boolean }
): string {
  const pixel = opts.includePixel
    ? `<img src="${SITE_URL}/api/track/open/${emailId}" width="1" height="1" style="display:none;border:0;outline:none;" alt="" />`
    : "";
  const unsubscribe = `<p style="font-size:11px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">Si vous ne souhaitez plus recevoir nos messages, <a href="${SITE_URL}/api/unsubscribe/${prospectId}" style="color:#999;text-decoration:underline;">cliquez ici pour vous désabonner</a>.</p>`;

  // Inline site screenshot — only on the initial email. A visual reminder of
  // their current site, sitting just below the message, dramatically lifts
  // reply rate in our tests vs. a pure-text email.
  const screenshotUrl = opts.includeScreenshot ? siteScreenshotUrl(opts.siteUrl) : null;
  const screenshotBlock = screenshotUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;border-collapse:collapse;">
  <tr>
    <td style="padding:12px;background:#f7f7f7;border:1px solid #e5e5e5;border-radius:8px;">
      <a href="${opts.siteUrl}" style="text-decoration:none;">
        <img src="${screenshotUrl}" alt="${opts.siteUrl}" width="560" style="display:block;max-width:100%;height:auto;border-radius:4px;border:1px solid #e5e5e5;" />
      </a>
      <p style="margin:8px 0 0;font-size:11px;color:#888;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">Aperçu actuel : <a href="${opts.siteUrl}" style="color:#888;text-decoration:underline;">${opts.siteUrl}</a></p>
    </td>
  </tr>
</table>`
    : "";

  return body + screenshotBlock + signatureHtml(prospectId) + pixel + unsubscribe;
}

/**
 * Plain-text body, paired with the HTML one. Resend sends both as a multipart
 * message — having a real text/plain part materially improves Gmail Inbox
 * placement vs. HTML-only.
 */
function buildText(body: string, prospectId: string): string {
  const text = htmlToText(body);
  return [
    text,
    "",
    signatureText(prospectId),
    "",
    `Désabonnement : ${SITE_URL}/api/unsubscribe/${prospectId}`,
  ].join("\n");
}

function htmlToText(html: string): string {
  return html
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/?(p|div|li|h\d)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Common headers that improve deliverability: List-Unsubscribe + the
 * One-Click variant (RFC 8058), Auto-Submitted to signal automated context,
 * and a stable X-Mailer for diagnostics.
 */
function deliverabilityHeaders(prospectId: string): Record<string, string> {
  const unsubUrl = `${SITE_URL}/api/unsubscribe/${prospectId}`;
  return {
    "List-Unsubscribe": `<${unsubUrl}>, <mailto:${REPLY_TO}?subject=Unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "X-Entity-Ref-ID": prospectId,
  };
}

/**
 * After a successful send, ask Resend for the RFC822 Message-ID it stamped on
 * the email so we can use it as In-Reply-To on later follow-ups. The typed SDK
 * doesn't expose message_id on the outbound GetEmailResponse, so we hit the
 * REST endpoint directly and read the field. Best-effort: any failure returns
 * null so the send still succeeds.
 */
async function fetchMessageId(resendId: string): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://api.resend.com/emails/${resendId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { message_id?: string; headers?: Record<string, string> | null };
    if (typeof json.message_id === "string" && json.message_id) return json.message_id;
    // Some Resend responses surface it under headers["Message-ID"]
    const fromHeader = json.headers?.["Message-ID"] ?? json.headers?.["message-id"];
    return typeof fromHeader === "string" ? fromHeader : null;
  } catch (e) {
    console.warn("[sendEmail] fetchMessageId failed:", e);
    return null;
  }
}

/**
 * For follow-up sends, returns the RFC822 Message-ID of the prospect's
 * initial email — used to thread the reply in Gmail/Outlook. Null when the
 * initial hasn't been sent yet or message_id wasn't captured.
 */
async function lookupInitialThread(prospectId: string): Promise<{ messageId: string; subject: string } | null> {
  const initial = await prisma.email.findFirst({
    where: { prospectId, tip: "initial", poslat: true, messageId: { not: null } },
    select: { messageId: true, subject: true, subjectB: true, activeSubject: true },
  });
  if (!initial?.messageId) return null;
  const subject =
    initial.activeSubject === "B" && initial.subjectB ? initial.subjectB : initial.subject;
  return { messageId: initial.messageId, subject };
}

export async function sendOneEmail(
  emailId: string
): Promise<{ ok: boolean; error?: string; resendId?: string | null }> {
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { prospect: true },
  });
  if (!email) return { ok: false, error: "Email nije pronađen" };
  if (email.poslat) return { ok: true, resendId: email.resendId };

  const isInitial = email.tip === "initial";
  const baseSubject =
    email.activeSubject === "B" && email.subjectB ? email.subjectB : email.subject;

  const html = buildHtml(email.body, email.id, email.prospect.id, {
    includePixel: isInitial,
    siteUrl: email.prospect.website,
    includeScreenshot: isInitial && !!email.prospect.website,
  });
  const text = buildText(email.body, email.prospect.id);

  // Threading: follow-ups attach to the initial's Message-ID and reuse "Re: <subject>"
  let subjectToSend = baseSubject;
  const headers: Record<string, string> = deliverabilityHeaders(email.prospect.id);
  if (!isInitial) {
    const thread = await lookupInitialThread(email.prospectId);
    if (thread) {
      headers["In-Reply-To"] = thread.messageId;
      headers["References"] = thread.messageId;
      // Don't re-add "Re:" if the user already prefixed it on the AI side
      subjectToSend = /^re:\s/i.test(baseSubject) ? baseSubject : `Re: ${thread.subject}`;
    }
  }

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [email.prospect.email],
    bcc: [BCC_EMAIL],
    replyTo: REPLY_TO,
    subject: subjectToSend,
    html,
    text,
    headers,
  });
  if (error) return { ok: false, error: error.message };

  const now = new Date();
  const mapping = TIP_TO_STATUS[email.tip];
  // Best-effort: capture the RFC822 Message-ID so follow-ups can thread.
  // Only worth doing for the initial — follow-ups don't need their own.
  let messageId: string | null = null;
  if (isInitial && data?.id) {
    messageId = await fetchMessageId(data.id);
  }

  await prisma.email.update({
    where: { id: emailId },
    data: {
      poslat: true,
      poslatAt: now,
      resendId: data?.id ?? null,
      ...(messageId ? { messageId } : {}),
    },
  });
  if (mapping) {
    await prisma.prospect.update({
      where: { id: email.prospectId },
      data: { status: mapping.status, [mapping.field]: now },
    });
  }
  return { ok: true, resendId: data?.id ?? null };
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Returns true if "now" is within business hours in Europe/Paris (Mon–Fri 08:00–18:00).
 * Used to skip automated follow-up sends on weekends and outside working hours so
 * cold emails don't land at 4am Sunday.
 */
function isBusinessHoursParis(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const hour = parseInt(hourStr, 10);
  const isWeekend = weekday === "Sat" || weekday === "Sun";
  return !isWeekend && hour >= 8 && hour < 18;
}

async function emailsSentTodayCount(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return prisma.email.count({ where: { poslat: true, poslatAt: { gte: start } } });
}

export interface DueResult {
  rule: string;
  sent: number;
  skipped: number;
  errors: string[];
}

const FOLLOWUP_RULES = [
  {
    requiredStatus: "Emailed",
    scheduledDateField: "scheduledFollow1" as const,
    relativeDateField: "datumPrvogMaila" as const,
    relativeDaysWait: 4,
    emailTip: "follow1",
  },
  {
    requiredStatus: "Follow1",
    scheduledDateField: "scheduledFollow2" as const,
    relativeDateField: "datumFollowUp1" as const,
    relativeDaysWait: 5,
    emailTip: "follow2",
  },
  {
    requiredStatus: "Follow2",
    scheduledDateField: "scheduledFollow3" as const,
    relativeDateField: "datumFollowUp2" as const,
    relativeDaysWait: 7,
    emailTip: "follow3",
  },
] as const;

export async function processDueEmails(opts?: {
  onlyProspectIds?: string[];
  concurrency?: number;
  enforceBusinessHours?: boolean;
  cap?: number;
}): Promise<{ totalSent: number; totalSkipped: number; capRemaining: number; results: DueResult[] }> {
  const now = new Date();
  const concurrency = opts?.concurrency ?? 5;
  const cap = opts?.cap ?? DAILY_SEND_CAP;
  const enforceBusinessHours = opts?.enforceBusinessHours ?? false;
  const prospectFilter = opts?.onlyProspectIds
    ? { id: { in: opts.onlyProspectIds } }
    : {};
  const results: DueResult[] = [];

  if (enforceBusinessHours && !isBusinessHoursParis(now)) {
    console.log("[processDueEmails] outside Paris business hours — skipping");
    return { totalSent: 0, totalSkipped: 0, capRemaining: cap, results: [] };
  }

  const sentToday = await emailsSentTodayCount();
  let remaining = Math.max(0, cap - sentToday);

  async function runRule(rule: string, prospects: { id: string; email: string; emails: { id: string }[] }[]) {
    const errors: string[] = [];
    let sent = 0;
    let skipped = 0;

    const eligible = prospects.slice(0, remaining);
    skipped = prospects.length - eligible.length;

    const sendResults = await runWithConcurrency(eligible, concurrency, async (p) => {
      const email = p.emails[0];
      if (!email) return { ok: true } as const;
      const res = await sendOneEmail(email.id);
      if (!res.ok) errors.push(`${p.email}: ${res.error ?? "Greška"}`);
      return res;
    });
    sent = sendResults.filter((r) => r.ok).length;
    remaining = Math.max(0, remaining - sent);
    results.push({ rule, sent, skipped, errors });
  }

  // ── Initial sends ──
  {
    const prospects = await prisma.prospect.findMany({
      where: {
        ...prospectFilter,
        status: "Scheduled",
        scheduledInitial: { lte: now },
        emails: { some: { tip: "initial", poslat: false } },
      },
      select: {
        id: true,
        email: true,
        emails: { where: { tip: "initial", poslat: false }, select: { id: true } },
      },
    });
    await runRule("initial", prospects);
  }

  // ── Follow-ups ──
  for (const rule of FOLLOWUP_RULES) {
    if (remaining <= 0) {
      results.push({ rule: rule.emailTip, sent: 0, skipped: 0, errors: [] });
      continue;
    }
    const daysAgoDate = new Date(now.getTime() - rule.relativeDaysWait * 86400000);
    const prospects = await prisma.prospect.findMany({
      where: {
        ...prospectFilter,
        status: rule.requiredStatus,
        emails: { some: { tip: rule.emailTip, poslat: false } },
        OR: [
          { [rule.scheduledDateField]: { lte: now, not: null } },
          {
            [rule.scheduledDateField]: null,
            [rule.relativeDateField]: { lte: daysAgoDate, not: null },
          },
        ],
      },
      select: {
        id: true,
        email: true,
        emails: { where: { tip: rule.emailTip, poslat: false }, select: { id: true } },
      },
    });
    await runRule(rule.emailTip, prospects);
  }

  const totalSent = results.reduce((acc, r) => acc + r.sent, 0);
  const totalSkipped = results.reduce((acc, r) => acc + r.skipped, 0);
  return { totalSent, totalSkipped, capRemaining: remaining, results };
}

/**
 * Test-send: deliver a one-off copy of an email's current subject/body to a
 * test inbox (TEST_EMAIL) without marking it as sent or touching prospect
 * status. Used by the "Send test to self" UI button.
 */
export async function sendTestEmail(
  emailId: string,
  to: string
): Promise<{ ok: boolean; error?: string; messageId?: string | null }> {
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { prospect: true },
  });
  if (!email) return { ok: false, error: "Email nije pronađen" };

  const subjectToSend =
    email.activeSubject === "B" && email.subjectB ? email.subjectB : email.subject;
  // Test sends include the signature but omit the tracking pixel + unsubscribe
  // (we don't want test opens to skew metrics, and the recipient is the user).
  const html = `<div style="background:#fff3cd;border:1px solid #ffeaa7;padding:8px 12px;margin-bottom:16px;font-family:sans-serif;font-size:12px;color:#856404;border-radius:4px;">TEST PREVIEW — destination originale : ${email.prospect.email}</div>${email.body}${signatureHtml(email.prospect.id)}`;
  const text = `[TEST PREVIEW]\n\n${htmlToText(email.body)}\n\n${signatureText(email.prospect.id)}`;

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [to],
    replyTo: REPLY_TO,
    subject: `[TEST] ${subjectToSend}`,
    html,
    text,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, messageId: data?.id ?? null };
}
