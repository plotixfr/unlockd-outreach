"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, RefreshCw, ExternalLink, Wand2 } from "lucide-react";
import { PremiumPreview } from "@/components/PremiumPreview";
import type { SiteSnapshot } from "@/lib/scrapeSite";

interface Props {
  prospectId: string;
  firmaNaziv: string;
  niche: string;
  city: string;
  website: string | null;
  snapshot: SiteSnapshot | null;
  initialMockupUrl: string | null;
  initialMockupAt: Date | null;
}

function thumioUrl(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return `https://image.thum.io/get/png/width/800/${u.toString()}`;
  } catch {
    return "";
  }
}

/**
 * Side-by-side comparison panel for the sales call. Two layers:
 *
 *   1. Always-on: current site (thum.io screenshot) vs. PremiumPreview — a
 *      live HTML render of the prospect's OWN content (H1, og:image, copy)
 *      placed in a premium editorial template. No external API, works
 *      immediately, more convincing than a generic AI moodboard because
 *      the prospect sees their actual words/images reimagined.
 *
 *   2. Optional: AI moodboard (Flux Schnell via Replicate) for when the
 *      operator wants pure visual inspiration alongside the content preview.
 *      Requires REPLICATE_API_TOKEN — when not configured, the section is
 *      hidden so the operator never sees a broken button.
 */
export function MockupPanel({
  prospectId,
  firmaNaziv,
  niche,
  city,
  website,
  snapshot,
  initialMockupUrl,
  initialMockupAt,
}: Props) {
  const [mockupUrl, setMockupUrl] = useState<string | null>(initialMockupUrl);
  const [mockupAt, setMockupAt] = useState<Date | null>(initialMockupAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const generate = async (force: boolean) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/prospects/${prospectId}/mockup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data: { url?: string; error?: string } = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Greška");
      setMockupUrl(data.url);
      setMockupAt(new Date());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    } finally {
      setLoading(false);
    }
  };

  if (!website) return null;

  return (
    <div className="space-y-4">
      {/* Primary: before/after using the prospect's actual content */}
      <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 strokeWidth={2} className="w-4 h-4 text-indigo-400" />
            <h2 className="text-zinc-200 font-medium text-sm">Avant / Après</h2>
          </div>
          <p className="text-zinc-600 text-xs">
            Vaš contenu, repensé en premium
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Before — current site screenshot */}
          <div className="space-y-2">
            <p className="text-zinc-600 text-[10px] uppercase tracking-widest font-medium">Trenutno</p>
            <div className="rounded-lg overflow-hidden border border-[#1c1c28] bg-[#07070b]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumioUrl(website)}
                alt={`Current site of ${website}`}
                className="w-full block"
                loading="lazy"
              />
            </div>
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-zinc-600 hover:text-zinc-400 text-xs"
            >
              {website}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* After — PremiumPreview with their actual content */}
          <div className="space-y-2">
            <p className="text-indigo-400 text-[10px] uppercase tracking-widest font-medium">Premium verzija</p>
            <PremiumPreview
              firmaNaziv={firmaNaziv}
              niche={niche}
              city={city}
              snapshot={snapshot}
            />
            <p className="text-zinc-600 text-xs">
              Koristi njihov pravi sadržaj — H1, slike, copy — u premium template-u
            </p>
          </div>
        </div>
      </div>

      {/* Optional secondary: AI moodboard via Replicate */}
      <div className="rounded-xl bg-gradient-to-br from-indigo-500/[0.04] to-[#0a0a12] border border-indigo-500/15 p-5 card-elevation">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 max-w-xl">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-md bg-indigo-500/15 flex items-center justify-center">
                <Sparkles strokeWidth={2} className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <h3 className="text-zinc-200 font-medium text-sm">AI moodboard (opcionalno)</h3>
            </div>
            <p className="text-zinc-500 text-xs leading-relaxed">
              Generiše čisto vizuelni mood-board sa Flux Schnell-om. Traži <code className="bg-[#1a1a24] px-1.5 py-0.5 rounded text-[10px]">REPLICATE_API_TOKEN</code> sa setup-ovanim billing-om.
            </p>
          </div>
          <button
            onClick={() => generate(!!mockupUrl)}
            disabled={loading}
            className="shrink-0 bg-indigo-500/20 hover:bg-indigo-500/30 disabled:opacity-50 text-indigo-300 text-xs font-medium px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 border border-indigo-500/30"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw strokeWidth={2} className="w-3.5 h-3.5" />}
            {loading ? "Generišem…" : mockupUrl ? "Regeneriši" : "Generiši mood-board"}
          </button>
        </div>

        {mockupUrl && (
          <div className="mt-4">
            <div className="rounded-lg overflow-hidden border border-indigo-500/20 bg-[#07070b]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mockupUrl}
                alt="AI-generated premium mockup"
                className="w-full block"
                loading="lazy"
              />
            </div>
            {mockupAt && (
              <p className="text-zinc-600 text-xs mt-2">
                Generisano: {new Date(mockupAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        )}

        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
      </div>
    </div>
  );
}
