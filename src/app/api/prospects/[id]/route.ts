import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { STATUSI } from "@/lib/constants";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let status: string;
    try {
      const body = await req.json();
      status = body?.status;
    } catch {
      return NextResponse.json(
        { error: "Neispravan JSON request" },
        { status: 400 }
      );
    }

    if (!(STATUSI as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: `Status mora biti: ${STATUSI.join(", ")}` },
        { status: 400 }
      );
    }

    const prospect = await prisma.prospect.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ prospect });
  } catch (err) {
    console.error("[prospects/id] Unhandled error:", err);
    return NextResponse.json(
      { error: "Serverska greška pri ažuriranju statusa" },
      { status: 500 }
    );
  }
}
