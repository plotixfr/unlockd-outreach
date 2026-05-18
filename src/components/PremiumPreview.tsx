import type { SiteSnapshot } from "@/lib/scrapeSite";

interface Props {
  firmaNaziv: string;
  niche: string;
  city: string;
  snapshot: SiteSnapshot | null;
}

/**
 * Server-rendered "what your site could look like" preview. Uses the prospect's
 * own scraped content — title, H1, meta description, og:image, H2s — placed
 * into a premium editorial template so the operator can share-screen during
 * the sales call and say: "This is your content, presented at the level a
 * brand of your stature deserves."
 *
 * No image generation API required. The visual lift comes from the layout +
 * typography + composition, not from a generated moodboard. Crucially, the
 * prospect recognises their own words and brand identity in the preview,
 * which is more convincing than an AI render that bears no resemblance.
 */

interface NicheStyling {
  primaryCta: string;
  secondaryCta: string;
  fallbackTagline: string;
  fallbackImageQuery: string;
  accent: string;
  accentSoft: string;
}

function nicheStyling(niche: string): NicheStyling {
  const n = niche.toLowerCase();
  if (n.includes("hotel") || n.includes("hôtel")) {
    return {
      primaryCta: "Réserver",
      secondaryCta: "Découvrir l'établissement",
      fallbackTagline: "L'art de l'hospitalité, repensé.",
      fallbackImageQuery: "luxury,hotel,interior",
      accent: "#c9a87c",
      accentSoft: "rgba(201, 168, 124, 0.15)",
    };
  }
  if (n.includes("restaurant") || n.includes("gastro") || n.includes("patisserie")) {
    return {
      primaryCta: "Réserver une table",
      secondaryCta: "Voir la carte",
      fallbackTagline: "Une cuisine d'auteur, une expérience inoubliable.",
      fallbackImageQuery: "gastronomic,restaurant,dish",
      accent: "#a17a3a",
      accentSoft: "rgba(161, 122, 58, 0.15)",
    };
  }
  if (n.includes("immobil") || n.includes("property") || n.includes("agence immobilière")) {
    return {
      primaryCta: "Voir nos biens",
      secondaryCta: "Estimation gratuite",
      fallbackTagline: "L'immobilier d'exception, sans concession.",
      fallbackImageQuery: "luxury,villa,real-estate",
      accent: "#8da06b",
      accentSoft: "rgba(141, 160, 107, 0.15)",
    };
  }
  if (n.includes("architect")) {
    return {
      primaryCta: "Découvrir nos projets",
      secondaryCta: "Nous contacter",
      fallbackTagline: "L'architecture comme art de vivre.",
      fallbackImageQuery: "modern,architecture,building",
      accent: "#9aa3aa",
      accentSoft: "rgba(154, 163, 170, 0.15)",
    };
  }
  if (n.includes("spa") || n.includes("wellness")) {
    return {
      primaryCta: "Réserver un soin",
      secondaryCta: "Découvrir les rituels",
      fallbackTagline: "Le luxe du temps retrouvé.",
      fallbackImageQuery: "spa,wellness,minimal",
      accent: "#b69eba",
      accentSoft: "rgba(182, 158, 186, 0.15)",
    };
  }
  if (n.includes("bijou") || n.includes("jewel") || n.includes("galerie")) {
    return {
      primaryCta: "Découvrir la collection",
      secondaryCta: "Prendre rendez-vous",
      fallbackTagline: "Des pièces qui traversent les générations.",
      fallbackImageQuery: "jewelry,luxury,minimalist",
      accent: "#c4a55a",
      accentSoft: "rgba(196, 165, 90, 0.15)",
    };
  }
  return {
    primaryCta: "Découvrir",
    secondaryCta: "Nous contacter",
    fallbackTagline: "Une présence digitale à la hauteur de votre marque.",
    fallbackImageQuery: "luxury,minimal,editorial",
    accent: "#b8945a",
    accentSoft: "rgba(184, 148, 90, 0.15)",
  };
}

/**
 * Tries to land on a serviceable hero image. Priority:
 *   1. The prospect's own og:image (when scraped)
 *   2. A niche-matched Unsplash editorial image (stable URL via collections)
 * Returns null only when both fail — in that case we render a gradient hero.
 */
function pickHeroImage(snapshot: SiteSnapshot | null, niche: string): string | null {
  if (snapshot?.ogImage && /^https?:\/\//.test(snapshot.ogImage)) {
    return snapshot.ogImage;
  }
  const styling = nicheStyling(niche);
  // Unsplash Source supports keyword queries; the URL is stable per page
  // (browser may cache) but rotates over time across users.
  return `https://source.unsplash.com/1200x600/?${encodeURIComponent(styling.fallbackImageQuery)}`;
}

