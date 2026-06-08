"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Zap, CheckCircle2, AlertCircle } from "lucide-react";

interface SummaryRow {
  briefName: string;
  found: number;
  created: number;
  qualified: number;
  scheduled: number;
  errors: string[];
}

interface RunResult {
  ok: boolean;
  summaries?: SummaryRow[];
  sendSweep?: { totalSent: number; totalSkipped: number } | null;
  error?: string;
}

/**
 * One-click manual autopilot trigger. Same endpoint that the Vercel cron
 * fires, but uses the operator's session cookie (no Bearer token) — the API
 * route checks `req.headers.authorization === 'Bearer ${CRON_SECRET}'` ONLY
 * for the GET path used by Vercel. POST without a `briefId` runs every
 * active brief and returns summaries, which we render inline.
 *
 * Useful when the operator wants to backfill a same-day batch instead of
 * waiting for the next 8/11/14/17h Paris fire.
 */
export function RunAutopilotNowButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/autopilot/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data: RunResult = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška pri pokretanju");
    } finally {
      setRunning(false);
    }
  };

  const totalScheduled = result?.summaries?.reduce((acc, s) => acc + s.scheduled, 0) ?? 0;
  const totalCreated = result?.summaries?.reduce((acc, s) => acc + s.created, 0) ?? 0;
  const totalErrors = result?.summaries?.reduce((acc, s) => acc + s.errors.length, 0) ?? 0;

  return (
    <div className="rounded-2xl bg-[#0d0d12] border border-[#1c1c28] p-5 card-elevation">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400">
            <Zap strokeWidth={2} className="w-5 h-5" />
          </div>
          <div>
            <p className="text-white font-medium text-sm">Run autopilot now</p>
            <p className="text-zinc-500 text-xs mt-0.5">
              Skip the wait — fire discovery + send sweep on demand. ~30-60s per run.
            </p>
          </div>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 shadow-[0_6px_18px_-8px_rgba(16,185,129,0.45)]"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {running ? "Running…" : "Run now"}
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-rose-950/30 border border-rose-700/40 p-3">
          <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
          <p className="text-rose-200 text-xs">{error}</p>
        </div>
      )}

      {result?.summaries && result.summaries.length > 0 && (
        <div className="mt-4 rounded-lg bg-[#0a0a12] border border-[#1c1c28] p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <p className="text-emerald-300 text-xs font-medium uppercase tracking-widest">
              Done · {result.summaries.length} briefs · {totalCreated} created · {totalScheduled} scheduled
              {result.sendSweep && result.sendSweep.totalSent > 0
                ? ` · ${result.sendSweep.totalSent} emails sent`
                : ""}
              {totalErrors > 0 ? ` · ${totalErrors} errors` : ""}
            </p>
          </div>
          <div className="max-h-48 overflow-auto space-y-1">
            {result.summaries
              .filter((s) => s.found > 0 || s.errors.length > 0)
              .map((s) => (
                <div
                  key={s.briefName}
                  className="flex items-center justify-between text-xs text-zinc-400 py-1 border-b border-[#14141c] last:border-b-0"
                >
                  <span className="truncate">{s.briefName}</span>
                  <span className="text-zinc-500 shrink-0 ml-2 tabular-nums">
                    f:{s.found} q:{s.qualified} s:{s.scheduled}
                    {s.errors.length > 0 ? ` · ✗${s.errors.length}` : ""}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
