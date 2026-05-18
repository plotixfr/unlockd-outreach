/**
 * Aggregates every meaningful event for one prospect into a single
 * chronological timeline. Reads from Prospect (status changes, scrape dates,
 * scheduling, dealStage), Email (sent/opened/clicked), Reply (received,
 * classified), and Note tables. Returns events oldest-first; the UI reverses
 * for display.
 */

import { prisma } from "@/lib/prisma";

export type ActivityKind =
  | "prospect_created"
  | "prospect_scraped"
  | "prospect_scored"
  | "prospect_decision_makers"
  | "campaign_scheduled"
  | "email_generated"
  | "email_sent"
  | "email_opened"
  | "calendly_clicked"
  | "reply_received"
  | "reply_classified"
  | "deal_stage_changed"
  | "note_added"
  | "conversion"
  | "reengage_scheduled"
  | "mockup_generated"
  | "proposal_generated"
  | "reminder_set"
  | "linkedin_sent"
  | "upsell_sent";

export interface ActivityEvent {
  kind: ActivityKind;
  at: Date;
  title: string;
  detail?: string;
  tone?: "info" | "success" | "warning" | "danger" | "muted";
}

export async function getProspectActivity(prospectId: string): Promise<ActivityEvent[]> {
  const [prospect, emails, replies, notes, conversions] = await Promise.all([
    prisma.prospect.findUnique({ where: { id: prospectId } }),
    prisma.email.findMany({ where: { prospectId }, orderBy: { createdAt: "asc" } }),
    prisma.reply.findMany({ where: { prospectId }, orderBy: { receivedAt: "asc" } }),
    prisma.note.findMany({ where: { prospectId }, orderBy: { createdAt: "asc" } }),
    prisma.conversion.findMany({ where: { prospectId }, orderBy: { createdAt: "asc" } }),
  ]);

  if (!prospect) return [];

  const ev: ActivityEvent[] = [];

  ev.push({
    kind: "prospect_created",
    at: prospect.createdAt,
    title: prospect.source === "google_places"
      ? "Otkriven kroz Google Places"
      : prospect.source === "public_audit"
        ? "Stigao kroz javni audit"
        : prospect.source === "url_import"
          ? "Dodat preko URL importa"
          : "Dodat ručno",
    detail: prospect.briefId ? "Iz aktivnog brief-a" : undefined,
    tone: "info",
  });

  if (prospect.siteSnapshotAt) {
    ev.push({
      kind: "prospect_scraped",
      at: prospect.siteSnapshotAt,
      title: "Sajt skeniran",
      detail: prospect.website || undefined,
      tone: "muted",
    });
  }

  if (prospect.pagespeedAt) {
    ev.push({
      kind: "prospect_scraped",
      at: prospect.pagespeedAt,
      title: "Lighthouse mjeren",
      detail: undefined,
      tone: "muted",
    });
  }

  if (prospect.qualityScore !== null && prospect.qualityScore !== undefined) {
    ev.push({
      kind: "prospect_scored",
      at: prospect.updatedAt,
      title: `Quality score ${prospect.qualityScore}/10`,
      detail: prospect.qualityNote || undefined,
      tone:
        prospect.qualityScore >= 7
          ? "success"
          : prospect.qualityScore >= 5
            ? "info"
            : "warning",
    });
  }

  if (prospect.scheduledInitial) {
    ev.push({
      kind: "campaign_scheduled",
      at: prospect.scheduledInitial,
      title: prospect.scheduledInitial > new Date() ? "Kampanja zakazana" : "Initial bio zakazan",
      detail: prospect.autoScheduled ? "Auto-zakaž od autopilot-a" : "Ručno zakazano",
      tone: "info",
    });
  }

  for (const e of emails) {
    ev.push({
      kind: "email_generated",
      at: e.createdAt,
      title: `Email "${e.tip}" generisan`,
      detail: e.subject,
      tone: "muted",
    });
    if (e.poslat && e.poslatAt) {
      ev.push({
        kind: "email_sent",
        at: e.poslatAt,
        title: `Poslan "${e.tip}"`,
        detail: e.activeSubject === "B" && e.subjectB ? e.subjectB : e.subject,
        tone: "info",
      });
    }
    if (e.otvoren && e.otvorenAt) {
      ev.push({
        kind: "email_opened",
        at: e.otvorenAt,
        title: `Otvoren "${e.tip}"`,
        tone: "success",
      });
    }
    if (e.calendlyClicked && e.calendlyClickedAt) {
      ev.push({
        kind: "calendly_clicked",
        at: e.calendlyClickedAt,
        title: "Kliknuo Calendly link",
        detail: "Topao lead — provjeri da li je book-ovao",
        tone: "warning",
      });
    }
  }

  for (const r of replies) {
    ev.push({
      kind: "reply_received",
      at: r.receivedAt,
      title: "Odgovor stigao",
      detail: r.subject || undefined,
      tone: "success",
    });
    if (r.classification) {
      ev.push({
        kind: "reply_classified",
        at: r.receivedAt,
        title: `Klasifikovan: ${r.classification}`,
        detail: r.draft ? "AI draft odgovora spreman" : undefined,
        tone:
          r.classification === "Interested" || r.classification === "Question"
            ? "success"
            : r.classification === "Negative" || r.classification === "Unsubscribe"
              ? "danger"
              : "muted",
      });
    }
  }

  if (prospect.dealStage && prospect.dealStageAt) {
    ev.push({
      kind: "deal_stage_changed",
      at: prospect.dealStageAt,
      title: `Deal stage → ${prospect.dealStage}`,
      detail: prospect.dealValue ? `${prospect.dealValue.toLocaleString("fr-FR")} €` : undefined,
      tone: prospect.dealStage === "Won" ? "success" : prospect.dealStage === "Lost" ? "danger" : "info",
    });
  }

  for (const n of notes) {
    ev.push({
      kind: "note_added",
      at: n.createdAt,
      title: "Nota dodana",
      detail: n.tekst.slice(0, 160),
      tone: "muted",
    });
  }

  for (const c of conversions) {
    ev.push({
      kind: "conversion",
      at: c.datumKonverzije,
      title: `Konverzija — ${c.vrijednostProjekta.toLocaleString("fr-FR")} €`,
      detail: c.napomena || undefined,
      tone: "success",
    });
  }

  if (prospect.mockupAt) {
    ev.push({
      kind: "mockup_generated",
      at: prospect.mockupAt,
      title: "AI mockup generisan",
      tone: "muted",
    });
  }

  if (prospect.proposalAt) {
    ev.push({
      kind: "proposal_generated",
      at: prospect.proposalAt,
      title: "Ponuda generisana",
      tone: "info",
    });
  }

  if (prospect.lastReengageAt) {
    ev.push({
      kind: "reengage_scheduled",
      at: prospect.lastReengageAt,
      title: `Re-engagement #${prospect.reengageCount}`,
      detail: "90/180/365-dnevni touch",
      tone: "muted",
    });
  }

  if (prospect.linkedinTouchedAt) {
    ev.push({
      kind: "linkedin_sent",
      at: prospect.linkedinTouchedAt,
      title: "LinkedIn DM poslat",
      detail: "Multi-channel touch (manual)",
      tone: "info",
    });
  }

  if (prospect.lastUpsellAt) {
    const tierLabel =
      prospect.upsellCount === 1 ? "Referral request" :
      prospect.upsellCount === 2 ? "Maintenance retainer pitch" :
      prospect.upsellCount === 3 ? "SEO retainer pitch" :
      prospect.upsellCount === 4 ? "Annual refresh proposal" :
      `Upsell #${prospect.upsellCount}`;
    ev.push({
      kind: "upsell_sent",
      at: prospect.lastUpsellAt,
      title: tierLabel,
      detail: "Post-conversion engine",
      tone: "success",
    });
  }

  if (prospect.podsjetnikDatum) {
    ev.push({
      kind: "reminder_set",
      at: prospect.podsjetnikDatum,
      title: prospect.podsjetnikDatum > new Date() ? "Podsjetnik zakazan" : "Podsjetnik prošao",
      detail: prospect.podsjetnikNapomena || undefined,
      tone: "info",
    });
  }

  ev.sort((a, b) => a.at.getTime() - b.at.getTime());
  return ev;
}
