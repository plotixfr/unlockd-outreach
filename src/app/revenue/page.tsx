import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5">
      <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">{label}</p>
      <p className="text-white text-2xl font-semibold">{value}</p>
    </div>
  );
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
    const label = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
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
        <h1 className="text-2xl font-semibold text-white">Revenue</h1>
        <p className="text-zinc-500 text-sm mt-1">Konverzije i prihodi od projekata</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Ukupno"
          value={`${totalEur.toLocaleString("fr-FR")} €`}
        />
        <StatCard label="Klijenti" value={String(clientCount)} />
        <StatCard
          label="Prosjek"
          value={`${Math.round(avgEur).toLocaleString("fr-FR")} €`}
        />
        <StatCard
          label="Najbolji mjesec"
          value={bestMonth.total > 0 ? `${bestMonth.total.toLocaleString("fr-FR")} €` : "—"}
        />
      </div>

      {/* Monthly bar chart */}
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6">
        <p className="text-zinc-400 text-sm font-medium mb-6">Prihodi po mjesecu (zadnjih 12 mj.)</p>
        <div className="flex items-end gap-2 h-40">
          {months.map((m) => (
            <div key={m.key} className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <div className="w-full flex flex-col justify-end" style={{ height: "120px" }}>
                {m.total > 0 ? (
                  <div
                    className="w-full bg-blue-600/80 rounded-t-sm"
                    style={{ height: `${Math.max((m.total / maxMonthly) * 100, 4)}%` }}
                    title={`${m.total.toLocaleString("fr-FR")} €`}
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
        <div className="rounded-xl border border-dashed border-[#1f1f2e] p-10 text-center">
          <p className="text-zinc-500 text-sm">Nema konverzija. Dodaj konverziju na stranici prospekta.</p>
        </div>
      ) : (
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#1f1f2e]">
            <p className="text-zinc-400 text-sm font-medium">Sve konverzije</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1f1f2e]">
                <th className="px-5 py-3 text-left text-zinc-500 text-xs uppercase tracking-wider font-medium">Klijent</th>
                <th className="px-5 py-3 text-left text-zinc-500 text-xs uppercase tracking-wider font-medium">Datum</th>
                <th className="px-5 py-3 text-right text-zinc-500 text-xs uppercase tracking-wider font-medium">Vrijednost</th>
                <th className="px-5 py-3 text-left text-zinc-500 text-xs uppercase tracking-wider font-medium">Napomena</th>
              </tr>
            </thead>
            <tbody>
              {conversions.map((c) => (
                <tr key={c.id} className="border-b border-[#1f1f2e] last:border-0 hover:bg-[#1a1a28] transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-zinc-200 font-medium">{c.prospect.firmaNaziv}</p>
                    <p className="text-zinc-600 text-xs">{c.prospect.email}</p>
                  </td>
                  <td className="px-5 py-3 text-zinc-400">
                    {new Date(c.datumKonverzije).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-green-400 font-semibold">
                      {c.vrijednostProjekta.toLocaleString("fr-FR")} €
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
