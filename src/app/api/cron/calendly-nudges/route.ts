import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateNudgeEmail } from "@/lib/calendlyNudge";
import { processDueEmails } from "@/lib/sendEmail";

// Vercel Hobby cap. Each candidate prospect adds ~5-10s of Claude generation
// + DB writes. We limit candidates to NUDGE_CAP_PER_RUN to stay under budget.
export const maxDuration = 60;

// Look back this many days for clicks worth following up. Past 7 days a
// nudge feels stale; better to fall through into the re-engagement cron's
// 90/180/365-day cadence.
const LOOKBACK_DAYS = 7;
// Per-fire cap so a sudden surge of clicks (e.g. a viral newsletter) can't
// blow the function timeout or the Resend rate limit.
const NUDGE_CAP_PER_RUN = 5;
// We're inside the post-conversion exclusion set: prospects who already
// replied, booked a meeting, or converted shouldn't get a nudge. Bounced
// and unsubscribed obviously not either.
const EXCLUDED_STATUSES = ["Replied", "Meeting", "Booked", "Converted", "Bounced", "Unsubscribed"];

async function run(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

  // Candidate set: prospects who have at least one sent email whose
  // Calendly link was clicked in the last 7 days, AND who don't already
  // have a calendly_nudge email queued (any state — even unsent counts as
  // "already handled"), AND whose status isn't a post-conversion terminal.
  const candidates = await prisma.prospect.findMany({
    where: {
      status: { notIn: EXCLUDED_STATUSES },
      emails: {
        some: {
          calendlyClicked: true,
          calendlyClickedAt: { gte: since },
        },
      },
      NOT: {
        emails: { some: { tip: "calendly_nudge" } },
      },
    },
    select: {
      id: true,
      firmaNaziv: true,
      kontaktIme: true,
      email: true,
      nisa: true,
      grad: true,
      website: true,
      napomena: true,
      qualityNote: true,
      emails: {
        where: { poslat: true },
        orderBy: { poslatAt: "desc" },
        take: 1,
        select: { subject: true, body: true, poslatAt: true, tip: true },
      },
    },
    take: NUDGE_CAP_PER_RUN,
  });

  const summary: { prospect: string; status: string; reason?: string }[] = [];
  let queued = 0;

  for (const p of candidates) {
    const lastEmail = p.emails[0] ?? null;
    try {
      const generated = await generateNudgeEmail(
        {
          firmaNaziv: p.firmaNaziv,
          kontaktIme: p.kontaktIme,
          nisa: p.nisa,
          grad: p.grad,
          website: p.website,
          napomena: p.napomena,
          qualityNote: p.qualityNote,
        },
        lastEmail
      );
      if (!generated) {
        summary.push({ prospect: p.email, status: "skipped", reason: "generation failed" });
        continue;
      }

      await prisma.email.create({
        data: {
          prospectId: p.id,
          tip: "calendly_nudge",
          subject: generated.subject,
          body: generated.body,
          activeSubject: "A",
        },
      });
      // scheduledInitial=now so the processDueEmails sweep at the end of
      // this same run picks it up. We deliberately do NOT change status:
      // the calendly_nudge is an additional touch on top of the follow-up
      // sequence, not a replacement for it. The dedup query already uses
      // "NOT exists calendly_nudge" so a re-fire is prevented regardless of
      // status — and leaving status alone lets follow1/2/3/breakup keep
      // firing on their normal cadence.
      await prisma.prospect.update({
        where: { id: p.id },
        data: { scheduledInitial: new Date() },
      });
      summary.push({ prospect: p.email, status: "queued" });
      queued++;
    } catch (e) {
      console.error(`[calendly-nudges] failed for ${p.email}:`, e);
      summary.push({ prospect: p.email, status: "error", reason: e instanceof Error ? e.message : "unknown" });
    }
  }

  // Ship now. The cron runs at 06:30 UTC = 08:30 Paris (CEST), inside the
  // business-hours window, so the nudges go out immediately and the
  // recipient sees them at the start of their workday.
  let sendResult: Awaited<ReturnType<typeof processDueEmails>> | null = null;
  if (queued > 0) {
    try {
      sendResult = await processDueEmails({ enforceBusinessHours: true });
    } catch (e) {
      console.error("[calendly-nudges] post-queue send sweep failed:", e);
    }
  }

  console.log(`[calendly-nudges] candidates=${candidates.length} queued=${queued} sent=${sendResult?.totalSent ?? 0}`);
  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    queued,
    summary,
    sendResult,
  });
}

export const GET = run;
export const POST = run;
