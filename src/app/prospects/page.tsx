import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STATUSI } from "@/lib/constants";
import { ProspectsTable } from "@/components/ProspectsTable";
import { FilterActions } from "@/components/FilterActions";
import { ScoreUnscoredButton } from "@/components/ScoreUnscoredButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Plus, Search, Sparkles, Flame, MessageCircleReply, Users } from "lucide-react";

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
        qualityNote: true,
        lastError: true,
        attemptCount: true,
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

  const chipBase =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors";
  const chipOn = "bg-[var(--accent-soft)] text-emerald-700 border border-[var(--accent-border)]";
  const chipOff =
    "bg-white text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:text-[var(--text)]";

  return (
    <div className="max-w-[1400px] space-y-4">
      {/* ─── Header ─── */}
      <div className="flex items-end justify-between gap-4 flex-wrap pb-1">
        <div>
          <h1 className="text-[22px] text-[var(--text)]">Prospects</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1.5">
            {prospects.length} {prospects.length === 1 ? "lead" : "leads"}
            {hasFilter && " matching the current filters"} · sorted by quality score
          </p>
        </div>
        <Link href="/upload" className="btn-primary">
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Import list
        </Link>
      </div>

      {/* High-signal view chips: where the operator should look first */}
      <div className="flex gap-2 flex-wrap">
        <Link
          href={makeHref("view", "", { ...currentFilters, view: undefined })}
          className={`${chipBase} ${!view ? chipOn : chipOff}`}
        >
          <Users className="w-3 h-3" strokeWidth={2} />
          All ({prospects.length})
        </Link>
        <Link
          href={makeHref("view", "hot", { ...currentFilters, view: undefined, status: undefined })}
          className={`${chipBase} ${view === "hot" ? "bg-amber-50 text-amber-700 border border-amber-200" : chipOff}`}
        >
          <Flame className="w-3 h-3" strokeWidth={2} />
          Hot ({hotCount})
        </Link>
        <Link
          href={makeHref("view", "replies", { ...currentFilters, view: undefined, status: undefined })}
          className={`${chipBase} ${view === "replies" ? chipOn : chipOff}`}
        >
          <MessageCircleReply className="w-3 h-3" strokeWidth={2} />
          Replies ({repliesCount})
        </Link>
      </div>

      {/* Search */}
      <form method="GET" action="/prospects" className="relative">
        {nisa && <input type="hidden" name="nisa" value={nisa} />}
        {status && <input type="hidden" name="status" value={status} />}
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" strokeWidth={1.75} />
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Search by company, email, or city…"
          className="w-full bg-white border border-[var(--border)] rounded-lg pl-10 pr-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] shadow-sm focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
      </form>

      {/* Filters — status (incl. Failed) */}
      <div className="flex gap-1.5 flex-wrap items-center">
        <span className="section-label mr-1">Status</span>
        <Link
          href={makeHref("status", "", { ...currentFilters, status: undefined })}
          className={`${chipBase} ${!status ? chipOn : chipOff}`}
        >
          All statuses
        </Link>
        {STATUSI.map((s) => (
          <Link
            key={s}
            href={makeHref("status", s, currentFilters)}
            className={`${chipBase} ${status === s ? chipOn : chipOff}`}
          >
            {s}
          </Link>
        ))}
      </div>

      {/* Filters — niche */}
      <div className="flex gap-1.5 flex-wrap items-center">
        <span className="section-label mr-1">Niche</span>
        <Link
          href={makeHref("nisa", "", { ...currentFilters, nisa: undefined })}
          className={`${chipBase} ${!nisa ? chipOn : chipOff}`}
        >
          All niches
        </Link>
        {availableNise.map((n) => (
          <Link
            key={n}
            href={makeHref("nisa", n, currentFilters)}
            className={`${chipBase} ${nisa === n ? chipOn : chipOff}`}
          >
            {n}
          </Link>
        ))}
      </div>

      {/* Filter-aware bulk actions */}
      <FilterActions filter={{ search, nisa, status }} total={prospects.length} />

      {/* Quality scoring nudge */}
      {unscoredCount > 0 && (
        <div className="card flex items-center justify-between px-4 py-3 gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <Sparkles className="w-4 h-4 text-[var(--accent)] mt-0.5 shrink-0" />
            <p className="text-[var(--text-secondary)] text-sm">
              <span className="text-emerald-700 font-bold">{unscoredCount}</span> {unscoredCount === 1 ? "prospect" : "prospects"} without a quality score.
              <span className="text-[var(--text-muted)] ml-2 text-xs">Sort by score before sending so the daily cap doesn&apos;t burn on weak fits.</span>
            </p>
          </div>
          <ScoreUnscoredButton unscoredCount={unscoredCount} />
        </div>
      )}

      {prospects.length === 0 && !hasFilter ? (
        <EmptyState
          icon={<Users />}
          title="No prospects yet"
          hint="Autopilot discovers prospects automatically — active briefs fill this list. You can also import a CSV to seed it manually."
          action={
            <div className="flex items-center gap-3">
              <Link href="/autopilot" className="btn-primary">
                Open Autopilot
              </Link>
              <Link href="/upload" className="btn-secondary">
                Import CSV
              </Link>
            </div>
          }
        />
      ) : (
        <ProspectsTable prospects={prospects} />
      )}
    </div>
  );
}
