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
        throw new Error("Email generation failed — try again");
      }
      if (!res.ok) throw new Error(data.error || "Email generation failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Email generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-red-600 text-xs">{error}</span>}
      {!hasEmails ? (
        <button
          onClick={() => generate(false)}
          disabled={loading}
          className="btn-primary text-sm"
        >
          {loading && (
            <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {loading ? "Generating…" : "Generate emails"}
        </button>
      ) : (
        <button
          onClick={() => generate(true)}
          disabled={loading}
          className="btn-secondary text-sm"
        >
          {loading && (
            <span className="inline-block w-3.5 h-3.5 border-2 border-zinc-300 border-t-zinc-500 rounded-full animate-spin" />
          )}
          {loading ? "Regenerating…" : "Regenerate"}
        </button>
      )}
    </div>
  );
}
