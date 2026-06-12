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

const OVERVIEW_NAV = [
  { href: "/",          label: "Dashboard", Icon: LayoutDashboard },
  { href: "/autopilot", label: "Autopilot", Icon: Sparkles },
] as const;

const PIPELINE_NAV = [
  { href: "/prospects", label: "Prospects", Icon: Users },
  { href: "/pipeline",  label: "Deals",     Icon: GitBranch },
] as const;

const INSIGHTS_NAV = [
  { href: "/insights", label: "Analytics", Icon: BarChart3 },
  { href: "/revenue",  label: "Revenue",   Icon: DollarSign },
] as const;

const SYSTEM_NAV = [
  { href: "/upload",   label: "Import",   Icon: Upload },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

type NavItem =
  | (typeof OVERVIEW_NAV)[number]
  | (typeof PIPELINE_NAV)[number]
  | (typeof INSIGHTS_NAV)[number]
  | (typeof SYSTEM_NAV)[number];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", redirect: "manual" });
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-white border-r border-[var(--border)] flex flex-col z-50">
      {/* Brand */}
      <div className="px-5 pt-6 pb-6 border-b border-[var(--border)]">
        <Link href="/" className="flex items-center gap-2.5 group">
          <LogoMark size={28} className="transition-transform group-hover:scale-105" />
          <div className="leading-none">
            <p className="text-[var(--text)] text-[16px] font-extrabold tracking-tight">
              {BRAND.name}
            </p>
            <p className="text-[var(--text-muted)] text-[9px] mt-1.5 tracking-[0.24em] uppercase font-bold">
              {BRAND.shortTagline}
            </p>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-5 space-y-6 overflow-y-auto">
        <NavGroup label="Overview" items={OVERVIEW_NAV as unknown as NavItem[]} pathname={pathname} />
        <NavGroup label="Pipeline" items={PIPELINE_NAV as unknown as NavItem[]} pathname={pathname} />
        <NavGroup label="Insights" items={INSIGHTS_NAV as unknown as NavItem[]} pathname={pathname} />
        <NavGroup label="System" items={SYSTEM_NAV as unknown as NavItem[]} pathname={pathname} />
      </nav>

      {/* User footer */}
      <div className="px-3 pt-3 pb-4 border-t border-[var(--border)]">
        <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
          <div className="w-8 h-8 rounded-md bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent)] text-xs font-extrabold">
            T
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[var(--text)] text-xs font-bold truncate">Temim Turkusic</p>
            <p className="text-[var(--text-muted)] text-[10px] truncate uppercase tracking-wider font-semibold">Workspace owner</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[12.5px] text-[var(--text-secondary)] hover:text-red-600 hover:bg-red-50 transition-colors font-semibold"
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
    <div className="space-y-0.5">
      {label && (
        <p className="px-3 mb-2 text-[var(--text-muted)] text-[10px] uppercase tracking-[0.12em] font-semibold">
          {label}
        </p>
      )}
      {items.map(({ href, label: itemLabel, Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`group flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-semibold transition-colors relative ${
              active
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text)] hover:bg-zinc-50"
            }`}
          >
            <Icon
              strokeWidth={active ? 2 : 1.75}
              className={`w-[16px] h-[16px] transition-colors ${
                active ? "text-[var(--accent)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
              }`}
            />
            <span className="flex-1">{itemLabel}</span>
          </Link>
        );
      })}
    </div>
  );
}
