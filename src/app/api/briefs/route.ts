import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const briefs = await prisma.searchBrief.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { prospects: true } },
      runs: { orderBy: { startedAt: "desc" }, take: 1 },
    },
  });
  return NextResponse.json({ briefs });
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const niche = typeof body.niche === "string" ? body.niche.trim() : "";
    if (!name || !niche) {
      return NextResponse.json({ error: "name i niche su obavezni" }, { status: 400 });
    }
    const brief = await prisma.searchBrief.create({
      data: {
        name,
        niche,
        city: typeof body.city === "string" && body.city.trim() ? body.city.trim() : null,
        country: typeof body.country === "string" && body.country.trim() ? body.country.trim() : "FR",
        query: typeof body.query === "string" && body.query.trim() ? body.query.trim() : null,
        minRating: typeof body.minRating === "number" ? body.minRating : null,
        minReviews: typeof body.minReviews === "number" ? Math.round(body.minReviews) : null,
        maxPerRun: typeof body.maxPerRun === "number" ? Math.max(1, Math.min(20, Math.round(body.maxPerRun))) : 5,
        qualityThreshold:
          typeof body.qualityThreshold === "number"
            ? Math.max(1, Math.min(10, Math.round(body.qualityThreshold)))
            : 6,
        autoGenerate: body.autoGenerate !== false,
        autoSchedule: body.autoSchedule !== false,
        active: body.active !== false,
      },
    });
    return NextResponse.json({ brief });
  } catch (err) {
    console.error("[briefs POST]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}
