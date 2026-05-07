"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <span className="text-white font-semibold text-sm tracking-widest uppercase">
            Unlockd
          </span>
          <p className="text-zinc-500 text-xs mt-0.5">Outreach Studio</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#111118] border border-[#1f1f2e] rounded-xl p-6 space-y-4"
        >
          <h1 className="text-white font-semibold">Prijava</h1>

          <div>
            <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-600 transition-colors"
            />
          </div>

          <div>
            <label className="block text-zinc-400 text-xs uppercase tracking-wider mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-600 transition-colors"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading && (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {loading ? "Prijavljujem..." : "Prijavi se"}
          </button>
        </form>
      </div>
    </div>
  );
}