export function PremiumPreview({ firmaNaziv, niche, city, snapshot }: Props) {
  const styling = nicheStyling(niche);
  const heroImage = pickHeroImage(snapshot, niche);
  const headline = snapshot?.h1 || snapshot?.title || firmaNaziv;
  const tagline =
    snapshot?.metaDescription || snapshot?.ogDescription || styling.fallbackTagline;
  const h2s = (snapshot?.h2s ?? []).slice(0, 3);

  return (
    <div
      className="rounded-xl overflow-hidden border border-[#1c1c28] bg-[#0a0a0e]"
      style={{
        // Scoped font + base styles so this preview reads as a website, not as
        // dashboard chrome.
        fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* Fake browser chrome — sells the "this is what your site could look like" feel */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#1c1c28] bg-[#070709]">
        <span className="w-2 h-2 rounded-full bg-zinc-700" />
        <span className="w-2 h-2 rounded-full bg-zinc-700" />
        <span className="w-2 h-2 rounded-full bg-zinc-700" />
        <span className="ml-3 text-zinc-600 text-[10px] tracking-widest uppercase">
          aperçu — {firmaNaziv.toLowerCase().replace(/\s+/g, "")}.fr
        </span>
      </div>

      {/* Header */}
      <header className="px-8 py-5 flex items-center justify-between text-[11px] uppercase tracking-[0.18em]">
        <span className="text-white font-semibold">{firmaNaziv}</span>
        <nav className="hidden sm:flex gap-6 text-zinc-400">
          <span>Accueil</span>
          <span>Découvrir</span>
          <span>Contact</span>
        </nav>
        <span
          className="text-[10px] px-2.5 py-1 rounded-md border"
          style={{ borderColor: styling.accent, color: styling.accent }}
        >
          {styling.primaryCta}
        </span>
      </header>

      {/* Hero */}
      <section className="relative px-8 py-16 sm:py-24 overflow-hidden">
        {/* Background image */}
        {heroImage && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-40"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0e]/40 via-[#0a0a0e]/60 to-[#0a0a0e]" />
          </>
        )}
        {!heroImage && (
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at top, ${styling.accentSoft}, transparent 70%), linear-gradient(180deg, transparent, #0a0a0e)`,
            }}
          />
        )}

        <div className="relative max-w-2xl">
          <p
            className="text-[10px] uppercase tracking-[0.25em] font-medium mb-4"
            style={{ color: styling.accent }}
          >
            {city}
          </p>
          <h1
            className="text-3xl sm:text-5xl font-semibold tracking-tight text-white leading-[1.05]"
            style={{ fontFamily: 'Georgia, "Tiempos Headline", serif' }}
          >
            {headline}
          </h1>
          <p className="text-zinc-300 text-base mt-5 max-w-lg leading-relaxed">{tagline}</p>
          <div className="flex items-center gap-3 mt-8">
            <span
              className="inline-flex items-center px-5 py-2.5 text-sm font-medium text-[#0a0a0e] rounded-md"
              style={{ backgroundColor: styling.accent }}
            >
              {styling.primaryCta} →
            </span>
            <span className="inline-flex items-center px-5 py-2.5 text-sm font-medium text-zinc-300 border border-zinc-700 rounded-md">
              {styling.secondaryCta}
            </span>
          </div>
        </div>
      </section>

      {/* Features strip */}
      {h2s.length > 0 && (
        <section className="px-8 py-10 border-t border-[#1c1c28] grid grid-cols-1 sm:grid-cols-3 gap-6">
          {h2s.map((h, i) => (
            <div key={i}>
              <p
                className="text-[10px] uppercase tracking-[0.25em] font-medium mb-2 tabular-nums"
                style={{ color: styling.accent }}
              >
                {String(i + 1).padStart(2, "0")}
              </p>
              <p
                className="text-white text-lg leading-tight"
                style={{ fontFamily: 'Georgia, "Tiempos Headline", serif' }}
              >
                {h.length > 60 ? h.slice(0, 60) + "…" : h}
              </p>
            </div>
          ))}
        </section>
      )}
      {h2s.length === 0 && (
        <section className="px-8 py-10 border-t border-[#1c1c28] grid grid-cols-1 sm:grid-cols-3 gap-6">
          {["Excellence", "Discrétion", "Sur-mesure"].map((label, i) => (
            <div key={i}>
              <p
                className="text-[10px] uppercase tracking-[0.25em] font-medium mb-2 tabular-nums"
                style={{ color: styling.accent }}
              >
                {String(i + 1).padStart(2, "0")}
              </p>
              <p
                className="text-white text-lg leading-tight"
                style={{ fontFamily: 'Georgia, "Tiempos Headline", serif' }}
              >
                {label}
              </p>
            </div>
          ))}
        </section>
      )}

      {/* Footer hairline */}
      <footer className="px-8 py-6 border-t border-[#1c1c28] flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-zinc-600">
        <span>{firmaNaziv} · {city}</span>
        <span>Mentions légales · Confidentialité</span>
      </footer>
    </div>
  );
}
