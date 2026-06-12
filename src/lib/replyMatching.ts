/**
 * Pure helpers for IMAP reply matching — no IO, no env, no heavy imports,
 * so unit tests can load them without dragging in prisma/Resend.
 */

/** Strips angle brackets/whitespace so Message-ID comparisons are stable. */
export function normalizeMessageId(mid: string | null | undefined): string | null {
  if (!mid) return null;
  const m = mid.trim().replace(/^<|>$/g, "").trim().toLowerCase();
  return m || null;
}

/**
 * Backfill window: the scan must cover every active sequence from its
 * initial send date (the follow-up gate may have been closed for days), but
 * never less than 7 days and never more than 30.
 */
export function computeBackfillSince(initialDates: Date[], now: Date = new Date()): Date {
  const sevenDaysAgo = now.getTime() - 7 * 86400000;
  const thirtyDaysAgo = now.getTime() - 30 * 86400000;
  const oldest = initialDates.length
    ? Math.min(...initialDates.map((d) => d.getTime()))
    : sevenDaysAgo;
  return new Date(Math.max(Math.min(oldest, sevenDaysAgo), thirtyDaysAgo));
}
