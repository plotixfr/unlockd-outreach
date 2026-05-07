"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { STATUS_BOJE } from "@/lib/constants";

interface Prospect {
  id: string;
  firmaNaziv: string;
  email: string;
  nisa: string;
  grad: string;
  status: string;
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
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString().slice(0, 16);
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

  const bulkAction = async (action: string, extra?: Record<string, unknown>) => {
    setBulkLoading(action);
    setBulkError("");
    try {
      const res = await fetch("/api/prospects/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: selectedIds, ...extra }),
      });
      let data: { error?: string } = {};
      try { data = await res.json(); } catch { throw new Error("Server nije vratio validan odgovor"); }
      if (!res.ok) throw new Error(data.error || "Greška");
      if (action === "delete") setSelected(new Set());
      router.refresh();
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Greška");
    } finally {
      setBulkLoading(null);
    }
  };

  const handleBulkSchedule = async () => {
    await bulkAction("schedule", {
      scheduleData: { scheduledInitial, follow1Days, follow2Days, follow3Days },
    });
    setShowScheduleModal(false);
  };

  const handleReply = async (id: string) => {
    setReplyingId(id);
    try {
      const res = await fetch(`/api/prospects/${id}/reply`, { method: "POST" });
      if (!res.ok) throw new Error("Greška");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Greška");
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
        throw new Error(d.error || "Greška pri brisanju");
      }
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Greška");
    } finally {
      setDeletingId(null);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-4 z-10 flex items-center gap-3 bg-[#111118] border border-blue-600/40 rounded-xl px-4 py-3 shadow-xl">
          <span className="text-blue-400 text-sm font-medium">
            {selected.size} {selected.size === 1 ? "odabran" : "odabrano"}
          </span>
          <div className="flex-1" />
          {bulkError && <p className="text-red-400 text-xs">{bulkError}</p>}
          <button
            onClick={() => bulkAction("generate")}
            disabled={!!bulkLoading}
            className="text-sm px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {bulkLoading === "generate" && (
              <span className="inline-block w-3 h-3 border-2 border-blue-300/30 border-t-blue-300 rounded-full animate-spin" />
            )}
            Generiši emailove
          </button>
          <button
            onClick={() => setShowScheduleModal(true)}
            disabled={!!bulkLoading}
            className="text-sm px-3 py-1.5 rounded-lg bg-sky-600/20 text-sky-300 hover:bg-sky-600/30 transition-colors disabled:opacity-50"
          >
            Zakaži kampanju
          </button>
          <button
            onClick={() => bulkAction("delete")}
            disabled={!!bulkLoading}
            className="text-sm px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {bulkLoading === "delete" && (
              <span className="inline-block w-3 h-3 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
            )}
            Obriši
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors ml-1"
          >
            Otkaži
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1f1f2e]">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-zinc-700 bg-transparent accent-blue-600 cursor-pointer"
                />
              </th>
              {["Firma", "Email", "Niša", "Grad", "Status", "Emails", "Kreiran", ""].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-zinc-500 text-xs uppercase tracking-wider font-medium"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1f1f2e]">
            {prospects.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-zinc-600 text-sm">
                  Nema prospekata za ove filtere.
                </td>
              </tr>
            ) : (
              prospects.map((p) => (
                <tr
                  key={p.id}
                  className={`hover:bg-[#1a1a28] transition-colors group ${selected.has(p.id) ? "bg-blue-950/20" : ""}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="rounded border-zinc-700 bg-transparent accent-blue-600 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/prospects/${p.id}`}
                      className="text-white font-medium group-hover:text-blue-400 transition-colors"
                    >
                      {p.firmaNaziv}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{p.email}</td>
                  <td className="px-4 py-3 text-zinc-400">{p.nisa}</td>
                  <td className="px-4 py-3 text-zinc-400">{p.grad}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BOJE[p.status] ?? "bg-zinc-700 text-zinc-200"}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {p._count.emails > 0 ? (
                      <span className="text-blue-400">{p._count.emails}/4</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 text-xs">
                    {new Date(p.createdAt).toLocaleDateString("fr-FR")}
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
              Uredi
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
              Označi kao odgovoreno
            </button>
            <button
              onClick={() => {
                const p = prospects.find((x) => x.id === menuPos.id);
                if (p) setDeleteTarget({ id: p.id, name: p.firmaNaziv });
                setMenuPos(null);
              }}
              className="w-full flex items-center px-3 py-2.5 text-sm text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-colors"
            >
              Obriši
            </button>
          </div>,
          document.body
        )}

      {/* Single delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111118] border border-[#1f1f2e] rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-white font-semibold mb-2">Obriši prospekta</h3>
            <p className="text-zinc-400 text-sm mb-6">
              Da li ste sigurni da želite obrisati{" "}
              <span className="text-white font-medium">{deleteTarget.name}</span>?
              Ovo će obrisati i sve generisane emailove.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={!!deletingId}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white border border-[#1f1f2e] rounded-lg hover:bg-[#1a1a28] transition-colors"
              >
                Odustani
              </button>
              <button
                onClick={handleSingleDelete}
                disabled={!!deletingId}
                className="px-4 py-2 text-sm bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {deletingId && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {deletingId ? "Brisanje..." : "Da, obriši"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk schedule modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#111118] border border-[#1f1f2e] rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl space-y-5">
            <div>
              <h3 className="text-white font-semibold">Zakaži kampanju</h3>
              <p className="text-zinc-500 text-sm mt-1">
                Za {selected.size} odabranih prospekata
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
                  Datum i vrijeme prvog emaila
                </label>
                <input
                  type="datetime-local"
                  value={scheduledInitial}
                  onChange={(e) => setScheduledInitial(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600 transition-colors"
                />
              </div>
              {[
                { label: "Follow-up 1 (dani)", val: follow1Days, set: setFollow1Days },
                { label: "Follow-up 2 (dani)", val: follow2Days, set: setFollow2Days },
                { label: "Follow-up 3 (dani)", val: follow3Days, set: setFollow3Days },
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
                    className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600 transition-colors"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowScheduleModal(false)}
                disabled={!!bulkLoading}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white border border-[#1f1f2e] rounded-lg hover:bg-[#1a1a28] transition-colors"
              >
                Odustani
              </button>
              <button
                onClick={handleBulkSchedule}
                disabled={!!bulkLoading}
                className="px-4 py-2 text-sm bg-sky-700 hover:bg-sky-600 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {bulkLoading === "schedule" && (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {bulkLoading === "schedule" ? "Zakazivanje..." : "Pokreni kampanje"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
