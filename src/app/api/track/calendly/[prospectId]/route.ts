import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SENDER_CALENDLY } from "@/lib/signature";

/**
 * 302-redirects to the real Calendly link while logging the click against the
 * prospect's most recent sent email. Used to surface "clicked but didn't book"
 * warm leads in the dashboard — among the highest-converting follow-up cues
 * in B2B outreach.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ prospectId: string }> }
) {
  const { prospectId } = await params;

  // Best-effort logging — never block the redirect on a DB failure. Mark the
  // most recently sent email as clicked, and bump the prospect updatedAt.
  try {
    const latestEmail = await prisma.email.findFirst({
      where: { prospectId, poslat: true },
      orderBy: { poslatAt: "desc" },
      select: { id: true, calendlyClicked: true },
    });
    if (latestEmail && !latestEmail.calendlyClicked) {
      await prisma.email.update({
        where: { id: latestEmail.id },
        data: { calendlyClicked: true, calendlyClickedAt: new Date() },
      });
    }
  } catch (e) {
    console.error("[track/calendly] log failed (continuing to redirect):", e);
  }

  return NextResponse.redirect(SENDER_CALENDLY, { status: 302 });
}
