import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { signatureHtml, signatureText } from "@/lib/signature";
import { lintForSpam, shouldBlock as shouldSpamBlock } from "@/lib/spamCheck";
import { isDomainSuppressed } from "@/lib/suppression";

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

// Resend caps at 5 requests/second per account. Our gate has to be stricter
// because (a) the start-timestamp in our bucket is not exactly when Resend
// receives the request — there's ~20-200ms network latency, which can shift
// requests into Resend's neighbouring window, and (b) Vercel can sometimes
// run multiple invocations of the same cron close together. 3/sec gives us
// 40% headroom and still lets us clear 60 sends in a single 60s function.
//
// Sliding-window gate over MAX_RESEND_RPS starts in a 1100ms window.
// Module-level state is fine here: one serverless instance = one bucket.
const MAX_RESEND_RPS = 3;
const RESEND_WINDOW_MS = 1100;
const resendCallTimes: number[] = [];
export async function resendGate(): Promise<void> {
  while (true) {
    const now = Date.now();
    while (resendCallTimes.length && resendCallTimes[0] < now - RESEND_WINDOW_MS) {
      resendCallTimes.shift();
    }
    if (resendCallTimes.length < MAX_RESEND_RPS) {
      resendCallTimes.push(now);
      return;
    }
    const wait = RESEND_WINDOW_MS - (now - resendCallTimes[0]) + 50;
    await new Promise((r) => setTimeout(r, wait));
  }
}

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
  | "datumFollowUp3"
  | "datumBreakup";

