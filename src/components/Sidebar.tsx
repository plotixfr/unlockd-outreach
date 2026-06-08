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
  DollarSign,
  Settings,
  LogOut,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { BRAND } from "@/lib/brand";

const PRIMARY_NAV: { href: string; label: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }[] = [
  { href: "/",          label: "Dashboard",  Icon: LayoutDashboard },
  { href: "/autopilot", label: "Autopilot",  Icon: Sparkles },
  { href: "/prospects", label: "Prospects",  Icon: Users },
  { href: "/pipeline",  label: "Pipeline",   Icon: GitBranch },
];

const ANALYSIS_NAV: typeof PRIMARY_NAV = [
  { href: "/insights",  label: "Insights",  Icon: BarChart3 },
  { href: "/revenue",   label: "Revenue",   Icon: DollarSign },
];

const TOOLS_NAV: typeof PRIMARY_NAV = [
  { href: "/upload",    label: "Import",    Icon: Upload },
  { href: "/settings",  label: "Settings",  Icon: Settings },
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
    <aside className="fixed left-0 top-0 h-screen w-60 bg-[#08080c] border-r border-[#1a1a24] flex flex-col z-50">
      {/* Brand */}
      <div className="px-5 pt-6 pb-6">
        <Link href="/" className="flex items-center gap-2.5 group">
          <LogoMark size={26} className="transition-transform group-hover:scale-105" />
          <div className="leading-none">
            <p className="text-gradient-brand text-[15px] font-semibold tracking-tight">
              {BRAND.name}
            </p>
            <p className="text-zinc-600 text-[9.5px] mt-1 tracking-[0.22em] uppercase font-medium">
              {BRAND.shortTagline}
            </p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-5 overflow-y-auto">
        <NavGroup items={PRIMARY_NAV} pathname={pathname} />
        <NavGroup label="Analysis" items={ANALYSIS_NAV} pathname={pathname} />
        <NavGroup label="Tools" items={TOOLS_NAV} pathname={pathname} />
      </nav>

      {/* User footer */}
      <div className="px-3 pb-4 pt-3 border-t border-[#14141c]">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 flex items-center justify-center text-emerald-200 text-xs font-semibold ring-1 ring-emerald-500/20">
            T
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-zinc-200 text-xs font-medium truncate">Temim Turkusic</p>
            <p className="text-zinc-600 text-[10px] truncate">Workspace owner</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[12.5px] text-zinc-500 hover:text-rose-400 hover:bg-white/[0.03] transition-colors"
        >
          <LogOut strokeWidth={1.75} className="w-[17px] h-[17px]" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

function NavGroup({
  label,
  items,
  pathname,
}: {
  label?: string;
  items: typeof PRIMARY_NAV;
  pathname: string;
}) {
  return (
    <div className="space-y-0.5">
      {label && (
        <p className="px-3 mb-1.5 text-zinc-600 text-[9.5px] uppercase tracking-[0.16em] font-semibold">
          {label}
        </p>
      )}
      {items.map(({ href, label: itemLabel, Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
              active
                ? "bg-emerald-500/10 text-white shadow-[inset_1.5px_0_0_rgb(16,185,129)]"
                : "text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.03]"
            }`}
          >
            <Icon
              strokeWidth={active ? 2 : 1.75}
              className={`w-[17px] h-[17px] transition-colors ${
                active ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300"
              }`}
            />
            <span className="flex-1">{itemLabel}</span>
          </Link>
        );
      })}
    </div>
  );
}
