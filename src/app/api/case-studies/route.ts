import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const items = await prisma.caseStudy.findMany({ orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  try {
    let body: {
      title?: string;
      nisa?: string;
      summary?: string;
      metricLabel?: string;
      metricValue?: string;
      imageUrl?: string;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
    }
    const title = body.title?.trim();
    const nisa = body.nisa?.trim();
    const summary = body.summary?.trim();
    if (!title || !nisa || !summary) {
      return NextResponse.json(
        { error: "title, nisa i summary su obavezni" },
        { status: 400 }
      );
    }
    const item = await prisma.caseStudy.create({
      data: {
        title,
        nisa,
        summary,
        metricLabel: body.metricLabel?.trim() || null,
        metricValue: body.metricValue?.trim() || null,
        imageUrl: body.imageUrl?.trim() || null,
      },
    });
    return NextResponse.json({ item });
  } catch (err) {
    console.error("[case-studies POST]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}
