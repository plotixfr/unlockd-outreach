/**
 * Salvo logomark. Two abstract chevrons stacked — reads as both an "S"
 * silhouette and as an upward outbound trajectory. Emerald gradient deep
 * enough to hold contrast on white surfaces; also reads on dark embeds.
 */

import { BRAND } from "@/lib/brand";

export function LogoMark({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="salvoMark" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="24" height="24" rx="6" fill="url(#salvoMark)" />
      {/* Upward chevron — "outbound" trajectory */}
      <path
        d="M6.5 14.5 L12 9 L17.5 14.5"
        stroke="#03261b"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Echo chevron beneath — signal repeats */}
      <path
        d="M8 18 L12 14 L16 18"
        stroke="#03261b"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
    </svg>
  );
}

export function LogoLockup({
  size = 24,
  showTagline = false,
  className = "",
}: {
  size?: number;
  showTagline?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <div className="leading-none">
        <p className="text-gradient-brand text-[15px] font-semibold tracking-tight">{BRAND.name}</p>
        {showTagline && (
          <p className="text-zinc-600 text-[10px] mt-1 tracking-[0.18em] uppercase font-medium">
            {BRAND.shortTagline}
          </p>
        )}
      </div>
    </div>
  );
}
