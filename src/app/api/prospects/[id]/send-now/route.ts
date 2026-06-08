import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendOneEmail, TIP_TO_STATUS } from "@/lib/sendEmail";

/**
 * Fires the next due email for a prospect immediately — bypasses the cron
 * schedule. Used when the operator sees a hot lead and wants to push the
 * next touch RIGHT NOW instead of waiting for tomorrow's send window.
 *
 * Picks the next unsent email in the canonical sequence order, respecting
 * the prospect's current status:
 *   New          → initial
 *   Emailed      → follow1
 *   Follow1      → follow2
 *   Follow2      → follow3
 *   Follow3      → breakup
 *
 * If the prospect is Replied / Converted / Unsubscribed / Bounced, refuses.
 * If the next email doesn't exist yet (auto-gen didn't run), refuses with a
 * helpful "click Generate Emails first" message.
 */

const STATUS_TO_NEXT_TIP: Record<string, string> = {
  New: "initial",
  Scheduled: "initial",
  Emailed: "follow1",
  Follow1: "follow2",
  Follow2: "follow3",
  Follow3: "breakup",
};

const TERMINAL_STATUSES = new Set(["Replied", "Converted", "Unsubscribed", "Bounced"]);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const prospect = await prisma.prospect.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      firmaNaziv: true,
      emails: {
        select: { id: true, tip: true, poslat: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  if (TERMINAL_STATUSES.has(prospect.status)) {
    return NextResponse.json(
      { error: `Prospect je u terminalnom statusu (${prospect.status}) — slanje preskočeno.` },
      { status: 400 }
    );
  }

  const nextTip = STATUS_TO_NEXT_TIP[prospect.status];
  if (!nextTip) {
    return NextResponse.json(
      { error: `Status "${prospect.status}" nema definisan sljedeći email.` },
      { status: 400 }
    );
  }

  const nextEmail = prospect.emails.find((e) => e.tip === nextTip && !e.poslat);
  if (!nextEmail) {
    return NextResponse.json(
      {
        error: `Nema spreman ${nextTip} email. Klikni "Generate Emails" da Claude napiše kampanju.`,
      },
      { status: 400 }
    );
  }

  const result = await sendOneEmail(nextEmail.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Send failed" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    tip: nextTip,
    nextStatus: TIP_TO_STATUS[nextTip]?.status ?? prospect.status,
    resendId: result.resendId,
  });
}
