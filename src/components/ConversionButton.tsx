"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  prospectId: string;
  currentStatus: string;
}

export function ConversionButton({ prospectId, currentStatus }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [vrijednost, setVrijednost] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [napomena, setNapomena] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  if (currentStatus === "Converted") return null;

  const inputCls =
    "w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors";

  const labelCls =
    "block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5";

  const handleSave = async () => {
    setError("");
    const val = parseFloat(vrijednost);
    if (!val || val <= 0) {
      setError("Enter a project value");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/conversion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vrijednostProjekta: val, datumKonverzije: datum, napomena }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Error");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-colors"
      >
        Mark as converted
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm">
          <div className="card p-6 max-w-md w-full mx-4 shadow-xl space-y-5">
            <div>
              <h3 className="text-[var(--text)] font-semibold">Conversion</h3>
              <p className="text-[var(--text-muted)] text-sm mt-1">Enter project details</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className={labelCls}>
                  Project value (EUR) *
                </label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={vrijednost}
                  onChange={(e) => setVrijednost(e.target.value)}
                  placeholder="e.g. 4500"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Conversion date
                </label>
                <input
                  type="date"
                  value={datum}
                  onChange={(e) => setDatum(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>
                  Note (optional)
                </label>
                <textarea
                  rows={2}
                  value={napomena}
                  onChange={(e) => setNapomena(e.target.value)}
                  placeholder="Project type, context..."
                  className={inputCls + " resize-none"}
                />
              </div>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="btn-primary"
              >
                {loading && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {loading ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
