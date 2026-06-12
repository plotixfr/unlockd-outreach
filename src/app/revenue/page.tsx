import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/ui/EmptyState";
import { DollarSign, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "neutral" | "amber" }) {
  const toneClass = tone === "emerald" ? "text-[var(--accent)]" : tone === "amber" ? "text-amber-600" : "";
  return (
    <div className="card card-interactive p-5">
      <p className="section-label">{label}</p>
      <p className={`kpi-value mt-3 ${toneClass}`}>{value}</p>
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
    <div className="max-w-[1400px] space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] text-[var(--text)]">Revenue</h1>
          <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
            <DollarSign className="w-3 h-3" />
            Money in the door
          </span>
        </div>
        <p className="text-[var(--text-secondary)] text-sm mt-1.5">Conversions and project revenue.</p>
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
        <p className="text-[var(--text-muted)] text-xs mb-6">Last 12 months</p>
        <div className="flex items-end gap-2 h-40">
          {months.map((m) => (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <div className="w-full flex flex-col justify-end" style={{ height: "120px" }}>
                {m.total > 0 ? (
                  <div
                    className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-sm"
                    style={{ height: `${Math.max((m.total / maxMonthly) * 100, 4)}%` }}
                    title={fmtCurrency(m.total)}
                  />
                ) : (
                  <div className="w-full h-px bg-[var(--border)]" />
                )}
              </div>
              <span className="text-[9px] text-[var(--text-muted)] truncate w-full text-center font-semibold uppercase tracking-wider">
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Conversions table */}
      {conversions.length === 0 ? (
        <EmptyState
          icon={<DollarSign />}
          title="No conversions yet"
          hint="Log one from any prospect's detail page when a deal closes — totals and the monthly chart fill in automatically."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)]">
            <p className="section-label">All conversions</p>
          </div>
          <table className="table-base">
            <thead>
              <tr>
                <th>Client</th>
                <th>Date</th>
                <th className="!text-right">Value</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {conversions.map((c) => (
                <tr key={c.id}>
                  <td>
                    <p className="text-[var(--text)] font-semibold">{c.prospect.firmaNaziv}</p>
                    <p className="text-[var(--text-muted)] text-xs">{c.prospect.email}</p>
                  </td>
                  <td className="tabular">
                    {new Date(c.datumKonverzije).toLocaleDateString("en-US")}
                  </td>
                  <td className="text-right">
                    <span className="text-emerald-700 font-semibold tabular font-mono">
                      {fmtCurrency(c.vrijednostProjekta)}
                    </span>
                  </td>
                  <td className="text-[var(--text-muted)] text-xs max-w-xs truncate">
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
