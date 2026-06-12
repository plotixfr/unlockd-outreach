import { NextRequest } from "next/server";

/**
 * Route-level auth for endpoints whose paths must stay public in proxy.ts
 * because Vercel cron has to reach them (/api/autopilot/run, /api/cron/*).
 * Two accepted credentials:
 *
 *  - `Authorization: Bearer ${CRON_SECRET}` — Vercel sends this header on
 *    cron invocations automatically when the CRON_SECRET env var is set.
 *    CRON_SECRET is REQUIRED in production: when unset, the bearer path
 *    always rejects (strict — never falls open).
 *
 *  - A valid `unlockd_session` cookie — the same HMAC-SHA256 token that
 *    proxy.ts and /api/auth/login compute, so dashboard buttons and the
 *    operator trigger scripts (which send the cookie) keep working.
 */
export async function isCronOrSessionAuthorized(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;

  const cookie = req.cookies.get("unlockd_session")?.value;
  const sessionSecret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  const username = process.env.ADMIN_USERNAME || "admin";
  if (!cookie || !sessionSecret) return false;
  return cookie === (await computeToken(sessionSecret, username));
}

// Same implementation as proxy.ts / api/auth/login — kept byte-identical so
// the three stay interchangeable.
async function computeToken(secret: string, username: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(username));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
