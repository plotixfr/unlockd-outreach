/**
 * Post-conversion engine. The autopilot brings them in; this brings them
 * BACK — and asks them to bring their network with them. Every closed deal
 * gets a 4-touch arc over a year:
 *
 *   Day 30:  Referral request — at peak satisfaction, ask for 2 intros
 *   Day 60:  Maintenance retainer pitch — €350/mo recurring
 *   Day 180: SEO / continuous improvement retainer pitch
 *   Day 365: Annual refresh proposal — new project at 80% margin
 *
 * Recurring revenue + warm-lead generation. Pure margin since the client
 * already exists. Each successful retainer = ~€4,200/yr. Each successful
 * referral = ~5x close rate vs cold.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { getEmailSystemPrompt, extractJsonArray } from "@/lib/emailPrompt";
import { sanitizeDashes, cleanEmailBody } from "@/lib/sanitizeDashes";
import type { SiteSnapshot } from "@/lib/scrapeSite";

const EMAIL_MODEL = "claude-sonnet-4-6";

interface UpsellTier {
  count: number;       // upsellCount value AFTER this touch fires
  afterDays: number;   // days since conversion the touch becomes due
  tip: string;         // Email.tip value
  brief: string;       // angle Claude is given
}

const TIERS: UpsellTier[] = [
  {
    count: 1,
    afterDays: 30,
    tip: "referral30",
    brief: `30 jours après le lancement. Le client est probablement au pic de satisfaction. Ton angle : tu lui demandes UNE introduction (pas plus). Mention casuelle qu'on travaille bien quand on est recommandé, qu'on prend très peu de nouveaux clients par mois.

Format : 60-80 mots. Pas de jargon. Très chaleureux mais pas fade. Termine par une question simple ("voyez-vous quelqu'un dans votre cercle qui mériterait le même traitement ?").`,
  },
  {
    count: 2,
    afterDays: 60,
    tip: "retainer60",
    brief: `60 jours après le lancement. Le site tourne ; le client a vu les bénéfices. C'est le moment d'introduire le contrat de maintenance mensuel (€350/mois) — sécurité, monitoring performance, retouches mensuelles de contenu.

Format : 80-100 mots. Cadre positif : pas "votre site va se casser", plutôt "garder le niveau premium au long terme". Mentionne une chose précise (ex: les mises à jour de sécurité régulières). Termine par : "Je peux vous envoyer le détail ?"`,
  },
  {
    count: 3,
    afterDays: 180,
    tip: "retainer180",
    brief: `Six mois après le lancement. Si le retainer maintenance a été pris, le client le connait ; sinon, l'angle est différent : on parle SEO + amélioration continue (audit trimestriel, tests A/B, optimisation conversion). €450-650/mois.

Format : 80-100 mots. Reférence concrètement le temps passé ("depuis 6 mois maintenant"). Démontre qu'on a observé leur trafic / conversions. Termine par proposition d'un appel court de 20 min.`,
  },
  {
    count: 4,
    afterDays: 365,
    tip: "retainer365",
    brief: `Un an exact après le lancement. C'est le moment du refresh annuel — nouveau hero, nouvelle direction visuelle, nouveaux modules. Pas une refonte totale ; un rafraîchissement à 30-50% du budget initial.

Format : 60-80 mots. Cadre la conversation autour du temps qui passe ("un an déjà"). Évoque les nouveaux standards web qui ont évolué. Termine par : "Cela vous intéresse de regarder ce qu'on pourrait faire en 2026 ?"`,
  },
];

export interface UpsellCandidate {
  id: string;
  firmaNaziv: string;
  email: string;
  kontaktIme: string | null;
  language: string;
  upsellCount: number;
  lastUpsellAt: Date | null;
  datumKonverzije: Date;
  projectValueEur: number;
  niche: string;
  city: string;
  siteSnapshot: SiteSnapshot | null;
}

export async function findUpsellCandidates(): Promise<{ tier: UpsellTier; prospect: UpsellCandidate }[]> {
  // We need conversions to anchor the timing — Prospect.status=Converted is
  // necessary but not sufficient (status can change). Join through Conversion
  // table for the authoritative datumKonverzije.
  const converted = await prisma.prospect.findMany({
    where: {
      status: "Converted",
      conversions: { some: {} },
    },
    include: {
      conversions: { orderBy: { datumKonverzije: "asc" }, take: 1 },
    },
  });

  const now = Date.now();
  const out: { tier: UpsellTier; prospect: UpsellCandidate }[] = [];

  for (const p of converted) {
    const conv = p.conversions[0];
    if (!conv) continue;
    const daysSince = (now - conv.datumKonverzije.getTime()) / 86400000;

    // Next eligible tier = the one matching upsellCount + 1
    const nextTier = TIERS.find((t) => t.count === p.upsellCount + 1);
    if (!nextTier) continue;
    if (daysSince < nextTier.afterDays) continue;

    // Last upsell guard: don't send two upsells within 25 days of each other
    if (p.lastUpsellAt && now - p.lastUpsellAt.getTime() < 25 * 86400000) continue;

    out.push({
      tier: nextTier,
      prospect: {
        id: p.id,
        firmaNaziv: p.firmaNaziv,
        email: p.email,
        kontaktIme: p.kontaktIme,
        language: p.language,
        upsellCount: p.upsellCount,
        lastUpsellAt: p.lastUpsellAt,
        datumKonverzije: conv.datumKonverzije,
        projectValueEur: conv.vrijednostProjekta,
        niche: p.nisa,
        city: p.grad,
        siteSnapshot: (p.siteSnapshot as unknown as SiteSnapshot | null) ?? null,
      },
    });
  }

  return out;
}

interface UpsellEmail {
  subject: string;
  body: string;
}

async function generateUpsellEmail(
  prospect: UpsellCandidate,
  tier: UpsellTier
): Promise<UpsellEmail | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const firstName = prospect.kontaktIme?.trim().split(/\s+/)[0] ?? null;
  const greeting = firstName ? `Bonjour ${firstName},` : "Bonjour,";

  const prompt = `Tu rédiges un email post-conversion à un CLIENT existant — pas un cold lead. Tu lui as déjà livré son site il y a ~${tier.afterDays} jours.

Contexte client :
- Entreprise : ${prospect.firmaNaziv}
- Secteur : ${prospect.niche}
- Ville : ${prospect.city}
- Projet livré : ${prospect.projectValueEur.toLocaleString("fr-FR")} €
- Date de livraison : ${prospect.datumKonverzije.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}

Brief pour ce touch (${tier.tip}) :
${tier.brief}

Règles :
- Commence par "${greeting}"
- Ton chaleureux mais DIRECT — c'est un client, pas un prospect
- Pas de "j'espère que vous allez bien"
- Pas d'auto-promotion lourde
- Maximum 100 mots
- NE PAS inclure de signature (ajoutée automatiquement)
- Format HTML simple : balises p uniquement

Réponds UNIQUEMENT JSON :
{"subject":"...","body":"<p>...</p><p>...</p>"}`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: EMAIL_MODEL,
      max_tokens: 1200,
      system: await getEmailSystemPrompt(prospect.language),
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") return null;
    const raw = block.text.trim();
    // Tolerate both single-object and single-element-array shapes
    const objMatch = raw.match(/\{[\s\S]*\}/);
    if (!objMatch) return null;
    try {
      const arr = JSON.parse(extractJsonArray(raw)) as Array<{ subject?: string; body?: string }>;
      if (Array.isArray(arr) && arr[0]) {
        return { subject: sanitizeDashes(String(arr[0].subject ?? "")), body: cleanEmailBody(String(arr[0].body ?? "")) };
      }
    } catch {
      // fall through
    }
    const parsed = JSON.parse(objMatch[0]) as { subject?: string; body?: string };
    return { subject: sanitizeDashes(String(parsed.subject ?? "")), body: cleanEmailBody(String(parsed.body ?? "")) };
  } catch (e) {
    console.warn(`[upsell] generation failed for ${prospect.id}:`, e);
    return null;
  }
}

function nextSlot(): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1 + Math.floor(Math.random() * 2));
  while (true) {
    const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short" }).format(d);
    if (day !== "Sat" && day !== "Sun") break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const hour = 9 + Math.floor(Math.random() * 7);
  const min = Math.floor(Math.random() * 60);
  d.setUTCHours(hour - 1, min, 0, 0);
  return d;
}

export interface UpsellRunSummary {
  scanned: number;
  generated: number;
  scheduled: number;
  errors: string[];
}

/**
 * Runs the upsell batch. Picks every converted prospect at a due milestone,
 * generates the next-touch email in their context, persists + schedules via
 * the existing send pipeline (which treats anything-but-follow-up as a
 * standalone touch and skips threading).
 */
