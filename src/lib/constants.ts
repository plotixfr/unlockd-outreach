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
  "Replied",
  "Converted",
  "Unsubscribed",
  "Bounced",
] as const;
export type Status = (typeof STATUSI)[number];

export const STATUS_BOJE: Record<string, string> = {
  New:          "bg-zinc-800/60 text-zinc-300 border border-zinc-700/40",
  Scheduled:    "bg-sky-500/10 text-sky-300 border border-sky-500/20",
  Emailed:      "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
  Follow1:      "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25",
  Follow2:      "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25",
  Follow3:      "bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/25",
  Replied:      "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
  Converted:    "bg-emerald-500/20 text-emerald-200 border border-emerald-500/30",
  Unsubscribed: "bg-red-500/10 text-red-300 border border-red-500/20",
  Bounced:      "bg-red-500/15 text-red-400 border border-red-500/30",
};

export const PIPELINE_ORDER: Status[] = [
  "New", "Scheduled", "Emailed", "Follow1", "Follow2", "Follow3",
  "Replied", "Converted",
];
