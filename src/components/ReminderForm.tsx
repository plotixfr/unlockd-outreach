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

  const inputCls =
    "w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors";

  return (
    <div className="space-y-3">
      <p className="section-label">Reminder</p>
      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5">
              Date
            </label>
            <input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5">
              Note
            </label>
            <input
              type="text"
              value={napomena}
              onChange={(e) => setNapomena(e.target.value)}
              placeholder="Short note…"
              className={inputCls}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !datum}
            className="btn-primary text-sm px-4 py-1.5"
          >
            {saving ? "Saving..." : "Save reminder"}
          </button>
          {initialDatum && (
            <button
              onClick={handleClear}
              disabled={saving}
              className="btn-secondary text-sm px-4 py-1.5"
            >
              Delete
            </button>
          )}
        </div>
        {initialDatum && (
          <p className="text-[var(--text-muted)] text-xs">
            Active: {new Date(initialDatum).toLocaleDateString("en-GB")}
            {initialNapomena ? ` — ${initialNapomena}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
