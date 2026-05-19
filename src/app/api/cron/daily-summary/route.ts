import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { checkReplies } from "@/lib/checkReplies";

const resend = new Resend(process.env.RESEND_API_KEY);
const SUMMARY_TO = "temim.fr@gmail.com";
const FROM = process.env.FROM_EMAIL ?? "temim@unlockd.art";

function buildSummaryHtml(data: {
  date: string;
  emailsSent: number;
  emailsOpened: number;
  openRate: number;
  emailsBounced: number;
  newProspects: number;
  scheduledTomorrow: number;
  pipelineTotal: number;
  pipelineWarn: string | null;
  replies: { firmaNaziv: string; email: string }[];
  reminders: { firmaNaziv: string; podsjetnikNapomena: string | null }[];
}): string {
  const repliesRows =
    data.replies.length > 0
      ? data.replies
          .map(
            (r) =>
              `<tr><td style="padding:8px 12px;border-bottom:1px solid #1f1f2e;color:#e4e4e7;">${r.firmaNaziv}</td><td style="padding:8px 12px;border-bottom:1px solid #1f1f2e;color:#71717a;">${r.email}</td></tr>`
          )
          .join("")
      : `<tr><td colspan="2" style="padding:12px;color:#52525b;text-align:center;">No replies today</td></tr>`;

  const remindersSection =
    data.reminders.length > 0
      ? `<div style="margin-top:24px;padding:16px;background:#172554;border-radius:8px;border:1px solid #1d4ed8;">
          <p style="margin:0 0 8px;color:#93c5fd;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Reminders for today</p>
          ${data.reminders.map((r) => `<p style="margin:4px 0;color:#bfdbfe;font-size:14px;">• <strong>${r.firmaNaziv}</strong>${r.podsjetnikNapomena ? ` — ${r.podsjetnikNapomena}` : ""}</p>`).join("")}
        </div>`
      : "";

  const tomorrowSection = `<div style="background:#111118;border:1px solid #1f1f2e;border-radius:12px;padding:20px;margin-bottom:20px;">
    <p style="margin:0 0 12px;color:#a1a1aa;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Tomorrow's queue</p>
    <p style="margin:0;color:#fff;font-size:28px;font-weight:700;">${data.scheduledTomorrow}</p>
    <p style="margin:4px 0 0;color:#71717a;font-size:13px;">initial emails scheduled · pipeline holds ${data.pipelineTotal} total</p>
  </div>`;

  const warnSection = data.pipelineWarn
    ? `<div style="margin-bottom:20px;padding:14px 16px;background:#451a03;border:1px solid #b45309;border-radius:10px;">
        <p style="margin:0;color:#fed7aa;font-size:13px;">${data.pipelineWarn}</p>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:32px 16px;">
  <div style="max-width:600px;margin:0 auto;">
    <div style="margin-bottom:24px;">
      <span style="color:#fff;font-weight:700;font-size:16px;letter-spacing:0.1em;text-transform:uppercase;">UNLOCKD</span>
      <span style="color:#52525b;font-size:12px;margin-left:8px;">Outreach Studio</span>
    </div>

    <div style="background:#111118;border:1px solid #1f1f2e;border-radius:12px;padding:24px;margin-bottom:20px;">
      <h1 style="margin:0 0 4px;color:#fff;font-size:20px;">Daily Summary</h1>
      <p style="margin:0;color:#71717a;font-size:14px;">${data.date}</p>
    </div>

    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px;">
      ${[
        ["Emails sent", data.emailsSent],
        ["Open rate", `${data.openRate}%`],
        ["Bounced", data.emailsBounced],
        ["New prospects", data.newProspects],
      ]
        .map(
          ([label, value]) =>
            `<div style="background:#111118;border:1px solid #1f1f2e;border-radius:10px;padding:16px;">
              <p style="margin:0 0 4px;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;">${label}</p>
              <p style="margin:0;color:#fff;font-size:22px;font-weight:700;">${value}</p>
            </div>`
        )
        .join("")}
    </div>

    ${warnSection}

    ${tomorrowSection}

    <div style="background:#111118;border:1px solid #1f1f2e;border-radius:12px;overflow:hidden;margin-bottom:20px;">
      <div style="padding:14px 16px;border-bottom:1px solid #1f1f2e;">
        <p style="margin:0;color:#a1a1aa;font-size:13px;font-weight:600;">Replies (${data.replies.length})</p>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${repliesRows}
      </table>
    </div>

    ${remindersSection}

    <p style="color:#3f3f46;font-size:11px;margin-top:32px;text-align:center;">Unlockd Outreach — automated daily report</p>
  </div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600000);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  // Pull replies first so today's summary reflects auto-detected ones too.
  let replyCheck: Awaited<ReturnType<typeof checkReplies>> | null = null;
  try {
    replyCheck = await checkReplies();
    if (replyCheck.configured) {
      console.log(
        `[daily-summary] reply check: scanned=${replyCheck.scanned} matched=${replyCheck.matched} errors=${replyCheck.errors.length}`
      );
    }
  } catch (e) {
    console.error("[daily-summary] reply check threw:", e);
  }

  // Forward-looking pipeline window starts at "right after the daily-summary
  // fires" and runs through the end of tomorrow Paris time. Anything scheduled
  // in that window is what the next 1–2 send cron fires will dispatch.
  const tomorrowEnd = new Date(todayEnd.getTime() + 86400000);

  const [
    emailsSent,
    emailsOpened,
    emailsBounced,
    newProspects,
    scheduledTomorrow,
    pipelineTotal,
    replies,
    reminders,
  ] = await Promise.all([
    prisma.email.count({ where: { poslatAt: { gte: yesterday } } }),
    prisma.email.count({ where: { otvoren: true, otvorenAt: { gte: yesterday } } }),
    prisma.prospect.count({ where: { status: "Bounced", updatedAt: { gte: yesterday } } }),
    prisma.prospect.count({ where: { createdAt: { gte: yesterday } } }),
    prisma.prospect.count({
      where: { status: "Scheduled", scheduledInitial: { gte: now, lt: tomorrowEnd } },
    }),
    prisma.prospect.count({ where: { status: "Scheduled" } }),
    prisma.prospect.findMany({
      where: { status: "Replied", datumOdgovora: { gte: yesterday } },
      select: { firmaNaziv: true, email: true },
    }),
    prisma.prospect.findMany({
      where: { podsjetnikDatum: { gte: todayStart, lt: todayEnd } },
      select: { firmaNaziv: true, email: true, podsjetnikNapomena: true },
    }),
  ]);

  // If literally nothing happened today AND nothing's queued for tomorrow AND
  // there's no human-attention work (replies / reminders / new prospects),
  // skip the email. Showing "0/0/0/0" every evening trains the operator to
  // ignore the inbox — which means real signals also get ignored.
  const replyMatches = replyCheck?.matched ?? 0;
  const noiseFloor =
    emailsSent === 0 &&
    newProspects === 0 &&
    scheduledTomorrow === 0 &&
    replies.length === 0 &&
    reminders.length === 0 &&
    replyMatches === 0;
  if (noiseFloor) {
    console.log("[daily-summary] suppressed — no activity to report and pipeline empty");
    return NextResponse.json({
      ok: true,
      suppressed: true,
      reason: "no activity and empty pipeline",
    });
  }

  const pipelineWarn =
    emailsSent === 0 && scheduledTomorrow === 0
      ? "Pipeline is empty — no sends today and nothing queued for tomorrow. Check that the autopilot discovery cron is firing."
      : emailsSent === 0
      ? `No sends today — next batch (${scheduledTomorrow}) ships tomorrow.`
      : null;

  const openRate = emailsSent > 0 ? Math.round((emailsOpened / emailsSent) * 100) : 0;
  const date = now.toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Send individual reminder emails
  for (const r of reminders) {
    try {
      await resend.emails.send({
        from: FROM,
        to: [SUMMARY_TO],
        subject: `Podsjetnik: ${r.firmaNaziv}`,
        html: `<p style="font-family:sans-serif;">Danas je podsjetnik za <strong>${r.firmaNaziv}</strong> (${r.email}).</p>${r.podsjetnikNapomena ? `<p style="font-family:sans-serif;">Napomena: ${r.podsjetnikNapomena}</p>` : ""}`,
      });
    } catch (err) {
      console.error("[daily-summary] Reminder email failed:", err);
    }
  }

  // Send daily summary
  const html = buildSummaryHtml({
    date,
    emailsSent,
    emailsOpened,
    openRate,
    emailsBounced,
    newProspects,
    scheduledTomorrow,
    pipelineTotal,
    pipelineWarn,
    replies,
    reminders,
  });

  const { error } = await resend.emails.send({
    from: FROM,
    to: [SUMMARY_TO],
    subject: `Unlockd Outreach — Daily Summary ${now.toISOString().slice(0, 10)}`,
    html,
  });

  if (error) {
    console.error("[daily-summary] Send error:", error);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  console.log("[daily-summary] Sent. emailsSent:", emailsSent, "scheduledTomorrow:", scheduledTomorrow, "replies:", replies.length, "reminders:", reminders.length);
  return NextResponse.json({
    ok: true,
    emailsSent,
    emailsOpened,
    openRate,
    emailsBounced,
    newProspects,
    scheduledTomorrow,
    pipelineTotal,
    replies: replies.length,
    reminders: reminders.length,
    replyCheck,
  });
}
