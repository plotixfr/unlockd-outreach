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

const TIP_LABELS = ["Email 1 — Initial", "Email 2 — Follow-up", "Email 3 — Social proof", "Email 4 — Final"];

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
  return new Date(d).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

const inputCls =
  "w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors";

const labelCls =
  "block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5";

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
      <div className="empty-state py-8">
        <p className="text-sm font-semibold text-[var(--text-secondary)]">Generate emails first to launch the campaign.</p>
      </div>
    );
  }

  if (isScheduled && scheduledDates && !success) {
    const dates = [
      scheduledDates.initial, scheduledDates.follow1,
      scheduledDates.follow2, scheduledDates.follow3,
    ];
    return (
      <div className="rounded-xl bg-sky-50 border border-sky-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sky-700 font-semibold text-sm">Campaign scheduled</p>
          <button
            onClick={() => setSuccess(null)}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-xs transition-colors"
          >
            Edit schedule
          </button>
        </div>
        <div className="space-y-1.5">
          {dates.map((d, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="text-[var(--text-muted)] text-xs w-36">{TIP_LABELS[i]}</span>
              <span className="text-sky-800 tabular">{fmtDate(d)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (success) {
    const dates = [success.initial, success.follow1, success.follow2, success.follow3];
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 space-y-3">
        <p className="text-emerald-700 font-semibold text-sm">
          {sentNow > 0 ? "First email sent — campaign started" : "Campaign scheduled"}
        </p>
        <div className="space-y-1.5">
          {dates.map((d, i) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className="text-[var(--text-muted)] text-xs w-36">{TIP_LABELS[i]}</span>
              <span className="text-emerald-800 tabular">{fmtDate(d)}</span>
            </div>
          ))}
        </div>
        {sentNow > 0 && (
          <p className="text-emerald-700/80 text-xs">
            Follow-ups go out automatically on schedule — no manual clicks needed.
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
      try { data = await res.json(); } catch { throw new Error("Invalid server response"); }
      if (!res.ok) throw new Error(data.error || "Error");
      const d = data.dates!;
      setSuccess({
        initial: new Date(d.initial), follow1: new Date(d.follow1),
        follow2: new Date(d.follow2), follow3: new Date(d.follow3),
      });
      setSentNow(data.sentNow ?? 0);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
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
    <div className="card p-5 space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>
            First email — date &amp; time
          </label>
          <input
            type="datetime-local"
            value={scheduledInitial}
            onChange={(e) => setScheduledInitial(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Follow-up 1 (days)", val: follow1Days, set: setFollow1Days },
            { label: "Follow-up 2 (days)", val: follow2Days, set: setFollow2Days },
            { label: "Follow-up 3 (days)", val: follow3Days, set: setFollow3Days },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <label className={labelCls}>
                {label}
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={val}
                onChange={(e) => set(Number(e.target.value))}
                className={inputCls}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="bg-zinc-50 border border-[var(--border)] rounded-lg p-4 space-y-2">
        {preview.map((d, i) => (
          <div key={i} className="flex items-center gap-3 text-sm">
            <span className="text-[var(--text-muted)] text-xs w-36 shrink-0">{TIP_LABELS[i]}</span>
            <span className="text-[var(--text-secondary)] tabular">{fmtDate(d)}</span>
          </div>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button
        onClick={handleSchedule}
        disabled={loading}
        className="btn-primary w-full py-2.5"
      >
        {loading && <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
        {loading
          ? (initial.getTime() <= Date.now() + 10 * 60 * 1000 ? "Sending…" : "Scheduling...")
          : (initial.getTime() <= Date.now() + 10 * 60 * 1000 ? "Send now and schedule follow-ups" : "Launch campaign")}
      </button>
    </div>
  );
}
