import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  DEAL_STAGES,
  DEAL_STAGE_LABEL,
  DEAL_STAGE_COLOR,
  DEAL_STAGE_PROBABILITY,
  type DealStage,
} from "@/lib/dealStages";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

function fmtCurrency(n: number): string {
  return `€${Math.round(n).toLocaleString("en-US")}`;
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
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-[0.18em] font-medium mb-2">Pipeline</p>
          <h1 className="text-3xl font-semibold text-white tracking-tight">Deals in motion</h1>
          <p className="text-zinc-500 text-sm mt-1 max-w-xl">
            Open deals once a prospect has engaged. Forecast is probability-weighted by stage.
          </p>
        </div>
        <Link
          href="/prospects"
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm px-3 py-1.5 rounded-lg border border-[#1c1c28] hover:border-[#2e2e3e] hover:bg-white/[0.02] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All prospects
        </Link>
      </div>

      {/* Forecast cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-5 card-elevation">
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium mb-2">Open pipeline</p>
          <p
            className="text-3xl text-white tabular-nums tracking-tight"
            style={{ fontFamily: "var(--font-display-serif)", fontWeight: 500 }}
          >
            {fmtCurrency(openPipeline)}
          </p>
          <p className="text-zinc-600 text-xs mt-1.5">
            Sum across Discovery / Proposal / Negotiating
          </p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-emerald-500/[0.06] to-[#0d0d12] border border-emerald-500/20 p-5 card-elevation">
          <p className="text-emerald-400 text-[10px] uppercase tracking-widest font-medium mb-2">Forecast (probability × value)</p>
          <p
            className="text-3xl text-emerald-300 tabular-nums tracking-tight"
            style={{ fontFamily: "var(--font-display-serif)", fontWeight: 500 }}
          >
            {fmtCurrency(forecast)}
          </p>
          <p className="text-emerald-200/60 text-xs mt-1.5">
            Discovery 20% · Proposal 45% · Negotiating 65%
          </p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-amber-500/[0.05] to-[#0d0d12] border border-amber-500/20 p-5 card-elevation">
          <p className="text-amber-400 text-[10px] uppercase tracking-widest font-medium mb-2">Won this period</p>
          <p
            className="text-3xl text-amber-300 tabular-nums tracking-tight"
            style={{ fontFamily: "var(--font-display-serif)", fontWeight: 500 }}
          >
            {fmtCurrency(won)}
          </p>
          <p className="text-amber-200/60 text-xs mt-1.5">
            {byStage.Won?.length ?? 0} {(byStage.Won?.length ?? 0) === 1 ? "client" : "clients"}
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
              className="rounded-xl bg-[#0a0a12] border border-[#1c1c28] p-3 min-h-[200px] flex flex-col"
            >
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#1c1c28]">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider border ${DEAL_STAGE_COLOR[stage]}`}>
                  {DEAL_STAGE_LABEL[stage]}
                </span>
                <span className="text-zinc-500 text-xs tabular-nums">{items.length}</span>
              </div>
              {sum > 0 && (
                <p className="text-zinc-400 text-xs font-medium mb-2 tabular-nums">{fmtCurrency(sum)}</p>
              )}
              <div className="space-y-2 flex-1">
                {items.length === 0 ? (
                  <p className="text-zinc-700 text-xs italic mt-2">empty</p>
                ) : (
                  items.map((p) => (
                    <Link
                      key={p.id}
                      href={`/prospects/${p.id}`}
                      className="block rounded-md bg-[#0d0d12] border border-[#1c1c28] hover:border-emerald-500/30 hover:bg-emerald-500/[0.03] p-3 transition-colors group"
                    >
                      <p className="text-zinc-200 text-sm font-medium group-hover:text-emerald-300 transition-colors truncate">
                        {p.firmaNaziv}
                      </p>
                      <p className="text-zinc-500 text-xs mt-0.5 truncate">
                        {p.nisa} · {p.grad}
                      </p>
                      {p.dealValue ? (
                        <p className="text-emerald-400 text-xs font-medium mt-1.5 tabular-nums">
                          {fmtCurrency(p.dealValue)}
                        </p>
                      ) : (
                        <p className="text-zinc-600 text-xs mt-1.5">— no value set</p>
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
        <div className="rounded-xl border border-dashed border-[#1c1c28] p-10 text-center bg-gradient-to-br from-emerald-500/[0.03] to-transparent">
          <p className="text-zinc-400 text-sm">
            No open deals yet. When a prospect replies with interest, set their stage from their detail page.
          </p>
        </div>
      )}
    </div>
  );
}
