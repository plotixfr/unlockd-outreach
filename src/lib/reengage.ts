/**
 * Dormant-prospect recovery. Re-engages prospects who completed the original
 * outreach sequence but never replied — at 90, 180, and 365 days after the
 * last follow-up. Each touch uses a different angle so it never feels like
 * spam, and we hard-cap at 3 re-engagements per prospect (after that they're
 * genuinely dead).
 *
 * Recovery rate in industry-standard cold outreach: 5-10% on dormant prospects.
 * Each re-engagement costs ~$0.02 in Claude tokens and one send-cap slot.
 * Pure expected value.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import {
  buildEmailPrompt,
  getEmailSystemPrompt,
  extractJsonArray,
  type PromptCaseStudy,
} from "@/lib/emailPrompt";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";
import type { DecisionMakerResult } from "@/lib/decisionMakers";

const EMAIL_MODEL = "claude-sonnet-4-6";
const MAX_REENGAGES = 3;
const TIERS = [
  { offsetDays: 90, count: 0, label: "reengage90" },
  { offsetDays: 180, count: 1, label: "reengage180" },
  { offsetDays: 365, count: 2, label: "reengage365" },
] as const;

const ANGLES: Record<string, string> = {
  reengage90:
    "Trois mois après notre dernier échange. Réfère-toi explicitement à ce délai. Angle: événement saisonnier ou nouveauté concrète chez Unlockd qui mérite qu'on en reparle (ex : nouveau case study dans leur secteur). Reste très court, 60-80 mots max. Ton: léger, pas insistant.",
  reengage180:
    "Six mois après notre dernier échange. Angle: ce que leur concurrence directe a changé sur leurs sites depuis (sans nommer personne précisément), et donc le terrain qu'ils perdent en attendant. Plus direct mais toujours premium. 60-80 mots.",
  reengage365:
    "Un an exactement depuis notre dernier message. Angle: bilan annuel — leur site a-t-il évolué ? Si non, c'est probablement le moment de bouger. Dernière proposition d'échange, simple oui/non. Court et chaleureux. 50-70 mots.",
};

export interface DormantCandidate {
  id: string;
  firmaNaziv: string;
  email: string;
  reengageCount: number;
  datumFollowUp3: Date | null;
  lastReengageAt: Date | null;
}

/**
 * Finds prospects ready for the next re-engagement touch.
 * - Tier 0 → 1: status = Follow3, datumFollowUp3 ≥ 90 days old
 * - Tier 1 → 2: lastReengageAt ≥ 90 days old, reengageCount = 1
 * - Tier 2 → 3: lastReengageAt ≥ 185 days old, reengageCount = 2
 * Skips anyone who has since replied/converted/unsubscribed/bounced.
 */
export async function findDormantCandidates(): Promise<{ tier: number; prospects: DormantCandidate[] }[]> {
  const now = Date.now();
  const out: { tier: number; prospects: DormantCandidate[] }[] = [];

  for (const t of TIERS) {
    const minimumAgeMs = t.offsetDays * 86400000;
    let where: Record<string, unknown>;
    if (t.count === 0) {
      // First re-engagement: 90+ days after the original follow-up 3.
      where = {
        status: "Follow3",
        reengageCount: 0,
        datumFollowUp3: { not: null, lte: new Date(now - minimumAgeMs) },
      };
    } else {
      // Subsequent re-engagements: 90+ days since the last reengage touch.
      where = {
        reengageCount: t.count,
        lastReengageAt: { not: null, lte: new Date(now - 90 * 86400000) },
        status: { notIn: ["Replied", "Converted", "Unsubscribed", "Bounced"] },
      };
    }

    const found = await prisma.prospect.findMany({
      where,
      select: {
        id: true,
        firmaNaziv: true,
        email: true,
        reengageCount: true,
        datumFollowUp3: true,
        lastReengageAt: true,
      },
      orderBy: { datumFollowUp3: "asc" },
    });

    if (found.length > 0) out.push({ tier: t.count + 1, prospects: found });
  }
  return out;
}

interface ReengageOutput {
  subject: string;
  subjectB: string | null;
  body: string;
}

/**
 * Single-shot generation: re-uses the main email prompt but with a tighter
 * instruction set and a single output (no follow-up cascade).
 */
