/**
 * Post-reply deal pipeline. Independent of the email status (which tracks the
 * outreach sequence). dealStage represents where the conversation is in the
 * sales process after the prospect engaged.
 *
 * Probabilities are applied to dealValue for the revenue forecast — calibrated
 * from typical premium-web-studio close rates.
 */

export const DEAL_STAGES = [
  "Discovery",   // call booked or in progress
  "Proposal",    // proposal sent, awaiting response
  "Negotiating", // active negotiation / scope changes
  "Won",         // signed
  "Lost",        // closed lost
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_STAGE_PROBABILITY: Record<DealStage, number> = {
  Discovery: 0.2,
  Proposal: 0.45,
  Negotiating: 0.65,
  Won: 1.0,
  Lost: 0,
};

// Display labels for the Kanban columns. Kept in a separate map so the
// canonical stage names above stay stable (used in DB + API filters) while
// the UI label can be retitled freely.
export const DEAL_STAGE_LABEL: Record<DealStage, string> = {
  Discovery: "Discovery",
  Proposal: "Proposal sent",
  Negotiating: "Negotiating",
  Won: "Won",
  Lost: "Lost",
};

export const DEAL_STAGE_COLOR: Record<DealStage, string> = {
  Discovery: "bg-sky-950/60 text-sky-300 border-sky-900/40",
  Proposal: "bg-blue-950/60 text-blue-300 border-blue-900/40",
  Negotiating: "bg-emerald-950/60 text-emerald-300 border-emerald-900/40",
  Won: "bg-emerald-950/60 text-emerald-300 border-emerald-900/40",
  Lost: "bg-zinc-900 text-zinc-500 border-zinc-800",
};

export function isDealStage(s: unknown): s is DealStage {
  return typeof s === "string" && (DEAL_STAGES as readonly string[]).includes(s);
}
