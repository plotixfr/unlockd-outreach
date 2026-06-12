import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { GenerateEmailsButton } from "@/components/GenerateEmailsButton";
import { SendEmailButton } from "@/components/SendEmailButton";
import { StatusSelector } from "@/components/StatusSelector";
import { DeleteProspectButton } from "@/components/DeleteProspectButton";
import { CampaignScheduler } from "@/components/CampaignScheduler";
import { ReplyButton } from "@/components/ReplyButton";
import { ConversionButton } from "@/components/ConversionButton";
import { EmailPreviewButton } from "@/components/EmailPreviewButton";
import { SubjectSelector } from "@/components/SubjectSelector";
import { NotesSection } from "@/components/NotesSection";
import { ReminderForm } from "@/components/ReminderForm";
import { EmailEditor } from "@/components/EmailEditor";
import { ScoutingReport } from "@/components/ScoutingReport";
import { ReplyDraftPanel } from "@/components/ReplyDraftPanel";
import { DealEditor } from "@/components/DealEditor";
import { MockupPanel } from "@/components/MockupPanel";
import { AuditDeliverablePanel } from "@/components/AuditDeliverablePanel";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { LinkedInDmButton } from "@/components/LinkedInDmButton";
import { SendNextNowButton } from "@/components/SendNextNowButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatBadge } from "@/components/ui/StatBadge";
import { getProspectActivity } from "@/lib/activity";
import type { SiteSnapshot } from "@/lib/scrapeSite";
import { Mail, AlertTriangle, Flame } from "lucide-react";

const TIP_LABELS: Record<string, string> = {
  initial: "Email #1 — Initial",
  follow1: "Email #2 — Follow-up",
  follow2: "Email #3 — Social proof",
  follow3: "Email #4 — Final",
};

const TIP_COLORS: Record<string, string> = {
  initial: "bg-sky-50 text-sky-700 border border-sky-200",
  follow1: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  follow2: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  follow3: "bg-violet-50 text-violet-700 border border-violet-200",
};

