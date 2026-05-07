import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://unlockd-outreach.vercel.app";

function buildHtml(body: string, emailId: string, prospectId: string): string {
  const pixel = `<img src="${SITE_URL}/api/track/open/${emailId}" width="1" height="1" style="display:none;border:0;outline:none;" alt="" />`;
  const unsubscribe = `<p style="font-size:11px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">Si vous ne souhaitez plus recevoir nos messages, <a href="${SITE_URL}/api/unsubscribe/${prospectId}" style="color:#999;text-decoration:underline;">cliquez ici pour vous désabonner</a>.</p>`;
  return body + pixel + unsubscribe;
}

async function sendEmail(to: string, subject: string, html: string) {
  const { error } = await resend.emails.send({
    from: process.env.FROM_EMAIL ?? "temim@unlockd.art",
    to: [to],
    bcc: ["temim.fr@gmail.com"],
    subject,
    html,
  });
  if (error) throw new Error(error.message);
}

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const results: { rule: string; sent: number; errors: string[] }[] = [];

    // ── Rule 0: Send initial for Scheduled prospects ──
    {
      let sent = 0;
      const errors: string[] = [];
      try {
        const prospects = await prisma.prospect.findMany({
          where: {
            status: "Scheduled",
            scheduledInitial: { lte: now },
            emails: { some: { tip: "initial", poslat: false } },
          },
          include: {
            emails: { where: { tip: "initial", poslat: false } },
          },
        });

        for (const prospect of prospects) {
          const email = prospect.emails[0];
          if (!email) continue;
          try {
            const subjectToSend =
              email.activeSubject === "B" && email.subjectB ? email.subjectB : email.subject;
            const html = buildHtml(email.body, email.id, prospect.id);
            await sendEmail(prospect.email, subjectToSend, html);
            const sentAt = new Date();
            await prisma.email.update({
              where: { id: email.id },
              data: { poslat: true, poslatAt: sentAt },
            });
            await prisma.prospect.update({
              where: { id: prospect.id },
              data: { status: "Emailed", datumPrvogMaila: sentAt },
            });
            sent++;
          } catch (e) {
            errors.push(`${prospect.email}: ${e instanceof Error ? e.message : "Greška"}`);
          }
        }
      } catch (e) {
        errors.push(`DB query failed: ${e instanceof Error ? e.message : "Greška"}`);
      }
      results.push({ rule: "initial", sent, errors });
    }

    // ── Rules 1-3: Send follow-ups ──
    const followupRules = [
      {
        requiredStatus: "Emailed",
        scheduledDateField: "scheduledFollow1" as const,
        relativeDateField: "datumPrvogMaila" as const,
        relativeDaysWait: 4,
        emailTip: "follow1",
        newStatus: "Follow1",
        sentDateField: "datumFollowUp1" as const,
      },
      {
        requiredStatus: "Follow1",
        scheduledDateField: "scheduledFollow2" as const,
        relativeDateField: "datumFollowUp1" as const,
        relativeDaysWait: 5,
        emailTip: "follow2",
        newStatus: "Follow2",
        sentDateField: "datumFollowUp2" as const,
      },
      {
        requiredStatus: "Follow2",
        scheduledDateField: "scheduledFollow3" as const,
        relativeDateField: "datumFollowUp2" as const,
        relativeDaysWait: 7,
        emailTip: "follow3",
        newStatus: "Follow3",
        sentDateField: "datumFollowUp3" as const,
      },
    ] as const;

    for (const rule of followupRules) {
      let sent = 0;
      const errors: string[] = [];

      try {
        const daysAgoDate = new Date(now.getTime() - rule.relativeDaysWait * 86400000);

        // Prospects due via scheduled date OR via relative delay from last send
        const prospects = await prisma.prospect.findMany({
          where: {
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
          include: {
            emails: { where: { tip: rule.emailTip, poslat: false } },
          },
        });

        for (const prospect of prospects) {
          const followupEmail = prospect.emails[0];
          if (!followupEmail) continue;
          try {
            const subjectToSend =
              followupEmail.activeSubject === "B" && followupEmail.subjectB
                ? followupEmail.subjectB
                : followupEmail.subject;
            const html = buildHtml(followupEmail.body, followupEmail.id, prospect.id);
            await sendEmail(prospect.email, subjectToSend, html);
            const sentAt = new Date();
            await prisma.email.update({
              where: { id: followupEmail.id },
              data: { poslat: true, poslatAt: sentAt },
            });
            await prisma.prospect.update({
              where: { id: prospect.id },
              data: { status: rule.newStatus, [rule.sentDateField]: sentAt },
            });
            sent++;
          } catch (e) {
            errors.push(`${prospect.email}: ${e instanceof Error ? e.message : "Greška"}`);
          }
        }
      } catch (e) {
        errors.push(`DB query failed: ${e instanceof Error ? e.message : "Greška"}`);
      }

      results.push({ rule: rule.emailTip, sent, errors });
    }

    const totalSent = results.reduce((acc, r) => acc + r.sent, 0);
    console.log(`[cron] send-followups: ${totalSent} emails sent`, results);

    return NextResponse.json({ ok: true, totalSent, results });
  } catch (err) {
    console.error("[cron] Unhandled error:", err);
    return NextResponse.json({ error: "Serverska greška u cron job-u" }, { status: 500 });
  }
}
