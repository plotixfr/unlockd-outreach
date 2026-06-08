import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  nextAutopilotRun,
  nextSendRun,
  formatParisDateTime,
  relativeFromNow,
} from "@/lib/autopilotStatus";
import { getForecast, getMomentum } from "@/lib/todayQueue";
import {
  ArrowUpRight,
  Activity,
  Zap,
  Sparkles,
  Mail,
  Reply,
  CalendarCheck2,
  Eye,
  Server,
  Globe,
  Bot,
} from "lucide-react";
import { RunAutopilotNowButton } from "@/components/RunAutopilotNowButton";

export const dynamic = "force-dynamic";

function utcMidnight(offsetDays = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (offsetDays) d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

function fmtCurrency(n: number): string {
  if (n === 0) return "€0";
  return `€${Math.round(n).toLocaleString("en-US")}`;
}

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const now = new Date();
  const nextAutopilot = nextAutopilotRun(now);
  const nextSend = nextSendRun(now);
  const todayStart = utcMidnight();
  const tomorrowStart = utcMidnight(1);
  const dayAfter = utcMidnight(2);
  const thirtyAgo = utcMidnight(-30);

  const [
    forecast,
    momentum,
    activeBriefs,
    pausedBriefs,
    discoveryQueue,
    sentToday,
    sentLast30,
    repliesLast30,
    conversionsLast30,
    todaysReplies,
    todaysScheduled,
    pipelineCount,
    openRate30,
    openedLast30,
    nextDueProspect,
    sendingTomorrow,
    bccFailures,
    recentEmails,
    recentReplies,
    recentConversions,
    recentRuns,
    suppressedCount,
  ] = await Promise.all([
    getForecast(),
    getMomentum(),
    prisma.searchBrief.count({ where: { active: true } }),
    prisma.searchBrief.count({ where: { active: false } }),
    // Discovery queue: scheduled but not yet sent
    prisma.prospect.count({
      where: { status: { in: ["New", "Scheduled"] }, scheduledInitial: { not: null } },
    }),
    prisma.email.count({ where: { poslat: true, poslatAt: { gte: todayStart, lt: tomorrowStart } } }),
    prisma.email.findMany({
      where: { poslat: true, poslatAt: { gte: thirtyAgo } },
      select: { poslatAt: true },
    }),
    prisma.reply.findMany({
      where: { receivedAt: { gte: thirtyAgo } },
      select: { receivedAt: true },
    }),
    prisma.conversion.findMany({
      where: { datumKonverzije: { gte: thirtyAgo } },
      select: { datumKonverzije: true },
    }),
    prisma.reply.count({ where: { receivedAt: { gte: todayStart, lt: tomorrowStart } } }),
    prisma.prospect.count({
      where: { scheduledInitial: { gte: todayStart, lt: tomorrowStart }, status: "Scheduled" },
    }),
    prisma.prospect.count({ where: { dealStage: { not: null } } }),
    prisma.email.count({ where: { poslat: true, poslatAt: { gte: thirtyAgo } } }),
    prisma.email.count({ where: { otvoren: true, poslatAt: { gte: thirtyAgo } } }),
    prisma.prospect.findFirst({
      where: { status: "Scheduled", scheduledInitial: { gte: now } },
      orderBy: { scheduledInitial: "asc" },
      select: { firmaNaziv: true, scheduledInitial: true, language: true },
    }),
    prisma.prospect.count({
      where: { status: "Scheduled", scheduledInitial: { gte: tomorrowStart, lt: dayAfter } },
    }),
    prisma.email.count({ where: { bccError: { not: null } } }),
    prisma.email.findMany({
      where: { poslat: true },
      select: { id: true, tip: true, subject: true, poslatAt: true, prospect: { select: { firmaNaziv: true, id: true } } },
      orderBy: { poslatAt: "desc" },
      take: 6,
    }),
    prisma.reply.findMany({
      select: { id: true, classification: true, receivedAt: true, prospect: { select: { firmaNaziv: true, id: true } } },
      orderBy: { receivedAt: "desc" },
      take: 6,
    }),
    prisma.conversion.findMany({
      select: { id: true, vrijednostProjekta: true, datumKonverzije: true, prospect: { select: { firmaNaziv: true, id: true } } },
      orderBy: { datumKonverzije: "desc" },
      take: 4,
    }),
    prisma.discoveryRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 4,
      select: { id: true, status: true, found: true, created: true, qualified: true, startedAt: true, brief: { select: { name: true } } },
    }),
    prisma.suppressedDomain.count(),
  ]);

  // 30-day daily activity chart — three series
  const dayKey = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const sendMap: Record<string, number> = {};
  for (const e of sentLast30) if (e.poslatAt) sendMap[dayKey(e.poslatAt)] = (sendMap[dayKey(e.poslatAt)] ?? 0) + 1;
  const replyMap: Record<string, number> = {};
  for (const r of repliesLast30) replyMap[dayKey(r.receivedAt)] = (replyMap[dayKey(r.receivedAt)] ?? 0) + 1;
  const convMap: Record<string, number> = {};
  for (const c of conversionsLast30) convMap[dayKey(c.datumKonverzije)] = (convMap[dayKey(c.datumKonverzije)] ?? 0) + 1;
  const chartDays = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    const k = d.toISOString().slice(0, 10);
    return { key: k, label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), sends: sendMap[k] ?? 0, replies: replyMap[k] ?? 0, conversions: convMap[k] ?? 0 };
  });
  const maxSeries = Math.max(1, ...chartDays.map((d) => Math.max(d.sends, d.replies * 4, d.conversions * 8)));

  // Aggregate the activity feed (most recent 14 events)
  type ActivityRow = { at: Date; kind: "send" | "reply" | "conversion" | "discovery"; title: string; sub: string; href?: string };
  const feed: ActivityRow[] = [
    ...recentEmails.map<ActivityRow>((e) => ({
      at: e.poslatAt!,
      kind: "send",
      title: `Sent "${e.tip}" — ${e.prospect.firmaNaziv}`,
      sub: e.subject.slice(0, 60),
      href: `/prospects/${e.prospect.id}`,
    })),
    ...recentReplies.map<ActivityRow>((r) => ({
      at: r.receivedAt,
      kind: "reply",
      title: `Reply ${r.classification ? `(${r.classification})` : ""} — ${r.prospect.firmaNaziv}`,
      sub: "Check the inbox",
      href: `/prospects/${r.prospect.id}`,
    })),
    ...recentConversions.map<ActivityRow>((c) => ({
      at: c.datumKonverzije,
      kind: "conversion",
      title: `Closed €${Math.round(c.vrijednostProjekta).toLocaleString("en-US")} — ${c.prospect.firmaNaziv}`,
      sub: "Conversion logged",
      href: `/prospects/${c.prospect.id}`,
    })),
    ...recentRuns.map<ActivityRow>((r) => ({
      at: r.startedAt,
      kind: "discovery",
      title: `Discovery — ${r.brief.name}`,
      sub: `Found ${r.found} · Created ${r.created} · Qualified ${r.qualified}`,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 12);

  const openRate = openRate30 > 0 ? Math.round((openedLast30 / openRate30) * 100) : 0;
  const replyRate = openRate30 > 0 ? Math.round((repliesLast30.length / openRate30) * 100) : 0;
  const autopilotLive = activeBriefs > 0;
  const greeting = timeOfDayGreeting();
  const totalSent30 = sentLast30.length;
  const totalReplies30 = repliesLast30.length;
  const totalConv30 = conversionsLast30.length;

  return (
    <div className="max-w-7xl space-y-6">
      {/* ─── Hero ─── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-semibold px-2.5 py-1 rounded-full ${autopilotLive ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30" : "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${autopilotLive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              {autopilotLive ? "Autopilot running" : "Autopilot paused"}
            </span>
            <p className="text-zinc-600 text-[11px] uppercase tracking-[0.18em] font-medium">
              {new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <h1 className="text-white text-3xl sm:text-4xl font-semibold tracking-tight leading-tight">
            {greeting}, Temim.
          </h1>
          <p className="text-zinc-500 text-sm mt-2">
            {activeBriefs} {activeBriefs === 1 ? "brief" : "briefs"} live · {sendingTomorrow} {sendingTomorrow === 1 ? "outreach" : "outreaches"} queued for tomorrow · Next discovery {relativeFromNow(nextAutopilot, now)} · Next send {relativeFromNow(nextSend, now)}.
          </p>
        </div>
        <RunAutopilotNowButton />
      </div>

      {/* ─── 4 KPI cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Closed this month" value={fmtCurrency(forecast.closedThisMonth)} sub={forecast.closedLastMonth > 0 ? `${forecast.trend30 >= 0 ? "+" : ""}${Math.round(forecast.trend30)}% vs last` : "First month"} tone="emerald" />
        <Kpi label="30-day forecast" value={fmtCurrency(forecast.expectedNext30)} sub="Probability-weighted" tone="accent" />
        <Kpi label="Meetings this month" value={momentum.meetingsThisMonth.toString()} sub={`Pipeline value ${fmtCurrency(forecast.pipelineValueOpen)}`} tone="neutral" />
        <Kpi label="Conversion rate" value={`${totalReplies30 > 0 ? Math.round((totalConv30 / totalReplies30) * 100) : 0}%`} sub={`${totalConv30} closed / ${totalReplies30} replies (30d)`} tone="amber" />
      </div>

      {/* ─── Two-column main: Discovery queue + Today's Status + Health ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Discovery queue (spans 2 cols) */}
        <div className="lg:col-span-2 rounded-2xl bg-gradient-to-br from-emerald-500/[0.06] via-[#0d0d12] to-[#0a0a12] border border-emerald-500/20 p-7 card-elevation">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-emerald-300/80 text-[11px] uppercase tracking-[0.18em] font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> Discovery Queue
              </p>
              <h2 className="text-white text-5xl sm:text-6xl font-semibold tracking-tight mt-3 leading-none" style={{ fontFamily: "var(--font-display-serif)" }}>
                {discoveryQueue}
              </h2>
              <p className="text-zinc-400 text-sm mt-2">prospects waiting in the pipeline</p>
              {nextDueProspect && (
                <p className="text-zinc-600 text-xs mt-3">
                  Next out: <span className="text-zinc-400">{nextDueProspect.firmaNaziv}</span> · {nextDueProspect.scheduledInitial ? formatParisDateTime(nextDueProspect.scheduledInitial) : ""}
                </p>
              )}
            </div>
            <div className="hidden sm:flex w-20 h-20 rounded-2xl bg-emerald-500/10 items-center justify-center shrink-0">
              <Bot className="w-9 h-9 text-emerald-400" strokeWidth={1.5} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-7 pt-5 border-t border-emerald-500/10">
            <Mini label="Sent today" value={sentToday} />
            <Mini label="Sent (30d)" value={totalSent30} />
            <Mini label="Replies (30d)" value={totalReplies30} />
          </div>
          <Link href="/autopilot" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-emerald-300 hover:text-emerald-200 transition-colors">
            Open autopilot <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Today's Status + Health */}
        <div className="space-y-3">
          <div className="rounded-2xl bg-[#0d0d12] border border-[#1c1c28] p-5 card-elevation">
            <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-semibold mb-3">Today&apos;s Status</p>
            <StatusRow icon={Reply} label="Replies" value={todaysReplies.toString()} tone="emerald" />
            <StatusRow icon={Mail} label="Scheduled out" value={todaysScheduled.toString()} tone="sky" />
            <StatusRow icon={CalendarCheck2} label="In pipeline" value={pipelineCount.toString()} tone="neutral" />
            <StatusRow icon={Eye} label="Open rate (30d)" value={`${openRate}%`} tone={openRate >= 40 ? "emerald" : openRate >= 20 ? "amber" : "muted"} />
          </div>
          <div className="rounded-2xl bg-[#0d0d12] border border-[#1c1c28] p-5 card-elevation">
            <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-semibold mb-3">Health</p>
            <HealthRow label="Sending domain" status="ok" detail="unlockd.art (Resend)" />
            <HealthRow label="Reply detection" status={process.env.IMAP_USER ? "ok" : "warn"} detail={process.env.IMAP_USER ? "IMAP polling 3×/day" : "Add IMAP_USER env"} />
            <HealthRow label="Calendly tracking" status="ok" detail="track endpoint live" />
            <HealthRow label="BCC failures" status={bccFailures === 0 ? "ok" : bccFailures < 5 ? "warn" : "err"} detail={bccFailures === 0 ? "0 in DB" : `${bccFailures} need attention`} />
            <HealthRow label="Suppression list" status="ok" detail={`${suppressedCount} domains`} />
          </div>
        </div>
      </div>

      {/* ─── Pipeline activity chart + Recent activity feed ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 rounded-2xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-semibold flex items-center gap-1.5">
                <Activity className="w-3 h-3" /> Pipeline Activity
              </p>
              <p className="text-zinc-300 text-sm mt-1">Last 30 days · sends, replies, conversions</p>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <Legend dot="bg-emerald-400" label={`${totalSent30} sends`} />
              <Legend dot="bg-sky-400" label={`${totalReplies30} replies`} />
              <Legend dot="bg-amber-400" label={`${totalConv30} conversions`} />
            </div>
          </div>
          <ActivityLineChart days={chartDays} max={maxSeries} />
          <p className="text-zinc-700 text-[10px] mt-3 tracking-widest uppercase tabular-nums">
            {chartDays[0].label} → {chartDays[chartDays.length - 1].label} · next send {formatParisDateTime(nextSend)}
          </p>
        </div>

        <div className="rounded-2xl bg-[#0d0d12] border border-[#1c1c28] p-5 card-elevation">
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-semibold mb-3 flex items-center gap-1.5">
            <Zap className="w-3 h-3" /> Recent Activity
          </p>
          {feed.length === 0 ? (
            <p className="text-zinc-600 text-sm py-6 text-center">Nothing yet. First fire 07:00 Paris.</p>
          ) : (
            <ul className="space-y-3.5">
              {feed.map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-xs">
                  <FeedDot kind={f.kind} />
                  <div className="min-w-0 flex-1">
                    {f.href ? (
                      <Link href={f.href} className="text-zinc-200 hover:text-emerald-300 font-medium block truncate">{f.title}</Link>
                    ) : (
                      <p className="text-zinc-200 font-medium truncate">{f.title}</p>
                    )}
                    <p className="text-zinc-600 mt-0.5 truncate">{f.sub}</p>
                  </div>
                  <span className="text-zinc-700 text-[10px] tabular-nums shrink-0">{relativeFromNow(f.at, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer */}
      <p className="text-center text-zinc-700 text-[11px] uppercase tracking-widest pt-2">
        Reply rate {replyRate}% · {pausedBriefs} paused briefs · {totalSent30} sends in 30 days
      </p>
    </div>
  );
}

/* ─────────── Components ─────────── */

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "emerald" | "accent" | "neutral" | "amber" }) {
  const toneClass = { emerald: "text-emerald-300", accent: "text-emerald-300", neutral: "text-zinc-100", amber: "text-amber-300" }[tone];
  return (
    <div className="rounded-2xl bg-[#0d0d12] border border-[#1c1c28] p-5 card-elevation">
      <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-semibold">{label}</p>
      <p className={`text-3xl mt-2 tabular-nums tracking-tight ${toneClass}`} style={{ fontFamily: "var(--font-display-serif)", fontWeight: 500 }}>
        {value}
      </p>
      <p className="text-zinc-600 text-xs mt-1.5">{sub}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-emerald-400/70 text-2xl tabular-nums tracking-tight" style={{ fontFamily: "var(--font-display-serif)", fontWeight: 500 }}>{value}</p>
      <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-semibold mt-1">{label}</p>
    </div>
  );
}

