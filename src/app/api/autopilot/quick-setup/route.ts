import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * One-click setup. Seeds two focused brief sets aligned with what Unlockd.art
 * actually sells: brand + website + custom software/automation.
 *
 * Group A — B2B professional services (Google Places):
 *   Consultancies, law firms, accountants, marketing/PR agencies, recruiters,
 *   B2B trainers, translators. People who need a real website + brand to
 *   stand out among peers.
 *
 * Group B — French tech startups / SaaS (Sirene gov registry, free):
 *   Software publishers, IT consultancies, web platforms, digital agencies.
 *   People who need custom internal tools, integrations, or process automation.
 *
 * Idempotent on brief name — safe to re-run.
 */

interface Preset {
  name: string;
  niche: string;
  city: string;
  country: string;
  source: "google_places" | "sirene_api";
  minRating?: number;
  minReviews?: number;
  maxPerRun: number;
  qualityThreshold: number;
}

// NAF code reference for Sirene briefs:
//   62.01Z  Software development
//   62.02A  IT consulting
//   62.02B  Maintenance of computer systems
//   62.09Z  Other IT activities
//   63.11Z  Data processing, hosting
//   63.12Z  Web portals / SaaS platforms
//   73.11Z  Advertising agencies (digital agencies)
//   70.22Z  Management consulting
const NAF_TECH = "62.01Z,62.02A,62.02B,62.09Z,63.11Z,63.12Z";
const NAF_DIGITAL_AGENCY = "73.11Z,74.10Z";
const NAF_IT_CONSULT = "62.02A,62.02B,70.22Z";

const PRESETS: Preset[] = [
  // ───── Group A — B2B professional services (Google Places) ─────
  // Paris
  { name: "[A] Consulting firms Paris",          niche: "cabinet de conseil",          city: "Paris",     country: "FR", source: "google_places", minRating: 4.4, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] Law firms Paris",                 niche: "cabinet d'avocats",           city: "Paris",     country: "FR", source: "google_places", minRating: 4.4, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] Accountants Paris",               niche: "expert-comptable",            city: "Paris",     country: "FR", source: "google_places", minRating: 4.4, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] Marketing agencies Paris",        niche: "agence de communication",     city: "Paris",     country: "FR", source: "google_places", minRating: 4.4, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] PR agencies Paris",               niche: "agence de relations presse",  city: "Paris",     country: "FR", source: "google_places", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] Recruiters Paris",                niche: "cabinet de recrutement",      city: "Paris",     country: "FR", source: "google_places", minRating: 4.3, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] HR consultants Paris",            niche: "cabinet RH",                  city: "Paris",     country: "FR", source: "google_places", minRating: 4.3, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] Architecture studios Paris",      niche: "agence d'architecture",       city: "Paris",     country: "FR", source: "google_places", minRating: 4.5, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] Translation agencies Paris",      niche: "agence de traduction",        city: "Paris",     country: "FR", source: "google_places", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] B2B training firms Paris",        niche: "organisme de formation B2B",  city: "Paris",     country: "FR", source: "google_places", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },

  // Lyon
  { name: "[A] Consulting firms Lyon",           niche: "cabinet de conseil",          city: "Lyon",      country: "FR", source: "google_places", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] Law firms Lyon",                  niche: "cabinet d'avocats",           city: "Lyon",      country: "FR", source: "google_places", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] Accountants Lyon",                niche: "expert-comptable",            city: "Lyon",      country: "FR", source: "google_places", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] Marketing agencies Lyon",         niche: "agence de communication",     city: "Lyon",      country: "FR", source: "google_places", minRating: 4.4, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] Architecture studios Lyon",       niche: "agence d'architecture",       city: "Lyon",      country: "FR", source: "google_places", minRating: 4.5, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },

  // Other major cities (lighter coverage)
  { name: "[A] Consulting firms Marseille",      niche: "cabinet de conseil",          city: "Marseille", country: "FR", source: "google_places", minRating: 4.3, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] Marketing agencies Marseille",    niche: "agence de communication",     city: "Marseille", country: "FR", source: "google_places", minRating: 4.3, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] Consulting firms Bordeaux",       niche: "cabinet de conseil",          city: "Bordeaux",  country: "FR", source: "google_places", minRating: 4.3, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] Marketing agencies Bordeaux",     niche: "agence de communication",     city: "Bordeaux",  country: "FR", source: "google_places", minRating: 4.3, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[A] Consulting firms Toulouse",       niche: "cabinet de conseil",          city: "Toulouse",  country: "FR", source: "google_places", minRating: 4.3, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },

  // ───── Group B — French tech startups / SaaS (Sirene gov API) ─────
  // niche field = NAF codes (parsed by Sirene adapter); name describes intent.
  { name: "[B] Tech startups Paris",             niche: NAF_TECH,             city: "Paris",     country: "FR", source: "sirene_api", maxPerRun: 3, qualityThreshold: 5 },
  { name: "[B] IT consultancies Paris",          niche: NAF_IT_CONSULT,       city: "Paris",     country: "FR", source: "sirene_api", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] Digital agencies Paris",          niche: NAF_DIGITAL_AGENCY,   city: "Paris",     country: "FR", source: "sirene_api", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] Tech startups Lyon",              niche: NAF_TECH,             city: "Lyon",      country: "FR", source: "sirene_api", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] IT consultancies Lyon",           niche: NAF_IT_CONSULT,       city: "Lyon",      country: "FR", source: "sirene_api", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] Tech startups Marseille",         niche: NAF_TECH,             city: "Marseille", country: "FR", source: "sirene_api", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] Tech startups Toulouse",          niche: NAF_TECH,             city: "Toulouse",  country: "FR", source: "sirene_api", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] Tech startups Bordeaux",          niche: NAF_TECH,             city: "Bordeaux",  country: "FR", source: "sirene_api", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] Tech startups Nantes",            niche: NAF_TECH,             city: "Nantes",    country: "FR", source: "sirene_api", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] Tech startups Lille",             niche: NAF_TECH,             city: "Lille",     country: "FR", source: "sirene_api", maxPerRun: 2, qualityThreshold: 5 },
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
