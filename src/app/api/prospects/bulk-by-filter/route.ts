import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Filter {
  search?: string;
  nisa?: string;
  status?: string;
}

function whereFromFilter(filter: Filter) {
  const where: Record<string, unknown> = {};
  if (filter.search) {
    where.OR = [
      { firmaNaziv: { contains: filter.search, mode: "insensitive" } },
      { email: { contains: filter.search, mode: "insensitive" } },
      { grad: { contains: filter.search, mode: "insensitive" } },
    ];
  }
  if (filter.nisa) where.nisa = filter.nisa;
  if (filter.status) where.status = filter.status;
  return where;
}

export async function POST(req: NextRequest) {
  try {
    let body: { action?: string; filter?: Filter } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
    }
    const { action, filter = {} } = body;
    if (!action) return NextResponse.json({ error: "action je obavezan" }, { status: 400 });

    const where = whereFromFilter(filter);

    if (action === "delete") {
      const result = await prisma.prospect.deleteMany({ where });
      return NextResponse.json({ success: true, deleted: result.count });
    }

    if (action === "count") {
      const count = await prisma.prospect.count({ where });
      return NextResponse.json({ count });
    }

    if (action === "ids") {
      // Return IDs matching the filter — used by the UI to chain into the
      // existing /api/prospects/bulk (generate/schedule) without re-querying.
      const rows = await prisma.prospect.findMany({ where, select: { id: true } });
      return NextResponse.json({ ids: rows.map((r) => r.id) });
    }

    return NextResponse.json({ error: "Nepoznata akcija" }, { status: 400 });
  } catch (err) {
    console.error("[bulk-by-filter]", err);
    return NextResponse.json({ error: "Serverska greška" }, { status: 500 });
  }
}
