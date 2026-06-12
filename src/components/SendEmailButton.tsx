"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  emailId: string;
  poslat: boolean;
}

export function SendEmailButton({ emailId, poslat }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  if (poslat) {
    return (
      <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
        Sent ✓
      </span>
    );
  }

  const send = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/emails/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-red-600 text-xs">{error}</span>}
      <button
        onClick={send}
        disabled={loading}
        className="btn-primary text-xs px-3 py-1.5"
      >
        {loading && (
          <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
