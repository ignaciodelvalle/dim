# Overnight run — staging handoff (2026-07-16)

Autonomous run over branch `integration/all-20260703`. Everything below is **committed, pushed, and gated** (each slice: writer → fresh adversarial review → fix bar → `pnpm verify` green + full `pnpm test` green → push). The :3000 QA server is live on the final build.

## What shipped tonight

**Block 1 — real-user blockers**
- Client date defaults were computed in UTC → after ~21h AR they read "tomorrow" → forms rejected "fecha no puede ser futura". New `todayIsoInAr()` / `nowLocalDatetimeInAr()` swept across ~26 owner/org/public forms (weight, intake, bite, vaccine, sighting, denuncia, …).
- Org service-detail page crash (a raw JS `Date` in a Drizzle `sql`` template) fixed.
- Atender copy no longer promises a "verificado por profesional" stamp the H1 policy won't grant.

**Block 2 — operator trust**
- Crons-FALLO root cause established: **local-env artifact** (vitest pollutes the shared `cron_runs` table; prod only ever has real runs, so the banner is honest in both). Not a real bug.
- Outbox retry now reloads the detail so every field syncs (no contradictory "success" over a stale "Fallida"); never a silent /login bounce for a valid session.
- Hard-navigate on the two soft-nav-drop links (site map → sistema, outbox → detalle).
- Crons-down banner on /admin + /admin/sistema (operator copy; curl/Vercel under "Detalle técnico").
- Omnibox empty state suggests DIM-/CAS-/name formats.

**Block 3 — govt/public honesty + admin**
- `/gob/perdidas` list now shows all currently-lost (stock), matching its own KPI + the public 116 (was a 30-day default → 0). "primeros 500 de N" when capped.
- Derived denuncia shows the holding org, not "Sin asignar".
- **Anonymous bite/maltrato public case hides the pet name** (species/photo/timeline/org stay; deep link that would reveal the name also suppressed) — PO decision.
- Panorama out-of-scope `?province` for a govt bounces to their in-scope jurisdiction with a notice.
- Mordeduras rate shows "<0,1" instead of "0,0" when n>0; recent-activity collapses repeated PII searches; observaciones lead with active; cockpit reserves warm tones for decide-now; outbox Intentos "—" + SLA breach-lead + UUIDs under "Detalle técnico"; usuarios show email; govts search; test accounts filtered; date inputs es-AR (Chromium); carousel shows "Mostrando N de M" when capped.

**Block 4 — QOL**
- 3 new choropleth layers: acceso-veterinario (visits/1000), antiparasitario (deworming 12m), índice territorial (0-100, province-only) — each clones an existing dashboard fetcher.
- KPI chips label their temporal basis ("estado actual" vs "período").
- Request coalescing on initial load; "Volver a mi jurisdicción" hidden for admin; CABA-drill stale-KPI flash blanked (aria-busy); denuncia wizard steps inert in both directions.
- Q4 histogram / Q6 unit-history were already present (prior viz-suite arc). **Q5 per-capita DEFERRED** — a ~13-file two-axis-k-anon feature that can't meet DoD headless; full blueprint saved to engram (`panorama/...`).

**Departments plan — Thread A + B**
- **Thread A**: national+department is now served from the cube (superset over the truncated live path); the map auto-fills departments by zoom (≥6.5) colored by the active metric — no toggle, render-only (camera untouched), k-anon hatch preserved. `truncated` flag is honest (unions per-province build-cap flags).
- **Thread B**: additive nullable `locality_id` FK on pets/welfare/cases (migrations 0147/0148), populated at write from the id the resolver already computed. Backfill (local): pets 99.33%, welfare/cases 100%; the residual are synthetic test rows. Manual alias rows for Olivos/Belgrano R. **The FK is not yet a read path** (rollups still use the free-text join) — additive by design.

## STAGING — Ignacio-gated steps (do these to promote)

1. **Apply the pending migrations to the staging Supabase** (forward-only): `0146_ar_localities_locality_name_norm`, `0147_locality_id_fk`, `0148_manual_alias_localities`. Follow `docs/ops/staging-deploy.md` (migrate-then-deploy gate). Without these, the PBA cobertura fix (0146) and the locality FK (0147/0148) don't exist on staging.
2. **Verify Vercel env**: confirm `ANALYTICS_DATABASE_URL` (session pooler, :5432) is set for Production + Preview — else panorama degrades to the >180s pathology. Also confirm `NEXT_PUBLIC_SITE_URL` is set (else the Pampa hero QR encodes a relative URL). `! vercel env ls` on the dim-staging project.
3. **Run the backfill on staging** (after 0147 lands): `scripts/backfill-locality-id.ts` under `NODE_OPTIONS="--conditions=react-server"` — it's idempotent (only touches NULL FKs) and prints before/after match rates.

## Deferred questions for the PO (batch)
- **Date inputs (L1)** are Chromium-only (Firefox/Safari ignore the `lang` attr on native date inputs). Is the operator fleet Chrome/Edge? If not, a custom formatted date input is the real fix.
- **Per-capita (Q5)** deferred with a blueprint — worth it before a pilot, but it's a two-axis k-anon feature needing DB-integration validation.
- The **launchworthy** report (`tmp/hardening-dim-2026-07-15.md`) still lists PO-gated items: Supabase Pro (backups), Sentry (error tracking), CRON_ALERT_WEBHOOK — all deferred by choice while on free tiers.
