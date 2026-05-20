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
      if (!res.ok) throw new Error(data.error || "Error snimanju");
      setEditing(false);
      setMessage({ kind: "ok", text: "Sačuvano" });
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
      setMessage({ kind: "ok", text: `Test poslan na ${data.to}` });
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
              className="text-xs px-2.5 py-1 rounded-lg bg-[#1a1a28] text-zinc-300 hover:bg-[#252535] hover:text-white transition-colors"
            >
              Edit
            </button>
          )}
          <button
            onClick={sendTest}
            disabled={testLoading}
            className="text-xs px-2.5 py-1 rounded-lg bg-amber-950/40 text-amber-300 hover:bg-amber-900/60 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            {testLoading && (
              <span className="inline-block w-3 h-3 border-2 border-amber-300/30 border-t-amber-300 rounded-full animate-spin" />
            )}
            Send test
          </button>
          {message && (
            <span className={`text-xs ${message.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
              {message.text}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg bg-[#0a0a0f] border border-[#1f1f2e] p-4">
      <div>
        <label className="block text-zinc-500 text-xs uppercase tracking-wider mb-1">
          Subject A
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full bg-[#111118] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-600 transition-colors"
        />
      </div>
      <div>
        <label className="block text-zinc-500 text-xs uppercase tracking-wider mb-1">
          Subject B (opciono)
        </label>
        <input
          type="text"
          value={subjectB}
          onChange={(e) => setSubjectB(e.target.value)}
          placeholder="Ostaviti prazno za bez A/B testiranja"
          className="w-full bg-[#111118] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-600 transition-colors"
        />
      </div>
      <div>
        <label className="block text-zinc-500 text-xs uppercase tracking-wider mb-1">
          Body (HTML — p, br, strong)
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          className="w-full bg-[#111118] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-blue-600 transition-colors resize-y"
        />
      </div>
      {message && (
        <p className={`text-xs ${message.kind === "ok" ? "text-emerald-400" : "text-red-400"}`}>
          {message.text}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={loading || !dirty}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
        >
          {loading && (
            <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {loading ? "Snimam..." : "Save"}
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
          className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
