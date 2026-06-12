import { test, before } from "node:test";
import assert from "node:assert/strict";
import { searchPlaces, type DiscoveryQuery } from "../discovery";
import { searchSirene } from "../discoverySirene";
import { freshCursor, briefKey, buildQueryVariants } from "../discoveryCursor";

before(() => {
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
  // Any un-injected network call must fail the suite loudly.
  globalThis.fetch = (() => {
    throw new Error("real fetch called in test");
  }) as unknown as typeof fetch;
});

const QUERY: DiscoveryQuery = { niche: "studio de yoga", city: "Paris", country: "FR", pageSize: 20 };
const KEY = briefKey({ source: "google_places", niche: "studio de yoga", city: "Paris", country: "FR", query: null });

interface RecordedRequest {
  url: string;
  body: Record<string, unknown> | null;
  headers: Record<string, string>;
}

/** Scripted fetch: returns canned responses in order, records every request. */
function scriptedFetch(responses: Array<{ status?: number; json: unknown }>) {
  const requests: RecordedRequest[] = [];
  let i = 0;
  const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const r = responses[Math.min(i++, responses.length - 1)];
    requests.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : null,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      json: async () => r.json,
    } as Response;
  }) as typeof fetch;
  return { fetchFn, requests };
}

function sleepRecorder() {
  const sleeps: number[] = [];
  return { sleeps, sleep: async (ms: number) => void sleeps.push(ms) };
}

function placesPage(count: number, offset: number, nextPageToken?: string) {
  return {
    places: Array.from({ length: count }, (_, i) => ({
      id: `place-${offset + i}`,
      displayName: { text: `Studio ${offset + i}` },
      websiteUri: `https://studio${offset + i}.fr`,
      userRatingCount: 50,
    })),
    ...(nextPageToken ? { nextPageToken } : {}),
  };
}

test("places: first call requests 20 with nextPageToken in the field mask, no token in body", async () => {
  const { fetchFn, requests } = scriptedFetch([{ json: placesPage(20, 0, "tok-1") }]);
  const out = await searchPlaces(QUERY, freshCursor(KEY), { fetchFn, sleep: sleepRecorder().sleep });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body!.pageSize, 20);
  assert.equal(requests[0].body!.pageToken, undefined);
  assert.ok(requests[0].headers["X-Goog-FieldMask"].includes("nextPageToken"));
  assert.equal(out.places.length, 20);
  assert.equal(out.cursor.position, 20);
  assert.equal(out.variantExhausted, false);
});

test("places: resume at position 20 re-walks page 1 then follows the token with a 2s wait", async () => {
  const { fetchFn, requests } = scriptedFetch([
    { json: placesPage(20, 0, "tok-1") },
    { json: placesPage(20, 20, "tok-2") },
  ]);
  const rec = sleepRecorder();
  const cursor = { ...freshCursor(KEY), position: 20 };
  const out = await searchPlaces(QUERY, cursor, { fetchFn, sleep: rec.sleep });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].body!.pageToken, "tok-1");
  // identical params on the token request (v1 requirement)
  assert.equal(requests[1].body!.textQuery, requests[0].body!.textQuery);
  assert.deepEqual(rec.sleeps, [2000]);
  assert.equal(out.places.length, 20);
  assert.equal(out.places[0].placeId, "place-20");
  assert.equal(out.cursor.position, 40);
});

test("places: token-not-ready 400 gets one retry; persistent failure keeps cursor (no false exhaustion)", async () => {
  // Retry succeeds:
  const ok = scriptedFetch([
    { json: placesPage(20, 0, "tok-1") },
    { status: 400, json: { error: { message: "token not ready" } } },
    { json: placesPage(10, 20) },
  ]);
  const rec1 = sleepRecorder();
  const out1 = await searchPlaces(QUERY, { ...freshCursor(KEY), position: 20 }, { fetchFn: ok.fetchFn, sleep: rec1.sleep });
  assert.equal(out1.places.length, 10);
  assert.deepEqual(rec1.sleeps, [2000, 2000]); // wait, fail, wait again, retry
  // Retry also fails → partial walk, cursor unchanged, not exhausted:
  const bad = scriptedFetch([
    { json: placesPage(20, 0, "tok-1") },
    { status: 400, json: {} },
    { status: 400, json: {} },
  ]);
  const out2 = await searchPlaces(QUERY, { ...freshCursor(KEY), position: 20 }, { fetchFn: bad.fetchFn, sleep: sleepRecorder().sleep });
  assert.equal(out2.places.length, 0);
  assert.equal(out2.cursor.position, 20);
  assert.equal(out2.variantExhausted, false);
  assert.equal(out2.exhausted, false);
});

