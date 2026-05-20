import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProspectEditForm } from "@/components/ProspectEditForm";

export default async function EditProspectPage({
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
      kontaktPozicija: true,
      website: true,
      instagram: true,
      nisa: true,
      grad: true,
      opisFirme: true,
      kvalitetSajta: true,
      napomena: true,
    },
  });

  if (!prospect) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/prospects" className="text-zinc-500 hover:text-zinc-300 transition-colors">
          Prospects
        </Link>
        <span className="text-zinc-700">/</span>
        <Link
          href={`/prospects/${id}`}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {prospect.firmaNaziv}
        </Link>
        <span className="text-zinc-700">/</span>
        <span className="text-zinc-300">Edit</span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-white">Edit prospekta</h1>
        <p className="text-zinc-500 text-sm mt-1">{prospect.firmaNaziv}</p>
      </div>

      <ProspectEditForm prospect={prospect} />
    </div>
  );
}
