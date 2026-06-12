import { prisma } from "@/lib/prisma";
import { ClearDatabaseButton } from "@/components/ClearDatabaseButton";
import { NicheTemplatesEditor } from "@/components/NicheTemplatesEditor";
import { CaseStudiesEditor } from "@/components/CaseStudiesEditor";
import { VoiceProfileEditor } from "@/components/VoiceProfileEditor";
import { Zap, Clock, Database, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold ${ok ? "text-emerald-700" : "text-red-600"}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
      {ok ? "Connected" : "Missing"}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-[var(--border)] last:border-0">
      <span className="text-[var(--text-secondary)] text-sm">{label}</span>
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
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Settings</h1>
        <p className="text-[var(--text-secondary)] text-sm mt-1">
          System status, voice, content, and the danger zone.
        </p>
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
            <span className="text-[var(--text)] text-sm font-mono tabular font-semibold">{dailyCap} / day</span>
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
            <span className="text-[var(--text-muted)] text-xs font-mono">/api/cron/send-followups</span>
          </Row>
          <Row label="Queued campaigns">
            <span className={`text-sm font-semibold tabular ${scheduledProspects > 0 ? "text-emerald-700" : "text-[var(--text-muted)]"}`}>
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
            <span className="text-[var(--text)] text-sm font-semibold tabular">{totalProspects}</span>
          </Row>
          <Row label="Total emails">
            <span className="text-[var(--text)] text-sm font-semibold tabular">{totalEmails}</span>
          </Row>
          <Row label="Sent">
            <span className="text-emerald-700 text-sm font-semibold tabular">{sentEmails}</span>
          </Row>
          <Row label="Unsent">
            <span className="text-[var(--text-secondary)] text-sm font-semibold tabular">{totalEmails - sentEmails}</span>
          </Row>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="section-label !text-red-600 mb-2"><AlertTriangle className="w-3 h-3" /> Danger zone</p>
        <p className="text-red-900/70 text-sm mb-4">
          Deletion is permanent and cannot be undone.
        </p>
        <ClearDatabaseButton />
      </div>
    </div>
  );
}
