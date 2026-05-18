import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractStyle, buildStyleDescription } from "@/lib/voiceProfile";

export const maxDuration = 60;

/**
 * GET — returns the most recently extracted active voice (or null).
 * POST — accepts samples[], runs Claude extraction, persists, returns it.
 */

export async function GET() {
  const row = await prisma.operatorVoice.findFirst({
    where: { active: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ voice: row });
}

export async function POST(req: NextRequest) {
  let body: { samples?: string[]; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
  }

  const samples = Array.isArray(body.samples)
    ? body.samples.map((s) => String(s).trim()).filter((s) => s.length > 50)
    : [];
  if (samples.length < 1) {
    return NextResponse.json({ error: "Trebaš barem 1 email (min 50 znakova)" }, { status: 400 });
  }
  if (samples.length > 10) {
    return NextResponse.json({ error: "Max 10 emaila" }, { status: 400 });
  }

  const extracted = await extractStyle(samples);
  if (!extracted) {
    return NextResponse.json({ error: "Claude nije mogao izvući stil" }, { status: 502 });
  }

  const styleDescription = buildStyleDescription(extracted);

  // Single active row policy — deactivate older voices so getActiveVoice always
  // returns the most recent extraction.
  await prisma.operatorVoice.updateMany({ data: { active: false } });
  const voice = await prisma.operatorVoice.create({
    data: {
      name: body.name?.trim() || "Default",
      samples: samples as unknown as object,
      styleDescription,
      active: true,
    },
  });

  return NextResponse.json({ voice, extracted });
}

export async function DELETE() {
  await prisma.operatorVoice.deleteMany({});
  return NextResponse.json({ ok: true });
}
