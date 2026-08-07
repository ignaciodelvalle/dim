1. `package.json:25` · `pnpm verify` runs typecheck/lint/build but never `pnpm test`/`test:coverage` — DB writers, RLS probes, cron/auth integration, and event-schema regressions can ship on verify-only DoD · **HIGH** · append `&& pnpm test` (or `test:coverage`) to the `verify` script.

2. `.github/workflows/ci.yml:47` · CI `check` job runs `lint:authz`/`lint:rls` but omits `lint:authz-scoping` that `verify` runs · **MED** · add `pnpm lint:authz-scoping` to the check job lint step.

3. `__tests__/rls/matrix.test.ts:45` · PostgREST matrix only probes `select`; `insert`/`update`/`delete` cells in `matrix.data.ts` are never exercised · **HIGH** · extend `OPERATIONS_UNDER_TEST` and add per-table write probes with valid payloads.

4. `__tests__/rls/matrix.test.ts:396` · `setupError` (bad/missing seed) logs a warning then `expect(true)` — all role×table probes no-op via `if (setupError) return` and still pass · **HIGH** · fail the setup test when `setupError` is set (`expect(setupError).toBeNull()`).

5. `__tests__/rls/write-path-matrix.test.ts:142` · “write matrix” is catalog introspection for unconditional policies only, not per-role INSERT/UPDATE/DELETE outcomes · **MED** · add behavioral PostgREST write probes (complement to `matrix.test.ts`).

6. `__tests__/profile-self-service.test.ts:125` · `beforeAll` inserts `govt_assignments` with localities `TEST-SS-*` absent from `ar_localities`; worker crash before `afterAll` leaves rows that fail `govt-assignments-locality-integrity.test.ts` · **MED** · use catalog localities or delete assignments in `try/finally` around the file.

7. `__tests__/pet-cache-rederivation.test.ts:149` · Layer-1 sweep selects every `DIM-%` pet in the DB, not just pets created in-file — aborted suites leaving `generatePublicToken()` pets pollute the sweep (TEST-SS class) · **MED** · sweep only pets tagged to a dedicated test owner/email prefix.

8. `__tests__/pet-profile-v2-page-order.test.ts:76` · AGENTS.md block order enforced via `indexOf('className="ln-idrow"')` / JSX substring order — breaks on `cn()`, reorder, or extract-component refactors · **MED** · assert order from `CredentialFace` `renderToStaticMarkup` on `data-section` markers.

9. `__tests__/inicio-structure.test.ts:20` · `readFileSync(PAGE_PATH)` at module load — file move/rename fails the whole file at import, not at assertion · **LOW** · load source inside `describe`/`beforeAll`.

10. `lib/metrics/kpi-catalog.test.ts:112` · `/gob` KPI catalog enforced by parsing `app/gob/page.tsx` imports via `readFileSync` — false reds on import moves/dynamic import refactors · **MED** · export a `GOVT_HOME_KPI_FETCHERS` const from the page module and test that.

11. `e2e/crisis-public.spec.ts:124` · Crisis e2e stops at lost CTA link counts — no submit through `/p/[token]/encontre` (finder-in-possession / sighting) · **HIGH** · add spec that fills and submits the finder form to a success receipt.

12. `e2e/crisis-public.spec.ts:27` · Core crisis cases `test.skip` when `/adoptar` or `/perdidas` has no rows — green CI with zero crisis-path exercise · **MED** · bootstrap dedicated crisis fixture pets/tokens required by these specs.

13. `playwright.config.ts:24` · `fullyParallel: true` (workers only forced to 1 in CI) — `crisis-owner-lost-flow.spec.ts` mutates pet status; local parallel runs can cross-contaminate · **MED** · serial `project` for crisis specs or set `workers: 1` globally.

14. `vitest.config.ts:26` · Coverage thresholds exclude `components/**` — most UI surfaces have no branch ratchet; paint/layout regressions outside co-located `*.test.tsx` are unguarded · **MED** · include `components/pet-profile/**` in coverage thresholds or add composed FlipCard+CredentialFace invariant test.

15. `app/(app)/mis-mascotas/[publicToken]/EventTimeline.test.tsx:17` · Documented `net::ERR_ABORTED` / connection-pool race is explicitly untestable in vitest — only `prefetch={false}` string guard · **MED** · add Playwright spec: load pet profile with Libreta rows mounted, click Anotar, assert `?sheet=anotar` opens.

16. `__tests__/log-scan-location.test.ts:14` · Scan-location/PII contract tested with mocked `@/db`/`next/headers` only — no integration row in `pet_events` · **MED** · add DB integration test calling `logScanAction` and asserting stored payload columns.

17. `lib/infra/miarg-oidc.ts:32` · `isMiArgOidcEnabled()` / OIDC gate has no unit tests; `app/auth/miarg/callback/route.ts` 404/501 path untested · **MED** · add `miarg-oidc.test.ts` + route test for disabled/enabled gate.

18. `scripts/check-authz-scoping.ts:31` · Scoping linter is baseline ratchet-only — scoping holes in baseline action files never fail CI · **MED** · burn down baseline or fail on any `TENANT_GUARD` + caller-supplied resource id without `SCOPING_MARKER`.

19. `package.json:39` · `rls:smoke` (PostgREST cross-account) is manual — not in `verify`, CI, or vitest · **MED** · run `pnpm rls:smoke` in the CI `test` job after `db:bootstrap`.

20. `__tests__/event-payload-validation-convention.test.ts:21` · Discarded-`validateEventPayload` detector is line-regex — multiline assignment patterns can slip · **LOW** · replace with AST walk or extend regex to multiline call spans.
