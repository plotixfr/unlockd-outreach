"use client";

import { useState } from "react";
import {
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Zap,
  Sparkles,
} from "lucide-react";

interface AuditIssue {
  label: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

interface AuditResult {
  ok: boolean;
  url?: string;
  title?: string | null;
  h1?: string | null;
  lighthouse?: number | null;
  lcpSec?: number | null;
  platform?: string | null;
  responsive?: boolean;
  issues?: AuditIssue[];
  error?: string;
}

/**
 * Public-facing audit widget. Anyone can land on /audit (no auth) and run a
 * 30-second analysis on their website. Email gate captures qualified inbound
 * leads — they get a personalised audit email plus a Calendly link. The
 * lead also flows into the autopilot pipeline for follow-up.
 *
 * Two-step UX:
 *   1. URL → instant on-page audit (no email required)
 *   2. "Get full report" → email + name → personalised email sent
 */
export default function AuditPage() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [scanning, setScanning] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState("");

  const runScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setScanning(true);
    setError("");
    setResult(null);
    setClaimed(false);
    try {
      const res = await fetch("/api/audit/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data: AuditResult = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sajt nije dostupan");
    } finally {
      setScanning(false);
    }
  };

  const claim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !url.trim()) return;
    setClaiming(true);
    setError("");
    try {
      const res = await fetch("/api/audit/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), email: email.trim(), name: name.trim() || null }),
      });
      const data: { ok: boolean; error?: string } = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Erreur");
      setClaimed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07070b] relative overflow-x-hidden">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(16, 185, 129, 0.12), transparent 60%), radial-gradient(ellipse 40% 30% at 20% 100%, rgba(245, 158, 11, 0.06), transparent 60%)",
        }}
      />

      <div className="relative max-w-3xl mx-auto px-6 py-16 sm:py-24">
        {/* Brand */}
        <div className="text-center mb-12">
          <a href="https://unlockd.art" className="inline-flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-emerald-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <span className="text-white font-bold text-sm tracking-tighter">U</span>
            </div>
            <div className="text-left">
              <p className="text-gradient-brand text-base font-semibold tracking-tight leading-none">Unlockd</p>
              <p className="text-zinc-600 text-[10px] mt-1 tracking-widest uppercase font-medium">Web Studio · Paris</p>
            </div>
          </a>
        </div>

        {/* Hero */}
        <div className="text-center mb-10">
          <p className="text-emerald-400 text-xs uppercase tracking-[0.18em] font-medium mb-3">Audit gratuit · 30 secondes</p>
          <h1 className="text-4xl sm:text-5xl font-semibold text-white tracking-tight leading-[1.05]">
            Découvrez ce que <span className="text-gradient-brand">votre site</span><br />
            vous fait perdre.
          </h1>
          <p className="text-zinc-500 text-base mt-5 max-w-xl mx-auto leading-relaxed">
            Score Lighthouse, signaux UX, freins à la conversion. Audit instantané + rapport détaillé personnalisé par email.
          </p>
        </div>

        {/* URL form */}
        {!result && (
          <form onSubmit={runScan} className="max-w-xl mx-auto">
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://votre-site.fr"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                autoFocus
                className="flex-1 bg-[#0d0d12] border border-[#1c1c28] rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
              <button
                type="submit"
                disabled={scanning}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-medium px-5 py-3 rounded-lg transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 flex items-center gap-2"
              >
                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {scanning ? "Analyse…" : "Analyser"}
              </button>
            </div>
            {error && <p className="text-red-400 text-xs mt-3 text-center">{error}</p>}
          </form>
        )}

        {/* Scanning shimmer */}
        {scanning && !result && (
          <div className="mt-12 max-w-xl mx-auto rounded-2xl bg-[#0d0d12] border border-[#1c1c28] p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mx-auto" />
            <p className="text-zinc-400 text-sm mt-4">Mesure Lighthouse, scan du contenu, détection des signaux…</p>
            <p className="text-zinc-600 text-xs mt-1">~30 secondes</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-12 max-w-2xl mx-auto space-y-6">
            {!result.ok ? (
              <div className="rounded-2xl bg-amber-500/[0.06] border border-amber-500/20 p-8 text-center">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
                <p className="text-amber-200 font-medium">Impossible d&apos;accéder au site</p>
                <p className="text-amber-200/60 text-sm mt-1">{result.error || "Le site n'est pas accessible publiquement."}</p>
                <button
                  onClick={() => { setResult(null); setUrl(""); }}
                  className="mt-5 text-emerald-400 hover:text-emerald-300 text-sm transition-colors"
                >
                  Essayer un autre URL →
                </button>
              </div>
            ) : (
              <>
                {/* Headline metric */}
                <div className="rounded-2xl bg-[#0d0d12] border border-[#1c1c28] p-8 card-elevation">
                  <p className="text-zinc-500 text-xs uppercase tracking-widest font-medium mb-2">Performance mobile</p>
                  {result.lighthouse !== null && result.lighthouse !== undefined ? (
                    <div className="flex items-baseline gap-3">
                      <p
                        className={`text-5xl font-semibold tabular-nums ${
                          result.lighthouse >= 90
                            ? "text-emerald-400"
                            : result.lighthouse >= 50
                              ? "text-amber-400"
                              : "text-red-400"
                        }`}
                      >
                        {result.lighthouse}
                      </p>
                      <p className="text-zinc-500 text-2xl">/100</p>
                      <p className="text-zinc-500 text-sm ml-3">
                        {result.lighthouse >= 90 ? "Excellent" : result.lighthouse >= 50 ? "Acceptable" : "Critique"}
                      </p>
                    </div>
                  ) : (
                    <p className="text-zinc-500 text-base">Non mesurable</p>
                  )}
                  <div className="flex flex-wrap gap-4 mt-5 pt-5 border-t border-[#1c1c28] text-xs">
                    {result.lcpSec && (
                      <div>
                        <p className="text-zinc-600 uppercase tracking-widest">LCP</p>
                        <p className="text-zinc-300 mt-1 tabular-nums">{result.lcpSec.toFixed(1)}s</p>
                      </div>
                    )}
                    {result.platform && (
                      <div>
                        <p className="text-zinc-600 uppercase tracking-widest">Plateforme</p>
                        <p className="text-zinc-300 mt-1">{result.platform}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-zinc-600 uppercase tracking-widest">Mobile</p>
                      <p className={`mt-1 ${result.responsive ? "text-emerald-400" : "text-red-400"}`}>
                        {result.responsive ? "Optimisé" : "Non optimisé"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Issues */}
                {result.issues && result.issues.length > 0 && (
                  <div className="rounded-2xl bg-[#0d0d12] border border-[#1c1c28] p-8 card-elevation">
                    <h2 className="text-white font-semibold mb-5 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      Points critiques détectés
                    </h2>
                    <div className="space-y-4">
                      {result.issues.map((iss, i) => (
                        <div key={i} className="flex gap-3">
                          <div
                            className={`w-1 rounded-full shrink-0 ${
                              iss.severity === "high"
                                ? "bg-red-500"
                                : iss.severity === "medium"
                                  ? "bg-amber-500"
                                  : "bg-zinc-600"
                            }`}
                          />
                          <div>
                            <p className="text-zinc-200 text-sm font-medium">{iss.label}</p>
                            <p className="text-zinc-500 text-xs mt-1 leading-relaxed">{iss.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Email gate / claim */}
                {!claimed ? (
                  <form
                    onSubmit={claim}
                    className="rounded-2xl bg-gradient-to-br from-emerald-500/[0.06] to-[#0d0d12] border border-emerald-500/20 p-8 card-elevation"
                  >
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <h2 className="text-white font-semibold">Recevoir l&apos;audit complet</h2>
                        <p className="text-zinc-500 text-sm mt-1">
                          Analyse détaillée + recommandations concrètes par email. Gratuit, sans engagement.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                      <input
                        type="text"
                        placeholder="Prénom (optionnel)"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                      />
                      <input
                        type="email"
                        placeholder="votre@email.fr"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="bg-[#07070b] border border-[#1c1c28] rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={claiming}
                      className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 flex items-center justify-center gap-2"
                    >
                      {claiming && <Loader2 className="w-4 h-4 animate-spin" />}
                      {claiming ? "Envoi…" : "Recevoir l'audit"}
                    </button>
                    {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
                    <p className="text-zinc-700 text-[11px] mt-4 flex items-center gap-1.5">
                      <ShieldCheck className="w-3 h-3" />
                      Pas de spam. Vous pouvez vous désabonner en un clic.
                    </p>
                  </form>
                ) : (
                  <div className="rounded-2xl bg-emerald-500/[0.06] border border-emerald-500/20 p-8 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                    <p className="text-emerald-200 font-semibold text-base">Audit envoyé.</p>
                    <p className="text-emerald-200/70 text-sm mt-2">
                      Regardez votre boîte mail dans les 2 minutes. Si rien n&apos;arrive, vérifiez les spams.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* CTA bar */}
            <div className="text-center pt-4">
              <a
                href="https://calendly.com/temim-unlockd/30min"
                className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
              >
                Ou parlons directement (30 min)
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Footer trust signals */}
        <div className="mt-16 pt-10 border-t border-[#1c1c28] grid grid-cols-3 gap-4 text-center max-w-2xl mx-auto">
          <div>
            <Zap className="w-5 h-5 text-emerald-400 mx-auto mb-2" strokeWidth={1.75} />
            <p className="text-zinc-300 text-xs font-medium">30 secondes</p>
            <p className="text-zinc-600 text-[11px] mt-0.5">Audit instantané, sans installation</p>
          </div>
          <div>
            <ShieldCheck className="w-5 h-5 text-emerald-400 mx-auto mb-2" strokeWidth={1.75} />
            <p className="text-zinc-300 text-xs font-medium">Confidentiel</p>
            <p className="text-zinc-600 text-[11px] mt-0.5">Vos données restent privées</p>
          </div>
          <div>
            <Sparkles className="w-5 h-5 text-emerald-400 mx-auto mb-2" strokeWidth={1.75} />
            <p className="text-zinc-300 text-xs font-medium">Rapport personnalisé</p>
            <p className="text-zinc-600 text-[11px] mt-0.5">Analyse par Unlockd, pas un robot</p>
          </div>
        </div>

        <p className="text-center text-zinc-700 text-[11px] mt-12">
          © Unlockd.art {new Date().getFullYear()} · <a href="https://unlockd.art" className="hover:text-zinc-500">unlockd.art</a>
        </p>
      </div>
    </div>
  );
}
