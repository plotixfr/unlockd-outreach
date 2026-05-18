import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { STATUSI } from "@/lib/constants";

// PATCH — status only
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
      return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
    }
    if (!(STATUSI as readonly string[]).includes(status)) {
      return NextResponse.json({ error: "Nevažeći status" }, { status: 400 });
    }
    const prospect = await prisma.prospect.update({ where: { id }, data: { status } });
    return NextResponse.json({ prospect });
  } catch (err) {
    console.error("[PATCH prospect]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}

// PUT — full edit
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
    }

    const {
      firmaNaziv, kontaktIme, kontaktPozicija, website, instagram,
      nisa, grad, opisFirme, kvalitetSajta, napomena,
    } = body as Record<string, string>;

    if (!firmaNaziv?.trim()) {
      return NextResponse.json({ error: "firmaNaziv je obavezan" }, { status: 400 });
    }
    // Niche is free-form (CSV upload accepts any string); only require non-empty.
    if (nisa !== undefined && !nisa.trim()) {
      return NextResponse.json({ error: "Niša ne smije biti prazna" }, { status: 400 });
    }

    const prospect = await prisma.prospect.update({
      where: { id },
      data: {
        firmaNaziv: firmaNaziv.trim(),
        kontaktIme: kontaktIme?.trim() || null,
        kontaktPozicija: kontaktPozicija?.trim() || null,
        website: website?.trim() || null,
        instagram: instagram?.trim() || null,
        nisa: nisa?.trim() || undefined,
        grad: grad?.trim() || undefined,
        opisFirme: opisFirme?.trim() || null,
        kvalitetSajta: kvalitetSajta ? parseInt(String(kvalitetSajta), 10) : null,
        napomena: napomena?.trim() || null,
      },
    });

    return NextResponse.json({ prospect });
  } catch (err) {
    console.error("[PUT prospect]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}

// DELETE
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.prospect.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE prospect]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}