/** Score pill — ≥8 emerald / 6–7 sky / ≤5 zinc (REDESIGN.md G2). */
function scorePillCls(score: number): string {
  if (score >= 8) return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (score >= 6) return "bg-sky-50 text-sky-700 border border-sky-200";
  return "bg-zinc-100 text-zinc-600 border border-zinc-200";
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">{label}</p>
      <p className="text-[var(--text-secondary)] text-sm">{value}</p>
    </div>
  );
}

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const prospect = await prisma.prospect.findUnique({
    where: { id },
    include: {
      emails: { orderBy: { createdAt: "asc" } },
      conversions: { orderBy: { createdAt: "desc" }, take: 1 },
      notes: { orderBy: { createdAt: "desc" } },
      replies: { orderBy: { receivedAt: "desc" } },
    },
  });

  const calendlyClickedEmail = prospect?.emails.find((e) => e.calendlyClicked);
  const activity = prospect ? await getProspectActivity(prospect.id) : [];

  if (!prospect) notFound();

  const { emails } = prospect;
  const hasEmails = emails.length > 0;
  const isScheduled = prospect.status === "Scheduled";
  const fromEmail = process.env.FROM_EMAIL ?? "temim@unlockd.art";

  const scheduledDates =
    prospect.scheduledInitial
      ? {
          initial: prospect.scheduledInitial,
          follow1: prospect.scheduledFollow1,
          follow2: prospect.scheduledFollow2,
          follow3: prospect.scheduledFollow3,
        }
      : undefined;

  const sendDates = [
    { label: "Sent", value: prospect.datumPrvogMaila, accent: false },
    { label: "Follow-up 1", value: prospect.datumFollowUp1, accent: false },
    { label: "Follow-up 2", value: prospect.datumFollowUp2, accent: false },
    { label: "Follow-up 3", value: prospect.datumFollowUp3, accent: false },
    { label: "Replied", value: prospect.datumOdgovora, accent: true },
  ].filter((d) => d.value);

  return (
    <div className="max-w-[1400px] space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/prospects" className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
          Prospects
        </Link>
        <span className="text-[var(--text-muted)]">/</span>
        <span className="text-[var(--text-secondary)] font-medium">{prospect.firmaNaziv}</span>
      </div>

      {/* ─── Header card: identity, status, score, errors, key dates ─── */}
      <div className="card p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-[22px] text-[var(--text)]">{prospect.firmaNaziv}</h1>
              <StatBadge status={prospect.status} />
              {prospect.qualityScore !== null && (
                <span
                  className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-semibold tabular ${scorePillCls(prospect.qualityScore)}`}
                  title={prospect.qualityNote ?? undefined}
                >
                  Score {prospect.qualityScore}/10
                </span>
              )}
            </div>
            <p className="text-[var(--text-secondary)] text-sm mt-1.5">
              {prospect.email} · {prospect.nisa} · {prospect.grad}
            </p>
            {prospect.qualityNote && (
              <p className="text-xs text-[var(--text-muted)] mt-2 max-w-2xl leading-relaxed">
                {prospect.qualityNote}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <SendNextNowButton prospectId={prospect.id} currentStatus={prospect.status} />
            <StatusSelector prospectId={prospect.id} currentStatus={prospect.status} />
            <LinkedInDmButton prospectId={prospect.id} initialTouchedAt={prospect.linkedinTouchedAt} />
            <ReplyButton prospectId={prospect.id} currentStatus={prospect.status} />
            <ConversionButton prospectId={prospect.id} currentStatus={prospect.status} />
            <Link
              href={`/prospects/${id}/edit`}
              className="text-[var(--text-secondary)] hover:text-[var(--text)] text-sm font-medium px-3 py-2 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              Edit
            </Link>
            <DeleteProspectButton
              prospectId={prospect.id}
              firmaNaziv={prospect.firmaNaziv}
              redirectAfter
            />
          </div>
        </div>

        {/* Stored pipeline error — observability must be MORE visible than before */}
        {prospect.lastError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-red-700 font-semibold text-sm">
                Pipeline error
                {prospect.attemptCount > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-red-100 border border-red-200 text-red-700 px-2 py-0.5 text-[10.5px] font-medium align-middle">
                    retry ×{prospect.attemptCount}
                  </span>
                )}
              </p>
              <p className="text-red-700/80 text-xs mt-1 leading-relaxed break-words">{prospect.lastError}</p>
            </div>
          </div>
        )}

        {/* Calendly click signal — hot lead alert */}
        {calendlyClickedEmail?.calendlyClickedAt && prospect.status !== "Converted" && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-center gap-3">
            <Flame className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-amber-700 font-semibold text-sm">Opened the Calendly link — hot lead</p>
              <p className="text-amber-700/80 text-xs mt-0.5">
                Clicked: {new Date(calendlyClickedEmail.calendlyClickedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {" — send a follow-up immediately if they haven't booked yet."}
              </p>
            </div>
          </div>
        )}

        {/* Conversion info */}
        {prospect.conversions[0] && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
            <p className="text-emerald-700 font-semibold text-sm mb-2">Converted ✓</p>
            <div className="flex flex-wrap gap-5 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">Project value</p>
                <p className="text-emerald-700 font-semibold tabular">
                  {prospect.conversions[0].vrijednostProjekta.toLocaleString("fr-FR")} €
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">Conversion date</p>
                <p className="text-[var(--text-secondary)] tabular">
                  {new Date(prospect.conversions[0].datumKonverzije).toLocaleDateString("en-GB")}
                </p>
              </div>
              {prospect.conversions[0].napomena && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">Note</p>
                  <p className="text-[var(--text-secondary)]">{prospect.conversions[0].napomena}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 pt-4 etch-top">
          <InfoRow label="Contact" value={prospect.kontaktIme} />
          <InfoRow label="Role" value={prospect.kontaktPozicija} />
          <InfoRow label="Website" value={prospect.website} />
          <InfoRow label="Instagram" value={prospect.instagram} />
          <InfoRow
            label="Site quality"
            value={prospect.kvalitetSajta ? `${prospect.kvalitetSajta}/5` : null}
          />
          {prospect.opisFirme && (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">Company description</p>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{prospect.opisFirme}</p>
            </div>
          )}
          {prospect.napomena && (
            <div className="col-span-2 sm:col-span-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">Internal note</p>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed">{prospect.napomena}</p>
            </div>
          )}
        </div>

        {/* Send dates */}
        {sendDates.length > 0 && (
          <div className="flex flex-wrap gap-5 pt-4 etch-top">
            {sendDates.map((d) => (
              <div key={d.label}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1">{d.label}</p>
                <p className={`text-sm tabular ${d.accent ? "text-emerald-700 font-semibold" : "text-[var(--text-secondary)]"}`}>
                  {d.value!.toLocaleDateString("en-GB")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── 2-column body: sequence left, enrichment/deal/notes right ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* ── Left: email sequence timeline + replies + scheduler ── */}
        <div className="lg:col-span-2 space-y-8">
          {/* Email sequence */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="section-label"><Mail className="w-3 h-3" /> Email sequence</p>
              <GenerateEmailsButton prospectId={prospect.id} hasEmails={hasEmails} />
            </div>

            {emails.length === 0 ? (
              <EmptyState
                icon={<Mail />}
                title="No emails yet"
                hint="Click 'Generate emails' and Claude writes the full 4-touch sequence in the prospect's language. Autopilot does this automatically for qualified prospects."
              />
            ) : (
              <ol className="relative space-y-4">
                {emails.map((email, i) => (
                  <li key={email.id} className="relative pl-10">
                    {i < emails.length - 1 && (
                      <span
                        aria-hidden
                        className="absolute left-[13px] top-9 -bottom-5 w-px bg-[var(--border)]"
                      />
                    )}
                    <span
                      className={`absolute left-0 top-1.5 w-7 h-7 rounded-full border flex items-center justify-center text-[11px] font-mono font-semibold ${
                        email.poslat
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : "bg-zinc-50 border-[var(--border)] text-[var(--text-muted)]"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <EmailCard
                      email={email}
                      prospectEmail={prospect.email}
                      fromEmail={fromEmail}
                    />
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Replies (auto-pulled from IMAP) */}
          {prospect.replies.length > 0 && (
            <div className="space-y-3">
              <p className="section-label">
                Replies <span className="font-mono normal-case tracking-normal">({prospect.replies.length})</span>
              </p>
              <div className="space-y-3">
                {prospect.replies.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-5"
                  >
                    <div className="flex items-center justify-between text-xs mb-3">
                      <span className="text-emerald-700 font-semibold">{r.fromAddr}</span>
                      <span className="text-[var(--text-muted)] tabular">
                        {new Date(r.receivedAt).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {r.subject && (
                      <p className="text-[var(--text)] text-sm font-semibold mb-2">{r.subject}</p>
                    )}
                    <pre className="text-[var(--text-secondary)] text-sm leading-relaxed whitespace-pre-wrap font-sans">
                      {r.body || "(empty body)"}
                    </pre>
                    {r.draft && (
                      <ReplyDraftPanel
                        replyId={r.id}
                        prospectId={prospect.id}
                        initialDraft={r.draft}
                        classification={r.classification}
                        prospectEmail={prospect.email}
                      />
                    )}
                    {!r.draft && r.classification && (
                      <div className="mt-2">
                        <ReplyDraftPanel
                          replyId={r.id}
                          prospectId={prospect.id}
                          initialDraft=""
                          classification={r.classification}
                          prospectEmail={prospect.email}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Campaign scheduler */}
          <div className="space-y-3">
            <p className="section-label">Campaign schedule</p>
            <CampaignScheduler
              prospectId={prospect.id}
              hasEmails={hasEmails}
              isScheduled={isScheduled}
              scheduledDates={scheduledDates}
            />
          </div>
        </div>

        {/* ── Right: enrichment, closing kit, deal, notes, reminders, activity ── */}
        <div className="space-y-6">
          {/* Scouting report — what the AI sees about their website */}
          <div className="space-y-3">
            <p className="section-label">Enrichment</p>
            <ScoutingReport
              prospectId={prospect.id}
              hasWebsite={!!prospect.website}
              snapshot={(prospect.siteSnapshot as unknown as SiteSnapshot | null) ?? null}
              snapshotAt={prospect.siteSnapshotAt}
            />
          </div>

          {/* Closing kit: mockup + brief + proposal */}
          {prospect.website && (
            <div className="space-y-3">
              <p className="section-label">Closing kit</p>
              <AuditDeliverablePanel
                prospectId={prospect.id}
                mockupUrl={prospect.mockupUrl}
                mockupAt={prospect.mockupAt}
                hasAudit={!!prospect.auditFindings}
              />
              <MockupPanel
                prospectId={prospect.id}
                firmaNaziv={prospect.firmaNaziv}
                niche={prospect.nisa}
                city={prospect.grad}
                website={prospect.website}
                snapshot={(prospect.siteSnapshot as unknown as SiteSnapshot | null) ?? null}
              />
              <div className="grid grid-cols-1 gap-3">
                <Link
                  href={`/prospects/${prospect.id}/brief`}
                  target="_blank"
                  className="card card-interactive p-5 group"
                >
                  <p className="text-[var(--text)] font-semibold text-sm group-hover:text-[var(--accent)] transition-colors">Pre-meeting brief →</p>
                  <p className="text-[var(--text-muted)] text-xs mt-1.5">One-page call prep: PSI, signals, talking points, top 3 competitors</p>
                </Link>
                <Link
                  href={`/prospects/${prospect.id}/proposal`}
                  target="_blank"
                  className="card card-interactive p-5 group"
                >
                  <p className="text-[var(--text)] font-semibold text-sm group-hover:text-[var(--accent)] transition-colors">Generate proposal →</p>
                  <p className="text-[var(--text-muted)] text-xs mt-1.5">4 pages in French with 3 pricing tiers + value calculator + Stripe link</p>
                </Link>
              </div>
            </div>
          )}

          {/* Deal pipeline editor — only meaningful after they replied */}
          {(prospect.replies.length > 0 || prospect.status === "Replied" || prospect.status === "Converted" || prospect.dealStage) && (
            <DealEditor
              prospectId={prospect.id}
              initialStage={prospect.dealStage}
              initialValue={prospect.dealValue}
            />
          )}

          {/* Notes */}
          <NotesSection prospectId={prospect.id} initialNotes={prospect.notes} />

          {/* Reminder */}
          <ReminderForm
            prospectId={prospect.id}
            initialDatum={prospect.podsjetnikDatum}
            initialNapomena={prospect.podsjetnikNapomena}
          />

          {/* Activity timeline — every event in one chronological view */}
          <ActivityTimeline events={activity} />
        </div>
      </div>
    </div>
  );
}

function EmailCard({
  email,
  prospectEmail,
  fromEmail,
}: {
  email: {
    id: string;
    tip: string;
    subject: string;
    subjectB: string | null;
    activeSubject: string;
    body: string;
    poslat: boolean;
    poslatAt: Date | null;
    otvoren: boolean;
    otvorenAt: Date | null;
  };
  prospectEmail: string;
  fromEmail: string;
}) {
  const activeSubjectText =
    email.activeSubject === "B" && email.subjectB ? email.subjectB : email.subject;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border)] gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`badge shrink-0 mt-0.5 ${TIP_COLORS[email.tip] ?? "bg-zinc-100 text-zinc-600 border border-zinc-200"}`}
          >
            {TIP_LABELS[email.tip] ?? email.tip}
          </span>
          <SubjectSelector
            emailId={email.id}
            subject={email.subject}
            subjectB={email.subjectB}
            activeSubject={email.activeSubject}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {email.poslatAt && (
            <span className="text-[var(--text-muted)] text-xs tabular">
              {new Date(email.poslatAt).toLocaleDateString("en-GB")}
            </span>
          )}
          {email.poslat && (
            <span
              className={`badge ${
                email.otvoren
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-zinc-100 text-zinc-500 border border-zinc-200"
              }`}
              title={
                email.otvorenAt
                  ? `Opened: ${new Date(email.otvorenAt).toLocaleString("en-GB")}`
                  : undefined
              }
            >
              {email.otvoren ? "Opened ✓" : "Not opened"}
            </span>
          )}
          <EmailPreviewButton
            subject={activeSubjectText}
            body={email.body}
            tip={email.tip}
            prospectEmail={prospectEmail}
            fromEmail={fromEmail}
          />
          <SendEmailButton emailId={email.id} poslat={email.poslat} />
        </div>
      </div>
      <div
        className="px-5 py-4 text-sm text-[var(--text-secondary)] leading-relaxed prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: email.body }}
      />
      <div className="px-5 py-3 border-t border-[var(--border)] bg-zinc-50">
        <EmailEditor
          emailId={email.id}
          initialSubject={email.subject}
          initialSubjectB={email.subjectB}
          initialBody={email.body}
          poslat={email.poslat}
        />
      </div>
    </div>
  );
}
