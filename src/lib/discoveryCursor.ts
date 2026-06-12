/**
 * Cursor + cooldown logic for discovery pagination. Pure (no DB, no fetch)
 * so autopilot.ts diffs stay small and everything here is unit-testable.
 *
 * Why a (variant, position) cursor and not a stored pageToken: Google Places
 * v1 nextPageTokens expire within minutes and are bound to the originating
 * request, while cron fires are 2h apart. So cross-run state is the variant
 * index + how many raw results we've consumed; within one run the adapter
 * re-walks pages with live tokens to reach `position` (≤2 wasted requests —
 * v1 caps at 3 pages × 20). Sirene's `page` param IS durable, so its adapter
 * maps `position` straight to page/offset.
 */

export interface BriefCursor {
  v: 1;
  /** Hash of source|niche|city|country|query — editing the brief resets pagination. */
  key: string;
  /** Index into buildQueryVariants(brief). */
  variant: number;
  /** Raw results consumed within the current variant (Places) / globally (Sirene). */
  position: number;
  exhausted: boolean;
}

export interface BriefTargeting {
  source: string;
  niche: string;
  city: string | null;
  country: string;
  query: string | null;
}

/** Cheap stable hash (djb2) of the targeting fields. */
export function briefKey(b: BriefTargeting): string {
  const s = [b.source, b.niche, b.city ?? "", b.country, b.query ?? ""].join("|");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function freshCursor(key: string): BriefCursor {
  return { v: 1, key, variant: 0, position: 0, exhausted: false };
}

/**
 * Parses a stored cursor; any shape/version/key mismatch returns a fresh one,
 * which is how editing a brief's niche/city/query safely restarts pagination
 * without touching any route code.
 */
export function parseCursor(json: unknown, expectedKey: string): BriefCursor {
  if (!json || typeof json !== "object") return freshCursor(expectedKey);
  const c = json as Partial<BriefCursor>;
  if (
    c.v !== 1 ||
    c.key !== expectedKey ||
    typeof c.variant !== "number" ||
    typeof c.position !== "number" ||
    c.variant < 0 ||
    c.position < 0
  ) {
    return freshCursor(expectedKey);
  }
  return { v: 1, key: expectedKey, variant: c.variant, position: c.position, exhausted: !!c.exhausted };
}

/**
 * Exponential cooldown after zero-created runs: 2h, 4h, 8h, … capped at 72h.
 * Crons fire every 2h, so streak 1 skips roughly one fire.
 */
export function cooldownMs(streak: number): number {
  const hours = Math.min(2 * 2 ** (Math.max(1, streak) - 1), 72);
  return hours * 3600_000;
}

// Sub-area sweeps for metros where one city-wide query saturates. Keys are
// lowercase city names as stored on briefs.
const METRO_AREAS: Record<string, string[]> = {
  paris: ["11e arrondissement", "15e arrondissement", "17e arrondissement", "18e arrondissement"],
  lyon: ["Part-Dieu", "Croix-Rousse", "Confluence"],
  marseille: ["Vieux-Port", "Prado"],
  amsterdam: ["Centrum", "Zuid", "West", "Oost"],
  rotterdam: ["Centrum", "Noord"],
  geneva: ["Eaux-Vives", "Plainpalais"],
  lausanne: ["Centre", "Ouchy"],
};

/**
 * Deterministic query-variant list for a brief. The base variant reproduces
 * today's exact query format so existing dedupe history lines up; later
 * variants expand the search (directions, "best X", sub-areas) before the
 * brief is declared exhausted. ~7–11 variants × ≤60 Places results each
 * ≈ 400–650 raw candidates per brief.
 */
export function buildQueryVariants(q: {
  niche: string;
  city: string | null;
  country: string;
  customQuery?: string | null;
}): string[] {
  const custom = q.customQuery?.trim();
  if (custom) {
    return [custom, `${custom} nord`, `${custom} sud`, `${custom} est`, `${custom} ouest`];
  }
  const niche = q.niche.trim();
  const base = [niche, q.city ? `in ${q.city}` : "", q.country ? `, ${q.country}` : ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!q.city) return [base];
  const city = q.city.trim();
  const variants = [
    base,
    `${niche} ${city} centre`,
    `${niche} ${city} nord`,
    `${niche} ${city} sud`,
    `${niche} ${city} est`,
    `${niche} ${city} ouest`,
    `meilleur ${niche} ${city}`,
  ];
  for (const area of METRO_AREAS[city.toLowerCase()] ?? []) {
    variants.push(`${niche} ${city} ${area}`);
  }
  return variants;
}
