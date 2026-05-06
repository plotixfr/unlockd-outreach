export const NISE = ["Hotel", "Restaurant", "Architecture", "Property"] as const;
export type Nisa = (typeof NISE)[number];

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
};

export const PIPELINE_ORDER: Status[] = [
  "New", "Scheduled", "Emailed", "Follow1", "Follow2", "Follow3",
  "Replied", "Converted",
];
