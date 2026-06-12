"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, CheckCircle2 } from "lucide-react";

interface Props {
  prospectId: string;
  currentStatus: string;
}

const NEXT_LABEL: Record<string, string> = {
  New: "Send initial",
  Scheduled: "Send initial now",
  Emailed: "Send Follow-1 now",
  Follow1: "Send Follow-2 now",
  Follow2: "Send Follow-3 now",
  Follow3: "Send breakup now",
};

const TERMINAL = new Set(["Replied", "Converted", "Unsubscribed", "Bounced"]);

/**
 * One-click "send the next touch immediately" button. Skips the cron
 * window — useful when a hot prospect opened the email 3 times today and
 * the operator wants to follow up before the prospect's interest cools.
 *
 * Refuses for terminal statuses (Replied/Converted/Unsub/Bounced) and
 * surfaces a clear error if no next email exists yet.
 */
export function SendNextNowButton({ prospectId, currentStatus }: Props) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (TERMINAL.has(currentStatus)) return null;

  const label = NEXT_LABEL[currentStatus] ?? "Send next now";

  const fire = async () => {
    if (busy) return;
    if (!confirm(`Send the next email now? (${label})`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/send-now`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        tip?: string;
        nextStatus?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDone(data.tip ?? "sent");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-600 text-sm px-3 py-2">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Sent · {done}
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col items-end">
      <button
        onClick={fire}
        disabled={busy}
        className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-50"
        title="Bypass the cron — fire the next email now"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        {busy ? "Sending…" : label}
      </button>
      {error && <p className="text-red-600 text-[11px] mt-1 max-w-xs text-right">{error}</p>}
    </div>
  );
}
