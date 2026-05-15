import { NextRequest, NextResponse } from "next/server";
import { processDueEmails } from "@/lib/sendEmail";

async function run(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const secret = process.env.CRON_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { totalSent, results } = await processDueEmails();
    console.log(`[cron] send-followups: ${totalSent} emails sent`, results);
    return NextResponse.json({ ok: true, totalSent, results });
  } catch (err) {
    console.error("[cron] Unhandled error:", err);
    return NextResponse.json({ error: "Serverska greška u cron job-u" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
