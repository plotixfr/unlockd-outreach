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
    if (currentUrl && !confirm("Regenerate the hero? The old URL will be replaced.")) return;
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
    <div className="card p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles strokeWidth={2} className="w-4 h-4 text-fuchsia-600" />
          <div>
            <h2 className="text-[var(--text)] font-semibold text-sm">Audit deliverable</h2>
            <p className="text-[var(--text-muted)] text-xs mt-0.5">
              What the prospect sees when they click the F2 email link — mockup + 3 findings + Calendly CTA
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/audit/${prospectId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs px-3 py-1.5"
          >
            Open landing
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 bg-[var(--accent-soft)] hover:bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border border-[var(--accent-border)]"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy audit link"}
          </button>
        </div>
      </div>

      {currentUrl ? (
        <div className="relative aspect-video rounded-lg overflow-hidden bg-zinc-100 border border-[var(--border)]">
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
        <div className="rounded-lg border border-dashed border-[var(--border-strong)] p-8 text-center bg-zinc-50">
          <p className="text-[var(--text-muted)] text-sm">
            No mockup yet. Click Generate below (~3s, ~$0.003) — the landing page and the F2 email
            pick it up automatically.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[var(--text-muted)] text-[11px]">
          {mockupAt
            ? `Generated ${new Date(mockupAt).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : ""}
          {!hasAudit && (
            <span className="ml-2 text-amber-600">⚠ No 3-finding audit yet — landing will use fallback findings</span>
          )}
        </div>
        <button
          onClick={regen}
          disabled={regenerating}
          className="inline-flex items-center gap-1.5 bg-fuchsia-50 hover:bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {regenerating ? "Generating…" : currentUrl ? "Regenerate hero" : "Generate hero"}
        </button>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  );
}
