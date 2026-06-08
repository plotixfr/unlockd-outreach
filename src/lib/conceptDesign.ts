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
  fitness: [
    "photo-1534438327276-14e5300c3a48", // boutique gym editorial
    "photo-1571902943202-507ec2618e8f", // modern gym interior moody
    "photo-1517836357463-d25dfeac3438", // dumbbell rack minimal
    "photo-1599058917212-d750089bc07e", // pilates studio premium
    "photo-1593079831268-3381b0db4a77", // free weights closeup
    "photo-1540497077202-7c8a3999166f", // boutique fitness studio
  ],
  consulting: [
    "photo-1497366216548-37526070297c", // editorial workspace
    "photo-1556761175-5973dc0f32e7", // modern office meeting
    "photo-1521737604893-d14cc237f11d", // team discussion
    "photo-1517245386807-bb43f82c33c4", // sleek office lobby
    "photo-1573164574572-cb89e39749b4", // boardroom
  ],
  law: [
    "photo-1589994965851-a8f479c573a9", // law library editorial
    "photo-1521587760476-6c12a4b040da", // courthouse architectural
    "photo-1505664194779-8beaceb93744", // legal books detail
    "photo-1450101499163-c8848c66ca85", // pen on document
    "photo-1505664194779-8beaceb93744", // bookshelf moody
  ],
  tech: [
    "photo-1517694712202-14dd9538aa97", // code on screen editorial
    "photo-1551434678-e076c223a692", // dev workspace minimal
    "photo-1605379399642-870262d3d051", // laptop dark room
    "photo-1531403009284-440f080d1e12", // modern tech office
    "photo-1518770660439-4636190af475", // circuit board detail
  ],
  agency: [
    "photo-1497366754035-f200968a6e72", // creative workspace
    "photo-1542744173-8e7e53415bb0", // brainstorm board
    "photo-1559136555-9303baea8ebd", // designer screen
    "photo-1520607162513-77705c0f0d4a", // modern studio
    "photo-1581291518857-4e27b48ff24e", // studio interior
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
  fitness: {
    eyebrow: "Club privé",
    ctaPrimary: "Découvrir le club",
    ctaSecondary: "Réserver une visite",
    tagline: "L'effort. Le rituel. Le résultat.",
  },
  consulting: {
    eyebrow: "Cabinet de conseil",
    ctaPrimary: "Prendre rendez-vous",
    ctaSecondary: "Nos expertises",
    tagline: "Une stratégie nette. Une exécution sans détour.",
  },
  law: {
    eyebrow: "Cabinet d'avocats",
    ctaPrimary: "Consulter un avocat",
    ctaSecondary: "Domaines d'intervention",
    tagline: "Le droit avec la rigueur que mérite votre dossier.",
  },
  tech: {
    eyebrow: "Plateforme",
    ctaPrimary: "Demander une démo",
    ctaSecondary: "Documentation",
    tagline: "Un produit conçu pour ceux qui livrent.",
  },
  agency: {
    eyebrow: "Agence indépendante",
    ctaPrimary: "Démarrer un projet",
    ctaSecondary: "Études de cas",
    tagline: "Des marques qui se voient, sans crier.",
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
  // Group A — B2B professional services
  if (n.includes("avocat") || n.includes("law") || n.includes("legal") || n.includes("notaire")) return "law";
  if (n.includes("conseil") || n.includes("consulting") || n.includes("expert-comptable") || n.includes("rh") || n.includes("hr")) return "consulting";
  if (n.includes("agence") || n.includes("communication") || n.includes("marketing") || n.includes("relations presse") || n.includes("pr ") || n.includes("recrutement") || n.includes("formation")) return "agency";
  if (n.includes("architect")) return "architecture";
  // Group B — Tech / SaaS (matches both English/French and Sirene NAF codes)
  if (n.includes("tech") || n.includes("saas") || n.includes("software") || n.includes("logiciel") || n.includes("62.0") || n.includes("63.1")) return "tech";
  if (n.includes("digital") || n.includes("73.11") || n.includes("74.10")) return "agency";
  // Legacy fallbacks (existing prospects still have these niches)
  if (n.includes("hotel") || n.includes("hôtel")) return "hotel";
  if (n.includes("restaurant") || n.includes("gastro") || n.includes("patisserie") || n.includes("cave")) return "restaurant";
  if (n.includes("immobil") || n.includes("property")) return "property";
  if (n.includes("fitness") || n.includes("pilates") || n.includes("yoga") || n.includes("gym") || n.includes("sport")) return "fitness";
  if (n.includes("spa") || n.includes("wellness") || n.includes("beauté")) return "spa";
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
