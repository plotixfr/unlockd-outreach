"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUSI, STATUS_BOJE } from "@/lib/constants";

interface Props {
  prospectId: string;
  currentStatus: string;
}

export function StatusSelector({ prospectId, currentStatus }: Props) {
  const [status, setStatus] = useState(currentStatus);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const handleChange = async (newStatus: string) => {
    setSaving(true);
    setStatus(newStatus);
    try {
      await fetch(`/api/prospects/${prospectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {saving && (
        <span className="inline-block w-3.5 h-3.5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
      )}
      <select
        value={status}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className={`text-xs font-medium px-3 py-1.5 rounded-full border-0 outline-none cursor-pointer appearance-none ${STATUS_BOJE[status] ?? "bg-zinc-700 text-zinc-200"}`}
      >
        {STATUSI.map((s) => (
          <option key={s} value={s} className="bg-[#111118] text-zinc-200">
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
