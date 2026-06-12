"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, Copy, Check, CheckCircle2 } from "lucide-react";

interface Props {
  prospectId: string;
  initialTouchedAt: Date | null;
}

/**
 * One-click LinkedIn DM helper. Claude drafts a 2-3 sentence message in
 * Temim's voice using the prospect's scrape facts; operator clicks Copy,
 * pastes into LinkedIn manually, then ticks "Mark as sent" so the
 * touch is recorded on the prospect timeline.
 *
 * Manual send is deliberate — automated LinkedIn DMs violate ToS and risk
 * the operator's account. Speed-of-Claude + speed-of-Cmd+V is fast enough.
 */
export function LinkedInDmButton({ prospectId, initialTouchedAt }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [touchedAt, setTouchedAt] = useState<Date | null>(initialTouchedAt);
  const [error, setError] = useState("");
  const router = useRouter();

  const generate = async () => {
    setOpen(true);
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/prospects/${prospectId}/linkedin`, { method: "POST" });
      const data: { message?: string; note?: string; error?: string } = await res.json();
      if (!res.ok || !data.message) throw new Error(data.error || "Error");
      setMessage(data.message);
      setNote(data.note ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy:", message);
    }
  };

  const markSent = async () => {
    try {
      await fetch(`/api/prospects/${prospectId}/linkedin`, { method: "PATCH" });
      setTouchedAt(new Date());
      router.refresh();
    } catch {
      // ignore
    }
  };

  return (
    <>
      <button
        onClick={generate}
        className="btn-secondary text-sm px-3 py-1.5"
      >
        <MessageSquare className="w-4 h-4" />
        LinkedIn DM
        {touchedAt && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1000] bg-zinc-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center">
                <MessageSquare strokeWidth={2} className="w-4 h-4 text-sky-600" />
              </div>
              <div>
                <h3 className="text-[var(--text)] font-semibold">LinkedIn DM</h3>
                <p className="text-[var(--text-muted)] text-xs">2–3 sentences in your voice for a parallel touch</p>
              </div>
            </div>

            {loading && (
              <div className="py-10 text-center">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)] mx-auto" />
                <p className="text-[var(--text-muted)] text-xs mt-3">Claude is writing in your style…</p>
              </div>
            )}

            {!loading && message && (
              <>
                {note && (
                  <p className="section-label mt-4 mb-2">
                    Angle · {note}
                  </p>
                )}
                <div className="mt-2 rounded-lg bg-zinc-50 border border-[var(--border)] p-4">
                  <pre className="text-[var(--text)] text-sm whitespace-pre-wrap font-sans leading-relaxed">
                    {message}
                  </pre>
                </div>
                <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
                  <button
                    onClick={generate}
                    className="text-[var(--text-muted)] hover:text-[var(--text)] text-xs transition-colors"
                  >
                    Regenerate
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copy}
                      className="btn-secondary text-xs px-3 py-2"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                    <button
                      onClick={() => { void markSent(); setOpen(false); }}
                      className="btn-primary text-xs px-3 py-2"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mark as sent
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && <p className="text-red-600 text-xs mt-4">{error}</p>}

            <p className="text-[var(--text-muted)] text-[10px] mt-5 leading-relaxed">
              Send manually — LinkedIn ToS forbids automation. Cmd+C → open LinkedIn → their profile → message → Cmd+V → send.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
