/**
 * Computes the next scheduled autopilot run by reading the vercel.json cron
 * directly so the UI doesn't drift from the actual schedule. Cron is
 *   0 6 * * 1-5  →  06:00 UTC, Mon–Fri (08:00 Paris in winter / 07:00 in summer)
 *
 * We hard-code that here too so this file is self-contained — if you change
 * vercel.json, change this constant.
 */

export const AUTOPILOT_CRON_HOUR_UTC = 6;
export const AUTOPILOT_RUN_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri (UTC, getUTCDay)
export const SEND_CRON_HOUR_UTC = 8;
export const SUMMARY_CRON_HOUR_UTC = 17;

export function nextAutopilotRun(from: Date = new Date()): Date {
  const next = new Date(from);
  next.setUTCMinutes(0, 0, 0);

  // Bump to today's cron hour if we haven't passed it yet
  next.setUTCHours(AUTOPILOT_CRON_HOUR_UTC, 0, 0, 0);
  if (next <= from) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  // Walk forward until we land on a Mon-Fri
  while (!AUTOPILOT_RUN_DAYS.includes(next.getUTCDay())) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export function nextSendRun(from: Date = new Date()): Date {
  const next = new Date(from);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(SEND_CRON_HOUR_UTC, 0, 0, 0);
  if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
  return next;
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
  if (Math.abs(min) < 60) return min >= 0 ? `za ${min} min` : `prije ${-min} min`;
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return h >= 0 ? `za ${h}h` : `prije ${-h}h`;
  const day = Math.round(h / 24);
  return day >= 0 ? `za ${day} dan${day === 1 ? "" : "a"}` : `prije ${-day} dana`;
}
