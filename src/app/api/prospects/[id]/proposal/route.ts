import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateProposal } from "@/lib/proposal";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";

export const maxDuration = 60;

/**
 * Generates a tailored French proposal for the prospect and persists it as
 * JSON. Returning prospect ?force=true regenerates with a fresh Claude call.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: { force?: boolean; recommendedTier?: "Essential" | "Pro" | "Bespoke" } = {};
    try {
      body = await req.json();
    } catch {
      // empty body
    }

    const prospect = await prisma.prospect.findUnique({ where: { id } });
    if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

    if (prospect.proposalContent && !body.force) {
      return NextResponse.json({ ok: true, content: prospect.proposalContent, cached: true });
    }

    const content = await generateProposal({
      firmaNaziv: prospect.firmaNaziv,
      kontaktIme: prospect.kontaktIme,
      nisa: prospect.nisa,
      grad: prospect.grad,
      website: prospect.website,
      qualityScore: prospect.qualityScore,
      qualityNote: prospect.qualityNote,
      siteSnapshot: (prospect.siteSnapshot as unknown as SiteSnapshot | null) ?? null,
      pagespeed: (prospect.pagespeed as unknown as PageSpeedSnapshot | null) ?? null,
      recommendedTier: body.recommendedTier,
    });

    if (!content) {
      return NextResponse.json({ error: "Claude nije vratio validan JSON" }, { status: 502 });
    }

    await prisma.prospect.update({
      where: { id },
      data: { proposalContent: content as unknown as object, proposalAt: new Date() },
    });

    return NextResponse.json({ ok: true, content });
  } catch (err) {
    console.error("[proposal]", err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
