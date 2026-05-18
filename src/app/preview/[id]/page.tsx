import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PremiumPreview } from "@/components/PremiumPreview";
import type { SiteSnapshot } from "@/lib/scrapeSite";

export const dynamic = "force-dynamic";

/**
 * Public preview link. No auth — anyone with the URL can open it. Used as a
 * teaser sent to the prospect before/after the sales call: "voici la direction
 * créative que je vous proposerai". The preview itself is server-rendered
 * with the prospect's actual content, so opening the link shows them their
 * brand's name and copy in a premium template.
 *
 * Tradeoff: anyone with the prospect id can view the preview, but the id is
 * a cuid (long random) so it's effectively unguessable. No sensitive data is
 * shown — just the public-facing content of their site reimagined.
 */
export default async function PublicPreviewPage({
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
      nisa: true,
      grad: true,
      website: true,
      siteSnapshot: true,
    },
  });
  if (!prospect) notFound();

  return (
    <div className="min-h-screen bg-[#07070b] py-10 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-zinc-500 text-[10px] uppercase tracking-[0.25em] font-medium mb-2">
            Direction créative · Unlockd Studio
          </p>
          <h1
            className="text-2xl font-semibold text-white tracking-tight"
            style={{ fontFamily: "var(--font-display-serif)" }}
          >
            Aperçu — {prospect.firmaNaziv}
          </h1>
        </div>

        <PremiumPreview
          prospectId={prospect.id}
          firmaNaziv={prospect.firmaNaziv}
          niche={prospect.nisa}
          city={prospect.grad}
          snapshot={(prospect.siteSnapshot as unknown as SiteSnapshot | null) ?? null}
        />

        {/* Sender block — keeps the brand attached when the link is forwarded */}
        <div className="mt-10 pt-8 border-t border-[#1c1c28] flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-zinc-300 text-sm font-medium">Temim Turkusic</p>
            <p className="text-zinc-600 text-xs mt-0.5">CEO · Unlockd.art · Paris</p>
          </div>
          <a
            href="https://calendly.com/temim-unlockd/30min"
            className="inline-flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            Réserver 30 minutes →
          </a>
        </div>

        <p className="text-zinc-700 text-[10px] text-center mt-10 tracking-widest uppercase">
          Cette page est une direction créative — pas un site final.
        </p>
      </div>
    </div>
  );
}
