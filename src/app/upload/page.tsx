"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import Link from "next/link";
import { NISE_PREDLOZENE } from "@/lib/constants";
import { Upload as UploadIcon, FileText, CheckCircle2, X } from "lucide-react";

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
    <div className="max-w-3xl space-y-8">
      <div>
        <p className="text-zinc-500 text-xs uppercase tracking-[0.18em] font-medium mb-2">Import</p>
        <h1 className="text-3xl font-semibold text-white tracking-tight">Upload CSV</h1>
        <p className="text-zinc-500 text-sm mt-1">Import a new list of prospects.</p>
      </div>

      {/* Result */}
      {uploadState === "success" && result && (
        <div className="rounded-xl bg-gradient-to-br from-emerald-500/[0.08] to-[#0d0d12] border border-emerald-500/30 p-5 card-elevation">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-emerald-300 font-medium text-sm">Import complete</p>
              <p className="text-emerald-200/80 text-sm mt-1">
                <span className="font-bold text-emerald-300 tabular-nums">{result.created} new</span> prospects imported
                {result.skipped > 0 && (
                  <>, <span className="font-bold tabular-nums">{result.skipped}</span> skipped (duplicates)</>
                )}
                {result.invalidCount > 0 && (
                  <>, <span className="text-amber-400 font-bold tabular-nums">{result.invalidCount}</span> rows skipped (validation)</>
                )}
              </p>
              {result.invalid.length > 0 && (
                <div className="mt-3 space-y-1">
                  {result.invalid.slice(0, 5).map((inv) => (
                    <p key={inv.row} className="text-amber-400/70 text-xs">
                      Row {inv.row}: {inv.error}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex gap-3 mt-3">
                <Link href="/prospects" className="text-emerald-400 text-sm font-medium hover:text-emerald-300 transition-colors">
                  View prospects →
                </Link>
                <button onClick={reset} className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">
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
                ? "border-emerald-500 bg-emerald-500/[0.06] cursor-copy"
                : file
                ? "border-[#1c1c28] bg-[#0d0d12]"
                : "border-[#1c1c28] hover:border-emerald-500/40 bg-[#0d0d12] cursor-pointer"
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
                <p className="text-white font-medium">{file.name}</p>
                <p className="text-zinc-500 text-sm mt-1 tabular-nums">
                  {(file.size / 1024).toFixed(1)} KB · {totalRows} rows detected
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); reset(); }}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-zinc-600 hover:text-rose-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                  Remove file
                </button>
              </div>
            ) : (
              <div>
                <UploadIcon className="w-8 h-8 text-zinc-600 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-zinc-300 font-medium">Drop your CSV here, or click to browse</p>
                <p className="text-zinc-600 text-sm mt-1">Supported: .csv (UTF-8)</p>
              </div>
            )}
          </div>

          {/* Error */}
          {uploadState === "error" && errorMsg && (
            <div className="rounded-lg px-4 py-3 text-sm bg-rose-500/10 text-rose-300 border border-rose-500/20">
              {errorMsg}
            </div>
          )}

          {/* Preview table */}
          {preview.length > 0 && (
            <div className="space-y-3">
              <p className="text-zinc-300 text-sm font-medium">
                Preview — first {preview.length} of {totalRows} rows
              </p>
              <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] overflow-x-auto card-elevation">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1c1c28] bg-[#0a0a12]">
                      {PREVIEW_COLUMNS.map((k) => (
                        <th
                          key={k}
                          className="text-left px-3 py-2.5 text-zinc-600 text-[10px] uppercase tracking-widest font-medium whitespace-nowrap"
                        >
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#14141c]">
                    {preview.map((row, i) => (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        {PREVIEW_COLUMNS.map((k) => (
                          <td key={k} className="px-3 py-2.5 text-zinc-300 max-w-[160px] truncate">
                            {row[k] || <span className="text-zinc-700">—</span>}
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
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-emerald-950 font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-[0_8px_24px_-10px_rgba(16,185,129,0.45)]"
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
      <div className="rounded-xl bg-[#0d0d12] border border-[#1c1c28] p-5 card-elevation">
        <h2 className="text-white text-sm font-medium mb-3">Expected CSV columns</h2>
        <div className="flex flex-wrap gap-2">
          {CSV_COLUMNS.map((k) => (
            <code key={k} className="bg-emerald-500/10 text-emerald-300 text-xs px-2 py-1 rounded font-mono border border-emerald-500/20">
              {k}
            </code>
          ))}
        </div>
        <p className="text-zinc-500 text-xs mt-3">
          The <code className="text-zinc-300">nisa</code> column accepts any value (e.g. {NISE_PREDLOZENE.join(", ")}, Spa, Avocat, Boutique…). Claude adapts the email tone per sector. Duplicates (same email) are skipped automatically.
        </p>
      </div>
    </div>
  );
}
