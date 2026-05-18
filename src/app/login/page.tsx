"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, User } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Pogrešni kredencijali");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Greška");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07070b] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(99, 102, 241, 0.18), transparent 60%), radial-gradient(ellipse 40% 30% at 20% 100%, rgba(167, 139, 250, 0.08), transparent 60%)",
        }}
      />

      <div className="relative w-full max-w-sm space-y-8">
        {/* Brand */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 mb-4 shadow-xl shadow-indigo-500/30">
            <span className="text-white font-bold text-lg tracking-tighter">U</span>
          </div>
          <p className="text-gradient-brand text-xl font-semibold tracking-tight">Unlockd</p>
          <p className="text-zinc-500 text-xs mt-1 tracking-[0.18em] uppercase font-medium">Outreach Studio</p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-gradient-to-br from-[#0e0e16] to-[#0a0a12] border border-[#1c1c28] p-7 space-y-5 card-elevation"
        >
          <div>
            <h1 className="text-white font-semibold text-lg tracking-tight">Prijava</h1>
            <p className="text-zinc-500 text-xs mt-1">Unesi pristup u sistem.</p>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-zinc-500 text-[10px] uppercase tracking-widest font-medium mb-1.5">
                Username
              </label>
              <div className="relative">
                <User strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  autoFocus
                  className="w-full bg-[#07070b] border border-[#1c1c28] rounded-lg pl-10 pr-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-indigo-500/50 focus:bg-[#0a0a12] transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-zinc-500 text-[10px] uppercase tracking-widest font-medium mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full bg-[#07070b] border border-[#1c1c28] rounded-lg pl-10 pr-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-indigo-500/50 focus:bg-[#0a0a12] transition-colors"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
              <p className="text-red-300 text-xs">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/30 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Prijavljujem…" : "Prijavi se"}
          </button>
        </form>

        <p className="text-center text-zinc-700 text-[11px]">
          © Unlockd.art {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
