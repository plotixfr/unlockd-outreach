"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { STATUSI, STATUS_BOJE } from "@/lib/constants";

interface Props {
  prospectId: string;
  status: string;
}

interface MenuPos {
  top: number;
  left: number;
}

export function QuickStatusBadge({ prospectId, status: initialStatus }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!menuPos) return;
    const handler = () => setMenuPos(null);
    const timer = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handler);
    };
  }, [menuPos]);

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (menuPos) { setMenuPos(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const dropdownH = STATUSI.length * 32 + 8;
    const top =
      window.innerHeight - rect.bottom > dropdownH
        ? rect.bottom + 4
        : rect.top - dropdownH - 4;
    setMenuPos({ top, left: rect.left });
  };

  const handleSelect = async (newStatus: string) => {
    if (newStatus === status || saving) return;
    setMenuPos(null);
    const prev = status;
    setStatus(newStatus);
    setSaving(true);
    try {
      await fetch(`/api/prospects/${prospectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      router.refresh();
    } catch {
      setStatus(prev);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={handleToggle}
        disabled={saving}
        className={`text-xs px-2 py-0.5 rounded-full font-medium transition-opacity cursor-pointer ${
          saving ? "opacity-50" : "hover:opacity-75"
        } ${STATUS_BOJE[status] ?? "bg-zinc-700 text-zinc-200"}`}
      >
        {status}
      </button>

      {menuPos &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              zIndex: 9999,
            }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1a1a28] border border-[#2a2a3e] rounded-lg shadow-2xl overflow-hidden py-1 min-w-[130px]"
          >
            {STATUSI.map((s) => (
              <button
                key={s}
                onClick={() => handleSelect(s)}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                  s === status
                    ? "opacity-40 cursor-default"
                    : "hover:bg-[#252535] cursor-pointer"
                }`}
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                    STATUS_BOJE[s]?.split(" ")[0] ?? "bg-zinc-600"
                  }`}
                />
                <span className="text-zinc-200">{s}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
