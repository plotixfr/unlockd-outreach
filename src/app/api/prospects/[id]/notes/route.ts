import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const notes = await prisma.note.findMany({
    where: { prospectId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ notes });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let tekst: string;
  try {
    const body = await req.json();
    tekst = String(body?.tekst ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
  }
  if (!tekst) {
    return NextResponse.json({ error: "Tekst je obavezan" }, { status: 400 });
  }
  const note = await prisma.note.create({
    data: { prospectId: id, tekst },
  });
  return NextResponse.json({ note });
}
