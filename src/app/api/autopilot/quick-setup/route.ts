import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Multi-country seed. Three target markets:
 *
 *   FR (language=fr) — full coverage: Group A B2B services via Google Places
 *   and Group B FR tech startups via Sirene gov registry (free, NAF-driven).
 *
 *   CH (language=fr) — Romandie only (French-speaking cantons): Geneva,
 *   Lausanne, Neuchâtel. Sirene is FR-government-only so Group B in CH runs
 *   via Google Places with tech-keyword queries.
 *
 *   NL (language=nl) — Amsterdam, Rotterdam, Den Haag, Utrecht, Eindhoven.
 *   Both groups via Google Places with Dutch niche keywords. Dutch email
 *   templates handled by emailPrompt.ts language branch.
 *
 * Idempotent on brief name — safe to re-run.
 */

interface Preset {
  name: string;
  niche: string;
  city: string;
  country: string;
  source: "google_places" | "sirene_api";
  language: "fr" | "nl";
  minRating?: number;
  minReviews?: number;
  maxPerRun: number;
  qualityThreshold: number;
}

// NAF reference (French gov registry):
//   62.01Z software, 62.02A IT consulting, 63.12Z web platforms,
//   73.11Z digital agencies, 70.22Z management consulting
const NAF_TECH = "62.01Z,62.02A,62.02B,62.09Z,63.11Z,63.12Z";
const NAF_DIGITAL_AGENCY = "73.11Z,74.10Z";
const NAF_IT_CONSULT = "62.02A,62.02B,70.22Z";

