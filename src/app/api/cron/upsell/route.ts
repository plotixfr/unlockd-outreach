import { NextRequest, NextResponse } from "next/server";
import { runUpsellBatch } from "@/lib/upsell";

// Hobby caps at 60s regardless of what we ask. On Pro upgrade, raise to 300.
export const maxDuration = 60;

/**
 * Weekly post-conversion engine. Walks every Converted prospect and triggers
 * the next due touch (referral at 30d, maintenance at 60d, SEO at 180d,
 * refresh at 365d). Caps at 20 emails per run so a single tick doesn't burn
 * the daily send cap.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runUpsellBatch(20);
  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(req: NextRequest) {
  let body: { limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    // empty
  }
  const summary = await runUpsellBatch(Math.max(1, Math.min(50, body.limit ?? 20)));
  return NextResponse.json({ ok: true, ...summary });
}
