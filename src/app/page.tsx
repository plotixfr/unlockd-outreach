import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  nextAutopilotRun,
  nextSendRun,
  formatParisDateTime,
  relativeFromNow,
} from "@/lib/autopilotStatus";
import { getForecast } from "@/lib/todayQueue";
import {
  Activity,
  Zap,
  Sparkles,
  Mail,
  Reply,
  CalendarCheck2,
  CheckCircle2,
  BellRing,
  AlertTriangle,
} from "lucide-react";
import { RunAutopilotNowButton } from "@/components/RunAutopilotNowButton";
import { PipelineChart } from "@/components/charts/PipelineChart";
import { EmptyState } from "@/components/ui/EmptyState";

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
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const dailyCap = Number(process.env.DAILY_SEND_CAP ?? 30);

  const [
    forecast,
    activeBriefs,
    pausedBriefs,
    discoveryQueue,
    sentToday,
    sentLast30,
    repliesLast30,
    conversionsLast30,
    todaysScheduled,
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
    // "Needs attention" — read-only lookups for replies awaiting an answer,
    // reminders due today and Failed prospects with a stored error.
    repliedAwaiting,
    remindersDue,
    failedProspects,
  ] = await Promise.all([
    getForecast(),
    prisma.searchBrief.count({ where: { active: true } }),
    prisma.searchBrief.count({ where: { active: false } }),
    prisma.prospect.count({
      where: { status: { in: ["New", "Scheduled"] }, scheduledInitial: { not: null } },
    }),
    prisma.email.count({ where: { poslat: true, poslatAt: { gte: todayStart, lt: tomorrowStart } } }),
    prisma.email.findMany({ where: { poslat: true, poslatAt: { gte: thirtyAgo } }, select: { poslatAt: true } }),
    prisma.reply.findMany({ where: { receivedAt: { gte: thirtyAgo } }, select: { receivedAt: true } }),
    prisma.conversion.findMany({ where: { datumKonverzije: { gte: thirtyAgo } }, select: { datumKonverzije: true } }),
    prisma.prospect.count({
      where: { scheduledInitial: { gte: todayStart, lt: tomorrowStart }, status: "Scheduled" },
    }),
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
    prisma.prospect.findMany({
      where: { status: "Replied" },
      select: { id: true, firmaNaziv: true, nisa: true, datumOdgovora: true },
      orderBy: { datumOdgovora: "desc" },
      take: 6,
    }),
    prisma.prospect.findMany({
      where: {
        podsjetnikDatum: { not: null, lte: todayEnd },
        status: { notIn: ["Converted", "Unsubscribed", "Bounced"] },
      },
      select: { id: true, firmaNaziv: true, podsjetnikDatum: true, podsjetnikNapomena: true },
      orderBy: { podsjetnikDatum: "asc" },
      take: 6,
    }),
    prisma.prospect.findMany({
      where: { status: "Failed", lastError: { not: null } },
      select: { id: true, firmaNaziv: true, lastError: true, lastAttemptAt: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
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

  const replyRate = openRate30 > 0 ? Math.round((repliesLast30.length / openRate30) * 100) : 0;
  const autopilotLive = activeBriefs > 0;
  const greeting = timeOfDayGreeting();
  const totalSent30 = sentLast30.length;
  const totalReplies30 = repliesLast30.length;
  const totalConv30 = conversionsLast30.length;
  const attentionCount = repliedAwaiting.length + remindersDue.length + failedProspects.length;

  return (
    <div className="max-w-[1400px] space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] text-[var(--text)]">
              {greeting}, Temim.
            </h1>
            <span className={`badge ${autopilotLive ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
              <span className={`dot ${autopilotLive ? "dot-live" : ""}`} />
              {autopilotLive ? "Autopilot running" : "Autopilot paused"}
            </span>
          </div>
          <p className="text-[var(--text-secondary)] text-sm mt-1.5">
            {activeBriefs} {activeBriefs === 1 ? "brief" : "briefs"} live · {discoveryQueue} prospects queued · {sendingTomorrow} going out tomorrow · Next discovery {relativeFromNow(nextAutopilot, now)} · Next send {relativeFromNow(nextSend, now)}.
          </p>
        </div>
        <RunAutopilotNowButton />
      </div>

      {/* ─── 4 KPI cards ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Closed this month"
          value={fmtCurrency(forecast.closedThisMonth)}
          sub={forecast.closedLastMonth > 0 ? `${forecast.trend30 >= 0 ? "+" : ""}${Math.round(forecast.trend30)}% vs last month` : "First month with revenue"}
          accent
        />
        <Kpi
          label="30-day forecast"
          value={fmtCurrency(forecast.expectedNext30)}
          sub={`Open pipeline ${fmtCurrency(forecast.pipelineValueOpen)} · probability-weighted`}
        />
        <Kpi
          label="Reply rate"
          value={`${replyRate}%`}
          sub={`${totalReplies30} replies / ${totalSent30} sends (30d)`}
        />
        <Kpi
          label="Sends today"
          value={`${sentToday} / ${dailyCap}`}
          sub={
            nextDueProspect
              ? `Next out ${nextDueProspect.firmaNaziv}${nextDueProspect.scheduledInitial ? ` · ${formatParisDateTime(nextDueProspect.scheduledInitial)}` : ""}`
              : `${todaysScheduled} scheduled today · cap ${dailyCap}/day`
          }
        />
      </div>

      {/* ─── Needs attention ─── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="section-label"><BellRing className="w-3 h-3" /> Needs attention</p>
          <p className="text-xs text-[var(--text-muted)]">
            {repliedAwaiting.length} replies · {remindersDue.length} reminders · {failedProspects.length} failed
          </p>
        </div>
        {attentionCount === 0 ? (
          <EmptyState
            icon={<CheckCircle2 />}
            title="Nothing needs your attention"
            hint="Replies waiting for an answer, reminders due today and Failed prospects with a stored error show up here."
          />
        ) : (
          <div className="card divide-y divide-[var(--border)]">
            {repliedAwaiting.map((p) => (
              <AttentionRow
                key={p.id}
                href={`/prospects/${p.id}`}
                badge="Reply"
                badgeCls="bg-emerald-50 text-emerald-700 border border-emerald-200"
                icon={<Reply className="w-3.5 h-3.5" />}
                title={p.firmaNaziv}
                sub={`Replied — awaiting your answer · ${p.nisa}`}
                when={p.datumOdgovora ? relativeFromNow(p.datumOdgovora, now) : ""}
              />
            ))}
            {remindersDue.map((p) => (
              <AttentionRow
                key={p.id}
                href={`/prospects/${p.id}`}
                badge="Reminder"
                badgeCls="bg-sky-50 text-sky-700 border border-sky-200"
                icon={<BellRing className="w-3.5 h-3.5" />}
                title={p.firmaNaziv}
                sub={p.podsjetnikNapomena || "Reminder due"}
                when={p.podsjetnikDatum ? relativeFromNow(p.podsjetnikDatum, now) : ""}
              />
            ))}
            {failedProspects.map((p) => (
              <AttentionRow
                key={p.id}
                href={`/prospects/${p.id}`}
                badge="Failed"
                badgeCls="bg-red-50 text-red-700 border border-red-200"
                icon={<AlertTriangle className="w-3.5 h-3.5" />}
                title={p.firmaNaziv}
                sub={p.lastError ?? ""}
                subTitle={p.lastError ?? undefined}
                subCls="text-red-600"
                when={p.lastAttemptAt ? relativeFromNow(p.lastAttemptAt, now) : ""}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Pipeline chart + activity feed ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="section-label"><Activity className="w-3 h-3" /> Pipeline activity</p>
              <p className="text-[var(--text)] text-sm font-semibold mt-2">Last 30 days · sends, replies, conversions</p>
            </div>
            <div className="text-right">
              <p className="section-label justify-end">Totals</p>
              <p className="text-[var(--text-secondary)] text-xs mt-1 tabular">
                <span className="text-emerald-700 font-semibold">{totalSent30}</span> sends ·
                <span className="text-sky-700 font-semibold"> {totalReplies30}</span> replies ·
                <span className="text-amber-700 font-semibold"> {totalConv30}</span> conv.
              </p>
            </div>
          </div>
          <PipelineChart data={chartDays} />
        </div>

        <div>
          <p className="section-label mb-3"><Sparkles className="w-3 h-3" /> Recent activity</p>
          {feed.length === 0 ? (
            <EmptyState
              icon={<Activity />}
              title="No activity yet"
              hint="Sends, replies, conversions and discovery runs land here as autopilot works. First discovery fires at 07:00 Paris."
            />
          ) : (
            <div className="card p-5">
              <ul className="space-y-3.5">
                {feed.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-xs">
                    <FeedDot kind={f.kind} />
                    <div className="min-w-0 flex-1">
                      {f.href ? (
                        <Link href={f.href} className="text-[var(--text)] hover:text-[var(--accent)] font-semibold block truncate transition-colors">{f.title}</Link>
                      ) : (
                        <p className="text-[var(--text)] font-semibold truncate">{f.title}</p>
                      )}
                      <p className="text-[var(--text-muted)] mt-0.5 truncate">{f.sub}</p>
                    </div>
                    <span className="text-[var(--text-muted)] text-[10px] tabular shrink-0 pt-0.5">{relativeFromNow(f.at, now)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ─── Compact health strip ─── */}
      <div className="card px-6 py-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <p className="section-label"><Zap className="w-3 h-3" /> Health</p>
          <HealthCell status="ok" label="Sending domain" detail="Resend · unlockd.art" />
          <HealthCell
            status={process.env.IMAP_USER ? "ok" : "warn"}
            label="Reply detection"
            detail={process.env.IMAP_USER ? "IMAP 3×/day" : "Add IMAP — follow-ups paused"}
          />
          <HealthCell status="ok" label="Calendly tracking" detail="Live" />
          <HealthCell
            status={bccFailures === 0 ? "ok" : bccFailures < 5 ? "warn" : "err"}
            label="BCC failures"
            detail={bccFailures === 0 ? "0 logged" : `${bccFailures} fails — see Email.bccError`}
          />
          <HealthCell status="ok" label="Suppression list" detail={`${suppressedCount} domains`} />
          <p className="text-[11px] text-[var(--text-muted)] ml-auto">
            {pausedBriefs} paused {pausedBriefs === 1 ? "brief" : "briefs"} · <Link href="/autopilot" className="text-[var(--accent)] hover:underline font-medium">Open autopilot</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="card card-interactive p-5">
      <p className="section-label">{label}</p>
      <p className={`kpi-value mt-3 ${accent ? "text-[var(--accent)]" : ""}`}>{value}</p>
      <p className="text-[var(--text-muted)] text-xs mt-2">{sub}</p>
    </div>
  );
}

function AttentionRow({
  href,
  badge,
  badgeCls,
  icon,
  title,
  sub,
  subTitle,
  subCls,
  when,
}: {
  href: string;
  badge: string;
  badgeCls: string;
  icon: React.ReactNode;
  title: string;
  sub: string;
  subTitle?: string;
  subCls?: string;
  when: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-4 px-5 py-3 hover:bg-zinc-50 transition-colors first:rounded-t-xl last:rounded-b-xl">
      <span className={`badge w-[92px] justify-center shrink-0 ${badgeCls}`}>
        {icon}
        {badge}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[var(--text)] text-sm font-semibold truncate">{title}</p>
        <p className={`text-xs mt-0.5 truncate ${subCls ?? "text-[var(--text-muted)]"}`} title={subTitle}>{sub}</p>
      </div>
      <span className="text-[var(--text-muted)] text-[11px] tabular shrink-0">{when}</span>
    </Link>
  );
}

function HealthCell({ status, label, detail }: { status: "ok" | "warn" | "err"; label: string; detail: string }) {
  const dotClass = { ok: "bg-emerald-500", warn: "bg-amber-500", err: "bg-red-500" }[status];
  const detailClass = { ok: "text-[var(--text-secondary)]", warn: "text-amber-600", err: "text-red-600" }[status];
  return (
    <div className="flex items-center gap-2">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
      <span className="text-xs font-medium text-[var(--text)]">{label}</span>
      <span className={`text-[11px] ${detailClass}`}>{detail}</span>
    </div>
  );
}

function FeedDot({ kind }: { kind: "send" | "reply" | "conversion" | "discovery" }) {
  const map = {
    send: { Icon: Mail, color: "text-zinc-500 bg-zinc-100 border-zinc-200" },
    reply: { Icon: Reply, color: "text-sky-700 bg-sky-50 border-sky-200" },
    conversion: { Icon: CalendarCheck2, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    discovery: { Icon: Sparkles, color: "text-amber-700 bg-amber-50 border-amber-200" },
  }[kind];
  const Icon = map.Icon;
  return (
    <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${map.color}`}>
      <Icon strokeWidth={1.75} className="w-3.5 h-3.5" />
    </div>
  );
}
