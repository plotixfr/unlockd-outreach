"use client";

import { useEffect, useState } from "react";

interface Template {
  nisa: string;
  promptHint: string;
}

interface ActiveNiche {
  nisa: string;
  count: number;
}

export function NicheTemplatesEditor() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeNiches, setActiveNiches] = useState<ActiveNiche[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [nisa, setNisa] = useState("");
  const [hint, setHint] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/niches");
      const data = await res.json();
      setTemplates(data.templates ?? []);
      setActiveNiches(data.activeNiches ?? []);
    } catch {
      setError("Load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (t: Template) => {
    setEditing(t.nisa);
    setNisa(t.nisa);
    setHint(t.promptHint);
    setError("");
  };

  const startNew = () => {
    setEditing("__new__");
    setNisa("");
    setHint("");
    setError("");
  };

  const cancel = () => {
    setEditing(null);
    setNisa("");
    setHint("");
    setError("");
  };

  const save = async () => {
    if (!nisa.trim() || !hint.trim()) {
      setError("Niche and hint are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/niches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nisa: nisa.trim(), promptHint: hint.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error");
      cancel();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (n: string) => {
    if (!confirm(`Delete hint for "${n}"?`)) return;
    try {
      const res = await fetch(`/api/niches?nisa=${encodeURIComponent(n)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  };

  const templatedNiches = new Set(templates.map((t) => t.nisa));
  const niseBezHinta = activeNiches.filter((n) => !templatedNiches.has(n.nisa));

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[var(--text)] font-semibold">Per-niche hints for Claude</h2>
          <p className="text-[var(--text-muted)] text-xs mt-0.5">
            Extra instructions appended to the prompt for each niche (e.g. for &quot;Avocat&quot;: &quot;don&apos;t mention &apos;site web&apos; — focus on &apos;présence digitale conforme RGPD&apos;&quot;).
          </p>
        </div>
        {editing !== "__new__" && (
          <button onClick={startNew} className="btn-primary text-xs px-3 py-1.5">
            + New hint
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-[var(--text-muted)] text-sm">Loading…</p>
      ) : (
        <>
          {editing && (
            <div className="rounded-lg bg-[var(--bg)] border border-[var(--border)] p-4 space-y-3">
              <div>
                <label className="block section-label mb-1">Niche</label>
                {editing === "__new__" ? (
                  <input
                    type="text"
                    value={nisa}
                    onChange={(e) => setNisa(e.target.value)}
                    placeholder="e.g. Avocat, Spa, Boutique de luxe…"
                    list="active-niches"
                    className="w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                ) : (
                  <p className="text-[var(--text)] text-sm font-mono">{nisa}</p>
                )}
                <datalist id="active-niches">
                  {activeNiches.map((n) => (
                    <option key={n.nisa} value={n.nisa} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block section-label mb-1">Hint for Claude</label>
                <textarea
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  rows={5}
                  placeholder="Specific instructions for this sector — tone, vocabulary, examples, what to avoid…"
                  className="w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-y"
                />
              </div>
              {error && <p className="text-red-600 text-xs">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="btn-primary text-xs px-3 py-1.5"
                >
                  {saving && (
                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {saving ? "Saving..." : "Save"}
                </button>
                <button onClick={cancel} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {templates.length > 0 && (
            <div className="space-y-2">
              {templates.map((t) => (
                <div key={t.nisa} className="rounded-lg bg-white border border-[var(--border)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[var(--text)] text-sm font-medium">{t.nisa}</p>
                      <p className="text-[var(--text-muted)] text-xs mt-1 line-clamp-2">{t.promptHint}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-[var(--text-muted)] hover:text-[var(--text)] text-xs transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(t.nisa)}
                        className="text-red-600 hover:text-red-700 text-xs transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {niseBezHinta.length > 0 && (
            <div className="pt-2 etch-top">
              <p className="text-[var(--text-muted)] text-xs mb-2">
                Niches in the database without a hint (these use the default prompt):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {niseBezHinta.map((n) => (
                  <button
                    key={n.nisa}
                    onClick={() => {
                      setEditing("__new__");
                      setNisa(n.nisa);
                      setHint("");
                      setError("");
                    }}
                    className="text-xs px-2 py-1 rounded bg-zinc-100 border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-colors"
                  >
                    {n.nisa} ({n.count})
                  </button>
                ))}
              </div>
            </div>
          )}

          {templates.length === 0 && niseBezHinta.length === 0 && (
            <p className="text-[var(--text-muted)] text-sm">No niches in the database yet. Upload a CSV to start.</p>
          )}
        </>
      )}
    </div>
  );
}
