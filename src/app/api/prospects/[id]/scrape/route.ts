import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scrapeSite } from "@/lib/scrapeSite";

/**
 * Manual re-scrape trigger. Updates the prospect's siteSnapshot in-place so
 * the scouting report and the next email regeneration both pick up fresh
 * facts. Returns the snapshot payload so the UI can render it immediately.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const prospect = await prisma.prospect.findUnique({
      where: { id },
      select: { id: true, website: true },
    });
    if (!prospect) {
      return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    }
    if (!prospect.website) {
      return NextResponse.json({ error: "Prospect nema website" }, { status: 400 });
    }

    const snapshot = await scrapeSite(prospect.website);
    await prisma.prospect.update({
      where: { id },
      data: {
        siteSnapshot: snapshot as unknown as object,
        siteSnapshotAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, snapshot });
  } catch (err) {
    console.error("[scrape]", err);
    return NextResponse.json({ error: "Serverska greška pri scrape-u" }, { status: 500 });
  }
}
