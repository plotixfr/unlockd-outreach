/**
 * Brand constants. Centralized so renaming or whitelabeling is a one-file edit.
 *
 * The app ships as "Salvo" — a sellable B2B outbound product. The operator
 * (Unlockd Studio) is the first paying customer / dogfood user, but nothing
 * about the operator's identity should leak into the product UI.
 */

export const BRAND = {
  name: "Salvo",
  tagline: "Outbound, on autopilot.",
  shortTagline: "Outbound on autopilot",
  description:
    "Discover, qualify, and convert cold prospects without lifting a finger. Salvo runs your outbound pipeline end-to-end.",
  copyrightHolder: "Salvo",
} as const;
