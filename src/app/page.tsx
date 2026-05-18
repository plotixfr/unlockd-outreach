import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STATUS_BOJE, PIPELINE_ORDER } from "@/lib/constants";
import { nextAutopilotRun, nextSendRun, formatParisDateTime, relativeFromNow } from "@/lib/autopilotStatus";
import { Activity, ArrowUpRight, Clock, Flame, MessageSquareReply, Sparkles, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

function utcMidnight(offsetDays = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (offsetDays) d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

export default async function DashboardPage() {
  const todayStart = utcMidnight();
  const todayEnd = utcMidnight(1);
  const tomorrowStart = utcMidnight(1);
  const tomorrowEnd = utcMidnight(2);
  const fourteenDaysAgo = utcMidnight(-14);

  const now = new Date();
  const nextAutopilot = nextAutopilotRun(now);
  const nextSend = nextSendRun(now);

  const [
    total,
    scheduled,
    replied,
    converted,
    emailsToday,
    totalSent,
    totalOpened,
    conversionSum,
    recentEmails,
    upcomingProspects,
    recentReplies,
    activeBriefsCount,
    initialsScheduledToday,
    initialsScheduledTomorrow,
    repliesNeedingResponse,
    pendingDrafts,
    ...pipelineCounts
  ] = await Promise.all([
    prisma.prospect.count(),
    prisma.prospect.count({ where: { status: "Scheduled" } }),
    prisma.prospect.count({ where: { status: "Replied" } }),
    prisma.prospect.count({ where: { status: "Converted" } }),
    prisma.email.count({ where: { poslat: true, poslatAt: { gte: todayStart } } }),
    prisma.email.count({ where: { poslat: true } }),
    prisma.email.count({ where: { otvorenAt: { not: null } } }),
    prisma.conversion.aggregate({ _sum: { vrijednostProjekta: true } }),
    prisma.email.findMany({
      where: { poslat: true, poslatAt: { gte: fourteenDaysAgo } },
      select: { poslatAt: true },
    }),
    prisma.prospect.findMany({
      where: { status: "Scheduled" },
      select: { id: true, firmaNaziv: true, scheduledInitial: true, nisa: true, grad: true },
      orderBy: { scheduledInitial: "asc" },
      take: 6,
    }),
    prisma.prospect.findMany({
      where: { status: { in: ["Replied", "Converted"] } },
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: { id: true, firmaNaziv: true, status: true, grad: true, nisa: true },
    }),
    prisma.searchBrief.count({ where: { active: true } }),
    prisma.prospect.count({
      where: { status: "Scheduled", scheduledInitial: { gte: todayStart, lt: todayEnd } },
    }),
    prisma.prospect.count({
      where: { status: "Scheduled", scheduledInitial: { gte: tomorrowStart, lt: tomorrowEnd } },
    }),
    prisma.reply.count({
      where: {
        draft: { not: null },
        classification: { in: ["Interested", "Question", "NotNow", "WrongPerson"] },
      },
    }),
    prisma.email.count({ where: { calendlyClicked: true, prospect: { status: { not: "Converted" } } } }),
    ...PIPELINE_ORDER.map((s) => prisma.prospect.count({ where: { status: s } })),
  ]);

  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
  const totalConversionEur = conversionSum._sum.vrijednostProjekta ?? 0;
  const activeCampaigns =
    pipelineCounts[PIPELINE_ORDER.indexOf("Emailed")] +
    pipelineCounts[PIPELINE_ORDER.indexOf("Follow1")] +
    pipelineCounts[PIPELINE_ORDER.indexOf("Follow2")] +
    pipelineCounts[PIPELINE_ORDER.indexOf("Follow3")];

  // 14-day activity chart
  const dayMap: Record<string, number> = {};
  for (const e of recentEmails) {
    if (!e.poslatAt) continue;
    const key = e.poslatAt.toISOString().slice(0, 10);
    dayMap[key] = (dayMap[key] ?? 0) + 1;
  }
  const chartDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const key = d.toISOString().slice(0, 10);
    return {
      key,
      label: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
      short: d.toLocaleDateString("fr-FR", { day: "numeric" }),
      count: dayMap[key] ?? 0,
    };
  });
  const maxDay = Math.max(...chartDays.map((d) => d.count), 1);
  const pipeline = PIPELINE_ORDER.map((s, i) => ({ status: s, count: pipelineCounts[i] ?? 0 }));
  const maxCount = Math.max(...pipeline.map((p) => p.count), 1);

  return (
    <div className="max-w-6xl space-y-10">
      {/* Hero */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-[0.18em] font-medium mb-2">Dashboard</p>
          <h1 className="text-3xl font-semibold text-white tracking-tight">
            {emailsToday > 0
              ? `${emailsToday} mail${emailsToday === 1 ? "" : (emailsToday < 5 ? "a" : "ova")} poslano danas`
              : "Dobro došao nazad."}
          </h1>
          <p className="text-zinc-500 text-sm mt-2">
            {activeBriefsCount > 0
              ? `${activeBriefsCount} aktivn${activeBriefsCount === 1 ? "i brief" : "ih briefova"} · sljedeći autopilot run ${relativeFromNow(nextAutopilot, now)}`
              : "Autopilot pauziran — postavi briefove da krene."}
          </p>
        </div>
        <Link
          href="/autopilot"
          className="group inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30"
        >
          Autopilot
          <ArrowUpRight strokeWidth={2} className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
        </Link>
      </div>

      {/* "Danas" — live status strip */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0d0d18] to-[#0a0a12] border border-[#1c1c28] p-6 card-elevation">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${activeBriefsCount > 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800/50 text-zinc-600"}`}>
              <Activity strokeWidth={2} className="w-5 h-5" />
            </div>
            <div>
              <p className="text-zinc-500 text-[11px] uppercase tracking-wider font-medium">Danas</p>
              <p className="text-white text-base font-medium mt-0.5">
                {initialsScheduledToday + emailsToday} mailova kreće · {initialsScheduledTomorrow} sutra
              </p>
              <p className="text-zinc-500 text-xs mt-0.5">
                Send batch {relativeFromNow(nextSend, now)} · {formatParisDateTime(nextSend)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {repliesNeedingResponse > 0 && (
              <Link
                href="/prospects?status=Replied"
                className="group inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm font-medium hover:bg-emerald-500/15 transition-all"
              >
                <MessageSquareReply strokeWidth={2} className="w-4 h-4" />
                {repliesNeedingResponse} draft{repliesNeedingResponse === 1 ? "" : "a"} čeka
              </Link>
            )}
            {pendingDrafts > 0 && (
              <Link
                href="/prospects"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm font-medium hover:bg-amber-500/15 transition-all"
              >
                <Flame strokeWidth={2} className="w-4 h-4" />
                {pendingDrafts} otvorio Calendly
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Prospekti", value: total.toLocaleString("fr-FR"), sub: `${scheduled} u sekvenci` },
          { label: "Otvaranja", value: `${openRate}%`, sub: `${totalOpened} / ${totalSent}`, tone: openRate >= 30 ? "good" : openRate > 0 ? "warn" : "muted" },
          { label: "Replyji", value: replied.toLocaleString("fr-FR"), sub: `${activeCampaigns} aktivne`, tone: replied > 0 ? "good" : "muted" },
          {
            label: "Prihod",
            value: totalConversionEur > 0 ? `${totalConversionEur.toLocaleString("fr-FR")} €` : "—",
            sub: `${converted} klijent${converted === 1 ? "" : "a"}`,
            tone: "good" as const,
          },
        ].map((s, i) => (
          <div key={i} className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-5 card-elevation">
            <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium">{s.label}</p>
            <p
              className={`text-2xl font-semibold mt-2 tracking-tight ${
                s.tone === "good"
                  ? "text-emerald-400"
                  : s.tone === "warn"
                    ? "text-amber-400"
                    : s.tone === "muted"
                      ? "text-zinc-500"
                      : "text-white"
              }`}
            >
              {s.value}
            </p>
            <p className="text-zinc-600 text-xs mt-1.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <TrendingUp strokeWidth={2} className="w-4 h-4 text-zinc-500" />
            <h2 className="text-zinc-200 text-sm font-medium">Aktivnost — 14 dana</h2>
          </div>
          <p className="text-zinc-600 text-xs">{recentEmails.length} mailova ukupno</p>
        </div>
        {recentEmails.length === 0 ? (
          <p className="text-zinc-600 text-sm py-8 text-center">Još nema poslanih emailova.</p>
        ) : (
          <div className="flex items-end gap-1.5 h-28">
            {chartDays.map((day) => (
              <div key={day.key} className="flex-1 flex flex-col items-center gap-2 group">
                <div className="relative w-full flex items-end justify-center h-20">
                  <div
                    title={`${day.label}: ${day.count}`}
                    className="w-full rounded-md bg-gradient-to-t from-indigo-600/30 to-indigo-400/50 group-hover:from-indigo-600/50 group-hover:to-indigo-400/70 transition-all"
                    style={{ height: `${Math.max((day.count / maxDay) * 80, day.count > 0 ? 4 : 2)}px` }}
                  />
                </div>
                <span className="text-zinc-700 text-[10px] select-none font-medium">{day.short}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Pipeline */}
        <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation">
          <h2 className="text-zinc-200 text-sm font-medium mb-5">Pipeline</h2>
          {total === 0 ? (
            <p className="text-zinc-600 text-sm py-4">Nema prospekata u bazi.</p>
          ) : (
            <div className="space-y-3">
              {pipeline.map(({ status, count }) => (
                <div key={status} className="flex items-center gap-3">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-medium w-24 text-center shrink-0 tracking-wider uppercase ${STATUS_BOJE[status]}`}
                  >
                    {status}
                  </span>
                  <div className="flex-1 bg-[#14141c] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all"
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-zinc-400 text-sm w-8 text-right shrink-0 font-medium tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming */}
        <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Clock strokeWidth={2} className="w-4 h-4 text-zinc-500" />
              <h2 className="text-zinc-200 text-sm font-medium">Predstojeće</h2>
            </div>
            <span className="text-zinc-600 text-xs">Najbliže 6</span>
          </div>
          {upcomingProspects.length === 0 ? (
            <p className="text-zinc-600 text-sm py-4">Nema zakazanih kampanja.</p>
          ) : (
            <div className="space-y-3">
              {upcomingProspects.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/prospects/${p.id}`}
                      className="text-zinc-200 text-sm font-medium hover:text-indigo-400 transition-colors truncate block"
                    >
                      {p.firmaNaziv}
                    </Link>
                    <p className="text-zinc-600 text-xs mt-0.5">{p.nisa} · {p.grad}</p>
                  </div>
                  <span className="text-indigo-400 text-xs shrink-0 tabular-nums">
                    {p.scheduledInitial
                      ? new Date(p.scheduledInitial).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent replies */}
      {recentReplies.length > 0 && (
        <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation">
          <div className="flex items-center gap-2 mb-5">
            <MessageSquareReply strokeWidth={2} className="w-4 h-4 text-emerald-400" />
            <h2 className="text-zinc-200 text-sm font-medium">Nedavni replyji</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {recentReplies.map((p) => (
              <Link
                key={p.id}
                href={`/prospects/${p.id}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-[#0a0a0f] border border-[#1c1c28] hover:border-emerald-500/40 transition-all group"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-200 text-sm font-medium group-hover:text-emerald-300 transition-colors truncate">
                    {p.firmaNaziv}
                  </p>
                  <p className="text-zinc-600 text-xs mt-0.5">{p.nisa} · {p.grad}</p>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-md font-medium ml-auto shrink-0 uppercase tracking-wider ${STATUS_BOJE[p.status] ?? "bg-zinc-800 text-zinc-300"}`}
                >
                  {p.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {total === 0 && activeBriefsCount === 0 && (
        <div className="rounded-2xl border border-dashed border-[#1c1c28] p-12 text-center bg-gradient-to-br from-indigo-500/[0.02] to-transparent">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-6 h-6 text-indigo-400" />
          </div>
          <h3 className="text-white font-semibold text-base">Pokreni autopilot</h3>
          <p className="text-zinc-500 text-sm mt-1.5 max-w-sm mx-auto">
            Kreiraj briefove na /autopilot stranici i sistem počinje sam tražiti prospekte sutra u 8h.
          </p>
          <Link
            href="/autopilot"
            className="mt-5 inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            Otvori autopilot
            <ArrowUpRight strokeWidth={2} className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
