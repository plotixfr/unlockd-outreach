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
        throw new Error(d.error || "Greška pri brisanju");
      }
      if (redirectAfter) {
        router.push("/prospects");
      } else {
        router.refresh();
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Greška");
    } finally {
      setLoading(false);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-red-400 hover:text-red-300 text-sm px-3 py-2 rounded-lg hover:bg-red-950/40 transition-colors"
      >
        Obriši
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111118] border border-[#1f1f2e] rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-white font-semibold mb-2">Obriši prospekta</h3>
            <p className="text-zinc-400 text-sm mb-6">
              Da li ste sigurni da želite obrisati{" "}
              <span className="text-white font-medium">{firmaNaziv}</span>?
              Ovo će obrisati i sve generisane emailove. Akcija se ne može poništiti.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white border border-[#1f1f2e] rounded-lg hover:bg-[#1a1a28] transition-colors"
              >
                Odustani
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {loading && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {loading ? "Brisanje..." : "Da, obriši"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
