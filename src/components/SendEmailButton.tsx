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
      <span className="text-xs bg-emerald-900 text-emerald-300 px-2.5 py-1 rounded-full font-medium">
        Poslano ✓
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
      if (!res.ok) throw new Error(data.error || "Greška pri slanju");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-red-400 text-xs">{error}</span>}
      <button
        onClick={send}
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
      >
        {loading && (
          <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        )}
        {loading ? "Šaljem..." : "Pošalji"}
      </button>
    </div>
  );
}
