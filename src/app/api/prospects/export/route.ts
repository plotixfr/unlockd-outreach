import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const COLUMNS = [
  "firmaNaziv",
  "kontaktIme",
  "kontaktPozicija",
  "email",
  "website",
  "instagram",
  "nisa",
  "grad",
  "opisFirme",
  "kvalitetSajta",
  "napomena",
  "status",
  "datumPrvogMaila",
  "datumFollowUp1",
  "datumFollowUp2",
  "datumFollowUp3",
  "datumOdgovora",
] as const;

function csvCell(v: unknown): string {
  if (v == null) return "";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else s = String(v);
  // Quote if contains comma, quote, or newline. Inner quotes are doubled.
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || undefined;
  const nisa = searchParams.get("nisa") || undefined;
  const status = searchParams.get("status") || undefined;

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { firmaNaziv: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { grad: { contains: search, mode: "insensitive" } },
    ];
  }
  if (nisa) where.nisa = nisa;
  if (status) where.status = status;

  const prospects = await prisma.prospect.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const header = COLUMNS.join(",");
  const rows = prospects.map((p) =>
    COLUMNS.map((c) => csvCell((p as Record<string, unknown>)[c])).join(",")
  );
  // BOM so Excel parses UTF-8 correctly.
  const body = "﻿" + [header, ...rows].join("\n");

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `prospects-${stamp}.csv`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
