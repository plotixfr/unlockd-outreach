"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  hasAnyBrief: boolean;
}

/**
 * One-click bootstrap: creates the curated set of briefs for Unlockd's premium
 * French target market. Once clicked, the autopilot has work to do every day
 * without further configuration.
 */
export function QuickSetupButton({ hasAnyBrief }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ created: number; skipped: number; names: string[] } | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const run = async () => {
    if (
      hasAnyBrief &&
      !confirm("Već imaš brief-ove. Quick Setup će dodati još 10 preset-ova (pa eventualno i neke duplikate sa različitim imenima). Nastaviti?")
    ) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/autopilot/quick-setup", { method: "POST" });
      const data: { created?: number; skipped?: number; createdNames?: string[]; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Greška");
      setDone({
        created: data.created ?? 0,
        skipped: data.skipped ?? 0,
        names: data.createdNames ?? [],
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-xl bg-emerald-950/30 border border-emerald-700/40 p-5">
        <p className="text-emerald-300 font-medium text-sm">
          ✓ Quick Setup završen — {done.created} novih brief-ova, {done.skipped} preskočeno (već postoje)
        </p>
        {done.names.length > 0 && (
          <ul className="mt-2 text-emerald-200/80 text-xs space-y-0.5">
            {done.names.map((n) => <li key={n}>· {n}</li>)}
          </ul>
        )}
        <p className="text-emerald-200/70 text-xs mt-3">
          Autopilot će ih sve pokrenuti sljedeći radni dan u 08:00 Paris. Možeš pokrenuti odmah klikom na ▶ pored svakog brief-a.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gradient-to-br from-blue-950/40 to-violet-950/40 border border-blue-800/40 p-6 space-y-3">
      <div>
        <h2 className="text-white font-semibold text-base">⚡ Quick Setup — Unlockd target market</h2>
        <p className="text-blue-200/80 text-sm mt-1">
          Jedan klik kreira 10 brief-ova pokrivajući tvoj premium francuski market:
          hoteli 4-5★ (Paris, Nice, Bordeaux, Cannes), restorani gastro (Paris, Lyon),
          immobilier prestige (Paris, Cannes), arhitekti Paris, spas Paris.
          Konzervativan setup: 2-3 prospekta po brief-u dnevno → ~30 prospekata/dan ukupno.
        </p>
        <p className="text-blue-200/60 text-xs mt-2">
          Nakon ovoga: ne moraš ništa ručno — autopilot otkriva, scoreuje, generiše, šalje. Ti samo otvaraš inbox.
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        {error && <p className="text-red-400 text-xs flex-1">{error}</p>}
        <button
          onClick={run}
          disabled={loading}
          className="ml-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2"
        >
          {loading && <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          {loading ? "Kreiram…" : "⚡ Pokreni Quick Setup"}
        </button>
      </div>
    </div>
  );
}
