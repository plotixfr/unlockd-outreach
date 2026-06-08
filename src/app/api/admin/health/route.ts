/**
 * Diagnostic endpoint: probes each external integration and returns a
 * red/green report. Gated by CRON_SECRET (Bearer token) so it's not
 * publicly enumerable.
 *
 * Hit it from the terminal:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/admin/health
 *
 * Each integration probe is best-effort with a tight timeout — a slow
 * Replicate doesn't slow the whole health response. Missing env vars are
 * reported as "missing" (not "fail"), so the operator can immediately tell
 * "I forgot to add the key" vs "the key is wrong".
 */

import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";

const PROBE_TIMEOUT_MS = 8_000;

export const maxDuration = 30;

type Status = "ok" | "missing" | "fail" | "skipped";

interface CheckResult {
  status: Status;
  detail?: string;
  latencyMs?: number;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - start };
}

async function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout`)), PROBE_TIMEOUT_MS);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function checkResend(): Promise<CheckResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "missing", detail: "RESEND_API_KEY not set" };
  try {
    const { value, ms } = await timed(() =>
      withTimeout(
        fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${key}` },
        }),
        "resend"
      )
    );
    if (!value.ok) {
      return { status: "fail", detail: `HTTP ${value.status}`, latencyMs: ms };
    }
    return { status: "ok", latencyMs: ms };
  } catch (e) {
    return { status: "fail", detail: e instanceof Error ? e.message : "fetch error" };
  }
}

async function checkAnthropic(): Promise<CheckResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { status: "missing", detail: "ANTHROPIC_API_KEY not set" };
  // No cheap probe endpoint — assume key presence ≈ usable. We could ping
  // /v1/messages with max_tokens:1 but it'd cost ~$0.0001 per health check
  // and we already validate via real autopilot calls.
  return { status: "ok", detail: "key present (not probed)" };
}

async function checkGooglePlaces(): Promise<CheckResult> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { status: "missing", detail: "GOOGLE_PLACES_API_KEY not set" };
  try {
    const { value, ms } = await timed(() =>
      withTimeout(
        fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": "places.id",
          },
          body: JSON.stringify({ textQuery: "test", pageSize: 1, regionCode: "FR" }),
        }),
        "places"
      )
    );
    if (!value.ok) {
      const text = await value.text().catch(() => "");
      return { status: "fail", detail: `HTTP ${value.status} ${text.slice(0, 100)}`, latencyMs: ms };
    }
    return { status: "ok", latencyMs: ms };
  } catch (e) {
    return { status: "fail", detail: e instanceof Error ? e.message : "fetch error" };
  }
}

async function checkReplicate(): Promise<CheckResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return { status: "missing", detail: "REPLICATE_API_TOKEN not set (mockups disabled)" };
  try {
    const { value, ms } = await timed(() =>
      withTimeout(
        fetch("https://api.replicate.com/v1/account", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        "replicate"
      )
    );
    if (!value.ok) {
      return { status: "fail", detail: `HTTP ${value.status}`, latencyMs: ms };
    }
    return { status: "ok", latencyMs: ms };
  } catch (e) {
    return { status: "fail", detail: e instanceof Error ? e.message : "fetch error" };
  }
}

async function checkImap(): Promise<CheckResult> {
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;
  if (!user || !pass) {
    return {
      status: "missing",
      detail: "IMAP_USER / IMAP_PASSWORD not set (reply detection disabled)",
    };
  }
  const host = process.env.IMAP_HOST ?? "imap.gmail.com";
  const port = Number(process.env.IMAP_PORT ?? 993);
  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });
  try {
    const { ms } = await timed(() => withTimeout(client.connect(), "imap"));
    await client.logout();
    return { status: "ok", detail: `${host}:${port}`, latencyMs: ms };
  } catch (e) {
    try {
      await client.logout();
    } catch {
      // ignore
    }
    return { status: "fail", detail: e instanceof Error ? e.message : "connect error" };
  }
}

async function checkTelegram(): Promise<CheckResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return {
      status: "missing",
      detail: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set (push disabled)",
    };
  }
  try {
    const { value, ms } = await timed(() =>
      withTimeout(
        fetch(`https://api.telegram.org/bot${token}/getMe`),
        "telegram"
      )
    );
    if (!value.ok) {
      return { status: "fail", detail: `HTTP ${value.status}`, latencyMs: ms };
    }
    return { status: "ok", latencyMs: ms };
  } catch (e) {
    return { status: "fail", detail: e instanceof Error ? e.message : "fetch error" };
  }
}

async function checkResendWebhook(): Promise<CheckResult> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return {
      status: "missing",
      detail: "RESEND_WEBHOOK_SECRET not set (bounce auto-pause disabled)",
    };
  }
  return { status: "ok", detail: "secret present" };
}

async function checkBlob(): Promise<CheckResult> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return {
      status: "missing",
      detail: "BLOB_READ_WRITE_TOKEN not set (mockups fall back to Replicate URL — expires)",
    };
  }
  return { status: "ok", detail: "token present" };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Probe everything in parallel so the total latency is max(probes), not sum.
  const [resend, anthropic, googlePlaces, replicate, imap, telegram, resendWebhook, blob] =
    await Promise.all([
      checkResend(),
      checkAnthropic(),
      checkGooglePlaces(),
      checkReplicate(),
      checkImap(),
      checkTelegram(),
      checkResendWebhook(),
      checkBlob(),
    ]);

  const checks = {
    resend,
    anthropic,
    googlePlaces,
    replicate,
    imap,
    telegram,
    resendWebhook,
    blob,
  };

  const fails = Object.entries(checks).filter(([, v]) => v.status === "fail");
  const missing = Object.entries(checks).filter(([, v]) => v.status === "missing");
  const overall = fails.length > 0 ? "fail" : missing.length > 0 ? "degraded" : "ok";

  return NextResponse.json({
    overall,
    fails: fails.map(([k]) => k),
    missing: missing.map(([k]) => k),
    checks,
  });
}
