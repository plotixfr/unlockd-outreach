"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface BriefRun {
  id: string;
  startedAt: string;
  status: string;
  found: number;
  created: number;
  qualified: number;
  scheduled: number;
}

interface Brief {
  id: string;
  name: string;
  niche: string;
  city: string | null;
  country: string;
  query: string | null;
  minRating: number | null;
  minReviews: number | null;
  maxPerRun: number;
  qualityThreshold: number;
  autoGenerate: boolean;
  autoSchedule: boolean;
  active: boolean;
  lastRunAt: string | null;
  totalDiscovered: number;
  totalQualified: number;
  _count: { prospects: number };
  runs: BriefRun[];
}

interface RunSummary {
  briefId: string;
  briefName: string;
  found: number;
  created: number;
  qualified: number;
  scheduled: number;
  errors: string[];
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BriefsEditor({ discoveryConfigured }: { discoveryConfigured: boolean }) {
  const router = useRouter();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<RunSummary | null>(null);
  const [form, setForm] = useState({
    name: "",
    niche: "",
    city: "",
    country: "FR",
    query: "",
    minRating: "",
    minReviews: "",
    maxPerRun: 5,
    qualityThreshold: 6,
    autoGenerate: true,
    autoSchedule: true,
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/briefs");
      const data: { briefs: Brief[] } = await res.json();
      setBriefs(data.briefs);
    } catch {
      setError("Greška učitavanja");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    if (!form.name.trim() || !form.niche.trim()) {
      setError("name i niche su obavezni");
      return;
    }
    setError("");
    try {
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          niche: form.niche.trim(),
          city: form.city.trim() || null,
          country: form.country.trim() || "FR",
          query: form.query.trim() || null,
          minRating: form.minRating ? parseFloat(form.minRating) : null,
          minReviews: form.minReviews ? parseInt(form.minReviews, 10) : null,
          maxPerRun: form.maxPerRun,
          qualityThreshold: form.qualityThreshold,
          autoGenerate: form.autoGenerate,
          autoSchedule: form.autoSchedule,
        }),
      });
      const data: { brief?: Brief; error?: string } = await res.json();
      if (!res.ok || !data.brief) throw new Error(data.error || "Greška");
      setForm({
        name: "",
        niche: "",
        city: "",
        country: "FR",
        query: "",
        minRating: "",
        minReviews: "",
        maxPerRun: 5,
        qualityThreshold: 6,
        autoGenerate: true,
        autoSchedule: true,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    }
  };

