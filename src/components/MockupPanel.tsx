"use client";

import { useState } from "react";
import { ExternalLink, Wand2, Link2, Check } from "lucide-react";
import { PremiumPreview } from "@/components/PremiumPreview";
import type { SiteSnapshot } from "@/lib/scrapeSite";

interface Props {
  prospectId: string;
  firmaNaziv: string;
  niche: string;
  city: string;
  website: string | null;
  snapshot: SiteSnapshot | null;
}

/**
 * Concept preview panel for the sales call. Renders a per-prospect HTML
 * preview using one of three distinct layouts (chosen stably by hash of the
 * prospect id, so the same prospect always sees the same variant). Uses the
 * prospect's actual scraped content placed inside an editorial template
 * styled like the homepage of a luxury brand.
 *
 * No thum.io, no Replicate dependency. All in-house rendering.
 *
 * Also exposes a "Copy share link" button that copies a public URL of the
 * preview (e.g. /preview/{prospectId}) — the operator can drop that link
 * into the proposal email, or send it directly to the prospect before the
 * meeting as a teaser.
 */
export function MockupPanel({
  prospectId,
  firmaNaziv,
  niche,
  city,
  website,
  snapshot,
}: Props) {
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined"
    ? `${window.location.origin}/preview/${prospectId}`
    : "";

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard might be denied in some contexts — fallback to prompt
      window.prompt("Copy share link:", shareUrl);
    }
  };

  if (!website) {
    return (
      <div className="empty-state py-8">
        <p className="text-sm font-semibold text-[var(--text-secondary)]">
          Without a website we can&apos;t generate a premium concept preview.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Wand2 strokeWidth={2} className="w-4 h-4 text-[var(--accent)]" />
          <div>
            <h2 className="text-[var(--text)] font-semibold text-sm">Concept preview</h2>
            <p className="text-[var(--text-muted)] text-xs mt-0.5">
              Their content in a premium editorial layout — share-screen on a call or send the link before the meeting
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs px-3 py-1.5"
          >
            Open original
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 bg-[var(--accent-soft)] hover:bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border border-[var(--accent-border)]"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy share link"}
          </button>
        </div>
      </div>

      {/* The preview itself */}
      <PremiumPreview
        prospectId={prospectId}
        firmaNaziv={firmaNaziv}
        niche={niche}
        city={city}
        snapshot={snapshot}
      />

      <div className="text-[var(--text-muted)] text-[11px] leading-relaxed pt-2 etch-top">
        <strong className="text-[var(--text-secondary)]">How to use:</strong> on a sales call — open the original on the left, share-screen with the prospect and show this preview. Or copy the share link and send it to the prospect 1h before the meeting as &ldquo;voici la direction créative que je vous proposerai&rdquo;. Link is public (anyone with it can open) — no login.
      </div>
    </div>
  );
}
