import { ArrowDown } from "lucide-react";

export interface FunnelStage {
  label: string;
  count: number;
  detail?: string;
  tone: "neutral" | "ok" | "good" | "great";
}

interface Props {
  stages: FunnelStage[];
  totalSpendEur?: number;
  costPerMeetingEur?: number | null;
  costPerDealEur?: number | null;
}

const TONE_STYLES = {
  neutral: { bar: "bg-zinc-700/60", text: "text-zinc-300" },
  ok: { bar: "bg-indigo-500/60", text: "text-indigo-300" },
  good: { bar: "bg-emerald-500/60", text: "text-emerald-300" },
  great: { bar: "bg-emerald-500/80", text: "text-emerald-200" },
};

function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

/**
 * Visual sales funnel — each stage drawn as a horizontal bar whose width is
 * proportional to its count vs. the funnel top. Conversion arrows between
 * stages show drop-off percentages. Cost-per-meeting and cost-per-deal
 * surface the real economics next to the volume numbers.
 */
export function FunnelView({ stages, totalSpendEur, costPerMeetingEur, costPerDealEur }: Props) {
  if (stages.length === 0) return null;
  const top = Math.max(stages[0].count, 1);

  return (
    <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-zinc-200 font-medium text-sm">Sales funnel</h2>
          <p className="text-zinc-500 text-xs mt-1">Konverzija po koraku · cost-per-meeting / deal</p>
        </div>
        <div className="flex items-center gap-5 text-right">
          {typeof totalSpendEur === "number" && (
            <div>
              <p className="text-zinc-600 text-[10px] uppercase tracking-widest">Trošak</p>
              <p className="text-zinc-300 text-sm font-medium tabular-nums">
                ~{totalSpendEur.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €
              </p>
            </div>
          )}
          {costPerMeetingEur !== undefined && (
            <div>
              <p className="text-zinc-600 text-[10px] uppercase tracking-widest">Po sastanku</p>
              <p className={`text-sm font-medium tabular-nums ${costPerMeetingEur === null ? "text-zinc-600" : "text-amber-300"}`}>
                {costPerMeetingEur === null ? "—" : `~${costPerMeetingEur.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`}
              </p>
            </div>
          )}
          {costPerDealEur !== undefined && (
            <div>
              <p className="text-zinc-600 text-[10px] uppercase tracking-widest">Po deal-u</p>
              <p className={`text-sm font-medium tabular-nums ${costPerDealEur === null ? "text-zinc-600" : "text-emerald-300"}`}>
                {costPerDealEur === null ? "—" : `~${costPerDealEur.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {stages.map((stage, i) => {
          const width = Math.max(8, (stage.count / top) * 100);
          const prev = i > 0 ? stages[i - 1] : null;
          const conversion = prev ? pct(stage.count, prev.count) : null;
          const styles = TONE_STYLES[stage.tone];
          return (
            <div key={stage.label}>
              {prev && (
                <div className="flex items-center gap-2 mb-1 ml-1">
                  <ArrowDown strokeWidth={2} className="w-3 h-3 text-zinc-700" />
                  <span className="text-zinc-600 text-[10px] tabular-nums">{conversion} konverzija od {prev.label.toLowerCase()}</span>
                </div>
              )}
              <div className="flex items-center gap-4">
                <div className="w-32 shrink-0">
                  <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider">{stage.label}</p>
                  {stage.detail && <p className="text-zinc-600 text-[10px] mt-0.5">{stage.detail}</p>}
                </div>
                <div className="flex-1 relative h-8 rounded-lg bg-[#14141c] overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 ${styles.bar} transition-all duration-500`}
                    style={{ width: `${width}%` }}
                  />
                  <div className="absolute inset-0 flex items-center px-3">
                    <span className={`text-sm font-semibold tabular-nums ${styles.text}`}>
                      {stage.count.toLocaleString("fr-FR")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
