# Inverse sweep — dead code / stale artifacts (cursor, 2026-07-11)

> READ-ONLY inventory feeding task #27 (post-#21 hygiene batch). Conservative: doubt → KEEP.

Read-only inverse sweep on `integration/all-20260703`. Conservative: when in doubt → KEEP. Panorama rail/selects marked **pending #21**, not deletable.

| Item | Kind | Evidence | Disposition |
|---|---|---|---|
| `DashboardChart` + `DashboardTooltip` | DEAD CODE | `rg DashboardChart` / `DashboardTooltip` → only self-refs in `components/charts/DashboardChart.tsx`, `DashboardTooltip.tsx` (+ comment in `viz-scales.ts`). Pages use `TimeSeriesChart*` / `ForecastChart*` / `StackedTimeSeriesChart*` instead | **DELETE NOW safe** |
| `RAMP_BLUE_DARK` + `SCALE_BLUE_DARK_SEQ` | DEAD CODE (post light-theme) | Defined `lib/analytics/viz-scales.ts:68-77`; `rg RAMP_BLUE_DARK` / `SCALE_BLUE_DARK_SEQ` → only `viz-scales.ts` + `__tests__/viz-scales.test.ts` (0 production paint paths). Live map uses light canvas (`SituationalMap.tsx:423-427`) + `SCALE_BLUE_SEQ` | **DELETE NOW safe** (drop exports + dark-ramp tests; keep `RAMP_BLUE` / `SCALE_BLUE_SEQ`) |
| `fetchSenasaBatch` / `senasa-export-query.ts` | DEAD CODE (scaffold) | `rg fetchSenasaBatch` → only definition; pure `senasa-export.ts` tested, query never wired to a route. Spec: `docs/design/sdd/2026-07-07-senasa-lsucyf-batch-export.md` | **KEEP-intentional** (shipped IO stage, UI not landed) |
| Panorama **342px right rail** + rail-mounted `MapLegends` / `JurisdictionSwitcher` / `PeriodPicker` disclosure / `PanoramaMetricsColumn` / `RankedUnitsPanel` / `PanoramaReading` / `PanoramaCaption` | DEAD-SOON (layout) | Still live in `PanoramaConsole.tsx:~3456-3593` (`lg:w-[342px]`). Plan: `docs/plans/panorama-v2-polish.md:53-99` eliminates rail into overlays + dock. `PanoramaDock.tsx` already partially wired (~line 38 import, ~3440 dock) | **DELETE AFTER #21** (pending #21) |
| Rail period/scope `<select>` pattern | STALE UI (about to move) | Plan item 3–4: remove Provincia/Localidad selects from rail; breadcrumb + `JurisdictionSwitcher` dropdown (`panorama-v2-polish.md:63-68`) | **DELETE AFTER #21** (pending #21) — do not rip now |
| `CUBE_READS` | FEATURE FLAG | `load-layer-features-cube.ts:77` `=== "1"`; default OFF; docs treat as future enable (`tier1-decisions.md`, cube design) | **KEEP-intentional** (real rollback gate, not stuck-on) |
| `NEXT_PUBLIC_DEMO_MODE` / `isMiArgOidcEnabled()` | FEATURE FLAG | Demo banner + OIDC stub gates; both intentionally off in prod | **KEEP-intentional** |
| Hardcoded “always one value” env gates | FEATURE FLAG | Spot-check of `process.env.* ===` → mostly `NODE_ENV` / test; no permanently-true product flag found | **KEEP** (none to delete) |
| `viz-scales` comments still describe dark situation-room as current consumer of dark ramps | STALE DOC (in code) | `viz-scales.ts:44-66`, `:134`, `:138-141`, `:154` still say dark navy canvas / `RAMP_BLUE_DARK` for panorama | **UPDATE DOC** (comments only; after deleting dark ramps) |
| `docs/.../2026-07-04-panorama-cartography-benchmark.md` “on dark canvas” + `PanoramaKpiStrip` | STALE DOC | Line ~92 “dark canvas”; ~96 refs deleted `PanoramaKpiStrip` | **UPDATE DOC** (dated audit; add “pre-light / pre-#21” banner) |
| `docs/.../2026-07-11-panorama-v2-mockup.html` (dark `#0a0f1e`) vs `.../panorama-v2C/` (light) | ORPHAN / near-dup doc | Dark mockup body `#0a0f1e` (`v2-mockup.html:13`); PO chose light v2C (`panorama-v2-polish.md:28-29`). Both still referenced | **UPDATE DOC after #21** — keep v2C as authority; demote/archive dark mockup (don’t delete mid-#21) |
| v2C README names `PanoramaKpiStrip`, `OperatorShell` as separate modules | STALE DOC | `panorama-v2C/README.md:10-12`; strip retired (comments in `PanoramaConsole.tsx`/`PanoramaKpiFooter.tsx`); `OperatorShell` is private inside `AppShell.tsx:130` | **UPDATE DOC after #21** |
| `AGENTS.md` / `docs/superpowers/README.md` root `lib/*.ts` paths | STALE DOC | Claims `lib/scan-retention.ts`, `lib/miarg-oidc.ts`, `lib/owner-nudges.ts`, `lib/auth-guards.ts`, `lib/govt-dashboards.ts`, `lib/campaign-metrics.ts` — actual: `lib/infra/*` / `lib/analytics/*` (0 files at claimed paths) | **UPDATE DOC** |
| `scripts/cursor-genesis.ts`, `scripts/cursor-val-deep-c.ts` | ORPHAN SCRIPT | Not in `package.json` scripts; used via `pnpm exec tsx`; cited by `docs/reviews/results/genesis.md`, `val-deep-C-infra.md` | **KEEP-intentional** (review harnesses) |
| Doc refs `scripts/_deep-c-probes.ts` | ORPHAN REF | `val-deep-C-infra.md:10` — file **missing** from `scripts/` | **UPDATE DOC** (drop dead path) |
| Codemods (`codemod-poncho-tokens`, `codemod-purge-dark`, `codemod-status-tints`) | ORPHAN-ish SCRIPT | Not in `package.json`; listed under “archived in-tree” in `scripts/README.md:71-77`; still referenced by `check-design-tokens.ts` autofix hints | **KEEP-intentional** |
| `migrate-vets-to-clinics.ts` | ONE-SHOT SCRIPT | Applied; kept for `__tests__/migrate-vets-to-clinics.test.ts` (`scripts/README.md:14`) | **KEEP-intentional** |
| `seed-owner-demo.ts` | SCRIPT not in package.json | Documented in `docs/demo/walkthrough-script-2026-07-01.md`; run via `tsx` | **KEEP-intentional** |
| QA scripts (`qa-routes`, `qa-timing`, `qa-query-census`, `qa-session`, `qa-monitor.ps1`) | SCRIPT not in package.json | Documented in `scripts/README.md` + ops docs | **KEEP-intentional** |
| Committed `.png` / stray HTML test artifacts | ORPHAN FILES | `**/*.png` under repo → 0; only intentional design HTML mockups under `docs/design/handoffs/` | **KEEP** (nothing accidental found) |
| `package.json` dependencies | DEPENDENCIES | Spot-check: `resend`, `vaul`, `recharts`, `pdf-lib`, `sonner`, `polylabel`, `@axe-core/playwright`, `sharp` (dynamic `import("sharp")` in `lib/infra/uploads.ts`) — all have importers | **KEEP** (no zero-import deps) |
| `CUBE_READS` path / cube tables while flag OFF | LATENT INFRA | Live + cube reader coexist; flag OFF = live fallback | **KEEP-intentional** (not excess until national enablement decision) |

### 5-line cleanup surface

1. **Safe now (~2 modules):** delete unused `DashboardChart`/`DashboardTooltip`; delete unused dark ramps `RAMP_BLUE_DARK`/`SCALE_BLUE_DARK_SEQ` + their tests.  
2. **Do not touch until #21:** panorama 342px rail and its selects/legends/rankings/metrics — already partially dual-mounted with `PanoramaDock`; ripping early breaks the interim console.  
3. **Docs debt (high value, low risk):** fix migrated `lib/*` → `lib/infra|analytics/*` paths in `AGENTS.md` / superpowers README; date-stamp dark-canvas / `PanoramaKpiStrip` docs; archive dark `panorama-v2-mockup.html` after #21 lands on light v2C.  
4. **Flags/deps/scripts:** no stuck feature flags, no unused npm deps, no accidental committed PNGs; cursor/QA/codemod scripts are intentional orphans.  
5. **Rough size:** ~3–5 files delete-now; ~1 large console slice after #21; ~6–10 doc path/theme fixes — not a mass-delete tree.
