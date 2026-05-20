import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const prospect = await prisma.prospect.findUnique({ where: { id } });
    if (!prospect) {
      return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    }

    await prisma.prospect.update({
      where: { id },
      data: {
        status: "Replied",
        datumOdgovora: new Date(),
        scheduledInitial: null,
        scheduledFollow1: null,
        scheduledFollow2: null,
        scheduledFollow3: null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[reply]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}
