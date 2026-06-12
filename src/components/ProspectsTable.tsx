"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuickStatusBadge } from "@/components/QuickStatusBadge";

interface Prospect {
  id: string;
  firmaNaziv: string;
  email: string;
  nisa: string;
  grad: string;
  status: string;
  qualityScore: number | null;
  qualityNote: string | null;
  lastError: string | null;
  attemptCount: number;
  createdAt: Date;
  _count: { emails: number };
  replies?: Array<{ body: string; classification: string | null; receivedAt: Date }>;
}

interface MenuPos {
  id: string;
  top: number;
  right: number;
}

interface Props {
  prospects: Prospect[];
}

function defaultInitial(): string {
  // "Now" — bulk schedule will auto-send for any prospect whose initial is due.
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Score pill — ≥8 emerald / 6–7 sky / ≤5 zinc. */
function scorePillCls(score: number): string {
  if (score >= 8) return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (score >= 6) return "bg-sky-50 text-sky-700 border border-sky-200";
  return "bg-zinc-100 text-zinc-600 border border-zinc-200";
}

const CLASSIFICATION_CLS: Record<string, string> = {
  Interested: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Question: "bg-sky-50 text-sky-700 border border-sky-200",
  NotNow: "bg-amber-50 text-amber-700 border border-amber-200",
  Negative: "bg-red-50 text-red-700 border border-red-200",
  Unsubscribe: "bg-red-50 text-red-700 border border-red-200",
};

const inputCls =
  "w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors";

const labelCls =
  "block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1.5";

export function ProspectsTable({ prospects }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState("");
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduledInitial, setScheduledInitial] = useState(defaultInitial());
  const [follow1Days, setFollow1Days] = useState(4);
  const [follow2Days, setFollow2Days] = useState(5);
  const [follow3Days, setFollow3Days] = useState(7);

  // Close portal menu on outside click
  useEffect(() => {
    if (!menuPos) return;
    const handler = () => setMenuPos(null);
    const timer = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handler);
    };
  }, [menuPos]);

  const handleMenuToggle = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    e.stopPropagation();
    if (menuPos?.id === id) { setMenuPos(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const dropdownH = 88;
    const top =
      window.innerHeight - rect.bottom > dropdownH
        ? rect.bottom + 4
        : rect.top - dropdownH - 4;
    setMenuPos({ id, top, right: window.innerWidth - rect.right });
  };

  const allSelected = prospects.length > 0 && selected.size === prospects.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(prospects.map((p) => p.id)));
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedIds = Array.from(selected);

  const bulkAction = async (action: string, extra?: Record<string, unknown>): Promise<{ error?: string; sentNow?: number; scheduled?: number; generated?: number; deleted?: number; alreadyHad?: number; failed?: string[] }> => {
    setBulkLoading(action);
    setBulkError("");
    try {
      const res = await fetch("/api/prospects/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: selectedIds, ...extra }),
      });
      let data: { error?: string; sentNow?: number; scheduled?: number; generated?: number; deleted?: number } = {};
      try { data = await res.json(); } catch { throw new Error("Invalid server response"); }
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      if (action === "delete") setSelected(new Set());
      router.refresh();
      return data;
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Something went wrong");
      return {};
    } finally {
      setBulkLoading(null);
    }
  };

  const handleBulkSchedule = async () => {
    // datetime-local → absolute ISO so the server doesn't reinterpret the
    // user's local time as UTC (which would push it hours into the future
    // and skip the auto-send window).
    const scheduledInitialIso = new Date(scheduledInitial).toISOString();
    const result = await bulkAction("schedule", {
      scheduleData: { scheduledInitial: scheduledInitialIso, follow1Days, follow2Days, follow3Days },
    });
    setShowScheduleModal(false);
    if (result.sentNow && result.sentNow > 0) {
      setBulkError(""); // Clear any prior error.
      console.log(`[bulk schedule] ${result.sentNow} initial emails sent immediately`);
    }
  };

  const handleReply = async (id: string) => {
    setReplyingId(id);
    try {
      const res = await fetch(`/api/prospects/${id}/reply`, { method: "POST" });
      if (!res.ok) throw new Error("Something went wrong");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setReplyingId(null);
    }
  };

  const handleSingleDelete = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      const res = await fetch(`/api/prospects/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Delete failed");
      }
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-4 z-10 flex items-center gap-3 card border-[var(--accent-border)] px-4 py-3 shadow-md flex-wrap">
          <span className="text-emerald-700 text-sm font-semibold">
            {selected.size} selected
          </span>
          <div className="flex-1" />
          {bulkError && <p className="text-red-600 text-xs">{bulkError}</p>}
          <button
            onClick={() => bulkAction("generate")}
            disabled={!!bulkLoading}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {bulkLoading === "generate" && (
              <span className="inline-block w-3 h-3 border-2 border-emerald-700/30 border-t-emerald-700 rounded-full animate-spin" />
            )}
            Generate emails
          </button>
          <button
            onClick={() => bulkAction("mockup")}
            disabled={!!bulkLoading}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200 hover:bg-fuchsia-100 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            title="Generate AI mockup hero (Replicate Flux Schnell, ~$0.003 each). Links into Follow2 as visual proof."
          >
            {bulkLoading === "mockup" && (
              <span className="inline-block w-3 h-3 border-2 border-fuchsia-700/30 border-t-fuchsia-700 rounded-full animate-spin" />
            )}
            Mockups
          </button>
          <button
            onClick={() => setShowScheduleModal(true)}
            disabled={!!bulkLoading}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors disabled:opacity-50"
          >
            Schedule campaign
          </button>
          <button
            onClick={() => bulkAction("delete")}
            disabled={!!bulkLoading}
            className="text-sm font-medium px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {bulkLoading === "delete" && (
              <span className="inline-block w-3 h-3 border-2 border-red-700/30 border-t-red-700 rounded-full animate-spin" />
            )}
            Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-xs transition-colors ml-1"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-[var(--border-strong)] accent-emerald-600 cursor-pointer"
                  />
                </th>
                {["Company", "Email", "Niche", "City", "Score", "Status", "Emails", "Added", ""].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {prospects.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center text-[var(--text-muted)] text-sm py-12">
                    No prospects match these filters.
                  </td>
                </tr>
              ) : (
                prospects.map((p) => (
                  <tr
                    key={p.id}
                    className={`group ${selected.has(p.id) ? "bg-[var(--accent-soft)]" : ""}`}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                        className="rounded border-[var(--border-strong)] accent-emerald-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5">
                      <Link
                        href={`/prospects/${p.id}`}
                        className="text-[var(--text)] font-semibold group-hover:text-[var(--accent)] transition-colors"
                      >
                        {p.firmaNaziv}
                      </Link>
                      {(p.lastError || p.qualityNote) && (
                        <p
                          title={p.lastError ?? p.qualityNote ?? undefined}
                          className={`text-[11px] mt-0.5 truncate max-w-[340px] leading-snug ${
                            p.lastError ? "text-red-600" : "text-[var(--text-muted)]"
                          }`}
                        >
                          {p.lastError ?? p.qualityNote}
                        </p>
                      )}
                      {p.replies && p.replies[0] && (
                        <div className="mt-1.5 flex items-start gap-2">
                          {p.replies[0].classification && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                                CLASSIFICATION_CLS[p.replies[0].classification] ??
                                "bg-zinc-100 text-zinc-600 border border-zinc-200"
                              }`}
                            >
                              {p.replies[0].classification}
                            </span>
                          )}
                          <p className="text-[var(--text-muted)] text-xs leading-snug line-clamp-2 max-w-md">
                            {p.replies[0].body.slice(0, 140).replace(/\s+/g, " ").trim()}
                            {p.replies[0].body.length > 140 ? "…" : ""}
                          </p>
                        </div>
                      )}
                    </td>
                    <td>{p.email}</td>
                    <td>{p.nisa}</td>
                    <td>{p.grad}</td>
                    <td>
                      {p.qualityScore !== null ? (
                        <span
                          className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-semibold tabular ${scorePillCls(p.qualityScore)}`}
                        >
                          {p.qualityScore}/10
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)] text-xs">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 flex-wrap py-1">
                        <QuickStatusBadge prospectId={p.id} status={p.status} />
                        {p.attemptCount > 0 && (
                          <span
                            title={`${p.attemptCount} pipeline retry attempt${p.attemptCount === 1 ? "" : "s"}`}
                            className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 text-[10px] font-medium"
                          >
                            retry ×{p.attemptCount}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {p._count.emails > 0 ? (
                        <span className="text-emerald-700 font-semibold tabular">{p._count.emails}/4</span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="text-xs text-[var(--text-muted)] tabular">
                      {new Date(p.createdAt).toLocaleDateString("en-GB")}
                    </td>
                    <td>
                      <button
                        onClick={(e) => handleMenuToggle(e, p.id)}
                        className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors p-1 rounded"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Portal dropdown — rendered outside overflow container.
          menuPos is null on SSR so document.body is never accessed server-side. */}
      {menuPos &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: menuPos.top,
              right: menuPos.right,
              zIndex: 9999,
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-40 bg-white border border-[var(--border)] rounded-lg shadow-lg overflow-hidden"
          >
            <Link
              href={`/prospects/${menuPos.id}/edit`}
              onClick={() => setMenuPos(null)}
              className="flex items-center px-3 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-zinc-50 hover:text-[var(--text)] transition-colors"
            >
              Edit
            </Link>
            <button
              onClick={() => {
                const id = menuPos.id;
                setMenuPos(null);
                handleReply(id);
              }}
              disabled={replyingId === menuPos.id}
              className="w-full flex items-center px-3 py-2.5 text-sm text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
            >
              Mark as replied
            </button>
            <button
              onClick={() => {
                const p = prospects.find((x) => x.id === menuPos.id);
                if (p) setDeleteTarget({ id: p.id, name: p.firmaNaziv });
                setMenuPos(null);
              }}
              className="w-full flex items-center px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          </div>,
          document.body
        )}

      {/* Single delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm">
          <div className="card p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-[var(--text)] font-semibold mb-2">Delete prospect</h3>
            <p className="text-[var(--text-secondary)] text-sm mb-6">
              Delete{" "}
              <span className="text-[var(--text)] font-semibold">{deleteTarget.name}</span>?
              All generated emails will be removed too.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={!!deletingId}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSingleDelete}
                disabled={!!deletingId}
                className="px-4 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {deletingId && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {deletingId ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk schedule modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm">
          <div className="card p-6 max-w-lg w-full mx-4 shadow-xl space-y-5">
            <div>
              <h3 className="text-[var(--text)] font-semibold">Schedule campaign</h3>
              <p className="text-[var(--text-muted)] text-sm mt-1">
                For {selected.size} selected {selected.size === 1 ? "prospect" : "prospects"}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>
                  First email — date &amp; time
                </label>
                <input
                  type="datetime-local"
                  value={scheduledInitial}
                  onChange={(e) => setScheduledInitial(e.target.value)}
                  className={inputCls}
                />
              </div>
              {[
                { label: "Follow-up 1 (days)", val: follow1Days, set: setFollow1Days },
                { label: "Follow-up 2 (days)", val: follow2Days, set: setFollow2Days },
                { label: "Follow-up 3 (days)", val: follow3Days, set: setFollow3Days },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label className={labelCls}>
                    {label}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={val}
                    onChange={(e) => set(Number(e.target.value))}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowScheduleModal(false)}
                disabled={!!bulkLoading}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkSchedule}
                disabled={!!bulkLoading}
                className="btn-primary"
              >
                {bulkLoading === "schedule" && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {bulkLoading === "schedule"
                  ? (new Date(scheduledInitial).getTime() <= Date.now() + 10 * 60 * 1000 ? "Sending…" : "Scheduling…")
                  : (new Date(scheduledInitial).getTime() <= Date.now() + 10 * 60 * 1000 ? "Send now + queue follow-ups" : "Launch campaign")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
