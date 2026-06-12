# Live verification — 2026-06-12 (post-hotfix)

## Funnel: three reference points

| Metric | OLD baseline (7 days, pre-fix) | First fixed tick (REPAIR_LOG, 12:39 UTC) | Now (after hotfix + 3 manual ticks) |
|---|---|---|---|
| Discovery runs | 187 | 2 briefs/tick | cursor-driven, 18-20 candidates/brief |
| found | 255 | 39 | ~20/brief, cursor advancing (pos 20→21 across runs) |
| created | 35 | 4 (+2 redrive) | flowing; per-brief create cap 2-3 |
| qualified | 6 | 4 | rescored prospects scoring 7-10 |
| **scheduled** | **2** | 1 | **16 prospects in "Scheduled"** |
| emails generated | 15 | 30 | **110** |
| emails sent | 4 ever | +3/tick | 7 (cap-gated, business hours) |

Context for modest absolutes: it's Friday afternoon — most of the 47 reactivated briefs unlock via staggered cooldowns through the weekend, and scheduled autopilot fires resume Monday 05:00 UTC. The structural signals are what matter:

## Acceptance checks

1. **Brief-driven scoring (the pivot repair):** the exact prospects the old scorer rejected now pass with notes referencing their own brief's targeting — `ARC Schoonmaak` (was 2, "Wrong country (Netherlands), wrong niche") → **7** "Established B2B industrial cleaning SME"; `Smartbody Pilates` (was 5, "doesn't match B2B/SaaS profile") → **10** "Strong Group B fit"; `So Ham Yoga Studio` (was 5, "no Group A/B fit") → **10** "Perfect ICP match (Group B yoga studio, Romandie)". **An NL prospect on an NL brief is no longer rejected for country.** ✅
2. **Rescore queue draining at the cost cap:** 26 of 32 repaired prospects still awaiting re-score — redrive processes 5/tick by design (≈ one working day to clear). ✅
3. **Generation failures post-fix:** down from a growing class to 3 open `generate:*` lastErrors (timeout-deferred items the redrive retries with distinct signatures). Root cause was empirically verified — the failed prospect generated 5 emails in 24.6s vs the old 22s cap. ✅
4. **Cursor + observability:** newest DiscoveryRuns carry `variant=0 pos=21 | skipped: {"already in database":2,"invalid email: <detail>":…}` — pagination resumes from the persisted position, never page 1. ✅
5. **504 regression caught and fixed in-session:** ticks 1-2 after the GEN-timeout raise hit FUNCTION_INVOCATION_TIMEOUT because per-segment budgets were additive; one shared invocation deadline (t0+230s) + a generation start-guard now bounds the whole tick. **Tick #3 verification: HTTP 200 in 263s, 6 briefs ran (incl. reactivated CH/FR groups), redrive 3/4 advanced, send sweep shipped 21 emails, follow-ups still correctly gated.** ✅
6. **Reply detection:** code live (Titan host config, backfill-before-unfreeze, In-Reply-To matching) but **credentials not configured — user skipped**; check-replies endpoint correctly reports `{ok:true, skipped, reason: IMAP not configured}` and follow-ups remain gated. The 3 mid-flight sequences (5 Emailed + 1 Follow1) stay frozen at follow-up stage until IMAP_USER/IMAP_PASSWORD exist. ⛔ blocked on user
7. **Statuses now:** Emailed 5 · Follow1 1 · Scheduled 16 · New 45 (40 of those = redrive/rescore queue, draining at 5/tick).

## What Monday should show
6 scheduled fires (05-15 UTC, weekdays): created > 0 across many briefs as staggered cooldowns expire; "New" shrinking; the 26-prospect rescore queue cleared; sends ramping toward the 30/day cap; zero 504s in the cron logs.
