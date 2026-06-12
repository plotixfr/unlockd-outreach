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
  Interested: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Question: "bg-sky-50 text-sky-700 border border-sky-200",
  NotNow: "bg-amber-50 text-amber-700 border border-amber-200",
  WrongPerson: "bg-orange-50 text-orange-700 border border-orange-200",
  Negative: "bg-red-50 text-red-700 border border-red-200",
  Unsubscribe: "bg-red-50 text-red-700 border border-red-200",
  OutOfOffice: "bg-zinc-100 text-zinc-600 border border-zinc-200",
  AutoReply: "bg-zinc-100 text-zinc-500 border border-zinc-200",
};

const LABEL_EN: Record<string, string> = {
  Interested: "Interested",
  Question: "Question",
  NotNow: "Maybe later",
  WrongPerson: "Wrong person",
  Negative: "Negative",
  Unsubscribe: "Unsubscribe",
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
        {LABEL_EN[classification]}
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
      if (!res.ok || !data.ok) throw new Error(data.error || "Send failed");
      setSent(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg bg-white border border-[var(--border)] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">AI reply draft</span>
          {classification && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${LABEL_STYLES[classification] ?? "bg-zinc-100 text-zinc-600 border border-zinc-200"}`}>
              {LABEL_EN[classification] ?? classification}
            </span>
          )}
        </div>
        <span className="text-[var(--text-muted)] text-[11px]">→ {prospectEmail}</span>
      </div>

      {sent ? (
        <p className="text-emerald-700 text-sm py-2 font-medium">✓ Sent</p>
      ) : (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="w-full bg-white border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors leading-relaxed"
          />
          <div className="flex items-center justify-between mt-2 gap-3">
            {error ? <p className="text-red-600 text-xs flex-1">{error}</p> : <span className="flex-1" />}
            <button
              onClick={sendDraft}
              disabled={sending || !draft.trim()}
              className="btn-primary text-sm px-4 py-1.5"
            >
              {sending && <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {sending ? "Sending…" : "Send reply"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
