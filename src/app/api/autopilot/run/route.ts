import { NextRequest, NextResponse } from "next/server";
import { runBrief, runAllActiveBriefs } from "@/lib/autopilot";
import { notifyAutopilotSummary } from "@/lib/notify";
import { processDueEmails } from "@/lib/sendEmail";
import { isCronOrSessionAuthorized } from "@/lib/routeAuth";
import { runRedrivePass } from "@/lib/redrive";

/**
 * Manual + cron trigger for autopilot. Two modes:
 *   POST {briefId}      → run one brief, return its summary
 *   POST {} or GET      → run all active briefs and email a summary (used by cron)
 *
 * Cron authentication is the same scheme as the existing send-followups cron:
 * Authorization: Bearer ${CRON_SECRET}. For interactive calls from the dashboard,
 * the session-cookie proxy has already authenticated the user.
 */

// Vercel Hobby caps serverless functions at 60s regardless of this value.
// On Pro (300s cap), bump this back up. Either way, runAllActiveBriefs
// honours AUTOPILOT_TIME_BUDGET_MS as its internal stop-deadline.
export const maxDuration = 60;

async function runAndSummarize(emailSummary: boolean) {
  // Re-drive first: prospects stranded in "New" by an earlier failure get
  // their missing stages re-run (capped batch) before fresh discovery.
  let redrive: Awaited<ReturnType<typeof runRedrivePass>> | null = null;
  try {
    redrive = await runRedrivePass();
    console.log(
      `[autopilot] redrive: ${redrive.retried} retried, ${redrive.advanced} advanced, ${redrive.failedTerminal} marked Failed`
    );
  } catch (e) {
    console.error("[autopilot] redrive pass failed:", e);
  }
  const summaries = await runAllActiveBriefs();
  // Same-day scheduled prospects (scheduledInitial = ~now) become due as soon
  // as the scheduler writes them. Drain them right here so a fresh-deploy or
  // post-reset day actually ships sends today instead of waiting until the
  // next 10:00 Paris send cron — that 24-hour delay is what produced the
  // "0 sent today" daily summary we were debugging.
  // enforceBusinessHours stays true so a manual UI trigger at 02:00 Paris
  // doesn't fire cold sends at 02:00. The actual autopilot cron runs at
  // 08:00 Paris which sits inside the window, so the sweep always works
  // when it's supposed to.
  let sendSweep: Awaited<ReturnType<typeof processDueEmails>> | null = null;
  try {
    sendSweep = await processDueEmails({ enforceBusinessHours: true });
    console.log(
      `[autopilot] post-discovery send sweep: ${sendSweep.totalSent} sent, ${sendSweep.totalSkipped} skipped`
    );
  } catch (e) {
    console.error("[autopilot] post-discovery send sweep failed:", e);
  }
  if (emailSummary) {
    await notifyAutopilotSummary({
      date: new Date().toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      briefs: summaries.map((s) => ({
        briefName: s.briefName,
        found: s.found,
        created: s.created,
        qualified: s.qualified,
        scheduled: s.scheduled,
        errors: s.errors,
      })),
    });
  }
  return { summaries, sendSweep, redrive };
}

export async function GET(req: NextRequest) {
  if (!(await isCronOrSessionAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { summaries, sendSweep, redrive } = await runAndSummarize(true);
  return NextResponse.json({ ok: true, summaries, sendSweep, redrive });
}

export async function POST(req: NextRequest) {
  if (!(await isCronOrSessionAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { briefId?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body.briefId) {
    try {
      const summary = await runBrief(body.briefId);
      // Single-brief mode also runs the send sweep so a manual UI trigger of
      // a Swiss/FR brief in business hours ships its same-day-scheduled
      // prospects right away, not on the next cron. enforceBusinessHours
      // keeps the cold-send timing safety.
      let sendSweep: Awaited<ReturnType<typeof processDueEmails>> | null = null;
      try {
        sendSweep = await processDueEmails({ enforceBusinessHours: true });
        console.log(
          `[autopilot] single-brief post-sweep: ${sendSweep.totalSent} sent, ${sendSweep.totalSkipped} skipped`
        );
      } catch (e) {
        console.error("[autopilot] single-brief post-sweep failed:", e);
      }
      return NextResponse.json({ ok: true, summary, sendSweep });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "run failed" },
        { status: 500 }
      );
    }
  }
  const { summaries, sendSweep, redrive } = await runAndSummarize(false);
  return NextResponse.json({ ok: true, summaries, sendSweep, redrive });
}
