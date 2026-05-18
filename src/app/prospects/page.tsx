import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STATUSI } from "@/lib/constants";
import { ProspectsTable } from "@/components/ProspectsTable";
import { FilterActions } from "@/components/FilterActions";
import { ScoreUnscoredButton } from "@/components/ScoreUnscoredButton";

export const dynamic = "force-dynamic";

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; nisa?: string; status?: string }>;
}) {
  const { search, nisa, status } = await searchParams;

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

  const [prospects, niseGroups, unscoredCount] = await Promise.all([
    prisma.prospect.findMany({
      where,
      orderBy: [{ qualityScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      select: {
        id: true,
        firmaNaziv: true,
        email: true,
        nisa: true,
        grad: true,
        status: true,
        qualityScore: true,
        createdAt: true,
        _count: { select: { emails: true } },
      },
    }),
    prisma.prospect.groupBy({
      by: ["nisa"],
      orderBy: { nisa: "asc" },
    }),
    prisma.prospect.count({ where: { qualityScore: null } }),
  ]);
  const availableNise = niseGroups.map((g) => g.nisa);

  const makeHref = (key: string, value: string, current: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const next = { ...current, [key]: value };
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    return `/prospects?${params.toString()}`;
  };

  const currentFilters = { search, nisa, status };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Prospects</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {prospects.length} {prospects.length === 1 ? "prospect" : "prospekata"}
            {(search || nisa || status) && " (filtrirano)"}
          </p>
        </div>
        <Link
          href="/upload"
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          + Dodaj listu
        </Link>
      </div>

      {/* Filteri — niša */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex gap-1 bg-[#111118] border border-[#1f1f2e] rounded-lg p-1 flex-wrap">
          <Link
            href={makeHref("nisa", "", { ...currentFilters, nisa: undefined })}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${!nisa ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white hover:bg-[#1a1a28]"}`}
          >
            Sve niše
          </Link>
          {availableNise.map((n) => (
            <Link
              key={n}
              href={makeHref("nisa", n, currentFilters)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${nisa === n ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white hover:bg-[#1a1a28]"}`}
            >
              {n}
            </Link>
          ))}
        </div>

        {/* Filteri — status */}
        <div className="flex gap-1 bg-[#111118] border border-[#1f1f2e] rounded-lg p-1 flex-wrap">
          <Link
            href={makeHref("status", "", { ...currentFilters, status: undefined })}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${!status ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white hover:bg-[#1a1a28]"}`}
          >
            Svi statusi
          </Link>
          {STATUSI.map((s) => (
            <Link
              key={s}
              href={makeHref("status", s, currentFilters)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${status === s ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white hover:bg-[#1a1a28]"}`}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      {/* Search */}
      <form method="GET" action="/prospects">
        {nisa && <input type="hidden" name="nisa" value={nisa} />}
        {status && <input type="hidden" name="status" value={status} />}
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Pretraži po nazivu firme, emailu ili gradu..."
          className="w-full bg-[#111118] border border-[#1f1f2e] rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-600 transition-colors"
        />
      </form>

      {/* Filter-aware bulk actions (export, generate-all, delete-all) */}
      <FilterActions filter={{ search, nisa, status }} total={prospects.length} />

      {/* Quality scoring — backfill score for prospects added before this feature */}
      {unscoredCount > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-[#111118] border border-[#1f1f2e] px-4 py-3">
          <p className="text-zinc-400 text-sm">
            <span className="text-emerald-400 font-medium">{unscoredCount}</span> prospekata bez quality score-a.
            <span className="text-zinc-600 ml-2 text-xs">Sortiraj po score-u prije slanja da ne trošiš dnevni cap na loš fit.</span>
          </p>
          <ScoreUnscoredButton unscoredCount={unscoredCount} />
        </div>
      )}

      {prospects.length === 0 && !search && !nisa && !status ? (
        <div className="rounded-xl border border-dashed border-[#1f1f2e] p-12 text-center">
          <p className="text-zinc-500 text-sm">Nema prospekata. Uploaduj CSV da počneš.</p>
          <Link
            href="/upload"
            className="mt-3 inline-block text-blue-500 text-sm hover:text-blue-400 transition-colors"
          >
            Upload CSV →
          </Link>
        </div>
      ) : (
        <ProspectsTable prospects={prospects} />
      )}
    </div>
  );
}
