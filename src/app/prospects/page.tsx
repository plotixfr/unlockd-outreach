import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STATUSI } from "@/lib/constants";
import { ProspectsTable } from "@/components/ProspectsTable";
import { FilterActions } from "@/components/FilterActions";
import { ScoreUnscoredButton } from "@/components/ScoreUnscoredButton";
import { Plus, Search, Sparkles, Flame, MessageCircleReply } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; nisa?: string; status?: string; view?: string }>;
}) {
  const { search, nisa, status, view } = await searchParams;

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

  // View modes — special filters that override status. "hot" surfaces
  // prospects who opened 3+ times but never replied (silent-but-curious).
  // "replies" sorts by most-recent reply so the operator's morning routine
  // is "check Replies tab → respond to top N".
  if (view === "hot") {
    where.status = { notIn: ["Replied", "Converted", "Unsubscribed", "Bounced"] };
    where.emails = { some: { otvoren: true } };
  } else if (view === "replies") {
    where.status = "Replied";
  }

  const [prospects, niseGroups, unscoredCount, hotCount, repliesCount] = await Promise.all([
    prisma.prospect.findMany({
      where,
      orderBy:
        view === "replies"
          ? [{ datumOdgovora: "desc" }]
          : view === "hot"
            ? [{ qualityScore: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }]
            : [{ qualityScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
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
        // Latest reply preview — only needed in hot/replies views to surface
        // "what they said" inline. Cheaper than a JOIN on every row in the
        // default list view.
        replies:
          view === "replies" || view === "hot"
            ? {
                orderBy: { receivedAt: "desc" },
                take: 1,
                select: { body: true, classification: true, receivedAt: true },
              }
            : false,
      },
    }),
    prisma.prospect.groupBy({
      by: ["nisa"],
      orderBy: { nisa: "asc" },
    }),
    prisma.prospect.count({ where: { qualityScore: null } }),
    prisma.prospect.count({
      where: {
        status: { notIn: ["Replied", "Converted", "Unsubscribed", "Bounced"] },
        emails: { some: { otvoren: true } },
      },
    }),
    prisma.prospect.count({ where: { status: "Replied" } }),
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

  const currentFilters = { search, nisa, status, view };
  const hasFilter = Boolean(search || nisa || status || view);

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-[0.18em] font-medium mb-2">Prospects</p>
          <h1 className="text-3xl font-semibold text-white tracking-tight">
            {prospects.length} {prospects.length === 1 ? "lead" : "leads"}{hasFilter && " (filtered)"}
          </h1>
        </div>
        <Link
          href="/upload"
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors shadow-[0_6px_18px_-8px_rgba(16,185,129,0.45)]"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Import list
        </Link>
      </div>

      {/* High-signal view chips: where the operator should look first */}
      <div className="flex gap-2 flex-wrap">
        <Link
          href={makeHref("view", "", { ...currentFilters, view: undefined })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${!view ? "bg-zinc-500/15 text-zinc-200 ring-1 ring-zinc-400/30" : "text-zinc-500 hover:text-white bg-[#0d0d12] border border-[#1c1c28]"}`}
        >
          All ({prospects.length}{!view ? "" : ""})
        </Link>
        <Link
          href={makeHref("view", "hot", { ...currentFilters, view: undefined, status: undefined })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${view === "hot" ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40" : "text-amber-400/80 hover:text-amber-300 bg-[#0d0d12] border border-amber-500/20"}`}
        >
          <Flame className="w-3.5 h-3.5" strokeWidth={2} />
          Hot ({hotCount})
        </Link>
        <Link
          href={makeHref("view", "replies", { ...currentFilters, view: undefined, status: undefined })}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${view === "replies" ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40" : "text-emerald-400/80 hover:text-emerald-300 bg-[#0d0d12] border border-emerald-500/20"}`}
        >
          <MessageCircleReply className="w-3.5 h-3.5" strokeWidth={2} />
          Replies ({repliesCount})
        </Link>
      </div>

      {/* Filters — niche */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex gap-1 bg-[#0d0d12] border border-[#1c1c28] rounded-lg p-1 flex-wrap">
          <Link
            href={makeHref("nisa", "", { ...currentFilters, nisa: undefined })}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${!nisa ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"}`}
          >
            All niches
          </Link>
          {availableNise.map((n) => (
            <Link
              key={n}
              href={makeHref("nisa", n, currentFilters)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${nisa === n ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"}`}
            >
              {n}
            </Link>
          ))}
        </div>

        {/* Filters — status */}
        <div className="flex gap-1 bg-[#0d0d12] border border-[#1c1c28] rounded-lg p-1 flex-wrap">
          <Link
            href={makeHref("status", "", { ...currentFilters, status: undefined })}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${!status ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"}`}
          >
            All statuses
          </Link>
          {STATUSI.map((s) => (
            <Link
              key={s}
              href={makeHref("status", s, currentFilters)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${status === s ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"}`}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      {/* Search */}
      <form method="GET" action="/prospects" className="relative">
        {nisa && <input type="hidden" name="nisa" value={nisa} />}
        {status && <input type="hidden" name="status" value={status} />}
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" strokeWidth={1.75} />
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Search by company, email, or city…"
          className="w-full bg-[#0d0d12] border border-[#1c1c28] rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:bg-[#10101a] transition-colors"
        />
      </form>

      {/* Filter-aware bulk actions */}
      <FilterActions filter={{ search, nisa, status }} total={prospects.length} />

      {/* Quality scoring nudge */}
      {unscoredCount > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-[#0d0d12] border border-[#1c1c28] px-4 py-3 gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <Sparkles className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <p className="text-zinc-400 text-sm">
              <span className="text-emerald-400 font-medium">{unscoredCount}</span> {unscoredCount === 1 ? "prospect" : "prospects"} without a quality score.
              <span className="text-zinc-600 ml-2 text-xs">Sort by score before sending so the daily cap doesn&apos;t burn on weak fits.</span>
            </p>
          </div>
          <ScoreUnscoredButton unscoredCount={unscoredCount} />
        </div>
      )}

      {prospects.length === 0 && !hasFilter ? (
        <div className="rounded-2xl border border-dashed border-[#1c1c28] p-12 text-center bg-gradient-to-br from-emerald-500/[0.03] to-transparent">
          <p className="text-zinc-400 text-sm">No prospects yet. Upload a CSV or run Autopilot to get started.</p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Link
              href="/upload"
              className="text-emerald-400 text-sm font-medium hover:text-emerald-300 transition-colors"
            >
              Upload CSV →
            </Link>
            <span className="text-zinc-700">·</span>
            <Link
              href="/autopilot"
              className="text-emerald-400 text-sm font-medium hover:text-emerald-300 transition-colors"
            >
              Open Autopilot →
            </Link>
          </div>
        </div>
      ) : (
        <ProspectsTable prospects={prospects} />
      )}
    </div>
  );
}
