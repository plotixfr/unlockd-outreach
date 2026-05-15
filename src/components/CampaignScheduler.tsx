"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ScheduledDates {
  initial: Date | null;
  follow1: Date | null;
  follow2: Date | null;
  follow3: Date | null;
}

interface Props {
  prospectId: string;
  hasEmails: boolean;
  isScheduled: boolean;
  scheduledDates?: ScheduledDates;
}

const TIP_LABELS = ["Email 1 — Initial", "Email 2 — Follow-up", "Email 3 — Preuve sociale", "Email 4 — Final"];

function defaultInitial(): string {
  // "Now" in local time. The schedule endpoint sends immediately for any
  // scheduledInitial within +10min, so the default is fire-on-click.
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function CampaignScheduler({ prospectId, hasEmails, isScheduled, scheduledDates }: Props) {
  const [scheduledInitial, setScheduledInitial] = useState(defaultInitial());
  const [follow1Days, setFollow1Days] = useState(4);
  const [follow2Days, setFollow2Days] = useState(5);
  const [follow3Days, setFollow3Days] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<ScheduledDates | null>(null);
  const [sentNow, setSentNow] = useState(0);
  const router = useRouter();

  if (!hasEmails) {
    return (
      <div className="rounded-xl border border-dashed border-[#1f1f2e] p-6 text-center">
        <p className="text-zinc-500 text-sm">Prvo generiši emailove da bi mogao pokrenuti kampanju.</p>
      </div>
    );
  }

  if (isScheduled && scheduledDates && !success) {
    const dates = [
      scheduledDates.initial, scheduledDates.follow1,
      scheduledDates.follow2, scheduledDates.follow3,
    ];
    return (
      <div className="rounded-xl bg-sky-950/30 border border-sky-800/40 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sky-300 font-medium text-sm">Kampanja zakazana</p>
          <button
            onClick={() => setSuccess(null)}
            className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
          >
            Izmijeni raspored
          </button>
        </div>
        <div className="space-y-1.5">
          {dates.map((d, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="text-zinc-500 text-xs w-32">{TIP_LABELS[i]}</span>
              <span className="text-sky-200">{fmtDate(d)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (success) {
    const dates = [success.initial, success.follow1, success.follow2, success.follow3];
    return (
      <div className="rounded-xl bg-emerald-950/40 border border-emerald-800/40 p-5 space-y-3">
        <p className="text-emerald-300 font-medium text-sm">
          {sentNow > 0 ? "Prvi email poslan — kampanja pokrenuta" : "Kampanja zakazana"}
        </p>
        <div className="space-y-1.5">
          {dates.map((d, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="text-zinc-500 text-xs w-32">{TIP_LABELS[i]}</span>
              <span className="text-emerald-200">{fmtDate(d)}</span>
            </div>
          ))}
        </div>
        {sentNow > 0 && (
          <p className="text-emerald-400/80 text-xs">
            Follow-up emailovi će ići automatski po rasporedu — bez ručnih klikova.
          </p>
        )}
      </div>
    );
  }

  const handleSchedule = async () => {
    setLoading(true);
    setError("");
    try {
      // datetime-local strings have no timezone. Browsers parse them as the
      // user's local TZ; Vercel parses them as UTC. Convert to absolute ISO
      // here so the server sees the user's intent regardless of where it runs.
      const scheduledInitialIso = new Date(scheduledInitial).toISOString();
      const res = await fetch(`/api/prospects/${prospectId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledInitial: scheduledInitialIso, follow1Days, follow2Days, follow3Days }),
      });
      let data: { success?: boolean; dates?: Record<string, string>; sentNow?: number; error?: string } = {};
      try { data = await res.json(); } catch { throw new Error("Server nije vratio validan odgovor"); }
      if (!res.ok) throw new Error(data.error || "Greška");
      const d = data.dates!;
      setSuccess({
        initial: new Date(d.initial), follow1: new Date(d.follow1),
        follow2: new Date(d.follow2), follow3: new Date(d.follow3),
      });
      setSentNow(data.sentNow ?? 0);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Greška");
    } finally {
      setLoading(false);
    }
  };

  const initial = new Date(scheduledInitial);
  const f1 = new Date(initial.getTime() + follow1Days * 86400000);
  const f2 = new Date(f1.getTime() + follow2Days * 86400000);
  const f3 = new Date(f2.getTime() + follow3Days * 86400000);
  const preview = [initial, f1, f2, f3];

  return (
    <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5 space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
            Datum i vrijeme prvog emaila
          </label>
          <input
            type="datetime-local"
            value={scheduledInitial}
            onChange={(e) => setScheduledInitial(e.target.value)}
            className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600 transition-colors"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Follow-up 1 (dani)", val: follow1Days, set: setFollow1Days },
            { label: "Follow-up 2 (dani)", val: follow2Days, set: setFollow2Days },
            { label: "Follow-up 3 (dani)", val: follow3Days, set: setFollow3Days },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
                {label}
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={val}
                onChange={(e) => set(Number(e.target.value))}
                className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600 transition-colors"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="bg-[#0a0a0f] rounded-lg p-4 space-y-2">
        {preview.map((d, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <span className="text-zinc-600 text-xs w-32 shrink-0">{TIP_LABELS[i]}</span>
            <span className="text-zinc-300">{fmtDate(d)}</span>
          </div>
        ))}
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={handleSchedule}
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {loading && <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
        {loading
          ? (initial.getTime() <= Date.now() + 10 * 60 * 1000 ? "Slanje..." : "Zakazivanje...")
          : (initial.getTime() <= Date.now() + 10 * 60 * 1000 ? "Pošalji odmah i zakaži follow-up" : "Pokreni kampanju")}
      </button>
    </div>
  );
}
