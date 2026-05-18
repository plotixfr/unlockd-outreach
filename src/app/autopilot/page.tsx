import { prisma } from "@/lib/prisma";
import { BriefsEditor } from "@/components/BriefsEditor";
import { isDiscoveryConfigured } from "@/lib/discovery";

export const dynamic = "force-dynamic";

export default async function AutopilotPage() {
  const discoveryConfigured = await isDiscoveryConfigured();

  // Recent discovery runs across all briefs.
  const recentRuns = await prisma.discoveryRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 10,
    include: { brief: { select: { name: true } } },
  });

  // Aggregate stats so the user sees impact at a glance.
  const [totalAutoProspects, totalAutoScheduled, calendlyClicks] = await Promise.all([
    prisma.prospect.count({ where: { source: "google_places" } }),
    prisma.prospect.count({ where: { autoScheduled: true } }),
    prisma.email.count({ where: { calendlyClicked: true } }),
  ]);

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Autopilot</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Aplikacija sama otkriva prospekte, enrich-uje sajt, ocjenjuje fit, generiše mailove i zakazuje kampanju. Ti samo otvaraš inbox kad neko book-uje sastanak.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Auto-otkriveni</p>
          <p className="text-3xl font-bold text-white">{totalAutoProspects}</p>
          <p className="text-zinc-600 text-xs mt-1">prospekata iz Google Places</p>
        </div>
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Auto-zakazani</p>
          <p className="text-3xl font-bold text-emerald-400">{totalAutoScheduled}</p>
          <p className="text-zinc-600 text-xs mt-1">kampanja bez tvog inputa</p>
        </div>
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Calendly klikovi</p>
          <p className="text-3xl font-bold text-amber-400">{calendlyClicks}</p>
          <p className="text-zinc-600 text-xs mt-1">topli leadovi koje treba pratiti</p>
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

      {/* Setup instructions */}
      <div className="rounded-xl bg-[#0d0d14] border border-[#1f1f2e] p-6 space-y-3">
        <h2 className="text-white font-medium text-sm">Setup checklist</h2>
        <div className="text-zinc-400 text-sm space-y-2">
          <p>1. <strong className="text-zinc-200">GOOGLE_PLACES_API_KEY</strong> u Vercel Env — bez ovog ne radi discovery. Free quota: ~5k Text Searches/mjesec.</p>
          <p>2. <strong className="text-zinc-200">Calendly webhook</strong> → Account Settings → Integrations → Webhooks. URL: <code className="bg-[#1a1a28] px-1.5 py-0.5 rounded text-blue-300">{process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain"}/api/webhooks/calendly</code>. Event: <code className="bg-[#1a1a28] px-1.5 py-0.5 rounded">invitee.created</code>. Postavi <code className="bg-[#1a1a28] px-1.5 py-0.5 rounded">CALENDLY_WEBHOOK_SIGNING_KEY</code> u Vercel.</p>
          <p>3. <strong className="text-zinc-200">Daily cron</strong> radi automatski u 06:00 UTC (08:00 Paris) — pokreće sve aktivne briefove i šalje ti summary mailom.</p>
          <p>4. <strong className="text-zinc-200">DAILY_SEND_CAP</strong> ograničava broj mailova/dan (default 30). Budi konzervativan na novom domenu — diži postepeno.</p>
        </div>
      </div>
    </div>
  );
}
