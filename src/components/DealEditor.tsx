"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEAL_STAGES, DEAL_STAGE_BS, DEAL_STAGE_COLOR, type DealStage } from "@/lib/dealStages";

interface Props {
  prospectId: string;
  initialStage: string | null;
  initialValue: number | null;
}

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
    <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5 space-y-3">
      <h2 className="text-white font-medium text-sm">Deal</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-zinc-500 text-xs uppercase tracking-wider mb-1.5">Stage</label>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onStageChange("")}
              className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                stage === ""
                  ? "bg-zinc-800 text-zinc-300 border-zinc-700"
                  : "bg-transparent text-zinc-600 border-[#1f1f2e] hover:text-zinc-400"
              }`}
            >
              —
            </button>
            {DEAL_STAGES.map((s: DealStage) => (
              <button
                key={s}
                onClick={() => onStageChange(s)}
                disabled={saving === "stage"}
                className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                  stage === s
                    ? DEAL_STAGE_COLOR[s]
                    : "bg-transparent text-zinc-500 border-[#1f1f2e] hover:text-zinc-300"
                }`}
              >
                {DEAL_STAGE_BS[s]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-zinc-500 text-xs uppercase tracking-wider mb-1.5">Vrijednost (€)</label>
          <input
            type="number"
            min={0}
            step={100}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={onValueBlur}
            placeholder="0"
            className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600 transition-colors"
          />
        </div>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
