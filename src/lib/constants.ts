// Suggested niches — used as fallback labels in the upload guide. The actual
// niche field on Prospect is a free-form string; CSV uploads accept any value
// and the dashboard filter now reads distinct niches from the DB.
export const NISE_PREDLOZENE = [
  "Hotel",
  "Restaurant",
  "Architecture",
  "Property",
] as const;

// Kept for any legacy imports that still expect this name.
export const NISE = NISE_PREDLOZENE;
export type Nisa = string;

export const STATUSI = [
  "New",
  "Scheduled",
  "Emailed",
  "Follow1",
  "Follow2",
  "Follow3",
  "Breakup",
  "Replied",
  "Converted",
  "Unsubscribed",
  "Bounced",
  // Terminal: pipeline retries exhausted (see lib/redrive.ts) — the reason
  // lives in prospect.lastError. Distinct from a scoring REJECTION, which
  // stays "New" with a qualityScore below the brief threshold.
  "Failed",
] as const;
export type Status = (typeof STATUSI)[number];

export const STATUS_BOJE: Record<string, string> = {
  New:          "bg-zinc-100 text-zinc-700 border border-zinc-200",
  Scheduled:    "bg-sky-50 text-sky-700 border border-sky-200",
  Emailed:      "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Follow1:      "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Follow2:      "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Follow3:      "bg-violet-50 text-violet-700 border border-violet-200",
  Breakup:      "bg-amber-50 text-amber-700 border border-amber-200",
  Replied:      "bg-emerald-100 text-emerald-800 border border-emerald-200",
  Converted:    "bg-emerald-600 text-white border border-emerald-600",
  Unsubscribed: "bg-red-50 text-red-700 border border-red-200",
  Bounced:      "bg-red-50 text-red-700 border border-red-200",
  Failed:       "bg-orange-50 text-orange-700 border border-orange-200",
};

export const PIPELINE_ORDER: Status[] = [
  "New", "Scheduled", "Emailed", "Follow1", "Follow2", "Follow3", "Breakup",
  "Replied", "Converted",
];
