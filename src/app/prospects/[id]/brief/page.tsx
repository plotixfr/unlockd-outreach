import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import type { PageSpeedSnapshot } from "@/lib/pagespeed";
import { generateTalkingPoints } from "@/lib/talkingPoints";

export const dynamic = "force-dynamic";

function thumioUrl(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return `https://image.thum.io/get/png/width/1200/${u.toString()}`;
  } catch {
    return "";
  }
}

/**
 * Printer-friendly sales-call brief. Operator opens this in a new tab 1h
 * before the meeting; reads it, optionally prints to PDF, walks into the
 * call already knowing what to say. Designed in a clean editorial style so
 * the rendered PDF looks like a Big-4 consulting one-pager.
 */
export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prospect = await prisma.prospect.findUnique({ where: { id } });
  if (!prospect) notFound();

  const site = prospect.siteSnapshot as unknown as SiteSnapshot | null;
  const psi = prospect.pagespeed as unknown as PageSpeedSnapshot | null;

  // Generate fresh talking points each time — cheap (Haiku) and reflects any
  // recent re-scrape. Tolerates Anthropic outage.
  const points = await generateTalkingPoints({
    firmaNaziv: prospect.firmaNaziv,
    nisa: prospect.nisa,
    grad: prospect.grad,
    website: prospect.website,
    kontaktIme: prospect.kontaktIme,
    qualityScore: prospect.qualityScore,
    qualityNote: prospect.qualityNote,
    siteSnapshot: site,
    pagespeed: psi,
  });

  const signals = site?.signals;

  return (
    <div className="min-h-screen bg-white text-zinc-900 print:bg-white">
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          @page { margin: 1.5cm; }
        }
        @page { size: A4; }
      `}</style>

      <div className="max-w-3xl mx-auto px-12 py-10 print:py-0">
        {/* Header */}
        <div className="flex items-start justify-between pb-6 border-b-2 border-zinc-900">
          <div>
            <p className="text-zinc-500 text-[10px] uppercase tracking-[0.25em] font-semibold">Sales Brief — Confidentiel</p>
            <h1 className="text-3xl font-semibold mt-2 tracking-tight">{prospect.firmaNaziv}</h1>
            <p className="text-zinc-600 text-sm mt-1">
              {prospect.nisa} · {prospect.grad}
              {prospect.kontaktIme && ` · ${prospect.kontaktIme}${prospect.kontaktPozicija ? `, ${prospect.kontaktPozicija}` : ""}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-zinc-900 font-semibold text-sm">Unlockd.art</p>
            <p className="text-zinc-500 text-xs mt-0.5">{new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </div>

        {/* Snapshot + score */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="border border-zinc-200 rounded-lg p-4">
            <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium">Quality Score</p>
            <p className="text-3xl font-semibold mt-1 tabular-nums">
              {prospect.qualityScore ?? "—"}<span className="text-zinc-400 text-base">/10</span>
            </p>
            {prospect.qualityNote && <p className="text-zinc-600 text-xs mt-1">{prospect.qualityNote}</p>}
          </div>
          <div className="border border-zinc-200 rounded-lg p-4">
            <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium">Lighthouse Mobile</p>
            <p className={`text-3xl font-semibold mt-1 tabular-nums ${psi?.ok && psi.performanceScore !== null && psi.performanceScore < 50 ? "text-red-600" : psi?.ok && psi.performanceScore !== null && psi.performanceScore < 80 ? "text-amber-600" : "text-zinc-900"}`}>
              {psi?.ok && psi.performanceScore !== null ? psi.performanceScore : "—"}
              <span className="text-zinc-400 text-base">/100</span>
            </p>
            {psi?.ok && psi.lcpMs && <p className="text-zinc-600 text-xs mt-1">LCP: {(psi.lcpMs / 1000).toFixed(1)}s</p>}
          </div>
          <div className="border border-zinc-200 rounded-lg p-4">
            <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium">Recommended Tier</p>
            <p className="text-2xl font-semibold mt-1">
              {points?.pricingBand.tier ?? "Pro"}
            </p>
            <p className="text-zinc-600 text-xs mt-1">
              {points?.pricingBand.tier === "Essential" ? "€5–8k" : points?.pricingBand.tier === "Bespoke" ? "€20k+" : "€10–18k"}
            </p>
          </div>
        </div>

        {/* Current site screenshot */}
        {prospect.website && (
          <div className="mt-6">
            <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium mb-2">Trenutni sajt</p>
            <div className="rounded-lg overflow-hidden border border-zinc-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumioUrl(prospect.website)} alt={prospect.website} className="w-full block" />
            </div>
            <p className="text-zinc-500 text-xs mt-1.5">{prospect.website}</p>
          </div>
        )}

        {/* Observations */}
        {points && points.observations.length > 0 && (
          <Section title="Šta sam primijetio na njihovom sajtu">
            <ol className="space-y-2.5">
              {points.observations.map((o, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="text-zinc-400 font-semibold tabular-nums shrink-0">{i + 1}.</span>
                  <span className="text-zinc-700 leading-relaxed">{o}</span>
                </li>
              ))}
            </ol>
          </Section>
        )}

        {/* Discovery questions */}
        {points && points.questions.length > 0 && (
          <Section title="Pitanja za poziv (discovery)">
            <ul className="space-y-2.5">
              {points.questions.map((q, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="text-zinc-400 shrink-0">·</span>
                  <span className="text-zinc-700 leading-relaxed">{q}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Competitors */}
        {points && points.competitorsToMention.length > 0 && (
          <Section title="Premium konkurenti za benchmark">
            <ul className="space-y-1.5">
              {points.competitorsToMention.map((c, i) => (
                <li key={i} className="text-sm text-zinc-700">· {c}</li>
              ))}
            </ul>
          </Section>
        )}

        {/* Pricing rationale */}
        {points?.pricingBand.rationale && (
          <Section title="Cjenovni nivo — obrazloženje">
            <p className="text-sm text-zinc-700 leading-relaxed">{points.pricingBand.rationale}</p>
          </Section>
        )}

        {/* Site signals */}
        {signals && (
          <Section title="Tehnički signali">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
              <Signal label="Responsive mobile" value={signals.responsiveViewport ? "Da" : "NE"} bad={!signals.responsiveViewport} />
              <Signal label="Sistem rezervacija" value={signals.hasReservation ? "Da" : "Ne"} bad={!signals.hasReservation && (prospect.nisa.toLowerCase().includes("hotel") || prospect.nisa.toLowerCase().includes("restaurant"))} />
              <Signal label="Kontakt forma" value={signals.hasContactForm ? "Da" : "Ne"} bad={!signals.hasContactForm} />
              <Signal label="Instagram link" value={signals.hasInstagramLink ? "Da" : "Ne"} />
              <Signal label="Platforma" value={signals.techHints.join(", ") || "—"} />
              <Signal label="Broj slika" value={String(signals.approxImageCount)} />
            </div>
          </Section>
        )}

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-zinc-200 flex items-center justify-between text-xs text-zinc-500 no-print">
          <p>Brief generisao Unlockd Outreach — interno za Temima.</p>
          <button onClick={(() => { return; }) as never} className="hidden" />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <h2 className="text-zinc-500 text-[10px] uppercase tracking-[0.18em] font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Signal({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className={bad ? "text-red-600 font-semibold" : "text-zinc-900 font-medium"}>{value}</span>
    </div>
  );
}
