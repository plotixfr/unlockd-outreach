"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Printer, RefreshCw } from "lucide-react";

/**
 * Action bar for the proposal page (hidden when printing).
 * Print → triggers Chrome's native print dialog.
 * Regenerate → forces a fresh Claude call.
 */
export function ProposalActions({ prospectId }: { prospectId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const regenerate = async () => {
    if (!confirm("Regenerate the proposal? Current content will be replaced.")) return;
    setLoading(true);
    try {
      await fetch(`/api/prospects/${prospectId}/proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={regenerate}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-zinc-600 hover:text-zinc-900 text-xs px-3 py-1.5 rounded-md border border-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        Regeneriši
      </button>
      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
      >
        <Printer className="w-3.5 h-3.5" />
        Print / PDF
      </button>
    </div>
  );
}
