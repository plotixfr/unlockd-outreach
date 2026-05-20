import { NextRequest, NextResponse } from "next/server";
import { pickFirstAvailableDay } from "@/lib/autopilot";
import { prisma } from "@/lib/prisma";

// Temporary debug route — verifies which day the scheduler is picking and
// why. Auth-gated by CRON_SECRET so it isn't world-readable.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cap = Number(process.env.DAILY_SEND_CAP ?? 30);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);

  const todayCount = await prisma.prospect.count({
    where: { scheduledInitial: { gte: today, lt: tomorrow }, status: "Scheduled" },
  });
  const pick = await pickFirstAvailableDay(cap, 30);

  return NextResponse.json({
    capFromEnv: cap,
    DAILY_SEND_CAP_raw: process.env.DAILY_SEND_CAP ?? null,
    todayUtcStart: today.toISOString(),
    todayBucketScheduledCount: todayCount,
    pickedSlotUtc: pick.toISOString(),
    pickedSlotParis: pick.toLocaleString("en-GB", { timeZone: "Europe/Paris" }),
    nowParis: new Date().toLocaleString("en-GB", { timeZone: "Europe/Paris" }),
  });
}
