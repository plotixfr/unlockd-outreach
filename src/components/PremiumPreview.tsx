import type { SiteSnapshot } from "@/lib/scrapeSite";
import { buildConceptSpec, type ConceptSpec } from "@/lib/conceptDesign";

interface Props {
  prospectId: string;
  firmaNaziv: string;
  niche: string;
  city: string;
  snapshot: SiteSnapshot | null;
}

/**
 * Premium concept preview for the sales call. Three distinct layouts (chosen
 * stably per prospect via a hash so the same prospect always gets the same
 * variant, but different prospects feel different):
 *
 *   - cinematic — full-bleed background image, large serif title overlay
 *   - editorial — split-screen text/image like a fashion magazine
 *   - minimal — small hero, dominant image grid below
 *
 * Layout, palette, and curated photography are all keyed off the prospect id.
 * Typography mixes Cormorant Garamond (serif display) with Geist Sans for
 * structural text — the same vocabulary luxury brands use online.
 */
export function PremiumPreview({ prospectId, firmaNaziv, niche, city, snapshot }: Props) {
  const spec = buildConceptSpec({ id: prospectId, firmaNaziv, niche, city, snapshot });

  return (
    <div className="rounded-xl overflow-hidden border border-[#1c1c28]">
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#1c1c28] bg-[#070709]">
        <span className="w-2 h-2 rounded-full bg-zinc-700" />
        <span className="w-2 h-2 rounded-full bg-zinc-700" />
        <span className="w-2 h-2 rounded-full bg-zinc-700" />
        <span className="ml-3 text-zinc-600 text-[10px] tracking-widest uppercase truncate">
          aperçu — {firmaNaziv.toLowerCase().replace(/\s+/g, "")}
        </span>
        <span className="ml-auto text-zinc-700 text-[10px] tracking-widest uppercase">
          {spec.variant} · {spec.palette.name}
        </span>
      </div>

      {spec.variant === "cinematic" && <CinematicLayout firmaNaziv={firmaNaziv} spec={spec} />}
      {spec.variant === "editorial" && <EditorialLayout firmaNaziv={firmaNaziv} spec={spec} />}
      {spec.variant === "minimal" && <MinimalLayout firmaNaziv={firmaNaziv} spec={spec} />}
    </div>
  );
}

/* ───────────────── LAYOUT VARIANT 1: CINEMATIC ───────────────── */
function CinematicLayout({ firmaNaziv, spec }: { firmaNaziv: string; spec: ConceptSpec }) {
  const { palette, heroImageUrl, copy } = spec;
  return (
    <div style={{ backgroundColor: palette.bg, color: palette.fg, fontFamily: "var(--font-geist-sans)" }}>
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-20 px-10 py-6 flex items-center justify-between text-[11px] uppercase tracking-[0.22em]">
        <span style={{ fontFamily: "var(--font-display-serif)", fontSize: 18, letterSpacing: "0.01em", fontWeight: 500 }}>
          {firmaNaziv}
        </span>
        <nav className="hidden sm:flex gap-7" style={{ color: palette.fgMuted }}>
          <span>Maison</span>
          <span>Univers</span>
          <span>Contact</span>
        </nav>
        <span className="text-[10px] px-3 py-1.5 border" style={{ borderColor: palette.accent, color: palette.accent }}>
          {copy.ctaPrimary}
        </span>
      </header>

      {/* Full-bleed hero */}
      <section className="relative aspect-[16/10] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={heroImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, ${palette.bg}30 0%, transparent 30%, transparent 50%, ${palette.bg}cc 100%)`,
          }}
        />
        <div className="absolute inset-x-0 bottom-0 px-10 pb-14">
          <p
            className="text-[10px] uppercase tracking-[0.32em] mb-5"
            style={{ color: palette.accent, fontWeight: 500 }}
          >
            {copy.eyebrow}
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display-serif)",
              fontWeight: 400,
              fontSize: "clamp(36px, 5vw, 64px)",
              lineHeight: 1.02,
              letterSpacing: "-0.015em",
              maxWidth: "12ch",
            }}
          >
            {copy.headline}
          </h1>
          <p style={{ color: palette.fgMuted, marginTop: 18, fontSize: 15, maxWidth: 460, lineHeight: 1.5 }}>
            {copy.tagline}
          </p>
        </div>
      </section>

      {/* Quote / philosophy band */}
      <section className="px-10 py-16 grid grid-cols-1 sm:grid-cols-[1fr,1px,1fr] gap-10 items-center border-t" style={{ borderColor: `${palette.fgMuted}20` }}>
        <p
          style={{
            fontFamily: "var(--font-display-serif)",
            fontStyle: "italic",
            fontSize: 26,
            lineHeight: 1.4,
            color: palette.fg,
            fontWeight: 400,
          }}
        >
          « {copy.tagline} »
        </p>
        <div className="hidden sm:block w-px h-16" style={{ backgroundColor: `${palette.fgMuted}40` }} />
        <div className="text-[12px]" style={{ color: palette.fgMuted, lineHeight: 1.7 }}>
          <p style={{ color: palette.fg, fontWeight: 500, marginBottom: 8 }}>{firmaNaziv}</p>
          <p>{copy.eyebrow}</p>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="px-10 py-8 border-t flex items-center justify-between text-[10px] uppercase tracking-[0.25em]"
        style={{ borderColor: `${palette.fgMuted}20`, color: palette.fgMuted }}
      >
        <span>{firmaNaziv}</span>
        <span style={{ color: palette.accent }}>{copy.ctaPrimary} →</span>
      </footer>
    </div>
  );
}

