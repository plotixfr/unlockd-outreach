import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyForRetry,
  backoffElapsed,
  RETRY_BASE_MS,
  MAX_ATTEMPTS,
  type RedriveProspectShape,
  type RedriveBriefShape,
} from "../redrive";

const BRIEF: RedriveBriefShape = { qualityThreshold: 6, autoGenerate: true, autoSchedule: true };

function p(overrides: Partial<RedriveProspectShape> = {}): RedriveProspectShape {
  return {
    status: "New",
    briefId: "brief-1",
    attemptCount: 0,
    lastAttemptAt: null,
    qualityScore: null,
    emailCount: 0,
    ...overrides,
  };
}

test("transient failure (never scored) → retry-score", () => {
  assert.equal(classifyForRetry(p(), BRIEF), "retry-score");
});

test("hard rejection by scoring is a DECISION — never retried", () => {
  assert.equal(classifyForRetry(p({ qualityScore: 4 }), BRIEF), "decision");
  // …even at the threshold boundary minus one
  assert.equal(classifyForRetry(p({ qualityScore: 5 }), BRIEF), "decision");
});

test("qualified but emailless → retry-generate; manual briefs are never auto-driven", () => {
  assert.equal(classifyForRetry(p({ qualityScore: 7 }), BRIEF), "retry-generate");
  assert.equal(
    classifyForRetry(p({ qualityScore: 7 }), { ...BRIEF, autoGenerate: false }),
    "manual"
  );
  // generated but never scheduled
  assert.equal(classifyForRetry(p({ qualityScore: 7, emailCount: 5 }), BRIEF), "retry-schedule");
  assert.equal(
    classifyForRetry(p({ qualityScore: 7, emailCount: 5 }), { ...BRIEF, autoSchedule: false }),
    "manual"
  );
});

test("retries exhausted → terminal; non-New / CSV prospects → none", () => {
  assert.equal(classifyForRetry(p({ attemptCount: MAX_ATTEMPTS }), BRIEF), "terminal");
  assert.equal(classifyForRetry(p({ status: "Scheduled" }), BRIEF), "none");
  assert.equal(classifyForRetry(p({ briefId: null }), null), "none");
});

test("backoff: 2h after attempt 1, 4h after attempt 2; just-claimed is ineligible", () => {
  const now = new Date("2026-06-12T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  // never attempted → eligible
  assert.equal(backoffElapsed({ attemptCount: 0, lastAttemptAt: null }, now), true);
  // attempt 1: needs 2h
  assert.equal(backoffElapsed({ attemptCount: 1, lastAttemptAt: ago(RETRY_BASE_MS - 1) }, now), false);
  assert.equal(backoffElapsed({ attemptCount: 1, lastAttemptAt: ago(RETRY_BASE_MS) }, now), true);
  // attempt 2: needs 4h
  assert.equal(backoffElapsed({ attemptCount: 2, lastAttemptAt: ago(2 * RETRY_BASE_MS - 1) }, now), false);
  assert.equal(backoffElapsed({ attemptCount: 2, lastAttemptAt: ago(2 * RETRY_BASE_MS) }, now), true);
  // just claimed → ineligible
  assert.equal(backoffElapsed({ attemptCount: 1, lastAttemptAt: now }, now), false);
});
