# Session progress — hotfix + replies + redesign + P1 (2026-06-12, prompt v2 numbering)

> Resume rule: read this file + `git log` first; resume from the first incomplete phase.
> Original go-live (CRON_SECRET, verification, reactivation, repair) was completed earlier today — see `docs/REPAIR_LOG.md` + commits `1c3f778`…`5843a9c`.

| Phase | Scope | Status | Evidence / commit |
|---|---|---|---|
| 0 | User input: IMAP_USER/IMAP_PASSWORD + Titan setting | ⛔ SKIPPED BY USER ("Skip for now") | reply detection stays off; follow-ups stay safely gated; everything below proceeds |
| 1 | Hotfix live-tick findings | ✅ DONE | `06b48f4` — GEN_TIMEOUT 22s→90s (verified empirically: failed prospect generated 5 emails in 24.6s > 22s), distinct failure signatures, withTimeout timer cleanup, amnesty 6/6 applied (none had reached Failed), verifyEmail implicit-MX fallback (judgment: keep strict on definitive negatives). Follow-up: first live tick after the fix hit **504** (redrive unbounded with 90s GEN) → `75f06e9` redrive sub-budget 120s. |
| 2 | IMAP reply detection code | ✅ code DONE / live test ⛔ BLOCKED (no creds) | `9cf2755` — Titan default host (env IMAP_HOST/IMAP_PORT), backfill window to oldest active sequence (7–30d), In-Reply-To matching first, gate auto-lifts only after scan.ok, REPLY_TO prefers IMAP_USER at 4 send sites. Live connection test + IMAP_HOST persist + backfill verification deferred until creds exist. |
| 3 | Live verification (manual tick + check-replies) + docs/VERIFICATION.md | ✅ DONE | check-replies guard ✅. Tick #1 → 504 (redrive unbounded) → `75f06e9`; tick #2 → still 504 (budgets ADDITIVE) → `3ab2a68` shared invocation deadline + gen start-guard; **tick #3: HTTP 200 @ 263s, 6 briefs, redrive 3/4 advanced, 21 emails sent**. docs/VERIFICATION.md has funnel vs both baselines. |
| 4 | UI redesign | ✅ DONE | `dc1aebb` G0 shell/tokens · `f266688` WIP checkpoint (agents hit session limit mid-flight — recovered) · `cf39978` G2 prospects (25 files) · `883bf11` G1/G3/G4 dashboard/insights/revenue/upload/login/settings (12 files). Light theme, English admin copy, funnel-first /autopilot, observability surfaced (skip tallies, lastError, retry chips). Screenshots skipped — no browser tooling. |
| 5 | P1 cleanup from COWORK_PROMPT | ✅ DONE | `f95889c` rate-limit public audit endpoints (per-IP + daily DB cap). Deferred (product decisions): Calendly webhook signature enforcement (needs CALENDLY_WEBHOOK_SIGNING_KEY from user), inbound-nurture safety rails (P2), Bosnian/FR strings inside outbound notify emails (operator-facing email content — left). |
| 6 | Final report | ✅ delivered in chat | |

## Notes / decisions
- Credential rotation: deferred by user choice — closed topic.
- Redrive cap stays 5/tick (LLM cost guard) — unchanged; sub-budget added on top.
- 504 tick consequence: up to 5 claimed prospects burned one attempt; backoff (2h) delays their retry — acceptable, amnesty script exists if needed.
- Weekend: no scheduled autopilot fires; manual ticks only. Full tempo resumes Mon 05:00 UTC.
