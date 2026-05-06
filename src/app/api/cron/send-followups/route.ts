import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

// Days to wait before each follow-up
const FOLLOWUP_RULES = [
  {
    requiredStatus: "Emailed",
    dateField: "datumPrvogMaila" as const,
    daysWait: 4,
    emailTip: "follow1",
    newStatus: "Follow1",
    statusField: "datumFollowUp1" as const,
  },
  {
    requiredStatus: "Follow1",
    dateField: "datumFollowUp1" as const,
    daysWait: 5,
    emailTip: "follow2",
    newStatus: "Follow2",
    statusField: "datumFollowUp2" as const,
  },
  {
    requiredStatus: "Follow2",
    dateField: "datumFollowUp2" as const,
    daysWait: 7,
    emailTip: "follow3",
    newStatus: "Follow3",
    statusField: "datumFollowUp3" as const,
  },
] as const;

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export async function GET(req: NextRequest) {
  // Auth check — Vercel sends Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: { rule: string; sent: number; errors: string[] }[] = [];

  for (const rule of FOLLOWUP_RULES) {
    const sent: number[] = [];
    const errors: string[] = [];

    // Find prospects eligible for this follow-up
    const prospects = await prisma.prospect.findMany({
      where: {
        status: rule.requiredStatus,
        [rule.dateField]: { lte: daysAgo(rule.daysWait), not: null },
        emails: { some: { tip: rule.emailTip, poslat: false } },
      },
      include: {
        emails: { where: { tip: rule.emailTip, poslat: false } },
      },
    });

    for (const prospect of prospects) {
      const followupEmail = prospect.emails[0];
      if (!followupEmail) continue;

      try {
        const { error } = await resend.emails.send({
          from: process.env.FROM_EMAIL ?? "temim@unlockd.art",
          to: [prospect.email],
          bcc: ["temim.fr@gmail.com"],
          subject: followupEmail.subject,
          html: followupEmail.body,
        });

        if (error) throw new Error(error.message);

        const now = new Date();
        await prisma.email.update({
          where: { id: followupEmail.id },
          data: { poslat: true, poslatAt: now },
        });
        await prisma.prospect.update({
          where: { id: prospect.id },
          data: { status: rule.newStatus, [rule.statusField]: now },
        });

        sent.push(1);
      } catch (e) {
        errors.push(`${prospect.email}: ${e instanceof Error ? e.message : "Erreur"}`);
      }
    }

    results.push({ rule: rule.emailTip, sent: sent.length, errors });
  }

  const totalSent = results.reduce((acc, r) => acc + r.sent, 0);
  console.log(`[cron] send-followups: ${totalSent} emails sent`, results);

  return NextResponse.json({ ok: true, totalSent, results });
}
