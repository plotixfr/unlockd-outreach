"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  prospectId: string;
  firmaNaziv: string;
  redirectAfter?: boolean;
}

export function DeleteProspectButton({ prospectId, firmaNaziv, redirectAfter = false }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Delete failed");
      }
      if (redirectAfter) {
        router.push("/prospects");
      } else {
        router.refresh();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-red-600 hover:text-red-700 text-sm font-medium px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
      >
        Delete
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm">
          <div className="card p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-[var(--text)] font-semibold mb-2">Delete prospect</h3>
            <p className="text-[var(--text-secondary)] text-sm mb-6">
              Are you sure you want to delete{" "}
              <span className="text-[var(--text)] font-semibold">{firmaNaziv}</span>?
              This will also delete all generated emails. This cannot be undone.
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
                onClick={handleDelete}
                disabled={loading}
                className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {loading && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {loading ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
