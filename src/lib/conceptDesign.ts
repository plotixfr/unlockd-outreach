/**
 * Design system primitives for the per-prospect concept preview. Three
 * distinct layouts (cinematic / editorial split / minimal grid) × five
 * sophisticated palettes × curated stock photography per niche means every
 * prospect gets a preview that doesn't look like the last one — the variant
 * is picked by hashing the prospect id so it's stable but varies across
 * prospects.
 */

import type { SiteSnapshot } from "@/lib/scrapeSite";

export type LayoutVariant = "cinematic" | "editorial" | "minimal";

export interface Palette {
  name: string;
  bg: string;
  fg: string;
  fgMuted: string;
  accent: string;
  accentSoft: string;
}

export const PALETTES: Palette[] = [
  {
    name: "Sable",
    bg: "#0d0a07",
    fg: "#f5f0e6",
    fgMuted: "#b8a78a",
    accent: "#d4a574",
    accentSoft: "rgba(212, 165, 116, 0.18)",
  },
  {
    name: "Encre",
    bg: "#0a0a0e",
    fg: "#f4f4f6",
    fgMuted: "#9aa0a8",
    accent: "#c8c2b6",
    accentSoft: "rgba(200, 194, 182, 0.15)",
  },
  {
    name: "Forêt",
    bg: "#0a0e0c",
    fg: "#f0ede7",
    fgMuted: "#9eaaa0",
    accent: "#a8b89a",
    accentSoft: "rgba(168, 184, 154, 0.18)",
  },
  {
    name: "Bordeaux",
    bg: "#0c0808",
    fg: "#f4ede5",
    fgMuted: "#b09a8e",
    accent: "#9c5a4a",
    accentSoft: "rgba(156, 90, 74, 0.2)",
  },
  {
    name: "Bleu nuit",
    bg: "#080a0e",
    fg: "#f0f2f5",
    fgMuted: "#8e9aa8",
    accent: "#7a92a8",
    accentSoft: "rgba(122, 146, 168, 0.15)",
  },
];

/**
 * Curated stock imagery per niche. Each entry is a stable Unsplash photo ID
 * picked for editorial quality — moody composition, premium subject, no
 * obvious branding. Each prospect picks 2-3 from their niche pool via hash.
 */
const IMAGE_POOLS: Record<string, string[]> = {
  hotel: [
    "photo-1566073771259-6a8506099945", // luxury bedroom warm light
    "photo-1551882547-ff40c63fe5fa", // hotel interior moody
    "photo-1542314831-068cd1dbfeeb", // modern hotel facade
    "photo-1564501049412-61c2a3083791", // bedroom suite
    "photo-1571896349842-33c89424de2d", // hotel pool aerial
    "photo-1611892440504-42a792e24d32", // lobby chandelier
  ],
  restaurant: [
    "photo-1414235077428-338989a2e8c0", // gastronomic plate
    "photo-1517248135467-4c7edcad34c4", // restaurant interior moody
    "photo-1466978913421-dad2ebd01d17", // chef plating
    "photo-1559339352-11d035aa65de", // table setting dark
    "photo-1551218372-a8789b81b253", // dish detail
    "photo-1592861956120-e524fc739696", // wine pour
  ],
  property: [
    "photo-1564013799919-ab600027ffc6", // luxury villa
    "photo-1613977257363-707ba9348227", // modern home
    "photo-1600596542815-ffad4c1539a9", // home interior
    "photo-1600585154340-be6161a56a0c", // architectural exterior
    "photo-1600607687939-ce8a6c25118c", // pool villa
    "photo-1512917774080-9991f1c4c750", // modern facade
  ],
  architecture: [
    "photo-1486325212027-8081e485255e", // modern building
    "photo-1487958449943-2429e8be8625", // architectural detail
    "photo-1545324418-cc1a3fa10c00", // concrete minimalist
    "photo-1448630360428-65456885c650", // brutalist exterior
    "photo-1502005229762-cf1b2da7c5d6", // architectural lines
  ],
  spa: [
    "photo-1540555700478-4be289fbecef", // spa stones zen
    "photo-1544161515-4ab6ce6db874", // wellness room
    "photo-1571019613454-1cb2f99b2d8b", // candle minimalist
    "photo-1519823551278-64ac92734fb1", // spa interior soft
    "photo-1591343395082-e120087004b4", // wellness elements
  ],
  jewelry: [
    "photo-1605100804763-247f67b3557e", // jewelry display
    "photo-1611652022419-a9419f74343d", // ring detail
    "photo-1599643478518-a784e5dc4c8f", // necklace dark
    "photo-1573408301185-9146fe634ad0", // jewelry editorial
    "photo-1515562141207-7a88fb7ce338", // gold detail
  ],
  default: [
    "photo-1497366216548-37526070297c", // editorial workspace
    "photo-1497366811353-6870744d04b2", // minimal interior
    "photo-1545324418-cc1a3fa10c00", // architectural
    "photo-1486325212027-8081e485255e", // modern build
  ],
};

