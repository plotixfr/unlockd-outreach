/**
 * Google Places (New) API client — used by the autopilot to discover real
 * businesses to add as prospects. We use the new Places API v1 because the
 * legacy one is being deprecated. Free tier covers ~5k Text Searches/month.
 *
 * Pagination: the caller passes a BriefCursor (variant + position). Page
 * tokens expire within minutes, so they are NEVER persisted — within one
 * call we walk pages with live tokens up to the v1 ceiling (3 pages × 20)
 * to reach `position`, return the next slice, and report where the cursor
 * lands. When a variant's pages run out we advance to the next query
 * variant (see discoveryCursor.buildQueryVariants) before declaring the
 * brief exhausted.
 *
 * Fields requested are kept tight (X-Goog-FieldMask) to minimise cost.
 * `nextPageToken` MUST be in the mask or v1 silently never paginates.
 *
 * Set env GOOGLE_PLACES_API_KEY to enable. Without it, autopilot will skip
 * discovery and just process whatever prospects already exist.
 */

import {
  type BriefCursor,
  buildQueryVariants,
} from "@/lib/discoveryCursor";

export interface DiscoveredPlace {
  placeId: string;
  name: string;
  website: string | null;
  address: string | null;
  phone: string | null;
  rating: number | null;
  ratingCount: number | null;
  primaryType: string | null;
  city: string | null;
  country: string | null;
}

export interface DiscoveryQuery {
  niche: string;
  city: string | null;
  country: string;
  customQuery?: string | null;
  minRating?: number | null;
  minReviews?: number | null;
  pageSize?: number;
}

/** Injectable for tests — production code never passes this. */
export interface DiscoveryDeps {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface SearchOutcome {
  places: DiscoveredPlace[];
  /** positions[i] = cursor.position value after consuming places[0..i]. */
  positions: number[];
  /** Cursor if the WHOLE returned slice is consumed (incl. variant rollover). */
  cursor: BriefCursor;
  variantExhausted: boolean;
  /** All variants spent — the brief has nothing left to find. */
  exhausted: boolean;
}

const SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "nextPageToken",
  "places.id",
  "places.displayName",
  "places.websiteUri",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.nationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.primaryType",
  "places.addressComponents",
].join(",");

// Page tokens become valid ~2s after issue; requests made earlier 400.
const TOKEN_WAIT_MS = 2000;
const MAX_PAGES = 3; // v1 hard ceiling: 3 pages × 20 results

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  websiteUri?: string;
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  primaryType?: string;
  addressComponents?: Array<{
    types?: string[];
    longText?: string;
    shortText?: string;
  }>;
}

interface PlacesApiResponse {
  places?: RawPlace[];
  nextPageToken?: string;
  error?: { message?: string };
}

export async function isDiscoveryConfigured(): Promise<boolean> {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}

function extractAddressPart(
  components: Array<{ types?: string[]; longText?: string; shortText?: string }> | undefined,
  type: string,
  useShort = false
): string | null {
  if (!components) return null;
  const match = components.find((c) => c.types?.includes(type));
  if (!match) return null;
  return (useShort ? match.shortText : match.longText) ?? null;
}

function toDiscoveredPlace(p: RawPlace): DiscoveredPlace {
  return {
    placeId: p.id!,
    name: p.displayName!.text!,
    website: p.websiteUri ?? null,
    address: p.formattedAddress ?? null,
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
    rating: typeof p.rating === "number" ? p.rating : null,
    ratingCount: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    primaryType: p.primaryType ?? null,
    city:
      extractAddressPart(p.addressComponents, "locality") ??
      extractAddressPart(p.addressComponents, "postal_town") ??
      extractAddressPart(p.addressComponents, "administrative_area_level_2"),
    country: extractAddressPart(p.addressComponents, "country", true),
  };
}

/**
 * Returns the next slice of results for the brief's cursor. Never throws —
 * returns an empty slice (cursor unchanged) on misconfig or HTTP failure so
 * the autopilot keeps running and retries next fire.
 */
