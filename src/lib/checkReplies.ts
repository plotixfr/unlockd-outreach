import { ImapFlow } from "imapflow";
import { prisma } from "@/lib/prisma";

/**
 * Pulls recent INBOX messages over IMAP and auto-marks a prospect as Replied
 * when a message arrives from their tracked email address after we sent them
 * something. Skips silently when IMAP_* env vars are missing so the daily
 * summary cron keeps running even if the user hasn't configured a mailbox.
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
  errors: string[];
}> {
  const host = process.env.IMAP_HOST ?? "imap.gmail.com";
  const port = Number(process.env.IMAP_PORT ?? 993);
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;

  if (!user || !pass) {
    return { configured: false, scanned: 0, matched: 0, errors: [] };
  }

  const errors: string[] = [];
  let scanned = 0;
  let matched = 0;

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
      // Look at the last 7 days of mail — replies usually come within days.
      const since = new Date(Date.now() - 7 * 86400000);
      const uids = await client.search({ since }, { uid: true });
      if (!uids || uids.length === 0) return { configured: true, scanned: 0, matched: 0, errors };

      // Pull addresses of any prospect we've actually emailed (so we don't
      // mark random correspondents as Replied).
      const sentProspects = await prisma.prospect.findMany({
        where: {
          status: { in: ["Emailed", "Follow1", "Follow2", "Follow3"] },
          datumPrvogMaila: { not: null },
        },
        select: { id: true, email: true, datumPrvogMaila: true },
      });
      if (sentProspects.length === 0) return { configured: true, scanned: uids.length, matched: 0, errors };

      // Lower-cased email → prospect for fast lookup.
      const byEmail = new Map(sentProspects.map((p) => [p.email.toLowerCase(), p]));

      for await (const msg of client.fetch(uids, {
        uid: true,
        envelope: true,
        internalDate: true,
      })) {
        scanned++;
        const fromAddr = msg.envelope?.from?.[0]?.address?.toLowerCase();
        if (!fromAddr) continue;
        const prospect = byEmail.get(fromAddr);
        if (!prospect) continue;
        // Reply must be after we sent the initial email.
        const messageDate = msg.internalDate ?? msg.envelope?.date ?? new Date();
        if (prospect.datumPrvogMaila && messageDate < prospect.datumPrvogMaila) continue;

        try {
          await prisma.prospect.update({
            where: { id: prospect.id },
            data: { status: "Replied", datumOdgovora: messageDate },
          });
          // Remove from the map so we don't re-update if there are multiple replies.
          byEmail.delete(fromAddr);
          matched++;
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

  return { configured: true, scanned, matched, errors };
}
