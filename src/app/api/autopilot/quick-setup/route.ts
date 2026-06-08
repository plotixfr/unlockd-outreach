import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Quick Setup — seeds the curated brief set for Unlockd's TRUE target market:
 *
 *  Group A — Industrial / B2B SMEs with budget but no in-house IT
 *            (construction, fire safety, HVAC, installation trades, industrial
 *             cleaning, logistics, security). FR via Sirene gov registry (NAF
 *             codes), CH/NL via Google Places with sector keywords.
 *
 *  Group B — Small lifestyle / service businesses needing premium web presence
 *            (yoga, pilates, beauty institutes, spas, gastronomic restaurants,
 *             pâtisseries, florists, vet clinics).
 *
 *  EXPLICITLY NOT targeting agencies, consultancies, lawyers, accountants,
 *  tech startups, digital agencies — these already have IT teams or delegate
 *  internally and don't convert.
 *
 *  Idempotent on brief name — safe to re-run.
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

const NAF_CONSTRUCTION = "41.20A,41.20B,42.99Z";
const NAF_INSTALLATION = "43.21A,43.22A,43.22B,43.91A,43.99A";
const NAF_INDUSTRIAL_SVC = "80.20Z,81.22Z,38.11Z,33.20A";
const NAF_LOGISTICS = "49.41A,52.10A";

