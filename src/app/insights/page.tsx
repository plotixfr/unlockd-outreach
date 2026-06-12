import { prisma } from "@/lib/prisma";
import { FunnelView, type FunnelStage } from "@/components/FunnelView";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart3, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

// Rough per-prospect API spend, derived from average token usage:
//   - Email generation (Sonnet, ~3k tokens in/out): $0.012
//   - Quality scoring (Haiku, ~600 tokens): $0.0005
//   - Decision-makers extraction (Haiku, ~2k tokens): $0.002
//   - Reply classification + draft when replies arrive (Haiku, ~2k): $0.002
//   - PageSpeed + scrape + thum.io: free
//   - Resend send: ~$0.0001 per email
// Round to a single per-prospect "discovery + sequence" cost for the funnel
// view. Real numbers refine over time.
const COST_PER_PROSPECT_EUR = 0.04;
const COST_PER_REPLY_HANDLED_EUR = 0.002;

interface AbStats {
  sentA: number;
  sentB: number;
  openedA: number;
  openedB: number;
  repliedA: number;
  repliedB: number;
}

interface NicheStats {
  nisa: string;
  prospects: number;
  emailed: number;
  opened: number;
  replied: number;
  converted: number;
  revenue: number;
  ab: AbStats;
}

function pct(n: number, d: number) {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

function pickWinner(ab: AbStats): { label: string; tone: "a" | "b" | "tie" | "none" } {
  // Need a minimum sample on both sides before we declare a winner.
  if (ab.sentA < 5 || ab.sentB < 5) return { label: "Too early", tone: "none" };
  const replyA = ab.repliedA / ab.sentA;
  const replyB = ab.repliedB / ab.sentB;
  const openA = ab.openedA / ab.sentA;
  const openB = ab.openedB / ab.sentB;
  // Prefer reply rate as the tiebreaker; if equal, open rate.
  if (Math.abs(replyA - replyB) > 0.005) {
    return replyA > replyB ? { label: "A", tone: "a" } : { label: "B", tone: "b" };
  }
  if (Math.abs(openA - openB) > 0.005) {
    return openA > openB ? { label: "A", tone: "a" } : { label: "B", tone: "b" };
  }
  return { label: "Tie", tone: "tie" };
}

export default async function InsightsPage() {
  // ── Funnel: discovered → sent → opened → replied → meeting → won ──
  // Each stage is counted from the underlying tables, not from a prospect
  // status field, so we get the true cumulative count regardless of where
  // a prospect currently sits.
  const [
    totalProspects,
    totalSent,
    totalOpened,
    totalReplied,
    meetingsBooked,
    totalConverted,
    totalRepliesHandled,
  ] = await Promise.all([
    prisma.prospect.count(),
    prisma.email.count({ where: { poslat: true } }),
    prisma.email.count({ where: { otvoren: true } }),
    prisma.reply.groupBy({ by: ["prospectId"] }).then((rows) => rows.length),
    prisma.prospect.count({
      where: {
        OR: [
          { dealStage: { in: ["Discovery", "Proposal", "Negotiating", "Won"] } },
          { emails: { some: { calendlyClicked: true } } },
        ],
      },
    }),
    prisma.prospect.count({ where: { status: "Converted" } }),
    prisma.reply.count({ where: { classification: { not: null } } }),
  ]);

  const funnelStages: FunnelStage[] = [
    { label: "Discovered", count: totalProspects, detail: "Prospects in database", tone: "neutral" },
    { label: "Sent", count: totalSent, detail: "Initial + follow-up sends", tone: "neutral" },
    { label: "Opened", count: totalOpened, detail: "Pixel-tracked opens", tone: "ok" },
    { label: "Replied", count: totalReplied, detail: "IMAP-matched replies", tone: "ok" },
    { label: "Meeting", count: meetingsBooked, detail: "Calendly clicks + active deal stage", tone: "good" },
    { label: "Closed", count: totalConverted, detail: "Status = Converted", tone: "great" },
  ];

  const totalSpend = totalProspects * COST_PER_PROSPECT_EUR + totalRepliesHandled * COST_PER_REPLY_HANDLED_EUR;
  const costPerMeeting = meetingsBooked > 0 ? totalSpend / meetingsBooked : null;
  const costPerDeal = totalConverted > 0 ? totalSpend / totalConverted : null;

  // ── Subject line leaderboard ──
  // For initial sends only (where A/B variant matters most), find the top
  // subjects by open rate. Minimum 5 sends so we don't surface fluke wins.
  const subjectStats = await prisma.email.findMany({
    where: { tip: "initial", poslat: true },
    select: {
      subject: true,
      subjectB: true,
      activeSubject: true,
      otvoren: true,
      prospect: { select: { nisa: true, status: true } },
    },
  });

  const subjectLeaderboard = (() => {
    const buckets = new Map<string, { sent: number; opened: number; replied: number; niche: string }>();
    for (const e of subjectStats) {
      const subject = e.activeSubject === "B" && e.subjectB ? e.subjectB : e.subject;
      if (!subject) continue;
      const key = `${subject}__${e.prospect.nisa}`;
      const b = buckets.get(key) ?? { sent: 0, opened: 0, replied: 0, niche: e.prospect.nisa };
      b.sent++;
      if (e.otvoren) b.opened++;
      if (e.prospect.status === "Replied" || e.prospect.status === "Converted") b.replied++;
      buckets.set(key, b);
    }
    const rows = Array.from(buckets.entries())
      .filter(([, b]) => b.sent >= 5)
      .map(([key, b]) => ({
        subject: key.split("__")[0],
        niche: b.niche,
        sent: b.sent,
        opened: b.opened,
        replied: b.replied,
        openRate: b.opened / b.sent,
        replyRate: b.replied / b.sent,
      }))
      .sort((a, b) => b.openRate - a.openRate || b.replied - a.replied)
      .slice(0, 8);
    return rows;
  })();

  // Pull aggregated data per niche using groupBy + targeted counts. Done in one
  // Promise.all so the page renders fast even with many niches.
  const niches = await prisma.prospect.groupBy({
    by: ["nisa"],
    _count: true,
    orderBy: { nisa: "asc" },
  });

  const stats: NicheStats[] = await Promise.all(
    niches.map(async (n): Promise<NicheStats> => {
      const [
        emailedCount,
        openedCount,
        repliedCount,
        convertedCount,
        revenueAgg,
        // A/B breakdown: only count initial sends (that's the only tip with a
        // real subjectB split) where the email actually went out.
        sentA,
        sentB,
        openedA,
        openedB,
        repliedA,
        repliedB,
      ] = await Promise.all([
        prisma.prospect.count({
          where: {
            nisa: n.nisa,
            status: { in: ["Emailed", "Follow1", "Follow2", "Follow3", "Replied", "Converted"] },
          },
        }),
        prisma.email.count({
          where: { prospect: { nisa: n.nisa }, otvoren: true },
        }),
        prisma.prospect.count({
          where: { nisa: n.nisa, status: { in: ["Replied", "Converted"] } },
        }),
        prisma.prospect.count({ where: { nisa: n.nisa, status: "Converted" } }),
        prisma.conversion.aggregate({
          where: { prospect: { nisa: n.nisa } },
          _sum: { vrijednostProjekta: true },
        }),
        prisma.email.count({
          where: { prospect: { nisa: n.nisa }, tip: "initial", poslat: true, activeSubject: "A" },
        }),
        prisma.email.count({
          where: { prospect: { nisa: n.nisa }, tip: "initial", poslat: true, activeSubject: "B" },
        }),
        prisma.email.count({
          where: {
            prospect: { nisa: n.nisa },
            tip: "initial",
            poslat: true,
            activeSubject: "A",
            otvoren: true,
          },
        }),
        prisma.email.count({
          where: {
            prospect: { nisa: n.nisa },
            tip: "initial",
            poslat: true,
            activeSubject: "B",
            otvoren: true,
          },
        }),
        prisma.email.count({
          where: {
            prospect: { nisa: n.nisa, status: { in: ["Replied", "Converted"] } },
            tip: "initial",
            poslat: true,
            activeSubject: "A",
          },
        }),
        prisma.email.count({
          where: {
            prospect: { nisa: n.nisa, status: { in: ["Replied", "Converted"] } },
            tip: "initial",
            poslat: true,
            activeSubject: "B",
          },
        }),
      ]);
      return {
        nisa: n.nisa,
        prospects: n._count,
        emailed: emailedCount,
        opened: openedCount,
        replied: repliedCount,
        converted: convertedCount,
        revenue: revenueAgg._sum.vrijednostProjekta ?? 0,
        ab: { sentA, sentB, openedA, openedB, repliedA, repliedB },
      };
    })
  );

  // Sort by reply rate descending for "what's working" view.
  stats.sort((a, b) => (b.replied / Math.max(b.emailed, 1)) - (a.replied / Math.max(a.emailed, 1)));

  const totals = stats.reduce(
    (acc, s) => ({
      prospects: acc.prospects + s.prospects,
      emailed: acc.emailed + s.emailed,
      opened: acc.opened + s.opened,
      replied: acc.replied + s.replied,
      converted: acc.converted + s.converted,
      revenue: acc.revenue + s.revenue,
    }),
    { prospects: 0, emailed: 0, opened: 0, replied: 0, converted: 0, revenue: 0 }
  );

  return (
    <div className="max-w-[1400px] space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] text-[var(--text)]">Insights</h1>
          <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
            <BarChart3 className="w-3 h-3" />
            What&apos;s working
          </span>
        </div>
        <p className="text-[var(--text-secondary)] text-sm mt-1.5">
          Funnel, cost per meeting, per-niche performance, A/B winners.
        </p>
      </div>

      {/* Visual funnel — discovered → won + cost per stage */}
      <FunnelView
        stages={funnelStages}
        totalSpendEur={totalSpend}
        costPerMeetingEur={costPerMeeting}
        costPerDealEur={costPerDeal}
      />

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Prospects", value: totals.prospects },
          { label: "Activated", value: totals.emailed },
          { label: "Open rate", value: pct(totals.opened, totals.emailed) },
          { label: "Reply rate", value: pct(totals.replied, totals.emailed) },
          {
            label: "Revenue",
            value: totals.revenue > 0 ? `€${Math.round(totals.revenue).toLocaleString("en-US")}` : "—",
          },
        ].map(({ label, value }) => (
          <div key={label} className="card card-interactive p-4">
            <p className="section-label">{label}</p>
            <p className="kpi-value text-2xl mt-2.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Subject line leaderboard */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="section-label"><Sparkles className="w-3 h-3" /> Top subject lines</p>
            <p className="text-[var(--text-muted)] text-xs mt-1.5">By open rate — minimum 5 sends to qualify</p>
          </div>
        </div>
        {subjectLeaderboard.length === 0 ? (
          <EmptyState
            icon={<Sparkles />}
            title="No subject lines qualify yet"
            hint="A subject needs at least 5 initial sends before it appears on the leaderboard. Keep autopilot running."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead>
                <tr>
                  {["Subject", "Niche", "Sent", "Opened", "Replied", "Open rate"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subjectLeaderboard.map((row, i) => (
                  <tr key={i}>
                    <td className="text-[var(--text)] font-medium max-w-md truncate" title={row.subject}>{row.subject}</td>
                    <td>
                      <span className="badge bg-zinc-100 text-zinc-700 border border-zinc-200">
                        {row.niche}
                      </span>
                    </td>
                    <td className="tabular">{row.sent}</td>
                    <td className="tabular text-[var(--text)]">{row.opened}</td>
                    <td className="tabular text-emerald-700 font-semibold">{row.replied}</td>
                    <td>
                      <span className={`tabular font-semibold ${row.openRate >= 0.4 ? "text-emerald-700" : row.openRate >= 0.2 ? "text-amber-600" : "text-[var(--text-muted)]"}`}>
                        {Math.round(row.openRate * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-niche table */}
      <div>
        <p className="section-label mb-3"><BarChart3 className="w-3 h-3" /> Per-niche performance</p>
        {stats.length === 0 ? (
          <EmptyState
            icon={<BarChart3 />}
            title="No per-niche data yet"
            hint="Upload prospects or run Autopilot — open, reply and conversion rates per niche appear here."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead>
                <tr>
                  {["Niche", "Prospects", "Sent", "Open rate", "Reply rate", "Conv. rate", "Revenue", "A/B winner"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const openRate = s.emailed > 0 ? s.opened / s.emailed : 0;
                  const replyRate = s.emailed > 0 ? s.replied / s.emailed : 0;
                  const convRate = s.emailed > 0 ? s.converted / s.emailed : 0;
                  return (
                    <tr key={s.nisa}>
                      <td className="text-[var(--text)] font-semibold">{s.nisa}</td>
                      <td className="tabular">{s.prospects}</td>
                      <td className="tabular">{s.emailed}</td>
                      <td className={`tabular font-semibold ${openRate >= 0.3 ? "text-emerald-700" : openRate > 0 ? "text-amber-600" : "text-[var(--text-muted)]"}`}>
                        {pct(s.opened, s.emailed)}
                      </td>
                      <td className={`tabular font-semibold ${replyRate >= 0.05 ? "text-emerald-700" : replyRate > 0 ? "text-amber-600" : "text-[var(--text-muted)]"}`}>
                        {pct(s.replied, s.emailed)}
                      </td>
                      <td className={`tabular font-semibold ${convRate > 0 ? "text-emerald-700" : "text-[var(--text-muted)]"}`}>
                        {pct(s.converted, s.emailed)}
                      </td>
                      <td className="text-[var(--text)] tabular font-semibold">
                        {s.revenue > 0 ? `€${Math.round(s.revenue).toLocaleString("en-US")}` : "—"}
                      </td>
                      <td className="text-xs">
                        {(() => {
                          const winner = pickWinner(s.ab);
                          const cls =
                            winner.tone === "a"
                              ? "badge bg-sky-50 text-sky-700 border border-sky-200"
                              : winner.tone === "b"
                                ? "badge bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "badge bg-zinc-100 text-zinc-600 border border-zinc-200";
                          return (
                            <div className="flex items-center gap-2">
                              <span className={cls}>
                                {winner.label}
                              </span>
                              <span className="text-[var(--text-muted)] tabular">
                                {s.ab.sentA}/{s.ab.sentB}
                              </span>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
