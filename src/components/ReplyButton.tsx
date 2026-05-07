"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  prospectId: string;
  currentStatus: string;
}

export function ReplyButton({ prospectId, currentStatus }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  if (currentStatus === "Replied" || currentStatus === "Converted" || currentStatus === "Unsubscribed") {
    return null;
  }

  if (done) {
    return (
      <div className="rounded-lg bg-emerald-950/40 border border-emerald-800/40 px-4 py-3 text-emerald-300 text-sm">
        Kampanja zaustavljena — prospect je odgovorio ✓
      </div>
    );
  }

  const handleReply = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/reply`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Greška");
      setDone(true);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Greška");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleReply}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-400 hover:text-emerald-300 border border-emerald-800/40 rounded-lg transition-colors disabled:opacity-50"
    >
      {loading && (
        <span className="inline-block w-3.5 h-3.5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
      )}
      {loading ? "..." : "Označi kao odgovoreno"}
    </button>
  );
}
