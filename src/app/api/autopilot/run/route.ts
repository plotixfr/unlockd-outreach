import { NextRequest, NextResponse } from "next/server";
import { runBrief, runAllActiveBriefs } from "@/lib/autopilot";
import { notifyAutopilotSummary } from "@/lib/notify";

/**
 * Manual + cron trigger for autopilot. Two modes:
 *   POST {briefId}      → run one brief, return its summary
 *   POST {} or GET      → run all active briefs and email a summary (used by cron)
 *
 * Cron authentication is the same scheme as the existing send-followups cron:
 * Authorization: Bearer ${CRON_SECRET}. For interactive calls from the dashboard,
 * the session-cookie middleware has already authenticated the user.
 */

export const maxDuration = 300; // up to 5 minutes — discovery can be slow

async function runAndSummarize(emailSummary: boolean) {
  const summaries = await runAllActiveBriefs();
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
  return summaries;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summaries = await runAndSummarize(true);
  return NextResponse.json({ ok: true, summaries });
}

export async function POST(req: NextRequest) {
  let body: { briefId?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body.briefId) {
    try {
      const summary = await runBrief(body.briefId);
      return NextResponse.json({ ok: true, summary });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "run failed" },
        { status: 500 }
      );
    }
  }
  const summaries = await runAndSummarize(false);
  return NextResponse.json({ ok: true, summaries });
}
