# Admin UI redesign — IA plan + design system (2026-06-12)

Goal: internal B2B ops tool at Linear/Stripe-dashboard calibre. Light theme, neutral palette + one accent, scannable hierarchy, generous whitespace, proper empty states, responsive. **English everywhere in the admin UI.** Prospect-facing surfaces (`/audit*`, `/preview/*`, `/prospects/[id]/brief|proposal` print views, generated emails, unsubscribe page) stay FR/NL and keep their own styling — out of scope.

Hard guardrails: UI-only. No business-logic/API/schema/route changes (pages are server components querying prisma directly, so no new endpoints needed). All existing actions preserved.

## Design tokens (globals.css — single source)

- **Theme:** light. `--bg: #fafafa` (page), `--surface: #ffffff` (cards), `--border: #e4e4e7`, `--border-strong: #d4d4d8`.
- **Text:** `--text: #18181b`, `--text-secondary: #52525b`, `--text-muted: #a1a1aa`.
- **Accent (one):** emerald — `--accent: #059669`, `--accent-soft: #ecfdf5`, `--accent-border: #a7f3d0`. Used for: primary buttons, active nav, key metrics, links. Nothing else is colored except status semantics.
- **Status semantics:** ok=emerald, warn=amber-600/amber-50, error=red-600/red-50, info=sky-600/sky-50, neutral=zinc.
- **Type:** keep Montserrat (display/headings 600-700) + system stack for body? No — Montserrat everywhere, weights: 700 page titles (20-24px), 600 section labels (11px uppercase tracking-wide), 400/500 body (13-14px), JetBrains Mono for numbers/IDs/cursor positions.
- **Spacing/radius:** cards `rounded-xl border bg-white shadow-sm`, page gutter `px-6 lg:px-10 py-8`, section gap `space-y-6`, table rows `h-11`.
- **Utility classes** (globals.css): `.card`, `.section-label`, `.btn-primary`, `.btn-secondary`, `.badge`, `.table-base`, `.empty-state`, `.kpi-value`.
- `STATUS_BOJE` in `src/lib/constants.ts` → light-theme badge variants (UI-only string change).

## IA / per-page lead (commit groups)

**G0 — tokens + shell** (`globals.css`, `layout.tsx`, `Sidebar.tsx`, `Logo`, shared `components/ui/*`): white sidebar w/ zinc-50 page bg, grouped nav (Overview: Dashboard, Autopilot · Pipeline: Prospects, Deals · Insights: Analytics, Revenue · System: Import, Settings), active item = accent text + soft bg, English labels.

**G1 — /autopilot + / (dashboard).**
- `/autopilot` LEADS with: (1) **pipeline funnel** discovered → created → qualified → scheduled → sent → replied (30d, large numbers + conversion % between stages); (2) **per-brief health table**: name, country, status as distinct visual states (● Active / ◐ Cooldown until HH:MM / ◌ Exhausted / ⏸ Paused — manual), cursor `v{variant}:p{position}` (mono), last run found/created + **skip tally chips** ("no email found ×3"), next-run ETA (next cron ≥ cooldownUntil), totals. (3) System strip: reply-detection/follow-up gate status, last runs incl. budget-stopped notes, redrive queue size + lastError visibility. Run-now + quick-setup + editors below.
- `/` dashboard: greeting + 4 KPI cards (closed €, 30d forecast, reply rate, send volume today/cap), "needs attention" list (replies to answer, reminders due, Failed prospects w/ lastError), activity feed, system health. Leads with KPIs, not the autopilot internals (that's /autopilot's job).

**G2 — /prospects + /prospects/[id] (+ /edit).**
- List: toolbar (search, status filter chips incl. Failed, niche select, view presets Hot/Replies), table w/ status badge, qualityScore pill (color by value), rejection/lastError note truncated w/ title tooltip, attemptCount when >0, client-side sort on score/date. Empty state: "Autopilot discovers prospects automatically — active briefs fill this list."
- Detail: header card (name, status, score+note, error banner when lastError), then 2-col: left = emails timeline (status per email, A/B subject, send buttons), replies w/ drafts; right = enrichment (site signals, PSI, decision makers), deal editor, notes, reminders, activity. English labels throughout (was FR/BS mixed).

**G3 — /pipeline + /insights + /revenue:** kanban w/ stage totals + weighted forecast header; insights funnel + per-niche table + subject leaderboard (sortable); revenue stat cards + 12-mo chart + conversions table. Mostly reskin + English + empty states.

**G4 — /settings + /upload + /login + copy sweep:** settings sections as cards w/ clear danger zone; upload dropzone + column guide; login = clean centered card (light). Sweep remaining non-English admin strings (`todayQueue` task titles, notify-fed UI labels, table headers) — UI strings only, logic untouched.

## Empty/loading/error states
Every list: icon + one-line explanation of what fills it + the action that does. Server pages: skeleton via `loading.tsx` where cheap (G0 adds a shared skeleton). Errors: red-50 banner with the stored message (lastError, bccError) — observability must be MORE visible than before.

## Screenshots
No browser tooling available in this environment — before/after screenshots skipped; visual verification via build + manual pass post-deploy.
