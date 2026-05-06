import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { STATUSI, STATUS_BOJE } from "@/lib/constants";

function startOfTodayParis(): Date {
  // Paris is UTC+1 (CET) or UTC+2 (CEST). Use UTC midnight as approximation.
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export default async function DashboardPage() {
  const todayStart = startOfTodayParis();

  const [total, odgovorili, konvertovani, danasEmailova, zadnjeAktivnosti, ...pipelineCounts] =
    await Promise.all([
      prisma.prospect.count(),
      prisma.prospect.count({ where: { status: "Replied" } }),
      prisma.prospect.count({ where: { status: "Converted" } }),
      prisma.email.count({
        where: { poslat: true, poslatAt: { gte: todayStart } },
      }),
      prisma.email.findMany({
        where: { poslat: true },
        orderBy: { poslatAt: "desc" },
        take: 10,
        include: {
          prospect: { select: { id: true, firmaNaziv: true, email: true } },
        },
      }),
      ...STATUSI.map((s) => prisma.prospect.count({ where: { status: s } })),
    ]);

  const pipeline = STATUSI.map((s, i) => ({
    status: s,
    count: pipelineCounts[i] ?? 0,
  }));

  const maxCount = Math.max(...pipeline.map((p) => p.count), 1);

  const TIP_LABELS: Record<string, string> = {
    initial: "Email initial",
    follow1: "Follow-up 1",
    follow2: "Follow-up 2",
    follow3: "Follow-up 3",
  };

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1">Pregled outreach aktivnosti</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Ukupno prospekata", value: total },
          { label: "Danas poslano", value: danasEmailova },
          { label: "Odgovorili", value: odgovorili },
          { label: "Konvertovani", value: konvertovani },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">{label}</p>
            <p className="text-3xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pipeline chart */}
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6">
          <h2 className="text-white font-medium mb-4">Pipeline</h2>
          {total === 0 ? (
            <p className="text-zinc-600 text-sm">Nema prospekata u bazi.</p>
          ) : (
            <div className="space-y-2.5">
              {pipeline.map(({ status, count }) => (
                <div key={status} className="flex items-center gap-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium w-28 text-center shrink-0 ${STATUS_BOJE[status]}`}
                  >
                    {status}
                  </span>
                  <div className="flex-1 bg-[#1a1a28] rounded-full h-1.5">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-zinc-400 text-sm w-6 text-right shrink-0">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Zadnje aktivnosti */}
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6">
          <h2 className="text-white font-medium mb-4">Zadnje aktivnosti</h2>
          {zadnjeAktivnosti.length === 0 ? (
            <p className="text-zinc-600 text-sm">Još nema poslanih emailova.</p>
          ) : (
            <div className="space-y-3">
              {zadnjeAktivnosti.map((e) => (
                <div key={e.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/prospects/${e.prospect.id}`}
                      className="text-zinc-200 text-sm font-medium hover:text-blue-400 transition-colors truncate block"
                    >
                      {e.prospect.firmaNaziv}
                    </Link>
                    <p className="text-zinc-600 text-xs mt-0.5">
                      {TIP_LABELS[e.tip] ?? e.tip}
                    </p>
                  </div>
                  <span className="text-zinc-600 text-xs shrink-0 mt-0.5">
                    {e.poslatAt
                      ? new Date(e.poslatAt).toLocaleDateString("fr-FR", {
                          day: "2-digit",
                          month: "short",
                        })
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {total === 0 && (
        <div className="rounded-xl border border-dashed border-[#1f1f2e] p-10 text-center">
          <p className="text-zinc-500 text-sm">
            Počni uploadovanjem CSV liste prospekata.
          </p>
          <Link
            href="/upload"
            className="mt-3 inline-block text-blue-500 text-sm hover:text-blue-400 transition-colors"
          >
            Upload CSV →
          </Link>
        </div>
      )}
    </div>
  );
}
