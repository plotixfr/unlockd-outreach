import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { signatureHtml, signatureText, SENDER_CALENDLY } from "@/lib/signature";
import { resendGate } from "@/lib/sendEmail";

/**
 * Inbound nurture cron — runs daily, sends a low-friction nudge to anyone
 * who submitted /audit but hasn't actually replied to the audit email.
 *
 * /api/audit/claim creates a Prospect with status="Replied" + 1 audit
 * email. Without nurture they sit forever. With this, we have 2 follow-up
 * touches that re-engage the high-intent inbound lead.
 *
 * Touch schedule (relative to claim date — datumOdgovora on creation):
 *   T+3 days: "Did the audit reach you?" (tip="inbound_nudge1")
 *   T+7 days: case study + Calendly (tip="inbound_nudge2")
 *
 * Skips: prospects who actually got a real IMAP reply (their Reply row
 * count > 0), prospects who clicked Calendly, terminal statuses.
 */

export const maxDuration = 300;

const FROM_EMAIL = process.env.FROM_EMAIL ?? "temim@unlockd.art";
// Replies must land in the mailbox that reply detection reads (IMAP_USER),
// otherwise the system is blind to answers — so IMAP_USER wins when set.
const REPLY_TO = process.env.IMAP_USER ?? process.env.REPLY_TO_EMAIL ?? FROM_EMAIL;
const BCC_EMAIL = process.env.BCC_EMAIL ?? "temim.fr@gmail.com";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://unlockd-outreach.vercel.app";

