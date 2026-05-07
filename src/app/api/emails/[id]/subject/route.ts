import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: { activeSubject?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
    }

    const { activeSubject } = body;
    if (activeSubject !== "A" && activeSubject !== "B") {
      return NextResponse.json({ error: "activeSubject mora biti A ili B" }, { status: 400 });
    }

    const email = await prisma.email.update({
      where: { id },
      data: { activeSubject },
    });

    return NextResponse.json({ success: true, activeSubject: email.activeSubject });
  } catch (err) {
    console.error("[subject]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}
