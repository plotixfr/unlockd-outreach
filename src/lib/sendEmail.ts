import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://unlockd-outreach.vercel.app";
const FROM_EMAIL = process.env.FROM_EMAIL ?? "temim@unlockd.art";

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

export interface DueResult {
  rule: string;
  sent: number;
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
 *  - the daily Vercel cron (full sweep)
 *  - the schedule endpoint (immediate trigger when scheduledInitial <= now)
 *  - the manual "Run automation" trigger
 *
 * onlyProspectIds limits the sweep to specific prospects (used after scheduling
 * a single campaign so we don't accidentally pick up unrelated due emails).
 */
export async function processDueEmails(opts?: {
  onlyProspectIds?: string[];
  concurrency?: number;
}): Promise<{ totalSent: number; results: DueResult[] }> {
  const now = new Date();
  const concurrency = opts?.concurrency ?? 5;
  const prospectFilter = opts?.onlyProspectIds
    ? { id: { in: opts.onlyProspectIds } }
    : {};
  const results: DueResult[] = [];

  // ── Initial sends ──
  {
    const errors: string[] = [];
    const prospects = await prisma.prospect.findMany({
      where: {
        ...prospectFilter,
        status: "Scheduled",
        scheduledInitial: { lte: now },
        emails: { some: { tip: "initial", poslat: false } },
      },
      include: { emails: { where: { tip: "initial", poslat: false } } },
    });
    const sendResults = await runWithConcurrency(prospects, concurrency, async (p) => {
      const email = p.emails[0];
      if (!email) return { ok: true } as const;
      const res = await sendOneEmail(email.id);
      if (!res.ok) errors.push(`${p.email}: ${res.error ?? "Greška"}`);
      return res;
    });
    const sent = sendResults.filter((r) => r.ok).length;
    results.push({ rule: "initial", sent, errors });
  }

  // ── Follow-ups ──
  for (const rule of FOLLOWUP_RULES) {
    const errors: string[] = [];
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
      include: { emails: { where: { tip: rule.emailTip, poslat: false } } },
    });
    const sendResults = await runWithConcurrency(prospects, concurrency, async (p) => {
      const email = p.emails[0];
      if (!email) return { ok: true } as const;
      const res = await sendOneEmail(email.id);
      if (!res.ok) errors.push(`${p.email}: ${res.error ?? "Greška"}`);
      return res;
    });
    const sent = sendResults.filter((r) => r.ok).length;
    results.push({ rule: rule.emailTip, sent, errors });
  }

  const totalSent = results.reduce((acc, r) => acc + r.sent, 0);
  return { totalSent, results };
}
