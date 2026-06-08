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
  Bot,
} from "lucide-react";
import { RunAutopilotNowButton } from "@/components/RunAutopilotNowButton";
import { PipelineChart } from "@/components/charts/PipelineChart";

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
    prisma.prospect.count({
      where: { status: { in: ["New", "Scheduled"] }, scheduledInitial: { not: null } },
    }),
    prisma.email.count({ where: { poslat: true, poslatAt: { gte: todayStart, lt: tomorrowStart } } }),
    prisma.email.findMany({ where: { poslat: true, poslatAt: { gte: thirtyAgo } }, select: { poslatAt: true } }),
    prisma.reply.findMany({ where: { receivedAt: { gte: thirtyAgo } }, select: { receivedAt: true } }),
    prisma.conversion.findMany({ where: { datumKonverzije: { gte: thirtyAgo } }, select: { datumKonverzije: true } }),
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

  // Daily activity buckets
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

  type ActivityRow = { at: Date; kind: "send" | "reply" | "conversion" | "discovery"; title: string; sub: string; href?: string };
  const feed: ActivityRow[] = [
    ...recentEmails.map<ActivityRow>((e) => ({ at: e.poslatAt!, kind: "send", title: `Sent "${e.tip}" — ${e.prospect.firmaNaziv}`, sub: e.subject.slice(0, 60), href: `/prospects/${e.prospect.id}` })),
    ...recentReplies.map<ActivityRow>((r) => ({ at: r.receivedAt, kind: "reply", title: `Reply${r.classification ? ` (${r.classification})` : ""} — ${r.prospect.firmaNaziv}`, sub: "Check the inbox", href: `/prospects/${r.prospect.id}` })),
    ...recentConversions.map<ActivityRow>((c) => ({ at: c.datumKonverzije, kind: "conversion", title: `Closed €${Math.round(c.vrijednostProjekta).toLocaleString("en-US")} — ${c.prospect.firmaNaziv}`, sub: "Conversion logged", href: `/prospects/${c.prospect.id}` })),
    ...recentRuns.map<ActivityRow>((r) => ({ at: r.startedAt, kind: "discovery", title: `Discovery — ${r.brief.name}`, sub: `Found ${r.found} · Created ${r.created} · Qualified ${r.qualified}` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 12);

  const openRate = openRate30 > 0 ? Math.round((openedLast30 / openRate30) * 100) : 0;
  const replyRate = openRate30 > 0 ? Math.round((repliesLast30.length / openRate30) * 100) : 0;
  const autopilotLive = activeBriefs > 0;
  const greeting = timeOfDayGreeting();
  const totalSent30 = sentLast30.length;
  const totalReplies30 = repliesLast30.length;
  const totalConv30 = conversionsLast30.length;

  return (
    <div className="max-w-[1400px] space-y-3">
      {/* ─── Hero ─── */}
      <div className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className={`pill ${autopilotLive ? "pill-accent" : "pill-warning"}`}>
              <span className={`dot ${autopilotLive ? "dot-live" : ""}`} />
              {autopilotLive ? "Autopilot running" : "Autopilot paused"}
            </span>
            <span className="text-[10.5px] uppercase tracking-[0.18em] font-semibold text-[var(--text-dim)]">
              {new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
            </span>
          </div>
          <h1 className="text-white text-4xl sm:text-5xl tracking-tight">
            {greeting}, <span className="text-gradient-brand">Temim</span>.
          </h1>
          <p className="text-[var(--text-muted)] text-sm mt-3 max-w-2xl">
            {activeBriefs} {activeBriefs === 1 ? "brief" : "briefs"} live · {sendingTomorrow} queued for tomorrow · Next discovery {relativeFromNow(nextAutopilot, now)} · Next send {relativeFromNow(nextSend, now)}.
          </p>
        </div>
        <RunAutopilotNowButton />
      </div>

      {/* ─── 4 KPI cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Closed this month" value={fmtCurrency(forecast.closedThisMonth)} sub={forecast.closedLastMonth > 0 ? `${forecast.trend30 >= 0 ? "+" : ""}${Math.round(forecast.trend30)}% vs last` : "First month with revenue"} tone="emerald" />
        <Kpi label="30-day forecast" value={fmtCurrency(forecast.expectedNext30)} sub="Probability-weighted" tone="neutral" />
        <Kpi label="Meetings this month" value={momentum.meetingsThisMonth.toString()} sub={`Pipeline value ${fmtCurrency(forecast.pipelineValueOpen)}`} tone="neutral" />
        <Kpi label="Reply rate" value={`${replyRate}%`} sub={`${totalReplies30} replies / ${totalSent30} sends (30d)`} tone="amber" />
      </div>

      {/* ─── Two-column: Discovery Queue + Today's Status + Health ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 card card-accent corner-accent p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="section-label text-emerald-400/80">
                <Sparkles className="w-3 h-3" /> Discovery Queue
              </p>
              <p className="display-number text-white text-[80px] mt-4 leading-none">{discoveryQueue}</p>
              <p className="text-[var(--text-muted)] text-sm mt-3 font-medium">prospects in the pipeline</p>
              {nextDueProspect && (
                <p className="text-[var(--text-dim)] text-xs mt-5 tabular">
                  Next out → <span className="text-[var(--text-muted)]">{nextDueProspect.firmaNaziv}</span> · {nextDueProspect.scheduledInitial ? formatParisDateTime(nextDueProspect.scheduledInitial) : ""}
                </p>
              )}
            </div>
            <div className="hidden sm:flex w-16 h-16 rounded-md bg-emerald-500/10 items-center justify-center shrink-0 border border-emerald-500/20">
              <Bot className="w-7 h-7 text-emerald-400" strokeWidth={1.4} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6 mt-8 pt-6 etch-top">
            <Mini label="Sent today" value={sentToday} />
            <Mini label="Sent (30d)" value={totalSent30} />
            <Mini label="Replies (30d)" value={totalReplies30} />
          </div>
          <div className="mt-7 flex items-center gap-3">
            <Link href="/autopilot" className="btn-accent">
              Open autopilot <ArrowUpRight className="w-4 h-4" />
            </Link>
            <Link href="/prospects" className="btn-ghost">
              View prospects
            </Link>
          </div>
        </div>

        <div className="space-y-3">
          <div className="card p-5">
            <p className="section-label mb-4"><Activity className="w-3 h-3" /> Today&apos;s Status</p>
            <StatusRow icon={Reply} label="Replies" value={todaysReplies.toString()} tone="emerald" />
            <StatusRow icon={Mail} label="Scheduled out" value={todaysScheduled.toString()} tone="info" />
            <StatusRow icon={CalendarCheck2} label="In pipeline" value={pipelineCount.toString()} tone="neutral" />
            <StatusRow icon={Eye} label="Open rate (30d)" value={`${openRate}%`} tone={openRate >= 40 ? "emerald" : openRate >= 20 ? "amber" : "muted"} />
          </div>
          <div className="card p-5">
            <p className="section-label mb-4"><Zap className="w-3 h-3" /> Health</p>
            <HealthRow label="Sending domain" status="ok" detail="Resend · unlockd.art" />
            <HealthRow label="Reply detection" status={process.env.IMAP_USER ? "ok" : "warn"} detail={process.env.IMAP_USER ? "IMAP 3×/day" : "Add IMAP"} />
            <HealthRow label="Calendly tracking" status="ok" detail="Live" />
            <HealthRow label="BCC failures" status={bccFailures === 0 ? "ok" : bccFailures < 5 ? "warn" : "err"} detail={bccFailures === 0 ? "0 logged" : `${bccFailures} fails`} />
            <HealthRow label="Suppression list" status="ok" detail={`${suppressedCount} domains`} />
          </div>
        </div>
      </div>

      {/* ─── Pipeline chart + Recent activity ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="section-label"><Activity className="w-3 h-3" /> Pipeline Activity</p>
              <p className="text-white text-sm font-semibold mt-2">Last 30 days · sends, replies, conversions</p>
            </div>
            <div className="text-right">
              <p className="text-[var(--text-dim)] text-[10px] uppercase tracking-widest font-semibold">Totals</p>
              <p className="text-[var(--text-muted)] text-xs mt-1 tabular">
                <span className="text-emerald-300 font-semibold">{totalSent30}</span> sends ·
                <span className="text-sky-300 font-semibold"> {totalReplies30}</span> replies ·
                <span className="text-amber-300 font-semibold"> {totalConv30}</span> conv.
              </p>
            </div>
          </div>
          <PipelineChart data={chartDays} />
        </div>

        <div className="card p-5">
          <p className="section-label mb-4"><Sparkles className="w-3 h-3" /> Recent Activity</p>
          {feed.length === 0 ? (
            <p className="text-[var(--text-dim)] text-sm py-8 text-center">Nothing yet. First autopilot fire 07:00 Paris.</p>
          ) : (
            <ul className="space-y-3.5">
              {feed.map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-xs">
                  <FeedDot kind={f.kind} />
                  <div className="min-w-0 flex-1">
                    {f.href ? (
                      <Link href={f.href} className="text-[var(--text)] hover:text-emerald-300 font-semibold block truncate transition-colors">{f.title}</Link>
                    ) : (
                      <p className="text-[var(--text)] font-semibold truncate">{f.title}</p>
                    )}
                    <p className="text-[var(--text-dim)] mt-0.5 truncate">{f.sub}</p>
                  </div>
                  <span className="text-[var(--text-faint)] text-[10px] tabular shrink-0 pt-0.5">{relativeFromNow(f.at, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-center text-[var(--text-faint)] text-[10.5px] uppercase tracking-widest pt-4 pb-2 font-semibold">
        Reply rate {replyRate}% · {pausedBriefs} paused briefs · {totalSent30} sends in 30 days
      </p>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "emerald" | "neutral" | "amber" }) {
  const toneClass = { emerald: "text-emerald-300", neutral: "text-white", amber: "text-amber-300" }[tone];
  return (
    <div className="card card-interactive p-5">
      <p className="section-label">{label}</p>
      <p className={`display-number text-3xl sm:text-[36px] mt-3 ${toneClass}`}>{value}</p>
      <p className="text-[var(--text-dim)] text-xs mt-2 font-medium">{sub}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="display-number text-emerald-400/85 text-2xl">{value}</p>
      <p className="text-[var(--text-dim)] text-[10px] uppercase tracking-widest font-semibold mt-1.5">{label}</p>
    </div>
  );
}

function StatusRow({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; label: string; value: string; tone: "emerald" | "info" | "amber" | "neutral" | "muted" }) {
  const toneClass = { emerald: "text-emerald-300", info: "text-sky-300", amber: "text-amber-300", neutral: "text-white", muted: "text-[var(--text-dim)]" }[tone];
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--border-1)] last:border-b-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <Icon strokeWidth={1.75} className="w-3.5 h-3.5 text-[var(--text-dim)]" />
        <span className="text-[var(--text-muted)] text-sm">{label}</span>
      </div>
      <span className={`text-sm font-bold tabular ${toneClass}`}>{value}</span>
    </div>
  );
}

function HealthRow({ label, status, detail }: { label: string; status: "ok" | "warn" | "err"; detail: string }) {
  const dotClass = { ok: "bg-emerald-400", warn: "bg-amber-400", err: "bg-rose-400" }[status];
  const detailClass = { ok: "text-emerald-300", warn: "text-amber-300", err: "text-rose-300" }[status];
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--border-1)] last:border-b-0 last:pb-0">
      <div className="flex items-center gap-2.5">
        <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
        <span className="text-[var(--text-muted)] text-sm">{label}</span>
      </div>
      <span className={`text-[10.5px] uppercase tracking-wider font-bold ${detailClass}`}>{detail}</span>
    </div>
  );
}

function FeedDot({ kind }: { kind: "send" | "reply" | "conversion" | "discovery" }) {
  const map = {
    send: { Icon: Mail, color: "text-zinc-400 bg-zinc-800/40 border-[var(--border-2)]" },
    reply: { Icon: Reply, color: "text-sky-300 bg-sky-500/15 border-sky-500/30" },
    conversion: { Icon: CalendarCheck2, color: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30" },
    discovery: { Icon: Sparkles, color: "text-amber-300 bg-amber-500/15 border-amber-500/30" },
  }[kind];
  const Icon = map.Icon;
  return (
    <div className={`w-7 h-7 rounded-sm flex items-center justify-center shrink-0 border ${map.color}`}>
      <Icon strokeWidth={1.75} className="w-3.5 h-3.5" />
    </div>
  );
}
