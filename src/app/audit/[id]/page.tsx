import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import type { AuditResult, AuditFinding } from "@/lib/auditFindings";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";
import { SENDER_CALENDLY, SENDER_NAME } from "@/lib/signature";

/**
 * Per-prospect public audit landing page. Built as the deliverable for the
 * "I'll send you the audit" promise in Follow2 — when the prospect clicks
 * the link in the email, they land here. No login required.
 *
 * What this page accomplishes:
 *   - Proves we actually looked (their site, their findings, their mockup)
 *   - Removes the "what is this gonna cost me?" friction (no signup, no form)
 *   - Pushes Calendly as the ONE low-friction next step
 *
 * Note this lives under /audit/[id] so the existing /audit (inbound funnel)
 * URL keeps working unchanged. The middleware already allow-lists /audit/.
 */

export const dynamic = "force-dynamic";

const SEVERITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  med: "bg-amber-500",
  low: "bg-zinc-600",
};

function pickSeverity(i: number): "high" | "med" | "low" {
  return i === 0 ? "high" : i === 1 ? "med" : "low";
}

export default async function PerProspectAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const prospect = await prisma.prospect.findUnique({
    where: { id },
    select: {
      id: true,
      firmaNaziv: true,
      kontaktIme: true,
      nisa: true,
      grad: true,
      website: true,
      mockupUrl: true,
      auditFindings: true,
      siteSnapshot: true,
      pagespeed: true,
      language: true,
    },
  });

  if (!prospect) notFound();

  const audit = prospect.auditFindings as unknown as AuditResult | null;
  const site = prospect.siteSnapshot as unknown as SiteSnapshot | null;
  const psi = prospect.pagespeed as unknown as PageSpeedSnapshot | null;
  const greetingName = prospect.kontaktIme?.split(/\s+/)[0] ?? null;
  const L: "fr" | "nl" = prospect.language === "nl" ? "nl" : "fr";

  // Locale strings — keep visible copy consistent with email tone.
  const t = {
    fr: {
      eyebrowSmall: "Web Studio · Paris",
      preparedFor: "Audit préparé pour",
      eyebrow: "Audit personnalisé",
      hero1: greetingName ? `Bonjour ${greetingName},` : "Bonjour,",
      hero2: "voici les 3 points qui méritent votre attention.",
      lookedAt: "J'ai regardé",
      lookedAtFallback: "votre site",
      lookedAtSuffix: "avec les outils qu'on utilise sur tous nos projets premium. Voici ce que ça donne, sans filtre.",
      mockupTitle: "À quoi votre site pourrait ressembler",
      mockupSub: "— direction visuelle premier jet",
      mockupCaption: "Composition générée par IA — point de départ pour la conversation. Le vrai design suit votre marque et vos contraintes.",
      labelImpact: "Impact",
      labelFix: "Ce qu'on ferait",
      ctaTitle: "Si vous voulez creuser, on en parle 20 min.",
      ctaSub: "Pas de pitch. Je vous montre ce qu'on a fait pour des marques de votre secteur, et je réponds à vos questions concrètes — scope, délai, prix.",
      ctaButton: "Réserver 20 minutes",
      otherSiteLink: "Auditer un autre site",
      // Fallback findings
      fb1Obs: psi?.performanceScore != null ? `Score Lighthouse mobile : ${psi.performanceScore}/100` : "Performance mobile non mesurée",
      fb1Imp: psi?.performanceScore != null && psi.performanceScore < 50 ? "Sous 50, Google déprionise votre site sur mobile — vous perdez du trafic SEO." : "Premier point à vérifier — la vitesse mobile pilote le classement Google.",
      fb1Fix: "Re-bâtir la home en framework moderne (Next.js/Astro) — temps de chargement divisé par 3.",
      fb2Obs: site?.signals.techHints?.length ? `Plateforme détectée : ${site.signals.techHints.join(", ")}` : "Plateforme non identifiée",
      fb2Imp: "Les outils génériques plafonnent les marques premium — l'expérience est limitée par le builder.",
      fb2Fix: "Build sur-mesure aligné avec votre image — pas de templates partagés avec vos concurrents.",
      fb3Obs: site?.signals.hasContactForm ? "Formulaire de contact présent" : "Pas de formulaire de contact visible",
      fb3Imp: "Sans CTA structuré, vos visiteurs partent sans laisser de trace — vous perdez les leads tièdes.",
      fb3Fix: "Parcours de conversion explicite : un seul appel à l'action, formulaire en 3 champs max.",
    },
    nl: {
      eyebrowSmall: "Web Studio · Parijs",
      preparedFor: "Audit voorbereid voor",
      eyebrow: "Persoonlijke audit",
      hero1: greetingName ? `Beste ${greetingName},` : "Goedendag,",
      hero2: "hier zijn de 3 punten die aandacht verdienen.",
      lookedAt: "Ik heb gekeken naar",
      lookedAtFallback: "uw site",
      lookedAtSuffix: "met de tools die we op al onze premium projecten gebruiken. Dit is wat eruit komt, zonder filter.",
      mockupTitle: "Hoe uw site eruit zou kunnen zien",
      mockupSub: "— eerste visuele richting",
      mockupCaption: "Door AI gegenereerde compositie — vertrekpunt voor het gesprek. Het echte ontwerp volgt uw merk en uw beperkingen.",
      labelImpact: "Impact",
      labelFix: "Wat wij zouden doen",
      ctaTitle: "Wilt u dieper graven? 20 minuten samen.",
      ctaSub: "Geen pitch. Ik laat zien wat we voor merken in uw sector deden, en beantwoord uw concrete vragen — scope, timing, prijs.",
      ctaButton: "Plan 20 minuten",
      otherSiteLink: "Een andere site auditen",
      // Fallback findings
      fb1Obs: psi?.performanceScore != null ? `Lighthouse mobile score: ${psi.performanceScore}/100` : "Mobile performance niet gemeten",
      fb1Imp: psi?.performanceScore != null && psi.performanceScore < 50 ? "Onder 50 zet Google uw site lager in mobiele resultaten — u verliest SEO-verkeer." : "Eerste punt om te checken — mobile snelheid stuurt Google ranking aan.",
      fb1Fix: "Home opnieuw bouwen op een modern framework (Next.js/Astro) — laadtijd door 3 gedeeld.",
      fb2Obs: site?.signals.techHints?.length ? `Gedetecteerd platform: ${site.signals.techHints.join(", ")}` : "Platform niet geïdentificeerd",
      fb2Imp: "Generieke tools beperken premium merken — uw ervaring loopt vast in de builder.",
      fb2Fix: "Maatwerk build afgestemd op uw imago — geen templates die u deelt met concurrenten.",
      fb3Obs: site?.signals.hasContactForm ? "Contactformulier aanwezig" : "Geen zichtbaar contactformulier",
      fb3Imp: "Zonder gestructureerde CTA verlaten bezoekers de site spoorloos — u verliest de lauwwarme leads.",
      fb3Fix: "Heldere conversiepath: één duidelijke call-to-action, formulier in max 3 velden.",
    },
  }[L];

  const findings: AuditFinding[] =
    audit?.findings && audit.findings.length > 0
      ? audit.findings
      : [
          { observation: t.fb1Obs, impact: t.fb1Imp, fix: t.fb1Fix },
          { observation: t.fb2Obs, impact: t.fb2Imp, fix: t.fb2Fix },
          { observation: t.fb3Obs, impact: t.fb3Imp, fix: t.fb3Fix },
        ];

  return (
    // theme-dark-embed: this prospect-facing page keeps the dark look while
    // the admin shell is light — the class rescopes all CSS vars to dark.
    <div className="theme-dark-embed min-h-screen bg-[var(--bg)] text-[var(--text)] relative">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(16, 185, 129, 0.10), transparent 60%)",
        }}
      />
      <div className="relative max-w-3xl mx-auto px-6 py-14 sm:py-20">
        {/* Brand */}
        <div className="flex items-center justify-between mb-10">
          <a href="https://unlockd.art" className="inline-flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <span className="text-white font-extrabold text-sm tracking-tighter">U</span>
            </div>
            <div className="text-left">
              <p className="text-gradient-brand text-base font-extrabold tracking-tight leading-none">Unlockd</p>
              <p className="text-[var(--text-faint)] text-[10px] mt-1 tracking-widest uppercase font-bold">
                {t.eyebrowSmall}
              </p>
            </div>
          </a>
          <p className="text-[var(--text-faint)] text-xs">
            {t.preparedFor} <span className="text-[var(--text-muted)]">{prospect.firmaNaziv}</span>
          </p>
        </div>

        {/* Hero */}
        <div className="mb-10">
          <p className="section-label text-emerald-400/80 mb-3">
            <Sparkles className="w-3 h-3" />
            {t.eyebrow}
          </p>
          <h1 className="display-number text-3xl sm:text-5xl text-white tracking-tight leading-[1.05]">
            {t.hero1}<br />
            {t.hero2}
          </h1>
          <p className="text-[var(--text-muted)] text-base mt-5 leading-relaxed">
            {t.lookedAt}{" "}
            {prospect.website ? (
              <a
                href={prospect.website}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--text)] hover:text-emerald-300 transition-colors underline-offset-2"
              >
                {prospect.website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
              </a>
            ) : (
              t.lookedAtFallback
            )}{" "}
            {t.lookedAtSuffix}
          </p>
        </div>

        {/* Mockup hero — only if we generated one */}
        {prospect.mockupUrl && (
          <div className="card mb-10 overflow-hidden rounded-md">
            <div className="px-6 py-4 border-b border-[var(--border-2)] flex items-center gap-3 bg-[var(--bg-elev-1)]">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <p className="text-white text-sm font-bold">
                {t.mockupTitle}
              </p>
              <span className="text-[var(--text-dim)] text-xs">{t.mockupSub}</span>
            </div>
            <div className="relative aspect-video bg-[var(--bg)]">
              <Image
                src={prospect.mockupUrl}
                alt={`Mockup ${prospect.firmaNaziv}`}
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-cover"
                unoptimized
              />
            </div>
            <div className="px-6 py-3 etch-top text-xs text-[var(--text-dim)]">
              {t.mockupCaption}
            </div>
          </div>
        )}

        {/* Findings */}
        <div className="space-y-4 mb-10">
          {findings.map((f, i) => (
            <div key={i} className="card p-6 rounded-md">
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center pt-1">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-sm text-xs font-bold text-white ${
                      SEVERITY_DOT[pickSeverity(i)]
                    }`}
                  >
                    {i + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-base leading-snug">
                    {f.observation}
                  </p>
                  <p className="text-[var(--text-muted)] text-sm mt-3 leading-relaxed">
                    <span className="text-[var(--text-dim)] text-[10.5px] uppercase tracking-wider mr-2 font-bold">
                      {t.labelImpact}
                    </span>
                    {f.impact}
                  </p>
                  <p className="text-emerald-300/90 text-sm mt-3 leading-relaxed">
                    <span className="text-emerald-500/80 text-[10.5px] uppercase tracking-wider mr-2 font-bold">
                      {t.labelFix}
                    </span>
                    {f.fix}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="card card-accent corner-accent p-8 rounded-md">
          <h2 className="text-white text-xl font-bold tracking-tight">
            {t.ctaTitle}
          </h2>
          <p className="text-[var(--text-muted)] text-sm mt-2 leading-relaxed">
            {t.ctaSub}
          </p>
          <div className="flex flex-wrap items-center gap-4 mt-6">
            <a
              href={SENDER_CALENDLY}
              target="_blank"
              rel="noreferrer"
              className="btn-accent"
            >
              {t.ctaButton}
              <ArrowRight className="w-4 h-4" />
            </a>
            <Link
              href="/audit"
              className="text-[var(--text-dim)] hover:text-[var(--text)] text-sm transition-colors inline-flex items-center gap-1.5 font-semibold"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t.otherSiteLink}
            </Link>
          </div>
          <p className="text-[var(--text-dim)] text-[11px] mt-6">
            — {SENDER_NAME}, Unlockd · Paris
          </p>
        </div>

        <p className="text-center text-[var(--text-faint)] text-[11px] mt-12">
          © Unlockd.art {new Date().getFullYear()} ·{" "}
          <a href="https://unlockd.art" className="hover:text-[var(--text-dim)]">
            unlockd.art
          </a>
        </p>
      </div>
    </div>
  );
}
