import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-5 card-elevation">
      <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium mb-2">{label}</p>
      <p
        className="text-white text-2xl tabular-nums tracking-tight"
        style={{ fontFamily: "var(--font-display-serif)", fontWeight: 500 }}
      >
        {value}
      </p>
      {sub && <p className="text-zinc-600 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function pct(n: number, d: number) {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

export default async function WarmupPage() {
  const fromEmail = process.env.FROM_EMAIL ?? "temim@unlockd.art";
  const domain = fromEmail.split("@")[1] ?? fromEmail;

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getTime() - 30 * 86400000);

  const [
    totalSent,
    totalOpened,
    sentThisWeek,
    sentThisMonth,
    abASent,
    abAOpened,
    abBSent,
    abBOpened,
  ] = await Promise.all([
    prisma.email.count({ where: { poslat: true } }),
    prisma.email.count({ where: { poslat: true, otvoren: true } }),
    prisma.email.count({ where: { poslat: true, poslatAt: { gte: weekStart } } }),
    prisma.email.count({ where: { poslat: true, poslatAt: { gte: monthStart } } }),
    prisma.email.count({ where: { subjectB: { not: null }, poslat: true, activeSubject: "A" } }),
    prisma.email.count({ where: { subjectB: { not: null }, poslat: true, activeSubject: "A", otvoren: true } }),
    prisma.email.count({ where: { subjectB: { not: null }, poslat: true, activeSubject: "B" } }),
    prisma.email.count({ where: { subjectB: { not: null }, poslat: true, activeSubject: "B", otvoren: true } }),
  ]);

  const avgPerDay = sentThisMonth > 0 ? (sentThisMonth / 30).toFixed(1) : "0";

  let stage: string;
  let stageColor: string;
  let recommendations: string[];

  if (totalSent < 20) {
    stage = "Brand new";
    stageColor = "text-amber-400";
    recommendations = [
      "Cap sends at 5–10/day for the first week",
      "Check your spam score on mail-tester.com",
      "Verify SPF, DKIM, and DMARC records on your sending domain",
      "Avoid spam triggers (free, guaranteed, click here, urgent)",
    ];
  } else if (totalSent < 100) {
    stage = "Warming up";
    stageColor = "text-orange-400";
    recommendations = [
      "Ramp to 20–30 emails/day",
      "Open rate below 20% is a red flag — revisit your subject lines",
      "Use A/B subject variants to learn what lands",
      "Scrub bounces and invalid addresses regularly",
    ];
  } else if (totalSent < 500) {
    stage = "Active";
    stageColor = "text-sky-400";
    recommendations = [
      "Domain is warm — 50–100 emails/day is safe",
      "Track open rate per niche and tune subjects accordingly",
      "Vary follow-up timing — fixed cadences signal automation",
      "Keep A/B testing to maintain reply rate over time",
    ];
  } else {
    stage = "Established";
    stageColor = "text-emerald-400";
    recommendations = [
      "Volume is no longer the constraint — focus on quality of fit",
      "Segment by niche for tighter targeting",
      "Track reply rate per email type (initial vs follow-up)",
    ];
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <p className="text-zinc-500 text-xs uppercase tracking-[0.18em] font-medium mb-2">Warm-up</p>
        <h1 className="text-3xl font-semibold text-white tracking-tight">Domain health</h1>
        <p className="text-zinc-500 text-sm mt-1">Sending-domain status and deliverability guidance.</p>
      </div>

      {/* Domain info */}
      <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-5 flex items-center justify-between card-elevation">
        <div>
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium mb-1">Sending domain</p>
          <p className="text-white font-semibold">{domain}</p>
          <p className="text-zinc-600 text-xs mt-0.5">{fromEmail}</p>
        </div>
        <span className={`text-sm font-semibold px-3 py-1.5 rounded-full bg-[#0a0a12] border border-[#1c1c28] ${stageColor}`}>
          {stage}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total sent" value={String(totalSent)} />
        <StatCard
          label="Open rate"
          value={pct(totalOpened, totalSent)}
          sub={`${totalOpened} of ${totalSent}`}
        />
        <StatCard label="This week" value={String(sentThisWeek)} sub="Last 7 days" />
        <StatCard
          label="Daily average"
          value={avgPerDay}
          sub={`${sentThisMonth} in 30 days`}
        />
      </div>

      {/* Warmup recommendations */}
      <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-5 space-y-3 card-elevation">
        <p className="text-zinc-300 text-sm font-medium">Recommendations</p>
        <ul className="space-y-2">
          {recommendations.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
              <span className="text-emerald-400 mt-0.5 shrink-0">›</span>
              {r}
            </li>
          ))}
        </ul>
      </div>

      {/* A/B subject comparison */}
      {(abASent > 0 || abBSent > 0) && (
        <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-5 space-y-4 card-elevation">
          <p className="text-zinc-300 text-sm font-medium">A/B subject — open rate</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium">Subject A</span>
                <span className="text-zinc-200 font-semibold text-sm tabular-nums">{pct(abAOpened, abASent)}</span>
              </div>
              <div className="h-2 rounded-full bg-[#1c1c28]">
                <div
                  className="h-2 rounded-full bg-sky-500"
                  style={{ width: abASent > 0 ? `${(abAOpened / abASent) * 100}%` : "0%" }}
                />
              </div>
              <p className="text-zinc-600 text-xs tabular-nums">{abAOpened} / {abASent} sent</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium">Subject B</span>
                <span className="text-zinc-200 font-semibold text-sm tabular-nums">{pct(abBOpened, abBSent)}</span>
              </div>
              <div className="h-2 rounded-full bg-[#1c1c28]">
                <div
                  className="h-2 rounded-full bg-emerald-500"
                  style={{ width: abBSent > 0 ? `${(abBOpened / abBSent) * 100}%` : "0%" }}
                />
              </div>
              <p className="text-zinc-600 text-xs tabular-nums">{abBOpened} / {abBSent} sent</p>
            </div>
          </div>
          {abASent > 0 && abBSent > 0 && (
            <p className="text-xs text-zinc-500 pt-1">
              {abAOpened / abASent > abBOpened / abBSent
                ? "Subject A is winning on opens."
                : abBOpened / abBSent > abAOpened / abASent
                ? "Subject B is winning on opens."
                : "Both subjects tie on opens."}
            </p>
          )}
        </div>
      )}

      {abASent === 0 && abBSent === 0 && (
        <div className="rounded-xl border border-dashed border-[#1c1c28] p-8 text-center bg-gradient-to-br from-emerald-500/[0.03] to-transparent">
          <p className="text-zinc-400 text-sm">No A/B data yet. Generate emails — Claude creates two subject variants per prospect automatically.</p>
        </div>
      )}
    </div>
  );
}
