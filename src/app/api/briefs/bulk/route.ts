import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Bulk brief creation from a pasted list. Used when the operator wants to
 * target any niche/city pairing not already covered by Quick Setup —
 * "Avocats Marseille", "Dentistes Lyon", "Cabinet kiné Bordeaux", whatever.
 *
 * Input format (per row): "niche, city, [country], [minRating], [minReviews]"
 * Examples:
 *   Avocats, Marseille
 *   Dentistes, Lyon, FR, 4.5, 30
 *   Photographe mariage, Bordeaux
 *
 * Idempotent on auto-generated brief name ("{niche} {city}"). Re-running with
 * the same lines is safe.
 */

interface ParsedLine {
  niche: string;
  city: string;
  country: string;
  minRating: number | null;
  minReviews: number | null;
  raw: string;
}

interface BulkResult {
  line: string;
  status: "created" | "skipped" | "invalid";
  reason?: string;
  briefName?: string;
}

function parseLine(raw: string): ParsedLine | null {
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const niche = parts[0];
  const city = parts[1];
  if (!niche || !city) return null;
  const country = parts[2] && parts[2].length <= 4 ? parts[2].toUpperCase() : "FR";
  const minRating = parts[3] ? parseFloat(parts[3]) : null;
  const minReviews = parts[4] ? parseInt(parts[4], 10) : null;
  return {
    niche,
    city,
    country,
    minRating: minRating != null && isFinite(minRating) ? Math.min(5, Math.max(0, minRating)) : null,
    minReviews: minReviews != null && isFinite(minReviews) ? Math.max(0, Math.round(minReviews)) : null,
    raw,
  };
}

export async function POST(req: NextRequest) {
  let body: {
    text?: string;
    maxPerRun?: number;
    qualityThreshold?: number;
    autoGenerate?: boolean;
    autoSchedule?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : "";
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  if (lines.length === 0) {
    return NextResponse.json({ error: "No lines" }, { status: 400 });
  }

  const maxPerRun = Math.max(1, Math.min(20, Math.round(body.maxPerRun ?? 2)));
  const qualityThreshold = Math.max(1, Math.min(10, Math.round(body.qualityThreshold ?? 6)));
  const autoGenerate = body.autoGenerate !== false;
  const autoSchedule = body.autoSchedule !== false;

  const results: BulkResult[] = [];

  for (const raw of lines) {
    const parsed = parseLine(raw);
    if (!parsed) {
      results.push({ line: raw, status: "invalid", reason: "format: 'niše, grad' (min 2 polja)" });
      continue;
    }
    const briefName = `${parsed.niche} ${parsed.city}`;
    const existing = await prisma.searchBrief.findFirst({ where: { name: briefName } });
    if (existing) {
      results.push({ line: raw, status: "skipped", reason: "already exists", briefName });
      continue;
    }
    try {
      await prisma.searchBrief.create({
        data: {
          name: briefName,
          niche: parsed.niche,
          city: parsed.city,
          country: parsed.country,
          minRating: parsed.minRating,
          minReviews: parsed.minReviews,
          maxPerRun,
          qualityThreshold,
          autoGenerate,
          autoSchedule,
          active: true,
        },
      });
      results.push({ line: raw, status: "created", briefName });
    } catch (e) {
      results.push({
        line: raw,
        status: "invalid",
        reason: e instanceof Error ? e.message : "DB error",
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    created: results.filter((r) => r.status === "created").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    invalid: results.filter((r) => r.status === "invalid").length,
    results,
  });
}
