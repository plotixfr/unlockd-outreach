import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { buildEmailPrompt, getEmailSystemPrompt, extractJsonArray, type PromptCaseStudy } from "@/lib/emailPrompt";
import { scrapeSite, type SiteSnapshot } from "@/lib/scrapeSite";
import { fetchPageSpeed, type PageSpeedSnapshot } from "@/lib/pagespeed";
import { findDecisionMakers, type DecisionMakerResult } from "@/lib/decisionMakers";

const MODEL = "claude-sonnet-4-6";
// Re-scrape if the cached snapshot is older than this — sites change.
const SNAPSHOT_TTL_DAYS = 30;
const PSI_TTL_DAYS = 14;
const DM_TTL_DAYS = 60;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    console.log("[generate] ANTHROPIC_API_KEY present:", !!apiKey, "| length:", apiKey?.length ?? 0);

    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured on server. Add it in Vercel Environment Variables." },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    let body: { prospectId?: string; regenerate?: boolean; rescrape?: boolean };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request" }, { status: 400 });
    }

    const { prospectId, regenerate = false, rescrape = false } = body;
    if (!prospectId) {
      return NextResponse.json({ error: "prospectId required" }, { status: 400 });
    }

    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      include: { emails: true },
    });

    if (!prospect) {
      return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    }

    if (prospect.emails.length > 0 && !regenerate) {
      return NextResponse.json({ emails: prospect.emails });
    }

    if (regenerate && prospect.emails.length > 0) {
      await prisma.email.deleteMany({ where: { prospectId } });
    }

    // ── Enrichment fan-out ──
    // Cached unless stale or `rescrape` forces. All three calls run in parallel
    // so the slowest one (PSI, ~10-20s) doesn't add to total latency.
    let snapshot: SiteSnapshot | null = null;
    let pagespeed: PageSpeedSnapshot | null = null;
    let decisionMakers: DecisionMakerResult | null = null;

    if (prospect.website) {
      const now = Date.now();
      const siteStale =
        !prospect.siteSnapshotAt ||
        now - prospect.siteSnapshotAt.getTime() > SNAPSHOT_TTL_DAYS * 86400000;
      const psiStale =
        !prospect.pagespeedAt ||
        now - prospect.pagespeedAt.getTime() > PSI_TTL_DAYS * 86400000;
      // Decision makers don't have their own *At column — bucket them with the
      // site snapshot's TTL since they share the same scrape lifecycle.
      const dmStale =
        !prospect.siteSnapshotAt ||
        now - prospect.siteSnapshotAt.getTime() > DM_TTL_DAYS * 86400000 ||
        !prospect.decisionMakers;

      // Reuse cached unless explicit rescrape or staleness.
      snapshot = rescrape || siteStale || !prospect.siteSnapshot
        ? null
        : (prospect.siteSnapshot as unknown as SiteSnapshot);
      pagespeed = rescrape || psiStale || !prospect.pagespeed
        ? null
        : (prospect.pagespeed as unknown as PageSpeedSnapshot);
      decisionMakers = rescrape || dmStale
        ? null
        : (prospect.decisionMakers as unknown as DecisionMakerResult);

      const [siteResult, psiResult, dmResult] = await Promise.all([
        snapshot ? Promise.resolve(snapshot) : scrapeSite(prospect.website).catch((e) => {
          console.error("[generate] scrape error:", e);
          return null;
        }),
        pagespeed ? Promise.resolve(pagespeed) : fetchPageSpeed(prospect.website).catch((e) => {
          console.error("[generate] PSI error:", e);
          return null;
        }),
        decisionMakers ? Promise.resolve(decisionMakers) : findDecisionMakers(prospect.website).catch((e) => {
          console.error("[generate] DM error:", e);
          return null;
        }),
      ]);
      snapshot = siteResult;
      pagespeed = psiResult;
      decisionMakers = dmResult;

      // Persist freshly fetched data. We do this opportunistically — if one of
      // the three fields didn't refresh we just leave the existing value alone.
      const updateData: Record<string, unknown> = {};
      if (siteResult && (rescrape || siteStale || !prospect.siteSnapshot)) {
        updateData.siteSnapshot = siteResult;
        updateData.siteSnapshotAt = new Date();
      }
      if (psiResult && (rescrape || psiStale || !prospect.pagespeed)) {
        updateData.pagespeed = psiResult;
        updateData.pagespeedAt = new Date();
      }
      if (dmResult && (rescrape || dmStale)) {
        updateData.decisionMakers = dmResult;
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.prospect.update({ where: { id: prospectId }, data: updateData });
      }

      console.log(
        "[generate] enrichment:",
        "| site:", snapshot?.ok ? "ok" : "no",
        "| psi:", pagespeed?.ok ? `${pagespeed.performanceScore}/100` : "no",
        "| dm:", decisionMakers?.people?.length ?? 0
      );
    }

    // Pull the most relevant case study for this niche (and fall back to any
    // active one if the niche doesn't have a dedicated study yet).
    const caseStudyRow =
      (await prisma.caseStudy.findFirst({
        where: { nisa: prospect.nisa, active: true },
        orderBy: { updatedAt: "desc" },
      })) ??
      (await prisma.caseStudy.findFirst({
        where: { active: true },
        orderBy: { updatedAt: "desc" },
      }));
    const caseStudy: PromptCaseStudy | null = caseStudyRow
      ? {
          title: caseStudyRow.title,
          summary: caseStudyRow.summary,
          metricLabel: caseStudyRow.metricLabel,
          metricValue: caseStudyRow.metricValue,
        }
      : null;

    const nicheTemplate = await prisma.nicheTemplate.findUnique({ where: { nisa: prospect.nisa } });
    console.log(
      "[generate] Calling model:", MODEL,
      "| prospect:", prospect.firmaNaziv,
      "| niche:", prospect.nisa,
      "| hint:", nicheTemplate ? "yes" : "no",
      "| caseStudy:", caseStudy ? "yes" : "no"
    );

    let message: Anthropic.Message;
    try {
      message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: await getEmailSystemPrompt(),
        messages: [
          {
            role: "user",
            content: buildEmailPrompt(prospect, {
              nicheHint: nicheTemplate?.promptHint,
              siteSnapshot: snapshot,
              pagespeed,
              decisionMakers,
              caseStudy,
            }),
          },
        ],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[generate] Anthropic API error:", msg);
      return NextResponse.json(
        { error: `Claude API error: ${msg}` },
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
        { error: "Claude returned invalid JSON. Try again." },
        { status: 502 }
      );
    }

    const emails = await Promise.all(
      emailData.map((e) =>
        prisma.email.create({
          data: {
            prospectId,
            tip: e.tip,
            subject: e.subject,
            subjectB: e.subjectB ?? null,
            body: e.body,
            activeSubject: e.subjectB && Math.random() < 0.5 ? "B" : "A",
          },
        })
      )
    );

    console.log("[generate] Saved", emails.length, "emails to DB");
    return NextResponse.json({ emails });
  } catch (err) {
    console.error("[generate] Unhandled error:", err);
    return NextResponse.json(
      { error: "server error while generating emails" },
      { status: 500 }
    );
  }
}
