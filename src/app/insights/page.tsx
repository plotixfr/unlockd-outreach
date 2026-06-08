import { prisma } from "@/lib/prisma";
import { FunnelView, type FunnelStage } from "@/components/FunnelView";
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
    <div className="max-w-[1400px] space-y-3">
      <div className="pb-2">
        <div className="flex items-center gap-3 mb-3">
          <span className="pill pill-accent">
            <BarChart3 className="w-3 h-3" />
            Insights
          </span>
        </div>
        <h1 className="text-white text-4xl sm:text-5xl tracking-tight">What&apos;s working</h1>
        <p className="text-[var(--text-muted)] text-sm mt-3 max-w-2xl">
          Funnel, cost-per-meeting, per-niche performance, A/B winners.
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
            <p className="display-number text-white text-2xl mt-2.5 tabular">{value}</p>
          </div>
        ))}
      </div>

      {/* Subject line leaderboard */}
      {subjectLeaderboard.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="section-label"><Sparkles className="w-3 h-3" /> Top subject lines</p>
              <p className="text-[var(--text-dim)] text-xs mt-1.5">By open rate — minimum 5 sends to qualify</p>
            </div>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-2)] bg-[var(--bg-elev-1)]">
                  {["Subject", "Niche", "Sent", "Opened", "Replied", "Open rate"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[var(--text-dim)] text-[10px] uppercase tracking-widest font-bold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-1)]">
                {subjectLeaderboard.map((row, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-white max-w-md truncate" title={row.subject}>{row.subject}</td>
                    <td className="px-4 py-3">
                      <span className="pill pill-muted">
                        {row.niche}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)] tabular">{row.sent}</td>
                    <td className="px-4 py-3 text-[var(--text)] tabular">{row.opened}</td>
                    <td className="px-4 py-3 text-emerald-300 tabular font-bold">{row.replied}</td>
                    <td className="px-4 py-3">
                      <span className={`tabular font-bold ${row.openRate >= 0.4 ? "text-emerald-300" : row.openRate >= 0.2 ? "text-amber-300" : "text-[var(--text-dim)]"}`}>
                        {Math.round(row.openRate * 100)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-niche table */}
      {stats.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-[var(--text-muted)] text-sm">No data yet. Upload prospects or run Autopilot to see per-niche performance.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-2)] bg-[var(--bg-elev-1)]">
                {["Niche", "Prospects", "Sent", "Open rate", "Reply rate", "Conv. rate", "Revenue", "A/B winner"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-[var(--text-dim)] text-[10px] uppercase tracking-widest font-bold"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-1)]">
              {stats.map((s) => {
                const openRate = s.emailed > 0 ? s.opened / s.emailed : 0;
                const replyRate = s.emailed > 0 ? s.replied / s.emailed : 0;
                const convRate = s.emailed > 0 ? s.converted / s.emailed : 0;
                return (
                  <tr key={s.nisa} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-white font-semibold">{s.nisa}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)] tabular">{s.prospects}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)] tabular">{s.emailed}</td>
                    <td className={`px-4 py-3 tabular font-bold ${openRate >= 0.3 ? "text-emerald-300" : openRate > 0 ? "text-amber-300" : "text-[var(--text-dim)]"}`}>
                      {pct(s.opened, s.emailed)}
                    </td>
                    <td className={`px-4 py-3 tabular font-bold ${replyRate >= 0.05 ? "text-emerald-300" : replyRate > 0 ? "text-amber-300" : "text-[var(--text-dim)]"}`}>
                      {pct(s.replied, s.emailed)}
                    </td>
                    <td className={`px-4 py-3 tabular font-bold ${convRate > 0 ? "text-emerald-300" : "text-[var(--text-dim)]"}`}>
                      {pct(s.converted, s.emailed)}
                    </td>
                    <td className="px-4 py-3 text-[var(--text)] tabular font-semibold">
                      {s.revenue > 0 ? `€${Math.round(s.revenue).toLocaleString("en-US")}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {(() => {
                        const winner = pickWinner(s.ab);
                        const cls =
                          winner.tone === "a"
                            ? "pill"
                            : winner.tone === "b"
                              ? "pill pill-accent"
                              : winner.tone === "tie"
                                ? "pill pill-muted"
                                : "pill pill-muted";
                        const styleA = winner.tone === "a" ? { background: "rgba(96, 165, 250, 0.10)", color: "#7dd3fc", border: "1px solid rgba(96, 165, 250, 0.30)" } : undefined;
                        return (
                          <div className="flex items-center gap-2">
                            <span className={cls} style={styleA}>
                              {winner.label}
                            </span>
                            <span className="text-[var(--text-faint)] tabular">
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
  );
}
