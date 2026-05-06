"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import Link from "next/link";
import { NISE } from "@/lib/constants";

const CSV_KOLONE = [
  "firmaNaziv", "kontaktIme", "kontaktPozicija", "email",
  "website", "instagram", "nisa", "grad", "opisFirme", "kvalitetSajta", "napomena",
];

const PREVIEW_KOLONE = ["firmaNaziv", "email", "nisa", "grad", "website"];

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
      setErrorMsg("Samo CSV fajlovi su podržani.");
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
        throw new Error("Server nije vratio validan odgovor — pokušajte ponovo");
      }
      if (!res.ok) throw new Error(data.error || "Greška pri uploadu");
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
      setErrorMsg(err instanceof Error ? err.message : "Nepoznata greška");
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
        <h1 className="text-2xl font-semibold text-white">Upload CSV</h1>
        <p className="text-zinc-500 text-sm mt-1">Importuj novu listu prospekata</p>
      </div>

      {/* Rezultat */}
      {uploadState === "success" && result && (
        <div className="rounded-xl bg-emerald-950 border border-emerald-800 p-5">
          <p className="text-emerald-300 font-medium text-sm">Import završen</p>
          <p className="text-emerald-400/80 text-sm mt-1">
            <span className="font-bold text-emerald-300">{result.created} novih</span> prospekata uvezeno
            {result.skipped > 0 && (
              <>, <span className="font-bold">{result.skipped}</span> preskočeno (duplikati)</>
            )}
            {result.invalidCount > 0 && (
              <>, <span className="text-amber-400 font-bold">{result.invalidCount}</span> redova preskočeno (validacija)</>
            )}
          </p>
          {result.invalid.length > 0 && (
            <div className="mt-3 space-y-1">
              {result.invalid.slice(0, 5).map((inv) => (
                <p key={inv.row} className="text-amber-400/70 text-xs">
                  Red {inv.row}: {inv.error}
                </p>
              ))}
            </div>
          )}
          <div className="flex gap-3 mt-3">
            <Link href="/prospects" className="text-emerald-400 text-sm hover:text-emerald-300 transition-colors">
              Pogledaj prospekte →
            </Link>
            <button onClick={reset} className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">
              Novi upload
            </button>
          </div>
        </div>
      )}

      {uploadState !== "success" && (
        <>
          {/* Drop zona */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => !file && inputRef.current?.click()}
            className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              dragging
                ? "border-blue-500 bg-blue-950/20 cursor-copy"
                : file
                ? "border-[#1f1f2e] bg-[#111118]"
                : "border-[#1f1f2e] hover:border-zinc-600 bg-[#111118] cursor-pointer"
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
                <p className="text-white font-medium">{file.name}</p>
                <p className="text-zinc-500 text-sm mt-1">
                  {(file.size / 1024).toFixed(1)} KB · {totalRows} redova pronađeno
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); reset(); }}
                  className="mt-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  Ukloni fajl
                </button>
              </div>
            ) : (
              <div>
                <p className="text-zinc-400 font-medium">Prevuci CSV ovdje ili klikni</p>
                <p className="text-zinc-600 text-sm mt-1">Podržani format: .csv (UTF-8)</p>
              </div>
            )}
          </div>

          {/* Error */}
          {uploadState === "error" && errorMsg && (
            <div className="rounded-lg px-4 py-3 text-sm bg-red-950 text-red-300 border border-red-800">
              {errorMsg}
            </div>
          )}

          {/* Preview tabela */}
          {preview.length > 0 && (
            <div className="space-y-3">
              <p className="text-zinc-400 text-sm font-medium">
                Preview — prvih {preview.length} od {totalRows} redova
              </p>
              <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1f1f2e]">
                      {PREVIEW_KOLONE.map((k) => (
                        <th
                          key={k}
                          className="text-left px-3 py-2.5 text-zinc-500 uppercase tracking-wider font-medium whitespace-nowrap"
                        >
                          {k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f1f2e]">
                    {preview.map((row, i) => (
                      <tr key={i} className="hover:bg-[#1a1a28] transition-colors">
                        {PREVIEW_KOLONE.map((k) => (
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

          {/* Upload dugme */}
          {file && (
            <button
              onClick={handleUpload}
              disabled={uploadState === "loading"}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {uploadState === "loading" && (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {uploadState === "loading"
                ? "Uvoz u toku..."
                : `Uvezi ${totalRows} prospekata`}
            </button>
          )}
        </>
      )}

      {/* Format guide */}
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5">
        <h2 className="text-white text-sm font-medium mb-3">Očekivane kolone CSV fajla</h2>
        <div className="flex flex-wrap gap-2">
          {CSV_KOLONE.map((k) => (
            <code key={k} className="bg-[#1a1a28] text-blue-300 text-xs px-2 py-1 rounded font-mono">
              {k}
            </code>
          ))}
        </div>
        <p className="text-zinc-600 text-xs mt-3">
          Polje <code className="text-zinc-400">nisa</code> mora biti:{" "}
          {NISE.join(", ")} — Duplikati (isti email) se automatski preskaču.
        </p>
      </div>
    </div>
  );
}
