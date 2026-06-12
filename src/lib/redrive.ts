/**
 * Re-drive pass for prospects stranded in "New": the autopilot's per-place
 * pipeline (score → generate → schedule) is best-effort, so a Claude timeout
 * or a killed function used to leave the prospect in limbo forever. This
 * pass re-runs ONLY the missing stages, with attempt tracking, exponential
 * backoff, and a hard terminal state.
 *
 * The critical distinction:
 *   - "errored during scoring/generation" = FAILURE  → retried here.
 *   - "scored below the brief threshold"  = DECISION → never retried here
 *     (a separate repair script handles historical mis-scorings).
 *   - brief.autoGenerate/autoSchedule = false = MANUAL → never auto-driven.
 *
 * Idempotency: each candidate is CLAIMED (attemptCount+1, lastAttemptAt=now)
 * before any work, so a concurrent cron fire skips it via backoff; email
 * creation re-checks the email count right before insert; actual sends are
 * separately guarded by Email.poslat in sendOneEmail — a retry can never
 * double-send or double-create.
 */

import { prisma } from "@/lib/prisma";
import { scoreProspect } from "@/lib/qualityScore";
import { generateEmailsInline, scheduleInline } from "@/lib/autopilot";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";
import type { DecisionMakerResult } from "@/lib/decisionMakers";

export const MAX_ATTEMPTS = 3;
export const RETRY_BASE_MS = 2 * 3600_000; // 2h, doubling per attempt
const DEFAULT_BATCH = Number(process.env.REDRIVE_BATCH ?? 5);

export type RedriveAction =
  | "retry-score"
  | "retry-generate"
  | "retry-schedule"
  | "decision"
  | "manual"
  | "terminal"
  | "none";

export interface RedriveProspectShape {
  status: string;
  briefId: string | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
  qualityScore: number | null;
  emailCount: number;
}

export interface RedriveBriefShape {
  qualityThreshold: number;
  autoGenerate: boolean;
  autoSchedule: boolean;
}

/** Pure: what (if anything) should the re-drive do with this prospect? */
export function classifyForRetry(
  p: RedriveProspectShape,
  brief: RedriveBriefShape | null
): RedriveAction {
  if (p.status !== "New" || !p.briefId || !brief) return "none";
  if (p.attemptCount >= MAX_ATTEMPTS) return "terminal";
  if (p.qualityScore === null) return "retry-score";
  if (p.qualityScore < brief.qualityThreshold) return "decision";
  if (p.emailCount === 0) return brief.autoGenerate ? "retry-generate" : "manual";
  return brief.autoSchedule ? "retry-schedule" : "manual";
}

/** Pure: has the exponential backoff window for the next attempt elapsed? */
export function backoffElapsed(
  p: { attemptCount: number; lastAttemptAt: Date | null },
  now: Date = new Date()
): boolean {
  if (!p.lastAttemptAt) return true;
  const wait = RETRY_BASE_MS * 2 ** Math.max(0, p.attemptCount - 1);
  return now.getTime() - p.lastAttemptAt.getTime() >= wait;
}

export interface RedriveSummary {
  examined: number;
  retried: number;
  advanced: number;
  failedTerminal: number;
  errors: string[];
}

export async function runRedrivePass(limit: number = DEFAULT_BATCH): Promise<RedriveSummary> {
  const summary: RedriveSummary = { examined: 0, retried: 0, advanced: 0, failedTerminal: 0, errors: [] };

  const candidates = await prisma.prospect.findMany({
    where: { status: "New", briefId: { not: null } },
    include: { brief: true, _count: { select: { emails: true } } },
    orderBy: { createdAt: "asc" },
  });
  summary.examined = candidates.length;

  for (const p of candidates) {
    const action = classifyForRetry(
      {
        status: p.status,
        briefId: p.briefId,
        attemptCount: p.attemptCount,
        lastAttemptAt: p.lastAttemptAt,
        qualityScore: p.qualityScore,
        emailCount: p._count.emails,
      },
      p.brief
    );

    if (action === "terminal") {
      // Retries exhausted — explicit Failed state, never silent limbo. The
      // stored lastError says which stage kept dying.
      await prisma.prospect.update({
        where: { id: p.id },
        data: { status: "Failed", lastError: p.lastError ?? "retries exhausted" },
      });
      summary.failedTerminal++;
      continue;
    }
    if (action !== "retry-score" && action !== "retry-generate" && action !== "retry-schedule") continue;
    if (!backoffElapsed(p)) continue;
    if (summary.retried >= limit) continue; // batch cap — each retry can cost Claude calls

    // Claim BEFORE working: a concurrent fire now sees a fresh lastAttemptAt
    // and skips via backoff.
    summary.retried++;
    await prisma.prospect.update({
      where: { id: p.id },
      data: { attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
    });

    try {
      const brief = p.brief!;
      const ctx = {
        site: (p.siteSnapshot as unknown as SiteSnapshot | null) ?? null,
        psi: (p.pagespeed as unknown as PageSpeedSnapshot | null) ?? null,
        dm: (p.decisionMakers as unknown as DecisionMakerResult | null) ?? null,
      };

      // Stage 1 — scoring, if it never completed.
      let score = p.qualityScore;
      if (score === null) {
        const scoring = await scoreProspect(
          {
            firmaNaziv: p.firmaNaziv,
            nisa: p.nisa,
            grad: p.grad,
            website: p.website,
            opisFirme: p.opisFirme,
            napomena: p.napomena,
            siteSnapshot: ctx.site,
            pagespeed: ctx.psi,
          },
          { niche: brief.niche, city: brief.city, country: brief.country, language: brief.language }
        );
        if (!scoring) throw new Error("scoring: returned null (Claude error/timeout)");
        await prisma.prospect.update({
          where: { id: p.id },
          data: { qualityScore: scoring.score, qualityNote: scoring.note },
        });
        score = scoring.score;
      }

      // Below threshold is a DECISION, not a failure — stop here, stay New.
      if (score < brief.qualityThreshold) {
        await prisma.prospect.update({ where: { id: p.id }, data: { lastError: null } });
        continue;
      }

      // Stage 2 — email generation (idempotent: re-check count right before).
      if (brief.autoGenerate) {
        const emailCount = await prisma.email.count({ where: { prospectId: p.id } });
        if (emailCount === 0) {
          const generated = await generateEmailsInline(p.id, ctx);
          if (generated === 0) throw new Error("generate: returned 0 emails (Claude error/timeout/parse)");
        }
      } else {
        await prisma.prospect.update({ where: { id: p.id }, data: { lastError: null } });
        continue; // manual generation by brief design
      }

      // Stage 3 — scheduling (flips status to "Scheduled", ending re-drives).
      if (brief.autoSchedule) {
        await scheduleInline(p.id);
      }

      await prisma.prospect.update({ where: { id: p.id }, data: { lastError: null } });
      summary.advanced++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "redrive failed";
      summary.errors.push(`${p.firmaNaziv}: ${msg}`);
      await prisma.prospect
        .update({ where: { id: p.id }, data: { lastError: msg.slice(0, 1000) } })
        .catch(() => {});
    }
  }

  return summary;
}
