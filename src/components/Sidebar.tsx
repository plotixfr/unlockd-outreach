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

const PRIMARY_NAV = [
  { href: "/",          label: "Dashboard",  Icon: LayoutDashboard },
  { href: "/autopilot", label: "Autopilot",  Icon: Sparkles },
  { href: "/prospects", label: "Prospects",  Icon: Users },
  { href: "/pipeline",  label: "Pipeline",   Icon: GitBranch },
] as const;

const ANALYSIS_NAV = [
  { href: "/insights", label: "Insights", Icon: BarChart3 },
  { href: "/revenue",  label: "Revenue",  Icon: DollarSign },
] as const;

const TOOLS_NAV = [
  { href: "/upload",   label: "Import",   Icon: Upload },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

type NavItem = (typeof PRIMARY_NAV)[number] | (typeof ANALYSIS_NAV)[number] | (typeof TOOLS_NAV)[number];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", redirect: "manual" });
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-[var(--bg-elev-1)] border-r border-[var(--border-1)] flex flex-col z-50">
      {/* Brand */}
      <div className="px-5 pt-6 pb-7 border-b border-[var(--border-1)]">
        <Link href="/" className="flex items-center gap-2.5 group">
          <LogoMark size={28} className="transition-transform group-hover:scale-105" />
          <div className="leading-none">
            <p className="text-gradient-brand text-[16px] font-extrabold tracking-tight">
              {BRAND.name}
            </p>
            <p className="text-[var(--text-faint)] text-[9px] mt-1.5 tracking-[0.24em] uppercase font-bold">
              {BRAND.shortTagline}
            </p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-5 space-y-6 overflow-y-auto">
        <NavGroup items={PRIMARY_NAV as unknown as NavItem[]} pathname={pathname} />
        <NavGroup label="Analysis" items={ANALYSIS_NAV as unknown as NavItem[]} pathname={pathname} />
        <NavGroup label="Tools" items={TOOLS_NAV as unknown as NavItem[]} pathname={pathname} />
      </nav>

      {/* User footer */}
      <div className="px-3 pt-3 pb-4 border-t border-[var(--border-1)]">
        <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
          <div className="w-8 h-8 rounded-md bg-gradient-to-br from-emerald-700 to-emerald-900 flex items-center justify-center text-emerald-100 text-xs font-extrabold ring-1 ring-emerald-500/25 shadow-md shadow-emerald-500/10">
            T
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[var(--text)] text-xs font-bold truncate">Temim Turkusic</p>
            <p className="text-[var(--text-faint)] text-[10px] truncate uppercase tracking-wider font-semibold">Workspace owner</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-sm text-[12.5px] text-[var(--text-dim)] hover:text-rose-300 hover:bg-rose-500/[0.05] transition-colors font-semibold"
        >
          <LogOut strokeWidth={1.75} className="w-[16px] h-[16px]" />
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
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="space-y-1">
      {label && (
        <p className="px-3 mb-2 text-[var(--text-faint)] text-[9.5px] uppercase tracking-[0.18em] font-bold">
          {label}
        </p>
      )}
      {items.map(({ href, label: itemLabel, Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`group flex items-center gap-3 px-3 py-2.5 rounded-sm text-[13px] font-semibold transition-all relative ${
              active
                ? "bg-emerald-500/[0.08] text-white shadow-[inset_2px_0_0_var(--accent)]"
                : "text-[var(--text-muted)] hover:text-white hover:bg-white/[0.025]"
            }`}
          >
            <Icon
              strokeWidth={active ? 2 : 1.75}
              className={`w-[16px] h-[16px] transition-colors ${
                active ? "text-emerald-400" : "text-[var(--text-dim)] group-hover:text-[var(--text-muted)]"
              }`}
            />
            <span className="flex-1">{itemLabel}</span>
          </Link>
        );
      })}
    </div>
  );
}
