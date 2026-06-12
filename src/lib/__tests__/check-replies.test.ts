import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBackfillSince, normalizeMessageId } from "../replyMatching";

const NOW = new Date("2026-06-12T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86400000);

test("backfill window covers the oldest active sequence, min 7d, max 30d", () => {
  // Sequence frozen 12 days → window reaches back 12 days, not just 7
  assert.deepEqual(computeBackfillSince([days(12), days(3)], NOW), days(12));
  // All sequences recent → still at least 7 days
  assert.deepEqual(computeBackfillSince([days(2)], NOW), days(7));
  // Ancient sequence → clamped to 30 days
  assert.deepEqual(computeBackfillSince([days(90)], NOW), days(30));
  // No active sequences → default 7 days
  assert.deepEqual(computeBackfillSince([], NOW), days(7));
});

test("message-id normalization strips brackets/whitespace for stable thread matching", () => {
  assert.equal(normalizeMessageId("<ABC.123@mail.example>"), "abc.123@mail.example");
  assert.equal(normalizeMessageId("  <X@y> "), "x@y");
  assert.equal(normalizeMessageId("plain@id"), "plain@id");
  assert.equal(normalizeMessageId(""), null);
  assert.equal(normalizeMessageId(null), null);
  assert.equal(normalizeMessageId("<>"), null);
});
