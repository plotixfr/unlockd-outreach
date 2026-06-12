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
  info: { ring: "ring-emerald-200", icon: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-200" },
  success: { ring: "ring-emerald-200", icon: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-200" },
  warning: { ring: "ring-amber-200", icon: "bg-amber-50 text-amber-600", bar: "bg-amber-200" },
  danger: { ring: "ring-red-200", icon: "bg-red-50 text-red-600", bar: "bg-red-200" },
  muted: { ring: "ring-zinc-200", icon: "bg-zinc-100 text-zinc-500", bar: "bg-zinc-200" },
};

function fmt(d: Date): string {
  return new Date(d).toLocaleString("en-GB", {
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
  if (min < 60) return past ? `${min} min ago` : `in ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return past ? `${h} h ago` : `in ${h} h`;
  const day = Math.round(h / 24);
  if (day < 30) return past ? `${day} day${day === 1 ? "" : "s"} ago` : `in ${day} day${day === 1 ? "" : "s"}`;
  const mo = Math.round(day / 30);
  return past ? `${mo} mo ago` : `in ${mo} mo`;
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
      <div className="empty-state py-8">
        <Activity className="w-5 h-5 text-[var(--text-muted)]" />
        <p className="text-sm font-semibold text-[var(--text-secondary)]">No activity for this prospect yet.</p>
      </div>
    );
  }

  // Newest first for the UI.
  const sorted = [...events].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Activity strokeWidth={2} className="w-4 h-4 text-[var(--text-muted)]" />
          <h2 className="text-[var(--text)] font-semibold text-sm">Activity</h2>
        </div>
        <span className="text-[var(--text-muted)] text-xs tabular">{events.length} events</span>
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
                  <p className="text-[var(--text)] text-sm font-medium leading-snug">{event.title}</p>
                  {event.detail && (
                    <p className="text-[var(--text-muted)] text-xs mt-1 leading-relaxed line-clamp-2">{event.detail}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[var(--text-muted)] text-[11px] tabular-nums">{fmt(event.at)}</p>
                  <p className="text-[var(--text-muted)] text-[10px] tabular-nums opacity-70">{rel(event.at)}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
