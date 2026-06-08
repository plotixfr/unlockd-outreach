"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SiteSnapshot } from "@/lib/scrapeSite";

interface Props {
  prospectId: string;
  hasWebsite: boolean;
  snapshot: SiteSnapshot | null;
  snapshotAt: Date | null;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SignalRow({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "bad" | "neutral" }) {
  const color =
    tone === "good"
      ? "text-emerald-400"
      : tone === "bad"
        ? "text-amber-400"
        : "text-zinc-300";
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="text-zinc-500 text-xs uppercase tracking-wider w-32 shrink-0 mt-0.5">{label}</span>
      <span className={`${color} flex-1 break-words`}>{value}</span>
    </div>
  );
}

export function ScoutingReport({ prospectId, hasWebsite, snapshot, snapshotAt }: Props) {
  const [current, setCurrent] = useState<SiteSnapshot | null>(snapshot);
  const [currentAt, setCurrentAt] = useState<Date | null>(snapshotAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  if (!hasWebsite) {
    return (
      <div className="rounded-xl border border-dashed border-[#1f1f2e] p-6 text-center">
        <p className="text-zinc-500 text-sm">Prospect nema website — nema šta da se scrape-uje.</p>
      </div>
    );
  }

  const onRescrape = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/prospects/${prospectId}/scrape`, { method: "POST" });
      const data: { ok?: boolean; snapshot?: SiteSnapshot; error?: string } = await res.json();
      if (!res.ok || !data.snapshot) {
        throw new Error(data.error || "Scrape neuspješan");
      }
      setCurrent(data.snapshot);
      setCurrentAt(new Date());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  if (!current) {
    return (
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-zinc-300 text-sm">Sajt još nije analiziran.</p>
          <button
            onClick={onRescrape}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
          >
            {loading ? "Analiziram…" : "Run analizu"}
          </button>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    );
  }

  if (!current.ok) {
    return (
      <div className="rounded-xl bg-amber-950/30 border border-amber-900/40 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-amber-300 font-medium text-sm">Sajt nedostupan</p>
            <p className="text-amber-200/70 text-xs mt-1">
              {current.error ?? "Unknown error"} {current.status ? `(HTTP ${current.status})` : ""}
            </p>
            <p className="text-zinc-500 text-xs mt-1">Posljednji pokušaj: {fmtDate(currentAt)}</p>
          </div>
          <button
            onClick={onRescrape}
            disabled={loading}
            className="bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded-lg transition-colors shrink-0"
          >
            {loading ? "Pokušavam…" : "Pokušaj ponovo"}
          </button>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    );
  }

  const sig = current.signals;
  const flagsGood: string[] = [];
  const flagsBad: string[] = [];
  if (sig.hasReservation) flagsGood.push("Sistem rezervacija");
  else flagsBad.push("Bez sistema rezervacija");
  if (sig.hasContactForm) flagsGood.push("Kontakt forma");
  else flagsBad.push("Bez kontakt forme");
  if (sig.responsiveViewport) flagsGood.push("Mobile viewport");
  else flagsBad.push("PAS de viewport mobile");
  if (sig.hasInstagramLink) flagsGood.push("Instagram link");
  if (sig.hasPhone) flagsGood.push("Telefon vidljiv");
  if (sig.approxImageCount < 4) flagsBad.push(`Malo slika (${sig.approxImageCount})`);
  if (sig.approxImageCount > 40) flagsBad.push(`Previše slika (${sig.approxImageCount})`);

  return (
    <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white font-medium text-sm">Analiza sajta</p>
          <p className="text-zinc-500 text-xs mt-0.5">Posljednji scan: {fmtDate(currentAt)}</p>
        </div>
        <button
          onClick={onRescrape}
          disabled={loading}
          className="text-zinc-400 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-[#1f1f2e] hover:border-[#2f2f3e] transition-colors disabled:opacity-50"
        >
          {loading ? "Re-scrape…" : "Re-scrape"}
        </button>
      </div>

      <div className="space-y-2.5 pt-2 border-t border-[#1f1f2e]">
        {current.title && <SignalRow label="Title" value={current.title} />}
        {current.metaDescription && <SignalRow label="Meta desc" value={current.metaDescription} />}
        {current.h1 && current.h1 !== current.title && <SignalRow label="H1" value={current.h1} />}
        {current.h2s.length > 0 && (
          <SignalRow label="H2" value={current.h2s.slice(0, 3).join(" · ")} />
        )}
        {current.lang && <SignalRow label="Jezik" value={current.lang} />}
        {sig.techHints.length > 0 && (
          <SignalRow label="Platforma" value={sig.techHints.join(", ")} tone="neutral" />
        )}
      </div>

      {(flagsGood.length > 0 || flagsBad.length > 0) && (
        <div className="pt-3 border-t border-[#1f1f2e] flex flex-wrap gap-1.5">
          {flagsGood.map((f) => (
            <span
              key={f}
              className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-900/40 text-emerald-300"
            >
              {f}
            </span>
          ))}
          {flagsBad.map((f) => (
            <span
              key={f}
              className="text-[11px] px-2 py-0.5 rounded-full bg-amber-950/40 border border-amber-900/40 text-amber-300"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}
