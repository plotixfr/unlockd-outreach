import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BriefsEditor } from "@/components/BriefsEditor";
import { QuickSetupButton } from "@/components/QuickSetupButton";
import { BulkBriefAdd } from "@/components/BulkBriefAdd";
import { RunAutopilotNowButton } from "@/components/RunAutopilotNowButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { isDiscoveryConfigured } from "@/lib/discovery";
import {
  nextAutopilotRun,
  nextSendRun,
  formatParisDateTime,
  relativeFromNow,
} from "@/lib/autopilotStatus";
import {
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Activity,
  Zap,
  Inbox,
  ListChecks,
} from "lucide-react";

export const dynamic = "force-dynamic";

function utcMidnight(offsetDays = 0): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (offsetDays) d.setUTCDate(d.getUTCDate() + offsetDays);
  return d;
}

/* ── Presentational helpers (pure parsing of stored fields — no logic changes) ── */

/** `discoveryCursor` JSON ({variant, position}) → "v0:p12" mono label. */
function cursorLabel(cursor: unknown): string | null {
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return null;
  const c = cursor as { variant?: unknown; position?: unknown };
  if (typeof c.variant !== "number" && typeof c.position !== "number") return null;
  return `v${typeof c.variant === "number" ? c.variant : 0}:p${typeof c.position === "number" ? c.position : 0}`;
}

/** DiscoveryRun.notes — parse the JSON tally after "skipped:" into chips. */
function parseSkips(notes: string | null): Array<{ reason: string; n: number }> {
  if (!notes) return [];
  const idx = notes.indexOf("skipped:");
  if (idx === -1) return [];
  try {
    const obj: unknown = JSON.parse(notes.slice(idx + "skipped:".length).trim());
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
    return Object.entries(obj as Record<string, unknown>)
      .map(([reason, n]) => ({ reason, n: Number(n) }))
      .filter((s) => Number.isFinite(s.n));
  } catch {
    return [];
  }
}

/** DiscoveryRun.notes — extract the persisted cursor ("variant=0 pos=12"). */
function notesCursor(notes: string | null): string | null {
  const m = notes?.match(/variant=(\d+)\s+pos=(\d+)/);
  return m ? `v${m[1]}:p${m[2]}` : null;
}

