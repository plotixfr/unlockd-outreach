import type { ReactNode } from "react";

/**
 * Shared empty state — centered + muted inside a dashed-border card
 * (`.empty-state` in globals.css). Server-compatible: no client hooks.
 *
 * Usage:
 *   <EmptyState
 *     icon={<Users />}
 *     title="No prospects yet"
 *     hint="Autopilot discovers prospects automatically — active briefs fill this list."
 *     action={<Link href="/autopilot" className="btn-secondary">Open Autopilot</Link>}
 *   />
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`empty-state ${className}`}>
      {icon && (
        <div className="text-[var(--text-muted)] mb-1 [&>svg]:w-6 [&>svg]:h-6">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-[var(--text-secondary)]">{title}</p>
      {hint && (
        <p className="text-xs text-[var(--text-muted)] max-w-sm leading-relaxed">
          {hint}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
