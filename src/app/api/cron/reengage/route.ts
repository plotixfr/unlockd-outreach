import { NextRequest, NextResponse } from "next/server";
import { runReengageBatch } from "@/lib/reengage";
import { isCronOrSessionAuthorized } from "@/lib/routeAuth";

// Vercel's default function timeout is 300s on all plans (Fluid Compute).
export const maxDuration = 300;

/**
 * Weekly re-engagement cron. Scans for dormant prospects (90/180/365 days
 * since the last touch), generates a fresh-angle email each, and schedules
 * the send. Cap at 30 per run so a single cron doesn't blow the daily send
 * cap and stays inside Vercel duration.
 */
export async function GET(req: NextRequest) {
  if (!(await isCronOrSessionAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runReengageBatch(30);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[reengage] batch failed:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "reengage failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isCronOrSessionAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    // empty
  }
  try {
    const summary = await runReengageBatch(Math.max(1, Math.min(100, body.limit ?? 30)));
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[reengage] batch failed:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "reengage failed" }, { status: 500 });
  }
}
