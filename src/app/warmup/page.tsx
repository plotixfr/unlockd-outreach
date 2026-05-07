import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5">
      <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">{label}</p>
      <p className="text-white text-2xl font-semibold">{value}</p>
      {sub && <p className="text-zinc-600 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function pct(n: number, d: number) {
  if (d === 0) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

export default async function WarmupPage() {
  const fromEmail = process.env.FROM_EMAIL ?? "temim@unlockd.art";
  const domain = fromEmail.split("@")[1] ?? fromEmail;

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getTime() - 30 * 86400000);

  const [
    totalSent,
    totalOpened,
    sentThisWeek,
    sentThisMonth,
    abASent,
    abAOpened,
    abBSent,
    abBOpened,
  ] = await Promise.all([
    prisma.email.count({ where: { poslat: true } }),
    prisma.email.count({ where: { poslat: true, otvoren: true } }),
    prisma.email.count({ where: { poslat: true, poslatAt: { gte: weekStart } } }),
    prisma.email.count({ where: { poslat: true, poslatAt: { gte: monthStart } } }),
    prisma.email.count({ where: { subjectB: { not: null }, poslat: true, activeSubject: "A" } }),
    prisma.email.count({ where: { subjectB: { not: null }, poslat: true, activeSubject: "A", otvoren: true } }),
    prisma.email.count({ where: { subjectB: { not: null }, poslat: true, activeSubject: "B" } }),
    prisma.email.count({ where: { subjectB: { not: null }, poslat: true, activeSubject: "B", otvoren: true } }),
  ]);

  const avgPerDay = sentThisMonth > 0 ? (sentThisMonth / 30).toFixed(1) : "0";

  // Warmup stage based on total sent
  let stage: string;
  let stageColor: string;
  let recommendations: string[];

  if (totalSent < 20) {
    stage = "Početnik";
    stageColor = "text-yellow-400";
    recommendations = [
      "Slati max 5–10 emailova dnevno tokom prvog tjedna",
      "Pratiti spam score domene na mail-tester.com",
      "Koristiti SPF, DKIM i DMARC zapise na domeni",
      "Izbjegavati spam trigger riječi (besplatno, garancija, klikni ovdje)",
    ];
  } else if (totalSent < 100) {
    stage = "Zagrijavanje";
    stageColor = "text-orange-400";
    recommendations = [
      "Možeš povećati na 20–30 emailova dnevno",
      "Open rate ispod 20% je alarm — provjeri subject linije",
      "Dodaj varijante subject-a (A/B) za bolji engagement",
      "Čisti listu od bounce-ova i invalid adresa",
    ];
  } else if (totalSent < 500) {
    stage = "Aktivan";
    stageColor = "text-blue-400";
    recommendations = [
      "Domena je zagrijana — možeš slati 50–100 emailova dnevno",
      "Prati open rate per niche i optimizuj subject linije",
      "Rotacija follow-up timing-a povećava reply rate",
      "Nastavi B/A testiranje za kontinuiranu optimizaciju",
    ];
  } else {
    stage = "Etabliran";
    stageColor = "text-green-400";
    recommendations = [
      "Volumen nije ograničavajući faktor — fokus na kvalitet",
      "Segment bazu po nishi za personalizovanije poruke",
      "Pratiti reply rate po tipu emaila (initial vs follow-up)",
    ];
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Email Warmup</h1>
        <p className="text-zinc-500 text-sm mt-1">Status domene i preporuke za deliverability</p>
      </div>

      {/* Domain info */}
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5 flex items-center justify-between">
        <div>
          <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Domena za slanje</p>
          <p className="text-white font-semibold">{domain}</p>
          <p className="text-zinc-600 text-xs mt-0.5">{fromEmail}</p>
        </div>
        <span className={`text-sm font-semibold px-3 py-1.5 rounded-full bg-[#0a0a0f] border border-[#1f1f2e] ${stageColor}`}>
          {stage}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Ukupno poslano" value={String(totalSent)} />
        <StatCard
          label="Open rate"
          value={pct(totalOpened, totalSent)}
          sub={`${totalOpened} od ${totalSent}`}
        />
        <StatCard label="Ova sedmica" value={String(sentThisWeek)} sub="posjednjih 7 dana" />
        <StatCard
          label="Prosjek / dan"
          value={avgPerDay}
          sub={`${sentThisMonth} u 30 dana`}
        />
      </div>

      {/* Warmup recommendations */}
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5 space-y-3">
        <p className="text-zinc-400 text-sm font-medium">Preporuke</p>
        <ul className="space-y-2">
          {recommendations.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-zinc-400">
              <span className="text-blue-500 mt-0.5 shrink-0">›</span>
              {r}
            </li>
          ))}
        </ul>
      </div>

      {/* A/B subject comparison */}
      {(abASent > 0 || abBSent > 0) && (
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5 space-y-4">
          <p className="text-zinc-400 text-sm font-medium">A/B Subject — Open rate</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 text-xs uppercase tracking-wider">Subject A</span>
                <span className="text-zinc-200 font-semibold text-sm">{pct(abAOpened, abASent)}</span>
              </div>
              <div className="h-2 rounded-full bg-[#1f1f2e]">
                <div
                  className="h-2 rounded-full bg-blue-600"
                  style={{ width: abASent > 0 ? `${(abAOpened / abASent) * 100}%` : "0%" }}
                />
              </div>
              <p className="text-zinc-600 text-xs">{abAOpened} / {abASent} poslano</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 text-xs uppercase tracking-wider">Subject B</span>
                <span className="text-zinc-200 font-semibold text-sm">{pct(abBOpened, abBSent)}</span>
              </div>
              <div className="h-2 rounded-full bg-[#1f1f2e]">
                <div
                  className="h-2 rounded-full bg-violet-600"
                  style={{ width: abBSent > 0 ? `${(abBOpened / abBSent) * 100}%` : "0%" }}
                />
              </div>
              <p className="text-zinc-600 text-xs">{abBOpened} / {abBSent} poslano</p>
            </div>
          </div>
          {abASent > 0 && abBSent > 0 && (
            <p className="text-xs text-zinc-600 pt-1">
              {abAOpened / abASent > abBOpened / abBSent
                ? "Subject A ima bolji open rate."
                : abBOpened / abBSent > abAOpened / abASent
                ? "Subject B ima bolji open rate."
                : "Oba subject-a imaju isti open rate."}
            </p>
          )}
        </div>
      )}

      {abASent === 0 && abBSent === 0 && (
        <div className="rounded-xl border border-dashed border-[#1f1f2e] p-8 text-center">
          <p className="text-zinc-500 text-sm">Nema A/B podataka. Generiši emailove — Claude automatski kreira dva subject-a.</p>
        </div>
      )}
    </div>
  );
}
