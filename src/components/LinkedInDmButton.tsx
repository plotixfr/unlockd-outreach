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
 * pastes into LinkedIn manually, then ticks "Označi kao poslato" so the
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
      if (!res.ok || !data.message) throw new Error(data.error || "Greška");
      setMessage(data.message);
      setNote(data.note ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
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
        className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-md border transition-colors bg-[#0a0a14] border-[#1c1c28] text-zinc-300 hover:border-[#2a3aaa] hover:text-white"
      >
        <MessageSquare className="w-4 h-4" />
        LinkedIn DM
        {touchedAt && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-[#0a66c2]/15 flex items-center justify-center">
                <MessageSquare strokeWidth={2} className="w-4 h-4 text-[#4ca0ee]" />
              </div>
              <div>
                <h3 className="text-white font-semibold">LinkedIn DM</h3>
                <p className="text-zinc-500 text-xs">2–3 rečenice u tvom voice-u za parallel touch</p>
              </div>
            </div>

            {loading && (
              <div className="py-10 text-center">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-400 mx-auto" />
                <p className="text-zinc-500 text-xs mt-3">Claude piše u tvom stilu…</p>
              </div>
            )}

            {!loading && message && (
              <>
                {note && (
                  <p className="text-zinc-500 text-[11px] uppercase tracking-widest mt-4 mb-2 font-medium">
                    Angle · {note}
                  </p>
                )}
                <div className="mt-2 rounded-lg bg-[#07070b] border border-[#1c1c28] p-4">
                  <pre className="text-zinc-200 text-sm whitespace-pre-wrap font-sans leading-relaxed">
                    {message}
                  </pre>
                </div>
                <div className="flex items-center justify-between gap-2 mt-4 flex-wrap">
                  <button
                    onClick={generate}
                    className="text-zinc-500 hover:text-zinc-200 text-xs"
                  >
                    Regeneriši
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={copy}
                      className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium px-3 py-2 rounded-md transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? "Kopirano" : "Kopiraj"}
                    </button>
                    <button
                      onClick={() => { void markSent(); setOpen(false); }}
                      className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-medium px-3 py-2 rounded-md transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Označi kao poslato
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && <p className="text-red-400 text-xs mt-4">{error}</p>}

            <p className="text-zinc-700 text-[10px] mt-5 leading-relaxed">
              Šalješ ručno — LinkedIn ToS zabranjuje automatizaciju. Cmd+C → otvori LinkedIn → otvori njihov profil → poruka → Cmd+V → pošalji.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
