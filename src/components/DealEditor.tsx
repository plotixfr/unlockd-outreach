"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEAL_STAGES, DEAL_STAGE_LABEL, type DealStage } from "@/lib/dealStages";

interface Props {
  prospectId: string;
  initialStage: string | null;
  initialValue: number | null;
}

// Light-theme active-stage tints (DEAL_STAGE_COLOR in lib/dealStages keeps the
// kanban's palette; this map is the detail-page equivalent on white cards).
const STAGE_ACTIVE_CLS: Record<DealStage, string> = {
  Discovery: "bg-sky-50 text-sky-700 border-sky-200",
  Proposal: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Negotiating: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Won: "bg-emerald-600 text-white border-emerald-600",
  Lost: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

/**
 * Inline editor for deal stage + forecast value on the prospect detail page.
 * Saves on blur/change so there's no separate submit button.
 */
export function DealEditor({ prospectId, initialStage, initialValue }: Props) {
  const [stage, setStage] = useState<string>(initialStage ?? "");
  const [value, setValue] = useState<string>(initialValue?.toString() ?? "");
  const [saving, setSaving] = useState<"stage" | "value" | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const save = async (field: "stage" | "value", payload: Record<string, unknown>) => {
    setSaving(field);
    setError("");
    try {
      const res = await fetch(`/api/prospects/${prospectId}/deal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(null);
    }
  };

  const onStageChange = (next: string) => {
    setStage(next);
    void save("stage", { dealStage: next || null });
  };

  const onValueBlur = () => {
    if (value.trim() === (initialValue?.toString() ?? "")) return;
    void save("value", { dealValue: value.trim() === "" ? null : parseFloat(value) });
  };

  return (
    <div className="card p-5 space-y-3">
      <p className="section-label">Deal</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5">Stage</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onStageChange("")}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors ${
                stage === ""
                  ? "bg-zinc-100 text-zinc-700 border-zinc-300"
                  : "bg-white text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
              }`}
            >
              —
            </button>
            {DEAL_STAGES.map((s: DealStage) => (
              <button
                key={s}
                onClick={() => onStageChange(s)}
                disabled={saving === "stage"}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors ${
                  stage === s
                    ? STAGE_ACTIVE_CLS[s]
                    : "bg-white text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                }`}
              >
                {DEAL_STAGE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5">Value (€)</label>
          <input
            type="number"
            min={0}
            step={100}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={onValueBlur}
            placeholder="0"
            className="w-full bg-white border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  );
}
