import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  nextAutopilotRun,
  nextSendRun,
  formatParisDateTime,
  relativeFromNow,
} from "@/lib/autopilotStatus";
import { getTodayQueue, getForecast, getMomentum, type TodayTask } from "@/lib/todayQueue";
import {
  ArrowRight,
  ArrowUpRight,
  Activity,
  TrendingUp,
  TrendingDown,
  Flame,
  CheckCircle2,
} from "lucide-react";

export const dynamic = "force-dynamic";

function utcMidnight(offsetDays = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (offsetDays) d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

function fmtEur(n: number): string {
  if (n === 0) return "0 €";
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

export default async function DashboardPage() {
  const now = new Date();
  const nextAutopilot = nextAutopilotRun(now);
  const nextSend = nextSendRun(now);
  const todayStart = utcMidnight();
  const fourteenDaysAgo = utcMidnight(-14);

  const [tasks, forecast, momentum, activeBriefs, emailsToday, recentSendDays, totalProspects] =
    await Promise.all([
      getTodayQueue(),
      getForecast(),
      getMomentum(),
      prisma.searchBrief.count({ where: { active: true } }),
      prisma.email.count({ where: { poslat: true, poslatAt: { gte: todayStart } } }),
      prisma.email.findMany({
        where: { poslat: true, poslatAt: { gte: fourteenDaysAgo } },
        select: { poslatAt: true },
      }),
      prisma.prospect.count(),
    ]);

  // 14-day spark
  const dayMap: Record<string, number> = {};
  for (const e of recentSendDays) {
    if (!e.poslatAt) continue;
    const key = e.poslatAt.toISOString().slice(0, 10);
    dayMap[key] = (dayMap[key] ?? 0) + 1;
  }
  const chartDays = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return { key: d.toISOString().slice(0, 10), count: dayMap[d.toISOString().slice(0, 10)] ?? 0 };
  });
  const maxDay = Math.max(...chartDays.map((d) => d.count), 1);
  const totalEstimate = tasks.reduce((acc, t) => acc + t.estimateMin, 0);

  return (
    <div className="max-w-6xl space-y-10">
      {/* ─── Hero — what's happening right now ─── */}
      <div className="flex flex-col gap-2">
        <p className="text-zinc-500 text-[11px] uppercase tracking-[0.22em] font-medium">
          {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
        </p>
        <h1
          className="text-white text-4xl sm:text-5xl tracking-tight leading-[1.05]"
          style={{ fontFamily: "var(--font-display-serif)" }}
        >
          {tasks.length === 0
            ? totalProspects === 0
              ? "Sve počinje sutra ujutro."
              : "Inbox je čist. Pipeline radi za tebe."
            : `${tasks.length} zadat${tasks.length === 1 ? "ak" : tasks.length < 5 ? "ka" : "aka"} čeka.`}
        </h1>
        <p className="text-zinc-500 text-sm">
          {tasks.length > 0
            ? `~${totalEstimate} minuta fokusiranog rada. Autopilot opet skenira ${relativeFromNow(nextAutopilot, now)}.`
            : `Autopilot opet skenira ${relativeFromNow(nextAutopilot, now)} · sljedeći send batch ${relativeFromNow(nextSend, now)}.`}
        </p>
      </div>

      {/* ─── Revenue forecast strip ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Pipeline otvoren"
          value={fmtEur(forecast.pipelineValueOpen)}
          sub="Suma open deal-ova"
          tone="neutral"
        />
        <MetricCard
          label="Forecast 30 dana"
          value={fmtEur(forecast.expectedNext30)}
          sub="Probability-weighted"
          tone="indigo"
        />
        <MetricCard
          label="Zatvoreno ovaj mjesec"
          value={fmtEur(forecast.closedThisMonth)}
          sub={forecast.closedLastMonth > 0
            ? `${forecast.trend30 >= 0 ? "+" : ""}${Math.round(forecast.trend30)}% vs prošli`
            : "Prvi mjesec sa konverzijama"}
          trendValue={forecast.closedLastMonth > 0 ? forecast.trend30 : null}
          tone="emerald"
        />
        <MetricCard
          label="Sastanci ovaj mjesec"
          value={momentum.meetingsThisMonth.toString()}
          sub={`Pipeline u nastajanju`}
          tone="amber"
        />
      </div>

      {/* ─── Today queue — the heart of the dashboard ─── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 strokeWidth={2} className="w-4 h-4 text-emerald-400" />
            <h2 className="text-zinc-200 font-medium text-sm">Šta uraditi sada</h2>
          </div>
          {tasks.length > 0 && (
            <span className="text-zinc-500 text-xs">{totalEstimate} min ukupno</span>
          )}
        </div>
        {tasks.length === 0 ? (
          <EmptyToday activeBriefs={activeBriefs} totalProspects={totalProspects} />
        ) : (
          <div className="rounded-2xl bg-gradient-to-br from-[#0e0e16] to-[#0a0a12] border border-[#1c1c28] divide-y divide-[#14141c] card-elevation overflow-hidden">
            {tasks.map((t) => <TaskRow key={`${t.kind}-${t.prospectId}`} task={t} />)}
          </div>
        )}
      </section>

      {/* ─── Momentum strip ─── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <MomentumTile
          label="Streak"
          value={`${momentum.daysWithRepliesStreak}d`}
          sub={momentum.daysWithRepliesStreak >= 3
            ? `${momentum.daysWithRepliesStreak} dana zaredom sa replyjima 🔥`
            : "Dani zaredom sa replyjima"}
          tone={momentum.daysWithRepliesStreak >= 3 ? "good" : "muted"}
        />
        <MomentumTile
          label="Emailovi ove sedmice"
          value={momentum.emailsThisWeek.toString()}
          sub={`${momentum.emailsLastWeek} prošla · ${momentum.emailsTrend >= 0 ? "+" : ""}${Math.round(momentum.emailsTrend)}%`}
          tone={momentum.emailsTrend >= 0 ? "good" : "warning"}
          trendValue={momentum.emailsTrend}
        />
        <MomentumTile
          label="Replyji ove sedmice"
          value={momentum.repliesThisWeek.toString()}
          sub={`${momentum.repliesLastWeek} prošla · ${momentum.repliesTrend >= 0 ? "+" : ""}${Math.round(momentum.repliesTrend)}%`}
          tone={momentum.repliesTrend >= 0 ? "good" : "warning"}
          trendValue={momentum.repliesTrend}
        />
      </section>

      {/* ─── 14-day activity spark ─── */}
      <section className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Activity strokeWidth={2} className="w-4 h-4 text-zinc-500" />
            <h2 className="text-zinc-200 text-sm font-medium">14 dana</h2>
          </div>
          <p className="text-zinc-600 text-xs tabular-nums">{recentSendDays.length} mailova</p>
        </div>
        {recentSendDays.length === 0 ? (
          <p className="text-zinc-600 text-sm py-6 text-center">Send cron još nije isporučio prvi batch.</p>
        ) : (
          <div className="flex items-end gap-1.5 h-24">
            {chartDays.map((day) => (
              <div key={day.key} className="flex-1 flex items-end justify-center">
                <div
                  title={`${day.key}: ${day.count}`}
                  className="w-full rounded-md bg-gradient-to-t from-indigo-600/30 to-indigo-400/60"
                  style={{ height: `${Math.max((day.count / maxDay) * 96, day.count > 0 ? 4 : 2)}px` }}
                />
              </div>
            ))}
          </div>
        )}
        <p className="text-zinc-700 text-[10px] mt-3 tracking-widest uppercase tabular-nums">
          {chartDays[0].key.slice(5)} → {chartDays[chartDays.length - 1].key.slice(5)} · Sljedeći send {formatParisDateTime(nextSend)}
        </p>
      </section>

      <p className="text-center text-zinc-700 text-[11px] uppercase tracking-widest pt-6">
        Unlockd · {new Date().getFullYear()}
      </p>
    </div>
  );
}

/* ─────────── Components ─────────── */

function MetricCard({
  label,
  value,
  sub,
  tone,
  trendValue,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "neutral" | "indigo" | "emerald" | "amber";
  trendValue?: number | null;
}) {
  const toneClass = {
    neutral: "text-zinc-100",
    indigo: "text-indigo-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
  }[tone];
  const showTrend = typeof trendValue === "number" && trendValue !== 0;
  return (
    <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-5 card-elevation">
      <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium">{label}</p>
      <p
        className={`text-3xl mt-2 tabular-nums tracking-tight ${toneClass}`}
        style={{ fontFamily: "var(--font-display-serif)", fontWeight: 500 }}
      >
        {value}
      </p>
      <p className="text-zinc-600 text-xs mt-1.5 flex items-center gap-1">
        {showTrend && trendValue > 0 && <TrendingUp className="w-3 h-3 text-emerald-400" />}
        {showTrend && trendValue < 0 && <TrendingDown className="w-3 h-3 text-amber-400" />}
        {sub}
      </p>
    </div>
  );
}

function MomentumTile({
  label,
  value,
  sub,
  tone,
  trendValue,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "good" | "warning" | "muted";
  trendValue?: number;
}) {
  const toneClass = {
    good: "text-emerald-300",
    warning: "text-amber-300",
    muted: "text-zinc-300",
  }[tone];
  const showTrend = typeof trendValue === "number" && trendValue !== 0;
  return (
    <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-5 card-elevation">
      <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium">{label}</p>
      <div className="flex items-baseline gap-2 mt-2">
        <p
          className={`text-2xl tabular-nums ${toneClass}`}
          style={{ fontFamily: "var(--font-display-serif)", fontWeight: 500 }}
        >
          {value}
        </p>
        {showTrend && (
          <span className={trendValue > 0 ? "text-emerald-400" : "text-amber-400"}>
            {trendValue > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          </span>
        )}
      </div>
      <p className="text-zinc-600 text-xs mt-1.5">{sub}</p>
    </div>
  );
}

function TaskRow({ task }: { task: TodayTask }) {
  const badgeTone = {
    danger: "bg-red-500/15 text-red-300 ring-red-500/25",
    warning: "bg-amber-500/15 text-amber-300 ring-amber-500/25",
    info: "bg-indigo-500/15 text-indigo-300 ring-indigo-500/25",
    success: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25",
  }[task.badgeTone ?? "info"];
  return (
    <Link
      href={task.href}
      className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors group"
    >
      <div
        className={`w-9 h-9 rounded-lg ring-1 flex items-center justify-center text-sm font-medium shrink-0 ${badgeTone}`}
      >
        {task.badge}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-zinc-200 text-sm font-medium group-hover:text-white transition-colors">
          {task.title}
        </p>
        <p className="text-zinc-500 text-xs mt-0.5 truncate">
          {task.niche} · {task.city} · {task.hint}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-zinc-600 text-xs tabular-nums">~{task.estimateMin} min</span>
        <ArrowRight className="w-4 h-4 text-zinc-700 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
      </div>
    </Link>
  );
}

function EmptyToday({ activeBriefs, totalProspects }: { activeBriefs: number; totalProspects: number }) {
  if (totalProspects === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#1c1c28] p-10 text-center bg-gradient-to-br from-indigo-500/[0.02] to-transparent">
        <Flame className="w-6 h-6 text-indigo-400 mx-auto mb-3" />
        <p className="text-zinc-300 font-medium">Autopilot još nije odradio prvi run.</p>
        <p className="text-zinc-500 text-sm mt-1 max-w-md mx-auto">
          {activeBriefs > 0
            ? `${activeBriefs} brief${activeBriefs === 1 ? "" : "ova"} čeka sljedeći radni dan u 08:00 Paris.`
            : "Postavi briefove na /autopilot da kreneš."}
        </p>
        <Link
          href="/autopilot"
          className="mt-5 inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          Otvori autopilot
          <ArrowUpRight strokeWidth={2} className="w-4 h-4" />
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-dashed border-emerald-500/15 p-10 text-center bg-gradient-to-br from-emerald-500/[0.03] to-transparent">
      <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-3" />
      <p className="text-emerald-300 font-medium">Sve je pod kontrolom.</p>
      <p className="text-zinc-500 text-sm mt-1 max-w-md mx-auto">
        Nema hot replyja, Calendly klikova ni stuck deal-ova. Pipeline kuva — vrati se kad zvecne notifikacija.
      </p>
    </div>
  );
}
