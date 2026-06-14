import { NextRequest, NextResponse } from "next/server";
import { runUpsellBatch } from "@/lib/upsell";
import { isCronOrSessionAuthorized } from "@/lib/routeAuth";

// Vercel's default function timeout is 300s on all plans (Fluid Compute).
export const maxDuration = 300;

/**
 * Weekly post-conversion engine. Walks every Converted prospect and triggers
 * the next due touch (referral at 30d, maintenance at 60d, SEO at 180d,
 * refresh at 365d). Caps at 20 emails per run so a single tick doesn't burn
 * the daily send cap.
 */
export async function GET(req: NextRequest) {
  if (!(await isCronOrSessionAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runUpsellBatch(20);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[upsell] batch failed:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "upsell failed" }, { status: 500 });
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
    const summary = await runUpsellBatch(Math.max(1, Math.min(50, body.limit ?? 20)));
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    console.error("[upsell] batch failed:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "upsell failed" }, { status: 500 });
  }
}
