/**
 * Computes the prioritized "do this now" queue for the dashboard. Each task
 * is a high-leverage action with an estimated time-to-complete so the
 * operator can blow through it in a 15-minute block instead of doom-scrolling
 * the prospects list.
 *
 * Priority order (highest impact first):
 *   1. HOT reply drafts waiting → revenue today
 *   2. Calendly clicks not yet booked → revenue this week
 *   3. Replied prospects without deal stage → revenue this month
 *   4. Reminders due today → relationships saved
 *   5. Deals in Proposal/Negotiating > 7 days → momentum
 *   6. Unscored prospects with sent emails → data hygiene (last)
 */

import { prisma } from "@/lib/prisma";

export type TaskKind =
  | "hot_reply"
  | "calendly_click"
  | "set_deal_stage"
  | "reminder_due"
  | "stuck_deal"
  | "unscored";

export interface TodayTask {
  kind: TaskKind;
  prospectId: string;
  firmaNaziv: string;
  city: string;
  niche: string;
  priority: number;
  estimateMin: number;
  title: string;
  hint: string;
  href: string;
  badge?: string;
  badgeTone?: "danger" | "warning" | "info" | "success";
}

const TASK_LIMIT = 12;

export async function getTodayQueue(): Promise<TodayTask[]> {
  const now = new Date();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [hotReplies, calendlyClicks, repliedWithoutStage, reminders, stuckDeals] = await Promise.all([
    prisma.reply.findMany({
      where: {
        draft: { not: null },
        classification: { in: ["Interested", "Question"] },
        prospect: { status: { notIn: ["Converted", "Unsubscribed"] } },
      },
      include: { prospect: { select: { firmaNaziv: true, grad: true, nisa: true } } },
      orderBy: { receivedAt: "desc" },
      take: 8,
    }),
    prisma.email.findMany({
      where: {
        calendlyClicked: true,
        prospect: {
          status: { notIn: ["Converted", "Unsubscribed"] },
          dealStage: null,
        },
      },
      include: { prospect: { select: { firmaNaziv: true, grad: true, nisa: true } } },
      orderBy: { calendlyClickedAt: "desc" },
      take: 8,
    }),
    prisma.prospect.findMany({
      where: {
        status: "Replied",
        dealStage: null,
      },
      select: { id: true, firmaNaziv: true, grad: true, nisa: true, datumOdgovora: true },
      orderBy: { datumOdgovora: "desc" },
      take: 5,
    }),
    prisma.prospect.findMany({
      where: {
        podsjetnikDatum: { not: null, lte: todayEnd },
        status: { notIn: ["Converted", "Unsubscribed", "Bounced"] },
      },
      select: { id: true, firmaNaziv: true, grad: true, nisa: true, podsjetnikDatum: true, podsjetnikNapomena: true },
      take: 6,
    }),
    prisma.prospect.findMany({
      where: {
        dealStage: { in: ["Proposal", "Negotiating"] },
        dealStageAt: { lte: new Date(now.getTime() - 7 * 86400000) },
      },
      select: { id: true, firmaNaziv: true, grad: true, nisa: true, dealStage: true, dealValue: true, dealStageAt: true },
      take: 5,
    }),
  ]);

  const out: TodayTask[] = [];

  for (const r of hotReplies) {
    out.push({
      kind: "hot_reply",
      prospectId: r.prospectId,
      firmaNaziv: r.prospect.firmaNaziv,
      city: r.prospect.grad,
      niche: r.prospect.nisa,
      priority: 1,
      estimateMin: 4,
      title: `Send draft odgovora — ${r.prospect.firmaNaziv}`,
      hint: `${r.classification} · odgovorio ${rel(r.receivedAt, now)}`,
      href: `/prospects/${r.prospectId}`,
      badge: "🔥",
      badgeTone: "danger",
    });
  }

  for (const e of calendlyClicks) {
    out.push({
      kind: "calendly_click",
      prospectId: e.prospectId,
      firmaNaziv: e.prospect.firmaNaziv,
      city: e.prospect.grad,
      niche: e.prospect.nisa,
      priority: 2,
      estimateMin: 3,
      title: `Kontaktiraj — ${e.prospect.firmaNaziv}`,
      hint: `Kliknuo Calendly ${e.calendlyClickedAt ? rel(e.calendlyClickedAt, now) : ""} ali nije book-ovao`,
      href: `/prospects/${e.prospectId}`,
      badge: "💎",
      badgeTone: "warning",
    });
  }

  for (const p of repliedWithoutStage) {
    out.push({
      kind: "set_deal_stage",
      prospectId: p.id,
      firmaNaziv: p.firmaNaziv,
      city: p.grad,
      niche: p.nisa,
      priority: 3,
      estimateMin: 1,
      title: `Postavi deal stage — ${p.firmaNaziv}`,
      hint: `Odgovorio ${p.datumOdgovora ? rel(p.datumOdgovora, now) : ""} ali nije u pipeline-u`,
      href: `/prospects/${p.id}`,
      badge: "→",
      badgeTone: "info",
    });
  }

  for (const p of reminders) {
    out.push({
      kind: "reminder_due",
      prospectId: p.id,
      firmaNaziv: p.firmaNaziv,
      city: p.grad,
      niche: p.nisa,
      priority: 4,
      estimateMin: 5,
      title: `Podsjetnik — ${p.firmaNaziv}`,
      hint: p.podsjetnikNapomena || `Za ${p.podsjetnikDatum ? rel(p.podsjetnikDatum, now) : "danas"}`,
      href: `/prospects/${p.id}`,
      badge: "🔔",
      badgeTone: "info",
    });
  }

  for (const p of stuckDeals) {
    out.push({
      kind: "stuck_deal",
      prospectId: p.id,
      firmaNaziv: p.firmaNaziv,
      city: p.grad,
      niche: p.nisa,
      priority: 5,
      estimateMin: 5,
      title: `Pratiti deal — ${p.firmaNaziv}`,
      hint: `${p.dealStage} · stanje od ${p.dealStageAt ? rel(p.dealStageAt, now) : ""}${p.dealValue ? ` · ${p.dealValue.toLocaleString("fr-FR")} €` : ""}`,
      href: `/prospects/${p.id}`,
      badge: p.dealStage === "Negotiating" ? "💰" : "📄",
      badgeTone: p.dealStage === "Negotiating" ? "success" : "info",
    });
  }

  out.sort((a, b) => a.priority - b.priority);
  return out.slice(0, TASK_LIMIT);
}

