import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processDueEmails } from "@/lib/sendEmail";

const SEND_NOW_WINDOW_MS = 10 * 60 * 1000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: {
      scheduledInitial?: string;
      follow1Days?: number;
      follow2Days?: number;
      follow3Days?: number;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
    }

    const { scheduledInitial, follow1Days = 4, follow2Days = 5, follow3Days = 7 } = body;

    if (!scheduledInitial) {
      return NextResponse.json({ error: "scheduledInitial je obavezan" }, { status: 400 });
    }

    const prospect = await prisma.prospect.findUnique({
      where: { id },
      include: { emails: { select: { tip: true } } },
    });

    if (!prospect) {
      return NextResponse.json({ error: "Prospect nije pronađen" }, { status: 404 });
    }

    const emailTips = new Set(prospect.emails.map((e) => e.tip));
    if (!emailTips.has("initial")) {
      return NextResponse.json(
        { error: "Generiši emailove prije pokretanja kampanje" },
        { status: 400 }
      );
    }

    const initial = new Date(scheduledInitial);
    const follow1 = new Date(initial.getTime() + follow1Days * 86400000);
    const follow2 = new Date(follow1.getTime() + follow2Days * 86400000);
    const follow3 = new Date(follow2.getTime() + follow3Days * 86400000);

    await prisma.prospect.update({
      where: { id },
      data: {
        status: "Scheduled",
        scheduledInitial: initial,
        scheduledFollow1: follow1,
        scheduledFollow2: follow2,
        scheduledFollow3: follow3,
      },
    });

    // If the start time is now or already in the past (within 10 min window),
    // trigger sending immediately so the user doesn't wait for the daily cron.
    let sentNow = 0;
    const dueNow = initial.getTime() <= Date.now() + SEND_NOW_WINDOW_MS;
    if (dueNow) {
      try {
        const { totalSent } = await processDueEmails({ onlyProspectIds: [id] });
        sentNow = totalSent;
      } catch (e) {
        console.error("[schedule] auto-send failed:", e);
      }
    }

    return NextResponse.json({
      success: true,
      sentNow,
      dates: { initial, follow1, follow2, follow3 },
    });
  } catch (err) {
    console.error("[schedule]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}
