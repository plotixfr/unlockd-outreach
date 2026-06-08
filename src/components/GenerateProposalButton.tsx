"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

/**
 * One-shot trigger for proposal generation. Calls the POST endpoint (which
 * has its own maxDuration=60 budget on Vercel), then router.refresh() so
 * the server component re-renders with the now-cached content.
 *
 * Used in the empty-state of /prospects/[id]/proposal. Decoupling
 * generation from render is what stops the page itself from timing out
 * on Vercel Hobby (10s default).
 */
export function GenerateProposalButton({ prospectId }: { prospectId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/prospects/${prospectId}/proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Error");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={generate}
        disabled={loading}
        className="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-medium px-5 py-3 rounded-lg transition-all"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {loading ? "Generating… (up to 30s)" : "Generate proposal"}
      </button>
      {error && <p className="text-red-600 text-xs mt-3">{error}</p>}
    </>
  );
}
