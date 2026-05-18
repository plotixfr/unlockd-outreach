"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface BulkResult {
  line: string;
  status: "created" | "skipped" | "invalid";
  reason?: string;
  briefName?: string;
}

const EXAMPLE = `Avocats, Marseille
Dentistes, Lyon
Photographe mariage, Bordeaux
Cabinet kinésithérapeute, Toulouse
Boulangerie artisanale, Paris
Salle de sport premium, Lyon
Notaire, Annecy
Concept store, Marseille
Cabinet vétérinaire, Aix-en-Provence
Architecte d'intérieur, Nice`;

/**
 * Lets the operator paste any number of "niche, city[, country, minRating, minReviews]"
 * lines and creates a brief for each. Use this for any vertical/city
 * combination not covered by Quick Setup — the whole point is that the app
 * works for ANY niche, not just hotels/restaurants/architects/real estate.
 */
export function BulkBriefAdd() {
  const [text, setText] = useState("");
  const [maxPerRun, setMaxPerRun] = useState(2);
  const [qualityThreshold, setQualityThreshold] = useState(6);
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [autoSchedule, setAutoSchedule] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const router = useRouter();

  const submit = async () => {
    if (!text.trim()) {
      setError("Pasteuj barem jednu liniju");
      return;
    }
    setLoading(true);
    setError("");
    setResults(null);
    try {
      const res = await fetch("/api/briefs/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          maxPerRun,
          qualityThreshold,
          autoGenerate,
          autoSchedule,
        }),
      });
      const data: { results?: BulkResult[]; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Greška");
      setResults(data.results ?? []);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    } finally {
      setLoading(false);
    }
  };

  const useExample = () => setText(EXAMPLE);

  const stats = results
    ? {
        created: results.filter((r) => r.status === "created").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        invalid: results.filter((r) => r.status === "invalid").length,
      }
    : null;

  return (
    <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6 space-y-4">
      <div>
        <h2 className="text-white font-medium">Bulk Add — bilo koja niša, bilo koji grad</h2>
        <p className="text-zinc-500 text-xs mt-1">
          Pasteuj listu: <code className="bg-[#1a1a28] px-1.5 py-0.5 rounded text-blue-300">niche, grad</code> po liniji.
          Opcionalno: <code className="bg-[#1a1a28] px-1.5 py-0.5 rounded">niche, grad, country, minRating, minReviews</code>.
          Niše su slobodno polje — radi sa avocati, dentisti, fotografi, automehaničari, šta god.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={`Avocats, Marseille\nDentistes, Lyon\nPhotographe mariage, Bordeaux\nCabinet kinésithérapeute, Toulouse`}
        className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-md px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-700 font-mono focus:outline-none focus:border-blue-600 transition-colors leading-relaxed"
      />

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={useExample}
          className="text-zinc-400 hover:text-white text-xs px-3 py-1.5 rounded-md border border-[#1f1f2e] hover:border-[#2f2f3e] transition-colors"
        >
          Učitaj primjer
        </button>
        <div className="flex items-center gap-2 text-xs">
          <label className="text-zinc-500">Max po runu:</label>
          <input
            type="number"
            min={1}
            max={20}
            value={maxPerRun}
            onChange={(e) => setMaxPerRun(parseInt(e.target.value) || 2)}
            className="w-16 bg-[#0a0a0f] border border-[#1f1f2e] rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-600"
          />
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label className="text-zinc-500">Threshold:</label>
          <input
            type="number"
            min={1}
            max={10}
            value={qualityThreshold}
            onChange={(e) => setQualityThreshold(parseInt(e.target.value) || 6)}
            className="w-16 bg-[#0a0a0f] border border-[#1f1f2e] rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-600"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={autoGenerate} onChange={(e) => setAutoGenerate(e.target.checked)} className="accent-blue-600" />
          auto-gen
        </label>
        <label className="flex items-center gap-1.5 text-xs text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={autoSchedule} onChange={(e) => setAutoSchedule(e.target.checked)} className="accent-blue-600" />
          auto-zakaži
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        {error && <p className="text-red-400 text-xs flex-1">{error}</p>}
        <button
          onClick={submit}
          disabled={loading}
          className="ml-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-md transition-colors flex items-center gap-2"
        >
          {loading && <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          {loading ? "Kreiram…" : "Kreiraj briefove"}
        </button>
      </div>

      {stats && (
        <div className="rounded-md bg-[#0d0d14] border border-[#1f1f2e] p-3 space-y-2">
          <p className="text-zinc-300 text-sm">
            <span className="text-emerald-400 font-medium">{stats.created} kreirano</span>
            {stats.skipped > 0 && <span className="text-zinc-500"> · {stats.skipped} već postoji</span>}
            {stats.invalid > 0 && <span className="text-amber-400"> · {stats.invalid} nevažeća</span>}
          </p>
          {stats.invalid > 0 && results && (
            <ul className="text-amber-300/80 text-[11px] space-y-0.5">
              {results
                .filter((r) => r.status === "invalid")
                .slice(0, 5)
                .map((r, i) => (
                  <li key={i}>· "{r.line}" — {r.reason}</li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