const NICHE_COPY: Record<string, { eyebrow: string; ctaPrimary: string; ctaSecondary: string; tagline: string }> = {
  hotel: {
    eyebrow: "L'art de l'hospitalité",
    ctaPrimary: "Réserver",
    ctaSecondary: "Découvrir",
    tagline: "Chaque détail pensé. Chaque séjour, l'évidence.",
  },
  restaurant: {
    eyebrow: "Cuisine d'auteur",
    ctaPrimary: "Réserver une table",
    ctaSecondary: "La carte",
    tagline: "Un moment, une œuvre, une signature.",
  },
  property: {
    eyebrow: "Immobilier d'exception",
    ctaPrimary: "Nos biens",
    ctaSecondary: "Estimation",
    tagline: "Des adresses qui résistent au temps.",
  },
  architecture: {
    eyebrow: "Atelier d'architecture",
    ctaPrimary: "Nos projets",
    ctaSecondary: "Approche",
    tagline: "L'espace comme matière première du sensible.",
  },
  spa: {
    eyebrow: "Maison de bien-être",
    ctaPrimary: "Réserver un soin",
    ctaSecondary: "Rituels",
    tagline: "Le luxe du temps. Le soin du détail.",
  },
  jewelry: {
    eyebrow: "Maison de joaillerie",
    ctaPrimary: "La collection",
    ctaSecondary: "Rendez-vous",
    tagline: "Des pièces qui se transmettent.",
  },
  default: {
    eyebrow: "Studio",
    ctaPrimary: "Découvrir",
    ctaSecondary: "Contact",
    tagline: "Une présence digitale à la hauteur de l'œuvre.",
  },
};

function nicheKey(niche: string): keyof typeof IMAGE_POOLS {
  const n = niche.toLowerCase();
  if (n.includes("hotel") || n.includes("hôtel")) return "hotel";
  if (n.includes("restaurant") || n.includes("gastro") || n.includes("patisserie") || n.includes("cave")) return "restaurant";
  if (n.includes("immobil") || n.includes("property") || n.includes("agence immobilière")) return "property";
  if (n.includes("architect")) return "architecture";
  if (n.includes("spa") || n.includes("wellness") || n.includes("beauté") || n.includes("coiffure")) return "spa";
  if (n.includes("bijou") || n.includes("jewel") || n.includes("galerie") || n.includes("boutique")) return "jewelry";
  return "default";
}

/**
 * Deterministic 32-bit hash of a string. Used to pick a stable layout +
 * palette per prospect so the preview doesn't shuffle between page reloads.
 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface ConceptSpec {
  variant: LayoutVariant;
  palette: Palette;
  heroImageUrl: string;
  secondaryImageUrl: string;
  copy: {
    eyebrow: string;
    headline: string;
    tagline: string;
    ctaPrimary: string;
    ctaSecondary: string;
    sections: { label: string; title: string }[];
  };
}

function unsplashUrl(photoId: string, width = 1600, quality = 88): string {
  return `https://images.unsplash.com/${photoId}?w=${width}&q=${quality}&auto=format&fit=crop`;
}

/**
 * Builds a concept spec from the prospect's id, niche, name, and scraped
 * site. Layout + palette + image picks are all derived from the id hash so
 * they're stable per prospect but varied across the database. Headlines and
 * H2s pull from the scraped site so the prospect recognises their own
 * voice elevated into a premium register.
 */
export function buildConceptSpec(input: {
  id: string;
  firmaNaziv: string;
  niche: string;
  city: string;
  snapshot: SiteSnapshot | null;
}): ConceptSpec {
  const h = hash(input.id);
  const variants: LayoutVariant[] = ["cinematic", "editorial", "minimal"];
  const variant = variants[h % variants.length];
  const palette = PALETTES[(h >>> 4) % PALETTES.length];

  const key = nicheKey(input.niche);
  const pool = IMAGE_POOLS[key] ?? IMAGE_POOLS.default;
  const heroIdx = (h >>> 8) % pool.length;
  const secondaryIdx = (heroIdx + 1 + ((h >>> 12) % (pool.length - 1))) % pool.length;

  const heroImage = input.snapshot?.ogImage && /^https?:\/\//.test(input.snapshot.ogImage)
    ? input.snapshot.ogImage
    : unsplashUrl(pool[heroIdx]);
  const secondaryImage = unsplashUrl(pool[secondaryIdx], 1200);

  const niche = NICHE_COPY[key] ?? NICHE_COPY.default;
  const headline = (input.snapshot?.h1 || input.snapshot?.title || input.firmaNaziv).trim();
  const tagline = input.snapshot?.metaDescription?.trim() || niche.tagline;
  const h2s = (input.snapshot?.h2s ?? []).slice(0, 4).map((s) => s.trim()).filter(Boolean);
  const sections = (h2s.length >= 3 ? h2s.slice(0, 3) : ["Excellence", "Discrétion", "Sur-mesure"]).map((title, i) => ({
    label: String(i + 1).padStart(2, "0"),
    title: title.length > 60 ? title.slice(0, 60) + "…" : title,
  }));

  return {
    variant,
    palette,
    heroImageUrl: heroImage,
    secondaryImageUrl: secondaryImage,
    copy: {
      eyebrow: `${niche.eyebrow} · ${input.city}`,
      headline,
      tagline,
      ctaPrimary: niche.ctaPrimary,
      ctaSecondary: niche.ctaSecondary,
      sections,
    },
  };
}
