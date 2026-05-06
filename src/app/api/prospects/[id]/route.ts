import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { STATUSI } from "@/lib/constants";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { status } = await req.json();

  if (!STATUSI.includes(status)) {
    return NextResponse.json({ error: "Status invalide" }, { status: 400 });
  }

  const prospect = await prisma.prospect.update({
    where: { id },
    data: { status },
  });

  return NextResponse.json({ prospect });
}
