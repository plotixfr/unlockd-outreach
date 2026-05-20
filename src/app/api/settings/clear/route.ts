import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Full data wipe — deletes every prospect (cascade-deletes Email, Reply,
 * Note, Conversion) and all DiscoveryRun history. Keeps configuration:
 * SearchBrief, CaseStudy, NicheTemplate. Use to start fresh.
 */
export async function DELETE() {
  try {
    const [discoveryRuns, prospects] = await Promise.all([
      prisma.discoveryRun.deleteMany({}),
      prisma.prospect.deleteMany({}),
    ]);
    return NextResponse.json({
      success: true,
      deleted: {
        prospects: prospects.count,
        discoveryRuns: discoveryRuns.count,
      },
    });
  } catch (err) {
    console.error("[settings/clear]", err);
    return NextResponse.json({ error: "Error brisanju baze" }, { status: 500 });
  }
}
