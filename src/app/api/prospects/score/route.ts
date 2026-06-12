import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scrapeSite, type SiteSnapshot } from "@/lib/scrapeSite";
import { fetchPageSpeed, type PageSpeedSnapshot } from "@/lib/pagespeed";
import { scoreProspect } from "@/lib/qualityScore";

// Bound the work per invocation so we stay inside Vercel's serverless timeout.
const MAX_PER_CALL = 5;

/**
 * Scores up to MAX_PER_CALL un-scored prospects on each invocation. Each
 * prospect goes through scrape + PageSpeed + Claude scoring sequentially
 * (in parallel inside the call), so the UI typically triggers this a few
 * times in a loop until all are done.
 */
export async function POST(req: NextRequest) {
  try {
    let body: { onlyId?: string; limit?: number } = {};
    try {
      body = await req.json();
    } catch {
      // empty body — defaults are fine
    }
    const limit = Math.max(1, Math.min(MAX_PER_CALL, Number(body.limit) || MAX_PER_CALL));

    const prospects = body.onlyId
      ? await prisma.prospect.findMany({ where: { id: body.onlyId }, include: { brief: true } })
      : await prisma.prospect.findMany({
          where: { qualityScore: null },
          orderBy: { createdAt: "desc" },
          take: limit,
          include: { brief: true },
        });

    if (prospects.length === 0) {
      return NextResponse.json({ scored: 0, remaining: 0, done: true });
    }

    let scored = 0;
    const errors: string[] = [];

    for (const p of prospects) {
      try {
        let site: SiteSnapshot | null = (p.siteSnapshot as unknown as SiteSnapshot) ?? null;
        let psi: PageSpeedSnapshot | null = (p.pagespeed as unknown as PageSpeedSnapshot) ?? null;

        // Refresh missing facts.
        if (p.website && (!site || !site.ok)) {
          try {
            site = await scrapeSite(p.website);
          } catch {
            // ignore — scoring tolerates null
          }
        }
        if (p.website && !psi) {
          try {
            psi = await fetchPageSpeed(p.website);
          } catch {
            // ignore
          }
        }

        const result = await scoreProspect(
          {
            firmaNaziv: p.firmaNaziv,
            nisa: p.nisa,
            grad: p.grad,
            website: p.website,
            opisFirme: p.opisFirme,
            napomena: p.napomena,
            siteSnapshot: site,
            pagespeed: psi,
          },
          // CSV-imported prospects have no brief — generic both-groups mode.
          p.brief
            ? { niche: p.brief.niche, city: p.brief.city, country: p.brief.country, language: p.brief.language }
            : null
        );
        if (!result) {
          errors.push(`${p.firmaNaziv}: scoring vratio null`);
          continue;
        }
        const updateData: Record<string, unknown> = {
          qualityScore: result.score,
          qualityNote: result.note,
        };
        if (site) {
          updateData.siteSnapshot = site;
          updateData.siteSnapshotAt = new Date();
        }
        if (psi) {
          updateData.pagespeed = psi;
          updateData.pagespeedAt = new Date();
        }
        await prisma.prospect.update({
          where: { id: p.id },
          data: updateData as never,
        });
        scored++;
      } catch (e) {
        errors.push(`${p.firmaNaziv}: ${e instanceof Error ? e.message : "error"}`);
      }
    }

    const remaining = await prisma.prospect.count({ where: { qualityScore: null } });
    return NextResponse.json({
      scored,
      remaining,
      done: remaining === 0,
      errors: errors.slice(0, 5),
    });
  } catch (err) {
    console.error("[score]", err);
    return NextResponse.json({ error: "server error while scoring" }, { status: 500 });
  }
}