export const TIP_TO_STATUS: Record<string, { status: string; field: StatusField }> = {
  initial: { status: "Emailed", field: "datumPrvogMaila" },
  follow1: { status: "Follow1", field: "datumFollowUp1" },
  follow2: { status: "Follow2", field: "datumFollowUp2" },
  follow3: { status: "Follow3", field: "datumFollowUp3" },
  breakup: { status: "Breakup", field: "datumBreakup" as StatusField },
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
  opts: { includePixel: boolean; siteUrl?: string | null; includeScreenshot: boolean; lang?: string | null }
): string {
  const lang = opts.lang === "nl" ? "nl" : "fr";
  const pixel = opts.includePixel
    ? `<img src="${SITE_URL}/api/track/open/${emailId}" width="1" height="1" style="display:none;border:0;outline:none;" alt="" />`
    : "";
  const unsubscribeCopy = lang === "nl"
    ? `Wilt u geen e-mails meer ontvangen? <a href="${SITE_URL}/api/unsubscribe/${prospectId}" style="color:#999;text-decoration:underline;">klik hier om uit te schrijven</a>.`
    : `Si vous ne souhaitez plus recevoir nos messages, <a href="${SITE_URL}/api/unsubscribe/${prospectId}" style="color:#999;text-decoration:underline;">cliquez ici pour vous désabonner</a>.`;
  const unsubscribe = `<p style="font-size:11px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">${unsubscribeCopy}</p>`;

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
      <p style="margin:8px 0 0;font-size:11px;color:#888;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${lang === "nl" ? "Huidige weergave" : "Aperçu actuel"} : <a href="${opts.siteUrl}" style="color:#888;text-decoration:underline;">${opts.siteUrl}</a></p>
    </td>
  </tr>
</table>`
    : "";

  return body + screenshotBlock + signatureHtml(prospectId, lang) + pixel + unsubscribe;
}

/**
 * Plain-text body, paired with the HTML one. Resend sends both as a multipart
 * message — having a real text/plain part materially improves Gmail Inbox
 * placement vs. HTML-only.
 */
function buildText(body: string, prospectId: string, lang: string | null = null): string {
  const text = htmlToText(body);
  const unsubLabel = lang === "nl" ? "Uitschrijven" : "Désabonnement";
  return [
    text,
    "",
    signatureText(prospectId, lang),
    "",
    `${unsubLabel} : ${SITE_URL}/api/unsubscribe/${prospectId}`,
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
  if (!email) return { ok: false, error: "Email not found" };
  if (email.poslat) return { ok: true, resendId: email.resendId };

  // Domain suppression: if another prospect at the same company already
  // replied / unsubscribed / complained / bounced, don't cold-mail their
  // colleague. Their mail admin already has a strike against our domain;
  // a second strike accelerates the spam classification. Marks the prospect
  // Unsubscribed so the dashboard reflects it.
  const suppressed = await isDomainSuppressed(email.prospect.email);
  if (suppressed) {
    await prisma.prospect.update({
      where: { id: email.prospect.id },
      data: { status: "Unsubscribed" },
    });
    return { ok: false, error: "domain suppressed (colleague replied/unsubscribed)" };
  }

  // Spam-word lint. We score subject + body against a known-trigger list.
  // High scores get blocked; medium scores still send but persist the score
  // so the operator can see what tripped (and ask Claude for a re-gen).
  const baseSubjectForLint =
    email.activeSubject === "B" && email.subjectB ? email.subjectB : email.subject;
  const spamCheck = lintForSpam(baseSubjectForLint, email.body);
  if (shouldSpamBlock(spamCheck)) {
    await prisma.email.update({
      where: { id: emailId },
      data: {
        spamScore: spamCheck.score,
        spamWords: spamCheck.matched.concat(spamCheck.reasons).join(", ").slice(0, 1000),
      },
    });
    return {
      ok: false,
      error: `blocked by spam linter (score ${spamCheck.score}: ${spamCheck.matched.concat(spamCheck.reasons).join(", ")})`,
    };
  }
  if (spamCheck.score > 0) {
    // Persist non-blocking score so the operator can see it on the email card.
    await prisma.email.update({
      where: { id: emailId },
      data: {
        spamScore: spamCheck.score,
        spamWords: spamCheck.matched.concat(spamCheck.reasons).join(", ").slice(0, 1000),
      },
    });
  }

  // Late binding: if this prospect's mockup or auditFindings were generated
  // AFTER the email body was created (e.g. bulk "Mockups" run on existing
  // prospects), the body won't reference them. Inject a styled CTA block
  // pointing to /audit/[id] (the audit landing page) so the F2 promise
  // actually delivers something. No-op when body already contains the link.
  const auditLandingUrl = `${SITE_URL}/audit/${email.prospect.id}`;
  const shouldInjectAuditCta =
    email.tip === "follow2" &&
    !email.body.includes(`/audit/${email.prospect.id}`) &&
    !!(email.prospect.mockupUrl || email.prospect.auditFindings);
  const bodyToSend = shouldInjectAuditCta
    ? email.body +
      `<p style="margin-top:18px;">J'ai préparé un audit personnalisé pour vous — <a href="${auditLandingUrl}" style="color:#10b981;font-weight:600;">les 3 points concrets ici${
        email.prospect.mockupUrl ? " + une direction visuelle" : ""
      } →</a></p>`
    : email.body;

  const isInitial = email.tip === "initial";
  // Re-engagement emails are fresh standalone touches months after the
  // original sequence. Upsell emails (retainer/referral/refresh) go to
  // existing CLIENTS post-conversion — also brand-new threads, with the
  // pixel + screenshot since they're effectively new pitches.
  const isReengage = email.tip.startsWith("reengage");
  const isUpsell = email.tip.startsWith("retainer") || email.tip.startsWith("referral");
  const standaloneTouch = isInitial || isReengage || isUpsell;
  const baseSubject =
    email.activeSubject === "B" && email.subjectB ? email.subjectB : email.subject;

  const html = buildHtml(bodyToSend, email.id, email.prospect.id, {
    includePixel: standaloneTouch,
    siteUrl: email.prospect.website,
    includeScreenshot: standaloneTouch && !!email.prospect.website,
    lang: email.prospect.language,
  });
  const text = buildText(bodyToSend, email.prospect.id, email.prospect.language);

  // Threading: follow-ups attach to the initial's Message-ID and reuse "Re:".
  // Re-engagement deliberately doesn't thread.
  let subjectToSend = baseSubject;
  const headers: Record<string, string> = deliverabilityHeaders(email.prospect.id);
  if (!standaloneTouch) {
    const thread = await lookupInitialThread(email.prospectId);
    if (thread) {
      headers["In-Reply-To"] = thread.messageId;
      headers["References"] = thread.messageId;
      subjectToSend = /^re:\s/i.test(baseSubject) ? baseSubject : `Re: ${thread.subject}`;
    }
  }

  // Prospect send — includes the tracking pixel and unsubscribe footer.
  await resendGate();
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [email.prospect.email],
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

  // Operator copy — separate Resend call with a STRIPPED body: no pixel
  // (so opening this copy doesn't count as a prospect open), no unsubscribe
  // footer (so an accidental click here doesn't unsubscribe the prospect),
  // no screenshot block. Adds a banner showing the real destination so the
  // operator's inbox stays useful as a sent-mail archive.
  //
  // Failures are logged into Email.bccError + bccSentAt=null so dashboard
  // can surface them. One retry on transient errors before giving up.
  if (BCC_EMAIL) {
    const opCopyHtml = buildOperatorCopyHtml(
      bodyToSend,
      email.prospect.firmaNaziv,
      email.prospect.email,
      subjectToSend
    );
    const opCopyText = buildOperatorCopyText(
      bodyToSend,
      email.prospect.firmaNaziv,
      email.prospect.email,
      subjectToSend
    );
    let bccError: string | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await resendGate();
        const { error: bccErr } = await resend.emails.send({
          from: FROM_EMAIL,
          to: [BCC_EMAIL],
          subject: `[Sent] ${subjectToSend}`,
          html: opCopyHtml,
          text: opCopyText,
        });
        if (!bccErr) { bccError = null; break; }
        bccError = bccErr.message;
        if (attempt === 1) await new Promise((r) => setTimeout(r, 800));
      } catch (e) {
        bccError = e instanceof Error ? e.message : "bcc send threw";
        if (attempt === 1) await new Promise((r) => setTimeout(r, 800));
      }
    }
    await prisma.email.update({
      where: { id: emailId },
      data: bccError
        ? { bccError: bccError.slice(0, 500), bccSentAt: null }
        : { bccError: null, bccSentAt: new Date() },
    });
    if (bccError) console.error(`[sendEmail] BCC failed for ${emailId}: ${bccError}`);
  }

  return { ok: true, resendId: data?.id ?? null };
}

/**
 * Operator BCC copy: stripped of pixel, unsubscribe footer, and screenshot.
 * A small banner identifies the real destination so the operator can use
 * their inbox as a sent-mail archive without confusing it with their own
 * prospect-facing replies.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildOperatorCopyHtml(
  body: string,
  prospectName: string,
  prospectEmail: string,
  subject: string
): string {
  const banner = `<div style="background:#f4f4f5;padding:12px 16px;border-left:3px solid #10b981;margin-bottom:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <p style="margin:0;font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">SENT — Operator copy</p>
  <p style="margin:4px 0 0;font-size:13px;color:#27272a;">To: <strong>${escapeHtml(prospectName)}</strong> &lt;${escapeHtml(prospectEmail)}&gt;</p>
  <p style="margin:2px 0 0;font-size:12px;color:#52525b;">Subject: ${escapeHtml(subject)}</p>
