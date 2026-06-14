import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { buildEmailPrompt, getEmailSystemPrompt, extractJsonArray } from "@/lib/emailPrompt";
import { sanitizeDashes, cleanEmailBody } from "@/lib/sanitizeDashes";
import { processDueEmails } from "@/lib/sendEmail";
import { generateMockup } from "@/lib/mockup";

const MODEL = "claude-sonnet-4-6";
const SEND_NOW_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    let body: { action: string; ids: string[]; scheduleData?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { action, ids } = body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids required niz" }, { status: 400 });
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
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL || "https://unlockd-outreach.vercel.app";

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
              system: await getEmailSystemPrompt(),
              messages: [{
                role: "user",
                content: buildEmailPrompt(prospect, {
                  compact: true,
                  nicheHint: hintByNiche.get(prospect.nisa) ?? null,
                  // Include enrichment that already exists on the prospect
                  // so manual regen produces emails consistent with the
                  // autopilot version (audit landing link, mockup ref, etc.)
                  siteSnapshot: prospect.siteSnapshot as never,
                  pagespeed: prospect.pagespeed as never,
                  decisionMakers: prospect.decisionMakers as never,
                  audit: prospect.auditFindings as never,
                  mockupUrl: prospect.mockupUrl,
                  auditUrl: `${siteUrl}/audit/${prospect.id}`,
                }),
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
                    subject: sanitizeDashes(e.subject),
                    subjectB: e.subjectB ? sanitizeDashes(e.subjectB) : null,
                    body: cleanEmailBody(e.body),
                  },
                })
              )
            );
            generated++;
          } catch (e) {
            failed.push(`${prospect.firmaNaziv}: ${e instanceof Error ? e.message : "Error"}`);
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
        return NextResponse.json({ error: "scheduledInitial required" }, { status: 400 });
      }

      const initial = new Date(scheduleData.scheduledInitial as string);
      const f1Days = Number(scheduleData.follow1Days ?? 4);
      const f2Days = Number(scheduleData.follow2Days ?? 5);
      const f3Days = Number(scheduleData.follow3Days ?? 7);

      const follow1 = new Date(initial.getTime() + f1Days * 86400000);
      const follow2 = new Date(follow1.getTime() + f2Days * 86400000);
      const follow3 = new Date(follow2.getTime() + f3Days * 86400000);
      // Breakup ~5d after F3 so the bulk-scheduled campaign mirrors the
      // autopilot cadence — last shot before the prospect goes silent.
      const breakup = new Date(follow3.getTime() + 5 * 86400000);

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
            scheduledBreakup: breakup,
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

    // ── MOCKUP ──
    // Generates a Replicate Flux Schnell mockup for any selected prospect
    // that doesn't already have one. ~3s/image, ~$0.003 each. The hero
    // image is what gets injected into F2 — biggest single conversion
    // lever for premium web prospects ("here's what your site could look
    // like").
    if (action === "mockup") {
      if (!process.env.REPLICATE_API_TOKEN) {
        return NextResponse.json(
          { error: "REPLICATE_API_TOKEN nije postavljen u Vercel Env" },
          { status: 500 }
        );
      }
      const prospects = await prisma.prospect.findMany({
        where: { id: { in: ids } },
        select: { id: true, firmaNaziv: true, nisa: true, grad: true, mockupUrl: true },
      });
      const candidates = prospects.filter((p) => !p.mockupUrl);

      let generatedCount = 0;
      const failed: string[] = [];

      // 3 in parallel — Replicate's free tier handles bursts and our function
      // budget is 60s. 5 prospects ≈ 12-15s at this concurrency.
      const concurrency = 3;
      let i = 0;
      const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
        while (true) {
          const idx = i++;
          if (idx >= candidates.length) return;
          const p = candidates[idx];
          const result = await generateMockup({
            id: p.id,
            firmaNaziv: p.firmaNaziv,
            nisa: p.nisa,
            grad: p.grad,
          });
          if (result.ok && result.url) {
            await prisma.prospect.update({
              where: { id: p.id },
              data: {
                mockupUrl: result.url,
                mockupPrompt: result.prompt ?? null,
                mockupAt: new Date(),
              },
            });
            generatedCount++;
          } else {
            failed.push(`${p.firmaNaziv}: ${result.error ?? "unknown"}`);
          }
        }
      });
      await Promise.all(workers);
      return NextResponse.json({
        success: true,
        generated: generatedCount,
        alreadyHad: prospects.length - candidates.length,
        failed,
      });
    }

    return NextResponse.json({ error: "Nepoznata akcija" }, { status: 400 });
  } catch (err) {
    console.error("[bulk]", err);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
