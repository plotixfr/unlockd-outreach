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
    if (typeof body.title === "string") data.title = body.title.trim();
    if (typeof body.nisa === "string") data.nisa = body.nisa.trim();
    if (typeof body.summary === "string") data.summary = body.summary.trim();
    if ("metricLabel" in body)
      data.metricLabel = typeof body.metricLabel === "string" && body.metricLabel.trim() ? body.metricLabel.trim() : null;
    if ("metricValue" in body)
      data.metricValue = typeof body.metricValue === "string" && body.metricValue.trim() ? body.metricValue.trim() : null;
    if ("imageUrl" in body)
      data.imageUrl = typeof body.imageUrl === "string" && body.imageUrl.trim() ? body.imageUrl.trim() : null;
    if (typeof body.active === "boolean") data.active = body.active;

    const item = await prisma.caseStudy.update({ where: { id }, data });
    return NextResponse.json({ item });
  } catch (err) {
    console.error("[case-studies PUT]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.caseStudy.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[case-studies DELETE]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}
