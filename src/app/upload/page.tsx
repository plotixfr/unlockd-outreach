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

// Display-only guide rows for the columns table below the dropzone.
const COLUMN_GUIDE: { name: string; required: boolean; note: string }[] = [
  { name: "firmaNaziv", required: true, note: "Company name" },
  { name: "email", required: true, note: "Contact email — duplicates are skipped automatically" },
  { name: "nisa", required: true, note: "Niche / sector — free-form, common aliases are normalised" },
  { name: "grad", required: true, note: "City" },
  { name: "kontaktIme", required: false, note: "Contact first name" },
  { name: "kontaktPozicija", required: false, note: "Contact role / position" },
  { name: "website", required: false, note: "Website URL" },
  { name: "instagram", required: false, note: "Instagram handle or URL" },
  { name: "opisFirme", required: false, note: "Short company description" },
  { name: "kvalitetSajta", required: false, note: "Site quality 1–5 — invalid values are ignored" },
  { name: "napomena", required: false, note: "Free-form note" },
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
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] text-[var(--text)]">Import</h1>
          <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">
            <UploadIcon className="w-3 h-3" />
            CSV upload
          </span>
        </div>
        <p className="text-[var(--text-secondary)] text-sm mt-1.5">Import a new list of prospects.</p>
      </div>

      {/* Result */}
      {uploadState === "success" && result && (
        <div className="card-accent p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-emerald-800 font-bold text-sm">Import complete</p>
              <p className="text-[var(--text-secondary)] text-sm mt-1">
                <span className="font-semibold text-emerald-700 tabular">{result.created} new</span> prospects imported
                {result.skipped > 0 && (
                  <>, <span className="font-semibold tabular text-[var(--text)]">{result.skipped}</span> skipped (duplicates)</>
                )}
                {result.invalidCount > 0 && (
                  <>, <span className="text-amber-600 font-semibold tabular">{result.invalidCount}</span> rows skipped (validation)</>
                )}
              </p>
              {result.invalid.length > 0 && (
                <div className="mt-3 space-y-1">
                  {result.invalid.slice(0, 5).map((inv) => (
                    <p key={inv.row} className="text-amber-700 text-xs">
                      Row {inv.row}: {inv.error}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex gap-3 mt-3">
                <Link href="/prospects" className="text-[var(--accent)] text-sm font-semibold hover:text-[var(--accent-hover)] transition-colors">
                  View prospects →
                </Link>
                <button onClick={reset} className="text-[var(--text-muted)] text-sm hover:text-[var(--text)] transition-colors">
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
            className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              dragging
                ? "border-[var(--accent)] bg-[var(--accent-soft)] cursor-copy"
                : file
                ? "border-[var(--border-strong)] bg-white"
                : "border-[var(--border-strong)] hover:border-[var(--accent)] bg-white cursor-pointer"
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
                <FileText className="w-7 h-7 text-[var(--accent)] mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-[var(--text)] font-bold">{file.name}</p>
                <p className="text-[var(--text-muted)] text-sm mt-1 tabular">
                  {(file.size / 1024).toFixed(1)} KB · {totalRows} rows detected
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); reset(); }}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-red-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Remove file
                </button>
              </div>
            ) : (
              <div>
                <UploadIcon className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-[var(--text)] font-bold">Drop your CSV here, or click to browse</p>
                <p className="text-[var(--text-muted)] text-sm mt-1">Supported: .csv (UTF-8)</p>
              </div>
            )}
          </div>

          {/* Error */}
          {uploadState === "error" && errorMsg && (
            <div className="rounded-lg px-4 py-3 text-sm bg-red-50 text-red-700 border border-red-200">
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
                <table className="table-base">
                  <thead>
                    <tr>
                      {PREVIEW_COLUMNS.map((k) => (
                        <th key={k} className="whitespace-nowrap">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>
                        {PREVIEW_COLUMNS.map((k) => (
                          <td key={k} className="text-[var(--text)] max-w-[160px] truncate">
                            {row[k] || <span className="text-[var(--text-muted)]">—</span>}
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
              className="btn-primary w-full py-3"
            >
              {uploadState === "loading" && (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {uploadState === "loading"
                ? "Importing…"
                : `Import ${totalRows} prospects`}
            </button>
          )}
        </>
      )}

      {/* Columns guide */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)]">
          <p className="section-label"><Database className="w-3 h-3" /> Expected CSV columns</p>
        </div>
        <table className="table-base">
          <thead>
            <tr>
              <th>Column</th>
              <th>Required</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {COLUMN_GUIDE.map((col) => (
              <tr key={col.name}>
                <td>
                  <code className="font-mono text-xs text-[var(--text)] bg-zinc-100 border border-[var(--border)] rounded px-1.5 py-0.5">
                    {col.name}
                  </code>
                </td>
                <td>
                  {col.required ? (
                    <span className="badge bg-emerald-50 text-emerald-700 border border-emerald-200">Required</span>
                  ) : (
                    <span className="badge bg-zinc-100 text-zinc-600 border border-zinc-200">Optional</span>
                  )}
                </td>
                <td className="text-xs">{col.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[var(--text-muted)] text-xs px-5 py-3 border-t border-[var(--border)]">
          Header order: {CSV_COLUMNS.join(", ")}. The <code className="text-[var(--text)] font-mono">nisa</code> column accepts any value (e.g. {NISE_PREDLOZENE.join(", ")}, Spa, Avocat, Boutique…). Claude adapts the email tone per sector. Duplicates (same email) are skipped automatically.
        </p>
      </div>
    </div>
  );
}
