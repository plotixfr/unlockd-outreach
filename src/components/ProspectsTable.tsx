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
  createdAt: Date;
  _count: { emails: number };
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

  const bulkAction = async (action: string, extra?: Record<string, unknown>): Promise<{ error?: string; sentNow?: number; scheduled?: number; generated?: number; deleted?: number }> => {
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
        <div className="sticky top-4 z-10 flex items-center gap-3 bg-[#0d0d12] border border-emerald-500/40 rounded-xl px-4 py-3 shadow-xl card-elevation-strong">
          <span className="text-emerald-300 text-sm font-medium">
            {selected.size} selected
          </span>
          <div className="flex-1" />
          {bulkError && <p className="text-rose-400 text-xs">{bulkError}</p>}
          <button
            onClick={() => bulkAction("generate")}
            disabled={!!bulkLoading}
            className="text-sm px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {bulkLoading === "generate" && (
              <span className="inline-block w-3 h-3 border-2 border-emerald-300/30 border-t-emerald-300 rounded-full animate-spin" />
            )}
            Generate emails
          </button>
          <button
            onClick={() => setShowScheduleModal(true)}
            disabled={!!bulkLoading}
            className="text-sm px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 transition-colors disabled:opacity-50"
          >
            Schedule campaign
          </button>
          <button
            onClick={() => bulkAction("delete")}
            disabled={!!bulkLoading}
            className="text-sm px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {bulkLoading === "delete" && (
              <span className="inline-block w-3 h-3 border-2 border-rose-300/30 border-t-rose-300 rounded-full animate-spin" />
            )}
            Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors ml-1"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] card-elevation overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1c1c28] bg-[#0a0a12]">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-zinc-700 bg-transparent accent-emerald-500 cursor-pointer"
                />
              </th>
              {["Company", "Email", "Niche", "City", "Score", "Status", "Emails", "Added", ""].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-zinc-500 text-xs uppercase tracking-wider font-medium"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#14141c]">
            {prospects.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-zinc-600 text-sm">
                  No prospects match these filters.
                </td>
              </tr>
            ) : (
              prospects.map((p) => (
                <tr
                  key={p.id}
                  className={`hover:bg-white/[0.02] transition-colors group ${selected.has(p.id) ? "bg-emerald-950/25" : ""}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="rounded border-zinc-700 bg-transparent accent-emerald-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/prospects/${p.id}`}
                      className="text-white font-medium group-hover:text-emerald-400 transition-colors"
                    >
                      {p.firmaNaziv}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{p.email}</td>
                  <td className="px-4 py-3 text-zinc-400">{p.nisa}</td>
                  <td className="px-4 py-3 text-zinc-400">{p.grad}</td>
                  <td className="px-4 py-3">
                    {p.qualityScore !== null ? (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          p.qualityScore >= 8
                            ? "bg-emerald-950/60 text-emerald-300"
                            : p.qualityScore >= 6
                              ? "bg-amber-950/60 text-amber-300"
                              : p.qualityScore >= 4
                                ? "bg-orange-950/60 text-orange-300"
                                : "bg-rose-950/60 text-rose-400"
                        }`}
                      >
                        {p.qualityScore}/10
                      </span>
                    ) : (
                      <span className="text-zinc-700 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <QuickStatusBadge prospectId={p.id} status={p.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {p._count.emails > 0 ? (
                      <span className="text-emerald-400">{p._count.emails}/4</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 text-xs">
                    {new Date(p.createdAt).toLocaleDateString("en-US")}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => handleMenuToggle(e, p.id)}
                      className="text-zinc-600 hover:text-zinc-300 transition-colors p-1 rounded"
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
            className="w-36 bg-[#1a1a28] border border-[#2a2a3e] rounded-lg shadow-2xl overflow-hidden"
          >
            <Link
              href={`/prospects/${menuPos.id}/edit`}
              onClick={() => setMenuPos(null)}
              className="flex items-center px-3 py-2.5 text-sm text-zinc-300 hover:bg-[#252535] hover:text-white transition-colors"
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
              className="w-full flex items-center px-3 py-2.5 text-sm text-emerald-400 hover:bg-emerald-950/40 hover:text-emerald-300 transition-colors disabled:opacity-50"
            >
              Mark as replied
            </button>
            <button
              onClick={() => {
                const p = prospects.find((x) => x.id === menuPos.id);
                if (p) setDeleteTarget({ id: p.id, name: p.firmaNaziv });
                setMenuPos(null);
              }}
              className="w-full flex items-center px-3 py-2.5 text-sm text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors"
            >
              Delete
            </button>
          </div>,
          document.body
        )}

      {/* Single delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0d0d12] border border-[#1c1c28] card-elevation rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-white font-semibold mb-2">Delete prospect</h3>
            <p className="text-zinc-400 text-sm mb-6">
              Delete{" "}
              <span className="text-white font-medium">{deleteTarget.name}</span>?
              All generated emails will be removed too.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={!!deletingId}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white border border-[#1f1f2e] rounded-lg hover:bg-white/[0.02] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSingleDelete}
                disabled={!!deletingId}
                className="px-4 py-2 text-sm bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0d0d12] border border-[#1c1c28] card-elevation rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl space-y-5">
            <div>
              <h3 className="text-white font-semibold">Schedule campaign</h3>
              <p className="text-zinc-500 text-sm mt-1">
                For {selected.size} selected {selected.size === 1 ? "prospect" : "prospects"}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
                  First email — date &amp; time
                </label>
                <input
                  type="datetime-local"
                  value={scheduledInitial}
                  onChange={(e) => setScheduledInitial(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              {[
                { label: "Follow-up 1 (days)", val: follow1Days, set: setFollow1Days },
                { label: "Follow-up 2 (days)", val: follow2Days, set: setFollow2Days },
                { label: "Follow-up 3 (days)", val: follow3Days, set: setFollow3Days },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
                    {label}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={val}
                    onChange={(e) => set(Number(e.target.value))}
                    className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowScheduleModal(false)}
                disabled={!!bulkLoading}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white border border-[#1f1f2e] rounded-lg hover:bg-white/[0.02] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkSchedule}
                disabled={!!bulkLoading}
                className="px-4 py-2 text-sm bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {bulkLoading === "schedule" && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-emerald-950/30 border-t-emerald-950 rounded-full animate-spin" />
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
