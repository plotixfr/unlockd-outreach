import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { STATUSI } from "@/lib/constants";

// PapaParse returns "" for empty cells; Zod enums don't accept "".
// This helper converts empty string → undefined so optional() works.
const optStr = z
  .string()
  .optional()
  .transform((v) => v || undefined);

// Common aliases get normalised to a canonical label so the dashboard filters
// don't fragment ("hotel" vs "Hôtel" vs "hotellerie"). Anything not in the map
// is passed through as-is — Claude handles arbitrary niches at generation time.
const NICHE_ALIAS: Record<string, string> = {
  hotel: "Hotel",
  hôtel: "Hotel",
  hotellerie: "Hotel",
  hôtellerie: "Hotel",
  restaurant: "Restaurant",
  restauration: "Restaurant",
  architecture: "Architecture",
  architecte: "Architecture",
  property: "Property",
  propriete: "Property",
  propriété: "Property",
  immobilier: "Property",
  "real estate": "Property",
};

const ProspectRowSchema = z.object({
  firmaNaziv: z.string().min(1, "firmaNaziv je obavezno"),
  kontaktIme: optStr,
  kontaktPozicija: optStr,
  email: z.string().email("Neispravan email"),
  website: optStr,
  instagram: optStr,
  // Niche is free-form: any non-empty string is accepted. Known aliases are
  // normalised so the dashboard filters stay consistent.
  nisa: z
    .string()
    .min(1, "nisa je obavezno")
    .transform((v) => {
      const trimmed = v.trim();
      return NICHE_ALIAS[trimmed.toLowerCase()] ?? trimmed;
    }),
  grad: z.string().min(1, "grad je obavezno"),
  opisFirme: optStr,
  // Clamp kvalitetSajta to 1–5, skip invalid/missing silently
  kvalitetSajta: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const n = parseInt(v, 10);
      if (isNaN(n)) return undefined;
      return Math.min(5, Math.max(1, n));
    }),
  napomena: optStr,
  // Accept any status from enum or default to New
  status: z
    .string()
    .optional()
    .transform((v) =>
      v && (STATUSI as readonly string[]).includes(v) ? v : "New"
    ),
});

export async function POST(req: NextRequest) {
  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Neispravan multipart request" },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Fajl nije pronađen u request-u" },
        { status: 400 }
      );
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      return NextResponse.json(
        { error: "Greška pri čitanju fajla" },
        { status: 400 }
      );
    }

    // Strip BOM if present
    const cleanText = text.replace(/^﻿/, "").trim();
    if (!cleanText) {
      return NextResponse.json({ error: "Fajl je prazan" }, { status: 400 });
    }

    const { data, errors } = Papa.parse<Record<string, string>>(cleanText, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      transform: (v) => v.trim(),
    });

    if (data.length === 0) {
      const csvError = errors[0]?.message ?? "Nema podataka";
      return NextResponse.json(
        { error: `CSV greška: ${csvError}` },
        { status: 400 }
      );
    }

    console.log(`[upload] Parsed ${data.length} rows from CSV`);

    const valid: z.infer<typeof ProspectRowSchema>[] = [];
    const invalid: { row: number; error: string }[] = [];

    for (let i = 0; i < data.length; i++) {
      const result = ProspectRowSchema.safeParse(data[i]);
      if (result.success) {
        valid.push(result.data);
      } else {
        const firstError = result.error.issues[0];
        invalid.push({
          row: i + 2,
          error: `${firstError.path.join(".")}: ${firstError.message}`,
        });
      }
    }

    console.log(`[upload] Valid: ${valid.length} | Invalid: ${invalid.length} | Total: ${data.length}`);

    if (valid.length === 0) {
      return NextResponse.json(
        {
          error: `Nema validnih redova od ${data.length} ukupno`,
          invalid: invalid.slice(0, 10),
        },
        { status: 400 }
      );
    }

    // Bulk existence check to count skips
    const incomingEmails = valid.map((r) => r.email);
    const existing = await prisma.prospect.findMany({
      where: { email: { in: incomingEmails } },
      select: { email: true },
    });
    const existingSet = new Set(existing.map((e) => e.email));

    const toCreate = valid.filter((r) => !existingSet.has(r.email));
    const skipped = valid.length - toCreate.length;

    let created = 0;
    for (const row of toCreate) {
      try {
        await prisma.prospect.create({
          data: {
            firmaNaziv: row.firmaNaziv,
            kontaktIme: row.kontaktIme ?? null,
            kontaktPozicija: row.kontaktPozicija ?? null,
            email: row.email,
            website: row.website ?? null,
            instagram: row.instagram ?? null,
            nisa: row.nisa,
            grad: row.grad,
            opisFirme: row.opisFirme ?? null,
            kvalitetSajta: row.kvalitetSajta ?? null,
            napomena: row.napomena ?? null,
            status: row.status ?? "New",
          },
        });
        created++;
      } catch {
        // Race-condition duplicate — silently skip
      }
    }

    console.log(`[upload] Created: ${created} | Skipped (dup): ${skipped} | Skipped (race): ${toCreate.length - created}`);
    return NextResponse.json({
      created,
      skipped: skipped + (toCreate.length - created),
      invalidCount: invalid.length,
      invalid: invalid.slice(0, 10),
    });
  } catch (err) {
    console.error("[upload] Unhandled error:", err);
    return NextResponse.json(
      { error: "Serverska greška pri uvozu" },
      { status: 500 }
    );
  }
}
