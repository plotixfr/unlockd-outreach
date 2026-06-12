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
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-emerald-700 text-sm font-medium">
        Campaign stopped — prospect replied ✓
      </div>
    );
  }

  const handleReply = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/reply`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Error");
      setDone(true);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleReply}
      disabled={loading}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-colors disabled:opacity-50"
    >
      {loading && (
        <span className="inline-block w-3.5 h-3.5 border-2 border-emerald-700/30 border-t-emerald-700 rounded-full animate-spin" />
      )}
      {loading ? "..." : "Mark as replied"}
    </button>
  );
}