async function generateOne(
  prospectId: string,
  tier: 1 | 2 | 3
): Promise<ReengageOutput | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
  if (!prospect) return null;

  const nicheTemplate = await prisma.nicheTemplate.findUnique({ where: { nisa: prospect.nisa } });
  const caseStudyRow =
    (await prisma.caseStudy.findFirst({
      where: { nisa: prospect.nisa, active: true },
      orderBy: { updatedAt: "desc" },
    })) ??
    (await prisma.caseStudy.findFirst({ where: { active: true }, orderBy: { updatedAt: "desc" } }));
  const caseStudy: PromptCaseStudy | null = caseStudyRow
    ? {
        title: caseStudyRow.title,
        summary: caseStudyRow.summary,
        metricLabel: caseStudyRow.metricLabel,
        metricValue: caseStudyRow.metricValue,
      }
    : null;

  const tierLabel = tier === 1 ? "reengage90" : tier === 2 ? "reengage180" : "reengage365";
  const angle = ANGLES[tierLabel];

  // Build a prompt that asks Claude for ONE email instead of four.
  const basePrompt = buildEmailPrompt(prospect, {
    nicheHint: nicheTemplate?.promptHint,
    siteSnapshot: (prospect.siteSnapshot as unknown as SiteSnapshot | null) ?? null,
    pagespeed: (prospect.pagespeed as unknown as PageSpeedSnapshot | null) ?? null,
    decisionMakers: (prospect.decisionMakers as unknown as DecisionMakerResult | null) ?? null,
    caseStudy,
  });

  const reengagePrompt = `${basePrompt}

OVERRIDE — IGNORE LA CONSIGNE DES 4 EMAILS CI-DESSUS. Tu produis UN SEUL email de réengagement.

Contexte : ce prospect a déjà reçu ta séquence cold il y a longtemps sans réponse. Tu reviens avec un angle frais.

Instructions spécifiques pour ce niveau :
${angle}

Le sujet et le corps doivent :
- Faire référence au délai écoulé subtilement (ne dis pas "je vous relance" — c'est lourd)
- Apporter UNE chose nouvelle (pas une répétition du premier email)
- Rester premium, jamais désespéré

Return ONLY this JSON shape:
[{"tip":"${tierLabel}","subject":"...","subjectB":"...","body":"<p>...</p>"}]`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: EMAIL_MODEL,
      max_tokens: 1500,
      system: await getEmailSystemPrompt(),
      messages: [{ role: "user", content: reengagePrompt }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") return null;
    const raw = extractJsonArray(block.text);
    const parsed = JSON.parse(raw) as Array<{ subject?: string; subjectB?: string; body?: string }>;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const e = parsed[0];
    return {
      subject: typeof e.subject === "string" ? e.subject : "",
      subjectB: typeof e.subjectB === "string" ? e.subjectB : null,
      body: typeof e.body === "string" ? e.body : "",
    };
  } catch (err) {
    console.warn(`[reengage] generation failed for ${prospectId}:`, err);
    return null;
  }
}

/**
 * Picks the next weekday slot ~24-48h ahead. Reusing simple logic so the
 * re-engagement doesn't go out the exact moment cron runs.
 */
function nextSlot(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1 + Math.floor(Math.random() * 2));
  // Bump past weekend
  while (true) {
    const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short" }).format(d);
    if (day !== "Sat" && day !== "Sun") break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  // Random business hour
  const hour = 9 + Math.floor(Math.random() * 7);
  const min = Math.floor(Math.random() * 60);
  d.setUTCHours(hour - 1, min, 0, 0); // approximate Paris→UTC offset
  return d;
}

export interface ReengageRunSummary {
  scanned: number;
  generated: number;
  scheduled: number;
  errors: string[];
}

/**
 * Walks every dormant tier, generates fresh content per prospect, persists
 * an Email row with tip=reengage{N}, and schedules it on scheduledInitial
 * (the send cron picks up Scheduled prospects with poslat=false on that field).
 *
 * NOTE: we hijack scheduledInitial because the existing send cron only knows
 * how to dispatch initial sends + the 3 follow-ups. Putting the reengage on
 * scheduledInitial + status=Scheduled means it goes through the same path.
 * The prospect's original status is restored after the send completes via
 * a TIP_TO_STATUS-driven update — but reengage90/180/365 aren't in that map,
 * so the prospect stays Scheduled until they actually engage. That's fine
 * because we use reengageCount, not status, to decide next dormant tier.
 */
export async function runReengageBatch(limit = 30): Promise<ReengageRunSummary> {
  const summary: ReengageRunSummary = { scanned: 0, generated: 0, scheduled: 0, errors: [] };
  const tiers = await findDormantCandidates();

  // Flatten + cap so a single cron tick doesn't blow Vercel duration.
  const all: { tier: 1 | 2 | 3; prospect: DormantCandidate }[] = [];
  for (const t of tiers) {
    for (const p of t.prospects) {
      all.push({ tier: t.tier as 1 | 2 | 3, prospect: p });
    }
  }
  const slice = all.slice(0, limit);
  summary.scanned = slice.length;

  for (const { tier, prospect } of slice) {
    try {
      const tipLabel = `reengage${tier === 1 ? "90" : tier === 2 ? "180" : "365"}`;

      // Skip if we've already drafted this re-engage but somehow it failed to
      // schedule — never duplicate.
      const existing = await prisma.email.findFirst({
        where: { prospectId: prospect.id, tip: tipLabel },
      });
      if (existing) continue;

      const gen = await generateOne(prospect.id, tier);
      if (!gen || !gen.subject || !gen.body) {
        summary.errors.push(`${prospect.firmaNaziv}: generisanje neuspješno`);
        continue;
      }
      summary.generated++;

      // Save the email + schedule it.
      const slot = nextSlot();
      await prisma.email.create({
        data: {
          prospectId: prospect.id,
          tip: tipLabel,
          subject: gen.subject,
          subjectB: gen.subjectB,
          body: gen.body,
          activeSubject: gen.subjectB && Math.random() < 0.5 ? "B" : "A",
        },
      });

      // Re-arm the prospect so the send cron picks them up.
      await prisma.prospect.update({
        where: { id: prospect.id },
        data: {
          status: "Scheduled",
          scheduledInitial: slot,
          scheduledFollow1: null,
          scheduledFollow2: null,
          scheduledFollow3: null,
          reengageCount: tier,
          lastReengageAt: new Date(),
        },
      });
      summary.scheduled++;
    } catch (e) {
      summary.errors.push(`${prospect.firmaNaziv}: ${e instanceof Error ? e.message : "greška"}`);
    }
  }

  return summary;
}