test("places: variant rollover when pages run out; exhaustion only after the last variant", async () => {
  // 7 results, no token → variant exhausted, cursor moves to variant 1 pos 0
  const { fetchFn } = scriptedFetch([{ json: placesPage(7, 0) }]);
  const out = await searchPlaces(QUERY, freshCursor(KEY), { fetchFn, sleep: sleepRecorder().sleep });
  assert.equal(out.places.length, 7);
  assert.equal(out.variantExhausted, true);
  assert.equal(out.cursor.variant, 1);
  assert.equal(out.cursor.position, 0);
  assert.equal(out.exhausted, false);
  // Last variant exhausted → fully exhausted
  const lastVariant = buildQueryVariants(QUERY).length - 1;
  const { fetchFn: f2, requests: r2 } = scriptedFetch([{ json: placesPage(3, 0) }]);
  const out2 = await searchPlaces(QUERY, { ...freshCursor(KEY), variant: lastVariant }, { fetchFn: f2, sleep: sleepRecorder().sleep });
  assert.equal(r2[0].body!.textQuery, buildQueryVariants(QUERY)[lastVariant]);
  assert.equal(out2.exhausted, true);
  assert.equal(out2.cursor.exhausted, true);
});

test("places: minReviews filters rows but positions still index the raw stream", async () => {
  const page = placesPage(5, 0);
  (page.places[1] as { userRatingCount: number }).userRatingCount = 2; // filtered out
  const { fetchFn } = scriptedFetch([{ json: page }]);
  const out = await searchPlaces({ ...QUERY, minReviews: 10 }, freshCursor(KEY), { fetchFn, sleep: sleepRecorder().sleep });
  assert.equal(out.places.length, 4);
  // place-2 is the 3rd raw row → consuming through it = raw position 3
  assert.deepEqual(out.positions, [1, 3, 4, 5]);
});

function sirenePage(count: number, offset: number, total: number, websiteEvery = 1) {
  return {
    results: Array.from({ length: count }, (_, i) => ({
      siren: `${offset + i}`,
      nom_complet: `Entreprise ${offset + i}`,
      siege: {
        libelle_commune: "Paris",
        site_internet: websiteEvery > 0 && (offset + i) % websiteEvery === 0 ? `https://e${offset + i}.fr` : null,
      },
    })),
    total_results: total,
    page: Math.floor(offset / 25) + 1,
    per_page: 25,
  };
}

const SIRENE_QUERY: DiscoveryQuery = { niche: "41.20A,43.22A", city: "Paris", country: "FR", pageSize: 20 };
const SIRENE_KEY = briefKey({ source: "sirene_api", niche: "41.20A,43.22A", city: "Paris", country: "FR", query: null });

test("sirene: page/per_page derived from cursor position; positions are global ranks", async () => {
  const { fetchFn, requests } = scriptedFetch([{ json: sirenePage(25, 50, 1000) }]);
  const out = await searchSirene(SIRENE_QUERY, { ...freshCursor(SIRENE_KEY), position: 50 }, { fetchFn, sleep: sleepRecorder().sleep });
  const url = new URL(requests[0].url);
  assert.equal(url.searchParams.get("page"), "3"); // position 50 → page 3
  assert.equal(url.searchParams.get("per_page"), "25");
  assert.equal(out.places.length, 20); // fetchTarget
  assert.equal(out.positions[0], 51);
  assert.equal(out.cursor.position, 70);
  assert.equal(out.exhausted, false);
});

test("sirene: a page with zero usable websites advances the cursor — NOT exhaustion", async () => {
  const { fetchFn, requests } = scriptedFetch([
    { json: sirenePage(25, 0, 1000, 0) },  // no websites at all
    { json: sirenePage(25, 25, 1000, 1) },   // all have websites
  ]);
  const out = await searchSirene(SIRENE_QUERY, freshCursor(SIRENE_KEY), { fetchFn, sleep: sleepRecorder().sleep });
  assert.equal(requests.length, 2);
  assert.equal(out.places.length, 20);
  assert.equal(out.positions[0], 26); // first usable row is rank 26
  assert.equal(out.exhausted, false);
});

test("sirene: total_results boundary marks exhaustion", async () => {
  const { fetchFn } = scriptedFetch([{ json: sirenePage(7, 0, 7) }]);
  const out = await searchSirene(SIRENE_QUERY, freshCursor(SIRENE_KEY), { fetchFn, sleep: sleepRecorder().sleep });
  assert.equal(out.places.length, 7);
  assert.equal(out.exhausted, true);
  assert.equal(out.cursor.exhausted, true);
});
