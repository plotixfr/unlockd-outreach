/**
 * DIY email verification: MX-record lookup + SMTP RCPT TO probe. Free
 * substitute for NeverBounce / ZeroBounce (~$4-8 per 1k lookups).
 *
 * Accuracy is ~85% in practice. The 15% miss is mostly catch-all domains
 * where every RCPT TO returns 250 OK regardless of actual mailbox. We detect
 * catch-alls by probing a guaranteed-fake mailbox first — if THAT also
 * returns 250 OK, we flag the domain as catch-all and mark the result
 * "risky" rather than "valid".
 *
 * Skipped in serverless functions that don't allow outbound SMTP (port 25).
 * Vercel allows port 25 from cron functions; if a future env blocks it, the
 * probe returns "unknown" and we fall through to sending optimistically.
 */

import { promises as dnsPromises, type MxRecord } from "dns";
import net from "net";

export type VerifyResult =
  | { result: "valid"; domain: string; mxHost: string }
  | { result: "invalid"; domain: string; reason: string }
  | { result: "catchall"; domain: string; mxHost: string }
  | { result: "unknown"; domain: string; reason: string };

const SMTP_TIMEOUT_MS = 7000;
const PROBE_FROM = "verify-probe@unlockd.art";

export async function verifyEmail(email: string): Promise<VerifyResult> {
  const at = email.lastIndexOf("@");
  if (at < 0) return { result: "invalid", domain: "", reason: "no @" };
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain || !local) {
    return { result: "invalid", domain, reason: "empty local or domain" };
  }

  // 1) MX lookup. RFC 5321 implicit MX: a domain with NO MX record but a
  // resolvable A/AAAA record can still receive mail (common for small
  // businesses on shared hosting) — treating those as invalid silently
  // dropped deliverable addresses, so they pass as "unknown" and bounce
  // handling (Resend webhook → suppression) catches the genuinely dead ones.
  let mxRecords: MxRecord[];
  try {
    mxRecords = await dnsPromises.resolveMx(domain);
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      if (await hasAddressRecord(domain)) {
        return { result: "unknown", domain, reason: "no MX, but A record (implicit MX)" };
      }
      return { result: "invalid", domain, reason: "no MX record" };
    }
    return { result: "unknown", domain, reason: `dns error ${code ?? ""}` };
  }
  if (!mxRecords || mxRecords.length === 0) {
    if (await hasAddressRecord(domain)) {
      return { result: "unknown", domain, reason: "empty MX, but A record (implicit MX)" };
    }
    return { result: "invalid", domain, reason: "empty MX list" };
  }
  const mx = mxRecords.sort((a, b) => a.priority - b.priority)[0];

  // 2) Catch-all probe: try a random fake address. If it returns 2xx, the
  // domain accepts anything and our real probe is meaningless.
  const fakeLocal = `nodef${Math.floor(Math.random() * 1e9).toString(36)}`;
  const fakeProbe = await smtpRcpt(mx.exchange, `${fakeLocal}@${domain}`);
  if (fakeProbe.result === "unknown") {
    return { result: "unknown", domain, reason: fakeProbe.reason };
  }
  if (fakeProbe.result === "accepted") {
    return { result: "catchall", domain, mxHost: mx.exchange };
  }

  // 3) Real probe
  const real = await smtpRcpt(mx.exchange, email);
  if (real.result === "accepted") {
    return { result: "valid", domain, mxHost: mx.exchange };
  }
  if (real.result === "rejected") {
    return { result: "invalid", domain, reason: real.reason };
  }
  return { result: "unknown", domain, reason: real.reason };
}

async function hasAddressRecord(domain: string): Promise<boolean> {
  try {
    const a = await dnsPromises.resolve4(domain);
    if (a.length > 0) return true;
  } catch {
    // fall through to AAAA
  }
  try {
    const aaaa = await dnsPromises.resolve6(domain);
    return aaaa.length > 0;
  } catch {
    return false;
  }
}

interface SmtpProbeResult {
  result: "accepted" | "rejected" | "unknown";
  reason: string;
}

/**
 * Opens a connection to the MX, runs HELO/MAIL FROM/RCPT TO, and reports
 * whether the target mailbox was accepted. Closes politely with QUIT.
 *
 * Hard timeout at SMTP_TIMEOUT_MS so a hanging MX doesn't burn the cron's
 * budget. Returns "unknown" on connection failure so callers can fall back
 * to optimistic sending instead of false-flagging valid addresses.
 */
function smtpRcpt(mxHost: string, recipient: string): Promise<SmtpProbeResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: mxHost, port: 25 });
    let stage: "greet" | "helo" | "mail" | "rcpt" | "quit" = "greet";
    let resolved = false;
    let buffer = "";

    const settle = (r: SmtpProbeResult) => {
      if (resolved) return;
      resolved = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(r);
    };

    const timer = setTimeout(() => settle({ result: "unknown", reason: "SMTP timeout" }), SMTP_TIMEOUT_MS);

    socket.setEncoding("utf8");
    socket.on("error", (e) => {
      clearTimeout(timer);
      settle({ result: "unknown", reason: `socket error: ${e.message}` });
    });
    socket.on("close", () => clearTimeout(timer));

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      // SMTP responses end with "\r\n" on the last line, where multi-line
      // continuation lines use "-" between code and text. Process by line.
      const lines = buffer.split(/\r\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.slice(0, 3), 10);
        if (!Number.isFinite(code)) continue;
        const continuing = line[3] === "-";
        if (continuing) continue; // multi-line — wait for last line
        switch (stage) {
          case "greet":
            if (code >= 200 && code < 300) {
              stage = "helo";
              socket.write(`EHLO unlockd.art\r\n`);
            } else {
              settle({ result: "unknown", reason: `greet ${code}` });
            }
            break;
          case "helo":
            if (code >= 200 && code < 300) {
              stage = "mail";
              socket.write(`MAIL FROM:<${PROBE_FROM}>\r\n`);
            } else {
              settle({ result: "unknown", reason: `EHLO ${code}` });
            }
            break;
          case "mail":
            if (code >= 200 && code < 300) {
              stage = "rcpt";
              socket.write(`RCPT TO:<${recipient}>\r\n`);
            } else {
              settle({ result: "unknown", reason: `MAIL ${code}` });
            }
            break;
          case "rcpt":
            stage = "quit";
            socket.write("QUIT\r\n");
            if (code >= 200 && code < 300) {
              settle({ result: "accepted", reason: `RCPT ${code}` });
            } else if (code >= 500 && code < 600) {
              settle({ result: "rejected", reason: `RCPT ${code} ${line.slice(4)}` });
            } else {
              settle({ result: "unknown", reason: `RCPT ${code}` });
            }
            break;
          case "quit":
            // ignored
            break;
        }
      }
    });
  });
}
