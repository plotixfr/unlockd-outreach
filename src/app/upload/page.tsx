"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import Link from "next/link";
import { NISE_PREDLOZENE } from "@/lib/constants";
import { Upload as UploadIcon, FileText, CheckCircle2, X, Database } from "lucide-react";

const CSV_COLUMNS = [
  "firmaNaziv", "kontaktIme", "kontaktPozicija", "email",
  "website", "instagram", "nisa", "grad", "opisFirme", "kvalitetSajta", "napomena",
];

const PREVIEW_COLUMNS = ["firmaNaziv", "email", "nisa", "grad", "website"];

interface ParsedRow {
  firmaNaziv?: string;
  email?: string;
  nisa?: string;
  grad?: string;
  website?: string;
  [key: string]: string | undefined;
}

interface UploadResult {
  created: number;
  skipped: number;
  invalidCount: number;
  invalid: { row: number; error: string }[];
}

export default function UploadPage() {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [uploadState, setUploadState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.name.endsWith(".csv")) {
      setErrorMsg("Only CSV files are supported.");
      setUploadState("error");
      return;
    }
    setFile(f);
    setUploadState("idle");
    setErrorMsg("");
    setResult(null);
    setPreview([]);

    Papa.parse<ParsedRow>(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      transform: (v) => v.trim(),
      complete: (res) => {
        setPreview(res.data.slice(0, 5));
        setTotalRows(res.data.length);
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploadState("loading");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/prospects/upload", { method: "POST", body: formData });
      let data: Partial<UploadResult> & { error?: string } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error("Invalid server response — please try again");
      }
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setResult({
        created: data.created ?? 0,
        skipped: data.skipped ?? 0,
        invalidCount: data.invalidCount ?? 0,
        invalid: data.invalid ?? [],
      });
      setUploadState("success");
      setFile(null);
      setPreview([]);
    } catch (err) {
      setUploadState("error");
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const reset = () => {
    setFile(null);
    setPreview([]);
    setTotalRows(0);
    setUploadState("idle");
    setResult(null);
    setErrorMsg("");
  };

  return (
    <div className="max-w-3xl space-y-3">
      <div className="pb-2">
        <div className="flex items-center gap-3 mb-3">
          <span className="pill pill-accent">
            <UploadIcon className="w-3 h-3" />
            Import
          </span>
        </div>
        <h1 className="text-white text-4xl sm:text-5xl tracking-tight">Upload CSV</h1>
        <p className="text-[var(--text-muted)] text-sm mt-3 max-w-2xl">Import a new list of prospects.</p>
      </div>

      {/* Result */}
      {uploadState === "success" && result && (
        <div className="card card-accent p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-500/25">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-emerald-300 font-bold text-sm">Import complete</p>
              <p className="text-[var(--text-muted)] text-sm mt-1">
                <span className="display-number text-emerald-300 tabular">{result.created} new</span> prospects imported
                {result.skipped > 0 && (
                  <>, <span className="font-bold tabular text-[var(--text)]">{result.skipped}</span> skipped (duplicates)</>
                )}
                {result.invalidCount > 0 && (
                  <>, <span className="text-amber-300 font-bold tabular">{result.invalidCount}</span> rows skipped (validation)</>
                )}
              </p>
              {result.invalid.length > 0 && (
                <div className="mt-3 space-y-1">
                  {result.invalid.slice(0, 5).map((inv) => (
                    <p key={inv.row} className="text-amber-300/80 text-xs">
                      Row {inv.row}: {inv.error}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex gap-3 mt-3">
                <Link href="/prospects" className="text-emerald-300 text-sm font-semibold hover:text-emerald-200 transition-colors">
                  View prospects →
                </Link>
                <button onClick={reset} className="text-[var(--text-dim)] text-sm hover:text-[var(--text)] transition-colors">
                  New upload
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {uploadState !== "success" && (
        <>
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !file && inputRef.current?.click()}
            className={`rounded-md border-2 border-dashed p-10 text-center transition-colors ${
              dragging
                ? "border-emerald-500 bg-emerald-500/[0.06] cursor-copy"
                : file
                ? "border-[var(--border-2)] bg-[var(--bg-elev-1)]"
                : "border-[var(--border-2)] hover:border-emerald-500/40 bg-[var(--bg-elev-1)] cursor-pointer"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {file ? (
              <div>
                <FileText className="w-7 h-7 text-emerald-400 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-white font-bold">{file.name}</p>
                <p className="text-[var(--text-dim)] text-sm mt-1 tabular">
                  {(file.size / 1024).toFixed(1)} KB · {totalRows} rows detected
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); reset(); }}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--text-dim)] hover:text-rose-300 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Remove file
                </button>
              </div>
            ) : (
              <div>
                <UploadIcon className="w-8 h-8 text-[var(--text-dim)] mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-[var(--text)] font-bold">Drop your CSV here, or click to browse</p>
                <p className="text-[var(--text-dim)] text-sm mt-1">Supported: .csv (UTF-8)</p>
              </div>
            )}
          </div>

          {/* Error */}
          {uploadState === "error" && errorMsg && (
            <div className="rounded-sm px-4 py-3 text-sm bg-rose-500/10 text-rose-300 border border-rose-500/20">
              {errorMsg}
            </div>
          )}

          {/* Preview table */}
          {preview.length > 0 && (
            <div className="space-y-3">
              <p className="section-label">
                Preview — first {preview.length} of {totalRows} rows
              </p>
              <div className="card overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-2)] bg-[var(--bg-elev-1)]">
                      {PREVIEW_COLUMNS.map((k) => (
                        <th
                          key={k}
                          className="text-left px-3 py-2.5 text-[var(--text-dim)] text-[10px] uppercase tracking-widest font-bold whitespace-nowrap"
                        >
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-1)]">
                    {preview.map((row, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        {PREVIEW_COLUMNS.map((k) => (
                          <td key={k} className="px-3 py-2.5 text-[var(--text)] max-w-[160px] truncate">
                            {row[k] || <span className="text-[var(--text-faint)]">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upload button */}
          {file && (
            <button
              onClick={handleUpload}
              disabled={uploadState === "loading"}
              className="btn-accent w-full py-3 disabled:opacity-50"
            >
              {uploadState === "loading" && (
                <span className="inline-block w-4 h-4 border-2 border-emerald-950/30 border-t-emerald-950 rounded-full animate-spin" />
              )}
              {uploadState === "loading"
                ? "Importing…"
                : `Import ${totalRows} prospects`}
            </button>
          )}
        </>
      )}

      {/* Format guide */}
      <div className="card p-5">
        <p className="section-label mb-3"><Database className="w-3 h-3" /> Expected CSV columns</p>
        <div className="flex flex-wrap gap-2">
          {CSV_COLUMNS.map((k) => (
            <code key={k} className="bg-emerald-500/10 text-emerald-300 text-xs px-2 py-1 rounded-sm font-mono border border-emerald-500/20">
              {k}
            </code>
          ))}
        </div>
        <p className="text-[var(--text-dim)] text-xs mt-3">
          The <code className="text-[var(--text)]">nisa</code> column accepts any value (e.g. {NISE_PREDLOZENE.join(", ")}, Spa, Avocat, Boutique…). Claude adapts the email tone per sector. Duplicates (same email) are skipped automatically.
        </p>
      </div>
    </div>
  );
}
