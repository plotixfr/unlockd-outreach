"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  subject: string;
  body: string;
  tip: string;
  prospectEmail: string;
  fromEmail: string;
}

const TIP_LABELS: Record<string, string> = {
  initial: "Email #1 — Initial",
  follow1: "Email #2 — Follow-up",
  follow2: "Email #3 — Social proof",
  follow3: "Email #4 — Final",
};

export function EmailPreviewButton({ subject, body, tip, prospectEmail, fromEmail }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium px-2 py-1 rounded-lg bg-white border border-[var(--border)] text-[var(--text-secondary)] hover:bg-zinc-50 hover:text-[var(--text)] hover:border-[var(--border-strong)] transition-colors"
      >
        Preview
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="bg-white border border-[var(--border)] rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Mail header */}
              <div className="border-b border-gray-100 px-6 py-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {TIP_LABELS[tip] ?? tip}
                  </span>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
                  >
                    ✕ Close
                  </button>
                </div>
                <h2 className="text-gray-900 font-semibold text-base">{subject}</h2>
                <div className="space-y-1 text-xs text-gray-500">
                  <div>
                    <span className="text-gray-400 w-12 inline-block">From:</span>
                    <span className="text-gray-700">{fromEmail}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 w-12 inline-block">To:</span>
                    <span className="text-gray-700">{prospectEmail}</span>
                  </div>
                </div>
              </div>

              {/* Mail body */}
              <div className="flex-1 overflow-y-auto px-8 py-6">
                <div
                  className="text-gray-800 text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: body }}
                />
                <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400">
                  <em>
                    [Tracking pixel + unsubscribe link are added at send time]
                  </em>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
