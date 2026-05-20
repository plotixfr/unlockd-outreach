"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  prospectId: string;
  hasEmails: boolean;
}

export function GenerateEmailsButton({ prospectId, hasEmails }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const generate = async (regenerate: boolean) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/emails/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId, regenerate }),
      });
      let data: { error?: string } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error("Error generisanju emailova — pokušajte ponovo");
      }
      if (!res.ok) throw new Error(data.error || "Error generisanju emailova");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error generisanju emailova");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-red-400 text-xs">{error}</span>}
      {!hasEmails ? (
        <button
          onClick={() => generate(false)}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          {loading && (
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {loading ? "Générer..." : "Generate emailove"}
        </button>
      ) : (
        <button
          onClick={() => generate(true)}
          disabled={loading}
          className="border border-[#1f1f2e] hover:border-zinc-600 text-zinc-400 hover:text-white text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          {loading && (
            <span className="inline-block w-3.5 h-3.5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          )}
          {loading ? "Génération..." : "Regeneriši"}
        </button>
      )}
    </div>
  );
}
