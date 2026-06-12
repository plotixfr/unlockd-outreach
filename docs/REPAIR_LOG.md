# Repair log — rescore-icp-pivot (2026-06-12)

## Context

On 2026-06-08 the product pivoted to a new ICP (Group A industrial/B2B SMEs, Group B premium lifestyle businesses, markets FR/CH/NL). The quality scorer kept using the pre-pivot prompt ("B2B professional services / French tech startups, France-only") until commit `cb91e26` and rejected exactly what the briefs hunted. This one-off repair (`scripts/repair-rescore-icp-pivot.ts`, dry-run by default, `--apply` to mutate) reset those wrongly-rejected prospects so the redrive pass (commit `9b8b875`) re-scores them with the current brief-driven prompt at its existing 5-per-run LLM cost cap.

## Selection & safety

- Only prospects: status `New`, discovered by a brief, `qualityScore` below their brief's threshold, **zero generated emails** (sent/scheduled emails untouchable by construction), not already tagged.
- Note must match old-ICP rejection language ("doesn't match B2B/SaaS profile", "wrong niche", "Wrong country", "no Group A/B fit", …) and must NOT match legitimate-rejection patterns (bounce, duplicate, no contact, dead business, …).
- JSON backup of all affected rows written before mutation (local `scripts/backups/`, not committed).
- Mutation: `qualityScore`/`qualityNote` nulled, `attemptCount`/`lastAttemptAt`/`lastError` reset, `rescore-icp-pivot` tag appended to notes. No scoring inside the script. Briefs untouched.

## Numbers

| | matched | ambiguous | skipped | applied |
|---|---|---|---|---|
| Dry run + apply | 32 | 0 | 8 | **32/32** |

Skipped breakdown: 7 with score ≥ threshold (fresh prospects + redrive re-scores — not rejections), 1 legitimate quality rejection (`Boby la Plante` — "Shopify site is functional", not old-ICP reasoning).

### Prospect counts by status

| Status | Before repair | After repair |
|---|---|---|
| New | 48 | 48 (unchanged — repair never changes status) |
| Emailed | 5 | 5 |
| Follow1 | 1 | 1 |

### Score-state of `New` prospects (the actual change)

| | Before | After |
|---|---|---|
| New, awaiting score (redrive queue) | 8 | **40** |
| New, scored & kept | 40 | 8 |
| Tagged `rescore-icp-pivot` | 0 | 32 |

Idempotency verified: immediate dry re-run matches 0.

## Expected follow-through

Redrive re-scores 5 per autopilot fire (6 fires/weekday) → the 32-prospect queue clears in roughly one working day of cron cycles. Prospects clearing the threshold proceed automatically to generation → scheduling → send.