</div>`;
  return banner + body;
}

function buildOperatorCopyText(
  body: string,
  prospectName: string,
  prospectEmail: string,
  subject: string
): string {
  return `[SENT — Operator copy]\nTo: ${prospectName} <${prospectEmail}>\nSubject: ${subject}\n\n---\n\n${htmlToText(body)}`;
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
  // Breakup: ~5 days after F3 lands the prospect around day 21 of the
  // sequence (initial + 4 + 5 + 7 + 5). The "should I close this thread?"
  // ask is the single highest-reply touch in cold outbound — keeps the
  // sequence from dying silently after Follow3.
  {
    requiredStatus: "Follow3",
    scheduledDateField: "scheduledBreakup" as const,
    relativeDateField: "datumFollowUp3" as const,
    relativeDaysWait: 5,
    emailTip: "breakup",
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
      if (!res.ok) errors.push(`${p.email}: ${res.error ?? "Error"}`);
      return res;
    });
    sent = sendResults.filter((r) => r.ok).length;
    remaining = Math.max(0, remaining - sent);
    results.push({ rule, sent, skipped, errors });
  }

  // ── Standalone touches: initial + re-engagement + post-conversion upsells
  // + calendly_nudge ──
  // All share the scheduledInitial slot since each is dispatched on its own
  // queue time (not derived from FOLLOWUP_RULES). calendly_nudge is the
  // exception in look-and-feel: it threads into the original conversation
  // (handled in sendOneEmail via the non-standaloneTouch path), but is
  // dispatched here because it has its own send-time independent of the
  // initial → follow1 → follow2 cadence.
  {
    const standaloneTips = [
      "initial",
      "reengage90", "reengage180", "reengage365",
      "referral30", "retainer60", "retainer180", "retainer365",
      "calendly_nudge",
    ];
    const prospects = await prisma.prospect.findMany({
      where: {
        ...prospectFilter,
        status: { notIn: ["Unsubscribed", "Bounced"] },
        scheduledInitial: { lte: now },
        emails: { some: { tip: { in: standaloneTips }, poslat: false } },
      },
      select: {
        id: true,
        email: true,
        emails: { where: { tip: { in: standaloneTips }, poslat: false }, select: { id: true } },
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
  if (!email) return { ok: false, error: "Email not found" };

  const subjectToSend =
    email.activeSubject === "B" && email.subjectB ? email.subjectB : email.subject;
  // Test sends include the signature but omit the tracking pixel + unsubscribe
  // (we don't want test opens to skew metrics, and the recipient is the user).
  const html = `<div style="background:#fff3cd;border:1px solid #ffeaa7;padding:8px 12px;margin-bottom:16px;font-family:sans-serif;font-size:12px;color:#856404;border-radius:4px;">TEST PREVIEW — destination originale : ${email.prospect.email}</div>${email.body}${signatureHtml(email.prospect.id, email.prospect.language)}`;
  const text = `[TEST PREVIEW]\n\n${htmlToText(email.body)}\n\n${signatureText(email.prospect.id, email.prospect.language)}`;

  await resendGate();
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