const PRESETS: Preset[] = [
  // ═══════════════════════════════════════════════════════════════════
  //   FRANCE — Group A (B2B services via Google Places)
  // ═══════════════════════════════════════════════════════════════════
  // Paris
  { name: "[A] FR Consulting firms Paris", niche: "cabinet de conseil", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.4, minReviews: 15, maxPerRun: 3, qualityThreshold: 6 },
  { name: "[A] FR Law firms Paris", niche: "cabinet d'avocats", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.4, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] FR Accountants Paris", niche: "expert-comptable", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.4, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] FR Marketing agencies Paris", niche: "agence de communication", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.4, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] FR Recruiters Paris", niche: "cabinet de recrutement", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.3, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] FR Architecture studios Paris", niche: "agence d'architecture", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.5, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  // Lyon / Marseille / Bordeaux / Toulouse
  { name: "[A] FR Consulting firms Lyon", niche: "cabinet de conseil", city: "Lyon", country: "FR", source: "google_places", language: "fr", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] FR Marketing agencies Lyon", niche: "agence de communication", city: "Lyon", country: "FR", source: "google_places", language: "fr", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] FR Consulting firms Marseille", niche: "cabinet de conseil", city: "Marseille", country: "FR", source: "google_places", language: "fr", minRating: 4.3, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] FR Consulting firms Bordeaux", niche: "cabinet de conseil", city: "Bordeaux", country: "FR", source: "google_places", language: "fr", minRating: 4.3, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] FR Consulting firms Toulouse", niche: "cabinet de conseil", city: "Toulouse", country: "FR", source: "google_places", language: "fr", minRating: 4.3, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },

  // ═══════════════════════════════════════════════════════════════════
  //   FRANCE — Group B (FR tech / SaaS via Sirene gov registry, free)
  // ═══════════════════════════════════════════════════════════════════
  { name: "[B] FR Tech startups Paris", niche: NAF_TECH, city: "Paris", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 3, qualityThreshold: 5 },
  { name: "[B] FR IT consultancies Paris", niche: NAF_IT_CONSULT, city: "Paris", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] FR Digital agencies Paris", niche: NAF_DIGITAL_AGENCY, city: "Paris", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] FR Tech startups Lyon", niche: NAF_TECH, city: "Lyon", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] FR Tech startups Marseille", niche: NAF_TECH, city: "Marseille", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] FR Tech startups Toulouse", niche: NAF_TECH, city: "Toulouse", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] FR Tech startups Bordeaux", niche: NAF_TECH, city: "Bordeaux", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] FR Tech startups Nantes", niche: NAF_TECH, city: "Nantes", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] FR Tech startups Lille", niche: NAF_TECH, city: "Lille", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },

  // ═══════════════════════════════════════════════════════════════════
  //   SWITZERLAND — Romandie only (French-speaking cantons), language=fr
  //   No Sirene equivalent for CH — Group B runs via Google Places too.
  // ═══════════════════════════════════════════════════════════════════
  // Group A
  { name: "[A] CH Consulting firms Geneva", niche: "cabinet de conseil", city: "Geneva", country: "CH", source: "google_places", language: "fr", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] CH Law firms Geneva", niche: "cabinet d'avocats", city: "Geneva", country: "CH", source: "google_places", language: "fr", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] CH Accountants Geneva", niche: "fiduciaire", city: "Geneva", country: "CH", source: "google_places", language: "fr", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] CH Marketing agencies Geneva", niche: "agence de communication", city: "Geneva", country: "CH", source: "google_places", language: "fr", minRating: 4.4, minReviews: 8, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] CH Consulting firms Lausanne", niche: "cabinet de conseil", city: "Lausanne", country: "CH", source: "google_places", language: "fr", minRating: 4.4, minReviews: 8, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] CH Law firms Lausanne", niche: "cabinet d'avocats", city: "Lausanne", country: "CH", source: "google_places", language: "fr", minRating: 4.4, minReviews: 8, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] CH Marketing agencies Lausanne", niche: "agence de communication", city: "Lausanne", country: "CH", source: "google_places", language: "fr", minRating: 4.4, minReviews: 8, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] CH Consulting firms Neuchâtel", niche: "cabinet de conseil", city: "Neuchâtel", country: "CH", source: "google_places", language: "fr", minRating: 4.2, minReviews: 5, maxPerRun: 2, qualityThreshold: 5 },
  // Group B (Google Places with tech queries — Sirene = FR-only)
  { name: "[B] CH Tech companies Geneva", niche: "software development company", city: "Geneva", country: "CH", source: "google_places", language: "fr", minRating: 4.3, minReviews: 5, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] CH Digital agencies Geneva", niche: "agence digitale", city: "Geneva", country: "CH", source: "google_places", language: "fr", minRating: 4.3, minReviews: 5, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] CH Tech companies Lausanne", niche: "software development company", city: "Lausanne", country: "CH", source: "google_places", language: "fr", minRating: 4.3, minReviews: 5, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] CH Digital agencies Lausanne", niche: "agence digitale", city: "Lausanne", country: "CH", source: "google_places", language: "fr", minRating: 4.3, minReviews: 5, maxPerRun: 2, qualityThreshold: 5 },

  // ═══════════════════════════════════════════════════════════════════
  //   NETHERLANDS — language=nl, Dutch templates auto-applied via prospect.language
  // ═══════════════════════════════════════════════════════════════════
  // Group A — B2B services with Dutch niche keywords
  { name: "[A] NL Consultancies Amsterdam", niche: "adviesbureau", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] NL Law firms Amsterdam", niche: "advocatenkantoor", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] NL Accountants Amsterdam", niche: "accountantskantoor", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] NL Marketing agencies Amsterdam", niche: "marketingbureau", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] NL Architecture studios Amsterdam", niche: "architectenbureau", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.5, minReviews: 8, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] NL Consultancies Rotterdam", niche: "adviesbureau", city: "Rotterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 8, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] NL Law firms Rotterdam", niche: "advocatenkantoor", city: "Rotterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 8, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] NL Consultancies Utrecht", niche: "adviesbureau", city: "Utrecht", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 8, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] NL Marketing agencies Utrecht", niche: "marketingbureau", city: "Utrecht", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 8, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] NL Consultancies Den Haag", niche: "adviesbureau", city: "Den Haag", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 8, maxPerRun: 2, qualityThreshold: 6 },
  // Group B — Tech / SaaS via Google Places (no Sirene in NL)
  { name: "[B] NL Tech startups Amsterdam", niche: "software bedrijf", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 5, maxPerRun: 3, qualityThreshold: 5 },
  { name: "[B] NL Digital agencies Amsterdam", niche: "digital agency", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 5, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] NL SaaS companies Amsterdam", niche: "saas company", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 5, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] NL Tech startups Eindhoven", niche: "software bedrijf", city: "Eindhoven", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 5, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] NL Tech startups Utrecht", niche: "software bedrijf", city: "Utrecht", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 5, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] NL Tech startups Rotterdam", niche: "software bedrijf", city: "Rotterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 5, maxPerRun: 2, qualityThreshold: 5 },
];

export async function POST(_req: NextRequest) {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const p of PRESETS) {
    const existing = await prisma.searchBrief.findFirst({ where: { name: p.name } });
    if (existing) {
      skipped.push(p.name);
      continue;
    }
    await prisma.searchBrief.create({
      data: {
        name: p.name,
        niche: p.niche,
        city: p.city,
        country: p.country,
        source: p.source,
        language: p.language,
        minRating: p.minRating ?? null,
        minReviews: p.minReviews ?? null,
        maxPerRun: p.maxPerRun,
        qualityThreshold: p.qualityThreshold,
        autoGenerate: true,
        autoSchedule: true,
        active: true,
      },
    });
    created.push(p.name);
  }

  return NextResponse.json({
    ok: true,
    created: created.length,
    skipped: skipped.length,
    createdNames: created,
    skippedNames: skipped,
  });
}