const PRESETS: Preset[] = [
  // France — Group A via Sirene
  { name: "[A] FR Construction firms Paris", niche: NAF_CONSTRUCTION, city: "Paris", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 3, qualityThreshold: 5 },
  { name: "[A] FR HVAC + plumbing Paris", niche: NAF_INSTALLATION, city: "Paris", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 3, qualityThreshold: 5 },
  { name: "[A] FR Industrial services Paris", niche: NAF_INDUSTRIAL_SVC, city: "Paris", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] FR Logistics Paris", niche: NAF_LOGISTICS, city: "Paris", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] FR Construction firms Lyon", niche: NAF_CONSTRUCTION, city: "Lyon", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] FR HVAC + plumbing Lyon", niche: NAF_INSTALLATION, city: "Lyon", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] FR Construction firms Marseille", niche: NAF_CONSTRUCTION, city: "Marseille", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] FR Construction firms Bordeaux", niche: NAF_CONSTRUCTION, city: "Bordeaux", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] FR Construction firms Toulouse", niche: NAF_CONSTRUCTION, city: "Toulouse", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] FR Construction firms Nantes", niche: NAF_CONSTRUCTION, city: "Nantes", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] FR Industrial services Lille", niche: NAF_INDUSTRIAL_SVC, city: "Lille", country: "FR", source: "sirene_api", language: "fr", maxPerRun: 2, qualityThreshold: 5 },

  // France — Group B via Google Places
  { name: "[B] FR Yoga studios Paris", niche: "studio de yoga", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.6, minReviews: 30, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] FR Pilates studios Paris", niche: "studio de pilates", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.6, minReviews: 25, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] FR Boutique fitness Paris", niche: "salle de sport premium", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.4, minReviews: 40, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] FR Beauty institutes Paris", niche: "institut de beauté", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.5, minReviews: 30, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] FR Premium spas Paris", niche: "spa premium", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.5, minReviews: 30, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] FR Aesthetic clinics Paris", niche: "clinique esthétique", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.5, minReviews: 25, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] FR Gastronomic restaurants Paris", niche: "restaurant gastronomique", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.5, minReviews: 80, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] FR Artisan pâtisseries Paris", niche: "pâtisserie artisanale", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.5, minReviews: 40, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] FR Florists Paris", niche: "fleuriste haut de gamme", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.6, minReviews: 25, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] FR Vet clinics Paris", niche: "clinique vétérinaire", city: "Paris", country: "FR", source: "google_places", language: "fr", minRating: 4.5, minReviews: 25, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] FR Yoga studios Lyon", niche: "studio de yoga", city: "Lyon", country: "FR", source: "google_places", language: "fr", minRating: 4.6, minReviews: 20, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] FR Beauty institutes Lyon", niche: "institut de beauté", city: "Lyon", country: "FR", source: "google_places", language: "fr", minRating: 4.5, minReviews: 20, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] FR Yoga studios Marseille", niche: "studio de yoga", city: "Marseille", country: "FR", source: "google_places", language: "fr", minRating: 4.6, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] FR Boutique hotels Bordeaux", niche: "hôtel boutique", city: "Bordeaux", country: "FR", source: "google_places", language: "fr", minRating: 4.4, minReviews: 40, maxPerRun: 2, qualityThreshold: 6 },

  // Switzerland Romandie
  { name: "[A] CH Construction firms Geneva", niche: "entreprise de construction", city: "Geneva", country: "CH", source: "google_places", language: "fr", minRating: 4.2, minReviews: 8, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] CH HVAC + plumbing Geneva", niche: "entreprise de chauffage sanitaire", city: "Geneva", country: "CH", source: "google_places", language: "fr", minRating: 4.2, minReviews: 8, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] CH Fire safety Geneva", niche: "sécurité incendie entreprise", city: "Geneva", country: "CH", source: "google_places", language: "fr", minRating: 4.0, minReviews: 5, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] CH Construction firms Lausanne", niche: "entreprise de construction", city: "Lausanne", country: "CH", source: "google_places", language: "fr", minRating: 4.2, minReviews: 8, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] CH Yoga studios Geneva", niche: "studio de yoga", city: "Geneva", country: "CH", source: "google_places", language: "fr", minRating: 4.6, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] CH Beauty institutes Geneva", niche: "institut de beauté", city: "Geneva", country: "CH", source: "google_places", language: "fr", minRating: 4.5, minReviews: 12, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] CH Gastronomic restaurants Geneva", niche: "restaurant gastronomique", city: "Geneva", country: "CH", source: "google_places", language: "fr", minRating: 4.5, minReviews: 40, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] CH Yoga studios Lausanne", niche: "studio de yoga", city: "Lausanne", country: "CH", source: "google_places", language: "fr", minRating: 4.6, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] CH Beauty institutes Lausanne", niche: "institut de beauté", city: "Lausanne", country: "CH", source: "google_places", language: "fr", minRating: 4.5, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },

  // Netherlands
  { name: "[A] NL Construction firms Amsterdam", niche: "bouwbedrijf", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 10, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] NL HVAC installers Amsterdam", niche: "installatiebedrijf verwarming", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 8, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] NL Electricians Amsterdam", niche: "elektricien bedrijf", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 8, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] NL Fire safety Amsterdam", niche: "brandbeveiliging bedrijf", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.0, minReviews: 5, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] NL Industrial cleaning Amsterdam", niche: "industriële schoonmaak", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.2, minReviews: 5, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] NL Construction firms Rotterdam", niche: "bouwbedrijf", city: "Rotterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 10, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[A] NL Construction firms Utrecht", niche: "bouwbedrijf", city: "Utrecht", country: "NL", source: "google_places", language: "nl", minRating: 4.3, minReviews: 8, maxPerRun: 2, qualityThreshold: 5 },
  { name: "[B] NL Yoga studios Amsterdam", niche: "yogastudio", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.6, minReviews: 30, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] NL Pilates studios Amsterdam", niche: "pilatesstudio", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.6, minReviews: 20, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] NL Beauty salons Amsterdam", niche: "schoonheidssalon", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.5, minReviews: 25, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] NL Premium spas Amsterdam", niche: "wellness spa", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.5, minReviews: 20, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] NL Gastronomic restaurants Amsterdam", niche: "fine dining restaurant", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.5, minReviews: 60, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] NL Florists Amsterdam", niche: "premium bloemist", city: "Amsterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.5, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] NL Yoga studios Rotterdam", niche: "yogastudio", city: "Rotterdam", country: "NL", source: "google_places", language: "nl", minRating: 4.6, minReviews: 20, maxPerRun: 2, qualityThreshold: 6 },
  { name: "[B] NL Beauty salons Utrecht", niche: "schoonheidssalon", city: "Utrecht", country: "NL", source: "google_places", language: "nl", minRating: 4.5, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
];

export async function POST(_req: NextRequest) {
  const created: string[] = [];
  const skipped: string[] = [];
  for (const p of PRESETS) {
    const existing = await prisma.searchBrief.findFirst({ where: { name: p.name } });
    if (existing) { skipped.push(p.name); continue; }
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
  return NextResponse.json({ ok: true, created: created.length, skipped: skipped.length, createdNames: created, skippedNames: skipped });
}
