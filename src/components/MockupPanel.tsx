"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, RefreshCw, ExternalLink } from "lucide-react";

interface Props {
  prospectId: string;
  website: string | null;
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
 * Side-by-side comparison panel on the prospect detail page: current site
 * screenshot (thum.io) vs. AI-generated premium mockup (Flux). Used as the
 * sales-call opener — operator shares screen with the prospect and says
 * "here's how your site can look in 6 weeks."
 */
export function MockupPanel({ prospectId, website, initialMockupUrl, initialMockupAt }: Props) {
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

  if (!website) {
    return null;
  }

  if (!mockupUrl) {
    return (
      <div className="rounded-xl bg-gradient-to-br from-indigo-500/[0.06] to-[#0a0a12] border border-indigo-500/20 p-6 card-elevation">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 max-w-xl">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-md bg-indigo-500/15 flex items-center justify-center">
                <Sparkles strokeWidth={2} className="w-4 h-4 text-indigo-400" />
              </div>
              <h2 className="text-white font-semibold text-base">AI mockup za sales call</h2>
            </div>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Generiše premium verziju njihovog sajta sa Flux Schnell-om (~5 sekundi, ~$0.003). Pokazuješ na pozivu side-by-side sa trenutnim sajtom — vizuelni "before/after" zatvara dealove dramatično brže.
            </p>
          </div>
          <button
            onClick={() => generate(false)}
            disabled={loading}
            className="shrink-0 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-medium px-4 py-2.5 rounded-lg transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles strokeWidth={2} className="w-4 h-4" />}
            {loading ? "Generišem…" : "Generiši mockup"}
          </button>
        </div>
        {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles strokeWidth={2} className="w-4 h-4 text-indigo-400" />
          <h2 className="text-zinc-200 font-medium text-sm">Before / After</h2>
        </div>
        <div className="flex items-center gap-2">
          {mockupAt && (
            <span className="text-zinc-600 text-xs">
              {new Date(mockupAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => generate(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-200 text-xs px-3 py-1.5 rounded-md border border-[#1c1c28] hover:border-[#2a2a3a] transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw strokeWidth={2} className="w-3 h-3" />}
            {loading ? "Regenerišem…" : "Regeneriši"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

        {/* After — AI mockup */}
        <div className="space-y-2">
          <p className="text-indigo-400 text-[10px] uppercase tracking-widest font-medium">Premium verzija</p>
          <div className="rounded-lg overflow-hidden border border-indigo-500/30 bg-[#07070b] shadow-lg shadow-indigo-500/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mockupUrl}
              alt="AI-generated premium mockup"
              className="w-full block"
              loading="lazy"
            />
          </div>
          <p className="text-zinc-600 text-xs">
            AI-generated mood board · Pokazuje pravac, ne final
          </p>
        </div>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
