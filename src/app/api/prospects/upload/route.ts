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
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fajl nije pronađen" }, { status: 400 });
  }

  const text = await file.text();
  const { data, errors } = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });

  if (errors.length > 0) {
    return NextResponse.json(
      { error: "CSV greška: " + errors[0].message },
      { status: 400 }
    );
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

  // Find which emails already exist
  const incomingEmails = valid.map((r) => r.email);
  const existing = await prisma.prospect.findMany({
    where: { email: { in: incomingEmails } },
    select: { email: true },
  });
  const existingSet = new Set(existing.map((e) => e.email));

  const toCreate = valid.filter((r) => !existingSet.has(r.email));
  const skipped = valid.length - toCreate.length;

  for (const row of toCreate) {
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
  }

  return NextResponse.json({
    created: toCreate.length,
    skipped,
    invalid: invalid.slice(0, 10),
  });
}
