"use client";

import { useState } from "react";

interface SettingField {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
  hint?: string;
}

const FIELDS: SettingField[] = [
  {
    key: "DATABASE_URL",
    label: "Database URL",
    placeholder: "postgresql://...",
    type: "password",
    hint: "Supabase connection string",
  },
  {
    key: "DIRECT_URL",
    label: "Direct URL",
    placeholder: "postgresql://...",
    type: "password",
    hint: "Supabase direct connection (za migracije)",
  },
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic API Key",
    placeholder: "sk-ant-...",
    type: "password",
    hint: "Za generisanje email sadržaja s Claude",
  },
  {
    key: "RESEND_API_KEY",
    label: "Resend API Key",
    placeholder: "re_...",
    type: "password",
    hint: "Za slanje emailova",
  },
  {
    key: "FROM_EMAIL",
    label: "From Email",
    placeholder: "temim@unlockd.art",
    type: "email",
    hint: "Email adresa s koje se šalju poruke",
  },
];

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Konfiguracija API ključeva i sistema
        </p>
      </div>

      <div className="rounded-xl bg-[#111118] border border-[#1f1f2e] divide-y divide-[#1f1f2e]">
        {FIELDS.map(({ key, label, placeholder, type = "text", hint }) => (
          <div key={key} className="p-5">
            <label className="block text-sm font-medium text-white mb-1">
              {label}
            </label>
            {hint && <p className="text-zinc-600 text-xs mb-2">{hint}</p>}
            <input
              type={type}
              placeholder={placeholder}
              className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-blue-600 transition-colors font-mono"
            />
          </div>
        ))}
      </div>

      <div className="bg-amber-950/40 border border-amber-800/40 rounded-xl p-4">
        <p className="text-amber-400 text-sm font-medium">Važna napomena</p>
        <p className="text-amber-300/70 text-xs mt-1">
          API ključevi se čuvaju samo lokalno u <code>.env.local</code> fajlu.
          Ova stranica je samo vizualni referens — promjene ovdje ne mijenjaju
          fajl automatski. Edituj <code>.env.local</code> direktno.
        </p>
      </div>

      <button
        onClick={() => setSaved(true)}
        className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
      >
        {saved ? "Sačuvano ✓" : "Sačuvaj"}
      </button>
    </div>
  );
}
