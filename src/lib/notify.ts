/**
 * High-signal notifications sent to the operator. Designed to be the *only*
 * thing the user needs to read each day:
 *   - "Meeting booked" — fires on Calendly invitee.created with prospect
 *     context, scouting report, and conversation history
 *   - "Hot reply" — fires when reply classifier returns Interested/Question
 *   - "Autopilot daily" — summary of the morning's discovery run
 */

import { Resend } from "resend";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";
import { resendGate } from "@/lib/sendEmail";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.FROM_EMAIL ?? "temim@unlockd.art";
const TO_EMAIL = process.env.NOTIFY_TO_EMAIL ?? process.env.BCC_EMAIL ?? "temim.fr@gmail.com";
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://unlockd-outreach.vercel.app";

interface MeetingNotificationInput {
  prospect: {
    id: string;
    firmaNaziv: string;
    email: string;
    nisa: string;
    grad: string;
    website: string | null;
    kontaktIme: string | null;
    qualityScore: number | null;
    qualityNote: string | null;
    siteSnapshot: SiteSnapshot | null;
    pagespeed: PageSpeedSnapshot | null;
  };
  bookedAt: Date;
  meetingTime: Date;
  inviteeName: string;
  inviteeEmail: string;
  eventName: string | null;
  cancelUrl: string | null;
  rescheduleUrl: string | null;
  questionsAndAnswers: Array<{ question: string; answer: string }>;
  recentReplies: Array<{ fromAddr: string; body: string; receivedAt: Date }>;
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

function box(content: string, accent = "#1f1f2e"): string {
  return `<div style="background:#111118;border:1px solid ${accent};border-radius:12px;padding:18px;margin-bottom:14px;">${content}</div>`;
}

function buildMeetingHtml(i: MeetingNotificationInput): string {
  const psi = i.prospect.pagespeed;
  const site = i.prospect.siteSnapshot;
  const score = i.prospect.qualityScore;

  const psiBlock = psi?.ok && psi.performanceScore !== null
    ? `<p style="margin:0;color:#bfdbfe;font-size:13px;"><strong>Lighthouse mobile :</strong> ${psi.performanceScore}/100${psi.lcpMs ? ` · LCP ${(psi.lcpMs / 1000).toFixed(1)}s` : ""}</p>`
    : "";

  const scoreBlock = score !== null
    ? `<p style="margin:6px 0 0;color:#a7f3d0;font-size:13px;"><strong>Quality score :</strong> ${score}/10${i.prospect.qualityNote ? ` — <em>${i.prospect.qualityNote}</em>` : ""}</p>`
    : "";

  const siteBlock = site?.ok
    ? `<p style="margin:6px 0 0;color:#e4e4e7;font-size:13px;">${site.title ? `<strong>${site.title}</strong>` : ""}${site.h1 && site.h1 !== site.title ? ` — ${site.h1}` : ""}</p>`
    : "";

  const repliesBlock = i.recentReplies.length > 0
    ? box(
        `<p style="margin:0 0 10px;color:#a1a1aa;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Posljednji odgovori</p>` +
          i.recentReplies
            .map(
              (r) =>
                `<div style="margin-bottom:10px;padding:10px;background:#0d0d14;border-left:2px solid #10b981;border-radius:4px;">
              <p style="margin:0 0 4px;color:#71717a;font-size:11px;">${r.fromAddr} · ${fmtDateTime(r.receivedAt)}</p>
              <p style="margin:0;color:#d4d4d8;font-size:13px;white-space:pre-wrap;line-height:1.5;">${(r.body || "").slice(0, 600)}${(r.body || "").length > 600 ? "…" : ""}</p>
            </div>`
            )
            .join("")
      )
    : "";

  const qaBlock = i.questionsAndAnswers.length > 0
    ? box(
        `<p style="margin:0 0 10px;color:#a1a1aa;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Odgovori iz Calendly forme</p>` +
          i.questionsAndAnswers
            .map(
              (qa) =>
                `<div style="margin-bottom:8px;">
                  <p style="margin:0;color:#71717a;font-size:11px;">${qa.question}</p>
                  <p style="margin:2px 0 0;color:#d4d4d8;font-size:13px;">${qa.answer}</p>
                </div>`
            )
            .join("")
      )
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:24px 16px;">
  <div style="max-width:640px;margin:0 auto;">

    <div style="background:linear-gradient(135deg,#065f46,#022c22);border-radius:14px;padding:24px;margin-bottom:18px;">
      <p style="margin:0;color:#a7f3d0;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">📅 Meeting booked</p>
      <h1 style="margin:6px 0 0;color:#fff;font-size:22px;font-weight:700;">${i.prospect.firmaNaziv}</h1>
      <p style="margin:8px 0 0;color:#d1fae5;font-size:15px;">${fmtDateTime(i.meetingTime)}</p>
      <p style="margin:6px 0 0;color:#a7f3d0;font-size:13px;">${i.inviteeName} · ${i.inviteeEmail}</p>
    </div>

    ${box(
      `<p style="margin:0 0 8px;color:#a1a1aa;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Prospect</p>
       <p style="margin:0;color:#fff;font-size:16px;font-weight:600;">${i.prospect.firmaNaziv}</p>
       <p style="margin:4px 0 0;color:#a1a1aa;font-size:13px;">${i.prospect.nisa} · ${i.prospect.grad}${i.prospect.kontaktIme ? ` · ${i.prospect.kontaktIme}` : ""}</p>
       ${i.prospect.website ? `<p style="margin:4px 0 0;"><a href="${i.prospect.website}" style="color:#60a5fa;font-size:13px;text-decoration:none;">${i.prospect.website}</a></p>` : ""}
       ${siteBlock}
       ${psiBlock}
       ${scoreBlock}`
    )}

    ${qaBlock}
    ${repliesBlock}

    <div style="text-align:center;margin-top:18px;">
      <a href="${SITE_URL}/prospects/${i.prospect.id}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Otvori karticu →</a>
    </div>

    ${i.rescheduleUrl ? `<p style="text-align:center;margin-top:12px;color:#71717a;font-size:11px;"><a href="${i.rescheduleUrl}" style="color:#71717a;">Reschedule</a>${i.cancelUrl ? ` · <a href="${i.cancelUrl}" style="color:#71717a;">Cancel</a>` : ""}</p>` : ""}

  </div>
</body>
</html>`;
}

export async function notifyMeetingBooked(input: MeetingNotificationInput): Promise<void> {
  const html = buildMeetingHtml(input);
  const subject = `📅 ${fmtDateTime(input.meetingTime)} — ${input.prospect.firmaNaziv}`;
  try {
    await resendGate();
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject,
      html,
    });
  } catch (e) {
    console.error("[notify] meeting email failed:", e);
  }
}

export async function notifyHotReply(input: {
  prospectId: string;
  firmaNaziv: string;
  classification: string;
  replyBody: string;
}): Promise<void> {
  const subject = `🔥 ${input.firmaNaziv} — ${input.classification}`;
  const html = `<!DOCTYPE html>
<html><body style="background:#0a0a0f;font-family:-apple-system,sans-serif;padding:24px 16px;">
<div style="max-width:560px;margin:0 auto;">
  <div style="background:#7c2d12;border-radius:12px;padding:18px;color:#fff;">
    <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#fed7aa;">🔥 Topao odgovor</p>
    <h1 style="margin:6px 0 0;font-size:20px;">${input.firmaNaziv}</h1>
    <p style="margin:6px 0 0;color:#fed7aa;font-size:13px;">Klasifikacija: ${input.classification}</p>
  </div>
  <div style="background:#111118;border:1px solid #1f1f2e;border-radius:12px;padding:16px;margin-top:14px;">
    <pre style="margin:0;color:#d4d4d8;font-size:13px;font-family:inherit;white-space:pre-wrap;line-height:1.5;">${input.replyBody.slice(0, 1500)}</pre>
  </div>
  <div style="text-align:center;margin-top:16px;">
    <a href="${SITE_URL}/prospects/${input.prospectId}" style="display:inline-block;background:#3b82f6;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Odgovori sada →</a>
  </div>
</div>
</body></html>`;
  try {
    await resendGate();
    await resend.emails.send({ from: FROM_EMAIL, to: [TO_EMAIL], subject, html });
  } catch (e) {
    console.error("[notify] hot reply email failed:", e);
  }
}

export async function notifyAutopilotSummary(input: {
  date: string;
  briefs: Array<{
    briefName: string;
    found: number;
    created: number;
    qualified: number;
    scheduled: number;
    errors: string[];
  }>;
}): Promise<void> {
  const total = input.briefs.reduce(
    (acc, b) => ({
      found: acc.found + b.found,
      created: acc.created + b.created,
      qualified: acc.qualified + b.qualified,
      scheduled: acc.scheduled + b.scheduled,
    }),
    { found: 0, created: 0, qualified: 0, scheduled: 0 }
  );

  const rows = input.briefs
    .map(
      (b) =>
        `<tr>
        <td style="padding:8px 12px;color:#e4e4e7;font-size:13px;">${b.briefName}</td>
        <td style="padding:8px 12px;color:#a1a1aa;font-size:13px;text-align:right;">${b.found}</td>
        <td style="padding:8px 12px;color:#a1a1aa;font-size:13px;text-align:right;">${b.created}</td>
        <td style="padding:8px 12px;color:#a7f3d0;font-size:13px;text-align:right;">${b.qualified}</td>
        <td style="padding:8px 12px;color:#93c5fd;font-size:13px;text-align:right;">${b.scheduled}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><body style="background:#0a0a0f;font-family:-apple-system,sans-serif;padding:24px 16px;">
<div style="max-width:600px;margin:0 auto;">
  <p style="color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Autopilot daily — ${input.date}</p>
  <h1 style="margin:6px 0 18px;color:#fff;font-size:22px;">${total.scheduled} kampanj${total.scheduled === 1 ? "a" : "e"} pokrenut${total.scheduled === 1 ? "a" : "o"}</h1>
  <div style="background:#111118;border:1px solid #1f1f2e;border-radius:12px;overflow:hidden;">
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="background:#0d0d14;">
        <th style="padding:8px 12px;text-align:left;color:#71717a;font-size:11px;text-transform:uppercase;">Brief</th>
        <th style="padding:8px 12px;text-align:right;color:#71717a;font-size:11px;text-transform:uppercase;">Found</th>
        <th style="padding:8px 12px;text-align:right;color:#71717a;font-size:11px;text-transform:uppercase;">Created</th>
        <th style="padding:8px 12px;text-align:right;color:#71717a;font-size:11px;text-transform:uppercase;">Qualified</th>
        <th style="padding:8px 12px;text-align:right;color:#71717a;font-size:11px;text-transform:uppercase;">Scheduled</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="5" style="padding:16px;text-align:center;color:#52525b;">Nijedan brief nije aktivan</td></tr>`}</tbody>
    </table>
  </div>
  <p style="text-align:center;margin-top:18px;"><a href="${SITE_URL}/autopilot" style="color:#60a5fa;font-size:13px;">Otvori autopilot →</a></p>
</div></body></html>`;
  try {
    await resendGate();
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject: `Autopilot — ${total.scheduled} kampanja, ${total.qualified} qualified`,
      html,
    });
  } catch (e) {
    console.error("[notify] autopilot summary failed:", e);
  }
}
