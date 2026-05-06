import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { NISE, STATUSI } from "@/lib/constants";

const ProspectRowSchema = z.object({
  firmaNaziv: z.string().min(1),
  kontaktIme: z.string().optional(),
  kontaktPozicija: z.string().optional(),
  email: z.string().email(),
  website: z.string().optional(),
  instagram: z.string().optional(),
  nisa: z.enum(NISE),
  grad: z.string().min(1),
  opisFirme: z.string().optional(),
  kvalitetSajta: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined))
    .refine((v) => v === undefined || (v >= 1 && v <= 5)),
  napomena: z.string().optional(),
  status: z.enum(STATUSI).optional().default("New"),
});

export async function POST(req: NextRequest) {
  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "Neispravan request format" }, { status: 400 });
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fajl nije pronađen u request-u" }, { status: 400 });
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      return NextResponse.json({ error: "Greška pri čitanju fajla" }, { status: 400 });
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "Fajl je prazan" }, { status: 400 });
    }

    const { data, errors } = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      transform: (v) => v.trim(),
    });

    if (errors.length > 0 && data.length === 0) {
      return NextResponse.json(
        { error: "CSV greška: " + errors[0].message },
        { status: 400 }
      );
    }

    if (data.length === 0) {
      return NextResponse.json({ error: "CSV fajl nema podataka" }, { status: 400 });
    }

    const valid: z.infer<typeof ProspectRowSchema>[] = [];
    const invalid: { row: number; error: string }[] = [];

    for (let i = 0; i < data.length; i++) {
      const result = ProspectRowSchema.safeParse(data[i]);
      if (result.success) {
        valid.push(result.data);
      } else {
        invalid.push({ row: i + 2, error: result.error.issues[0].message });
      }
    }

    if (valid.length === 0) {
      return NextResponse.json(
        { error: "Nema validnih redova", invalid: invalid.slice(0, 5) },
        { status: 400 }
      );
    }

    // Find existing emails to count skips
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
            kontaktIme: row.kontaktIme || null,
            kontaktPozicija: row.kontaktPozicija || null,
            email: row.email,
            website: row.website || null,
            instagram: row.instagram || null,
            nisa: row.nisa,
            grad: row.grad,
            opisFirme: row.opisFirme || null,
            kvalitetSajta: row.kvalitetSajta ?? null,
            napomena: row.napomena || null,
            status: row.status,
          },
        });
        created++;
      } catch {
        // Race condition duplicate — count as skipped
      }
    }

    return NextResponse.json({
      created,
      skipped: skipped + (toCreate.length - created),
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
