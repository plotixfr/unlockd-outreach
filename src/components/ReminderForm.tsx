"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  prospectId: string;
  initialDatum: Date | null;
  initialNapomena: string | null;
}

export function ReminderForm({ prospectId, initialDatum, initialNapomena }: Props) {
  const [datum, setDatum] = useState(
    initialDatum ? new Date(initialDatum).toISOString().slice(0, 10) : ""
  );
  const [napomena, setNapomena] = useState(initialNapomena ?? "");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const patch = async (d: string | null, n: string | null) => {
    setSaving(true);
    try {
      await fetch(`/api/prospects/${prospectId}/reminder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datum: d, napomena: n }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => patch(datum || null, napomena || null);

  const handleClear = () => {
    setDatum("");
    setNapomena("");
    void patch(null, null);
  };

  return (
    <div className="space-y-3">
      <h2 className="text-white font-medium">Podsjetnik</h2>
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-500 text-xs uppercase tracking-wider mb-1.5">
              Datum
            </label>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600 transition-colors"
            />
          </div>
          <div>
            <label className="block text-zinc-500 text-xs uppercase tracking-wider mb-1.5">
              Napomena
            </label>
            <input
              type="text"
              value={napomena}
              onChange={(e) => setNapomena(e.target.value)}
              placeholder="Kratka napomena…"
              className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-600 transition-colors"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !datum}
            className="text-sm px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
          >
            {saving ? "Čuvam..." : "Sačuvaj podsjetnik"}
          </button>
          {initialDatum && (
            <button
              onClick={handleClear}
              disabled={saving}
              className="text-sm px-4 py-1.5 rounded-lg text-zinc-400 hover:text-white border border-[#1f1f2e] hover:bg-[#1a1a28] transition-colors disabled:opacity-50"
            >
              Obriši
            </button>
          )}
        </div>
        {initialDatum && (
          <p className="text-zinc-500 text-xs">
            Aktivan: {new Date(initialDatum).toLocaleDateString("fr-FR")}
            {initialNapomena ? ` — ${initialNapomena}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
