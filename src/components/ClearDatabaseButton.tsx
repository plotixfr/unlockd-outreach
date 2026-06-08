"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClearDatabaseButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ prospects: number; discoveryRuns: number } | null>(null);
  const router = useRouter();

  const handleClear = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/clear", { method: "DELETE" });
      const data = (await res.json()) as { error?: string; deleted?: { prospects: number; discoveryRuns: number } };
      if (!res.ok) throw new Error(data.error || "Error");
      setDone(data.deleted ?? { prospects: 0, discoveryRuns: 0 });
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  if (done) {
    return (
      <p className="text-emerald-400 text-sm">
        Obrisano: {done.prospects} prospekata (sa emailovima/replyjima/notama), {done.discoveryRuns} discovery runova. Briefovi/case studies/niche templates su sačuvani.
      </p>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 text-sm bg-red-950/60 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-800/40 rounded-lg transition-colors"
      >
        Očisti sve prospekte
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111118] border border-[#1f1f2e] rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-white font-semibold mb-2">Delete cijelu bazu</h3>
            <p className="text-zinc-400 text-sm mb-6">
              This will permanently delete{" "}
              <span className="text-red-400 font-medium">sve prospekte i sve emailove</span>.
              Akcija se ne može poništiti.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white border border-[#1f1f2e] rounded-lg hover:bg-[#1a1a28] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                disabled={loading}
                className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {loading && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {loading ? "Deleting…" : "Da, obriši sve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
