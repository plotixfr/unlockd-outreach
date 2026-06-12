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
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SignalRow({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "bad" | "neutral" }) {
  const color =
    tone === "good"
      ? "text-emerald-700"
      : tone === "bad"
        ? "text-amber-700"
        : "text-[var(--text-secondary)]";
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="text-[var(--text-muted)] text-[11px] font-semibold uppercase tracking-wide w-32 shrink-0 mt-0.5">{label}</span>
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
      <div className="empty-state py-8">
        <p className="text-sm font-semibold text-[var(--text-secondary)]">No website on file — nothing to scan.</p>
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
        throw new Error(data.error || "Scrape failed");
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
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[var(--text-secondary)] text-sm">Site not analyzed yet.</p>
          <button
            onClick={onRescrape}
            disabled={loading}
            className="btn-primary text-sm px-3 py-1.5"
          >
            {loading ? "Analyzing…" : "Run analysis"}
          </button>
        </div>
        {error && <p className="text-red-600 text-xs">{error}</p>}
      </div>
    );
  }

  if (!current.ok) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-amber-700 font-semibold text-sm">Site unreachable</p>
            <p className="text-amber-700/80 text-xs mt-1">
              {current.error ?? "Unknown error"} {current.status ? `(HTTP ${current.status})` : ""}
            </p>
            <p className="text-[var(--text-muted)] text-xs mt-1">Last attempt: {fmtDate(currentAt)}</p>
          </div>
          <button
            onClick={onRescrape}
            disabled={loading}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300 transition-colors shrink-0 disabled:opacity-50"
          >
            {loading ? "Trying…" : "Try again"}
          </button>
        </div>
        {error && <p className="text-red-600 text-xs">{error}</p>}
      </div>
    );
  }

  const sig = current.signals;
  const flagsGood: string[] = [];
  const flagsBad: string[] = [];
  if (sig.hasReservation) flagsGood.push("Booking system");
  else flagsBad.push("No booking system");
  if (sig.hasContactForm) flagsGood.push("Contact form");
  else flagsBad.push("No contact form");
  if (sig.responsiveViewport) flagsGood.push("Mobile viewport");
  else flagsBad.push("No mobile viewport");
  if (sig.hasInstagramLink) flagsGood.push("Instagram link");
  if (sig.hasPhone) flagsGood.push("Phone visible");
  if (sig.approxImageCount < 4) flagsBad.push(`Few images (${sig.approxImageCount})`);
  if (sig.approxImageCount > 40) flagsBad.push(`Too many images (${sig.approxImageCount})`);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[var(--text)] font-semibold text-sm">Site analysis</p>
          <p className="text-[var(--text-muted)] text-xs mt-0.5">Last scan: {fmtDate(currentAt)}</p>
        </div>
        <button
          onClick={onRescrape}
          disabled={loading}
          className="btn-secondary text-xs px-3 py-1.5"
        >
          {loading ? "Re-scraping…" : "Re-scrape"}
        </button>
      </div>

      <div className="space-y-2.5 pt-2 etch-top">
        {current.title && <SignalRow label="Title" value={current.title} />}
        {current.metaDescription && <SignalRow label="Meta desc" value={current.metaDescription} />}
        {current.h1 && current.h1 !== current.title && <SignalRow label="H1" value={current.h1} />}
        {current.h2s.length > 0 && (
          <SignalRow label="H2" value={current.h2s.slice(0, 3).join(" · ")} />
        )}
        {current.lang && <SignalRow label="Language" value={current.lang} />}
        {sig.techHints.length > 0 && (
          <SignalRow label="Platform" value={sig.techHints.join(", ")} tone="neutral" />
        )}
      </div>

      {(flagsGood.length > 0 || flagsBad.length > 0) && (
        <div className="pt-3 etch-top flex flex-wrap gap-1.5">
          {flagsGood.map((f) => (
            <span
              key={f}
              className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium"
            >
              {f}
            </span>
          ))}
          {flagsBad.map((f) => (
            <span
              key={f}
              className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  );
}
