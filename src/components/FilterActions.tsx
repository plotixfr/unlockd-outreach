"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Filter {
  search?: string;
  nisa?: string;
  status?: string;
}

interface Props {
  filter: Filter;
  total: number;
}

export function FilterActions({ filter, total }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const hasFilter = !!(filter.search || filter.nisa || filter.status);
  const filterLabel = [
    filter.search && `"${filter.search}"`,
    filter.nisa,
    filter.status,
  ].filter(Boolean).join(" / ") || "sve";

  const exportHref = (() => {
    const sp = new URLSearchParams();
    if (filter.search) sp.set("search", filter.search);
    if (filter.nisa) sp.set("nisa", filter.nisa);
    if (filter.status) sp.set("status", filter.status);
    return `/api/prospects/export?${sp.toString()}`;
  })();

  const bulkByFilter = async (action: "delete" | "ids", confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setLoading(action);
    setMessage(null);
    try {
      const res = await fetch("/api/prospects/bulk-by-filter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, filter }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error");
      if (action === "delete") {
        setMessage({ kind: "ok", text: `Obrisano ${data.deleted} prospekata` });
        router.refresh();
      } else if (action === "ids" && Array.isArray(data.ids)) {
        // Forward into the bulk generate flow.
        const genRes = await fetch("/api/prospects/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate", ids: data.ids }),
        });
        const genData = await genRes.json().catch(() => ({}));
        if (!genRes.ok) throw new Error(genData.error || "Error generisanju");
        setMessage({ kind: "ok", text: `Generisano za ${genData.generated} prospekata` });
        router.refresh();
      }
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Error" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <a
        href={exportHref}
        className="text-xs px-3 py-1.5 rounded-lg bg-[#1a1a28] text-zinc-300 hover:bg-[#252535] hover:text-white transition-colors"
      >
        Export CSV
      </a>
      {hasFilter && total > 0 && (
        <>
          <button
            onClick={() => bulkByFilter("ids")}
            disabled={!!loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {loading === "ids" && (
              <span className="inline-block w-3 h-3 border-2 border-blue-300/30 border-t-blue-300 rounded-full animate-spin" />
            )}
            Generate za {filterLabel} ({total})
          </button>
          <button
            onClick={() => bulkByFilter("delete", `Delete all ${total} prospects in filter "${filterLabel}"?`)}
            disabled={!!loading}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {loading === "delete" && (
              <span className="inline-block w-3 h-3 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
            )}
            Delete {filterLabel} ({total})
          </button>
        </>
      )}
      {message && (
        <span className={`text-xs ${message.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
