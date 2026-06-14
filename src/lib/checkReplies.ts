import { ImapFlow } from "imapflow";
import { prisma } from "@/lib/prisma";
import { analyzeReply, prospectActionFor } from "@/lib/replyClassifier";
import { notifyHotReply } from "@/lib/notify";
import { suppressDomain } from "@/lib/suppression";
import { normalizeMessageId, computeBackfillSince } from "@/lib/replyMatching";
export { normalizeMessageId, computeBackfillSince };

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
 *  - IMAP_HOST (default imap.titan.email — EU-hosted Titan accounts use
 *    imap0101.titan.email, same port/SSL)
 *  - IMAP_PORT (default 993, TLS)
 *  - IMAP_USER (the inbox that receives prospect replies)
 *  - IMAP_PASSWORD (the mailbox password / app password)
 *
 * `ok` in the result means the connection + scan completed (regardless of
 * how many replies were found) — the follow-up gate in sendEmail.ts only
 * unfreezes after an ok scan, so replied sequences are always marked BEFORE
 * any follow-up is evaluated.
 */
export interface CheckRepliesResult {
  ok: boolean;
  configured: boolean;
  scanned: number;
  matched: number;
  saved: number;
  errors: string[];
}

/**
 * Classifies a connection/scan-level IMAP failure so the log says WHY without
 * ever revealing the password. AUTH_FAILED = the server rejected the
 * credentials (fix GoDaddy access / password); CONN_TLS = handshake/socket/DNS
 * (transport, not creds); TIMEOUT = connect or greeting timed out.
 */
function classifyImapError(e: unknown): { cls: "AUTH_FAILED" | "CONN_TLS" | "TIMEOUT" | "UNKNOWN"; reason: string } {
  const err = e as { code?: string; authenticationFailed?: boolean; message?: string; responseText?: string };
  const blob = `${err?.code ?? ""} ${err?.message ?? ""} ${err?.responseText ?? ""}`;
  if (err?.authenticationFailed === true || /AUTHENTICATIONFAILED|authenticat|invalid credential|login failed|\bLOGIN\b|password|535|\[ALERT\]/i.test(blob)) {
    return { cls: "AUTH_FAILED", reason: "invalid credentials / login rejected" };
  }
  if (/ETIMEDOUT|timed?\s?out|greeting/i.test(blob)) {
    return { cls: "TIMEOUT", reason: "connect/greeting timeout" };
  }
  if (/ECONNREFUSED|ENOTFOUND|ECONNRESET|EPROTO|EHOSTUNREACH|ENETUNREACH|tls|ssl|handshake|certificate|self[-\s]signed|alt name|servername|socket/i.test(blob)) {
    return { cls: "CONN_TLS", reason: "connection/TLS failure" };
  }
  return { cls: "UNKNOWN", reason: (err?.message ?? "imap error").slice(0, 80) };
}

