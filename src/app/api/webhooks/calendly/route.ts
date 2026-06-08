import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { notifyMeetingBooked, notifyTelegram } from "@/lib/notify";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";

/**
 * Calendly webhook receiver. Set this URL in Calendly:
 *   https://calendly.com/event_types/user/me → Integrations → Webhooks
 *   Endpoint: https://your-domain/api/webhooks/calendly
 *   Events:   invitee.created (and optionally invitee.canceled)
 *
 * If CALENDLY_WEBHOOK_SIGNING_KEY is set, the signature header is verified.
 * Without the key, we accept the payload but log a warning — handy for early
 * testing before you've finished the Calendly setup.
 */

interface CalendlyInviteePayload {
  event?: string;
  payload?: {
    email?: string;
    name?: string;
    questions_and_answers?: Array<{ question?: string; answer?: string }>;
    cancel_url?: string;
    reschedule_url?: string;
    scheduled_event?: {
      name?: string;
      start_time?: string;
      end_time?: string;
      uri?: string;
    };
  };
}

function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!key) {
    console.warn("[calendly webhook] CALENDLY_WEBHOOK_SIGNING_KEY missing — skipping verification");
    return true; // permit during initial setup
  }
  if (!signatureHeader) return false;
  // Calendly format: "t=timestamp,v1=hash"
  const parts = Object.fromEntries(signatureHeader.split(",").map((p) => p.trim().split("=")));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${t}.${rawBody}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sigHeader = req.headers.get("calendly-webhook-signature");

  if (!verifySignature(rawBody, sigHeader)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: CalendlyInviteePayload;
  try {
    payload = JSON.parse(rawBody) as CalendlyInviteePayload;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // invitee.canceled: reset deal stage to Lost so the dashboard shows the
  // outcome. We deliberately don't re-enable cold sequencing — once they
  // engaged with Calendly, they're not a cold lead anymore.
  if (payload.event === "invitee.canceled") {
    const cancelEmail = payload.payload?.email?.toLowerCase().trim();
    if (cancelEmail) {
      const found = await prisma.prospect.findUnique({ where: { email: cancelEmail } });
      if (found) {
        await prisma.prospect.update({
          where: { id: found.id },
          data: { dealStage: "Lost", dealStageAt: new Date() },
        });
        void notifyTelegram({
          prospectId: found.id,
          firmaNaziv: found.firmaNaziv,
          classification: "Canceled meeting",
          replyBody: `Meeting cancelled. Cancel URL: ${payload.payload?.cancel_url ?? "(n/a)"}`,
        });
      }
    }
    return NextResponse.json({ ok: true, event: "canceled" });
  }

  if (payload.event !== "invitee.created") {
    return NextResponse.json({ ok: true, ignored: payload.event });
  }

  const inviteeEmail = payload.payload?.email?.toLowerCase().trim();
  const inviteeName = payload.payload?.name?.trim() ?? "(inconnu)";
  const startTime = payload.payload?.scheduled_event?.start_time;
  if (!inviteeEmail || !startTime) {
    return NextResponse.json({ error: "missing email or start_time" }, { status: 400 });
  }

  // Match prospect by exact email first, then fall back to domain match.
  let prospect = await prisma.prospect.findUnique({
    where: { email: inviteeEmail },
    include: { replies: { orderBy: { receivedAt: "desc" }, take: 3 } },
  });
  if (!prospect) {
    const domain = inviteeEmail.split("@")[1]?.toLowerCase();
    if (domain) {
      prospect = await prisma.prospect.findFirst({
        where: { email: { endsWith: `@${domain}` } },
        include: { replies: { orderBy: { receivedAt: "desc" }, take: 3 } },
      });
    }
  }

  if (!prospect) {
    // Still notify — could be a prospect we never reached out to. Send a
    // simpler email without the full scouting report.
    console.log("[calendly webhook] no matching prospect for", inviteeEmail);
    return NextResponse.json({ ok: true, matched: false });
  }

  // Advance the deal pipeline AND close the cold sequence — they booked,
  // they don't need more follow-ups. Status → Replied (terminal for the
  // cold sequence's send rules). Clearing scheduled* fields is belt-and-
  // braces: even if the rules already skip a Replied prospect, an old row
  // could still trigger a stale send if status was somehow rolled back.
  await prisma.prospect.update({
    where: { id: prospect.id },
    data: {
      dealStage: "Discovery",
      dealStageAt: new Date(),
      status: prospect.status === "Converted" ? "Converted" : "Replied",
      datumOdgovora: prospect.datumOdgovora ?? new Date(),
      scheduledFollow1: null,
      scheduledFollow2: null,
      scheduledFollow3: null,
      scheduledBreakup: null,
    },
  });

  // Instant Telegram push — booking is the conversion event, the operator
  // should know immediately. Email notify follows below with full context.
  void notifyTelegram({
    prospectId: prospect.id,
    firmaNaziv: prospect.firmaNaziv,
    classification: "📅 Meeting booked",
    replyBody: `${inviteeName} (${inviteeEmail}) booked ${new Date(startTime).toLocaleString(
      "fr-FR",
      { timeZone: "Europe/Paris" }
    )}`,
  });

  // Fire the rich notification.
  await notifyMeetingBooked({
    prospect: {
      id: prospect.id,
      firmaNaziv: prospect.firmaNaziv,
      email: prospect.email,
      nisa: prospect.nisa,
      grad: prospect.grad,
      website: prospect.website,
      kontaktIme: prospect.kontaktIme,
      qualityScore: prospect.qualityScore,
      qualityNote: prospect.qualityNote,
      siteSnapshot: (prospect.siteSnapshot as unknown as SiteSnapshot | null) ?? null,
      pagespeed: (prospect.pagespeed as unknown as PageSpeedSnapshot | null) ?? null,
    },
    bookedAt: new Date(),
    meetingTime: new Date(startTime),
    inviteeName,
    inviteeEmail,
    eventName: payload.payload?.scheduled_event?.name ?? null,
    cancelUrl: payload.payload?.cancel_url ?? null,
    rescheduleUrl: payload.payload?.reschedule_url ?? null,
    questionsAndAnswers:
      payload.payload?.questions_and_answers
        ?.filter((qa): qa is { question: string; answer: string } => !!qa.question && !!qa.answer)
        .map((qa) => ({ question: qa.question, answer: qa.answer })) ?? [],
    recentReplies:
      prospect.replies?.map((r) => ({
        fromAddr: r.fromAddr,
        body: r.body,
        receivedAt: r.receivedAt,
      })) ?? [],
  });

  return NextResponse.json({ ok: true, matched: true, prospectId: prospect.id });
}
