import { ImapFlow } from "imapflow";
import { prisma } from "@/lib/prisma";

/**
 * Pulls recent INBOX messages over IMAP and:
 *  1. Marks the matching prospect as Replied (with the message's date)
 *  2. Persists the reply's body so we can read it in the dashboard without
 *     opening Gmail.
 *
 * Skips silently when IMAP_* env vars are missing so the daily summary cron
 * keeps running even if the user hasn't configured a mailbox.
 *
 * Required env:
 *  - IMAP_HOST (default imap.gmail.com)
 *  - IMAP_PORT (default 993)
 *  - IMAP_USER (the inbox that receives prospect replies — e.g. temim@unlockd.art)
 *  - IMAP_PASSWORD (App Password for Gmail/Workspace; never the real password)
 */
export async function checkReplies(): Promise<{
  configured: boolean;
  scanned: number;
  matched: number;
  saved: number;
  errors: string[];
}> {
  const host = process.env.IMAP_HOST ?? "imap.gmail.com";
  const port = Number(process.env.IMAP_PORT ?? 993);
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;

  if (!user || !pass) {
    return { configured: false, scanned: 0, matched: 0, saved: 0, errors: [] };
  }

  const errors: string[] = [];
  let scanned = 0;
  let matched = 0;
  let saved = 0;

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - 7 * 86400000);
      const uids = await client.search({ since }, { uid: true });
      if (!uids || uids.length === 0)
        return { configured: true, scanned: 0, matched: 0, saved: 0, errors };

      const sentProspects = await prisma.prospect.findMany({
        where: {
          status: { in: ["Emailed", "Follow1", "Follow2", "Follow3", "Replied"] },
          datumPrvogMaila: { not: null },
        },
        select: { id: true, email: true, datumPrvogMaila: true, status: true },
      });
      if (sentProspects.length === 0)
        return { configured: true, scanned: uids.length, matched: 0, saved: 0, errors };

      const byEmail = new Map(sentProspects.map((p) => [p.email.toLowerCase(), p]));

      for await (const msg of client.fetch(uids, {
        uid: true,
        envelope: true,
        internalDate: true,
        source: true,
      })) {
        scanned++;
        const fromAddr = msg.envelope?.from?.[0]?.address?.toLowerCase();
        if (!fromAddr) continue;
        const prospect = byEmail.get(fromAddr);
        if (!prospect) continue;
        const messageDate = msg.internalDate ?? msg.envelope?.date ?? new Date();
        if (prospect.datumPrvogMaila && messageDate < prospect.datumPrvogMaila) continue;

        const uidKey = `${msg.uid}`;
        const body = extractPlainBody(msg.source) ?? "";
        const subject = msg.envelope?.subject ?? null;

        try {
          // Persist the reply (idempotent on imapUid)
          await prisma.reply.upsert({
            where: { imapUid: uidKey },
            create: {
              prospectId: prospect.id,
              fromAddr,
              subject,
              body,
              receivedAt: messageDate,
              imapUid: uidKey,
            },
            update: {},
          });
          saved++;

          // Promote prospect to Replied unless they're already further down the
          // funnel (Converted shouldn't drop back to Replied).
          if (prospect.status !== "Replied") {
            await prisma.prospect.update({
              where: { id: prospect.id },
              data: { status: "Replied", datumOdgovora: messageDate },
            });
            matched++;
          }
        } catch (e) {
          errors.push(`${fromAddr}: ${e instanceof Error ? e.message : "DB error"}`);
        }
      }
    } finally {
      lock.release();
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "IMAP error");
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }

  return { configured: true, scanned, matched, saved, errors };
}

/**
 * Best-effort plain-text extractor for an RFC822 source buffer.
 * Tries to find the first text/plain part of a multipart message; falls back
 * to stripping HTML from whatever remains. Not a full MIME parser — designed
 * to give a readable preview, not perfect fidelity.
 */
function extractPlainBody(source: Buffer | Uint8Array | string | undefined): string | null {
  if (!source) return null;
  const raw =
    typeof source === "string"
      ? source
      : Buffer.isBuffer(source)
        ? source.toString("utf8")
        : Buffer.from(source).toString("utf8");

  // Split headers from body
  const headerEnd = raw.indexOf("\r\n\r\n");
  const splitIdx = headerEnd >= 0 ? headerEnd : raw.indexOf("\n\n");
  if (splitIdx < 0) return cleanupText(stripHtml(raw)).slice(0, 8000);

  const headers = raw.slice(0, splitIdx);
  const body = raw.slice(splitIdx).replace(/^\s+/, "");

  // Multipart? find boundary
  const ctMatch = headers.match(/content-type:\s*multipart\/[^;]+;[^\n]*boundary="?([^";\r\n]+)"?/i);
  if (ctMatch) {
    const boundary = ctMatch[1];
    const parts = body.split(new RegExp(`--${escapeRegex(boundary)}(?:--)?`, "g"));
    for (const part of parts) {
      const partTrim = part.replace(/^\s+/, "");
      if (/^content-type:\s*text\/plain/i.test(partTrim)) {
        const i = partTrim.indexOf("\r\n\r\n");
        const j = i >= 0 ? i : partTrim.indexOf("\n\n");
        if (j < 0) continue;
        let text = partTrim.slice(j).replace(/^\s+/, "");
        text = maybeDecodeQuotedPrintable(partTrim, text);
        return cleanupText(text).slice(0, 8000);
      }
    }
    // No text/plain — try the HTML part
    for (const part of parts) {
      const partTrim = part.replace(/^\s+/, "");
      if (/^content-type:\s*text\/html/i.test(partTrim)) {
        const i = partTrim.indexOf("\r\n\r\n");
        const j = i >= 0 ? i : partTrim.indexOf("\n\n");
        if (j < 0) continue;
        let html = partTrim.slice(j).replace(/^\s+/, "");
        html = maybeDecodeQuotedPrintable(partTrim, html);
        return cleanupText(stripHtml(html)).slice(0, 8000);
      }
    }
  }

  // Single-part: read the encoding flag from headers and decode if necessary
  const text = maybeDecodeQuotedPrintable(headers, body);
  return cleanupText(/<html|<body|<p[\s>]/i.test(text) ? stripHtml(text) : text).slice(0, 8000);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maybeDecodeQuotedPrintable(headerBlock: string, body: string): string {
  if (/content-transfer-encoding:\s*quoted-printable/i.test(headerBlock)) {
    return body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  if (/content-transfer-encoding:\s*base64/i.test(headerBlock)) {
    try {
      return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      return body;
    }
  }
  return body;
}

function stripHtml(s: string): string {
  return s
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/?(p|div|li|h\d)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function cleanupText(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
