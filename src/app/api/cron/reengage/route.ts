import { NextRequest, NextResponse } from "next/server";
import { runReengageBatch } from "@/lib/reengage";

// Hobby caps at 60s regardless of what we ask. On Pro upgrade, raise to 300.
export const maxDuration = 60;

/**
 * Weekly re-engagement cron. Scans for dormant prospects (90/180/365 days
 * since the last touch), generates a fresh-angle email each, and schedules
 * the send. Cap at 30 per run so a single cron doesn't blow the daily send
 * cap and stays inside Vercel duration.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runReengageBatch(30);
  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(req: NextRequest) {
  // Also allow manual trigger from authenticated session (proxy enforces).
  let body: { limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    // empty
  }
  const summary = await runReengageBatch(Math.max(1, Math.min(100, body.limit ?? 30)));
  return NextResponse.json({ ok: true, ...summary });
}