interface NurgeCopy {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

function buildNudge1(firstName: string | null, prospectId: string): NurgeCopy {
  const greet = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  const auditUrl = `${SITE_URL}/audit/${prospectId}`;
  const bodyHtml = `<p>${greet}</p>
<p>Petite vérification — l'audit que j'ai préparé vous est bien arrivé ?</p>
<p>Si oui, mais que vous n'avez pas eu une minute pour le lire, je l'ai posé ici pour rester accessible : <a href="${auditUrl}">${auditUrl}</a></p>
<p>Si quelque chose vous a paru pertinent, on peut en parler 20 min, sans pitch. Sinon, ignorez ce mail.</p>`;
  const bodyText = `${greet}\n\nPetite vérification — l'audit que j'ai préparé vous est bien arrivé ?\n\nSi oui, mais que vous n'avez pas eu une minute pour le lire, je l'ai posé ici : ${auditUrl}\n\nSi quelque chose vous a paru pertinent, on peut en parler 20 min, sans pitch. Sinon, ignorez ce mail.`;
  return {
    subject: "Audit reçu ?",
    bodyHtml,
    bodyText,
  };
}

function buildNudge2(firstName: string | null, prospectId: string): NurgeCopy {
  const greet = firstName ? `Bonjour ${firstName},` : "Bonjour,";
  const auditUrl = `${SITE_URL}/audit/${prospectId}`;
  const bodyHtml = `<p>${greet}</p>
<p>Je ne reviens pas vous tirer la manche — promis, c'est la dernière fois.</p>
<p>Si l'audit (<a href="${auditUrl}">ici</a>) a soulevé une question, ou si vous voulez juste voir comment on a refait un site comparable, voici 20 min à votre nom : <a href="${SENDER_CALENDLY}">${SENDER_CALENDLY}</a></p>
<p>Sinon, je vous laisse à votre journée.</p>`;
  const bodyText = `${greet}\n\nJe ne reviens pas vous tirer la manche — promis, c'est la dernière fois.\n\nSi l'audit (${auditUrl}) a soulevé une question, ou si vous voulez juste voir comment on a refait un site comparable, voici 20 min à votre nom : ${SENDER_CALENDLY}\n\nSinon, je vous laisse à votre journée.`;
  return {
    subject: "Dernier message",
    bodyHtml,
    bodyText,
  };
}

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendNudge(
  prospectId: string,
  prospectEmail: string,
  copy: NurgeCopy,
  tip: string,
  threadMessageId: string | null
): Promise<{ ok: boolean; error?: string; resendId?: string }> {
  const headers: Record<string, string> = {
    "List-Unsubscribe": `<${SITE_URL}/api/unsubscribe/${prospectId}>, <mailto:${REPLY_TO}?subject=Unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  let subject = copy.subject;
  if (threadMessageId) {
    headers["In-Reply-To"] = threadMessageId;
    headers["References"] = threadMessageId;
    subject = /^re:\s/i.test(subject) ? subject : `Re: ${subject}`;
  }

  const html = `${copy.bodyHtml}${signatureHtml(prospectId)}<p style="font-size:11px;color:#999;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">Pour ne plus recevoir nos messages, <a href="${SITE_URL}/api/unsubscribe/${prospectId}" style="color:#999;">cliquez ici</a>.</p>`;
  const text = `${copy.bodyText}\n\n${signatureText(prospectId)}\n\nDésabonnement : ${SITE_URL}/api/unsubscribe/${prospectId}`;

  await resendGate();
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [prospectEmail],
    replyTo: REPLY_TO,
    subject,
    html,
    text,
    headers,
  });
  if (error) return { ok: false, error: error.message };

  // Persist as a fake "email" so the activity timeline shows it AND so the
  // per-tip dedup check skips this prospect next run. A persist failure AFTER a
  // successful send must NOT throw — that would crash the cron and (worse) risk
  // a re-send next run. Log it loudly instead.
  try {
    await prisma.email.create({
      data: {
        prospectId,
        tip,
        subject,
        body: copy.bodyHtml,
        poslat: true,
        poslatAt: new Date(),
        resendId: data?.id ?? null,
        activeSubject: "A",
      },
    });
  } catch (e) {
    console.error(`[inbound-nurture] sent ${tip} to ${prospectEmail} but FAILED to persist Email row (risk of re-send next run):`, e);
  }

  // Operator copy
  try {
    await resendGate();
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [BCC_EMAIL],
      subject: `[Sent inbound-nurge] ${subject}`,
      html: `<div style="background:#eef;padding:10px;margin-bottom:14px;font-size:12px;">SENT — inbound nurture to ${prospectEmail}</div>${copy.bodyHtml}`,
      text: `[SENT inbound-nurture]\nTo: ${prospectEmail}\n\n${copy.bodyText}`,
    });
  } catch {
    // ignore
  }

  return { ok: true, resendId: data?.id ?? undefined };
}

async function run(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 86_400_000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);

  // Candidates: inbound prospects (source=public_audit) who haven't actually
  // replied via IMAP and haven't clicked Calendly. We track per-touch
  // dedup via the Email.tip rows we write on each send.
  const candidates = await prisma.prospect.findMany({
    where: {
      source: "public_audit",
      // Skip terminal / progressed states.
      status: { notIn: ["Converted", "Unsubscribed", "Bounced"] },
      dealStage: null,
      // Treat IMAP reply rows as "actually engaged" — skip them.
      replies: { none: {} },
      // Don't touch claims older than 14 days; they're cold.
      datumOdgovora: { gte: fourteenDaysAgo, not: null },
      // No Calendly click — clicks already trigger calendly_nudge separately.
      emails: { none: { calendlyClicked: true } },
    },
    select: {
      id: true,
      email: true,
      kontaktIme: true,
      datumOdgovora: true,
      emails: {
        select: { tip: true, messageId: true, subject: true, subjectB: true, activeSubject: true },
      },
    },
  });

  let nudge1Sent = 0;
  let nudge2Sent = 0;
  const errors: string[] = [];

  for (const p of candidates) {
    // Per-candidate guard: one prospect's failure must never crash the run or
    // throw an unhandled rejection that kills the whole cron.
    try {
      if (!p.datumOdgovora) continue;
      const firstName = p.kontaktIme?.split(/\s+/)[0] ?? null;
      const hadNudge1 = p.emails.some((e) => e.tip === "inbound_nudge1");
      const hadNudge2 = p.emails.some((e) => e.tip === "inbound_nudge2");
      const threadMessageId =
        p.emails.find((e) => e.messageId)?.messageId ?? null;

      // Nudge 2: 7 days after claim AND nudge 1 already went out
      if (!hadNudge2 && hadNudge1 && p.datumOdgovora <= sevenDaysAgo) {
        const res = await sendNudge(p.id, p.email, buildNudge2(firstName, p.id), "inbound_nudge2", threadMessageId);
        if (res.ok) nudge2Sent++;
        else errors.push(`${p.email} nudge2: ${res.error}`);
        continue;
      }
      // Nudge 1: 3 days after claim, no nudge1 yet
      if (!hadNudge1 && p.datumOdgovora <= threeDaysAgo) {
        const res = await sendNudge(p.id, p.email, buildNudge1(firstName, p.id), "inbound_nudge1", threadMessageId);
        if (res.ok) nudge1Sent++;
        else errors.push(`${p.email} nudge1: ${res.error}`);
      }
    } catch (e) {
      errors.push(`${p.email}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  console.log(
    `[inbound-nurture] candidates=${candidates.length} nudge1=${nudge1Sent} nudge2=${nudge2Sent} errors=${errors.length}`
  );
  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    nudge1Sent,
    nudge2Sent,
    errors,
  });
}

export const GET = run;
export const POST = run;
