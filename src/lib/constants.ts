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
  New: "bg-zinc-700 text-zinc-200",
  Scheduled: "bg-sky-900 text-sky-200",
  Emailed: "bg-blue-900 text-blue-200",
  Follow1: "bg-indigo-900 text-indigo-200",
  Follow2: "bg-violet-900 text-violet-200",
  Follow3: "bg-purple-900 text-purple-200",
  Replied: "bg-emerald-900 text-emerald-200",
  Converted: "bg-green-900 text-green-200",
  Unsubscribed: "bg-red-900 text-red-300",
  Bounced: "bg-red-950 text-red-400",
};

export const PIPELINE_ORDER: Status[] = [
  "New", "Scheduled", "Emailed", "Follow1", "Follow2", "Follow3",
  "Replied", "Converted",
];
