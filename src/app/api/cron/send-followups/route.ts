import { NextRequest, NextResponse } from "next/server";
import { processDueEmails } from "@/lib/sendEmail";

// Without this, Hobby caps the function at ~10s. Today's send cron hit that
// after one wave (5 parallel sends ~5s) and died with 12 due prospects still
// un-sent. 60s is the Hobby ceiling; on Pro this can go to 300.
export const maxDuration = 60;

async function run(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Cron sweep respects Paris business hours + the daily send cap to protect
    // deliverability. Manual triggers from the UI bypass business hours.
    const { totalSent, totalSkipped, capRemaining, results } = await processDueEmails({
      enforceBusinessHours: true,
    });
    console.log(
      `[cron] send-followups: ${totalSent} sent, ${totalSkipped} skipped, ${capRemaining} cap remaining`,
      results
    );
    return NextResponse.json({ ok: true, totalSent, totalSkipped, capRemaining, results });
  } catch (err) {
    console.error("[cron] Unhandled error:", err);
    return NextResponse.json({ error: "Serverska greška u cron job-u" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
