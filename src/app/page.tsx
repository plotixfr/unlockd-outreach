import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STATUS_BOJE, PIPELINE_ORDER } from "@/lib/constants";
import { nextAutopilotRun, nextSendRun, formatParisDateTime, relativeFromNow } from "@/lib/autopilotStatus";

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
      take: 8,
    }),
    prisma.prospect.findMany({
      where: { status: { in: ["Replied", "Converted"] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, firmaNaziv: true, status: true, grad: true, nisa: true },
    }),
    prisma.searchBrief.count({ where: { active: true } }),
    prisma.prospect.count({
      where: {
        status: "Scheduled",
        scheduledInitial: { gte: todayStart, lt: todayEnd },
      },
    }),
    prisma.prospect.count({
      where: {
        status: "Scheduled",
        scheduledInitial: { gte: tomorrowStart, lt: tomorrowEnd },
      },
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

  const pipeline = PIPELINE_ORDER.map((s, i) => ({
    status: s,
    count: pipelineCounts[i] ?? 0,
  }));
  const maxCount = Math.max(...pipeline.map((p) => p.count), 1);

  const statCards = [
    { label: "Ukupno prospekata", value: total, color: "text-white", sub: null },
    { label: "Zakazano", value: scheduled, color: "text-sky-400", sub: null },
    { label: "Aktivne kampanje", value: activeCampaigns, color: "text-blue-400", sub: null },
    { label: "Odgovorili", value: replied, color: "text-emerald-400", sub: null },
    {
      label: "Open rate",
      value: `${openRate}%`,
      color: openRate >= 30 ? "text-emerald-400" : openRate > 0 ? "text-yellow-400" : "text-zinc-500",
      sub: `${totalOpened} / ${totalSent} poslanih`,
    },
    {
      label: "Ukupno konverzija",
      value: totalConversionEur > 0 ? `${totalConversionEur.toLocaleString("fr-FR")} €` : `${converted}`,
      color: "text-green-400",
      sub: totalConversionEur > 0 ? `${converted} klijent${converted === 1 ? "" : "a"}` : null,
    },
  ];

  return (
    <div className="max-w-6xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {emailsToday > 0
              ? `${emailsToday} email${emailsToday === 1 ? "" : "a"} poslano danas`
              : "Pregled outreach aktivnosti"}
          </p>
        </div>
        <Link
          href="/upload"
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          + Dodaj listu
        </Link>
      </div>

      {/* "Danas" — what the autopilot will do today + what needs your attention */}
      <div className={`rounded-xl border p-5 ${
        activeBriefsCount > 0
          ? "bg-gradient-to-br from-emerald-950/30 to-blue-950/20 border-emerald-800/30"
          : "bg-gradient-to-br from-zinc-900/40 to-zinc-900/20 border-zinc-700/40"
      }`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${activeBriefsCount > 0 ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
              <span className={`text-xs uppercase tracking-wider font-semibold ${activeBriefsCount > 0 ? "text-emerald-300" : "text-zinc-500"}`}>
                Danas {activeBriefsCount > 0 ? "— Autopilot radi" : "— Autopilot nije aktivan"}
              </span>
            </div>
            <p className="text-white text-base font-medium">
              {initialsScheduledToday + emailsToday} email{(initialsScheduledToday + emailsToday) === 1 ? "" : "a"} kreće prema prospektima · {initialsScheduledTomorrow} novih sutra · sljedeći send {relativeFromNow(nextSend, now)}
            </p>
            <p className="text-zinc-400 text-xs mt-1.5">
              Autopilot opet skenira market <span className="text-zinc-300">{relativeFromNow(nextAutopilot, now)}</span> ({formatParisDateTime(nextAutopilot)})
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {repliesNeedingResponse > 0 && (
              <Link
                href="/prospects?status=Replied"
                className="px-3 py-2 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs font-medium hover:bg-emerald-900/60 transition-colors"
              >
                💬 {repliesNeedingResponse} draft{repliesNeedingResponse === 1 ? "" : "a"} čeka
              </Link>
            )}
            {pendingDrafts > 0 && (
              <Link
                href="/prospects"
                className="px-3 py-2 rounded-lg bg-amber-950/60 border border-amber-800/60 text-amber-300 text-xs font-medium hover:bg-amber-900/60 transition-colors"
              >
                🔥 {pendingDrafts} otvorio Calendly
              </Link>
            )}
            <Link
              href="/autopilot"
              className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 transition-colors"
            >
              Autopilot →
            </Link>
          </div>
        </div>
      </div>

      {/* 6 Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {statCards.map(({ label, value, color, sub }) => (
          <div key={label} className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-zinc-600 text-xs mt-1">{sub}</p>}
          </div>
        ))}
      </div>

      {/* 14-day activity bar chart */}
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6">
        <h2 className="text-white font-medium mb-5">Aktivnost — zadnjih 14 dana</h2>
        {recentEmails.length === 0 ? (
          <p className="text-zinc-600 text-sm">Još nema poslanih emailova.</p>
        ) : (
          <div className="flex items-end gap-1.5 h-24">
            {chartDays.map((day) => (
              <div key={day.key} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="relative w-full flex items-end justify-center" style={{ height: "72px" }}>
                  <div
                    title={`${day.label}: ${day.count} emailova`}
                    className="w-full rounded-t bg-blue-600/60 group-hover:bg-blue-500/80 transition-colors"
                    style={{ height: `${Math.max((day.count / maxDay) * 72, day.count > 0 ? 4 : 0)}px` }}
                  />
                </div>
                <span className="text-zinc-700 text-[10px] select-none">{day.short}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pipeline */}
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6">
          <h2 className="text-white font-medium mb-4">Pipeline</h2>
          {total === 0 ? (
            <p className="text-zinc-600 text-sm">Nema prospekata u bazi.</p>
          ) : (
            <div className="space-y-2.5">
              {pipeline.map(({ status, count }) => (
                <div key={status} className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium w-28 text-center shrink-0 ${STATUS_BOJE[status]}`}
                  >
                    {status}
                  </span>
                  <div className="flex-1 bg-[#1a1a28] rounded-full h-1.5">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-zinc-400 text-sm w-6 text-right shrink-0">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming campaigns */}
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-medium">Predstojeće kampanje</h2>
            <span className="text-zinc-600 text-xs">Sledećih 7 dana</span>
          </div>
          {upcomingProspects.length === 0 ? (
            <p className="text-zinc-600 text-sm">Nema zakazanih kampanja za sljedećih 7 dana.</p>
          ) : (
            <div className="space-y-3">
              {upcomingProspects.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/prospects/${p.id}`}
                      className="text-zinc-200 text-sm font-medium hover:text-blue-400 transition-colors truncate block"
                    >
                      {p.firmaNaziv}
                    </Link>
                    <p className="text-zinc-600 text-xs mt-0.5">{p.nisa} · {p.grad}</p>
                  </div>
                  <span className="text-sky-400 text-xs shrink-0">
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
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6">
          <h2 className="text-white font-medium mb-4">Nedavni odgovori</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentReplies.map((p) => (
              <Link
                key={p.id}
                href={`/prospects/${p.id}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-[#0a0a0f] border border-[#1f1f2e] hover:border-emerald-800/60 transition-colors group"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-zinc-200 text-sm font-medium group-hover:text-emerald-300 transition-colors truncate">
                    {p.firmaNaziv}
                  </p>
                  <p className="text-zinc-600 text-xs mt-0.5">{p.nisa} · {p.grad}</p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ml-auto shrink-0 ${STATUS_BOJE[p.status] ?? "bg-zinc-700 text-zinc-200"}`}
                >
                  {p.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {total === 0 && (
        <div className="rounded-xl border border-dashed border-[#1f1f2e] p-10 text-center">
          <p className="text-zinc-500 text-sm">
            Počni uploadovanjem CSV liste prospekata.
          </p>
          <Link
            href="/upload"
            className="mt-3 inline-block text-blue-500 text-sm hover:text-blue-400 transition-colors"
          >
            Upload CSV →
          </Link>
        </div>
      )}
    </div>
  );
}

