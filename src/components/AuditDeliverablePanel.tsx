"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw, Link2, Check, ExternalLink, Loader2 } from "lucide-react";

interface Props {
  prospectId: string;
  mockupUrl: string | null;
  mockupAt: Date | null;
  hasAudit: boolean;
}

/**
 * The operator's view of what a prospect sees when they click the audit
 * link in Follow-2. Shows the AI-generated mockup hero (if any), with
 * one-click regen and a "copy share link" so the operator can drop the URL
 * into a LinkedIn DM / WhatsApp / wherever.
 *
 * Companion to MockupPanel (which renders an in-house editorial concept
 * preview from the scraped content). These two complement each other —
 * MockupPanel is the call-screen-share asset; this one is the
 * delivered-by-email asset that the prospect can self-serve.
 */
export function AuditDeliverablePanel({
  prospectId,
  mockupUrl,
  mockupAt,
  hasAudit,
}: Props) {
  const [regenerating, setRegenerating] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(mockupUrl);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const auditUrl =
    typeof window !== "undefined" ? `${window.location.origin}/audit/${prospectId}` : "";

  const regen = async () => {
    if (regenerating) return;
    if (currentUrl && !confirm("Regenerišem hero? Stari URL će biti zamijenjen.")) return;
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/mockup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? `HTTP ${res.status}`);
      setCurrentUrl(data.url);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regen failed");
    } finally {
      setRegenerating(false);
    }
  };

  const copy = async () => {
    if (!auditUrl) return;
    try {
      await navigator.clipboard.writeText(auditUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy:", auditUrl);
    }
  };

  return (
    <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles strokeWidth={2} className="w-4 h-4 text-fuchsia-400" />
          <div>
            <h2 className="text-zinc-200 font-medium text-sm">Audit deliverable</h2>
            <p className="text-zinc-600 text-xs mt-0.5">
              Ono što prospekt vidi kad klikne link iz F2 emaila — mockup + 3 findings + Calendly CTA
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/audit/${prospectId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs px-3 py-1.5 rounded-md border border-[#1c1c28] hover:border-[#2a2a3a] transition-colors"
          >
            Otvori landing
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-medium px-3 py-1.5 rounded-md transition-all border border-emerald-500/30"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            {copied ? "Kopirano" : "Kopiraj audit link"}
          </button>
        </div>
      </div>

      {currentUrl ? (
        <div className="relative aspect-video rounded-lg overflow-hidden bg-[#07070b] border border-[#1c1c28]">
          <Image
            src={currentUrl}
            alt="Mockup hero"
            fill
            sizes="(max-width: 768px) 100vw, 700px"
            className="object-cover"
            unoptimized
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[#1c1c28] p-8 text-center bg-[#0a0a12]">
          <p className="text-zinc-500 text-sm">
            No mockup yet. Click Regen below (~3s, ~$0.003) — the landing page and F2 email will
            ga koristiti automatski.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-zinc-600 text-[11px]">
          {mockupAt
            ? `Generisan ${new Date(mockupAt).toLocaleString("fr-FR", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : ""}
          {!hasAudit && (
            <span className="ml-2 text-amber-400">⚠ No 3-finding audit yet — landing will use fallback findings</span>
          )}
        </div>
        <button
          onClick={regen}
          disabled={regenerating}
          className="inline-flex items-center gap-1.5 bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-300 text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
        >
          {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {regenerating ? "Generišem…" : currentUrl ? "Regeneriši hero" : "Generiši hero"}
        </button>
      </div>
      {error && <p className="text-rose-400 text-xs">{error}</p>}
    </div>
  );
}