export async function runUpsellBatch(limit = 20): Promise<UpsellRunSummary> {
  const summary: UpsellRunSummary = { scanned: 0, generated: 0, scheduled: 0, errors: [] };
  const candidates = await findUpsellCandidates();
  const slice = candidates.slice(0, limit);
  summary.scanned = slice.length;

  for (const { tier, prospect } of slice) {
    try {
      // Skip if we somehow already have an unsent email of this tip
      const existing = await prisma.email.findFirst({
        where: { prospectId: prospect.id, tip: tier.tip },
      });
      if (existing) continue;

      const gen = await generateUpsellEmail(prospect, tier);
      if (!gen || !gen.subject || !gen.body) {
        summary.errors.push(`${prospect.firmaNaziv}: generisanje neuspješno`);
        continue;
      }
      summary.generated++;

      const slot = nextSlot();
      await prisma.email.create({
        data: {
          prospectId: prospect.id,
          tip: tier.tip,
          subject: gen.subject,
          body: gen.body,
          activeSubject: "A",
        },
      });

      // We don't change the prospect's status (they stay Converted) — instead
      // we re-arm scheduledInitial so the send cron picks up the new touch.
      // The send cron's `standaloneTips` list now includes the upsell tips.
      await prisma.prospect.update({
        where: { id: prospect.id },
        data: {
          scheduledInitial: slot,
          scheduledFollow1: null,
          scheduledFollow2: null,
          scheduledFollow3: null,
          upsellCount: tier.count,
          lastUpsellAt: new Date(),
        },
      });
      summary.scheduled++;
    } catch (e) {
      summary.errors.push(`${prospect.firmaNaziv}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  return summary;
}
