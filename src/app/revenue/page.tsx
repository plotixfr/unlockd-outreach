import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-5 card-elevation">
      <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium mb-2">{label}</p>
      <p
        className="text-white text-2xl tabular-nums tracking-tight display-number"
      >
        {value}
      </p>
    </div>
  );
}

function fmtCurrency(n: number): string {
  if (n === 0) return "€0";
  return `€${Math.round(n).toLocaleString("en-US")}`;
}

export default async function RevenuePage() {
  const conversions = await prisma.conversion.findMany({
    include: { prospect: { select: { firmaNaziv: true, email: true } } },
    orderBy: { datumKonverzije: "desc" },
  });

  const totalEur = conversions.reduce((s, c) => s + c.vrijednostProjekta, 0);
  const clientCount = conversions.length;
  const avgEur = clientCount > 0 ? totalEur / clientCount : 0;

  const now = new Date();
  const months: { key: string; label: string; total: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    const total = conversions
      .filter((c) => {
        const cd = new Date(c.datumKonverzije);
        return cd.getFullYear() === d.getFullYear() && cd.getMonth() === d.getMonth();
      })
      .reduce((s, c) => s + c.vrijednostProjekta, 0);
    months.push({ key, label, total });
  }

  const bestMonth = months.reduce(
    (best, m) => (m.total > best.total ? m : best),
    { key: "", label: "—", total: 0 }
  );

  const maxMonthly = Math.max(...months.map((m) => m.total), 1);

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <p className="text-zinc-500 text-xs uppercase tracking-[0.18em] font-medium mb-2">Revenue</p>
        <h1 className="text-3xl font-semibold text-white tracking-tight">Money in the door</h1>
        <p className="text-zinc-500 text-sm mt-1">Conversions and project revenue.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={fmtCurrency(totalEur)} />
        <StatCard label="Clients" value={String(clientCount)} />
        <StatCard label="Average" value={fmtCurrency(avgEur)} />
        <StatCard label="Best month" value={bestMonth.total > 0 ? fmtCurrency(bestMonth.total) : "—"} />
      </div>

      {/* Monthly bar chart */}
      <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation">
        <p className="text-zinc-300 text-sm font-medium mb-6">Revenue by month (last 12 mo.)</p>
        <div className="flex items-end gap-2 h-40">
          {months.map((m) => (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <div className="w-full flex flex-col justify-end" style={{ height: "120px" }}>
                {m.total > 0 ? (
                  <div
                    className="w-full bg-gradient-to-t from-emerald-700/40 to-emerald-400/80 rounded-t-sm"
                    style={{ height: `${Math.max((m.total / maxMonthly) * 100, 4)}%` }}
                    title={fmtCurrency(m.total)}
                  />
                ) : (
                  <div className="w-full h-px bg-zinc-800" />
                )}
              </div>
              <span className="text-[9px] text-zinc-600 truncate w-full text-center">
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Conversions table */}
      {conversions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#1c1c28] p-10 text-center bg-gradient-to-br from-emerald-500/[0.03] to-transparent">
          <p className="text-zinc-400 text-sm">No conversions yet. Add one from any prospect&apos;s detail page when a deal closes.</p>
        </div>
      ) : (
        <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] overflow-hidden card-elevation">
          <div className="px-5 py-3 border-b border-[#1c1c28] bg-[#0a0a12]">
            <p className="text-zinc-300 text-sm font-medium">All conversions</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1c1c28] bg-[#0a0a12]">
                <th className="px-5 py-3 text-left text-zinc-500 text-[10px] uppercase tracking-widest font-medium">Client</th>
                <th className="px-5 py-3 text-left text-zinc-500 text-[10px] uppercase tracking-widest font-medium">Date</th>
                <th className="px-5 py-3 text-right text-zinc-500 text-[10px] uppercase tracking-widest font-medium">Value</th>
                <th className="px-5 py-3 text-left text-zinc-500 text-[10px] uppercase tracking-widest font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#14141c]">
              {conversions.map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-zinc-200 font-medium">{c.prospect.firmaNaziv}</p>
                    <p className="text-zinc-600 text-xs">{c.prospect.email}</p>
                  </td>
                  <td className="px-5 py-3 text-zinc-400 tabular-nums">
                    {new Date(c.datumKonverzije).toLocaleDateString("en-US")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-emerald-400 font-semibold tabular-nums">
                      {fmtCurrency(c.vrijednostProjekta)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-500 text-xs max-w-xs truncate">
                    {c.napomena ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
