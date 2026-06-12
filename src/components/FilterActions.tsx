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
  ].filter(Boolean).join(" / ") || "all";

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
        setMessage({ kind: "ok", text: `Deleted ${data.deleted} prospects` });
        router.refresh();
      } else if (action === "ids" && Array.isArray(data.ids)) {
        // Forward into the bulk generate flow.
        const genRes = await fetch("/api/prospects/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate", ids: data.ids }),
        });
        const genData = await genRes.json().catch(() => ({}));
        if (!genRes.ok) throw new Error(genData.error || "Generation failed");
        setMessage({ kind: "ok", text: `Generated for ${genData.generated} prospects` });
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
        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-[var(--border)] text-[var(--text-secondary)] hover:bg-zinc-50 hover:border-[var(--border-strong)] hover:text-[var(--text)] transition-colors"
      >
        Export CSV
      </a>
      {hasFilter && total > 0 && (
        <>
          <button
            onClick={() => bulkByFilter("ids")}
            disabled={!!loading}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {loading === "ids" && (
              <span className="inline-block w-3 h-3 border-2 border-sky-700/30 border-t-sky-700 rounded-full animate-spin" />
            )}
            Generate for {filterLabel} ({total})
          </button>
          <button
            onClick={() => bulkByFilter("delete", `Delete all ${total} prospects in filter "${filterLabel}"?`)}
            disabled={!!loading}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {loading === "delete" && (
              <span className="inline-block w-3 h-3 border-2 border-red-700/30 border-t-red-700 rounded-full animate-spin" />
            )}
            Delete {filterLabel} ({total})
          </button>
        </>
      )}
      {message && (
        <span className={`text-xs ${message.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
