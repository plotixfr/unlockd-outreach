"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  unscoredCount: number;
}

/**
 * Triggers batch quality scoring. Calls /api/prospects/score in a loop until
 * all unscored prospects are evaluated. Shows progress so the operator can
 * leave the tab open and watch the counter drain.
 */
export function ScoreUnscoredButton({ unscoredCount }: Props) {
  const [running, setRunning] = useState(false);
  const [scored, setScored] = useState(0);
  const [remaining, setRemaining] = useState(unscoredCount);
  const [error, setError] = useState("");
  const router = useRouter();

  const run = async () => {
    setRunning(true);
    setError("");
    setScored(0);
    setRemaining(unscoredCount);
    let totalScored = 0;
    let safety = 60; // up to ~300 prospects per click
    try {
      while (safety-- > 0) {
        const res = await fetch("/api/prospects/score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 5 }),
        });
        const data: { scored?: number; remaining?: number; done?: boolean; error?: string } =
          await res.json();
        if (!res.ok) throw new Error(data.error || "Greška u scoring-u");
        totalScored += data.scored ?? 0;
        setScored(totalScored);
        setRemaining(data.remaining ?? 0);
        if (data.done || (data.scored ?? 0) === 0) break;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setRunning(false);
    }
  };

  if (unscoredCount === 0 && !running && scored === 0) {
    return (
      <span className="text-zinc-600 text-xs">Svi prospekti su ocijenjeni</span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={running || (unscoredCount === 0 && scored === 0)}
        className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2"
      >
        {running && (
          <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        )}
        {running
          ? `Ocjenjujem… ${scored}/${scored + remaining}`
          : `Ocijeni ${unscoredCount} neprocijenjenih`}
      </button>
      {error && <span className="text-red-400 text-xs">{error}</span>}
    </div>
  );
}
