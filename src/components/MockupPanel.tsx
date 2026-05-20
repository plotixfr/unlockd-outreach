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
      <div className="rounded-xl border border-dashed border-[#1c1c28] p-6 text-center">
        <p className="text-zinc-500 text-sm">
          Bez website-a ne možemo generisati premium concept preview.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Wand2 strokeWidth={2} className="w-4 h-4 text-emerald-400" />
          <div>
            <h2 className="text-zinc-200 font-medium text-sm">Concept preview</h2>
            <p className="text-zinc-600 text-xs mt-0.5">
              Njihov sadržaj u premium editorial layout-u — share-screen na pozivu ili pošalji link prije sastanka
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs px-3 py-1.5 rounded-md border border-[#1c1c28] hover:border-[#2a2a3a] transition-colors"
          >
            Otvori original
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-medium px-3 py-1.5 rounded-md transition-all border border-emerald-500/30"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
            {copied ? "Kopirano" : "Kopiraj share link"}
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

      <div className="text-zinc-600 text-[11px] leading-relaxed pt-2 border-t border-[#1c1c28]">
        <strong className="text-zinc-400">Kako se koristi:</strong> u sales pozivu — Otvori original lijevo, share-screen prospect-u i pokaži ovaj preview. Ili kopiraj share link i pošalji ga prospekt-u 1h prije sastanka kao &ldquo;voici la direction créative que je vous proposerai&rdquo;. Link je javan (svako ko ga ima može da otvori) — bez logina.
      </div>
    </div>
  );
}
