import { prisma } from "@/lib/prisma";
import { DollarSign, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "neutral" | "amber" }) {
  const toneClass = tone === "emerald" ? "text-emerald-300" : tone === "amber" ? "text-amber-300" : "text-white";
  return (
    <div className="card card-interactive p-5">
      <p className="section-label">{label}</p>
      <p className={`display-number text-3xl mt-3 ${toneClass}`}>{value}</p>
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
    <div className="max-w-[1400px] space-y-3">
      <div className="pb-2">
        <div className="flex items-center gap-3 mb-3">
          <span className="pill pill-accent">
            <DollarSign className="w-3 h-3" />
            Revenue
          </span>
        </div>
        <h1 className="text-white text-4xl sm:text-5xl tracking-tight">Money in the door</h1>
        <p className="text-[var(--text-muted)] text-sm mt-3 max-w-2xl">Conversions and project revenue.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total" value={fmtCurrency(totalEur)} tone="emerald" />
        <StatCard label="Clients" value={String(clientCount)} />
        <StatCard label="Average" value={fmtCurrency(avgEur)} />
        <StatCard label="Best month" value={bestMonth.total > 0 ? fmtCurrency(bestMonth.total) : "—"} tone="amber" />
      </div>

      {/* Monthly bar chart */}
      <div className="card p-6">
        <p className="section-label mb-1"><TrendingUp className="w-3 h-3" /> Revenue by month</p>
        <p className="text-[var(--text-dim)] text-xs mb-6">Last 12 months</p>
        <div className="flex items-end gap-2 h-40">
          {months.map((m) => (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <div className="w-full flex flex-col justify-end" style={{ height: "120px" }}>
                {m.total > 0 ? (
                  <div
                    className="w-full bg-gradient-to-t from-emerald-700/40 to-emerald-400/80 rounded-sm"
                    style={{ height: `${Math.max((m.total / maxMonthly) * 100, 4)}%` }}
                    title={fmtCurrency(m.total)}
                  />
                ) : (
                  <div className="w-full h-px bg-[var(--border-1)]" />
                )}
              </div>
              <span className="text-[9px] text-[var(--text-faint)] truncate w-full text-center font-semibold uppercase tracking-wider">
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Conversions table */}
      {conversions.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-[var(--text-muted)] text-sm">No conversions yet. Add one from any prospect&apos;s detail page when a deal closes.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 etch-top border-b border-[var(--border-2)] bg-[var(--bg-elev-1)]">
            <p className="section-label">All conversions</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-2)] bg-[var(--bg-elev-1)]">
                <th className="px-5 py-3 text-left text-[var(--text-dim)] text-[10px] uppercase tracking-widest font-bold">Client</th>
                <th className="px-5 py-3 text-left text-[var(--text-dim)] text-[10px] uppercase tracking-widest font-bold">Date</th>
                <th className="px-5 py-3 text-right text-[var(--text-dim)] text-[10px] uppercase tracking-widest font-bold">Value</th>
                <th className="px-5 py-3 text-left text-[var(--text-dim)] text-[10px] uppercase tracking-widest font-bold">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-1)]">
              {conversions.map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-white font-semibold">{c.prospect.firmaNaziv}</p>
                    <p className="text-[var(--text-dim)] text-xs">{c.prospect.email}</p>
                  </td>
                  <td className="px-5 py-3 text-[var(--text-muted)] tabular">
                    {new Date(c.datumKonverzije).toLocaleDateString("en-US")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-emerald-300 font-bold tabular display-number text-base">
                      {fmtCurrency(c.vrijednostProjekta)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[var(--text-dim)] text-xs max-w-xs truncate">
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
