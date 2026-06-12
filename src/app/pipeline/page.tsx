import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  DEAL_STAGES,
  DEAL_STAGE_LABEL,
  DEAL_STAGE_PROBABILITY,
  type DealStage,
} from "@/lib/dealStages";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";

function fmtCurrency(n: number): string {
  return `€${Math.round(n).toLocaleString("en-US")}`;
}

// Light badge tints for the kanban column headers (UI-only; canonical stage
// names live in lib/dealStages.ts).
const STAGE_BADGE: Record<DealStage, string> = {
  Discovery:   "bg-sky-50 text-sky-700 border border-sky-200",
  Proposal:    "bg-violet-50 text-violet-700 border border-violet-200",
  Negotiating: "bg-amber-50 text-amber-700 border border-amber-200",
  Won:         "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Lost:        "bg-zinc-100 text-zinc-500 border border-zinc-200",
};

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
    <div className="max-w-[1400px] space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Deals</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
            Deals open once a prospect engages. Forecast is probability-weighted by stage.
          </p>
        </div>
        <Link href="/prospects" className="btn-secondary">
          <ArrowLeft className="w-3.5 h-3.5" />
          All prospects
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="section-label">Open pipeline</p>
          <p className="kpi-value mt-3">{fmtCurrency(openPipeline)}</p>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            Sum across Discovery, Proposal and Negotiating
          </p>
        </div>
        <div className="card-accent p-5">
          <p className="section-label">Weighted forecast</p>
          <p className="kpi-value mt-3 text-[var(--accent)]!">{fmtCurrency(forecast)}</p>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            Discovery 20% · Proposal 45% · Negotiating 65%
          </p>
        </div>
        <div className="card p-5">
          <p className="section-label">Won this period</p>
          <p className="kpi-value mt-3">{fmtCurrency(won)}</p>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            {byStage.Won?.length ?? 0} {(byStage.Won?.length ?? 0) === 1 ? "client" : "clients"}
          </p>
        </div>
      </div>

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {DEAL_STAGES.map((stage) => {
          const items = byStage[stage] ?? [];
          const sum = items.reduce((s, p) => s + (p.dealValue ?? 0), 0);
          return (
            <div key={stage} className="card p-3 min-h-[240px] flex flex-col">
              <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-[var(--border)]">
                <span className={`badge ${STAGE_BADGE[stage]}`}>{DEAL_STAGE_LABEL[stage]}</span>
                <span className="font-mono text-xs font-medium text-[var(--text-muted)] tabular">
                  {items.length}
                </span>
              </div>
              {sum > 0 && (
                <p className="font-mono text-sm font-semibold text-[var(--text)] mb-3 tabular">
                  {fmtCurrency(sum)}
                </p>
              )}
              <div className="flex-1 flex flex-col gap-2">
                {items.length === 0 ? (
                  <EmptyState
                    title="No deals"
                    hint="Deals appear when a prospect replies and you set a stage."
                    className="flex-1 px-3! py-6!"
                  />
                ) : (
                  items.map((p) => (
                    <Link
                      key={p.id}
                      href={`/prospects/${p.id}`}
                      className="block rounded-lg bg-[var(--bg)] border border-[var(--border)] hover:border-[var(--accent-border)] hover:bg-[var(--accent-soft)] p-3 transition-colors"
                    >
                      <p className="text-sm font-semibold text-[var(--text)] truncate">
                        {p.firmaNaziv}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                        {p.nisa} · {p.grad}
                      </p>
                      {p.dealValue ? (
                        <p className="font-mono text-xs font-semibold text-[var(--accent)] mt-1.5 tabular">
                          {fmtCurrency(p.dealValue)}
                        </p>
                      ) : (
                        <p className="text-xs text-[var(--text-muted)] mt-1.5">No value set</p>
                      )}
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
