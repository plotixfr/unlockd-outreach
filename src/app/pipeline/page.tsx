import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  DEAL_STAGES,
  DEAL_STAGE_LABEL,
  DEAL_STAGE_PROBABILITY,
  type DealStage,
} from "@/lib/dealStages";
import { ArrowLeft, GitBranch } from "lucide-react";

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
    <div className="max-w-[1400px] space-y-3">
      <div className="flex items-end justify-between gap-4 flex-wrap pb-2">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="pill pill-accent">
              <GitBranch className="w-3 h-3" />
              Pipeline
            </span>
          </div>
          <h1 className="text-white text-4xl sm:text-5xl tracking-tight">Deals in motion</h1>
          <p className="text-[var(--text-muted)] text-sm mt-3 max-w-2xl">
            Open deals once a prospect has engaged. Forecast is probability-weighted by stage.
          </p>
        </div>
        <Link href="/prospects" className="btn-ghost">
          <ArrowLeft className="w-3.5 h-3.5" />
          All prospects
        </Link>
      </div>

      {/* Forecast cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-5">
          <p className="section-label">Open pipeline</p>
          <p className="display-number text-3xl text-white mt-3">{fmtCurrency(openPipeline)}</p>
          <p className="text-[var(--text-dim)] text-xs mt-2 font-medium">
            Sum across Discovery / Proposal / Negotiating
          </p>
        </div>
        <div className="card card-accent p-5">
          <p className="section-label text-emerald-400/80">Forecast · probability × value</p>
          <p className="display-number text-3xl text-emerald-300 mt-3">{fmtCurrency(forecast)}</p>
          <p className="text-[var(--text-dim)] text-xs mt-2 font-medium">
            Discovery 20% · Proposal 45% · Negotiating 65%
          </p>
        </div>
        <div className="card p-5">
          <p className="section-label">Won this period</p>
          <p className="display-number text-3xl text-amber-300 mt-3">{fmtCurrency(won)}</p>
          <p className="text-[var(--text-dim)] text-xs mt-2 font-medium">
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
            <div key={stage} className="card p-3 min-h-[220px] flex flex-col">
              <div className="flex items-center justify-between mb-3 pb-2 etch-top first:border-t-0 first:shadow-none first:pb-2 border-b border-[var(--border-1)]">
                <span className={`pill ${stage === "Won" ? "pill-accent" : stage === "Lost" ? "pill-danger" : "pill-muted"}`}>
                  {DEAL_STAGE_LABEL[stage]}
                </span>
                <span className="text-[var(--text-dim)] text-xs tabular font-bold">{items.length}</span>
              </div>
              {sum > 0 && (
                <p className="display-number text-white text-base mb-2 tabular">{fmtCurrency(sum)}</p>
              )}
              <div className="space-y-2 flex-1">
                {items.length === 0 ? (
                  <p className="text-[var(--text-faint)] text-xs italic mt-2">empty</p>
                ) : (
                  items.map((p) => (
                    <Link
                      key={p.id}
                      href={`/prospects/${p.id}`}
                      className="block rounded-md bg-[var(--bg-elev-1)] border border-[var(--border-1)] hover:border-emerald-500/30 hover:bg-emerald-500/[0.03] p-3 transition-colors group"
                    >
                      <p className="text-white text-sm font-semibold group-hover:text-emerald-300 transition-colors truncate">
                        {p.firmaNaziv}
                      </p>
                      <p className="text-[var(--text-dim)] text-xs mt-0.5 truncate">
                        {p.nisa} · {p.grad}
                      </p>
                      {p.dealValue ? (
                        <p className="text-emerald-300 text-xs font-bold mt-1.5 tabular">
                          {fmtCurrency(p.dealValue)}
                        </p>
                      ) : (
                        <p className="text-[var(--text-faint)] text-xs mt-1.5">— no value set</p>
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
        <div className="card p-10 text-center">
          <p className="text-[var(--text-muted)] text-sm">
            No open deals yet. When a prospect replies with interest, set their stage from their detail page.
          </p>
        </div>
      )}
    </div>
  );
}