function rel(d: Date, now = new Date()): string {
  const diff = now.getTime() - d.getTime();
  const min = Math.round(diff / 60000);
  if (Math.abs(min) < 60) return min >= 0 ? `prije ${min} min` : `za ${-min} min`;
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return h >= 0 ? `prije ${h} h` : `za ${-h} h`;
  const day = Math.round(h / 24);
  return day >= 0 ? `prije ${day} dan${day === 1 ? "" : "a"}` : `za ${-day} dana`;
}

/**
 * Pipeline forecast — weights each open prospect by the standard close-rate
 * of its deal stage. Returns expected € for "next ~30 days" assuming current
 * velocity. Conservative; meant as a baseline for the operator's planning.
 */
export interface ForecastSummary {
  pipelineValueOpen: number;
  expectedNext30: number;
  closedThisMonth: number;
  closedLastMonth: number;
  trend30: number; // % change vs prev period
}

const STAGE_PROBABILITY: Record<string, number> = {
  Discovery: 0.2,
  Proposal: 0.45,
  Negotiating: 0.65,
};

export async function getForecast(): Promise<ForecastSummary> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = monthStart;

  const [open, closedThis, closedPrev] = await Promise.all([
    prisma.prospect.findMany({
      where: { dealStage: { in: ["Discovery", "Proposal", "Negotiating"] }, dealValue: { not: null } },
      select: { dealStage: true, dealValue: true },
    }),
    prisma.conversion.aggregate({
      _sum: { vrijednostProjekta: true },
      where: { datumKonverzije: { gte: monthStart } },
    }),
    prisma.conversion.aggregate({
      _sum: { vrijednostProjekta: true },
      where: { datumKonverzije: { gte: prevMonthStart, lt: prevMonthEnd } },
    }),
  ]);

  const pipelineValueOpen = open.reduce((acc, p) => acc + (p.dealValue ?? 0), 0);
  const expectedNext30 = open.reduce(
    (acc, p) => acc + (p.dealValue ?? 0) * (STAGE_PROBABILITY[p.dealStage ?? ""] ?? 0),
    0
  );
  const closedThisMonth = closedThis._sum.vrijednostProjekta ?? 0;
  const closedLastMonth = closedPrev._sum.vrijednostProjekta ?? 0;
  const trend30 =
    closedLastMonth > 0 ? ((closedThisMonth - closedLastMonth) / closedLastMonth) * 100 : closedThisMonth > 0 ? 100 : 0;

  return { pipelineValueOpen, expectedNext30, closedThisMonth, closedLastMonth, trend30 };
}

/**
 * Streak + momentum signals. The user sees this on the dashboard daily.
 * It's intentionally optimistic — a tool that makes you feel like you're
 * winning will get used more.
 */
export interface MomentumSummary {
  daysWithRepliesStreak: number;
  emailsThisWeek: number;
  emailsLastWeek: number;
  emailsTrend: number; // % vs last week
  repliesThisWeek: number;
  repliesLastWeek: number;
  repliesTrend: number;
  meetingsThisMonth: number;
}

export async function getMomentum(): Promise<MomentumSummary> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [emailsThisWeek, emailsLastWeek, repliesThisWeek, repliesLastWeek, meetings, recentReplies] =
    await Promise.all([
      prisma.email.count({ where: { poslat: true, poslatAt: { gte: weekAgo } } }),
      prisma.email.count({ where: { poslat: true, poslatAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.reply.count({ where: { receivedAt: { gte: weekAgo } } }),
      prisma.reply.count({ where: { receivedAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
      prisma.prospect.count({
        where: {
          dealStage: { in: ["Discovery", "Proposal", "Negotiating", "Won"] },
          dealStageAt: { gte: monthStart },
        },
      }),
      prisma.reply.findMany({
        where: { receivedAt: { gte: new Date(now.getTime() - 30 * 86400000) } },
        select: { receivedAt: true },
        orderBy: { receivedAt: "desc" },
      }),
    ]);

  // Streak = consecutive days back from today that had at least one reply.
  const replyDays = new Set(
    recentReplies.map((r) => r.receivedAt.toISOString().slice(0, 10))
  );
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (replyDays.has(d.toISOString().slice(0, 10))) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  const emailsTrend = emailsLastWeek > 0
    ? ((emailsThisWeek - emailsLastWeek) / emailsLastWeek) * 100
    : emailsThisWeek > 0 ? 100 : 0;
  const repliesTrend = repliesLastWeek > 0
    ? ((repliesThisWeek - repliesLastWeek) / repliesLastWeek) * 100
    : repliesThisWeek > 0 ? 100 : 0;

  return {
    daysWithRepliesStreak: streak,
    emailsThisWeek,
    emailsLastWeek,
    emailsTrend,
    repliesThisWeek,
    repliesLastWeek,
    repliesTrend,
    meetingsThisMonth: meetings,
  };
}
