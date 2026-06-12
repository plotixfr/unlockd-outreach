# Session progress — hotfix + replies + redesign + P1 (2026-06-12, prompt v2 numbering)

> Resume rule: read this file + `git log` first; resume from the first incomplete phase.
> Original go-live (CRON_SECRET, verification, reactivation, repair) was completed earlier today — see `docs/REPAIR_LOG.md` + commits `1c3f778`…`5843a9c`.

| Phase | Scope | Status | Evidence / commit |
|---|---|---|---|
| 0 | User input: IMAP_USER/IMAP_PASSWORD + Titan setting | ⛔ SKIPPED BY USER ("Skip for now") | reply detection stays off; follow-ups stay safely gated; everything below proceeds |
| 1 | Hotfix live-tick findings | ✅ DONE | `06b48f4` — GEN_TIMEOUT 22s→90s (verified empirically: failed prospect generated 5 emails in 24.6s > 22s), distinct failure signatures, withTimeout timer cleanup, amnesty 6/6 applied (none had reached Failed), verifyEmail implicit-MX fallback (judgment: keep strict on definitive negatives). Follow-up: first live tick after the fix hit **504** (redrive unbounded with 90s GEN) → `75f06e9` redrive sub-budget 120s. |
| 2 | IMAP reply detection code | ✅ code DONE / live test ⛔ BLOCKED (no creds) | `9cf2755` — Titan default host (env IMAP_HOST/IMAP_PORT), backfill window to oldest active sequence (7–30d), In-Reply-To matching first, gate auto-lifts only after scan.ok, REPLY_TO prefers IMAP_USER at 4 send sites. Live connection test + IMAP_HOST persist + backfill verification deferred until creds exist. |
| 3 | Live verification (manual tick + check-replies) + docs/VERIFICATION.md | 🔄 in progress | check-replies: `{ok:true, skipped, reason: IMAP not configured}` ✅ guard works. Tick #1 → 504 (caught the redrive-budget bug — fixed above). Tick #2 after `75f06e9` pending deploy. |
| 4 | UI redesign (English admin UI, light theme, funnel-first /autopilot, docs/REDESIGN.md) | pending | |
| 5 | P1 cleanup from COWORK_PROMPT | pending | P1-4/P1-5 already fixed in go-live; remaining: public audit rate limiting; P1-7 = Phase 2 (creds blocked) |
| 6 | Final report | pending | |

## Notes / decisions
- Credential rotation: deferred by user choice — closed topic.
- Redrive cap stays 5/tick (LLM cost guard) — unchanged; sub-budget added on top.
- 504 tick consequence: up to 5 claimed prospects burned one attempt; backoff (2h) delays their retry — acceptable, amnesty script exists if needed.
- Weekend: no scheduled autopilot fires; manual ticks only. Full tempo resumes Mon 05:00 UTC.
