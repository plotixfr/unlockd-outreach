"use client";

import { useEffect, useState } from "react";

interface CaseStudy {
  id: string;
  title: string;
  nisa: string;
  summary: string;
  metricLabel: string | null;
  metricValue: string | null;
  imageUrl: string | null;
  active: boolean;
}

/**
 * CRUD editor for case studies. Each item is keyed to a niche; the email
 * generator pulls the most recently updated active study for the prospect's
 * niche and feeds it to Claude as "preuve sociale concrète à mentionner".
 */
export function CaseStudiesEditor() {
  const [items, setItems] = useState<CaseStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    nisa: "",
    summary: "",
    metricLabel: "",
    metricValue: "",
    imageUrl: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/case-studies");
      const data: { items: CaseStudy[] } = await res.json();
      setItems(data.items);
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
    if (!form.title.trim() || !form.nisa.trim() || !form.summary.trim()) {
      setError("title, niša i opis su obavezni");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/case-studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data: { item?: CaseStudy; error?: string } = await res.json();
      if (!res.ok || !data.item) throw new Error(data.error || "Error");
      setItems((prev) => [data.item!, ...prev]);
      setForm({ title: "", nisa: "", summary: "", metricLabel: "", metricValue: "", imageUrl: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (item: CaseStudy) => {
    try {
      await fetch(`/api/case-studies/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !item.active }),
      });
      setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, active: !x.active } : x)));
    } catch {
      setError("Update failed");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this case study?")) return;
    try {
      await fetch(`/api/case-studies/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch {
      setError("Delete failed");
    }
  };

  return (
    <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6 space-y-5">
      <div>
        <h2 className="text-white font-medium">Case studies</h2>
        <p className="text-zinc-500 text-xs mt-1">
          Koristi se kao &ldquo;preuve sociale&rdquo; u follow-up #2. Generator bira najnoviji aktivni case study koji odgovara niši prospekta.
        </p>
      </div>

      {/* New case study */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#1f1f2e]">
        <input
          type="text"
          placeholder="Title (npr. 'Hôtel La Pinède — refonte 2025')"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="bg-[#0a0a0f] border border-[#1f1f2e] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600"
        />
        <input
          type="text"
          placeholder="Niche (npr. 'Hotel')"
          value={form.nisa}
          onChange={(e) => setForm({ ...form, nisa: e.target.value })}
          className="bg-[#0a0a0f] border border-[#1f1f2e] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600"
        />
        <textarea
          placeholder="Kratki opis (na francuskom — koristi se direktno u promptu)"
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
          rows={2}
          className="sm:col-span-2 bg-[#0a0a0f] border border-[#1f1f2e] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600"
        />
        <input
          type="text"
          placeholder="Metric label (npr. 'réservations directes en 3 mois')"
          value={form.metricLabel}
          onChange={(e) => setForm({ ...form, metricLabel: e.target.value })}
          className="bg-[#0a0a0f] border border-[#1f1f2e] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600"
        />
        <input
          type="text"
          placeholder="Metric value (npr. '+47%')"
          value={form.metricValue}
          onChange={(e) => setForm({ ...form, metricValue: e.target.value })}
          className="bg-[#0a0a0f] border border-[#1f1f2e] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600"
        />
        <input
          type="url"
          placeholder="Image URL (opcionalno)"
          value={form.imageUrl}
          onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
          className="sm:col-span-2 bg-[#0a0a0f] border border-[#1f1f2e] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600"
        />
      </div>
      <div className="flex justify-between items-center">
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button
          onClick={create}
          disabled={creating}
          className="ml-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-md transition-colors"
        >
          {creating ? "Dodajem…" : "+ Dodaj case study"}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-zinc-500 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-zinc-600 text-sm pt-3 border-t border-[#1f1f2e]">
          Još nema case studies. Dodaj barem jedan po niši — drastično podiže follow-up #2.
        </p>
      ) : (
        <div className="space-y-2 pt-3 border-t border-[#1f1f2e]">
          {items.map((item) => (
            <div
              key={item.id}
              className={`rounded-md border p-3 ${item.active ? "bg-[#0d0d14] border-[#1f1f2e]" : "bg-[#0a0a0f] border-[#1a1a28] opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-zinc-200 text-sm font-medium">{item.title}</p>
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-950/60 text-blue-300">
                      {item.nisa}
                    </span>
                    {item.metricValue && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 font-medium">
                        {item.metricValue} {item.metricLabel ?? ""}
                      </span>
                    )}
                  </div>
                  <p className="text-zinc-400 text-xs mt-1 leading-relaxed">{item.summary}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    onClick={() => toggleActive(item)}
                    className={`text-[11px] px-2 py-0.5 rounded-md transition-colors ${
                      item.active
                        ? "text-emerald-400 hover:text-emerald-300"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {item.active ? "Aktivan" : "Pauziran"}
                  </button>
                  <button
                    onClick={() => remove(item.id)}
                    className="text-[11px] text-red-500 hover:text-red-400 transition-colors px-2 py-0.5"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
