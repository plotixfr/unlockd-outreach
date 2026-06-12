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
  neutral: { bar: "bg-zinc-300", text: "text-zinc-700" },
  ok: { bar: "bg-emerald-200", text: "text-emerald-800" },
  good: { bar: "bg-emerald-300", text: "text-emerald-800" },
  great: { bar: "bg-emerald-400", text: "text-emerald-900" },
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
    <div className="card p-6">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-[var(--text)] font-semibold text-sm">Sales funnel</h2>
          <p className="text-[var(--text-muted)] text-xs mt-1">Conversion per stage · cost per meeting / deal</p>
        </div>
        <div className="flex items-center gap-5 text-right">
          {typeof totalSpendEur === "number" && (
            <div>
              <p className="section-label justify-end">Spend</p>
              <p className="text-[var(--text)] text-sm font-medium tabular-nums mt-1">
                ~€{totalSpendEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </p>
            </div>
          )}
          {costPerMeetingEur !== undefined && (
            <div>
              <p className="section-label justify-end">Per meeting</p>
              <p className={`text-sm font-medium tabular-nums mt-1 ${costPerMeetingEur === null ? "text-[var(--text-muted)]" : "text-amber-600"}`}>
                {costPerMeetingEur === null ? "—" : `~€${costPerMeetingEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
              </p>
            </div>
          )}
          {costPerDealEur !== undefined && (
            <div>
              <p className="section-label justify-end">Per deal</p>
              <p className={`text-sm font-medium tabular-nums mt-1 ${costPerDealEur === null ? "text-[var(--text-muted)]" : "text-emerald-700"}`}>
                {costPerDealEur === null ? "—" : `~€${costPerDealEur.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
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
                  <ArrowDown strokeWidth={2} className="w-3 h-3 text-[var(--text-muted)]" />
                  <span className="text-[var(--text-muted)] text-[10px] tabular-nums">{conversion} conversion from {prev.label.toLowerCase()}</span>
                </div>
              )}
              <div className="flex items-center gap-4">
                <div className="w-32 shrink-0">
                  <p className="text-[var(--text-secondary)] text-xs font-semibold uppercase tracking-wider">{stage.label}</p>
                  {stage.detail && <p className="text-[var(--text-muted)] text-[10px] mt-0.5">{stage.detail}</p>}
                </div>
                <div className="flex-1 relative h-8 rounded-lg bg-zinc-100 overflow-hidden border border-[var(--border)]">
                  <div
                    className={`absolute inset-y-0 left-0 ${styles.bar} transition-all duration-500`}
                    style={{ width: `${width}%` }}
                  />
                  <div className="absolute inset-0 flex items-center px-3">
                    <span className={`text-sm font-semibold tabular-nums ${styles.text}`}>
                      {stage.count.toLocaleString("en-US")}
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
