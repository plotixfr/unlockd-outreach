import { prisma } from "@/lib/prisma";
import { ClearDatabaseButton } from "@/components/ClearDatabaseButton";
import { NicheTemplatesEditor } from "@/components/NicheTemplatesEditor";
import { CaseStudiesEditor } from "@/components/CaseStudiesEditor";
import { VoiceProfileEditor } from "@/components/VoiceProfileEditor";
import { Settings as SettingsIcon, Zap, Clock, Database, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider font-bold ${ok ? "text-emerald-300" : "text-rose-300"}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-400 shadow-[0_0_8px_var(--accent-glow)]" : "bg-rose-400"}`} />
      {ok ? "Connected" : "Missing"}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-[var(--border-1)] last:border-0">
      <span className="text-[var(--text-muted)] text-sm">{label}</span>
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
    <div className="max-w-3xl space-y-3">
      <div className="pb-2">
        <div className="flex items-center gap-3 mb-3">
          <span className="pill pill-muted">
            <SettingsIcon className="w-3 h-3" />
            Settings
          </span>
        </div>
        <h1 className="text-white text-4xl sm:text-5xl tracking-tight">Workspace</h1>
        <p className="text-[var(--text-muted)] text-sm mt-3 max-w-2xl">System status, voice, content, and dangerous things.</p>
      </div>

      {/* API connections */}
      <div className="card p-6">
        <p className="section-label mb-4"><Zap className="w-3 h-3" /> Connections</p>
        <div>
          <Row label="Anthropic API (Claude)"><StatusDot ok={anthropicKey} /></Row>
          <Row label="Resend API (email)"><StatusDot ok={resendKey} /></Row>
          <Row label="Cron secret"><StatusDot ok={cronSecret} /></Row>
          <Row label="IMAP reply detection"><StatusDot ok={imapConfigured} /></Row>
          <Row label="From address">
            <span className="text-[var(--text)] text-sm font-mono">{fromEmail}</span>
          </Row>
          <Row label="Daily send cap">
            <span className="text-[var(--text)] text-sm font-mono tabular font-bold">{dailyCap} / day</span>
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
      <div className="card p-6">
        <p className="section-label mb-4"><Clock className="w-3 h-3" /> Send schedule</p>
        <div>
          <Row label="Cron expression">
            <span className="text-[var(--text)] text-sm font-mono">0 8 * * *</span>
          </Row>
          <Row label="Local time">
            <span className="text-[var(--text)] text-sm">10:00 Paris (CET/CEST)</span>
          </Row>
          <Row label="Endpoint">
            <span className="text-[var(--text-dim)] text-xs font-mono">/api/cron/send-followups</span>
          </Row>
          <Row label="Queued campaigns">
            <span className={`text-sm font-bold tabular ${scheduledProspects > 0 ? "text-emerald-300" : "text-[var(--text-dim)]"}`}>
              {scheduledProspects}
            </span>
          </Row>
        </div>
      </div>

      {/* DB stats */}
      <div className="card p-6">
        <p className="section-label mb-4"><Database className="w-3 h-3" /> Database</p>
        <div>
          <Row label="Total prospects">
            <span className="text-white text-sm font-bold tabular">{totalProspects}</span>
          </Row>
          <Row label="Total emails">
            <span className="text-white text-sm font-bold tabular">{totalEmails}</span>
          </Row>
          <Row label="Sent">
            <span className="text-emerald-300 text-sm font-bold tabular">{sentEmails}</span>
          </Row>
          <Row label="Unsent">
            <span className="text-[var(--text-muted)] text-sm font-bold tabular">{totalEmails - sentEmails}</span>
          </Row>
        </div>
      </div>

      {/* Danger zone */}
      <div className="card p-6" style={{ borderColor: "rgba(244, 63, 94, 0.30)", background: "linear-gradient(180deg, rgba(244,63,94,0.05) 0%, transparent 60%), linear-gradient(180deg, var(--bg-elev-2) 0%, var(--bg-elev-1) 100%)" }}>
        <p className="section-label text-rose-300 mb-2"><AlertTriangle className="w-3 h-3" /> Danger zone</p>
        <p className="text-[var(--text-muted)] text-sm mb-4">
          Deletion is permanent and cannot be undone.
        </p>
        <ClearDatabaseButton />
      </div>
    </div>
  );
}
