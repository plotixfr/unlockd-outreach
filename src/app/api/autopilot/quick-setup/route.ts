import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * One-click setup: creates a curated set of briefs covering Unlockd's
 * highest-value French market (premium hotels, gastro restaurants,
 * architects, real estate, spas, luxury boutiques across Paris + the major
 * tourist hubs). Idempotent on brief name — re-running is safe.
 *
 * Sized so the union of all briefs produces ~30 new prospects/day on
 * weekdays, which matches the default DAILY_SEND_CAP. Daily cron then drains
 * them at a rate that doesn't burn the sender domain reputation.
 */

interface Preset {
  name: string;
  niche: string;
  city: string;
  country: string;
  minRating: number;
  minReviews: number;
  maxPerRun: number;
  qualityThreshold: number;
}

const PRESETS: Preset[] = [
  // Hôtels premium
  { name: "Hôtels 4-5★ Paris",            niche: "Hotel",        city: "Paris",      country: "FR", minRating: 4.3, minReviews: 100, maxPerRun: 3, qualityThreshold: 6 },
  { name: "Hôtels Côte d'Azur",           niche: "Hotel",        city: "Nice",       country: "FR", minRating: 4.3, minReviews: 80,  maxPerRun: 3, qualityThreshold: 6 },
  { name: "Hôtels boutique Bordeaux",     niche: "Hotel",        city: "Bordeaux",   country: "FR", minRating: 4.3, minReviews: 50,  maxPerRun: 3, qualityThreshold: 6 },
  { name: "Hôtels Saint-Tropez / Cannes", niche: "Hotel",        city: "Cannes",     country: "FR", minRating: 4.3, minReviews: 50,  maxPerRun: 2, qualityThreshold: 6 },

  // Restaurants gastronomiques
  { name: "Restaurants gastro Paris",     niche: "Restaurant",   city: "Paris",      country: "FR", minRating: 4.5, minReviews: 100, maxPerRun: 3, qualityThreshold: 6 },
  { name: "Restaurants gastro Lyon",      niche: "Restaurant",   city: "Lyon",       country: "FR", minRating: 4.5, minReviews: 80,  maxPerRun: 3, qualityThreshold: 6 },

  // Immobilier prestige
  { name: "Immobilier prestige Paris",    niche: "Property",     city: "Paris",      country: "FR", minRating: 4.2, minReviews: 30,  maxPerRun: 3, qualityThreshold: 6 },
  { name: "Immobilier Côte d'Azur",       niche: "Property",     city: "Cannes",     country: "FR", minRating: 4.0, minReviews: 20,  maxPerRun: 2, qualityThreshold: 6 },

  // Architectes
  { name: "Architectes Paris",            niche: "Architecture", city: "Paris",      country: "FR", minRating: 4.5, minReviews: 20,  maxPerRun: 3, qualityThreshold: 6 },

  // Spas + luxury boutiques
  { name: "Spas premium Paris",           niche: "Spa",          city: "Paris",      country: "FR", minRating: 4.3, minReviews: 50,  maxPerRun: 2, qualityThreshold: 6 },
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
        minRating: p.minRating,
        minReviews: p.minReviews,
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
