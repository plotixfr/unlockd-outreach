"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  emailId: string;
  initialSubject: string;
  initialSubjectB: string | null;
  initialBody: string;
  poslat: boolean;
}

const inputCls =
  "w-full bg-white border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors";

const labelCls =
  "block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)] mb-1";

export function EmailEditor({
  emailId,
  initialSubject,
  initialSubjectB,
  initialBody,
  poslat,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(initialSubject);
  const [subjectB, setSubjectB] = useState(initialSubjectB ?? "");
  const [body, setBody] = useState(initialBody);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const router = useRouter();

  const dirty =
    subject !== initialSubject ||
    (subjectB || null) !== initialSubjectB ||
    body !== initialBody;

  const save = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/emails/${emailId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          subjectB: subjectB.trim() ? subjectB : null,
          body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
      setEditing(false);
      setMessage({ kind: "ok", text: "Saved" });
      router.refresh();
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Error" });
    } finally {
      setLoading(false);
    }
  };

  const sendTest = async () => {
    setTestLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/emails/${emailId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error");
      setMessage({ kind: "ok", text: `Test sent to ${data.to}` });
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Error" });
    } finally {
      setTestLoading(false);
    }
  };

  if (!editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {!poslat && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-medium px-2.5 py-1 rounded-lg bg-white border border-[var(--border)] text-[var(--text-secondary)] hover:bg-zinc-50 hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-colors"
            >
              Edit
            </button>
          )}
          <button
            onClick={sendTest}
            disabled={testLoading}
            className="text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {testLoading && (
              <span className="inline-block w-3 h-3 border-2 border-amber-700/30 border-t-amber-700 rounded-full animate-spin" />
            )}
            Send test
          </button>
          {message && (
            <span className={`text-xs ${message.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}>
              {message.text}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg bg-white border border-[var(--border)] p-4">
      <div>
        <label className={labelCls}>
          Subject A
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>
          Subject B (optional)
        </label>
        <input
          type="text"
          value={subjectB}
          onChange={(e) => setSubjectB(e.target.value)}
          placeholder="Leave empty to skip A/B testing"
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>
          Body (HTML — p, br, strong)
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          className={`${inputCls} font-mono resize-y`}
        />
      </div>
      {message && (
        <p className={`text-xs ${message.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={loading || !dirty}
          className="btn-primary text-xs px-3 py-1.5"
        >
          {loading && (
            <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {loading ? "Saving..." : "Save"}
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setSubject(initialSubject);
            setSubjectB(initialSubjectB ?? "");
            setBody(initialBody);
            setMessage(null);
          }}
          disabled={loading}
          className="text-[var(--text-muted)] hover:text-[var(--text)] text-xs transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
