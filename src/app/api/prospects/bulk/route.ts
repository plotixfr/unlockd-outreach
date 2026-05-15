import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { buildEmailPrompt, EMAIL_SYSTEM_PROMPT, extractJsonArray } from "@/lib/emailPrompt";
import { processDueEmails } from "@/lib/sendEmail";

const MODEL = "claude-sonnet-4-6";
const SEND_NOW_WINDOW_MS = 10 * 60 * 1000;

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
      const nichesInBatch = Array.from(new Set(prospects.map((p) => p.nisa)));
      const hintRows = await prisma.nicheTemplate.findMany({
        where: { nisa: { in: nichesInBatch } },
      });
      const hintByNiche = new Map(hintRows.map((h) => [h.nisa, h.promptHint]));

      let generated = 0;
      const failed: string[] = [];

      // Run with limited concurrency so 50-prospect uploads finish without
      // tripping the 10s function timeout AND without spamming Anthropic.
      const concurrency = 3;
      let i = 0;
      const workers = Array.from({ length: Math.min(concurrency, prospects.length) }, async () => {
        while (true) {
          const idx = i++;
          if (idx >= prospects.length) return;
          const prospect = prospects[idx];
          try {
            await prisma.email.deleteMany({ where: { prospectId: prospect.id } });

            const message = await anthropic.messages.create({
              model: MODEL,
              max_tokens: 4096,
              system: EMAIL_SYSTEM_PROMPT,
              messages: [{
                role: "user",
                content: buildEmailPrompt(prospect, { compact: true, nicheHint: hintByNiche.get(prospect.nisa) ?? null }),
              }],
            });

            const content = message.content[0];
            if (!content || content.type !== "text") throw new Error("No text content");

            const cleaned = extractJsonArray(content.text);
            const emailData: Array<{ tip: string; subject: string; subjectB?: string; body: string }> =
              JSON.parse(cleaned);

            await Promise.all(
              emailData.map((e) =>
                prisma.email.create({
                  data: {
                    prospectId: prospect.id,
                    tip: e.tip,
                    subject: e.subject,
                    subjectB: e.subjectB ?? null,
                    body: e.body,
                  },
                })
              )
            );
            generated++;
          } catch (e) {
            failed.push(`${prospect.firmaNaziv}: ${e instanceof Error ? e.message : "Greška"}`);
          }
        }
      });
      await Promise.all(workers);

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
      const scheduledIds: string[] = [];

      for (const p of prospects) {
        const hasCampaign = p.emails.some((e) => e.tip === "initial");
        if (!hasCampaign) {
          skipped.push(p.firmaNaziv);
          continue;
        }
        await prisma.prospect.update({
          where: { id: p.id },
          data: {
            status: "Scheduled",
            scheduledInitial: initial,
            scheduledFollow1: follow1,
            scheduledFollow2: follow2,
            scheduledFollow3: follow3,
          },
        });
        scheduled++;
        scheduledIds.push(p.id);
      }

      // Send any campaigns whose initial is due now (or within 10 min).
      let sentNow = 0;
      const dueNow = initial.getTime() <= Date.now() + SEND_NOW_WINDOW_MS;
      if (dueNow && scheduledIds.length > 0) {
        try {
          const { totalSent } = await processDueEmails({ onlyProspectIds: scheduledIds });
          sentNow = totalSent;
        } catch (e) {
          console.error("[bulk schedule] auto-send failed:", e);
        }
      }

      return NextResponse.json({ success: true, scheduled, skipped, sentNow });
    }

    return NextResponse.json({ error: "Nepoznata akcija" }, { status: 400 });
  } catch (err) {
    console.error("[bulk]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}
