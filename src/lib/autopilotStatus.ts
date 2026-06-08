/**
 * Computes the next scheduled autopilot/send run by reading the vercel.json
 * cron directly so the UI doesn't drift from the actual schedule.
 *   autopilot: 0 6 * * 1-5  →  06:00 UTC Mon–Fri (08:00 Paris in CEST)
 *   send:      0 8 * * *    →  08:00 UTC daily   (10:00 Paris in CEST)
 *
 * Hard-coded here so this file is self-contained — if you change vercel.json,
 * change these constants too. Kept as arrays so adding a second daily fire
 * (e.g. after a Vercel Pro upgrade) is a one-line edit.
 */

export const AUTOPILOT_CRON_HOURS_UTC = [5, 7, 9, 11, 13, 15];
export const AUTOPILOT_RUN_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri (UTC, getUTCDay)
export const SEND_CRON_HOURS_UTC = [8];
export const SUMMARY_CRON_HOUR_UTC = 17;

function nextHourSlot(from: Date, hoursUtc: number[], allowedDays?: number[]): Date {
  const sorted = [...hoursUtc].sort((a, b) => a - b);
  // Walk up to 14 days forward to handle weekend skips.
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const probe = new Date(from);
    probe.setUTCDate(probe.getUTCDate() + dayOffset);
    if (allowedDays && !allowedDays.includes(probe.getUTCDay())) continue;
    for (const h of sorted) {
      probe.setUTCHours(h, 0, 0, 0);
      if (probe > from) return new Date(probe);
    }
  }
  // Fallback (shouldn't happen): bump 1 day forward at first slot.
  const fallback = new Date(from);
  fallback.setUTCDate(fallback.getUTCDate() + 1);
  fallback.setUTCHours(sorted[0] ?? 0, 0, 0, 0);
  return fallback;
}

export function nextAutopilotRun(from: Date = new Date()): Date {
  return nextHourSlot(from, AUTOPILOT_CRON_HOURS_UTC, AUTOPILOT_RUN_DAYS);
}

export function nextSendRun(from: Date = new Date()): Date {
  return nextHourSlot(from, SEND_CRON_HOURS_UTC);
}

export function formatParisDateTime(d: Date): string {
  return d.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeFromNow(d: Date, from: Date = new Date()): string {
  const diffMs = d.getTime() - from.getTime();
  const min = Math.round(diffMs / 60000);
  if (Math.abs(min) < 60) return min >= 0 ? `in ${min} min` : `${-min} min ago`;
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return h >= 0 ? `in ${h}h` : `${-h}h ago`;
  const day = Math.round(h / 24);
  return day >= 0 ? `in ${day} day${day === 1 ? "" : "s"}` : `${-day} day${day === 1 ? "" : "s"} ago`;
}
