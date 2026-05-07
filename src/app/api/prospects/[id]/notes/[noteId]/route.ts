import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { noteId } = await params;
  try {
    await prisma.note.delete({ where: { id: noteId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Bilješka nije pronađena" }, { status: 404 });
  }
}