export async function checkReplies(): Promise<CheckRepliesResult> {
  const host = process.env.IMAP_HOST ?? "imap.titan.email";
  const port = Number(process.env.IMAP_PORT ?? 993);
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;

  if (!user || !pass) {
    return { ok: false, configured: false, scanned: 0, matched: 0, saved: 0, errors: [] };
  }

  const errors: string[] = [];
  let scanned = 0;
  let matched = 0;
  let saved = 0;
  let connectionFailed = false;

  const client = new ImapFlow({
    host,
    port,
    secure: true,
    auth: { user, pass },
    logger: false,
    // Explicit SNI + TLS floor. Some Node builds don't send the SNI
    // `servername` on an implicit-TLS (993) socket, which can fail the
    // handshake against Titan (the connection-level failure we saw locally).
    // Pinning it removes TLS as a variable so any remaining failure is
    // unambiguously authentication, not transport.
    tls: { servername: host, minVersion: "TLSv1.2" },
  });

  try {
    const sentProspects = await prisma.prospect.findMany({
      where: {
        status: { in: ["Emailed", "Follow1", "Follow2", "Follow3", "Replied"] },
        datumPrvogMaila: { not: null },
      },
      select: {
        id: true,
        email: true,
        datumPrvogMaila: true,
        status: true,
        firmaNaziv: true,
        nisa: true,
        grad: true,
        kontaktIme: true,
      },
    });

    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Window covers every ACTIVE sequence back to its initial send, so a
      // gate that's been closed for days backfills everything it missed.
      const since = computeBackfillSince(
        sentProspects
          .filter((p) => p.status !== "Replied")
          .map((p) => p.datumPrvogMaila!)
          .filter(Boolean)
      );
      const uids = await client.search({ since }, { uid: true });
      if (!uids || uids.length === 0)
        return { ok: true, configured: true, scanned: 0, matched: 0, saved: 0, errors };

      if (sentProspects.length === 0)
        return { ok: true, configured: true, scanned: uids.length, matched: 0, saved: 0, errors };

      const byEmail = new Map(sentProspects.map((p) => [p.email.toLowerCase(), p]));
      // Thread-based matching first: prospects' initial Message-IDs →
      // In-Reply-To/References beat from-address (forwards, alias replies).
      const prospectById = new Map(sentProspects.map((p) => [p.id, p]));
      const initialEmails = await prisma.email.findMany({
        where: {
          prospectId: { in: sentProspects.map((p) => p.id) },
          tip: "initial",
          messageId: { not: null },
        },
        select: { prospectId: true, messageId: true },
      });
      const byMessageId = new Map(
        initialEmails
          .map((e) => [normalizeMessageId(e.messageId), prospectById.get(e.prospectId)] as const)
          .filter((pair): pair is [string, (typeof sentProspects)[number]] => !!pair[0] && !!pair[1])
      );

      for await (const msg of client.fetch(uids, {
        uid: true,
        envelope: true,
        internalDate: true,
        source: true,
      })) {
        scanned++;
        const fromAddr = msg.envelope?.from?.[0]?.address?.toLowerCase();
        if (!fromAddr) continue;
        const inReplyTo = normalizeMessageId(msg.envelope?.inReplyTo);
        const prospect = (inReplyTo ? byMessageId.get(inReplyTo) : undefined) ?? byEmail.get(fromAddr);
        if (!prospect) continue;
        const messageDate = msg.internalDate ?? msg.envelope?.date ?? new Date();
        if (prospect.datumPrvogMaila && messageDate < prospect.datumPrvogMaila) continue;

        const uidKey = `${msg.uid}`;
        const body = extractPlainBody(msg.source) ?? "";
        const subject = msg.envelope?.subject ?? null;

        // Skip if we've already saved this UID.
        const existing = await prisma.reply.findUnique({ where: { imapUid: uidKey } });
        if (existing) continue;

        // Classify + draft a response via Claude (best-effort, never blocks save).
        let classification: string | null = null;
        let draft: string | null = null;
        let prospectAction: ReturnType<typeof prospectActionFor> = null;
        try {
          const initialEmail = await prisma.email.findFirst({
            where: { prospectId: prospect.id, tip: "initial" },
            select: { subject: true, subjectB: true, activeSubject: true, body: true },
          });
          const initSubject =
            initialEmail
              ? initialEmail.activeSubject === "B" && initialEmail.subjectB
                ? initialEmail.subjectB
                : initialEmail.subject
              : null;
          const analysis = await analyzeReply({
            prospectName: prospect.firmaNaziv,
            niche: prospect.nisa,
            city: prospect.grad,
            contactFirstName: prospect.kontaktIme?.split(/\s+/)[0] ?? null,
            originalSubject: initSubject,
            originalBody: initialEmail?.body ?? null,
            replyBody: body,
          });
          if (analysis) {
            classification = analysis.classification;
            draft = analysis.draft || null;
            const msgDate = messageDate instanceof Date ? messageDate : new Date(messageDate);
            prospectAction = prospectActionFor(analysis.classification, msgDate);
            // Fire a high-signal email + Telegram push immediately for hot
            // categories so the operator can respond fast — speed-to-reply
            // is the single biggest predictor of close on a warm prospect.
            if (analysis.classification === "Interested" || analysis.classification === "Question") {
              // Fire-and-forget, but self-handle: this promise settles AFTER
              // the surrounding try exits, so a Telegram/email reject here would
              // otherwise become an unhandled rejection and abort the cron run.
              notifyHotReply({
                prospectId: prospect.id,
                firmaNaziv: prospect.firmaNaziv,
                classification: analysis.classification,
                replyBody: body,
                draft: analysis.draft || null,
              }).catch((e) => console.warn("[checkReplies] notifyHotReply failed (non-fatal):", e));
            }
          }
        } catch (e) {
          console.warn("[checkReplies] classify failed (continuing):", e);
        }

        try {
          await prisma.reply.create({
            data: {
              prospectId: prospect.id,
              fromAddr,
              subject,
              body,
              receivedAt: messageDate,
              imapUid: uidKey,
              classification,
              draft,
            },
          });
          saved++;

          // Apply the classifier's recommended prospect update. Don't downgrade
          // someone who's already Converted, and don't push a status that's
          // weaker than where they are.
          if (prospectAction && prospect.status !== "Converted") {
            await prisma.prospect.update({
              where: { id: prospect.id },
              data: prospectAction,
            });
            if (prospectAction.status === "Replied" && prospect.status !== "Replied") {
              matched++;
            }
            // Domain-level suppression: a reply (any flavor) means we should
            // not cold-mail colleagues at the same company. Negative /
            // Unsubscribe reasons are the strongest signal; "Interested"
            // also suppresses because once the conversation is live, you
            // don't want a second person at the company getting a cold
            // pitch from the same address.
            const sup =
              prospectAction.status === "Unsubscribed"
                ? ("unsubscribed" as const)
                : classification === "Negative"
                  ? ("negative" as const)
                  : ("replied" as const);
            await suppressDomain(prospect.email, sup, prospect.id);
          } else if (!prospectAction && prospect.status !== "Replied") {
            // No classifier output (offline / quota) — fall back to old
            // behaviour: any matched reply means "Replied".
            await prisma.prospect.update({
              where: { id: prospect.id },
              data: { status: "Replied", datumOdgovora: messageDate },
            });
            await suppressDomain(prospect.email, "replied", prospect.id);
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
    // Self-describing failure: log the error CLASS so the operator can tell an
    // auth rejection from a transport/TLS failure. Redact the password from any
    // echoed server text before it ever reaches a log.
    const { cls, reason } = classifyImapError(e);
    const raw = e instanceof Error ? e.message : "IMAP error";
    const safe = pass ? raw.split(pass).join("***") : raw;
    console.error(`[check-replies] imap error: ${cls} (${reason}) host=${host}`);
    errors.push(`imap ${cls}: ${reason} — ${safe.slice(0, 120)}`);
    // Connection/scan-level failure: the follow-up gate must NOT lift.
    connectionFailed = true;
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore
    }
  }

  return { ok: !connectionFailed, configured: true, scanned, matched, saved, errors };
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
