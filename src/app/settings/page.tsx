import { prisma } from "@/lib/prisma";
import { ClearDatabaseButton } from "@/components/ClearDatabaseButton";
import { NicheTemplatesEditor } from "@/components/NicheTemplatesEditor";
import { CaseStudiesEditor } from "@/components/CaseStudiesEditor";
import { VoiceProfileEditor } from "@/components/VoiceProfileEditor";

export const dynamic = "force-dynamic";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${ok ? "text-emerald-400" : "text-rose-400"}`}
    >
      <span className={`w-2 h-2 rounded-full ${ok ? "bg-emerald-500 shadow-lg shadow-emerald-500/40" : "bg-rose-500"}`} />
      {ok ? "Connected" : "Missing"}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-[#1c1c28] last:border-0">
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
        <p className="text-zinc-500 text-xs uppercase tracking-[0.18em] font-medium mb-2">Settings</p>
        <h1 className="text-3xl font-semibold text-white tracking-tight">Workspace</h1>
        <p className="text-zinc-500 text-sm mt-1">System status, voice, content, and dangerous things.</p>
      </div>

      {/* API connections */}
      <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation">
        <h2 className="text-white font-medium mb-4">Connections</h2>
        <div className="divide-y divide-[#1c1c28]">
          <Row label="Anthropic API (Claude)"><StatusDot ok={anthropicKey} /></Row>
          <Row label="Resend API (email)"><StatusDot ok={resendKey} /></Row>
          <Row label="Cron secret"><StatusDot ok={cronSecret} /></Row>
          <Row label="IMAP reply detection"><StatusDot ok={imapConfigured} /></Row>
          <Row label="From address">
            <span className="text-zinc-300 text-sm font-mono">{fromEmail}</span>
          </Row>
          <Row label="Daily send cap">
            <span className="text-zinc-300 text-sm font-mono tabular-nums">{dailyCap} / day</span>
          </Row>
        </div>
      </div>

      {/* Voice Profile — anti-AI guardrails */}
      <VoiceProfileEditor />

      {/* Niche templates */}
      <NicheTemplatesEditor />

      {/* Case studies library */}
      <CaseStudiesEditor />

      {/* Cron info */}
      <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation">
        <h2 className="text-white font-medium mb-4">Send schedule</h2>
        <div className="divide-y divide-[#1c1c28]">
          <Row label="Cron expression">
            <span className="text-zinc-300 text-sm font-mono">0 8 * * *</span>
          </Row>
          <Row label="Local time">
            <span className="text-zinc-300 text-sm">10:00 Paris (CET/CEST)</span>
          </Row>
          <Row label="Endpoint">
            <span className="text-zinc-500 text-xs font-mono">/api/cron/send-followups</span>
          </Row>
          <Row label="Queued campaigns">
            <span className={`text-sm font-medium tabular-nums ${scheduledProspects > 0 ? "text-emerald-400" : "text-zinc-500"}`}>
              {scheduledProspects}
            </span>
          </Row>
        </div>
      </div>

      {/* DB stats */}
      <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation">
        <h2 className="text-white font-medium mb-4">Database</h2>
        <div className="divide-y divide-[#1c1c28]">
          <Row label="Total prospects">
            <span className="text-white text-sm font-medium tabular-nums">{totalProspects}</span>
          </Row>
          <Row label="Total emails">
            <span className="text-white text-sm font-medium tabular-nums">{totalEmails}</span>
          </Row>
          <Row label="Sent">
            <span className="text-emerald-400 text-sm font-medium tabular-nums">{sentEmails}</span>
          </Row>
          <Row label="Unsent">
            <span className="text-zinc-400 text-sm font-medium tabular-nums">{totalEmails - sentEmails}</span>
          </Row>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl bg-rose-950/20 border border-rose-900/40 p-6">
        <h2 className="text-rose-300 font-medium mb-1">Danger zone</h2>
        <p className="text-zinc-500 text-sm mb-4">
          Deletion is permanent and cannot be undone.
        </p>
        <ClearDatabaseButton />
      </div>
    </div>
  );
}
