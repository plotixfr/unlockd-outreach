"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight, Sparkles, BarChart3, Mail } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { BRAND } from "@/lib/brand";

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
      if (!res.ok) throw new Error(data.error || "Invalid credentials");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07070a] flex relative overflow-hidden">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 75% 0%, rgba(16, 185, 129, 0.14), transparent 60%), radial-gradient(ellipse 40% 30% at 15% 100%, rgba(245, 158, 11, 0.06), transparent 60%)",
        }}
      />

      {/* Left — brand panel (hidden on mobile) */}
      <div className="hidden lg:flex relative flex-1 flex-col justify-between p-12 border-r border-[#15151c]">
        <div className="flex items-center gap-3">
          <LogoMark size={32} />
          <div>
            <p className="text-gradient-brand text-xl font-semibold tracking-tight leading-none">
              {BRAND.name}
            </p>
            <p className="text-zinc-600 text-[10.5px] mt-1.5 tracking-[0.22em] uppercase font-medium">
              {BRAND.shortTagline}
            </p>
          </div>
        </div>

        <div className="space-y-6 max-w-md">
          <h1
            className="text-white text-5xl tracking-tight leading-[1.05] display-number"
          >
            Outbound, on{" "}
            <span className="text-gradient-accent italic">autopilot.</span>
          </h1>
          <p className="text-zinc-500 text-sm leading-relaxed max-w-sm">
            Discover, qualify, and convert cold prospects without lifting a finger. Salvo runs
            your pipeline end-to-end while you focus on closing.
          </p>

          <div className="pt-6 grid grid-cols-1 gap-3 max-w-sm">
            <FeatureRow
              Icon={Sparkles}
              title="Discover daily"
              body="Auto-scanned prospects, qualified by AI, scheduled at peak send hours."
            />
            <FeatureRow
              Icon={Mail}
              title="Send & follow up"
              body="Threaded sequences and one-click nudges keep every lead warm."
            />
            <FeatureRow
              Icon={BarChart3}
              title="See what works"
              body="Per-niche conversion, revenue forecast, and replyable insights."
            />
          </div>
        </div>

        <p className="text-zinc-700 text-[11px]">
          © {BRAND.copyrightHolder} {new Date().getFullYear()}
        </p>
      </div>

      {/* Right — sign-in form */}
      <div className="relative flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-10 flex items-center gap-2.5">
            <LogoMark size={28} />
            <p className="text-gradient-brand text-lg font-semibold tracking-tight">{BRAND.name}</p>
          </div>

          <div className="mb-8">
            <h2 className="text-white text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="text-zinc-500 text-sm mt-1.5">Sign in to your workspace.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-zinc-400 text-[11px] uppercase tracking-[0.12em] font-medium mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                autoFocus
                className="w-full bg-[#0c0c11] border border-[#20202c] rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 focus:bg-[#10101a] transition-colors"
              />
            </div>

            <div>
              <label className="block text-zinc-400 text-[11px] uppercase tracking-[0.12em] font-medium mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-[#0c0c11] border border-[#20202c] rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-emerald-500/50 focus:bg-[#10101a] transition-colors"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2">
                <p className="text-rose-300 text-xs">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-emerald-950 text-sm font-semibold py-2.5 rounded-lg transition-all shadow-[0_8px_24px_-10px_rgba(16,185,129,0.45)] flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  Sign in <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <p className="lg:hidden text-center text-zinc-700 text-[11px] mt-10">
            © {BRAND.copyrightHolder} {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({
  Icon,
  title,
  body,
}: {
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
        <Icon strokeWidth={1.75} className="w-4 h-4 text-emerald-400" />
      </div>
      <div>
        <p className="text-zinc-200 text-[13px] font-medium">{title}</p>
        <p className="text-zinc-500 text-[12.5px] leading-relaxed mt-0.5">{body}</p>
      </div>
    </div>
  );
}
