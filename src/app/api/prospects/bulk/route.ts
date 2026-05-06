import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `Tu es un expert en développement web haut de gamme. Tu travailles pour Unlockd.art, un studio parisien qui crée des sites web premium pour l'hôtellerie, l'architecture et l'immobilier. Tu dois écrire des cold emails très personnalisés, courts, professionnels et élégants. Jamais agressifs. Toujours en français impeccable.

IMPORTANT: Respond ONLY with a valid JSON array. No explanation, no markdown, no code blocks. Just the raw JSON array starting with [ and ending with ].`;

const NICHE_FR: Record<string, string> = {
  Hotel: "hôtellerie", Restaurant: "restauration",
  Architecture: "architecture", Property: "immobilier",
};

function buildPrompt(p: { firmaNaziv: string; kontaktIme: string | null; kontaktPozicija: string | null; nisa: string; grad: string; website: string | null; instagram: string | null; opisFirme: string | null; kvalitetSajta: number | null; napomena: string | null }) {
  const nicheLabel = NICHE_FR[p.nisa] ?? p.nisa;
  const contact = [p.kontaktIme, p.kontaktPozicija].filter(Boolean).join(", ");
  return `Génère 4 cold emails pour: ${p.firmaNaziv}, secteur ${nicheLabel}, ${p.grad}. Contact: ${contact || "N/A"}. Site: ${p.website || "Pas de site"}. Description: ${p.opisFirme || "N/A"}. Qualité site: ${p.kvalitetSajta ?? "N/A"}/5.

Types: "initial","follow1","follow2","follow3". Règles: français, HTML simple, max 120 mots, signature Temim/Unlockd.art.

Return ONLY: [{"tip":"initial","subject":"...","body":"<p>...</p>"},{"tip":"follow1","subject":"...","body":"<p>...</p>"},{"tip":"follow2","subject":"...","body":"<p>...</p>"},{"tip":"follow3","subject":"...","body":"<p>...</p>"}]`;
}

function extractJsonArray(text: string): string {
  const s = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  return start !== -1 && end > start ? s.slice(start, end + 1) : s;
}

export async function POST(req: NextRequest) {
  try {
    let body: { action: string; ids: string[]; scheduleData?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
    }

    const { action, ids } = body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids je obavezan niz" }, { status: 400 });
    }

    // ── DELETE ──
    if (action === "delete") {
      await prisma.prospect.deleteMany({ where: { id: { in: ids } } });
      return NextResponse.json({ success: true, deleted: ids.length });
    }

    // ── GENERATE ──
    if (action === "generate") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ error: "ANTHROPIC_API_KEY nije konfigurisan" }, { status: 500 });
      }
      const anthropic = new Anthropic({ apiKey });

      const prospects = await prisma.prospect.findMany({
        where: { id: { in: ids } },
      });

      let generated = 0;
      const failed: string[] = [];

      for (const prospect of prospects) {
        try {
          await prisma.email.deleteMany({ where: { prospectId: prospect.id } });

          const message = await anthropic.messages.create({
            model: MODEL, max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: buildPrompt(prospect) }],
          });

          const content = message.content[0];
          if (!content || content.type !== "text") throw new Error("No text content");

          const cleaned = extractJsonArray(content.text);
          const emailData: Array<{ tip: string; subject: string; body: string }> = JSON.parse(cleaned);

          await Promise.all(
            emailData.map((e) =>
              prisma.email.create({
                data: { prospectId: prospect.id, tip: e.tip, subject: e.subject, body: e.body },
              })
            )
          );
          generated++;
        } catch (e) {
          failed.push(`${prospect.firmaNaziv}: ${e instanceof Error ? e.message : "Greška"}`);
        }
      }

      return NextResponse.json({ success: true, generated, failed });
    }

    // ── SCHEDULE ──
    if (action === "schedule") {
      const { scheduleData } = body;
      if (!scheduleData?.scheduledInitial) {
        return NextResponse.json({ error: "scheduledInitial je obavezan" }, { status: 400 });
      }

      const initial = new Date(scheduleData.scheduledInitial as string);
      const f1Days = Number(scheduleData.follow1Days ?? 4);
      const f2Days = Number(scheduleData.follow2Days ?? 5);
      const f3Days = Number(scheduleData.follow3Days ?? 7);

      const follow1 = new Date(initial.getTime() + f1Days * 86400000);
      const follow2 = new Date(follow1.getTime() + f2Days * 86400000);
      const follow3 = new Date(follow2.getTime() + f3Days * 86400000);

      const prospects = await prisma.prospect.findMany({
        where: { id: { in: ids } },
        include: { emails: { select: { tip: true } } },
      });

      let scheduled = 0;
      const skipped: string[] = [];

      for (const p of prospects) {
        const hasCampaign = p.emails.some((e) => e.tip === "initial");
        if (!hasCampaign) {
          skipped.push(p.firmaNaziv);
          continue;
        }
        await prisma.prospect.update({
          where: { id: p.id },
          data: { status: "Scheduled", scheduledInitial: initial, scheduledFollow1: follow1, scheduledFollow2: follow2, scheduledFollow3: follow3 },
        });
        scheduled++;
      }

      return NextResponse.json({ success: true, scheduled, skipped });
    }

    return NextResponse.json({ error: "Nepoznata akcija" }, { status: 400 });
  } catch (err) {
    console.error("[bulk]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}
