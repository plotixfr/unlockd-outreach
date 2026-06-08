import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string") data.name = body.name.trim();
    if (typeof body.niche === "string") data.niche = body.niche.trim();
    if ("city" in body)
      data.city = typeof body.city === "string" && body.city.trim() ? body.city.trim() : null;
    if (typeof body.country === "string") data.country = body.country.trim();
    if ("query" in body)
      data.query = typeof body.query === "string" && body.query.trim() ? body.query.trim() : null;
    if ("minRating" in body)
      data.minRating = typeof body.minRating === "number" ? body.minRating : null;
    if ("minReviews" in body)
      data.minReviews = typeof body.minReviews === "number" ? Math.round(body.minReviews) : null;
    if (typeof body.maxPerRun === "number")
      data.maxPerRun = Math.max(1, Math.min(20, Math.round(body.maxPerRun)));
    if (typeof body.qualityThreshold === "number")
      data.qualityThreshold = Math.max(1, Math.min(10, Math.round(body.qualityThreshold)));
    if (typeof body.autoGenerate === "boolean") data.autoGenerate = body.autoGenerate;
    if (typeof body.autoSchedule === "boolean") data.autoSchedule = body.autoSchedule;
    if (typeof body.active === "boolean") data.active = body.active;

    const brief = await prisma.searchBrief.update({ where: { id }, data });
    return NextResponse.json({ brief });
  } catch (err) {
    console.error("[briefs PUT]", err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.searchBrief.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[briefs DELETE]", err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
