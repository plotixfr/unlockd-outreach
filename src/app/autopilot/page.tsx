import { prisma } from "@/lib/prisma";
import { BriefsEditor } from "@/components/BriefsEditor";
import { QuickSetupButton } from "@/components/QuickSetupButton";
import { BulkBriefAdd } from "@/components/BulkBriefAdd";
import { isDiscoveryConfigured } from "@/lib/discovery";
import {
  nextAutopilotRun,
  nextSendRun,
  formatParisDateTime,
  relativeFromNow,
} from "@/lib/autopilotStatus";

export const dynamic = "force-dynamic";

export default async function AutopilotPage() {
  const discoveryConfigured = await isDiscoveryConfigured();
  const now = new Date();
  const nextAutopilot = nextAutopilotRun(now);
  const nextSend = nextSendRun(now);

  // Today's send queue + tomorrow's preview
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
    totalAutoScheduled,
    calendlyClicks,
  ] = await Promise.all([
    prisma.searchBrief.count({ where: { active: true } }),
    prisma.searchBrief.count({ where: { active: false } }),
    prisma.prospect.count({
      where: {
        status: "Scheduled",
        scheduledInitial: { gte: todayStart, lt: tomorrowStart },
      },
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
      where: {
        status: "Scheduled",
        scheduledInitial: { gte: tomorrowStart, lt: dayAfter },
      },
    }),
    prisma.discoveryRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { brief: { select: { name: true } } },
    }),
    prisma.prospect.count({ where: { source: "google_places" } }),
    prisma.prospect.count({ where: { autoScheduled: true } }),
    prisma.email.count({ where: { calendlyClicked: true } }),
  ]);

  const autopilotLive = activeBriefs > 0 && discoveryConfigured;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Autopilot</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Otkriva prospekte, enrich-uje, ocjenjuje, generiše, šalje — bez tvog inputa. Ti samo gledaš inbox.
        </p>
      </div>

      {/* Big status banner: is autopilot actually running? */}
      <div
        className={`rounded-xl border p-5 ${
          autopilotLive
            ? "bg-gradient-to-br from-emerald-950/40 to-emerald-900/20 border-emerald-700/40"
            : "bg-gradient-to-br from-amber-950/40 to-amber-900/20 border-amber-700/40"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full ${
                  autopilotLive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                }`}
              />
              <span
                className={`font-semibold text-sm ${
                  autopilotLive ? "text-emerald-300" : "text-amber-300"
                }`}
              >
                {autopilotLive ? "AUTOPILOT JE AKTIVAN" : "AUTOPILOT NIJE U FUNKCIJI"}
              </span>
            </div>
            <p className={`text-sm ${autopilotLive ? "text-emerald-200" : "text-amber-200"}`}>
              {autopilotLive
                ? `${activeBriefs} aktivn${activeBriefs === 1 ? "i brief" : "ih briefova"} radi automatski svaki radni dan. Ne moraš ništa raditi.`
                : !discoveryConfigured
                  ? "GOOGLE_PLACES_API_KEY nije postavljen u Vercel-u. Bez njega discovery ne radi."
                  : activeBriefs === 0
                    ? "Nema aktivnih briefova. Klikni Quick Setup ili dodaj ručno."
                    : "Provjeri konfiguraciju."}
            </p>
            {inactiveBriefs > 0 && (
              <p className="text-zinc-500 text-xs mt-1">{inactiveBriefs} pauziran{inactiveBriefs === 1 ? "" : "ih"}</p>
            )}
          </div>
          <div className="text-right shrink-0 space-y-2">
            <div>
              <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Idući autopilot run</p>
              <p className={`text-sm font-medium ${autopilotLive ? "text-emerald-200" : "text-amber-200"}`}>
                {formatParisDateTime(nextAutopilot)}
              </p>
              <p className="text-zinc-500 text-[11px]">{relativeFromNow(nextAutopilot, now)}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Idući send batch</p>
              <p className="text-zinc-300 text-sm">
                {formatParisDateTime(nextSend)} · {relativeFromNow(nextSend, now)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Setup — shows whenever discovery is configured (idempotent on re-click) */}
      {discoveryConfigured && <QuickSetupButton hasAnyBrief={activeBriefs + inactiveBriefs > 0} />}

      {/* Bulk Add — any niche, any city */}
      {discoveryConfigured && <BulkBriefAdd />}

      {/* Today + tomorrow snapshot */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-4">
          <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">Šalju se danas</p>
          <p className="text-2xl font-bold text-blue-400">{sendingTodayInitial + sendingTodayFollowups}</p>
          <p className="text-zinc-600 text-[11px]">{sendingTodayInitial} initial + {sendingTodayFollowups} follow-up</p>
        </div>
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-4">
          <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">Sutra zakazano</p>
          <p className="text-2xl font-bold text-sky-400">{sendingTomorrow}</p>
          <p className="text-zinc-600 text-[11px]">novih kampanja</p>
        </div>
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-4">
          <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">Auto-otkriveno</p>
          <p className="text-2xl font-bold text-white">{totalAutoProspects}</p>
          <p className="text-zinc-600 text-[11px]">prospekata iz Places</p>
        </div>
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-4">
          <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">Calendly klikovi</p>
          <p className="text-2xl font-bold text-amber-400">{calendlyClicks}</p>
          <p className="text-zinc-600 text-[11px]">topli leadovi</p>
        </div>
      </div>

      {/* Briefs CRUD + run buttons */}
      <BriefsEditor discoveryConfigured={discoveryConfigured} />

      {/* Recent runs across all briefs */}
      {recentRuns.length > 0 && (
        <div>
          <h2 className="text-white font-medium mb-3">Posljednji runs</h2>
          <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1f1f2e]">
                  {["Brief", "Status", "Found", "Created", "Qualified", "Scheduled", "Kada"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-zinc-500 text-xs uppercase tracking-wider font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f1f2e]">
                {recentRuns.map((r) => (
                  <tr key={r.id} className="hover:bg-[#1a1a28] transition-colors">
                    <td className="px-4 py-2.5 text-zinc-200 font-medium">{r.brief.name}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full ${
                          r.status === "done"
                            ? "bg-emerald-950/60 text-emerald-300"
                            : r.status === "running"
                              ? "bg-blue-950/60 text-blue-300"
                              : "bg-red-950/60 text-red-300"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">{r.found}</td>
                    <td className="px-4 py-2.5 text-zinc-400">{r.created}</td>
                    <td className="px-4 py-2.5 text-emerald-400">{r.qualified}</td>
                    <td className="px-4 py-2.5 text-blue-400">{r.scheduled}</td>
                    <td className="px-4 py-2.5 text-zinc-600 text-xs">
                      {new Date(r.startedAt).toLocaleString("fr-FR", {
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

      {/* Setup checklist (collapsed at the bottom now that things are live) */}
      <div className="rounded-xl bg-[#0d0d14] border border-[#1f1f2e] p-6 space-y-3">
        <h2 className="text-white font-medium text-sm">Setup checklist</h2>
        <div className="text-zinc-400 text-sm space-y-2">
          <p>1. <strong className="text-zinc-200">GOOGLE_PLACES_API_KEY</strong> u Vercel — {discoveryConfigured ? <span className="text-emerald-400">✓ konfigurisan</span> : <span className="text-amber-400">⚠ nedostaje</span>}</p>
          <p>2. <strong className="text-zinc-200">Calendly webhook</strong> → Account Settings → Integrations → Webhooks. URL: <code className="bg-[#1a1a28] px-1.5 py-0.5 rounded text-blue-300">{process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain"}/api/webhooks/calendly</code>. Event: <code className="bg-[#1a1a28] px-1.5 py-0.5 rounded">invitee.created</code>. Postavi <code className="bg-[#1a1a28] px-1.5 py-0.5 rounded">CALENDLY_WEBHOOK_SIGNING_KEY</code>.</p>
          <p>3. <strong className="text-zinc-200">Cron schedule</strong>: pon-pet 06:00 UTC autopilot · svaki dan 08:00 UTC send · svaki dan 17:00 UTC summary (Paris vrijeme +1/+2h).</p>
        </div>
      </div>
    </div>
  );
}
