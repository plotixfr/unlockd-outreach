"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  emailId: string;
  subject: string;
  subjectB: string | null;
  activeSubject: string;
}

export function SubjectSelector({ emailId, subject, subjectB, activeSubject }: Props) {
  const [active, setActive] = useState(activeSubject);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  if (!subjectB) {
    return (
      <p className="text-[var(--text)] text-sm font-semibold truncate">{subject}</p>
    );
  }

  const handleChange = async (val: "A" | "B") => {
    if (val === active || saving) return;
    setSaving(true);
    setActive(val);
    try {
      await fetch(`/api/emails/${emailId}/subject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeSubject: val }),
      });
      router.refresh();
    } catch {
      setActive(active);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1 min-w-0">
      {(["A", "B"] as const).map((v) => {
        const text = v === "A" ? subject : subjectB;
        const isActive = active === v;
        return (
          <button
            key={v}
            onClick={() => handleChange(v)}
            disabled={saving}
            className={`flex items-center gap-2 w-full text-left group ${saving ? "opacity-60" : ""}`}
          >
            <span
              className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                isActive
                  ? "border-[var(--accent)] bg-[var(--accent)]"
                  : "border-[var(--border-strong)] group-hover:border-[var(--text-muted)]"
              }`}
            >
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-white" />
              )}
            </span>
            <span className="text-[10px] text-[var(--text-muted)] shrink-0 font-mono">{v}</span>
            <span
              className={`text-sm truncate transition-colors ${
                isActive
                  ? "text-[var(--text)] font-semibold"
                  : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
              }`}
            >
              {text}
            </span>
          </button>
        );
      })}
    </div>
  );
}