export async function searchPlaces(
  q: DiscoveryQuery,
  cursor: BriefCursor,
  deps: DiscoveryDeps = {}
): Promise<SearchOutcome> {
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const noProgress = (exhausted = false): SearchOutcome => ({
    places: [],
    positions: [],
    cursor: exhausted ? { ...cursor, exhausted: true } : cursor,
    variantExhausted: exhausted,
    exhausted,
  });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    console.warn("[discovery] GOOGLE_PLACES_API_KEY missing — skipping");
    return noProgress();
  }

  const variants = buildQueryVariants(q);
  if (cursor.variant >= variants.length) return noProgress(true);
  const textQuery = variants[cursor.variant];
  const fetchTarget = Math.min(Math.max(q.pageSize ?? 20, 1), 20);

  // All params except pageToken must be byte-identical across page requests
  // or v1 rejects the token with INVALID_ARGUMENT.
  const baseBody: Record<string, unknown> = {
    textQuery,
    pageSize: 20,
    languageCode: "fr",
    regionCode: q.country?.toUpperCase() || "FR",
  };
  if (q.minRating != null) baseBody.minRating = q.minRating;

  async function fetchPage(pageToken: string | null): Promise<PlacesApiResponse | null> {
    const body = pageToken ? { ...baseBody, pageToken } : baseBody;
    try {
      const res = await fetchFn(SEARCH_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key!,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as PlacesApiResponse;
      if (!res.ok) {
        console.error("[discovery] Places API error:", json.error?.message ?? `HTTP ${res.status}`);
        return null;
      }
      return json;
    } catch (e) {
      console.error("[discovery] Places fetch threw:", e);
      return null;
    }
  }

  // Walk pages (re-walking past pages with live tokens) until we have enough
  // raw rows to cover cursor.position + fetchTarget, the token runs out, or
  // we hit the page ceiling.
  const raw: RawPlace[] = [];
  let token: string | null = null;
  let noMorePages = false;
  let tokenFailed = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) {
      await sleep(TOKEN_WAIT_MS);
    }
    let json = await fetchPage(token);
    if (!json && token) {
      // Token-not-ready quirk: one retry after another wait.
      await sleep(TOKEN_WAIT_MS);
      json = await fetchPage(token);
    }
    if (!json) {
      if (page === 0) return noProgress(); // hard failure on the first page
      tokenFailed = true; // partial walk — keep what we have, cursor stands
      break;
    }
    raw.push(...(json.places ?? []));
    token = json.nextPageToken ?? null;
    if (!token) {
      noMorePages = true;
      break;
    }
    if (raw.length >= cursor.position + fetchTarget) break;
  }

  // Fresh window starts where the cursor left off.
  const window = raw.slice(cursor.position, cursor.position + fetchTarget);
  const places: DiscoveredPlace[] = [];
  const positions: number[] = [];
  window.forEach((p, i) => {
    if (!p.id || !p.displayName?.text) return;
    const place = toDiscoveredPlace(p);
    // Soft filter applied client-side (the API doesn't support minReviews).
    // Filtered rows are still consumed — positions index the raw stream.
    if (q.minReviews != null && (place.ratingCount ?? 0) < q.minReviews) return;
    places.push(place);
    positions.push(cursor.position + i + 1);
  });

  const reachedEndOfRaw = cursor.position + fetchTarget >= raw.length;
  const variantExhausted = noMorePages && reachedEndOfRaw && !tokenFailed;
  const nextCursor: BriefCursor = variantExhausted
    ? {
        ...cursor,
        variant: cursor.variant + 1,
        position: 0,
        exhausted: cursor.variant + 1 >= variants.length,
      }
    : { ...cursor, position: Math.min(cursor.position + fetchTarget, raw.length) };

  return {
    places,
    positions,
    cursor: nextCursor,
    variantExhausted,
    exhausted: nextCursor.exhausted,
  };
}
