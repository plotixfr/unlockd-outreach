"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Zap, CheckCircle2 } from "lucide-react";

interface Props {
  hasAnyBrief: boolean;
}

/**
 * One-click bootstrap: creates the curated set of briefs for Unlockd's premium
 * French target market. Once clicked, the autopilot has work to do every day
 * without further configuration.
 */
export function QuickSetupButton({ hasAnyBrief }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ created: number; skipped: number; names: string[] } | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const run = async () => {
    if (
      hasAnyBrief &&
      !confirm("You already have briefs. Quick Setup will add the preset list (may create some duplicates with different names). Continue?")
    ) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/autopilot/quick-setup", { method: "POST" });
      const data: { created?: number; skipped?: number; createdNames?: string[]; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setDone({
        created: data.created ?? 0,
        skipped: data.skipped ?? 0,
        names: data.createdNames ?? [],
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] to-[#0a0a12] p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 strokeWidth={2} className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-emerald-300 font-medium text-sm">
              Quick Setup complete — {done.created} new briefs, {done.skipped} already existed
            </p>
            <p className="text-emerald-200/70 text-xs mt-1">
              Autopilot runs them all next business day at 08:00 Paris automatically.
            </p>
            {done.names.length > 0 && done.names.length <= 8 && (
              <ul className="mt-3 text-emerald-200/60 text-[11px] space-y-0.5 columns-2">
                {done.names.map((n) => <li key={n} className="break-inside-avoid">· {n}</li>)}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-[#0d0d12] to-[#0a0a12] p-6 card-elevation">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0 max-w-2xl">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-md bg-emerald-500/15 flex items-center justify-center">
              <Zap strokeWidth={2} className="w-4 h-4 text-emerald-400" />
            </div>
            <h2 className="text-white font-semibold text-base">Quick Setup — Unlockd target market</h2>
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed">
            One click seeds 48 briefs across three markets: <strong className="text-zinc-200">France</strong> (Group A B2B services via Google Places + Group B FR tech via Sirene gov registry), <strong className="text-zinc-200">Switzerland Romandie</strong> (Geneva, Lausanne, Neuchâtel — French-speaking), and <strong className="text-zinc-200">Netherlands</strong> (Amsterdam, Rotterdam, Den Haag, Utrecht, Eindhoven — Dutch templates).
          </p>
          <p className="text-zinc-600 text-xs mt-2">
            Targets: consultancies, law firms, accountants, marketing agencies, architecture studios, tech startups, SaaS, digital agencies. Hobby plan can pull 15–25 qualified prospects/day across all three countries.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="shrink-0 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap strokeWidth={2} className="w-4 h-4" />}
          {loading ? "Creating…" : "Run Quick Setup"}
        </button>
      </div>
      {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
    </div>
  );
}
