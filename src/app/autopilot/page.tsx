import { prisma } from "@/lib/prisma";
import { BriefsEditor } from "@/components/BriefsEditor";
import { QuickSetupButton } from "@/components/QuickSetupButton";
import { BulkBriefAdd } from "@/components/BulkBriefAdd";
import { RunAutopilotNowButton } from "@/components/RunAutopilotNowButton";
import { isDiscoveryConfigured } from "@/lib/discovery";
import {
  nextAutopilotRun,
  nextSendRun,
  formatParisDateTime,
  relativeFromNow,
} from "@/lib/autopilotStatus";
import { CheckCircle2, AlertTriangle, Clock, Send, Sparkles, Flame, Database } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AutopilotPage() {
  const discoveryConfigured = await isDiscoveryConfigured();
  const now = new Date();
  const nextAutopilot = nextAutopilotRun(now);
  const nextSend = nextSendRun(now);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
  const dayAfter = new Date(tomorrowStart);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

  const [
    activeBriefs,
    inactiveBriefs,
    sendingTodayInitial,
    sendingTodayFollowups,
    sendingTomorrow,
    recentRuns,
    totalAutoProspects,
    calendlyClicks,
  ] = await Promise.all([
    prisma.searchBrief.count({ where: { active: true } }),
    prisma.searchBrief.count({ where: { active: false } }),
    prisma.prospect.count({
      where: { status: "Scheduled", scheduledInitial: { gte: todayStart, lt: tomorrowStart } },
    }),
    prisma.email.count({
      where: {
        poslat: false,
        prospect: {
          OR: [
            { scheduledFollow1: { gte: todayStart, lt: tomorrowStart, not: null } },
            { scheduledFollow2: { gte: todayStart, lt: tomorrowStart, not: null } },
            { scheduledFollow3: { gte: todayStart, lt: tomorrowStart, not: null } },
          ],
        },
      },
    }),
    prisma.prospect.count({
      where: { status: "Scheduled", scheduledInitial: { gte: tomorrowStart, lt: dayAfter } },
    }),
    prisma.discoveryRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { brief: { select: { name: true } } },
    }),
    prisma.prospect.count({ where: { source: { in: ["google_places", "sirene_api"] } } }),
    prisma.email.count({ where: { calendlyClicked: true } }),
  ]);

  const autopilotLive = activeBriefs > 0 && discoveryConfigured;

  return (
    <div className="max-w-6xl space-y-8">
      {/* Hero */}
      <div>
        <p className="text-zinc-500 text-xs uppercase tracking-[0.18em] font-medium mb-2">Autopilot</p>
        <h1 className="text-3xl font-semibold text-white tracking-tight">
          The system that finds your clients
        </h1>
        <p className="text-zinc-500 text-sm mt-2 max-w-xl">
          Targets B2B professional services (via Google Places) and French tech startups (via the Sirene gov registry — free). Discovers, enriches, scores, drafts, sends. You only open your inbox when a warm lead lands.
        </p>
      </div>

      {/* Live status banner */}
      <div
        className={`rounded-2xl border p-6 card-elevation ${
          autopilotLive
            ? "bg-gradient-to-br from-emerald-500/[0.06] via-[#0d0d12] to-[#0a0a12] border-emerald-500/20"
            : "bg-gradient-to-br from-amber-500/[0.06] via-[#0d0d12] to-[#0a0a12] border-amber-500/20"
        }`}
      >
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                autopilotLive ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
              }`}
            >
              {autopilotLive ? <CheckCircle2 strokeWidth={2} className="w-6 h-6" /> : <AlertTriangle strokeWidth={2} className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    autopilotLive ? "bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50" : "bg-amber-400"
                  }`}
                />
                <p className={`text-xs uppercase tracking-widest font-semibold ${autopilotLive ? "text-emerald-300" : "text-amber-300"}`}>
                  {autopilotLive ? "Live" : "Paused"}
                </p>
              </div>
              <p className="text-white text-base font-medium mt-1">
                {autopilotLive
                  ? `${activeBriefs} ${activeBriefs === 1 ? "brief" : "briefs"} running automatically`
                  : !discoveryConfigured
                    ? "GOOGLE_PLACES_API_KEY not set"
                    : "No active briefs"}
              </p>
              <p className="text-zinc-500 text-xs mt-1">
                {autopilotLive
                  ? "Discovery fires 4× per business day (Paris). Sends drain daily at 10:00 Paris."
                  : !discoveryConfigured
                    ? "Add the key to Vercel Env to enable discovery"
                    : "Click Quick Setup or Bulk Add below"}
              </p>
              {inactiveBriefs > 0 && (
                <p className="text-zinc-600 text-[11px] mt-1">{inactiveBriefs} paused</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 shrink-0">
            <div>
              <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-medium">Next run</p>
              <p className="text-zinc-200 text-sm font-medium mt-1 tabular-nums">{relativeFromNow(nextAutopilot, now)}</p>
              <p className="text-zinc-600 text-[11px] mt-0.5 tabular-nums">{formatParisDateTime(nextAutopilot)}</p>
            </div>
            <div>
              <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-medium">Next send</p>
              <p className="text-zinc-200 text-sm font-medium mt-1 tabular-nums">{relativeFromNow(nextSend, now)}</p>
              <p className="text-zinc-600 text-[11px] mt-0.5 tabular-nums">{formatParisDateTime(nextSend)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Snapshot stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Send} label="Sending today" value={sendingTodayInitial + sendingTodayFollowups} sub={`${sendingTodayInitial} new + ${sendingTodayFollowups} follow-ups`} tone="emerald" />
        <StatCard icon={Clock} label="Queued tomorrow" value={sendingTomorrow} sub="new campaigns" tone="sky" />
        <StatCard icon={Database} label="Auto-discovered" value={totalAutoProspects} sub="Places + Sirene" tone="neutral" />
        <StatCard icon={Flame} label="Calendly clicks" value={calendlyClicks} sub="warm leads" tone="amber" />
      </div>

      {/* Manual trigger — short-circuit the cron */}
      {discoveryConfigured && activeBriefs > 0 && <RunAutopilotNowButton />}

      {/* Quick setup */}
      {discoveryConfigured && <QuickSetupButton hasAnyBrief={activeBriefs + inactiveBriefs > 0} />}

      {/* Bulk add */}
      {discoveryConfigured && <BulkBriefAdd />}

      {/* Briefs editor */}
      <BriefsEditor discoveryConfigured={discoveryConfigured} />

      {/* Recent runs */}
      {recentRuns.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-zinc-200 font-medium text-sm flex items-center gap-2">
              <Sparkles strokeWidth={2} className="w-4 h-4 text-emerald-400" />
              Recent runs
            </h2>
            <p className="text-zinc-600 text-xs">Showing {recentRuns.length}</p>
          </div>
          <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] overflow-hidden card-elevation">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1c1c28] bg-[#0a0a12]">
                  {["Brief", "Status", "Found", "Created", "Qualified", "Scheduled", "When"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-zinc-600 text-[10px] uppercase tracking-widest font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#14141c]">
                {recentRuns.map((r) => (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-zinc-200 font-medium">{r.brief.name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-medium uppercase tracking-wider ${
                          r.status === "done"
                            ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                            : r.status === "running"
                              ? "bg-sky-500/10 text-sky-300 border border-sky-500/20"
                              : "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 tabular-nums">{r.found}</td>
                    <td className="px-4 py-3 text-zinc-400 tabular-nums">{r.created}</td>
                    <td className="px-4 py-3 text-emerald-400 tabular-nums font-medium">{r.qualified}</td>
                    <td className="px-4 py-3 text-emerald-400 tabular-nums font-medium">{r.scheduled}</td>
                    <td className="px-4 py-3 text-zinc-600 text-xs tabular-nums">
                      {new Date(r.startedAt).toLocaleString("en-US", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Setup checklist */}
      <div className="rounded-xl bg-[#0a0a12] border border-[#1c1c28] p-6">
        <h2 className="text-zinc-300 font-medium text-sm mb-4">Setup checklist</h2>
        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-2.5">
            <span className={`mt-0.5 ${discoveryConfigured ? "text-emerald-400" : "text-amber-400"}`}>
              {discoveryConfigured ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-zinc-300"><strong className="text-zinc-100">GOOGLE_PLACES_API_KEY</strong> in Vercel</p>
              <p className="text-zinc-600 text-xs mt-0.5">{discoveryConfigured ? "Configured — discovery is live" : "Missing — add it to Vercel Env"}</p>
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="mt-0.5 text-zinc-600"><Clock className="w-4 h-4" /></span>
            <div className="flex-1 min-w-0">
              <p className="text-zinc-300"><strong className="text-zinc-100">Calendly webhook</strong> (optional)</p>
              <p className="text-zinc-600 text-xs mt-0.5">Without it, you only see email replies. With it — instant booking notifications.</p>
              <p className="text-zinc-700 text-[11px] font-mono mt-1">{process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain"}/api/webhooks/calendly</p>
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="mt-0.5 text-zinc-600"><Sparkles className="w-4 h-4" /></span>
            <div className="flex-1">
              <p className="text-zinc-300"><strong className="text-zinc-100">Cron schedule</strong> (already live)</p>
              <p className="text-zinc-600 text-xs mt-0.5">Mon–Fri 8/11/14/17h discovery · Daily 10h send · Daily 8:30h Calendly nudge · Daily 11h inbound nurture · Every 5min reply detection · Daily 8h summary · Mon 9h reengage · Wed 9h upsell (Paris time)</p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: number;
  sub: string;
  tone: "sky" | "neutral" | "amber" | "emerald";
}) {
  const toneClass = {
    sky: "text-sky-400",
    amber: "text-amber-400",
    emerald: "text-emerald-400",
    neutral: "text-zinc-200",
  }[tone];
  const iconBg = {
    sky: "bg-sky-500/10 text-sky-400",
    amber: "bg-amber-500/10 text-amber-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    neutral: "bg-zinc-800/40 text-zinc-400",
  }[tone];
  return (
    <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-5 card-elevation">
      <div className="flex items-center justify-between mb-3">
        <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium">{label}</p>
        <div className={`w-7 h-7 rounded-md flex items-center justify-center ${iconBg}`}>
          <Icon strokeWidth={2} className="w-3.5 h-3.5" />
        </div>
      </div>
      <p className={`text-2xl font-semibold tabular-nums tracking-tight ${toneClass}`}>{value}</p>
      <p className="text-zinc-600 text-xs mt-1">{sub}</p>
    </div>
  );
}
