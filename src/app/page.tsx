import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STATUS_BOJE, PIPELINE_ORDER } from "@/lib/constants";

function utcMidnight(offsetDays = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (offsetDays) d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

export default async function DashboardPage() {
  const now = new Date();
  const todayStart = utcMidnight();
  const weekStart = utcMidnight(-7);
  const fourteenDaysAgo = utcMidnight(-14);
  const nextWeek = utcMidnight(7);

  const [
    total,
    scheduled,
    replied,
    converted,
    emailsToday,
    emailsThisWeek,
    recentEmails,
    upcomingProspects,
    recentReplies,
    ...pipelineCounts
  ] = await Promise.all([
    prisma.prospect.count(),
    prisma.prospect.count({ where: { status: "Scheduled" } }),
    prisma.prospect.count({ where: { status: "Replied" } }),
    prisma.prospect.count({ where: { status: "Converted" } }),
    prisma.email.count({ where: { poslat: true, poslatAt: { gte: todayStart } } }),
    prisma.email.count({ where: { poslat: true, poslatAt: { gte: weekStart } } }),
    prisma.email.findMany({
      where: { poslat: true, poslatAt: { gte: fourteenDaysAgo } },
      select: { poslatAt: true },
    }),
    prisma.prospect.findMany({
      where: {
        status: "Scheduled",
        scheduledInitial: { gte: now, lte: nextWeek },
      },
      select: { id: true, firmaNaziv: true, scheduledInitial: true, nisa: true, grad: true },
      orderBy: { scheduledInitial: "asc" },
      take: 6,
    }),
    prisma.prospect.findMany({
      where: { status: { in: ["Replied", "Converted"] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, firmaNaziv: true, status: true, grad: true, nisa: true },
    }),
    ...PIPELINE_ORDER.map((s) => prisma.prospect.count({ where: { status: s } })),
  ]);

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
    { label: "Ukupno prospekata", value: total, color: "text-white" },
    { label: "Zakazano", value: scheduled, color: "text-sky-400" },
    { label: "Aktivne kampanje", value: activeCampaigns, color: "text-blue-400" },
    { label: "Odgovorili", value: replied, color: "text-emerald-400" },
    { label: "Konvertovani", value: converted, color: "text-green-400" },
    { label: "Emailovi ove sedmice", value: emailsThisWeek, color: "text-violet-400" },
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

      {/* 6 Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {statCards.map(({ label, value, color }) => (
          <div key={label} className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">{label}</p>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
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

