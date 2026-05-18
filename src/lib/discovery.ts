/**
 * Google Places (New) API client — used by the autopilot to discover real
 * businesses to add as prospects. We use the new Places API v1 because the
 * legacy one is being deprecated. Free tier covers ~5k Text Searches/month.
 *
 * Fields requested are kept tight (X-Goog-FieldMask) to minimise cost — each
 * Place Details call charges by category, and we only need the basics:
 * displayName, websiteUri, formattedAddress, rating, userRatingCount.
 *
 * Set env GOOGLE_PLACES_API_KEY to enable. Without it, autopilot will skip
 * discovery and just process whatever prospects already exist.
 */

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

const SEARCH_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
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

interface PlacesApiResponse {
  places?: Array<{
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
  }>;
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

/**
 * Runs a text search against Places API and returns up to `pageSize`
 * structured results. Never throws — returns empty array on misconfig or HTTP
 * failure so the autopilot keeps running.
 */
export async function searchPlaces(q: DiscoveryQuery): Promise<DiscoveredPlace[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    console.warn("[discovery] GOOGLE_PLACES_API_KEY missing — skipping");
    return [];
  }

  // Build the textQuery. Prefer the custom override if provided, else
  // assemble "{niche} in {city}, {country}".
  const textQuery =
    q.customQuery?.trim() ||
    [q.niche.trim(), q.city ? `in ${q.city}` : "", q.country ? `, ${q.country}` : ""]
      .filter(Boolean)
      .join(" ")
      .trim();

  const body: Record<string, unknown> = {
    textQuery,
    pageSize: Math.min(Math.max(q.pageSize ?? 10, 1), 20),
    languageCode: "fr",
    regionCode: q.country?.toUpperCase() || "FR",
  };
  if (q.minRating != null) body.minRating = q.minRating;

  let json: PlacesApiResponse;
  try {
    const res = await fetch(SEARCH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
    json = (await res.json()) as PlacesApiResponse;
    if (!res.ok) {
      console.error("[discovery] Places API error:", json.error?.message ?? `HTTP ${res.status}`);
      return [];
    }
  } catch (e) {
    console.error("[discovery] Places fetch threw:", e);
    return [];
  }

  const places = json.places ?? [];
  return places
    .filter((p) => p.id && p.displayName?.text)
    .map((p): DiscoveredPlace => ({
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
    }))
    .filter((p) => {
      // Soft filters applied client-side because the API doesn't support minReviews.
      if (q.minReviews != null && (p.ratingCount ?? 0) < q.minReviews) return false;
      return true;
    });
}
