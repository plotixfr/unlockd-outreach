import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NISE, STATUSI, STATUS_BOJE } from "@/lib/constants";

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; nisa?: string; status?: string }>;
}) {
  const { search, nisa, status } = await searchParams;

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { firmaNaziv: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { grad: { contains: search, mode: "insensitive" } },
    ];
  }
  if (nisa) where.nisa = nisa;
  if (status) where.status = status;

  const prospects = await prisma.prospect.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      firmaNaziv: true,
      email: true,
      nisa: true,
      grad: true,
      status: true,
      createdAt: true,
      _count: { select: { emails: true } },
    },
  });

  const makeHref = (key: string, value: string, current: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const next = { ...current, [key]: value };
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
    }
    return `/prospects?${params.toString()}`;
  };

  const currentFilters = { search, nisa, status };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Prospects</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {prospects.length} {prospects.length === 1 ? "prospect" : "prospekata"}
            {(search || nisa || status) && " (filtrirano)"}
          </p>
        </div>
        <Link
          href="/upload"
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          + Dodaj listu
        </Link>
      </div>

      {/* Filteri — niša */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex gap-1 bg-[#111118] border border-[#1f1f2e] rounded-lg p-1 flex-wrap">
          <Link
            href={makeHref("nisa", "", { ...currentFilters, nisa: undefined })}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${!nisa ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white hover:bg-[#1a1a28]"}`}
          >
            Sve niše
          </Link>
          {NISE.map((n) => (
            <Link
              key={n}
              href={makeHref("nisa", n, currentFilters)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${nisa === n ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white hover:bg-[#1a1a28]"}`}
            >
              {n}
            </Link>
          ))}
        </div>

        {/* Filteri — status */}
        <div className="flex gap-1 bg-[#111118] border border-[#1f1f2e] rounded-lg p-1 flex-wrap">
          <Link
            href={makeHref("status", "", { ...currentFilters, status: undefined })}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${!status ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white hover:bg-[#1a1a28]"}`}
          >
            Svi statusi
          </Link>
          {STATUSI.map((s) => (
            <Link
              key={s}
              href={makeHref("status", s, currentFilters)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${status === s ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white hover:bg-[#1a1a28]"}`}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      {/* Search — form GET */}
      <form method="GET" action="/prospects">
        {nisa && <input type="hidden" name="nisa" value={nisa} />}
        {status && <input type="hidden" name="status" value={status} />}
        <input
          type="text"
          name="search"
          defaultValue={search}
          placeholder="Pretraži po nazivu firme, emailu ili gradu..."
          className="w-full bg-[#111118] border border-[#1f1f2e] rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-600 transition-colors"
        />
      </form>

      {/* Tabela */}
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1f1f2e]">
              {["Firma", "Email", "Niša", "Grad", "Status", "Emails", "Kreiran"].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-zinc-500 text-xs uppercase tracking-wider font-medium"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1f1f2e]">
            {prospects.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-zinc-600 text-sm">
                  {search || nisa || status
                    ? "Nema prospekata za ove filtere."
                    : "Nema prospekata. Uploaduj CSV da počneš."}
                </td>
              </tr>
            ) : (
              prospects.map((p) => (
                <tr
                  key={p.id}
                  className="hover:bg-[#1a1a28] transition-colors group"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/prospects/${p.id}`}
                      className="text-white font-medium group-hover:text-blue-400 transition-colors"
                    >
                      {p.firmaNaziv}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{p.email}</td>
                  <td className="px-4 py-3 text-zinc-400">{p.nisa}</td>
                  <td className="px-4 py-3 text-zinc-400">{p.grad}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BOJE[p.status] ?? "bg-zinc-700 text-zinc-200"}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {p._count.emails > 0 ? (
                      <span className="text-blue-400">{p._count.emails}/4</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 text-xs">
                    {new Date(p.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