function StatusRow({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; value: string; tone: "emerald" | "sky" | "amber" | "neutral" | "muted" }) {
  const toneClass = { emerald: "text-emerald-300", sky: "text-sky-300", amber: "text-amber-300", neutral: "text-zinc-200", muted: "text-zinc-500" }[tone];
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#14141c] last:border-b-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <Icon strokeWidth={1.75} className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-zinc-400 text-sm">{label}</span>
      </div>
      <span className={`text-sm font-medium tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}

function HealthRow({ label, status, detail }: { label: string; status: "ok" | "warn" | "err"; detail: string }) {
  const dotClass = { ok: "bg-emerald-400 shadow-lg shadow-emerald-400/40", warn: "bg-amber-400", err: "bg-rose-400" }[status];
  const labelClass = { ok: "text-emerald-300", warn: "text-amber-300", err: "text-rose-300" }[status];
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#14141c] last:border-b-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        <span className="text-zinc-400 text-sm">{label}</span>
      </div>
      <span className={`text-[11px] uppercase tracking-wider font-semibold ${labelClass}`}>{detail}</span>
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="text-zinc-500 flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function FeedDot({ kind }: { kind: "send" | "reply" | "conversion" | "discovery" }) {
  const map = {
    send: { Icon: Mail, color: "text-zinc-500 bg-zinc-800/60" },
    reply: { Icon: Reply, color: "text-sky-300 bg-sky-500/15" },
    conversion: { Icon: CalendarCheck2, color: "text-emerald-300 bg-emerald-500/15" },
    discovery: { Icon: Sparkles, color: "text-amber-300 bg-amber-500/15" },
  }[kind];
  const Icon = map.Icon;
  return (
    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${map.color}`}>
      <Icon strokeWidth={1.75} className="w-3 h-3" />
    </div>
  );
}

function ActivityLineChart({ days, max }: { days: { key: string; label: string; sends: number; replies: number; conversions: number }[]; max: number }) {
  const W = 100;
  const H = 100;
  const stepX = W / Math.max(days.length - 1, 1);
  const scaleY = (n: number) => H - (n / max) * H;
  const path = (key: "sends" | "replies" | "conversions") =>
    days.map((d, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(2)} ${scaleY(d[key]).toFixed(2)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-32">
      {/* gridlines */}
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={0} y1={H * g} x2={W} y2={H * g} stroke="#1c1c28" strokeWidth={0.25} />
      ))}
      {/* sends — emerald */}
      <path d={path("sends")} fill="none" stroke="#10b981" strokeWidth={0.8} strokeLinejoin="round" strokeLinecap="round" />
      {/* replies — sky */}
      <path d={path("replies")} fill="none" stroke="#38bdf8" strokeWidth={0.8} strokeLinejoin="round" strokeLinecap="round" />
      {/* conversions — amber */}
      <path d={path("conversions")} fill="none" stroke="#fbbf24" strokeWidth={0.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Silence unused-import warning for Server/Globe (kept available for future health rows)
void Server; void Globe;
