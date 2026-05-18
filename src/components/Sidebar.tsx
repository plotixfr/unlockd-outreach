"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  Users,
  GitBranch,
  Upload,
  BarChart3,
  Euro,
  Flame,
  Settings,
  LogOut,
} from "lucide-react";

const NAV: { href: string; label: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { href: "/",          label: "Dashboard",   Icon: LayoutDashboard },
  { href: "/autopilot", label: "Autopilot",   Icon: Sparkles },
  { href: "/prospects", label: "Prospekti",   Icon: Users },
  { href: "/pipeline",  label: "Pipeline",    Icon: GitBranch },
  { href: "/upload",    label: "Upload CSV",  Icon: Upload },
  { href: "/insights",  label: "Analitika",   Icon: BarChart3 },
  { href: "/revenue",   label: "Prihod",      Icon: Euro },
  { href: "/warmup",    label: "Zagrijavanje", Icon: Flame },
  { href: "/settings",  label: "Postavke",    Icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", redirect: "manual" });
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-[#0a0a0f] border-r border-[#1c1c28] flex flex-col z-50">
      {/* Brand */}
      <div className="px-6 pt-7 pb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <span className="text-white font-bold text-xs tracking-tighter">U</span>
          </div>
          <div>
            <p className="text-gradient-brand text-[15px] font-semibold tracking-tight leading-none">Unlockd</p>
            <p className="text-zinc-600 text-[10px] mt-1 tracking-widest uppercase font-medium">Outreach</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {NAV.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-all ${
                active
                  ? "bg-indigo-500/10 text-white shadow-[inset_1px_0_0_rgba(99,102,241,0.5)]"
                  : "text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.03]"
              }`}
            >
              <Icon
                strokeWidth={active ? 2 : 1.75}
                className={`w-[18px] h-[18px] transition-colors ${active ? "text-indigo-400" : "text-zinc-500 group-hover:text-zinc-300"}`}
              />
              <span className="flex-1">{label}</span>
              {active && <span className="w-1 h-1 rounded-full bg-indigo-400" />}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 pb-4 pt-3 border-t border-[#14141c]">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center text-zinc-300 text-xs font-semibold">
            T
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-zinc-200 text-xs font-medium truncate">Temim Turkusic</p>
            <p className="text-zinc-600 text-[10px] truncate">temim@unlockd.art</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-zinc-500 hover:text-red-400 hover:bg-white/[0.03] transition-colors"
        >
          <LogOut strokeWidth={1.75} className="w-[18px] h-[18px]" />
          Odjavi se
        </button>
      </div>
    </aside>
  );
}
