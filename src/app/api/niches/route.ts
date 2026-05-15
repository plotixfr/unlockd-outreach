import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [templates, niseGroups] = await Promise.all([
      prisma.nicheTemplate.findMany({ orderBy: { nisa: "asc" } }),
      prisma.prospect.groupBy({ by: ["nisa"], _count: true, orderBy: { nisa: "asc" } }),
    ]);
    return NextResponse.json({
      templates,
      activeNiches: niseGroups.map((g) => ({ nisa: g.nisa, count: g._count })),
    });
  } catch (err) {
    console.error("[niches GET]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: { nisa?: string; promptHint?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
    }
    const nisa = body.nisa?.trim();
    const promptHint = body.promptHint?.trim();
    if (!nisa) return NextResponse.json({ error: "nisa je obavezno" }, { status: 400 });
    if (!promptHint) return NextResponse.json({ error: "promptHint je obavezno" }, { status: 400 });

    const template = await prisma.nicheTemplate.upsert({
      where: { nisa },
      create: { nisa, promptHint },
      update: { promptHint },
    });
    return NextResponse.json({ success: true, template });
  } catch (err) {
    console.error("[niches POST]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const nisa = searchParams.get("nisa");
    if (!nisa) return NextResponse.json({ error: "nisa je obavezno" }, { status: 400 });
    await prisma.nicheTemplate.delete({ where: { nisa } }).catch(() => null);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[niches DELETE]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}
