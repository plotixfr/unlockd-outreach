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
    },
  });

  if (!prospect) notFound();

  const audit = prospect.auditFindings as unknown as AuditResult | null;
  const site = prospect.siteSnapshot as unknown as SiteSnapshot | null;
  const psi = prospect.pagespeed as unknown as PageSpeedSnapshot | null;
  const greetingName = prospect.kontaktIme?.split(/\s+/)[0] ?? null;

  const findings: AuditFinding[] =
    audit?.findings && audit.findings.length > 0
      ? audit.findings
      : [
          // Graceful fallback if Claude audit generation failed: we still
          // give the prospect something concrete based on raw signals.
          {
            observation:
              psi?.performanceScore != null
                ? `Score Lighthouse mobile : ${psi.performanceScore}/100`
                : "Performance mobile non mesurée",
            impact:
              psi?.performanceScore != null && psi.performanceScore < 50
                ? "Sous 50, Google déprionise votre site sur mobile — vous perdez du trafic SEO."
                : "Premier point à vérifier — la vitesse mobile pilote le classement Google.",
            fix: "Re-bâtir la home en framework moderne (Next.js/Astro) — temps de chargement divisé par 3.",
          },
          {
            observation:
              site?.signals.techHints?.length
                ? `Plateforme détectée : ${site.signals.techHints.join(", ")}`
                : "Plateforme non identifiée",
            impact:
              "Les outils génériques plafonnent les marques premium — l'expérience est limitée par le builder.",
            fix: "Build sur-mesure aligné avec votre image — pas de templates partagés avec vos concurrents.",
          },
          {
            observation:
              site?.signals.hasReservation
                ? "Système de réservation en ligne présent"
                : "Pas de système de réservation visible",
            impact:
              "Chaque friction sur le parcours de réservation coûte 15-30 % de conversions.",
            fix: "Réservation native intégrée — un seul écran, sans rediriger vers un autre outil.",
          },
        ];

  return (
    <div className="min-h-screen bg-[#07070b] relative">
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
              <span className="text-white font-bold text-sm tracking-tighter">U</span>
            </div>
            <div className="text-left">
              <p className="text-emerald-300 text-base font-semibold tracking-tight leading-none">Unlockd</p>
              <p className="text-zinc-600 text-[10px] mt-1 tracking-widest uppercase font-medium">
                Web Studio · Paris
              </p>
            </div>
          </a>
          <p className="text-zinc-600 text-xs">
            Audit préparé pour <span className="text-zinc-400">{prospect.firmaNaziv}</span>
          </p>
        </div>

        {/* Hero */}
        <div className="mb-10">
          <p className="text-emerald-400 text-xs uppercase tracking-[0.18em] font-medium mb-3">
            Audit personnalisé
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight leading-[1.1]">
            {greetingName ? `Bonjour ${greetingName},` : "Bonjour,"}<br />
            voici les 3 points qui méritent votre attention.
          </h1>
          <p className="text-zinc-500 text-base mt-5 leading-relaxed">
            J&apos;ai regardé{" "}
            {prospect.website ? (
              <a
                href={prospect.website}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-300 hover:text-emerald-400 transition-colors underline-offset-2"
              >
                {prospect.website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
              </a>
            ) : (
              "votre site"
            )}{" "}
            avec les outils qu&apos;on utilise sur tous nos projets premium. Voici ce que ça
            donne, sans filtre.
          </p>
        </div>

        {/* Mockup hero — only if we generated one */}
        {prospect.mockupUrl && (
          <div className="mb-10 rounded-2xl overflow-hidden border border-[#1c1c28] bg-[#0d0d12] card-elevation">
            <div className="px-6 py-4 border-b border-[#1c1c28] flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <p className="text-zinc-300 text-sm font-medium">
                À quoi votre site pourrait ressembler
              </p>
              <span className="text-zinc-600 text-xs">— direction visuelle premier jet</span>
            </div>
            <div className="relative aspect-video bg-[#07070b]">
              <Image
                src={prospect.mockupUrl}
                alt={`Mockup pour ${prospect.firmaNaziv}`}
                fill
                sizes="(max-width: 768px) 100vw, 768px"
                className="object-cover"
                unoptimized
              />
            </div>
            <div className="px-6 py-3 border-t border-[#1c1c28] text-xs text-zinc-600">
              Composition générée par IA — point de départ pour la conversation. Le vrai
              design suit votre marque et vos contraintes.
            </div>
          </div>
        )}

        {/* Findings */}
        <div className="space-y-4 mb-10">
          {findings.map((f, i) => (
            <div
              key={i}
              className="rounded-2xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation"
            >
              <div className="flex items-start gap-4">
                <div className="flex flex-col items-center pt-1">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold text-white ${
                      SEVERITY_DOT[pickSeverity(i)]
                    }`}
                  >
                    {i + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-base leading-snug">
                    {f.observation}
                  </p>
                  <p className="text-zinc-400 text-sm mt-3 leading-relaxed">
                    <span className="text-zinc-500 text-xs uppercase tracking-wider mr-2">
                      Impact
                    </span>
                    {f.impact}
                  </p>
                  <p className="text-emerald-300/90 text-sm mt-3 leading-relaxed">
                    <span className="text-emerald-500/80 text-xs uppercase tracking-wider mr-2">
                      Ce qu&apos;on ferait
                    </span>
                    {f.fix}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500/[0.10] to-[#0d0d12] border border-emerald-500/30 p-8 card-elevation">
          <h2 className="text-white text-xl font-semibold tracking-tight">
            Si vous voulez creuser, on en parle 20 min.
          </h2>
          <p className="text-zinc-400 text-sm mt-2 leading-relaxed">
            Pas de pitch. Je vous montre ce qu&apos;on a fait pour des marques de votre
            secteur, et je réponds à vos questions concrètes — scope, délai, prix.
          </p>
          <div className="flex flex-wrap items-center gap-4 mt-6">
            <a
              href={SENDER_CALENDLY}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-sm font-semibold px-5 py-3 rounded-lg transition-colors shadow-lg shadow-emerald-500/20"
            >
              Réserver 20 minutes
              <ArrowRight className="w-4 h-4" />
            </a>
            <Link
              href="/audit"
              className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors inline-flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Auditer un autre site
            </Link>
          </div>
          <p className="text-zinc-600 text-[11px] mt-6">
            — {SENDER_NAME}, Unlockd · Paris
          </p>
        </div>

        <p className="text-center text-zinc-700 text-[11px] mt-12">
          © Unlockd.art {new Date().getFullYear()} ·{" "}
          <a href="https://unlockd.art" className="hover:text-zinc-500">
            unlockd.art
          </a>
        </p>
      </div>
    </div>
  );
}
