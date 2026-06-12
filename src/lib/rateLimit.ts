/**
 * Minimal in-memory sliding-window rate limiter for the PUBLIC endpoints
 * (/api/audit/run, /api/audit/claim). Per-warm-instance only — a cold start
 * resets it — but that's exactly the burst protection these endpoints need:
 * a bot hammering one instance gets cut off; legitimate users never notice.
 * (P1-6 from the security debug report: public AI/quota endpoints had no
 * throttling at all.)
 */

import type { NextRequest } from "next/server";

const buckets = new Map<string, number[]>();

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Returns true when the call is allowed; false when over the limit. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  // Opportunistic cleanup so the map can't grow unbounded on a long-lived
  // instance.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => t <= now - windowMs)) buckets.delete(k);
    }
  }
  return true;
}
