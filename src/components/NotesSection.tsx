"use client";

import { useState } from "react";

interface Note {
  id: string;
  tekst: string;
  createdAt: Date | string;
}

interface Props {
  prospectId: string;
  initialNotes: Note[];
}

export function NotesSection({ prospectId, initialNotes }: Props) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/prospects/${prospectId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tekst: trimmed }),
      });
      const data = (await res.json()) as { note: Note };
      setNotes((prev) => [data.note, ...prev]);
      setText("");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/prospects/${prospectId}/notes/${id}`, { method: "DELETE" });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      void handleAdd();
    }
  };

  return (
    <div className="space-y-3">
      <h2 className="text-white font-medium">Notes</h2>
      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] p-5 space-y-4">
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a note… (Cmd+Enter to send)"
            rows={2}
            className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-600 transition-colors resize-none"
          />
          <button
            onClick={handleAdd}
            disabled={saving || !text.trim()}
            className="text-sm px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
          >
            {saving ? "Adding..." : "Dodaj"}
          </button>
        </div>

        {notes.length === 0 ? (
          <p className="text-zinc-600 text-sm">No notes yet.</p>
        ) : (
          <div className="space-y-0 divide-y divide-[#1f1f2e]">
            {notes.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-zinc-300 text-sm whitespace-pre-wrap">{n.tekst}</p>
                  <p className="text-zinc-600 text-xs mt-1">
                    {new Date(n.createdAt).toLocaleString("fr-FR")}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(n.id)}
                  disabled={deletingId === n.id}
                  className="text-zinc-600 hover:text-red-400 transition-colors shrink-0 text-lg leading-none disabled:opacity-40 mt-0.5"
                  title="Delete note"
                >
                  {deletingId === n.id ? "…" : "×"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