  const runBrief = async (briefId: string) => {
    setRunning(briefId);
    setError("");
    setLastSummary(null);
    try {
      const res = await fetch("/api/autopilot/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefId }),
      });
      const data: { summary?: RunSummary; error?: string } = await res.json();
      if (!res.ok || !data.summary) throw new Error(data.error || "Run failed");
      setLastSummary(data.summary);
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    } finally {
      setRunning(null);
    }
  };

  const toggleActive = async (brief: Brief) => {
    try {
      await fetch(`/api/briefs/${brief.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !brief.active }),
      });
      setBriefs((prev) => prev.map((b) => (b.id === brief.id ? { ...b, active: !b.active } : b)));
    } catch {
      setError("Greška ažuriranja");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Obrisati brief? Postojeći prospekti ostaju u bazi.")) return;
    try {
      await fetch(`/api/briefs/${id}`, { method: "DELETE" });
      setBriefs((prev) => prev.filter((b) => b.id !== id));
    } catch {
      setError("Greška brisanja");
    }
  };

  return (
    <div className="space-y-6">
      {!discoveryConfigured && (
        <div className="rounded-xl bg-amber-950/30 border border-amber-700/40 p-4">
          <p className="text-amber-300 font-medium text-sm">⚠ GOOGLE_PLACES_API_KEY nije postavljen</p>
          <p className="text-amber-200/70 text-xs mt-1">
            Briefovi se mogu kreirati i čuvati, ali discovery neće raditi dok ne postaviš ključ u Vercel Env.
            Free quota: ~5k Text Searches/mjesec.
          </p>
        </div>
      )}

      {/* New brief form */}
      <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] card-elevation p-6 space-y-4">
        <h2 className="text-white font-medium">Novi brief</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Naziv brief-a (npr. 'Premium hoteli Paris')"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <input
            type="text"
            placeholder="Niša (npr. 'Hotel')"
            value={form.niche}
            onChange={(e) => setForm({ ...form, niche: e.target.value })}
            className="bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <input
            type="text"
            placeholder="Grad (opcionalno)"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            className="bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <input
            type="text"
            placeholder="Country code (FR / IT / MC)"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
            className="bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <input
            type="text"
            placeholder="Custom query (override — opcionalno)"
            value={form.query}
            onChange={(e) => setForm({ ...form, query: e.target.value })}
            className="sm:col-span-2 bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <input
            type="number"
            min={0}
            max={5}
            step={0.1}
            placeholder="Min rating (0–5)"
            value={form.minRating}
            onChange={(e) => setForm({ ...form, minRating: e.target.value })}
            className="bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <input
            type="number"
            min={0}
            placeholder="Min broj recenzija"
            value={form.minReviews}
            onChange={(e) => setForm({ ...form, minReviews: e.target.value })}
            className="bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <div>
            <label className="block text-zinc-500 text-[11px] uppercase tracking-wider mb-1">Max po runu (1–20)</label>
            <input
              type="number"
              min={1}
              max={20}
              value={form.maxPerRun}
              onChange={(e) => setForm({ ...form, maxPerRun: parseInt(e.target.value) || 5 })}
              className="w-full bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
          <div>
            <label className="block text-zinc-500 text-[11px] uppercase tracking-wider mb-1">Quality threshold (1–10)</label>
            <input
              type="number"
              min={1}
              max={10}
              value={form.qualityThreshold}
              onChange={(e) => setForm({ ...form, qualityThreshold: parseInt(e.target.value) || 6 })}
              className="w-full bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 pt-2">
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoGenerate}
              onChange={(e) => setForm({ ...form, autoGenerate: e.target.checked })}
              className="accent-emerald-500"
            />
            Auto-generiši emailove
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoSchedule}
              onChange={(e) => setForm({ ...form, autoSchedule: e.target.checked })}
              className="accent-emerald-500"
            />
            Auto-zakaži kampanju
          </label>
        </div>
        <div className="flex items-center justify-between gap-3">
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            onClick={create}
            className="ml-auto bg-emerald-500 hover:bg-emerald-400 text-white text-sm px-4 py-2 rounded-md transition-colors"
          >
            + Dodaj brief
          </button>
        </div>
      </div>

      {/* Last run summary */}
      {lastSummary && (
        <div className="rounded-xl bg-emerald-950/30 border border-emerald-700/40 p-4">
          <p className="text-emerald-300 font-medium text-sm">
            ✓ {lastSummary.briefName}: pronađeno {lastSummary.found}, kreirano {lastSummary.created}, qualified {lastSummary.qualified}, zakazano {lastSummary.scheduled}
          </p>
          {lastSummary.errors.length > 0 && (
            <ul className="mt-2 text-amber-300 text-xs space-y-0.5">
              {lastSummary.errors.slice(0, 5).map((e, i) => <li key={i}>· {e}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Briefs list */}
      <div className="space-y-3">
        <h2 className="text-white font-medium">Aktivni briefovi</h2>
        {loading ? (
          <p className="text-zinc-500 text-sm">Učitavam…</p>
        ) : briefs.length === 0 ? (
          <p className="text-zinc-600 text-sm">Nema brief-ova. Dodaj prvi iznad.</p>
        ) : (
          briefs.map((b) => (
            <div
              key={b.id}
              className={`rounded-xl border p-5 ${b.active ? "bg-[#111118] border-[#1f1f2e]" : "bg-[#0a0a0f] border-[#1a1a28] opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-medium">{b.name}</p>
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-950/60 text-blue-300">
                      {b.niche}
                    </span>
                    {b.city && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                        {b.city}
                      </span>
                    )}
                    {b.minRating && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300">
                        ≥{b.minRating}★
                      </span>
                    )}
                    {b.minReviews && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300">
                        ≥{b.minReviews} avis
                      </span>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300">
                      score≥{b.qualityThreshold}
                    </span>
                    {b.autoGenerate && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300">
                        auto-gen
                      </span>
                    )}
                    {b.autoSchedule && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300">
                        auto-zakaži
                      </span>
                    )}
                  </div>
                  <p className="text-zinc-500 text-xs mt-2">
                    {b._count.prospects} prospekata · {b.totalQualified} qualified · zadnji run {fmtDate(b.lastRunAt)}
                  </p>
                  {b.runs[0] && (
                    <p className="text-zinc-600 text-xs mt-1">
                      Posljednji run: pronađeno {b.runs[0].found}, kreirano {b.runs[0].created}, qualified {b.runs[0].qualified}, zakazano {b.runs[0].scheduled}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => runBrief(b.id)}
                    disabled={running === b.id || !discoveryConfigured}
                    className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
                  >
                    {running === b.id && (
                      <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {running === b.id ? "Tražim…" : "▶ Pokreni"}
                  </button>
                  <button
                    onClick={() => toggleActive(b)}
                    className={`text-xs px-2 py-1.5 rounded-md transition-colors ${
                      b.active ? "text-emerald-400 hover:text-emerald-300" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {b.active ? "ON" : "OFF"}
                  </button>
                  <button
                    onClick={() => remove(b.id)}
                    className="text-xs text-red-500 hover:text-red-400 transition-colors px-2 py-1.5"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
