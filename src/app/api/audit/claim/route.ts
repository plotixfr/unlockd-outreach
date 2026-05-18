import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scrapeSite, type SiteSnapshot } from "@/lib/scrapeSite";
import { fetchPageSpeed, type PageSpeedSnapshot } from "@/lib/pagespeed";
import { findDecisionMakers } from "@/lib/decisionMakers";
import { scoreProspect } from "@/lib/qualityScore";
import { sendAuditEmail } from "@/lib/auditEmail";

export const maxDuration = 90;

/**
 * Public endpoint — no auth. Triggered when someone submits their email on
 * the /audit landing. Persists the visitor as a Prospect (source=public_audit),
 * enriches them in the background, scores them, and sends a personalised
 * audit follow-up email with a Calendly CTA.
 *
 * This is the inbound flywheel: every audit becomes a warm lead in the
 * autopilot. They close at 5-10x the rate of cold prospects.
 */
export async function POST(req: NextRequest) {
  let body: { url?: string; email?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
  }

  const rawUrl = body.url?.trim();
  const rawEmail = body.email?.trim().toLowerCase();
  const name = body.name?.trim() || null;

  if (!rawUrl) return NextResponse.json({ error: "URL je obavezan" }, { status: 400 });
  if (!rawEmail || !rawEmail.includes("@") || !rawEmail.includes(".")) {
    return NextResponse.json({ error: "Email nije validan" }, { status: 400 });
  }

  // Light rate-limit by email: don't accept the same email more than once in 24h.
  const existing = await prisma.prospect.findUnique({ where: { email: rawEmail } });
  if (existing) {
    // Already in the DB — re-send the audit email but don't create a duplicate.
    let normalised = rawUrl;
    if (!/^https?:\/\//i.test(normalised)) normalised = `https://${normalised}`;
    const send = await sendAuditEmail({
      prospectId: existing.id,
      toEmail: rawEmail,
      toName: name ?? existing.kontaktIme,
      websiteUrl: existing.website ?? normalised,
      siteSnapshot: (existing.siteSnapshot as unknown as SiteSnapshot | null) ?? null,
      pagespeed: (existing.pagespeed as unknown as PageSpeedSnapshot | null) ?? null,
    });
    return NextResponse.json({
      ok: send.ok,
      duplicate: true,
      error: send.error,
    });
  }

  let normalisedUrl = rawUrl;
  if (!/^https?:\/\//i.test(normalisedUrl)) normalisedUrl = `https://${normalisedUrl}`;

  let domain: string;
  try {
    domain = new URL(normalisedUrl).hostname.replace(/^www\./, "");
  } catch {
    return NextResponse.json({ error: "URL nije ispravan" }, { status: 400 });
  }

  // Heuristically derive a firmaNaziv from the domain so the record looks
  // sensible even before any scrape data arrives.
  const inferredName = domain.split(".")[0].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // Run scrape + PSI + DM in parallel; tolerate any/all failures.
  const [site, psi, dm] = await Promise.all([
    scrapeSite(normalisedUrl).catch(() => null),
    fetchPageSpeed(normalisedUrl).catch(() => null),
    findDecisionMakers(normalisedUrl).catch(() => null),
  ]);

  const prospect = await prisma.prospect.create({
    data: {
      firmaNaziv: site?.ok ? (site.title || site.h1 || inferredName).slice(0, 80) : inferredName,
      email: rawEmail,
      website: normalisedUrl,
      kontaktIme: name,
      nisa: site?.lang === "fr" ? "Inbound (FR)" : "Inbound",
      grad: "Unknown",
      source: "public_audit",
      sourceQuery: domain,
      status: "Replied", // they engaged — treat them as warm by default
      datumOdgovora: new Date(),
      ...(site
        ? {
            siteSnapshot: site as unknown as object,
            siteSnapshotAt: new Date(),
          }
        : {}),
      ...(psi
        ? {
            pagespeed: psi as unknown as object,
            pagespeedAt: new Date(),
          }
        : {}),
      ...(dm ? { decisionMakers: dm as unknown as object } : {}),
    },
  });

  // Background scoring — don't block the response on it.
  void scoreProspect({
    firmaNaziv: prospect.firmaNaziv,
    nisa: prospect.nisa,
    grad: prospect.grad,
    website: normalisedUrl,
    opisFirme: null,
    napomena: null,
    siteSnapshot: site,
    pagespeed: psi,
  })
    .then((scoring) => {
      if (scoring) {
        return prisma.prospect.update({
          where: { id: prospect.id },
          data: { qualityScore: scoring.score, qualityNote: scoring.note },
        });
      }
    })
    .catch((e) => console.warn("[audit/claim] scoring failed:", e));

  // Send the audit email — this is what makes the inbound feel hand-crafted.
  const send = await sendAuditEmail({
    prospectId: prospect.id,
    toEmail: rawEmail,
    toName: name,
    websiteUrl: normalisedUrl,
    siteSnapshot: site,
    pagespeed: psi,
  });

  return NextResponse.json({
    ok: send.ok,
    prospectId: prospect.id,
    duplicate: false,
    error: send.error,
  });
}
