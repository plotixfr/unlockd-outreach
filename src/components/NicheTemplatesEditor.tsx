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
      setError("Greška pri učitavanju");
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
      setError("Niša i hint su obavezni");
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
      if (!res.ok) throw new Error(data.error || "Greška");
      cancel();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (n: string) => {
    if (!confirm(`Obrisati hint za "${n}"?`)) return;
    try {
      const res = await fetch(`/api/niches?nisa=${encodeURIComponent(n)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Greška");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    }
  };

  const templatedNiches = new Set(templates.map((t) => t.nisa));
  const niseBezHinta = activeNiches.filter((n) => !templatedNiches.has(n.nisa));

  return (
    <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-medium">Per-niche hint za Claude</h2>
          <p className="text-zinc-500 text-xs mt-0.5">
            Ekstra instrukcije koje se dodaju u prompt za svaku nišu (npr. za "Avocat": "ne pominji 'site web' — fokus na 'présence digitale conforme RGPD'").
          </p>
        </div>
        {editing !== "__new__" && (
          <button
            onClick={startNew}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            + Novi hint
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-zinc-600 text-sm">Učitavam...</p>
      ) : (
        <>
          {editing && (
            <div className="rounded-lg bg-[#0a0a0f] border border-[#1f1f2e] p-4 space-y-3">
              <div>
                <label className="block text-zinc-500 text-xs uppercase tracking-wider mb-1">Niša</label>
                {editing === "__new__" ? (
                  <input
                    type="text"
                    value={nisa}
                    onChange={(e) => setNisa(e.target.value)}
                    placeholder="npr. Avocat, Spa, Boutique de luxe…"
                    list="active-niches"
                    className="w-full bg-[#111118] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-600 transition-colors"
                  />
                ) : (
                  <p className="text-zinc-300 text-sm font-mono">{nisa}</p>
                )}
                <datalist id="active-niches">
                  {activeNiches.map((n) => (
                    <option key={n.nisa} value={n.nisa} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-zinc-500 text-xs uppercase tracking-wider mb-1">Hint za Claude</label>
                <textarea
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  rows={5}
                  placeholder="Specifične instrukcije za ovaj sektor — ton, vokabular, primjeri, šta izbjegavati…"
                  className="w-full bg-[#111118] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-600 transition-colors resize-y"
                />
              </div>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={save}
                  disabled={saving}
                  className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-colors flex items-center gap-1.5"
                >
                  {saving && (
                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {saving ? "Snimam..." : "Sačuvaj"}
                </button>
                <button onClick={cancel} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                  Odustani
                </button>
              </div>
            </div>
          )}

          {templates.length > 0 && (
            <div className="space-y-2">
              {templates.map((t) => (
                <div key={t.nisa} className="rounded-lg bg-[#0a0a0f] border border-[#1f1f2e] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-zinc-200 text-sm font-medium">{t.nisa}</p>
                      <p className="text-zinc-500 text-xs mt-1 line-clamp-2">{t.promptHint}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => startEdit(t)}
                        className="text-zinc-500 hover:text-zinc-200 text-xs transition-colors"
                      >
                        Uredi
                      </button>
                      <button
                        onClick={() => remove(t.nisa)}
                        className="text-red-500 hover:text-red-400 text-xs transition-colors"
                      >
                        Obriši
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {niseBezHinta.length > 0 && (
            <div className="pt-2 border-t border-[#1f1f2e]">
              <p className="text-zinc-600 text-xs mb-2">
                Niše u bazi bez hint-a (generišu se sa default-nim promptom):
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
                    className="text-xs px-2 py-1 rounded bg-[#1a1a28] text-zinc-400 hover:text-white hover:bg-[#252535] transition-colors"
                  >
                    {n.nisa} ({n.count})
                  </button>
                ))}
              </div>
            </div>
          )}

          {templates.length === 0 && niseBezHinta.length === 0 && (
            <p className="text-zinc-600 text-sm">Još nema niša u bazi. Uploaduj CSV da počneš.</p>
          )}
        </>
      )}
    </div>
  );
}
