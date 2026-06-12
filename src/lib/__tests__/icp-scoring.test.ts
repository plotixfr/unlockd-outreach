import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScoringPrompt, applyBuyingTriggerBoosts, type ProspectScoringInput } from "../qualityScore";
import { ICP } from "../icp";
import { EMAIL_SYSTEM_PROMPT } from "../emailPrompt";
import type { SiteSnapshot } from "../scrapeSite";

function snapshot(overrides: Partial<SiteSnapshot["signals"]> = {}, ok = true): SiteSnapshot {
  return {
    url: "https://example.com",
    fetchedAt: new Date(0).toISOString(),
    ok,
    status: 200,
    finalUrl: "https://example.com",
    title: "Example",
    metaDescription: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    lang: null,
    h1: "Example",
    h2s: [],
    bodyText: null,
    signals: {
      hasReservation: true,
      hasContactForm: true,
      hasInstagramLink: false,
      hasFacebookLink: false,
      hasPhone: true,
      hasEmail: true,
      responsiveViewport: true,
      language: null,
      approxImageCount: 10,
      techHints: [],
      ...overrides,
    },
  };
}

function prospect(overrides: Partial<ProspectScoringInput> = {}): ProspectScoringInput {
  return {
    firmaNaziv: "Test Co",
    nisa: "studio de yoga",
    grad: "Paris",
    website: "https://example.com",
    opisFirme: null,
    napomena: null,
    siteSnapshot: null,
    pagespeed: null,
    ...overrides,
  };
}

test("new-ICP prospect: NL yoga brief drives the prompt — niche+geography come from the brief", () => {
  const prompt = buildScoringPrompt(
    prospect({ nisa: "yogastudio", grad: "Amsterdam" }),
    { niche: "yogastudio", city: "Amsterdam", country: "NL", language: "nl" }
  );
  assert.match(prompt, /yogastudio/);
  assert.match(prompt, /Amsterdam/);
  assert.match(prompt, /Netherlands/);
  assert.match(prompt, /do NOT downgrade for niche or geography/);
  // Old hardcoded ICP must be gone
  assert.doesNotMatch(prompt, /consulting firms/i);
  assert.doesNotMatch(prompt, /French tech startups/i);
  assert.doesNotMatch(prompt, /wrong language\/country/i);
});

test("geography follows the brief, not hardcoded France: CH brief names Switzerland", () => {
  const ch = buildScoringPrompt(prospect(), {
    niche: "entreprise de construction",
    city: "Geneva",
    country: "CH",
    language: "fr",
  });
  assert.match(ch, /Switzerland/);
  // No-brief mode lists all valid markets rather than assuming France-only
  const generic = buildScoringPrompt(prospect(), null);
  assert.match(generic, /France, French-speaking Switzerland \(Romandie\), Netherlands/);
});

test("old-ICP prospect no longer auto-passes: marketing agency gets no Group A boost and exclusions are stated", () => {
  const agency = prospect({
    nisa: "agence marketing",
    siteSnapshot: snapshot({ hasContactForm: false }),
  });
  const boosted = applyBuyingTriggerBoosts(5, "base", agency);
  assert.equal(boosted.score, 5); // old code gave +1 "B2B trust gap" here
  const prompt = buildScoringPrompt(agency, null);
  assert.match(prompt, new RegExp(ICP.exclusions.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(prompt, /score 1–3 regardless/);
});

test("buying-trigger boosts fire for the NEW ICP groups", () => {
  // Group A: construction + no contact form → +1
  const construction = applyBuyingTriggerBoosts(
    6,
    "base",
    prospect({ nisa: "bouwbedrijf", siteSnapshot: snapshot({ hasContactForm: false }) })
  );
  assert.equal(construction.score, 7);
  assert.match(construction.note, /B2B trust gap/);
  // Group B: yoga on Wix → +2; yoga without booking widget → +1 more
  const yoga = applyBuyingTriggerBoosts(
    5,
    "base",
    prospect({ nisa: "studio de yoga", siteSnapshot: snapshot({ techHints: ["Wix"], hasReservation: false }) })
  );
  assert.equal(yoga.score, 8);
  assert.match(yoga.note, /generic builder/);
  assert.match(yoga.note, /no online booking/);
  // Clamped at 10
  const clamped = applyBuyingTriggerBoosts(
    10,
    "base",
    prospect({ nisa: "studio de yoga", siteSnapshot: snapshot({ techHints: ["Wix"] }) })
  );
  assert.equal(clamped.score, 10);
});

test("anti-divergence guard: email prompt and scoring prompt consume the same ICP source", () => {
  // The FR email system prompt must embed the FR exclusion list verbatim…
  assert.ok(EMAIL_SYSTEM_PROMPT.includes(ICP.exclusions.fr));
  assert.ok(EMAIL_SYSTEM_PROMPT.includes(ICP.groupA.fr));
  assert.ok(EMAIL_SYSTEM_PROMPT.includes(ICP.groupB.fr));
  // …and the scoring prompt the EN one — both read src/lib/icp.ts.
  const prompt = buildScoringPrompt(prospect(), null);
  assert.ok(prompt.includes(ICP.exclusions.en));
  assert.ok(prompt.includes(ICP.groupA.en));
  assert.ok(prompt.includes(ICP.groupB.en));
});
