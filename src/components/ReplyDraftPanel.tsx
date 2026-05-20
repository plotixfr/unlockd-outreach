"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  replyId: string;
  prospectId: string;
  initialDraft: string;
  classification: string | null;
  prospectEmail: string;
}

const LABEL_STYLES: Record<string, string> = {
  Interested: "bg-emerald-950/60 text-emerald-300",
  Question: "bg-blue-950/60 text-blue-300",
  NotNow: "bg-amber-950/60 text-amber-300",
  WrongPerson: "bg-orange-950/60 text-orange-300",
  Negative: "bg-red-950/60 text-red-300",
  Unsubscribe: "bg-red-950/60 text-red-400",
  OutOfOffice: "bg-zinc-800 text-zinc-400",
  AutoReply: "bg-zinc-800 text-zinc-500",
};

const LABEL_BS: Record<string, string> = {
  Interested: "Zainteresovan",
  Question: "Pitanje",
  NotNow: "Možda kasnije",
  WrongPerson: "Pogrešna osoba",
  Negative: "Negativan",
  Unsubscribe: "Odjava",
  OutOfOffice: "Out-of-office",
  AutoReply: "Auto-reply",
};

export function ReplyDraftPanel({ replyId, prospectId, initialDraft, classification, prospectEmail }: Props) {
  const [draft, setDraft] = useState(initialDraft);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const router = useRouter();

  // Don't render at all for noise categories.
  if (classification === "OutOfOffice" || classification === "AutoReply") {
    return classification ? (
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${LABEL_STYLES[classification]}`}>
        {LABEL_BS[classification]}
      </span>
    ) : null;
  }

  const sendDraft = async () => {
    if (!draft.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/prospects/${prospectId}/reply-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replyId, draft }),
      });
      const data: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Error slanju");
      setSent(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg bg-[#0d0d14] border border-[#1f1f2e] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500 text-xs uppercase tracking-wider">AI draft odgovora</span>
          {classification && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${LABEL_STYLES[classification] ?? "bg-zinc-800 text-zinc-400"}`}>
              {LABEL_BS[classification] ?? classification}
            </span>
          )}
        </div>
        <span className="text-zinc-600 text-[11px]">→ {prospectEmail}</span>
      </div>

      {sent ? (
        <p className="text-emerald-400 text-sm py-2">✓ Poslato</p>
      ) : (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600 transition-colors leading-relaxed"
          />
          <div className="flex items-center justify-between mt-2 gap-3">
            {error ? <p className="text-red-400 text-xs flex-1">{error}</p> : <span className="flex-1" />}
            <button
              onClick={sendDraft}
              disabled={sending || !draft.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-md transition-colors flex items-center gap-2"
            >
              {sending && <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {sending ? "Šaljem…" : "Send odgovor"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
