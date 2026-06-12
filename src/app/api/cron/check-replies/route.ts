import { NextRequest, NextResponse } from "next/server";
import { checkReplies } from "@/lib/checkReplies";

/**
 * Real-time reply detection. Runs every 5 minutes via Vercel cron.
 *
 * The previous setup polled IMAP once per day inside the daily-summary cron,
 * which meant a hot reply at 09:00 sat un-acted on until 19:00 Paris time.
 * Speed-to-reply is the single biggest predictor of closing a warm prospect,
 * so this cron fires every 5 min — well inside Gmail Workspace's 15 IMAP
 * connections-per-hour soft limit since we only open one connection per fire.
 *
 * Telegram notifications fire from inside checkReplies → notifyHotReply for
 * Interested/Question/Referral classifications, so the operator gets a push
 * on their phone within ~5 min of the prospect hitting send.
 */
export const maxDuration = 300;

async function run(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await checkReplies();
    if (!result.configured) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "IMAP_USER / IMAP_PASSWORD not configured",
      });
    }
    console.log(
      `[check-replies] scanned=${result.scanned} matched=${result.matched} saved=${result.saved} errors=${result.errors.length}`
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[check-replies] threw:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "check failed" },
      { status: 500 }
    );
  }
}

export const GET = run;
export const POST = run;
