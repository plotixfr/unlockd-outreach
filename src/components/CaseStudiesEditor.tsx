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
      setError("title, niche and summary are required");
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

  const inputCls =
    "bg-white border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors";

  return (
    <div className="card p-6 space-y-5">
      <div>
        <h2 className="text-[var(--text)] font-semibold">Case studies</h2>
        <p className="text-[var(--text-muted)] text-xs mt-1">
          Used as social proof in follow-up #2. The generator picks the most recent active case study matching the prospect&apos;s niche.
        </p>
      </div>

      {/* New case study */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 etch-top">
        <input
          type="text"
          placeholder="Title (e.g. 'Hôtel La Pinède — refonte 2025')"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className={inputCls}
        />
        <input
          type="text"
          placeholder="Niche (e.g. 'Hotel')"
          value={form.nisa}
          onChange={(e) => setForm({ ...form, nisa: e.target.value })}
          className={inputCls}
        />
        <textarea
          placeholder="Short summary (in French — used verbatim in the prompt)"
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
          rows={2}
          className={`sm:col-span-2 ${inputCls}`}
        />
        <input
          type="text"
          placeholder="Metric label (e.g. 'réservations directes en 3 mois')"
          value={form.metricLabel}
          onChange={(e) => setForm({ ...form, metricLabel: e.target.value })}
          className={inputCls}
        />
        <input
          type="text"
          placeholder="Metric value (e.g. '+47%')"
          value={form.metricValue}
          onChange={(e) => setForm({ ...form, metricValue: e.target.value })}
          className={inputCls}
        />
        <input
          type="url"
          placeholder="Image URL (optional)"
          value={form.imageUrl}
          onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
          className={`sm:col-span-2 ${inputCls}`}
        />
      </div>
      <div className="flex justify-between items-center">
        {error && <p className="text-red-600 text-xs">{error}</p>}
        <button
          onClick={create}
          disabled={creating}
          className="btn-primary ml-auto"
        >
          {creating ? "Adding…" : "+ Add case study"}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-[var(--text-muted)] text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[var(--text-muted)] text-sm pt-3 etch-top">
          No case studies yet. Add at least one per niche — significantly lifts follow-up #2.
        </p>
      ) : (
        <div className="space-y-2 pt-3 etch-top">
          {items.map((item) => (
            <div
              key={item.id}
              className={`rounded-md border p-3 ${item.active ? "bg-white border-[var(--border)]" : "bg-[var(--bg)] border-[var(--border)] opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[var(--text)] text-sm font-medium">{item.title}</p>
                    <span className="badge bg-sky-50 text-sky-700 border border-sky-200">
                      {item.nisa}
                    </span>
                    {item.metricValue && (
                      <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {item.metricValue} {item.metricLabel ?? ""}
                      </span>
                    )}
                  </div>
                  <p className="text-[var(--text-secondary)] text-xs mt-1 leading-relaxed">{item.summary}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    onClick={() => toggleActive(item)}
                    className={`text-[11px] px-2 py-0.5 rounded-md transition-colors ${
                      item.active
                        ? "text-emerald-700 hover:text-emerald-800"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    }`}
                  >
                    {item.active ? "Active" : "Paused"}
                  </button>
                  <button
                    onClick={() => remove(item.id)}
                    className="text-[11px] text-red-600 hover:text-red-700 transition-colors px-2 py-0.5"
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
