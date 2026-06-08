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
import { getProspectActivity } from "@/lib/activity";
import type { SiteSnapshot } from "@/lib/scrapeSite";

const TIP_LABELS: Record<string, string> = {
  initial: "Email #1 — Initial",
  follow1: "Email #2 — Follow-up",
  follow2: "Email #3 — Preuve sociale",
  follow3: "Email #4 — Final",
};

const TIP_COLORS: Record<string, string> = {
  initial: "bg-blue-900 text-blue-200",
  follow1: "bg-emerald-900 text-emerald-200",
  follow2: "bg-emerald-900 text-emerald-200",
  follow3: "bg-purple-900 text-purple-200",
};

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-zinc-200 text-sm">{value}</p>
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

  return (
    <div className="max-w-4xl space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/prospects" className="text-zinc-500 hover:text-zinc-300 transition-colors">
          Prospects
        </Link>
        <span className="text-zinc-700">/</span>
        <span className="text-zinc-300">{prospect.firmaNaziv}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{prospect.firmaNaziv}</h1>
          <p className="text-zinc-500 text-sm mt-1">{prospect.email}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <SendNextNowButton prospectId={prospect.id} currentStatus={prospect.status} />
          <StatusSelector prospectId={prospect.id} currentStatus={prospect.status} />
          <LinkedInDmButton prospectId={prospect.id} initialTouchedAt={prospect.linkedinTouchedAt} />
          <ReplyButton prospectId={prospect.id} currentStatus={prospect.status} />
          <ConversionButton prospectId={prospect.id} currentStatus={prospect.status} />
          <Link
            href={`/prospects/${id}/edit`}
            className="text-zinc-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-[#1a1a28] transition-colors"
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

      {/* Info grid */}
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-6 grid grid-cols-2 gap-5 sm:grid-cols-3">
        <InfoRow label="Niche" value={prospect.nisa} />
        <InfoRow label="City" value={prospect.grad} />
        <InfoRow label="Kontakt" value={prospect.kontaktIme} />
        <InfoRow label="Pozicija" value={prospect.kontaktPozicija} />
        <InfoRow label="Website" value={prospect.website} />
        <InfoRow label="Instagram" value={prospect.instagram} />
        <InfoRow
          label="Kvalitet sajta"
          value={prospect.kvalitetSajta ? `${prospect.kvalitetSajta}/5` : null}
        />
        {prospect.opisFirme && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Opis firme</p>
            <p className="text-zinc-200 text-sm leading-relaxed">{prospect.opisFirme}</p>
          </div>
        )}
        {prospect.napomena && (
          <div className="col-span-2 sm:col-span-3">
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Napomena</p>
            <p className="text-zinc-200 text-sm leading-relaxed">{prospect.napomena}</p>
          </div>
        )}
      </div>

      {/* Calendly click signal — hot lead alert */}
      {calendlyClickedEmail?.calendlyClickedAt && prospect.status !== "Converted" && (
        <div className="rounded-xl bg-amber-950/30 border border-amber-700/50 p-4 flex items-center gap-3">
          <span className="text-2xl">🔥</span>
          <div className="flex-1">
            <p className="text-amber-300 font-medium text-sm">Otvorio Calendly link — topao lead</p>
            <p className="text-amber-200/70 text-xs mt-0.5">
              Klik: {new Date(calendlyClickedEmail.calendlyClickedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {" — send a follow-up immediately if they haven't booked yet."}
            </p>
          </div>
        </div>
      )}

      {/* Conversion info */}
      {prospect.conversions[0] && (
        <div className="rounded-xl bg-green-950/30 border border-green-800/40 p-5">
          <p className="text-green-300 font-medium text-sm mb-2">Converted ✓</p>
          <div className="flex flex-wrap gap-5 text-sm">
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Vrijednost projekta</p>
              <p className="text-green-300 font-semibold">
                {prospect.conversions[0].vrijednostProjekta.toLocaleString("fr-FR")} €
              </p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Datum konverzije</p>
              <p className="text-zinc-300">
                {new Date(prospect.conversions[0].datumKonverzije).toLocaleDateString("fr-FR")}
              </p>
            </div>
            {prospect.conversions[0].napomena && (
              <div>
                <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Napomena</p>
                <p className="text-zinc-300">{prospect.conversions[0].napomena}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scouting report — what the AI sees about their website */}
      <div className="space-y-3">
        <h2 className="text-white font-medium">Analiza prospekta</h2>
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
          <h2 className="text-white font-medium">Closing kit</h2>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href={`/prospects/${prospect.id}/brief`}
              target="_blank"
              className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] hover:border-emerald-500/40 p-5 transition-all group card-elevation"
            >
              <p className="text-zinc-200 font-medium text-sm group-hover:text-emerald-300 transition-colors">Pre-meeting brief →</p>
              <p className="text-zinc-500 text-xs mt-1.5">1-stranica za pripremu poziva: PSI, signali, talking points, top 3 konkurenta</p>
            </Link>
            <Link
              href={`/prospects/${prospect.id}/proposal`}
              target="_blank"
              className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] hover:border-emerald-500/40 p-5 transition-all group card-elevation"
            >
              <p className="text-zinc-200 font-medium text-sm group-hover:text-emerald-300 transition-colors">Generate proposal →</p>
              <p className="text-zinc-500 text-xs mt-1.5">4-stranice na francuskom sa 3 cjenovna nivoa + value calculator + Stripe link</p>
            </Link>
          </div>
        </div>
      )}

      {/* Datumi slanja */}
      {(prospect.datumPrvogMaila ||
        prospect.datumFollowUp1 ||
        prospect.datumFollowUp2 ||
        prospect.datumFollowUp3 ||
        prospect.datumOdgovora) && (
        <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5 flex flex-wrap gap-5">
          {prospect.datumPrvogMaila && (
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Poslano</p>
              <p className="text-zinc-300 text-sm">
                {prospect.datumPrvogMaila.toLocaleDateString("fr-FR")}
              </p>
            </div>
          )}
          {prospect.datumFollowUp1 && (
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Follow-up 1</p>
              <p className="text-zinc-300 text-sm">
                {prospect.datumFollowUp1.toLocaleDateString("fr-FR")}
              </p>
            </div>
          )}
          {prospect.datumFollowUp2 && (
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Follow-up 2</p>
              <p className="text-zinc-300 text-sm">
                {prospect.datumFollowUp2.toLocaleDateString("fr-FR")}
              </p>
            </div>
          )}
          {prospect.datumFollowUp3 && (
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Follow-up 3</p>
              <p className="text-zinc-300 text-sm">
                {prospect.datumFollowUp3.toLocaleDateString("fr-FR")}
              </p>
            </div>
          )}
          {prospect.datumOdgovora && (
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Replied</p>
              <p className="text-emerald-400 text-sm">
                {prospect.datumOdgovora.toLocaleDateString("fr-FR")}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Replies (auto-pulled from IMAP) */}
      {prospect.replies.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-white font-medium">
            Odgovori <span className="text-zinc-500 text-sm font-normal">({prospect.replies.length})</span>
          </h2>
          <div className="space-y-3">
            {prospect.replies.map((r) => (
              <div
                key={r.id}
                className="rounded-xl bg-emerald-950/20 border border-emerald-900/40 p-5"
              >
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="text-emerald-300 font-medium">{r.fromAddr}</span>
                  <span className="text-zinc-500">
                    {new Date(r.receivedAt).toLocaleString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {r.subject && (
                  <p className="text-zinc-300 text-sm font-medium mb-2">{r.subject}</p>
                )}
                <pre className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap font-sans">
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

      {/* Deal pipeline editor — only meaningful after they replied */}
      {(prospect.replies.length > 0 || prospect.status === "Replied" || prospect.status === "Converted" || prospect.dealStage) && (
        <DealEditor
          prospectId={prospect.id}
          initialStage={prospect.dealStage}
          initialValue={prospect.dealValue}
        />
      )}

      {/* Activity timeline — every event in one chronological view */}
      <div className="space-y-3">
        <h2 className="text-white font-medium">Aktivnost</h2>
        <ActivityTimeline events={activity} />
      </div>

      {/* Reminder */}
      <ReminderForm
        prospectId={prospect.id}
        initialDatum={prospect.podsjetnikDatum}
        initialNapomena={prospect.podsjetnikNapomena}
      />

      {/* Notes */}
      <NotesSection prospectId={prospect.id} initialNotes={prospect.notes} />

      {/* Campaign Scheduler */}
      <div className="space-y-3">
        <h2 className="text-white font-medium">Raspored kampanje</h2>
        <CampaignScheduler
          prospectId={prospect.id}
          hasEmails={hasEmails}
          isScheduled={isScheduled}
          scheduledDates={scheduledDates}
        />
      </div>

      {/* Email sekcija */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-medium">Kampanja emails</h2>
          <GenerateEmailsButton prospectId={prospect.id} hasEmails={hasEmails} />
        </div>

        {emails.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#1f1f2e] p-10 text-center">
            <p className="text-zinc-500 text-sm">
              No emails generated yet. Klikni &ldquo;Generate emailove&rdquo; da Claude napiše kampanju.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {emails.map((email) => (
              <EmailCard
                key={email.id}
                email={email}
                prospectEmail={prospect.email}
                fromEmail={fromEmail}
              />
            ))}
          </div>
        )}
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
    <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] overflow-hidden">
      <div className="flex items-start justify-between px-5 py-4 border-b border-[#1f1f2e] gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${TIP_COLORS[email.tip] ?? "bg-zinc-700 text-zinc-200"}`}
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
        <div className="flex items-center gap-2 shrink-0">
          {email.poslatAt && (
            <span className="text-zinc-600 text-xs">
              {new Date(email.poslatAt).toLocaleDateString("fr-FR")}
            </span>
          )}
          {email.poslat && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                email.otvoren
                  ? "bg-emerald-950/60 text-emerald-400"
                  : "bg-zinc-800 text-zinc-500"
              }`}
              title={
                email.otvorenAt
                  ? `Otvoreno: ${new Date(email.otvorenAt).toLocaleString("fr-FR")}`
                  : undefined
              }
            >
              {email.otvoren ? "Otvoreno ✓" : "Nije otvoreno"}
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
        className="px-5 py-4 text-sm text-zinc-300 leading-relaxed prose prose-invert prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: email.body }}
      />
      <div className="px-5 py-3 border-t border-[#1f1f2e] bg-[#0c0c12]">
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
