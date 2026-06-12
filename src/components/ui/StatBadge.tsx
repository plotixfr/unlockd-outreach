import { STATUS_BOJE } from "@/lib/constants";

/**
 * Read-only status chip — `.badge` base (globals.css) + the per-status
 * light-theme color string from STATUS_BOJE. Server-compatible. For the
 * interactive variant (click-to-change) keep using QuickStatusBadge.
 */
export function StatBadge({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  const colors = STATUS_BOJE[status] ?? "bg-zinc-100 text-zinc-700 border border-zinc-200";
  return <span className={`badge ${colors} ${className}`}>{status}</span>;
}
