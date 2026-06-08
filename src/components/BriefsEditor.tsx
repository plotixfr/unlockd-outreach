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
  source: string;
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
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const EMPTY_FORM = {
  name: "",
  niche: "",
  city: "",
  country: "FR",
  source: "google_places" as "google_places" | "sirene_api",
  query: "",
  minRating: "",
  minReviews: "",
  maxPerRun: 3,
  qualityThreshold: 6,
  autoGenerate: true,
  autoSchedule: true,
};

export function BriefsEditor({ discoveryConfigured }: { discoveryConfigured: boolean }) {
  const router = useRouter();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<RunSummary | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/briefs");
      const data: { briefs: Brief[] } = await res.json();
      setBriefs(data.briefs);
    } catch {
      setError("Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    if (!form.name.trim() || !form.niche.trim()) {
      setError("Name and niche are required");
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
          source: form.source,
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
      if (!res.ok || !data.brief) throw new Error(data.error || "Error");
      setForm(EMPTY_FORM);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
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
      setError(e instanceof Error ? e.message : "Error");
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
      setError("Update failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this brief? Existing prospects stay in the database.")) return;
    try {
      await fetch(`/api/briefs/${id}`, { method: "DELETE" });
      setBriefs((prev) => prev.filter((b) => b.id !== id));
    } catch {
      setError("Delete failed");
    }
  };

  const groupA = briefs.filter((b) => b.source === "google_places");
  const groupB = briefs.filter((b) => b.source === "sirene_api");
  const other = briefs.filter((b) => b.source !== "google_places" && b.source !== "sirene_api");

  return (
    <div className="space-y-6">
      {!discoveryConfigured && (
        <div className="rounded-xl bg-amber-950/30 border border-amber-700/40 p-4">
          <p className="text-amber-300 font-medium text-sm">⚠ GOOGLE_PLACES_API_KEY not set</p>
          <p className="text-amber-200/70 text-xs mt-1">
            Briefs can be created and saved, but Group A discovery (Google Places) won&apos;t run until the key is in Vercel Env.
            Group B briefs (Sirene gov registry) require no key and will run regardless. Free Places quota: ~5k Text Searches/month.
          </p>
        </div>
      )}

      {/* New brief form */}
      <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] card-elevation p-6 space-y-4">
        <h2 className="text-white font-medium">New brief</h2>

        {/* Source selector — drives which adapter runs */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setForm({ ...form, source: "google_places" })}
            className={`flex-1 text-left rounded-lg border p-3 transition-colors ${
              form.source === "google_places"
                ? "bg-emerald-500/10 border-emerald-500/40 text-white"
                : "bg-[#07070b] border-[#1c1c28] text-zinc-400 hover:border-zinc-700"
            }`}
          >
            <p className="text-sm font-medium">Group A — Google Places</p>
            <p className="text-[11px] mt-0.5 opacity-80">B2B services: consultancies, law firms, accountants, agencies</p>
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, source: "sirene_api" })}
            className={`flex-1 text-left rounded-lg border p-3 transition-colors ${
              form.source === "sirene_api"
                ? "bg-sky-500/10 border-sky-500/40 text-white"
                : "bg-[#07070b] border-[#1c1c28] text-zinc-400 hover:border-zinc-700"
            }`}
          >
            <p className="text-sm font-medium">Group B — Sirene (gov, free)</p>
            <p className="text-[11px] mt-0.5 opacity-80">FR tech startups / SaaS — filter by NAF code, no API key</p>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder={form.source === "sirene_api" ? "Brief name (e.g. 'Tech startups Paris')" : "Brief name (e.g. 'Consulting firms Paris')"}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <input
            type="text"
            placeholder={form.source === "sirene_api" ? "NAF codes (e.g. '62.01Z,73.11Z')" : "Niche (e.g. 'cabinet de conseil')"}
            value={form.niche}
            onChange={(e) => setForm({ ...form, niche: e.target.value })}
            className="bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <input
            type="text"
            placeholder={form.source === "sirene_api" ? "City (Paris, Lyon, Marseille...)" : "City (optional)"}
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
            placeholder="Custom query (override — optional)"
            value={form.query}
            onChange={(e) => setForm({ ...form, query: e.target.value })}
            className="sm:col-span-2 bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          {form.source === "google_places" && (
            <>
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
                placeholder="Min review count"
                value={form.minReviews}
                onChange={(e) => setForm({ ...form, minReviews: e.target.value })}
                className="bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
            </>
          )}
          <div>
            <label className="block text-zinc-500 text-[11px] uppercase tracking-wider mb-1">Max per run (1–20)</label>
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
            Auto-generate emails
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.autoSchedule}
              onChange={(e) => setForm({ ...form, autoSchedule: e.target.checked })}
              className="accent-emerald-500"
            />
            Auto-schedule campaign
          </label>
        </div>
        <div className="flex items-center justify-between gap-3">
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            onClick={create}
            className="ml-auto bg-emerald-500 hover:bg-emerald-400 text-white text-sm px-4 py-2 rounded-md transition-colors"
          >
            + Add brief
          </button>
        </div>
      </div>

      {/* Last run summary */}
      {lastSummary && (
        <div className="rounded-xl bg-emerald-950/30 border border-emerald-700/40 p-4">
          <p className="text-emerald-300 font-medium text-sm">
            ✓ {lastSummary.briefName}: found {lastSummary.found}, created {lastSummary.created}, qualified {lastSummary.qualified}, scheduled {lastSummary.scheduled}
          </p>
          {lastSummary.errors.length > 0 && (
            <ul className="mt-2 text-amber-300 text-xs space-y-0.5">
              {lastSummary.errors.slice(0, 5).map((e, i) => <li key={i}>· {e}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Briefs list — visually grouped by source */}
      {loading ? (
        <p className="text-zinc-500 text-sm">Loading…</p>
      ) : briefs.length === 0 ? (
        <p className="text-zinc-600 text-sm">No briefs yet. Add one above or hit Quick Setup.</p>
      ) : (
        <div className="space-y-6">
          {groupA.length > 0 && <BriefGroup label="Group A — B2B services (Google Places)" tone="emerald" briefs={groupA} running={running} discoveryConfigured={discoveryConfigured} onRun={runBrief} onToggle={toggleActive} onRemove={remove} />}
          {groupB.length > 0 && <BriefGroup label="Group B — FR tech startups (Sirene)" tone="sky" briefs={groupB} running={running} discoveryConfigured={true /* Sirene needs no key */} onRun={runBrief} onToggle={toggleActive} onRemove={remove} />}
          {other.length > 0 && <BriefGroup label="Other" tone="neutral" briefs={other} running={running} discoveryConfigured={discoveryConfigured} onRun={runBrief} onToggle={toggleActive} onRemove={remove} />}
        </div>
      )}
    </div>
  );
}

function BriefGroup({
  label,
  tone,
  briefs,
  running,
  discoveryConfigured,
  onRun,
  onToggle,
  onRemove,
}: {
  label: string;
  tone: "emerald" | "sky" | "neutral";
  briefs: Brief[];
  running: string | null;
  discoveryConfigured: boolean;
  onRun: (id: string) => void;
  onToggle: (b: Brief) => void;
  onRemove: (id: string) => void;
}) {
  const labelColor = { emerald: "text-emerald-300", sky: "text-sky-300", neutral: "text-zinc-300" }[tone];
  return (
    <div className="space-y-3">
      <h3 className={`text-xs uppercase tracking-widest font-semibold ${labelColor}`}>{label} · {briefs.length}</h3>
      {briefs.map((b) => (
        <div
          key={b.id}
          className={`rounded-xl border p-5 ${b.active ? "bg-[#111118] border-[#1f1f2e]" : "bg-[#0a0a0f] border-[#1a1a28] opacity-60"}`}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-white font-medium">{b.name}</p>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-950/60 text-blue-300">
                  {b.niche.length > 30 ? b.niche.slice(0, 30) + "…" : b.niche}
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
                    ≥{b.minReviews} reviews
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
                    auto-schedule
                  </span>
                )}
              </div>
              <p className="text-zinc-500 text-xs mt-2">
                {b._count.prospects} prospects · {b.totalQualified} qualified · last run {fmtDate(b.lastRunAt)}
              </p>
              {b.runs[0] && (
                <p className="text-zinc-600 text-xs mt-1">
                  Latest: found {b.runs[0].found}, created {b.runs[0].created}, qualified {b.runs[0].qualified}, scheduled {b.runs[0].scheduled}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onRun(b.id)}
                disabled={running === b.id || !discoveryConfigured}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
              >
                {running === b.id && (
                  <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {running === b.id ? "Running…" : "▶ Run"}
              </button>
              <button
                onClick={() => onToggle(b)}
                className={`text-xs px-2 py-1.5 rounded-md transition-colors ${
                  b.active ? "text-emerald-400 hover:text-emerald-300" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {b.active ? "ON" : "OFF"}
              </button>
              <button
                onClick={() => onRemove(b.id)}
                className="text-xs text-red-500 hover:text-red-400 transition-colors px-2 py-1.5"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
