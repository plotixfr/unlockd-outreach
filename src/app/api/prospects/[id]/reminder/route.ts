import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { datum?: string | null; napomena?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
  }

  const podsjetnikDatum = body.datum ? new Date(body.datum) : null;
  const podsjetnikNapomena = body.napomena?.trim() || null;

  const prospect = await prisma.prospect.update({
    where: { id },
    data: { podsjetnikDatum, podsjetnikNapomena },
  });

  return NextResponse.json({ success: true, prospect });
}
