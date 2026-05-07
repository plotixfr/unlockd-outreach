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

const TIP_LABELS: Record<string, string> = {
  initial: "Email #1 — Initial",
  follow1: "Email #2 — Follow-up",
  follow2: "Email #3 — Preuve sociale",
  follow3: "Email #4 — Final",
};

const TIP_COLORS: Record<string, string> = {
  initial: "bg-blue-900 text-blue-200",
  follow1: "bg-indigo-900 text-indigo-200",
  follow2: "bg-violet-900 text-violet-200",
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
    },
  });

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
          <StatusSelector prospectId={prospect.id} currentStatus={prospect.status} />
          <ReplyButton prospectId={prospect.id} currentStatus={prospect.status} />
          <ConversionButton prospectId={prospect.id} currentStatus={prospect.status} />
          <Link
            href={`/prospects/${id}/edit`}
            className="text-zinc-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-[#1a1a28] transition-colors"
          >
            Uredi
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
        <InfoRow label="Niša" value={prospect.nisa} />
        <InfoRow label="Grad" value={prospect.grad} />
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

      {/* Conversion info */}
      {prospect.conversions[0] && (
        <div className="rounded-xl bg-green-950/30 border border-green-800/40 p-5">
          <p className="text-green-300 font-medium text-sm mb-2">Konvertovan ✓</p>
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
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Odgovorio</p>
              <p className="text-emerald-400 text-sm">
                {prospect.datumOdgovora.toLocaleDateString("fr-FR")}
              </p>
            </div>
          )}
        </div>
      )}

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
              Nema generisanih emailova. Klikni &ldquo;Generiši emailove&rdquo; da Claude napiše kampanju.
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
    body: string;
    poslat: boolean;
    poslatAt: Date | null;
    otvoren: boolean;
    otvorenAt: Date | null;
  };
  prospectEmail: string;
  fromEmail: string;
}) {
  return (
    <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f1f2e]">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-medium shrink-0 ${TIP_COLORS[email.tip] ?? "bg-zinc-700 text-zinc-200"}`}
          >
            {TIP_LABELS[email.tip] ?? email.tip}
          </span>
          <p className="text-zinc-300 text-sm font-medium truncate">
            {email.subject}
          </p>
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
            subject={email.subject}
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
    </div>
  );
}
