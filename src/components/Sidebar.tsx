"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", icon: "⬛" },
  { href: "/prospects", label: "Prospects", icon: "◈" },
  { href: "/upload", label: "Upload CSV", icon: "↑" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-[#111118] border-r border-[#1f1f2e] flex flex-col z-50">
      <div className="px-5 py-6 border-b border-[#1f1f2e]">
        <span className="text-white font-semibold text-sm tracking-widest uppercase">
          Unlockd
        </span>
        <p className="text-zinc-500 text-xs mt-0.5">Outreach</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:text-white hover:bg-[#1a1a28]"
              }`}
            >
              <span className="text-xs">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-[#1f1f2e]">
        <p className="text-zinc-600 text-xs">unlockd.art</p>
      </div>
    </aside>
  );
}
