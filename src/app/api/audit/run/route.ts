import { NextRequest, NextResponse } from "next/server";
import { scrapeSite } from "@/lib/scrapeSite";
import { fetchPageSpeed } from "@/lib/pagespeed";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const maxDuration = 60;

/**
 * Public endpoint — no auth. Runs an immediate audit on a submitted URL and
 * returns a JSON summary the /audit landing renders inline. Email is NOT
 * required here; the email gate is on /api/audit/claim and only triggers
 * persistence + outbound email.
 */
export async function POST(req: NextRequest) {
  // Each call burns ~30s of scrape + a PageSpeed API hit — throttle per IP.
  if (!rateLimit(`audit-run:${clientIp(req)}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: "Trop de requêtes — réessayez dans quelques minutes." }, { status: 429 });
  }
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  }

  // Run scrape + PSI in parallel — both bounded by their internal timeouts.
  const [site, psi] = await Promise.all([
    scrapeSite(rawUrl).catch(() => null),
    fetchPageSpeed(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`).catch(() => null),
  ]);

  if (!site || !site.ok) {
    return NextResponse.json({
      ok: false,
      error: site?.error || "Sajt nije dostupan",
      url: rawUrl,
    });
  }

  // Synthesise the top 3 issues from raw signals.
  const issues: { label: string; severity: "high" | "medium" | "low"; detail: string }[] = [];

  if (psi?.ok && psi.performanceScore !== null && psi.performanceScore < 50) {
    issues.push({
      label: `Performance mobile : ${psi.performanceScore}/100`,
      severity: "high",
      detail: psi.lcpMs
        ? `Chargement principal en ${(psi.lcpMs / 1000).toFixed(1)}s — le standard premium est <2s.`
        : "Score critique — les visiteurs partent avant même de voir votre offre.",
    });
  } else if (psi?.ok && psi.performanceScore !== null && psi.performanceScore < 80) {
    issues.push({
      label: `Performance mobile : ${psi.performanceScore}/100`,
      severity: "medium",
      detail: "Score correct mais sous le seuil premium (90+).",
    });
  }

  if (!site.signals.responsiveViewport) {
    issues.push({
      label: "Pas de viewport mobile",
      severity: "high",
      detail: "Votre site ne signale pas être optimisé mobile — 65 % de vos visiteurs sont sur smartphone.",
    });
  }

  if (site.signals.techHints.some((t) => /Wix|Squarespace/i.test(t))) {
    issues.push({
      label: `Plateforme : ${site.signals.techHints.join(", ")}`,
      severity: "medium",
      detail: "Plateforme générique — limites de design, performances et SEO pour une marque premium.",
    });
  }

  if (site.signals.approxImageCount < 4 && site.signals.approxImageCount > 0) {
    issues.push({
      label: `Peu d'images visibles (${site.signals.approxImageCount})`,
      severity: "medium",
      detail: "Pour une marque qui vit de l'image, ce manque visuel coûte des conversions.",
    });
  }

  if (
    !site.signals.hasReservation &&
    (site.title?.match(/hôtel|hotel|restaurant|spa/i) || rawUrl.match(/hotel|hôtel|restaurant/i))
  ) {
    issues.push({
      label: "Aucun système de réservation détecté",
      severity: "high",
      detail: "Chaque visiteur qui veut réserver doit appeler ou écrire — friction massive pour un secteur où la décision est impulsive.",
    });
  }

  return NextResponse.json({
    ok: true,
    url: site.url,
    title: site.title,
    h1: site.h1,
    lighthouse: psi?.ok && psi.performanceScore !== null ? psi.performanceScore : null,
    lcpSec: psi?.ok && psi.lcpMs ? psi.lcpMs / 1000 : null,
    platform: site.signals.techHints.join(", ") || null,
    responsive: site.signals.responsiveViewport,
    issues: issues.slice(0, 5),
  });
}
