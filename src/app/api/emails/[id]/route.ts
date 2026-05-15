import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: { subject?: string; subjectB?: string | null; body?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
    }

    const data: { subject?: string; subjectB?: string | null; body?: string } = {};
    if (typeof body.subject === "string") {
      if (body.subject.trim().length === 0) {
        return NextResponse.json({ error: "subject ne smije biti prazan" }, { status: 400 });
      }
      data.subject = body.subject.trim();
    }
    if (body.subjectB === null || body.subjectB === "") {
      data.subjectB = null;
    } else if (typeof body.subjectB === "string") {
      data.subjectB = body.subjectB.trim();
    }
    if (typeof body.body === "string") {
      if (body.body.trim().length === 0) {
        return NextResponse.json({ error: "body ne smije biti prazan" }, { status: 400 });
      }
      data.body = body.body;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Ništa za ažurirati" }, { status: 400 });
    }

    const existing = await prisma.email.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Email nije pronađen" }, { status: 404 });
    }
    if (existing.poslat) {
      return NextResponse.json(
        { error: "Email je već poslan i ne može se mijenjati" },
        { status: 400 }
      );
    }

    const email = await prisma.email.update({ where: { id }, data });
    return NextResponse.json({ success: true, email });
  } catch (err) {
    console.error("[email PATCH]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}
