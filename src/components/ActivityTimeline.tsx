import {
  Plus,
  Globe,
  Award,
  Send,
  CalendarClock,
  MailOpen,
  MessageSquareReply,
  Flame,
  Tag,
  StickyNote,
  Trophy,
  Sparkles,
  FileText,
  RotateCcw,
  Bell,
  Users,
  Activity,
  MessageSquare,
  Repeat,
} from "lucide-react";
import type { ActivityEvent, ActivityKind } from "@/lib/activity";

const ICON_FOR_KIND: Record<ActivityKind, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  prospect_created: Plus,
  prospect_scraped: Globe,
  prospect_scored: Award,
  prospect_decision_makers: Users,
  campaign_scheduled: CalendarClock,
  email_generated: FileText,
  email_sent: Send,
  email_opened: MailOpen,
  calendly_clicked: Flame,
  reply_received: MessageSquareReply,
  reply_classified: Tag,
  deal_stage_changed: Trophy,
  note_added: StickyNote,
  conversion: Trophy,
  reengage_scheduled: RotateCcw,
  mockup_generated: Sparkles,
  proposal_generated: FileText,
  reminder_set: Bell,
  linkedin_sent: MessageSquare,
  upsell_sent: Repeat,
};

const TONE_CLASS: Record<NonNullable<ActivityEvent["tone"]>, { ring: string; icon: string; bar: string }> = {
  info: { ring: "ring-indigo-500/30", icon: "bg-indigo-500/15 text-indigo-400", bar: "bg-indigo-500/40" },
  success: { ring: "ring-emerald-500/30", icon: "bg-emerald-500/15 text-emerald-400", bar: "bg-emerald-500/40" },
  warning: { ring: "ring-amber-500/30", icon: "bg-amber-500/15 text-amber-400", bar: "bg-amber-500/40" },
  danger: { ring: "ring-red-500/30", icon: "bg-red-500/15 text-red-400", bar: "bg-red-500/40" },
  muted: { ring: "ring-zinc-700/30", icon: "bg-zinc-800/50 text-zinc-500", bar: "bg-zinc-700/40" },
};

function fmt(d: Date): string {
  return new Date(d).toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function rel(d: Date, now = new Date()): string {
  const diff = d.getTime() - now.getTime();
  const past = diff < 0;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  if (min < 60) return past ? `prije ${min} min` : `za ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return past ? `prije ${h} h` : `za ${h} h`;
  const day = Math.round(h / 24);
  if (day < 30) return past ? `prije ${day} dan${day === 1 ? "" : "a"}` : `za ${day} dan${day === 1 ? "" : "a"}`;
  const mo = Math.round(day / 30);
  return past ? `prije ${mo} mj` : `za ${mo} mj`;
}

/**
 * Vertical timeline of every event for one prospect — when they were
 * discovered, scraped, scored, what emails were sent, who opened what,
 * replies, classification, deal-stage moves, manual notes, the works.
 *
 * Newest event on top. Each entry shows: icon (kind-coded), title, optional
 * detail, absolute timestamp, relative timestamp.
 */
export function ActivityTimeline({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#1c1c28] p-8 text-center">
        <Activity className="w-5 h-5 text-zinc-600 mx-auto mb-2" />
        <p className="text-zinc-500 text-sm">Još nema aktivnosti za ovog prospekta.</p>
      </div>
    );
  }

  // Newest first for the UI.
  const sorted = [...events].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-6 card-elevation">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Activity strokeWidth={2} className="w-4 h-4 text-zinc-400" />
          <h2 className="text-zinc-200 font-medium text-sm">Aktivnost</h2>
        </div>
        <span className="text-zinc-600 text-xs">{events.length} eventa</span>
      </div>

      <ol className="relative">
        {sorted.map((event, i) => {
          const Icon = ICON_FOR_KIND[event.kind] ?? Activity;
          const tone = TONE_CLASS[event.tone ?? "muted"];
          const isLast = i === sorted.length - 1;
          return (
            <li key={i} className="relative pl-10 pb-5 last:pb-0">
              {/* Vertical rail */}
              {!isLast && (
                <span
                  aria-hidden
                  className={`absolute left-[14px] top-7 w-px h-[calc(100%-1rem)] ${tone.bar}`}
                />
              )}
              {/* Icon dot */}
              <div className={`absolute left-0 top-0.5 w-7 h-7 rounded-full ring-2 ${tone.ring} ${tone.icon} flex items-center justify-center`}>
                <Icon strokeWidth={2} className="w-3.5 h-3.5" />
              </div>
              {/* Content */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-200 text-sm font-medium leading-snug">{event.title}</p>
                  {event.detail && (
                    <p className="text-zinc-500 text-xs mt-1 leading-relaxed line-clamp-2">{event.detail}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-zinc-600 text-[11px] tabular-nums">{fmt(event.at)}</p>
                  <p className="text-zinc-700 text-[10px] tabular-nums">{rel(event.at)}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
