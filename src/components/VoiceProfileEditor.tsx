"use client";

import { useEffect, useState } from "react";
import { Loader2, MicVocal, RefreshCw, Trash2, CheckCircle2 } from "lucide-react";

interface VoiceRow {
  id: string;
  name: string;
  samples: string[];
  styleDescription: string;
  active: boolean;
  updatedAt: string;
}

/**
 * Settings panel where the operator pastes 3-5 of their own real outreach
 * emails. Claude extracts a style fingerprint that gets injected into every
 * subsequent email generation prompt so the autopilot writes in the
 * operator's voice instead of generic AI-French.
 */
export function VoiceProfileEditor() {
  const [voice, setVoice] = useState<VoiceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [samples, setSamples] = useState<string[]>(["", "", ""]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/voice");
      const data: { voice: VoiceRow | null } = await res.json();
      setVoice(data.voice);
      if (data.voice?.samples?.length) {
        setSamples([...data.voice.samples, ...["", "", ""]].slice(0, Math.max(3, data.voice.samples.length)));
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    const cleaned = samples.map((s) => s.trim()).filter((s) => s.length >= 50);
    if (cleaned.length < 1) {
      setError("Paste at least 1 email of min. 50 characters");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples: cleaned }),
      });
      const data: { voice?: VoiceRow; error?: string } = await res.json();
      if (!res.ok || !data.voice) throw new Error(data.error || "Error");
      setVoice(data.voice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm("Delete the voice profile? Generated emails will revert to the default tone.")) return;
    setSaving(true);
    try {
      await fetch("/api/voice", { method: "DELETE" });
      setVoice(null);
      setSamples(["", "", ""]);
    } finally {
      setSaving(false);
    }
  };

  const addSampleSlot = () => setSamples((prev) => [...prev, ""]);
  const removeSampleSlot = (i: number) =>
    setSamples((prev) => prev.filter((_, idx) => idx !== i));
  const updateSample = (i: number, val: string) =>
    setSamples((prev) => prev.map((s, idx) => (idx === i ? val : s)));

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center shrink-0">
          <MicVocal strokeWidth={2} className="w-5 h-5 text-[var(--accent)]" />
        </div>
        <div className="flex-1">
          <h2 className="text-[var(--text)] font-semibold">Voice profile</h2>
          <p className="text-[var(--text-muted)] text-xs mt-1 leading-relaxed">
            Paste 3–5 of your real prospect emails — ideally ones that <strong className="text-[var(--text-secondary)]">led to a meeting</strong>. Claude extracts your style (opener, sign-off, rhythm, idioms). From then on every generated email writes in your voice, not generic AI tone.
          </p>
        </div>
      </div>

      {voice && (
        <div className="rounded-lg bg-[var(--accent-soft)] border border-[var(--accent-border)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-emerald-800 text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Voice profile active
              </p>
              <p className="text-[var(--text-muted)] text-xs mt-1">
                From {voice.samples.length} email{voice.samples.length === 1 ? "" : "s"} · updated {new Date(voice.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
              <details className="mt-3">
                <summary className="text-[var(--text-secondary)] text-xs cursor-pointer hover:text-[var(--text)] transition-colors">
                  View extracted style →
                </summary>
                <pre className="mt-2 text-[var(--text-secondary)] text-[11px] leading-relaxed whitespace-pre-wrap font-sans bg-white p-3 rounded border border-[var(--border)]">
                  {voice.styleDescription}
                </pre>
              </details>
            </div>
            <button
              onClick={remove}
              disabled={saving}
              className="shrink-0 text-[var(--text-muted)] hover:text-red-600 transition-colors p-1.5"
              title="Delete voice profile"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3 pt-2 etch-top">
        <p className="text-[var(--text-secondary)] text-xs font-medium">Your samples ({voice ? "regenerate to update" : "min 1, max 10"})</p>
        {samples.map((s, i) => (
          <div key={i} className="relative">
            <textarea
              value={s}
              onChange={(e) => updateSample(i, e.target.value)}
              placeholder={`Email ${i + 1} — paste the full body (from "Bonjour" to sign-off)`}
              rows={5}
              className="w-full bg-white border border-[var(--border)] rounded-md px-3 py-2.5 text-xs text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors leading-relaxed font-mono"
            />
            {samples.length > 1 && (
              <button
                onClick={() => removeSampleSlot(i)}
                className="absolute top-2 right-2 text-[var(--text-muted)] hover:text-red-600 transition-colors"
                title="Remove slot"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addSampleSlot}
          disabled={samples.length >= 10}
          className="text-[var(--text-muted)] hover:text-[var(--text)] text-xs disabled:opacity-40 transition-colors"
        >
          + Add another slot ({samples.length}/10)
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 etch-top">
        {error && <p className="text-red-600 text-xs flex-1">{error}</p>}
        <button
          onClick={submit}
          disabled={saving || loading}
          className="btn-primary ml-auto"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : voice ? <RefreshCw className="w-4 h-4" /> : <MicVocal className="w-4 h-4" />}
          {saving ? "Extracting style…" : voice ? "Regenerate voice" : "Extract my style"}
        </button>
      </div>
    </div>
  );
}
