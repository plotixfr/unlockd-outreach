/**
 * French government company registry adapter — used by autopilot to discover
 * French tech startups, SaaS companies, IT consultancies, and digital agencies
 * (Group B target). Free, no API key, no rate limit issues for moderate use.
 *
 * Endpoint: https://recherche-entreprises.api.gouv.fr/search
 * (Public reverse of INSEE Sirene, no auth, JSON response.)
 *
 * Filters we use:
 *  - activite_principale: NAF codes for software/IT/digital sectors
 *  - departement: French department codes (Paris = 75, Lyon = 69, etc.)
 *  - tranche_effectif_salarie: at least 2 employees (filter out solo SIRENs)
 *  - etat_administratif: active companies only (default)
 *
 * Critically, recherche-entreprises does NOT return websites directly. We
 * pull what we can from the result; the autopilot's findEmailForSite step
 * will skip the prospect if no website is discoverable. To improve the hit
 * rate we infer a likely website from the company name in `customQuery`
 * mode by checking common TLDs (.fr / .com) — but that's optional and gated.
 */

import type { DiscoveredPlace, DiscoveryQuery } from "./discovery";

const SIRENE_ENDPOINT = "https://recherche-entreprises.api.gouv.fr/search";

// Default NAF codes mapped to "tech/digital" sectors. Operator can override
// per-brief by setting brief.query to a comma-separated NAF list, or pass
// a free-form text query that matches company name keywords.
const DEFAULT_TECH_NAF = [
  "62.01Z", // Programmation informatique (software dev)
  "62.02A", // Conseil en systèmes et logiciels (IT consulting)
  "62.02B", // Tierce maintenance de systèmes
  "62.03Z", // Gestion d'installations informatiques
  "62.09Z", // Autres activités informatiques
  "63.11Z", // Traitement de données, hébergement
  "63.12Z", // Portails internet (web platforms / SaaS)
  "73.11Z", // Activités des agences de publicité (digital agencies)
  "74.10Z", // Activités spécialisées de design
].join(",");

// Map of city name → department code(s). Sirene filters by department, not
// city name. Multi-city briefs (e.g. "Île-de-France") map to a list.
const CITY_TO_DEPT: Record<string, string> = {
  paris: "75",
  lyon: "69",
  marseille: "13",
  toulouse: "31",
  nice: "06",
  nantes: "44",
  bordeaux: "33",
  lille: "59",
  strasbourg: "67",
  montpellier: "34",
  rennes: "35",
  grenoble: "38",
  rouen: "76",
  "saint-étienne": "42",
  "saint-etienne": "42",
};

interface SireneApiResponse {
  results?: Array<{
    siren?: string;
    siret?: string;
    nom_complet?: string;
    nom_raison_sociale?: string;
    activite_principale?: string;
    section_activite_principale?: string;
    tranche_effectif_salarie?: string;
    date_creation?: string;
    siege?: {
      adresse?: string;
      code_postal?: string;
      libelle_commune?: string;
      site_internet?: string | null;
      latitude?: string;
      longitude?: string;
      numero_voie?: string;
      type_voie?: string;
      libelle_voie?: string;
    };
    matching_etablissements?: Array<{
      siret?: string;
      adresse?: string;
      libelle_commune?: string;
      site_internet?: string | null;
    }>;
  }>;
  total_results?: number;
  page?: number;
  per_page?: number;
}

export async function searchSirene(q: DiscoveryQuery): Promise<DiscoveredPlace[]> {
  const params = new URLSearchParams();

  // The free-form query: if the brief explicitly sets a query, use it as a
  // company-name fuzzy search. Otherwise leave empty so the NAF + dept
  // filters do all the work.
  if (q.customQuery?.trim()) {
    params.set("q", q.customQuery.trim());
  }

  // NAF activity codes — operator can override by writing comma-separated
  // codes into brief.niche (e.g. "62.01Z,73.11Z"). Otherwise the default
  // tech/digital basket is used.
  const nafCodes = looksLikeNafList(q.niche) ? q.niche : DEFAULT_TECH_NAF;
  params.set("activite_principale", nafCodes);

  // Geographic filter — Sirene wants a department code, not a city name.
  if (q.city) {
    const dept = CITY_TO_DEPT[q.city.trim().toLowerCase()];
    if (dept) {
      params.set("departement", dept);
    } else {
      // Fallback: pass the city in the free-text query so Sirene's fuzzy
      // matcher tries to find it in addresses.
      const existing = params.get("q") ?? "";
      params.set("q", `${existing} ${q.city}`.trim());
    }
  }

  // Filter: only active companies with at least 2 employees (kills solo
  // freelancers — they're a different sales motion). Sirene's
  // tranche_effectif_salarie codes: 01 = 1-2, 02 = 3-5, 03 = 6-9, etc.
  params.set("tranche_effectif_salarie", "02,03,11,12,21,22,31,32,41,42,51,52,53");

  params.set("etat_administratif", "A"); // active
  params.set("per_page", String(Math.min(Math.max(q.pageSize ?? 10, 1), 25)));

  let json: SireneApiResponse;
  try {
    const res = await fetch(`${SIRENE_ENDPOINT}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      console.error(`[sirene] HTTP ${res.status} on ${params.toString()}`);
      return [];
    }
    json = (await res.json()) as SireneApiResponse;
  } catch (e) {
    console.error("[sirene] fetch threw:", e);
    return [];
  }

  const results = json.results ?? [];
  return results
    .map((r): DiscoveredPlace | null => {
      const name = r.nom_complet ?? r.nom_raison_sociale;
      if (!name) return null;
      const siret = r.siret ?? r.siren ?? `sirene_${name}`;
      const siege = r.siege ?? {};
      const website =
        siege.site_internet ??
        r.matching_etablissements?.[0]?.site_internet ??
        null;
      const composed = [siege.numero_voie, siege.type_voie, siege.libelle_voie, siege.code_postal, siege.libelle_commune]
        .filter(Boolean)
        .join(" ");
      const address = siege.adresse ?? (composed || null);
      return {
        placeId: siret,
        name,
        website,
        address,
        phone: null,
        rating: null,
        ratingCount: null,
        primaryType: r.activite_principale ?? null,
        city: siege.libelle_commune ?? null,
        country: "FR",
      };
    })
    .filter((p): p is DiscoveredPlace => p !== null)
    // Drop entries with no website — autopilot can't email-find without one.
    // Sirene returns site_internet for ~30-40% of tech companies, which is
    // enough volume given there are 100k+ tech SIRENs in France.
    .filter((p) => !!p.website);
}

function looksLikeNafList(s: string): boolean {
  // Matches "62.01Z" or "62.01Z,73.11Z" etc.
  return /^(\d{2}\.\d{2}[A-Z]?)(,\d{2}\.\d{2}[A-Z]?)*$/.test(s.trim());
}

export function isSireneConfigured(): boolean {
  // No API key needed — always available.
  return true;
}
