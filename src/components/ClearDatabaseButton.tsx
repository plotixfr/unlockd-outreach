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
      <p className="text-emerald-700 text-sm">
        Deleted: {done.prospects} prospects (with their emails/replies/notes), {done.discoveryRuns} discovery runs. Briefs, case studies and niche templates were kept.
      </p>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 text-sm bg-white hover:bg-red-100 text-red-700 border border-red-300 rounded-lg font-semibold transition-colors"
      >
        Clear all prospects
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm">
          <div className="card p-6 max-w-sm w-full mx-4">
            <h3 className="text-[var(--text)] font-semibold mb-2">Delete all prospect data</h3>
            <p className="text-[var(--text-secondary)] text-sm mb-6">
              This will permanently delete{" "}
              <span className="text-red-600 font-medium">all prospects and all emails</span>.
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleClear}
                disabled={loading}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {loading && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {loading ? "Deleting…" : "Yes, delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
