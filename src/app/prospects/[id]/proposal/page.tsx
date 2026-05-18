import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { type ProposalContent } from "@/lib/proposal";
import { ProposalActions } from "@/components/ProposalActions";
import { GenerateProposalButton } from "@/components/GenerateProposalButton";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Printer-friendly French proposal. Generation is lazy — the page never calls
 * Claude inline on render (which would block 20-40s and exceed Vercel Hobby's
 * 10s budget). Instead:
 *
 *   - No cached content → render an empty state with "Generiši ponudu" button
 *   - Button POSTs to /api/prospects/[id]/proposal with maxDuration=60
 *   - On success, router.refresh() pulls the now-cached content
 *
 * Operator can re-trigger generation any time via ProposalActions.
 */
export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prospect = await prisma.prospect.findUnique({ where: { id } });
  if (!prospect) notFound();

  const content = prospect.proposalContent as unknown as ProposalContent | null;

  if (!content) {
    return (
      <div className="min-h-screen bg-white text-zinc-900 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="text-zinc-500 text-[10px] uppercase tracking-[0.25em] font-semibold mb-3">Proposition Commerciale</p>
          <h1 className="text-2xl font-semibold tracking-tight">{prospect.firmaNaziv}</h1>
          <p className="text-zinc-600 text-sm mt-2 mb-8">
            Generiši personalizovanu francusku ponudu sa 3 cjenovna nivoa, value calculator-om i scope-om prilagođenim nišinjihovom sektoru. Claude Sonnet, ~30 sekundi.
          </p>
          <GenerateProposalButton prospectId={id} />
          <p className="text-zinc-500 text-xs mt-4">Generisana ponuda se kešira — sljedeća posjeta učitava odmah.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 print:bg-white">
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          @page { margin: 1.8cm; size: A4; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto px-12 py-12 print:py-0">

        {/* Action bar (hidden on print) */}
        <div className="no-print mb-8 flex items-center justify-between rounded-xl bg-zinc-100 border border-zinc-200 px-4 py-3">
          <p className="text-zinc-600 text-xs">
            {prospect?.proposalAt
              ? `Generisano ${new Date(prospect.proposalAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
              : "Tek generisano"}
          </p>
          <ProposalActions prospectId={id} />
        </div>

        {/* Letterhead */}
        <div className="pb-8 border-b border-zinc-900">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-zinc-500 text-[10px] uppercase tracking-[0.25em] font-semibold">Proposition Commerciale</p>
              <h1 className="text-4xl font-semibold mt-3 tracking-tight">{prospect!.firmaNaziv}</h1>
              <p className="text-zinc-600 text-sm mt-1">
                {prospect!.nisa} · {prospect!.grad}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-base tracking-tight">Unlockd.art</p>
              <p className="text-zinc-500 text-xs mt-0.5">Studio web premium · Paris</p>
              <p className="text-zinc-500 text-xs mt-3">{new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>
              <p className="text-zinc-500 text-xs">Référence #{id.slice(-6).toUpperCase()}</p>
            </div>
          </div>
        </div>

        {/* Intro */}
        <Section>
          <p className="text-zinc-800 leading-relaxed">{content.intro}</p>
        </Section>

        {/* Challenge */}
        <Section title="Constat">
          <p className="text-zinc-800 leading-relaxed">{content.challenge}</p>
        </Section>

        {/* Approach */}
        <Section title="Notre approche">
          <p className="text-zinc-800 leading-relaxed">{content.approach}</p>
        </Section>

        {/* Value projection */}
        {content.valueProjection && (
          <Section title="Projection de valeur">
            <p className="text-zinc-800 leading-relaxed mb-3">{content.valueProjection.headline}</p>
            <div className="rounded-lg border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {content.valueProjection.rows.map((r, i) => (
                    <tr key={i} className="border-b border-zinc-200 last:border-0">
                      <td className="px-4 py-2.5 text-zinc-600">{r.label}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-zinc-900 font-medium mt-3 italic">{content.valueProjection.breakEven}</p>
          </Section>
        )}

        {/* Scope by tier */}
        <Section title="Périmètre par palier">
          <div className="space-y-5">
            {content.scope.map((s) => (
              <div key={s.tier}>
                <p className="text-zinc-900 font-semibold text-sm mb-2">{s.tier}</p>
                <ul className="space-y-1.5 ml-4">
                  {s.bullets.map((b, i) => (
                    <li key={i} className="text-sm text-zinc-700 leading-relaxed list-disc">{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* Timeline */}
        <Section title="Calendrier">
          <div className="rounded-lg border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th className="text-left px-4 py-2.5 text-zinc-600 text-[10px] uppercase tracking-widest font-semibold">Phase</th>
                  <th className="text-left px-4 py-2.5 text-zinc-600 text-[10px] uppercase tracking-widest font-semibold">Semaines</th>
                  <th className="text-left px-4 py-2.5 text-zinc-600 text-[10px] uppercase tracking-widest font-semibold">Livrable</th>
                </tr>
              </thead>
              <tbody>
                {content.timeline.map((t, i) => (
                  <tr key={i} className="border-b border-zinc-200 last:border-0">
                    <td className="px-4 py-2.5 text-zinc-900 font-medium">{t.phase}</td>
                    <td className="px-4 py-2.5 text-zinc-600 tabular-nums whitespace-nowrap">{t.weeks}</td>
                    <td className="px-4 py-2.5 text-zinc-700">{t.deliverable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Pricing */}
        <Section title="Investissement">
          <div className="grid grid-cols-3 gap-3">
            {content.pricing.map((p) => (
              <div
                key={p.tier}
                className={`rounded-xl border p-5 flex flex-col ${
                  p.recommended ? "border-zinc-900 ring-2 ring-zinc-900/10" : "border-zinc-200"
                }`}
              >
                {p.recommended && (
                  <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-900 mb-2">Recommandé</p>
                )}
                <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-medium">{p.label}</p>
                <p className="text-2xl font-semibold mt-1.5 tabular-nums">{p.priceEur.toLocaleString("fr-FR")} €</p>
                <p className="text-zinc-600 text-xs mt-1">{p.description}</p>
                <div className="mt-auto pt-4">
                  <p className="text-zinc-500 text-xs">
                    Acompte à la signature : <span className="tabular-nums font-medium text-zinc-900">{p.deposit.toLocaleString("fr-FR")} €</span>
                  </p>
                  <p className="text-zinc-500 text-xs mt-1">
                    Solde à la livraison
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Closing */}
        <Section>
          <p className="text-zinc-800 leading-relaxed">{content.closing}</p>
        </Section>

        {/* Signature */}
        <div className="mt-12 pt-6 border-t border-zinc-200">
          <p className="font-semibold text-base">Temim Turkusic</p>
          <p className="text-zinc-600 text-sm">CEO · Unlockd.art</p>
          <p className="text-zinc-600 text-xs mt-2">
            +33 6 89 96 71 51 · <a href="mailto:temim@unlockd.art" className="underline">temim@unlockd.art</a> · <a href="https://calendly.com/temim-unlockd/30min" className="underline">calendly.com/temim-unlockd/30min</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="mt-10">
      {title && (
        <h2 className="text-zinc-500 text-[10px] uppercase tracking-[0.25em] font-semibold mb-4">{title}</h2>
      )}
      {children}
    </div>
  );
}
