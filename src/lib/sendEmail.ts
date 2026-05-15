import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://unlockd-outreach.vercel.app";
const FROM_EMAIL = process.env.FROM_EMAIL ?? "temim@unlockd.art";
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

function buildHtml(body: string, emailId: string, prospectId: string): string {
  const pixel = `<img src="${SITE_URL}/api/track/open/${emailId}" width="1" height="1" style="display:none;border:0;outline:none;" alt="" />`;
  const unsubscribe = `<p style="font-size:11px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">Si vous ne souhaitez plus recevoir nos messages, <a href="${SITE_URL}/api/unsubscribe/${prospectId}" style="color:#999;text-decoration:underline;">cliquez ici pour vous désabonner</a>.</p>`;
  return body + pixel + unsubscribe;
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

  const html = buildHtml(email.body, email.id, email.prospect.id);
  const subjectToSend =
    email.activeSubject === "B" && email.subjectB ? email.subjectB : email.subject;

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [email.prospect.email],
    bcc: ["temim.fr@gmail.com"],
    subject: subjectToSend,
    html,
  });
  if (error) return { ok: false, error: error.message };

  const now = new Date();
  const mapping = TIP_TO_STATUS[email.tip];
  await prisma.email.update({
    where: { id: emailId },
    data: { poslat: true, poslatAt: now, resendId: data?.id ?? null },
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
  // Europe/Paris offset: +1 in winter, +2 in summer. We use the locale formatter
  // to read out the wall-clock hour and weekday so we don't have to ship a tz lib.
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

/**
 * How many emails have already been sent today (UTC midnight to now).
 * The cap is applied across all rules combined.
 */
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

/**
 * Sends every email whose schedule has come due. Used by:
 *  - the daily Vercel cron (full sweep, enforces business hours + cap)
 *  - the schedule endpoint (immediate trigger, ignores business hours since
 *    the user is explicitly triggering, but still respects the daily cap)
 *  - any manual "Run automation" trigger
 *
 * onlyProspectIds limits the sweep to specific prospects (used after scheduling
 * a single campaign so we don't accidentally pick up unrelated due emails).
 */
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

    // Cap-aware slice — anything beyond `remaining` is left for tomorrow.
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
  // Test sends omit the tracking pixel and unsubscribe footer so the rendered
  // copy is as clean as the real send (no false opens) but doesn't ping
  // real-prospect endpoints. We render the body raw.
  const html = `<div style="background:#fff3cd;border:1px solid #ffeaa7;padding:8px 12px;margin-bottom:16px;font-family:sans-serif;font-size:12px;color:#856404;border-radius:4px;">TEST PREVIEW — destination originale : ${email.prospect.email}</div>${email.body}`;

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [to],
    subject: `[TEST] ${subjectToSend}`,
    html,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, messageId: data?.id ?? null };
}
