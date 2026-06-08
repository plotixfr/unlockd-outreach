import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let body: { vrijednostProjekta?: number; datumKonverzije?: string; napomena?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { vrijednostProjekta, datumKonverzije, napomena } = body;

    if (!vrijednostProjekta || vrijednostProjekta <= 0) {
      return NextResponse.json({ error: "project value is required" }, { status: 400 });
    }

    const prospect = await prisma.prospect.findUnique({ where: { id } });
    if (!prospect) {
      return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    }

    const [conversion] = await Promise.all([
      prisma.conversion.create({
        data: {
          prospectId: id,
          vrijednostProjekta,
          datumKonverzije: datumKonverzije ? new Date(datumKonverzije) : new Date(),
          napomena: napomena?.trim() || null,
        },
      }),
      prisma.prospect.update({
        where: { id },
        data: {
          status: "Converted",
          scheduledFollow1: null,
          scheduledFollow2: null,
          scheduledFollow3: null,
        },
      }),
    ]);

    return NextResponse.json({ success: true, conversion });
  } catch (err) {
    console.error("[conversion]", err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
