import { test } from "node:test";
import assert from "node:assert/strict";
import {
  briefKey,
  parseCursor,
  freshCursor,
  cooldownMs,
  buildQueryVariants,
} from "../discoveryCursor";

const TARGETING = {
  source: "google_places",
  niche: "studio de yoga",
  city: "Paris",
  country: "FR",
  query: null,
};

test("briefKey changes when targeting fields change", () => {
  const a = briefKey(TARGETING);
  assert.equal(a, briefKey({ ...TARGETING })); // stable
  assert.notEqual(a, briefKey({ ...TARGETING, city: "Lyon" }));
  assert.notEqual(a, briefKey({ ...TARGETING, niche: "spa premium" }));
});

test("parseCursor: valid cursor round-trips; mismatch/garbage resets", () => {
  const key = briefKey(TARGETING);
  const stored = { v: 1, key, variant: 2, position: 37, exhausted: false };
  assert.deepEqual(parseCursor(stored, key), stored);
  // Key mismatch (brief was edited) → fresh
  assert.deepEqual(parseCursor(stored, "otherkey"), freshCursor("otherkey"));
  // Garbage shapes → fresh
  assert.deepEqual(parseCursor(null, key), freshCursor(key));
  assert.deepEqual(parseCursor("junk", key), freshCursor(key));
  assert.deepEqual(parseCursor({ v: 99, key, variant: 0, position: 0 }, key), freshCursor(key));
  assert.deepEqual(parseCursor({ v: 1, key, variant: -1, position: 0 }, key), freshCursor(key));
});

test("cooldownMs: exponential 2h base, capped at 72h", () => {
  assert.equal(cooldownMs(1), 2 * 3600_000);
  assert.equal(cooldownMs(2), 4 * 3600_000);
  assert.equal(cooldownMs(3), 8 * 3600_000);
  assert.equal(cooldownMs(6), 64 * 3600_000);
  assert.equal(cooldownMs(7), 72 * 3600_000);
  assert.equal(cooldownMs(50), 72 * 3600_000);
});

test("buildQueryVariants: base variant first (matches legacy query format), then expansion", () => {
  const variants = buildQueryVariants({ niche: "studio de yoga", city: "Paris", country: "FR" });
  // Base must reproduce the pre-cursor query exactly so dedupe history lines up
  assert.equal(variants[0], "studio de yoga in Paris , FR");
  assert.ok(variants.length >= 7, `expected ≥7 variants, got ${variants.length}`);
  assert.ok(variants.includes("meilleur studio de yoga Paris"));
  assert.ok(variants.some((v) => v.includes("arrondissement"))); // Paris metro sweep
  // Deterministic
  assert.deepEqual(variants, buildQueryVariants({ niche: "studio de yoga", city: "Paris", country: "FR" }));
});

test("buildQueryVariants: custom query and city-less briefs", () => {
  const custom = buildQueryVariants({ niche: "x", city: "Paris", country: "FR", customQuery: "yoga premium rive gauche" });
  assert.equal(custom[0], "yoga premium rive gauche");
  const noCity = buildQueryVariants({ niche: "studio de yoga", city: null, country: "FR" });
  assert.equal(noCity.length, 1);
});
