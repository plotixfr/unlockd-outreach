import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  DEAL_STAGES,
  DEAL_STAGE_BS,
  DEAL_STAGE_COLOR,
  DEAL_STAGE_PROBABILITY,
  type DealStage,
} from "@/lib/dealStages";

export const dynamic = "force-dynamic";

function fmtEur(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
}

export default async function PipelinePage() {
  const prospects = await prisma.prospect.findMany({
    where: { dealStage: { not: null } },
    orderBy: [{ dealStageAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      firmaNaziv: true,
      grad: true,
      nisa: true,
      dealStage: true,
      dealValue: true,
      dealStageAt: true,
      kontaktIme: true,
    },
  });

  // Group prospects by stage so each column renders independently.
  const byStage: Record<DealStage, typeof prospects> = {
    Discovery: [],
    Proposal: [],
    Negotiating: [],
    Won: [],
    Lost: [],
  };
  for (const p of prospects) {
    const s = p.dealStage as DealStage | null;
    if (s && byStage[s]) byStage[s].push(p);
  }

  // Forecast: sum dealValue * stage probability across open stages.
  let forecast = 0;
  let won = 0;
  let openPipeline = 0;
  for (const s of DEAL_STAGES) {
    const stageProspects = byStage[s] ?? [];
    const stageSum = stageProspects.reduce((sum, p) => sum + (p.dealValue ?? 0), 0);
    if (s === "Won") {
      won += stageSum;
    } else if (s !== "Lost") {
      openPipeline += stageSum;
      forecast += stageSum * DEAL_STAGE_PROBABILITY[s];
    }
  }

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Pipeline</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Otvoreni deal-ovi nakon što je prospect odgovorio. Probability-weighted forecast.
          </p>
        </div>
        <Link
          href="/prospects"
          className="text-zinc-400 hover:text-white text-sm px-3 py-1.5 rounded-lg border border-[#1f1f2e] hover:border-[#2f2f3e] transition-colors"
        >
          ← Svi prospekti
        </Link>
      </div>

      {/* Forecast cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5">
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Otvoreni pipeline</p>
          <p className="text-3xl font-bold text-white">{fmtEur(openPipeline)}</p>
          <p className="text-zinc-600 text-xs mt-1">
            Suma neugovorenih dealova (Discovery / Proposal / Negotiating)
          </p>
        </div>
        <div className="rounded-xl bg-blue-950/30 border border-blue-900/40 p-5">
          <p className="text-blue-400 text-xs uppercase tracking-wider mb-2">Forecast (vjerovatnoća × vrijednost)</p>
          <p className="text-3xl font-bold text-blue-300">{fmtEur(forecast)}</p>
          <p className="text-blue-200/60 text-xs mt-1">
            Discovery 20% · Proposal 45% · Negotiating 65%
          </p>
        </div>
        <div className="rounded-xl bg-emerald-950/30 border border-emerald-900/40 p-5">
          <p className="text-emerald-400 text-xs uppercase tracking-wider mb-2">Dobijeno</p>
          <p className="text-3xl font-bold text-emerald-300">{fmtEur(won)}</p>
          <p className="text-emerald-200/60 text-xs mt-1">
            {byStage.Won?.length ?? 0} klijent{(byStage.Won?.length ?? 0) === 1 ? "" : "a"}
          </p>
        </div>
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {DEAL_STAGES.map((stage) => {
          const items = byStage[stage] ?? [];
          const sum = items.reduce((s, p) => s + (p.dealValue ?? 0), 0);
          return (
            <div
              key={stage}
              className="rounded-xl bg-[#0d0d14] border border-[#1f1f2e] p-3 min-h-[200px] flex flex-col"
            >
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#1f1f2e]">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${DEAL_STAGE_COLOR[stage]}`}>
                  {DEAL_STAGE_BS[stage]}
                </span>
                <span className="text-zinc-500 text-xs">{items.length}</span>
              </div>
              {sum > 0 && (
                <p className="text-zinc-400 text-xs font-medium mb-2">{fmtEur(sum)}</p>
              )}
              <div className="space-y-2 flex-1">
                {items.length === 0 ? (
                  <p className="text-zinc-700 text-xs italic mt-2">prazno</p>
                ) : (
                  items.map((p) => (
                    <Link
                      key={p.id}
                      href={`/prospects/${p.id}`}
                      className="block rounded-md bg-[#111118] border border-[#1f1f2e] hover:border-[#2f2f3e] p-3 transition-colors group"
                    >
                      <p className="text-zinc-200 text-sm font-medium group-hover:text-blue-300 transition-colors truncate">
                        {p.firmaNaziv}
                      </p>
                      <p className="text-zinc-500 text-xs mt-0.5 truncate">
                        {p.nisa} · {p.grad}
                      </p>
                      {p.dealValue ? (
                        <p className="text-emerald-400 text-xs font-medium mt-1.5">
                          {fmtEur(p.dealValue)}
                        </p>
                      ) : (
                        <p className="text-zinc-600 text-xs mt-1.5">— bez vrijednosti</p>
                      )}
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {prospects.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#1f1f2e] p-10 text-center">
          <p className="text-zinc-500 text-sm">
            Nema otvorenih deal-ova. Kad ti prospect odgovori sa interesovanjem, postavi mu stage iz njegove kartice.
          </p>
        </div>
      )}
    </div>
  );
}
