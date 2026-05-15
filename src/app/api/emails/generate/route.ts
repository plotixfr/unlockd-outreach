import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { buildEmailPrompt, EMAIL_SYSTEM_PROMPT, extractJsonArray } from "@/lib/emailPrompt";

const MODEL = "claude-sonnet-4-6";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log("[generate] ANTHROPIC_API_KEY present:", !!apiKey, "| length:", apiKey?.length ?? 0);

    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY nije konfigurisan na serveru. Dodaj ga u Vercel Environment Variables." },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    let body: { prospectId?: string; regenerate?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Neispravan JSON request" }, { status: 400 });
    }

    const { prospectId, regenerate = false } = body;
    if (!prospectId) {
      return NextResponse.json({ error: "prospectId je obavezan" }, { status: 400 });
    }

    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      include: { emails: true },
    });

    if (!prospect) {
      return NextResponse.json({ error: "Prospect nije pronađen" }, { status: 404 });
    }

    if (prospect.emails.length > 0 && !regenerate) {
      return NextResponse.json({ emails: prospect.emails });
    }

    if (regenerate && prospect.emails.length > 0) {
      await prisma.email.deleteMany({ where: { prospectId } });
    }

    const nicheTemplate = await prisma.nicheTemplate.findUnique({ where: { nisa: prospect.nisa } });
    console.log(
      "[generate] Calling model:", MODEL,
      "| prospect:", prospect.firmaNaziv,
      "| niche:", prospect.nisa,
      "| hint:", nicheTemplate ? "yes" : "no"
    );

    let message: Anthropic.Message;
    try {
      message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: EMAIL_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildEmailPrompt(prospect, { nicheHint: nicheTemplate?.promptHint }) }],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[generate] Anthropic API error:", msg);
      return NextResponse.json(
        { error: `Greška Claude API: ${msg}` },
        { status: 502 }
      );
    }

    const content = message.content[0];
    if (!content || content.type !== "text") {
      console.error("[generate] Unexpected content type:", message.content);
      return NextResponse.json(
        { error: "Claude nije vratio tekstualni odgovor" },
        { status: 502 }
      );
    }

    const rawText = content.text;
    console.log("[generate] Raw response length:", rawText.length);

    let emailData: Array<{ tip: string; subject: string; subjectB: string | null; body: string }>;
    try {
      const cleaned = extractJsonArray(rawText);
      emailData = JSON.parse(cleaned);

      if (!Array.isArray(emailData) || emailData.length === 0) {
        throw new Error("Parsed result is not a non-empty array");
      }
      emailData = emailData.map((e) => ({
        tip: String(e.tip ?? "initial"),
        subject: String(e.subject ?? ""),
        subjectB: e.subjectB ? String(e.subjectB) : null,
        body: String(e.body ?? ""),
      }));
      console.log("[generate] Parsed", emailData.length, "emails OK");
    } catch (parseErr) {
      console.error("[generate] JSON parse failed:", parseErr);
      console.error("[generate] Full raw text:", rawText);
      return NextResponse.json(
        { error: "Claude vratio odgovor koji nije validan JSON. Pokušaj ponovo." },
        { status: 502 }
      );
    }

    const emails = await Promise.all(
      emailData.map((e) =>
        prisma.email.create({
          data: { prospectId, tip: e.tip, subject: e.subject, subjectB: e.subjectB ?? null, body: e.body },
        })
      )
    );

    console.log("[generate] Saved", emails.length, "emails to DB");
    return NextResponse.json({ emails });
  } catch (err) {
    console.error("[generate] Unhandled error:", err);
    return NextResponse.json(
      { error: "Serverska greška pri generisanju emailova" },
      { status: 500 }
    );
  }
}
