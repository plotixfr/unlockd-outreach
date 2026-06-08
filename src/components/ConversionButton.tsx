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
    "w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-600 transition-colors";

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
        className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-400 hover:text-emerald-300 border border-emerald-800/40 rounded-lg transition-colors"
      >
        Mark as converted
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111118] border border-[#1f1f2e] rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl space-y-5">
            <div>
              <h3 className="text-white font-semibold">Conversion</h3>
              <p className="text-zinc-500 text-sm mt-1">Enter project details</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
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
                <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
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
                <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
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

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white border border-[#1f1f2e] rounded-lg hover:bg-[#1a1a28] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-4 py-2 text-sm bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
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
