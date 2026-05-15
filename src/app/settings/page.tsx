import { prisma } from "@/lib/prisma";
import { ClearDatabaseButton } from "@/components/ClearDatabaseButton";
import { NicheTemplatesEditor } from "@/components/NicheTemplatesEditor";

export const dynamic = "force-dynamic";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${ok ? "text-emerald-400" : "text-red-400"}`}
    >
      <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
      {ok ? "Konfigurisan" : "Nije konfigurisan"}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-[#1f1f2e] last:border-0">
      <span className="text-zinc-400 text-sm">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

export default async function SettingsPage() {
  const anthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const resendKey = !!process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || "temim@unlockd.art";
  const cronSecret = !!process.env.CRON_SECRET;
  const imapConfigured = !!(process.env.IMAP_USER && process.env.IMAP_PASSWORD);
  const dailyCap = Number(process.env.DAILY_SEND_CAP ?? 30);

  const [totalProspects, totalEmails, sentEmails, scheduledProspects] = await Promise.all([
    prisma.prospect.count(),
    prisma.email.count(),
    prisma.email.count({ where: { poslat: true } }),
    prisma.prospect.count({ where: { status: "Scheduled" } }),
  ]);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">Status sistema i konfiguracija</p>
      </div>

      {/* API connections */}
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6">
        <h2 className="text-white font-medium mb-4">API konekcije</h2>
        <div className="divide-y divide-[#1f1f2e]">
          <Row label="Anthropic API (Claude)">
            <StatusDot ok={anthropicKey} />
          </Row>
          <Row label="Resend API (email slanje)">
            <StatusDot ok={resendKey} />
          </Row>
          <Row label="Cron secret">
            <StatusDot ok={cronSecret} />
          </Row>
          <Row label="IMAP reply detection">
            <StatusDot ok={imapConfigured} />
          </Row>
          <Row label="From email">
            <span className="text-zinc-300 text-sm font-mono">{fromEmail}</span>
          </Row>
          <Row label="Daily send cap">
            <span className="text-zinc-300 text-sm font-mono">{dailyCap} /dan</span>
          </Row>
        </div>
      </div>

      {/* Niche templates */}
      <NicheTemplatesEditor />

      {/* Cron info */}
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6">
        <h2 className="text-white font-medium mb-4">Cron job</h2>
        <div className="divide-y divide-[#1f1f2e]">
          <Row label="Raspored">
            <span className="text-zinc-300 text-sm font-mono">0 8 * * *</span>
          </Row>
          <Row label="Lokalno vreme">
            <span className="text-zinc-300 text-sm">09:00 Paris (CET/CEST)</span>
          </Row>
          <Row label="Endpoint">
            <span className="text-zinc-500 text-xs font-mono">/api/cron/send-followups</span>
          </Row>
          <Row label="Zakazane kampanje">
            <span className={`text-sm font-medium ${scheduledProspects > 0 ? "text-sky-400" : "text-zinc-500"}`}>
              {scheduledProspects}
            </span>
          </Row>
        </div>
      </div>

      {/* DB stats */}
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6">
        <h2 className="text-white font-medium mb-4">Baza podataka</h2>
        <div className="divide-y divide-[#1f1f2e]">
          <Row label="Ukupno prospekata">
            <span className="text-white text-sm font-medium">{totalProspects}</span>
          </Row>
          <Row label="Ukupno emailova u bazi">
            <span className="text-white text-sm font-medium">{totalEmails}</span>
          </Row>
          <Row label="Poslato emailova">
            <span className="text-emerald-400 text-sm font-medium">{sentEmails}</span>
          </Row>
          <Row label="Neposlato emailova">
            <span className="text-zinc-400 text-sm font-medium">{totalEmails - sentEmails}</span>
          </Row>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl bg-red-950/20 border border-red-800/30 p-6">
        <h2 className="text-red-400 font-medium mb-1">Opasna zona</h2>
        <p className="text-zinc-500 text-sm mb-4">
          Brisanje je trajno i ne može se poništiti.
        </p>
        <ClearDatabaseButton />
      </div>
    </div>
  );
}
