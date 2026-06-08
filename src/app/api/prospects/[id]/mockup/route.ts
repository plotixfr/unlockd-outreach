import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateMockup } from "@/lib/mockup";

export const maxDuration = 90;

/**
 * Generates a premium mockup for the prospect's site (Flux Schnell via
 * Replicate, persisted to Vercel Blob) and saves the URL on the prospect.
 * Idempotency: callers can pass {force: true} to regenerate; otherwise we
 * return the existing mockup if one already exists.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let body: { force?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      // empty body — fine
    }

    const prospect = await prisma.prospect.findUnique({
      where: { id },
      select: { id: true, firmaNaziv: true, nisa: true, grad: true, mockupUrl: true },
    });
    if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

    if (prospect.mockupUrl && !body.force) {
      return NextResponse.json({ ok: true, url: prospect.mockupUrl, cached: true });
    }

    const result = await generateMockup({
      id: prospect.id,
      firmaNaziv: prospect.firmaNaziv,
      nisa: prospect.nisa,
      grad: prospect.grad,
    });

    if (!result.ok || !result.url) {
      return NextResponse.json({ error: result.error || "Error" }, { status: 502 });
    }

    await prisma.prospect.update({
      where: { id },
      data: {
        mockupUrl: result.url,
        mockupPrompt: result.prompt,
        mockupAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, url: result.url, prompt: result.prompt });
  } catch (err) {
    console.error("[mockup]", err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