function parisHHMM(d: Date): string {
  return d.toLocaleTimeString("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parisShort(d: Date): string {
  return d.toLocaleString("en-GB", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type BriefStateKey = "active" | "cooldown" | "exhausted" | "paused";

/** Distinct visual states: ● Active / ◐ Cooldown / ◌ Exhausted / ⏸ Paused. */
function briefState(
  b: { active: boolean; cooldownUntil: Date | null; exhaustedAt: Date | null },
  now: Date
): { key: BriefStateKey; symbol: string; label: string; cls: string } {
  if (!b.active)
    return { key: "paused", symbol: "⏸", label: "Paused", cls: "bg-zinc-100 text-zinc-600 border border-zinc-200" };
  if (b.exhaustedAt)
    return { key: "exhausted", symbol: "◌", label: "Exhausted", cls: "bg-zinc-100 text-zinc-500 border border-zinc-200" };
  if (b.cooldownUntil && b.cooldownUntil > now)
    return { key: "cooldown", symbol: "◐", label: "Cooldown", cls: "bg-amber-50 text-amber-700 border border-amber-200" };
  return { key: "active", symbol: "●", label: "Active", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" };
}

/** Next cron slot (UTC 5/7/9/11/13/15, Mon–Fri) ≥ cooldownUntil. */
function nextRunEta(
  b: { active: boolean; cooldownUntil: Date | null; exhaustedAt: Date | null },
  now: Date
): Date | null {
  if (!b.active || b.exhaustedAt) return null;
  const cooldown = b.cooldownUntil && b.cooldownUntil > now ? b.cooldownUntil : null;
  // -1ms so a cooldown ending exactly on a cron hour still counts as "≥".
  const from = cooldown ? new Date(cooldown.getTime() - 1) : now;
  return nextAutopilotRun(from);
}

export default async function AutopilotPage() {
  const discoveryConfigured = await isDiscoveryConfigured();
  const now = new Date();
  const nextAutopilot = nextAutopilotRun(now);
  const nextSend = nextSendRun(now);

  const todayStart = utcMidnight();
  const tomorrowStart = utcMidnight(1);
  const dayAfter = utcMidnight(2);
  const sevenAgo = utcMidnight(-7);
  const thirtyAgo = utcMidnight(-30);

  const [
    activeBriefs,
    inactiveBriefs,
    sendingTodayInitial,
    sendingTomorrow,
    recentRuns,
    totalProspects,
    discoverQueue,
    enrichedCount,
    scoredCount,
    draftedCount,
    scheduledByStatus,
    emailsLast7,
    openedLast7,
    repliesLast7,
    failedRuns7,
    bccFailures,
    runsLast30Stats,
    activeFeed,
    // G1 additions — read-only page-level queries for the funnel + observability.
    sentLast30,
    repliedLast30,
    briefHealth,
    redriveQueue,
    errorProspects,
  ] = await Promise.all([
    prisma.searchBrief.count({ where: { active: true } }),
    prisma.searchBrief.count({ where: { active: false } }),
    prisma.prospect.count({
      where: { status: "Scheduled", scheduledInitial: { gte: todayStart, lt: tomorrowStart } },
    }),
    prisma.prospect.count({
      where: { status: "Scheduled", scheduledInitial: { gte: tomorrowStart, lt: dayAfter } },
    }),
    prisma.discoveryRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { brief: { select: { name: true } } },
    }),
    prisma.prospect.count(),
    prisma.prospect.count({ where: { createdAt: { gte: thirtyAgo } } }),
    prisma.prospect.count({ where: { siteSnapshotAt: { not: null, gte: thirtyAgo } } }),
    prisma.prospect.count({ where: { qualityScore: { not: null }, createdAt: { gte: thirtyAgo } } }),
    prisma.prospect.count({ where: { autoGenerated: true, createdAt: { gte: thirtyAgo } } }),
    prisma.prospect.count({ where: { status: "Scheduled", createdAt: { gte: thirtyAgo } } }),
    prisma.email.count({ where: { poslat: true, poslatAt: { gte: sevenAgo } } }),
    prisma.email.count({ where: { otvoren: true, poslatAt: { gte: sevenAgo } } }),
    prisma.reply.count({ where: { receivedAt: { gte: sevenAgo } } }),
    prisma.discoveryRun.count({ where: { status: "failed", startedAt: { gte: sevenAgo } } }),
    prisma.email.count({ where: { bccError: { not: null } } }),
    prisma.discoveryRun.aggregate({
      where: { startedAt: { gte: thirtyAgo } },
      _sum: { found: true, created: true, qualified: true, scheduled: true },
    }),
    prisma.email.findMany({
      where: { poslat: true },
      orderBy: { poslatAt: "desc" },
      take: 6,
      select: { id: true, tip: true, poslatAt: true, prospect: { select: { firmaNaziv: true, id: true, language: true } } },
    }),
    prisma.email.count({ where: { poslat: true, poslatAt: { gte: thirtyAgo } } }),
    prisma.reply.count({ where: { receivedAt: { gte: thirtyAgo } } }),
    prisma.searchBrief.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        niche: true,
        country: true,
        active: true,
        cooldownUntil: true,
        exhaustedAt: true,
        discoveryCursor: true,
        emptyRunStreak: true,
        lastRunAt: true,
        totalDiscovered: true,
        totalQualified: true,
        runs: {
          orderBy: { startedAt: "desc" },
          take: 1,
          select: { found: true, created: true, status: true, startedAt: true, notes: true },
        },
      },
    }),
    prisma.prospect.count({ where: { status: "New", briefId: { not: null } } }),
    prisma.prospect.count({ where: { lastError: { not: null } } }),
  ]);

  const autopilotLive = activeBriefs > 0 && discoveryConfigured;
  const openRate7 = emailsLast7 > 0 ? Math.round((openedLast7 / emailsLast7) * 100) : 0;
  const queue = sendingTodayInitial + sendingTomorrow;
  const imapConfigured = !!process.env.IMAP_USER;

  const briefsByCountry = await prisma.searchBrief.groupBy({
    by: ["country"],
    _count: true,
  });
  const byCountry = Object.fromEntries(briefsByCountry.map((g) => [g.country, g._count]));

  // ── Pipeline funnel (30d): discovered → created → qualified → scheduled → sent → replied
  const funnel = [
    { label: "Discovered", value: runsLast30Stats._sum.found ?? 0 },
    { label: "Created", value: runsLast30Stats._sum.created ?? 0 },
    { label: "Qualified", value: runsLast30Stats._sum.qualified ?? 0 },
    { label: "Scheduled", value: runsLast30Stats._sum.scheduled ?? 0 },
    { label: "Sent", value: sentLast30 },
    { label: "Replied", value: repliedLast30 },
  ];

  const budgetStopped7 = recentRuns.filter((r) => r.notes?.includes("budget-stopped")).length;

  return (
    <div className="max-w-[1400px] space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] text-[var(--text)]">Autopilot</h1>
            <span className={`badge ${autopilotLive ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
              <span className={`dot ${autopilotLive ? "dot-live" : ""}`} />
              {autopilotLive ? "Live · 6 runs per business day" : "Paused"}
            </span>
          </div>
          <p className="text-[var(--text-secondary)] text-sm mt-1.5">
            Discovers, enriches, scores, drafts and schedules outreach. {queue} prospect{queue === 1 ? "" : "s"} queued across {activeBriefs} active brief{activeBriefs === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--text-muted)]">
            Next discovery <span className="font-mono text-[var(--text-secondary)]">{relativeFromNow(nextAutopilot, now)}</span> · {formatParisDateTime(nextAutopilot)}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Next send <span className="font-mono text-[var(--text-secondary)]">{relativeFromNow(nextSend, now)}</span> · {formatParisDateTime(nextSend)}
          </p>
        </div>
      </div>

      {/* ─── 1. Pipeline funnel (30d) ─── */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-5">
          <p className="section-label"><Activity className="w-3 h-3" /> Pipeline funnel · last 30 days</p>
          <p className="text-xs text-[var(--text-muted)]">
            {emailsLast7} emails / 7d · {repliesLast7} replies · {openRate7}% open
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-6">
          {funnel.map((stage, i) => {
            const prev = i > 0 ? funnel[i - 1].value : 0;
            const pct = i > 0 ? (prev > 0 ? `${Math.round((stage.value / prev) * 100)}%` : "—") : null;
            return (
              <Fragment key={stage.label}>
                {pct !== null && (
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" strokeWidth={1.75} />
                    <span className="font-mono text-[11px] text-[var(--text-muted)] tabular">{pct}</span>
                  </div>
                )}
                <div className="min-w-[92px]">
                  <p className="section-label">{stage.label}</p>
                  <p className="kpi-value mt-2">{stage.value}</p>
                </div>
              </Fragment>
            );
          })}
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mt-5 pt-4 etch-top">
          Prospect records created in the last 30 days: {discoverQueue} in database · {enrichedCount} enriched · {scoredCount} scored · {draftedCount} drafted · {scheduledByStatus} currently scheduled.
        </p>
      </div>

      {/* ─── 2. Per-brief health ─── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="section-label"><ListChecks className="w-3 h-3" /> Brief health</p>
          <p className="text-xs text-[var(--text-muted)]">
            {activeBriefs} active · {inactiveBriefs} paused
          </p>
        </div>
        {briefHealth.length === 0 ? (
          <EmptyState
            icon={<Sparkles />}
            title="No briefs yet"
            hint="Briefs tell autopilot what to search for (niche + city + country). Run Quick Setup below to seed three markets, or add briefs manually."
          />
        ) : (
          <div className="card overflow-hidden">
            <div className="max-h-[520px] overflow-auto">
              <table className="table-base">
                <thead className="sticky top-0 bg-white z-10">
                  <tr>
                    <th>Brief</th>
                    <th>Country</th>
                    <th>Status</th>
                    <th>Cursor</th>
                    <th>Last run</th>
                    <th>Skips</th>
                    <th>Next run</th>
                  </tr>
                </thead>
                <tbody>
                  {briefHealth.map((b) => {
                    const state = briefState(b, now);
                    const cursor = cursorLabel(b.discoveryCursor);
                    const lastRun = b.runs[0] ?? null;
                    const skips = parseSkips(lastRun?.notes ?? null);
                    const eta = nextRunEta(b, now);
                    return (
                      <tr key={b.id}>
                        <td>
                          <p className="text-[var(--text)] font-semibold text-[13px] truncate max-w-[220px]" title={b.name}>{b.name}</p>
                          <p className="text-[11px] text-[var(--text-muted)] truncate max-w-[220px]">
                            {b.totalDiscovered} discovered · {b.totalQualified} qualified all-time
                          </p>
                        </td>
                        <td className="font-mono text-xs">{b.country}</td>
                        <td>
                          <span className={`badge ${state.cls}`}>
                            <span aria-hidden>{state.symbol}</span>
                            {state.label}
                            {state.key === "cooldown" && b.cooldownUntil && (
                              <span className="font-mono">until {parisHHMM(b.cooldownUntil)}</span>
                            )}
                          </span>
                          {b.emptyRunStreak > 0 && (
                            <p className="text-[10.5px] text-amber-600 mt-1 font-medium">{b.emptyRunStreak} empty run{b.emptyRunStreak === 1 ? "" : "s"} in a row</p>
                          )}
                        </td>
                        <td className="font-mono text-xs">{cursor ?? "—"}</td>
                        <td>
                          {lastRun ? (
                            <>
                              <p className="text-xs tabular">
                                <span className="text-[var(--text)] font-semibold">{lastRun.found}</span> found · <span className="text-[var(--text)] font-semibold">{lastRun.created}</span> created
                              </p>
                              <p className="text-[10.5px] text-[var(--text-muted)] mt-0.5">{relativeFromNow(lastRun.startedAt, now)}</p>
                            </>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">never ran</span>
                          )}
                        </td>
                        <td>
                          {skips.length === 0 ? (
                            <span className="text-xs text-[var(--text-muted)]">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-[240px] py-1.5">
                              {skips.map((s) => (
                                <span
                                  key={s.reason}
                                  title={`${s.reason} ×${s.n}`}
                                  className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 text-[10.5px] font-medium max-w-[160px] truncate"
                                >
                                  {s.reason} ×{s.n}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td>
                          {eta ? (
                            <>
                              <p className="font-mono text-xs text-[var(--text)]">{parisShort(eta)}</p>
                              <p className="text-[10.5px] text-[var(--text-muted)] mt-0.5">{relativeFromNow(eta, now)} · Paris</p>
                            </>
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ─── 3. System strip ─── */}
      <div className="card p-6">
        <p className="section-label mb-4"><Zap className="w-3 h-3" /> System</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-5">
          <SystemCell
            ok={imapConfigured}
            label="Reply detection"
            value={imapConfigured ? "On" : "Off"}
            sub={imapConfigured ? "Follow-ups active" : "IMAP not configured — follow-ups gated"}
          />
          <SystemCell
            ok={redriveQueue === 0}
            warnOnly
            label="Redrive queue"
            value={redriveQueue.toString()}
            sub="New prospects with a brief — retried next run"
            href="/prospects"
          />
          <SystemCell
            ok={errorProspects === 0}
            warnOnly
            label="Stored errors"
            value={errorProspects.toString()}
            sub="Prospects with lastError set"
            href="/prospects"
          />
          <SystemCell
            ok={failedRuns7 === 0}
            label="Failed runs (7d)"
            value={failedRuns7.toString()}
            sub={failedRuns7 === 0 ? "All runs clean" : "See recent runs below"}
          />
          <SystemCell
            ok={budgetStopped7 === 0}
            warnOnly
            label="Budget-stopped"
            value={budgetStopped7.toString()}
            sub="Recent runs cut by time budget — cursor resumes"
          />
          <SystemCell
            ok={bccFailures === 0}
            label="BCC failures"
            value={bccFailures.toString()}
            sub={bccFailures === 0 ? "All sends copied to inbox" : "See Email.bccError"}
          />
        </div>
      </div>

      {/* Recent runs + recent sends */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <p className="section-label"><Sparkles className="w-3 h-3" /> Recent runs</p>
            <p className="text-xs text-[var(--text-muted)]">{recentRuns.length} shown · {totalProspects} prospects total</p>
          </div>
          {recentRuns.length === 0 ? (
            <EmptyState
              icon={<Activity />}
              title="No discovery runs yet"
              hint="Autopilot fires Mon–Fri at 07:00, 09:00, 11:00, 13:00, 15:00 and 17:00 Paris. Each run appears here with its counts and skip reasons."
            />
          ) : (
            <div className="card overflow-hidden">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Brief</th>
                    <th>Status</th>
                    <th>Found</th>
                    <th>Created</th>
                    <th>Qualified</th>
                    <th>Notes</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((r) => {
                    const skips = parseSkips(r.notes);
                    const cursor = notesCursor(r.notes);
                    const wasBudgetStopped = r.notes?.includes("budget-stopped") ?? false;
                    const wasExhausted = r.notes?.includes("exhausted") ?? false;
                    return (
                      <tr key={r.id}>
                        <td className="text-[var(--text)] font-semibold max-w-[180px] truncate" title={r.brief.name}>{r.brief.name}</td>
                        <td>
                          <span className={`badge ${r.status === "done" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : r.status === "running" ? "bg-sky-50 text-sky-700 border border-sky-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="tabular">{r.found}</td>
                        <td className="tabular">{r.created}</td>
                        <td className="tabular text-emerald-700 font-semibold">{r.qualified}</td>
                        <td>
                          <div className="flex flex-wrap gap-1 max-w-[260px] py-1.5">
                            {cursor && <span className="font-mono text-[10.5px] text-[var(--text-muted)] self-center">{cursor}</span>}
                            {wasBudgetStopped && (
                              <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 text-[10.5px] font-medium">budget-stopped</span>
                            )}
                            {wasExhausted && (
                              <span className="inline-flex items-center rounded-full bg-zinc-100 border border-zinc-200 text-zinc-600 px-2 py-0.5 text-[10.5px] font-medium">exhausted</span>
                            )}
                            {skips.map((s) => (
                              <span
                                key={s.reason}
                                title={`${s.reason} ×${s.n}`}
                                className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 text-[10.5px] font-medium max-w-[150px] truncate"
                              >
                                {s.reason} ×{s.n}
                              </span>
                            ))}
                            {!cursor && !wasBudgetStopped && !wasExhausted && skips.length === 0 && (
                              <span className="text-xs text-[var(--text-muted)]">—</span>
                            )}
                          </div>
                        </td>
                        <td className="text-xs tabular text-[var(--text-muted)]">{relativeFromNow(r.startedAt, now)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <p className="section-label mb-3"><Inbox className="w-3 h-3" /> Recent sends</p>
          {activeFeed.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title="No emails sent yet"
              hint="Scheduled prospects go out with the daily send sweep at 10:00 Paris. Sent emails appear here."
            />
          ) : (
            <div className="card p-5">
              <ul className="space-y-3.5">
                {activeFeed.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 text-xs">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-border)]">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/prospects/${e.prospect.id}`} className="text-[var(--text)] hover:text-[var(--accent)] font-semibold block truncate transition-colors">
                        {e.tip} · {e.prospect.firmaNaziv}
                      </Link>
                      <p className="text-[var(--text-muted)] mt-0.5">
                        {e.prospect.language === "nl" ? "NL · Dutch" : "FR · French"}
                      </p>
                    </div>
                    <span className="text-[var(--text-muted)] text-[10px] tabular shrink-0 pt-0.5">{e.poslatAt ? relativeFromNow(e.poslatAt, now) : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ─── Run now + Quick Setup + editors ─── */}
      <RunAutopilotNowButton />

      {discoveryConfigured && (
        <div className="card p-6">
          <p className="section-label mb-1"><Zap className="w-3 h-3 text-[var(--accent)]" /> Quick Setup — launch a market</p>
          <p className="text-[var(--text)] text-sm mt-1 mb-5 font-semibold">One click seeds 48 curated briefs across three markets.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <CountryTile flag="🇫🇷" country="France" active={byCountry.FR ?? 0} highlight="20 briefs · Places + Sirene gov registry" />
            <CountryTile flag="🇨🇭" country="Switzerland (Romandie)" active={byCountry.CH ?? 0} highlight="12 briefs · Geneva, Lausanne" />
            <CountryTile flag="🇳🇱" country="Netherlands" active={byCountry.NL ?? 0} highlight="16 briefs · Dutch templates" />
          </div>
          <QuickSetupButton hasAnyBrief={activeBriefs + inactiveBriefs > 0} />
        </div>
      )}

      {discoveryConfigured && <BulkBriefAdd />}

      <BriefsEditor discoveryConfigured={discoveryConfigured} />

      <div className="card p-6">
        <p className="section-label mb-4">Setup checklist</p>
        <ul className="space-y-2.5 text-sm">
          <CheckItem ok={discoveryConfigured} title="GOOGLE_PLACES_API_KEY" okHint="Google Places live — powers Group A + CH/NL discovery" missingHint="Add to Vercel env (the Sirene group still works without it)" />
          <CheckItem ok={!!process.env.IMAP_USER && !!process.env.IMAP_PASSWORD} title="IMAP_USER / IMAP_PASSWORD" okHint="Reply detection 3 times per day" missingHint="Without these, replies don't flow back and follow-ups stay gated" />
          <CheckItem ok={bccFailures === 0} title="BCC delivery to operator inbox" okHint="All sends logged on Email.bccSentAt" missingHint={`${bccFailures} send(s) failed BCC — see Email.bccError`} />
        </ul>
      </div>
    </div>
  );
}

function SystemCell({
  ok,
  warnOnly,
  label,
  value,
  sub,
  href,
}: {
  ok: boolean;
  /** When not ok, render amber (attention) instead of red (failure). */
  warnOnly?: boolean;
  label: string;
  value: string;
  sub: string;
  href?: string;
}) {
  const valueCls = ok ? "text-[var(--text)]" : warnOnly ? "text-amber-600" : "text-red-600";
  const dotCls = ok ? "bg-emerald-500" : warnOnly ? "bg-amber-500" : "bg-red-500";
  const body = (
    <>
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
        <p className="section-label">{label}</p>
      </div>
      <p className={`font-mono text-lg font-semibold mt-1.5 tabular ${valueCls}`}>{value}</p>
      <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">{sub}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="block rounded-lg -m-2 p-2 hover:bg-zinc-50 transition-colors">
        {body}
      </Link>
    );
  }
  return <div>{body}</div>;
}

function CountryTile({ flag, country, active, highlight }: { flag: string; country: string; active: number; highlight: string }) {
  const hasAny = active > 0;
  return (
    <div className={`rounded-lg border p-4 transition-colors ${hasAny ? "bg-[var(--accent-soft)] border-[var(--accent-border)]" : "bg-white border-[var(--border)] hover:border-[var(--border-strong)]"}`}>
      <div className="flex items-start justify-between">
        <span className="text-2xl">{flag}</span>
        <span className={`text-[10px] uppercase tracking-wider font-bold ${hasAny ? "text-emerald-700" : "text-[var(--text-muted)]"}`}>
          {hasAny ? `${active} active` : "Not yet"}
        </span>
      </div>
      <p className="text-[var(--text)] text-sm font-bold mt-3">{country}</p>
      <p className="text-[var(--text-muted)] text-xs mt-1">{highlight}</p>
    </div>
  );
}

function CheckItem({ ok, title, okHint, missingHint }: { ok: boolean; title: string; okHint: string; missingHint: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={`mt-0.5 ${ok ? "text-emerald-600" : "text-amber-600"}`}>
        {ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[var(--text)] font-semibold">{title}</p>
        <p className="text-[var(--text-muted)] text-xs mt-0.5">{ok ? okHint : missingHint}</p>
      </div>
    </li>
  );
}
