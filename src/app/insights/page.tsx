import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface NicheStats {
  nisa: string;
  prospects: number;
  emailed: number;
  opened: number;
  replied: number;
  converted: number;
  revenue: number;
}

function pct(n: number, d: number) {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

export default async function InsightsPage() {
  // Pull aggregated data per niche using groupBy + targeted counts. Done in one
  // Promise.all so the page renders fast even with many niches.
  const niches = await prisma.prospect.groupBy({
    by: ["nisa"],
    _count: true,
    orderBy: { nisa: "asc" },
  });

  const stats: NicheStats[] = await Promise.all(
    niches.map(async (n): Promise<NicheStats> => {
      const [emailedCount, openedCount, repliedCount, convertedCount, revenueAgg] =
        await Promise.all([
          // Number of prospects in this niche who got at least one email sent
          prisma.prospect.count({
            where: {
              nisa: n.nisa,
              status: { in: ["Emailed", "Follow1", "Follow2", "Follow3", "Replied", "Converted"] },
            },
          }),
          prisma.email.count({
            where: { prospect: { nisa: n.nisa }, otvoren: true },
          }),
          prisma.prospect.count({
            where: { nisa: n.nisa, status: { in: ["Replied", "Converted"] } },
          }),
          prisma.prospect.count({ where: { nisa: n.nisa, status: "Converted" } }),
          prisma.conversion.aggregate({
            where: { prospect: { nisa: n.nisa } },
            _sum: { vrijednostProjekta: true },
          }),
        ]);
      return {
        nisa: n.nisa,
        prospects: n._count,
        emailed: emailedCount,
        opened: openedCount,
        replied: repliedCount,
        converted: convertedCount,
        revenue: revenueAgg._sum.vrijednostProjekta ?? 0,
      };
    })
  );

  // Sort by reply rate descending for "what's working" view.
  stats.sort((a, b) => (b.replied / Math.max(b.emailed, 1)) - (a.replied / Math.max(a.emailed, 1)));

  const totals = stats.reduce(
    (acc, s) => ({
      prospects: acc.prospects + s.prospects,
      emailed: acc.emailed + s.emailed,
      opened: acc.opened + s.opened,
      replied: acc.replied + s.replied,
      converted: acc.converted + s.converted,
      revenue: acc.revenue + s.revenue,
    }),
    { prospects: 0, emailed: 0, opened: 0, replied: 0, converted: 0, revenue: 0 }
  );

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Insights — per niche</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Šta konvertuje. Sortirano po reply rate-u.
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Prospekata", value: totals.prospects },
          { label: "Aktiviranih", value: totals.emailed },
          { label: "Open rate", value: pct(totals.opened, totals.emailed) },
          { label: "Reply rate", value: pct(totals.replied, totals.emailed) },
          {
            label: "Revenue",
            value: totals.revenue > 0 ? `${totals.revenue.toLocaleString("fr-FR")} €` : "—",
          },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-4">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1.5">{label}</p>
            <p className="text-white text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {/* Per-niche table */}
      {stats.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#1f1f2e] p-10 text-center">
          <p className="text-zinc-500 text-sm">Nema podataka. Uploaduj prospekte i pokreni kampanje.</p>
        </div>
      ) : (
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1f1f2e]">
                {["Niša", "Prospekti", "Poslato", "Open rate", "Reply rate", "Conv. rate", "Revenue"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-zinc-500 text-xs uppercase tracking-wider font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f1f2e]">
              {stats.map((s) => {
                const openRate = s.emailed > 0 ? s.opened / s.emailed : 0;
                const replyRate = s.emailed > 0 ? s.replied / s.emailed : 0;
                const convRate = s.emailed > 0 ? s.converted / s.emailed : 0;
                return (
                  <tr key={s.nisa} className="hover:bg-[#1a1a28] transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{s.nisa}</td>
                    <td className="px-4 py-3 text-zinc-400">{s.prospects}</td>
                    <td className="px-4 py-3 text-zinc-400">{s.emailed}</td>
                    <td className={`px-4 py-3 ${openRate >= 0.3 ? "text-emerald-400" : openRate > 0 ? "text-yellow-400" : "text-zinc-600"}`}>
                      {pct(s.opened, s.emailed)}
                    </td>
                    <td className={`px-4 py-3 ${replyRate >= 0.05 ? "text-emerald-400" : replyRate > 0 ? "text-yellow-400" : "text-zinc-600"}`}>
                      {pct(s.replied, s.emailed)}
                    </td>
                    <td className={`px-4 py-3 ${convRate > 0 ? "text-green-400" : "text-zinc-600"}`}>
                      {pct(s.converted, s.emailed)}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      {s.revenue > 0 ? `${s.revenue.toLocaleString("fr-FR")} €` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
