/**
 * Subject A/B winner picker. Each prospect gets two subject variants from
 * Claude (A + B) and `activeSubject` is assigned randomly 50/50 at email
 * creation time. After enough sends per niche, we can move beyond random:
 * if variant A has been opening at 35% and variant B at 18%, new prospects
 * in that niche should be biased toward A.
 *
 * Conservative: we only switch the bias once both:
 *   - At least MIN_SENDS_PER_VARIANT initial sends have been measured
 *   - The open-rate gap is at least MIN_LIFT (5 percentage points)
 *
 * Below that threshold, we return 50/50 — the noise floor is too high to
 * call a winner. Falls back to random on DB error, so a flaky read can't
 * break email generation.
 */

import { prisma } from "@/lib/prisma";

const MIN_SENDS_PER_VARIANT = 10;
const MIN_LIFT = 0.05; // 5 percentage points
// Even when we have a clear winner, leave 20% exploration to avoid locking
// into an outdated winner if the audience changes.
const WINNER_BIAS = 0.8;

interface NicheStats {
  niche: string;
  aSent: number;
  aOpen: number;
  bSent: number;
  bOpen: number;
}

/**
 * Returns "A" or "B" probabilistically for a niche. Uses the open-rate
 * leader if there's enough data, falls back to 50/50 otherwise.
 */
export async function pickSubjectVariant(niche: string): Promise<"A" | "B"> {
  try {
    const stats = await loadNicheStats(niche);
    if (!stats) return Math.random() < 0.5 ? "A" : "B";

    const aRate = stats.aSent >= MIN_SENDS_PER_VARIANT ? stats.aOpen / stats.aSent : null;
    const bRate = stats.bSent >= MIN_SENDS_PER_VARIANT ? stats.bOpen / stats.bSent : null;

    // Both below threshold → no signal yet, random
    if (aRate === null || bRate === null) return Math.random() < 0.5 ? "A" : "B";

    const diff = Math.abs(aRate - bRate);
    if (diff < MIN_LIFT) return Math.random() < 0.5 ? "A" : "B";

    const winner = aRate > bRate ? "A" : "B";
    return Math.random() < WINNER_BIAS ? winner : winner === "A" ? "B" : "A";
  } catch (e) {
    console.warn("[subjectWinner] read failed, falling back to random:", e);
    return Math.random() < 0.5 ? "A" : "B";
  }
}

/**
 * Pulls all initial email opens for a given niche, partitioned by which
 * subject variant they actually used. Initial only — follow-ups don't carry
 * their own pixel (single pixel per thread to avoid spam flags), so their
 * open count is unreliable.
 */
async function loadNicheStats(niche: string): Promise<NicheStats | null> {
  // Counts of sends per variant, and counts of opens per variant. Restricted
  // to the same niche. Initial sends only — follow-ups don't carry a pixel
  // (single pixel per thread to avoid spam flags), so their otvoren is
  // unreliable for A/B inference.
  const [aSent, bSent, aOpen, bOpen] = await Promise.all([
    prisma.email.count({
      where: { tip: "initial", poslat: true, activeSubject: "A", prospect: { nisa: niche } },
    }),
    prisma.email.count({
      where: { tip: "initial", poslat: true, activeSubject: "B", prospect: { nisa: niche } },
    }),
    prisma.email.count({
      where: {
        tip: "initial",
        poslat: true,
        activeSubject: "A",
        otvoren: true,
        prospect: { nisa: niche },
      },
    }),
    prisma.email.count({
      where: {
        tip: "initial",
        poslat: true,
        activeSubject: "B",
        otvoren: true,
        prospect: { nisa: niche },
      },
    }),
  ]);

  return { niche, aSent, aOpen, bSent, bOpen };
}

/**
 * Operator-facing report: shows per-niche A/B performance so the user can
 * see which variant Claude tends to nail. Returns null when there's no
 * data yet for the niche.
 */
export async function nicheSubjectReport(niche: string): Promise<{
  niche: string;
  aSent: number;
  aOpenRate: number | null;
  bSent: number;
  bOpenRate: number | null;
  winner: "A" | "B" | "tie" | "insufficient";
} | null> {
  const stats = await loadNicheStats(niche);
  if (!stats) return null;
  const aRate = stats.aSent >= MIN_SENDS_PER_VARIANT ? stats.aOpen / stats.aSent : null;
  const bRate = stats.bSent >= MIN_SENDS_PER_VARIANT ? stats.bOpen / stats.bSent : null;
  let winner: "A" | "B" | "tie" | "insufficient" = "insufficient";
  if (aRate !== null && bRate !== null) {
    const diff = Math.abs(aRate - bRate);
    winner = diff < MIN_LIFT ? "tie" : aRate > bRate ? "A" : "B";
  }
  return {
    niche,
    aSent: stats.aSent,
    aOpenRate: aRate,
    bSent: stats.bSent,
    bOpenRate: bRate,
    winner,
  };
}
