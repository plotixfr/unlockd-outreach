import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * One-click setup. Creates a wide net of curated SearchBriefs covering every
 * meaningful premium B2B vertical Unlockd can plausibly serve — not just
 * hotels and restaurants. Idempotent on brief name; safe to re-run.
 *
 * Sizing: most briefs are maxPerRun=2 so a daily run discovers ~50–60
 * prospects. Quality gate (score ≥ 6) typically prunes ~half. The send cron
 * then drains them at DAILY_SEND_CAP so the sender domain reputation stays
 * intact.
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
  // ── Hospitality premium ──
  { name: "Hôtels 4-5★ Paris",            niche: "Hotel",      city: "Paris",    country: "FR", minRating: 4.3, minReviews: 100, maxPerRun: 3, qualityThreshold: 6 },
  { name: "Hôtels Côte d'Azur",           niche: "Hotel",      city: "Nice",     country: "FR", minRating: 4.3, minReviews: 80,  maxPerRun: 2, qualityThreshold: 6 },
  { name: "Hôtels boutique Bordeaux",     niche: "Hotel",      city: "Bordeaux", country: "FR", minRating: 4.3, minReviews: 50,  maxPerRun: 2, qualityThreshold: 6 },
  { name: "Hôtels Cannes / Saint-Tropez", niche: "Hotel",      city: "Cannes",   country: "FR", minRating: 4.3, minReviews: 50,  maxPerRun: 2, qualityThreshold: 6 },

  // ── Gastronomie ──
  { name: "Restaurants gastro Paris",     niche: "Restaurant", city: "Paris", country: "FR", minRating: 4.5, minReviews: 100, maxPerRun: 3, qualityThreshold: 6 },
  { name: "Restaurants gastro Lyon",      niche: "Restaurant", city: "Lyon",  country: "FR", minRating: 4.5, minReviews: 80,  maxPerRun: 2, qualityThreshold: 6 },
  { name: "Pâtisseries premium Paris",    niche: "Pâtisserie", city: "Paris", country: "FR", minRating: 4.4, minReviews: 50,  maxPerRun: 2, qualityThreshold: 6 },
  { name: "Caves à vins Paris",           niche: "Cave à vins", city: "Paris", country: "FR", minRating: 4.4, minReviews: 30, maxPerRun: 2, qualityThreshold: 6 },

  // ── Immobilier ──
  { name: "Immobilier prestige Paris",    niche: "Agence immobilière", city: "Paris",  country: "FR", minRating: 4.2, minReviews: 30, maxPerRun: 3, qualityThreshold: 6 },
  { name: "Immobilier Côte d'Azur",       niche: "Agence immobilière", city: "Cannes", country: "FR", minRating: 4.0, minReviews: 20, maxPerRun: 2, qualityThreshold: 6 },

  // ── Architecture & Design ──
  { name: "Architectes Paris",            niche: "Architecte",            city: "Paris", country: "FR", minRating: 4.5, minReviews: 20, maxPerRun: 2, qualityThreshold: 6 },
  { name: "Architectes d'intérieur Paris", niche: "Architecte d'intérieur", city: "Paris", country: "FR", minRating: 4.5, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },

  // ── Wellness / Santé premium ──
  { name: "Spas premium Paris",           niche: "Spa",                 city: "Paris", country: "FR", minRating: 4.3, minReviews: 50, maxPerRun: 2, qualityThreshold: 6 },
  { name: "Cliniques esthétiques Paris",  niche: "Clinique esthétique", city: "Paris", country: "FR", minRating: 4.4, minReviews: 30, maxPerRun: 2, qualityThreshold: 6 },
  { name: "Cabinets dentaires Paris",     niche: "Cabinet dentaire",    city: "Paris", country: "FR", minRating: 4.5, minReviews: 30, maxPerRun: 2, qualityThreshold: 6 },

  // ── Beauté ──
  { name: "Salons de coiffure premium Paris", niche: "Salon de coiffure", city: "Paris", country: "FR", minRating: 4.5, minReviews: 80, maxPerRun: 2, qualityThreshold: 6 },
  { name: "Instituts de beauté Paris",        niche: "Institut de beauté", city: "Paris", country: "FR", minRating: 4.4, minReviews: 40, maxPerRun: 2, qualityThreshold: 6 },

  // ── Professions libérales / juridique ──
  { name: "Cabinets d'avocats Paris",     niche: "Cabinet d'avocats",  city: "Paris", country: "FR", minRating: 4.4, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "Notaires Paris",               niche: "Notaire",            city: "Paris", country: "FR", minRating: 4.0, minReviews: 10, maxPerRun: 2, qualityThreshold: 6 },
  { name: "Experts-comptables Paris",     niche: "Expert-comptable",   city: "Paris", country: "FR", minRating: 4.4, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },

  // ── Retail / luxe ──
  { name: "Bijouteries Paris",            niche: "Bijouterie",   city: "Paris", country: "FR", minRating: 4.5, minReviews: 30, maxPerRun: 2, qualityThreshold: 6 },
  { name: "Galeries d'art Paris",         niche: "Galerie d'art", city: "Paris", country: "FR", minRating: 4.5, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },
  { name: "Boutiques mode Paris",         niche: "Boutique mode", city: "Paris", country: "FR", minRating: 4.4, minReviews: 30, maxPerRun: 2, qualityThreshold: 6 },
  { name: "Concept stores Paris",         niche: "Concept store", city: "Paris", country: "FR", minRating: 4.4, minReviews: 20, maxPerRun: 2, qualityThreshold: 6 },

  // ── Fitness / wellness ──
  { name: "Salles de sport premium Paris", niche: "Salle de sport",   city: "Paris", country: "FR", minRating: 4.4, minReviews: 50, maxPerRun: 2, qualityThreshold: 6 },
  { name: "Studios de Pilates Paris",      niche: "Studio Pilates",   city: "Paris", country: "FR", minRating: 4.6, minReviews: 30, maxPerRun: 2, qualityThreshold: 6 },
  { name: "Studios de Yoga Paris",         niche: "Studio Yoga",      city: "Paris", country: "FR", minRating: 4.6, minReviews: 30, maxPerRun: 2, qualityThreshold: 6 },

  // ── Créatif / media ──
  { name: "Photographes mariage Paris",   niche: "Photographe",       city: "Paris", country: "FR", minRating: 4.7, minReviews: 30, maxPerRun: 2, qualityThreshold: 6 },
  { name: "Agences de communication Paris", niche: "Agence de communication", city: "Paris", country: "FR", minRating: 4.4, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },

  // ── Éducation / formation ──
  { name: "Écoles privées Paris",         niche: "École privée",      city: "Paris", country: "FR", minRating: 4.2, minReviews: 20, maxPerRun: 2, qualityThreshold: 6 },
  { name: "Coachings premium Paris",      niche: "Coaching",          city: "Paris", country: "FR", minRating: 4.6, minReviews: 15, maxPerRun: 2, qualityThreshold: 6 },

  // ── Auto premium ──
  { name: "Concessionnaires haut de gamme Paris", niche: "Concessionnaire automobile", city: "Paris", country: "FR", minRating: 4.2, minReviews: 30, maxPerRun: 2, qualityThreshold: 6 },
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