/* ───────────────── LAYOUT VARIANT 2: EDITORIAL SPLIT ───────────────── */
function EditorialLayout({ firmaNaziv, spec }: { firmaNaziv: string; spec: ConceptSpec }) {
  const { palette, heroImageUrl, secondaryImageUrl, copy } = spec;
  return (
    <div style={{ backgroundColor: palette.bg, color: palette.fg, fontFamily: "var(--font-geist-sans)" }}>
      {/* Header */}
      <header className="px-8 py-6 flex items-center justify-between text-[11px] uppercase tracking-[0.22em] border-b" style={{ borderColor: `${palette.fgMuted}20` }}>
        <span style={{ fontFamily: "var(--font-display-serif)", fontSize: 18, fontWeight: 500 }}>{firmaNaziv}</span>
        <nav className="hidden sm:flex gap-6" style={{ color: palette.fgMuted }}>
          <span>Maison</span>
          <span>Univers</span>
          <span>Journal</span>
          <span>Contact</span>
        </nav>
      </header>

      {/* Split hero */}
      <section className="grid grid-cols-1 md:grid-cols-2">
        <div className="p-10 sm:p-14 flex flex-col justify-center min-h-[420px]">
          <p
            className="text-[10px] uppercase tracking-[0.32em] mb-6"
            style={{ color: palette.accent, fontWeight: 500 }}
          >
            {copy.eyebrow}
          </p>
          <h1
            style={{
              fontFamily: "var(--font-display-serif)",
              fontWeight: 400,
              fontSize: "clamp(34px, 4.2vw, 56px)",
              lineHeight: 1.05,
              letterSpacing: "-0.015em",
            }}
          >
            {copy.headline}
          </h1>
          <p style={{ color: palette.fgMuted, marginTop: 22, fontSize: 15, lineHeight: 1.6, maxWidth: 420 }}>
            {copy.tagline}
          </p>
          <div className="flex items-center gap-3 mt-9">
            <span
              className="inline-flex items-center px-5 py-2.5 text-[11px] uppercase tracking-[0.22em]"
              style={{ backgroundColor: palette.accent, color: palette.bg, fontWeight: 600 }}
            >
              {copy.ctaPrimary} →
            </span>
            <span
              className="inline-flex items-center px-5 py-2.5 text-[11px] uppercase tracking-[0.22em] border"
              style={{ borderColor: `${palette.fgMuted}50`, color: palette.fg }}
            >
              {copy.ctaSecondary}
            </span>
          </div>
        </div>

        <div className="relative overflow-hidden min-h-[420px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        </div>
      </section>

      {/* Numbered editorial sections */}
      <section className="px-8 sm:px-14 py-16 border-t" style={{ borderColor: `${palette.fgMuted}20` }}>
        <p className="text-[10px] uppercase tracking-[0.32em] mb-10" style={{ color: palette.accent, fontWeight: 500 }}>
          Le journal
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {copy.sections.map((s, i) => (
            <div key={i}>
              <p
                className="text-[10px] tracking-[0.32em] tabular-nums mb-3"
                style={{ color: palette.fgMuted, fontWeight: 500 }}
              >
                — {s.label}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-display-serif)",
                  fontSize: 22,
                  lineHeight: 1.25,
                  color: palette.fg,
                  fontWeight: 400,
                }}
              >
                {s.title}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Secondary image */}
      <section className="relative overflow-hidden aspect-[21/9]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={secondaryImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      </section>

      <footer
        className="px-8 py-6 border-t flex items-center justify-between text-[10px] uppercase tracking-[0.25em]"
        style={{ borderColor: `${palette.fgMuted}20`, color: palette.fgMuted }}
      >
        <span>{firmaNaziv}</span>
        <span>© {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}

/* ───────────────── LAYOUT VARIANT 3: MINIMAL GRID ───────────────── */
function MinimalLayout({ firmaNaziv, spec }: { firmaNaziv: string; spec: ConceptSpec }) {
  const { palette, heroImageUrl, secondaryImageUrl, copy } = spec;
  return (
    <div style={{ backgroundColor: palette.bg, color: palette.fg, fontFamily: "var(--font-geist-sans)" }}>
      <header className="px-10 py-7 flex items-center justify-between text-[11px] uppercase tracking-[0.28em]">
        <span style={{ fontFamily: "var(--font-display-serif)", fontSize: 17, fontWeight: 500 }}>{firmaNaziv}</span>
        <span style={{ color: palette.fgMuted }}>{copy.eyebrow}</span>
      </header>

      {/* Centered hero — text only, large */}
      <section className="px-10 py-20 sm:py-28 text-center">
        <p
          className="text-[10px] uppercase tracking-[0.4em] mb-8"
          style={{ color: palette.accent, fontWeight: 500 }}
        >
          {String(new Date().getFullYear())} · {firmaNaziv}
        </p>
        <h1
          style={{
            fontFamily: "var(--font-display-serif)",
            fontWeight: 400,
            fontSize: "clamp(40px, 6vw, 80px)",
            lineHeight: 1.0,
            letterSpacing: "-0.025em",
            maxWidth: "16ch",
            margin: "0 auto",
          }}
        >
          {copy.headline}
        </h1>
        <p
          className="mx-auto"
          style={{ color: palette.fgMuted, marginTop: 26, fontSize: 16, lineHeight: 1.55, maxWidth: 500 }}
        >
          {copy.tagline}
        </p>
        <p className="mt-12 inline-flex items-center gap-3 text-[10px] uppercase tracking-[0.32em]" style={{ color: palette.accent, fontWeight: 600 }}>
          <span className="w-8 h-px" style={{ backgroundColor: palette.accent }} />
          {copy.ctaPrimary}
          <span className="w-8 h-px" style={{ backgroundColor: palette.accent }} />
        </p>
      </section>

      {/* Dominant image grid */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-1">
        <div className="aspect-[3/4] overflow-hidden relative sm:col-span-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        </div>
        <div className="aspect-[3/4] overflow-hidden relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={secondaryImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        </div>
      </section>

      {/* Numbered services strip */}
      <section className="px-10 py-14 grid grid-cols-1 sm:grid-cols-3 gap-8 border-t" style={{ borderColor: `${palette.fgMuted}20` }}>
        {copy.sections.map((s, i) => (
          <div key={i} className="flex items-start gap-4">
            <span
              className="text-[10px] tabular-nums mt-1 shrink-0"
              style={{ color: palette.accent, fontWeight: 600, letterSpacing: "0.1em" }}
            >
              {s.label}
            </span>
            <p style={{ fontFamily: "var(--font-display-serif)", fontSize: 20, lineHeight: 1.25, fontWeight: 400 }}>
              {s.title}
            </p>
          </div>
        ))}
      </section>

      <footer
        className="px-10 py-8 border-t flex items-center justify-between text-[10px] uppercase tracking-[0.3em]"
        style={{ borderColor: `${palette.fgMuted}20`, color: palette.fgMuted }}
      >
        <span>{firmaNaziv}</span>
        <span style={{ color: palette.accent }}>{copy.ctaSecondary} →</span>
      </footer>
    </div>
  );
}
