# Config-theater parity audit — govt_business_rules

- **Ground truth**: branch `integration/all-20260703` @ `5cc5ef11` (`git -C C:/dev/dim branch --show-current && git -C C:/dev/dim rev-parse --short HEAD`), 2026-07-03, canonical checkout `C:/dev/dim`.
- **Question**: do the 8 rule types in `lib/domain/rule-types-registry.ts` actually change app behavior, or only what `/admin/reglas` displays?
- **Method**: per type, trace write UI (`app/gob/reglas/[country]/[province]/[locality]/nueva/forms.ts` → `RULE_FORM_REGISTRY`), resolution sites (`rg -n 'resolveBusinessRule' --type ts`), enforcement, and hardcoded shadows. Every claim carries its command.

## Parity table

| Rule type | Write UI | Resolution sites | Enforcement | Hardcoded shadow | Verdict |
|---|---|---|---|---|---|
| `ppp_breed_list` | yes (`forms.ts:51`) | `lib/infra/breeds-server.ts:29` (jurisdiction param); `lib/infra/ppp-classification.ts:38` → write sites `src/modules/pets/actions.ts:171,276` + `src/modules/pets/application/intake/create-intake.ts:278`, all with pet's own jurisdiction | `pets.potentially_dangerous_breed` flag persisted; reeval hook + impact preview registered (`lib/infra/rule-types-effects.ts:35-38`) | Client-only sync list `lib/reference/breeds.ts:96` used by `components/PetForm.tsx:148` for the inline typing warning (server persists via resolver, so display-only) | **WIRED** |
| `ppp_weight_threshold` | yes (`forms.ts:52`) | `lib/infra/ppp-classification.ts:39` (same jurisdiction as breed list) | `classifyPpp` OR-composition (`ppp-classification.ts:64-83`); ships dark until an admin row sets real `kg` (PO #604); reeval hook + impact preview (`rule-types-effects.ts:39-42`) | Intake passes `null` weight — `create-intake.ts:278-287` (no weight field; documented follow-up in the comment at :272-277) | **WIRED** (dark by design; intake caveat) |
| `ppp_attestation_required_registries` | yes (`forms.ts:53`) | **none** — `rg -n 'resolveBusinessRule' --type ts` has zero hits for this type | none — attestation flow (`dangerous-breed-attestation-use-case.ts`) takes `registry` as free input; compliance projection doesn't read it | Attestation form hardcodes its own registry list: `REGISTRY_OPTIONS` at `app/(app)/mis-mascotas/[publicToken]/eventos/atestar-raza-peligrosa/DangerousBreedAttestationForm.tsx:14` | **THEATER** |
| `physical_credential_channels` | yes (`forms.ts:54`) | `lib/infra/physical-credential-channels.ts:24`, consumed at `app/(app)/mis-mascotas/[publicToken]/page.tsx:292` with pet's jurisdiction | Gates which channels render in the chapita sheet (`_chapita/PhysicalTagInterestSheet.tsx:119-140`), incl. provider name/URL | None found (config-only by design — `rule-types-effects.ts:9-12`); note gating is UI-side, no server re-check on the interest action | **WIRED** |
| `rabies_observation_window` | yes (`forms.ts:55`) | `lib/analytics/surveillance-metrics.ts:318` (per assigned jurisdiction, loop) and `:303` (country fallback for global scope — matches declared `jurisdiction-metric` scope) | Drives `closedWithinWindow` / `openBreaches` / `compliancePct` in the surveillance metric queries | `RABIES_OBSERVATION_WINDOW_DAYS = 10` exported at `surveillance-metrics.ts:64` but no consumer bypasses the resolver (`rg -n 'RABIES_OBSERVATION_WINDOW_DAYS' --type ts` → definition + defaults doc only) | **WIRED** |
| `due_soon_window` | yes (`forms.ts:56`) | `src/modules/pets/application/tab-data/get-libreta-face-data.ts:139` (pet's own jurisdiction) | Threaded into `computeVaccinationSummary(...)` at `get-libreta-face-data.ts:174-179` → `due_soon` status at `libreta-health-status.ts:185` | `DUE_SOON_WINDOW_DAYS = 30` default param (`libreta-health-status.ts:73,106`); only non-passing caller is `computeLibretaHealthStatus:261`, which has **no production caller** (`tab-data/types.ts:8` documents it). Public page tier2 "vigente" uses its own 365-day rule (`app/(public)/p/[publicToken]/page.tsx:220-225`, documented as v1) | **WIRED** (dead-code shadow only) |
| `reminder_windows` | yes (`forms.ts:57`) | `lib/infra/notifications.ts:80` (country-level once per sweep — matches declared `global` scope, ADR-4 item 3) | `payload.aheadDays` sets `windowEnd` in the vaccine-due cron query (`notifications.ts:85-86,112`) | `payload.cadences` is **never read** (`rg -n 'cadences' --type ts` → defaults/validators/registry/tests only); throttle cadences hardcoded in `runVaccineDueScan` (:49-53); the form always writes `cadences: []` (`rule-types-registry.ts:172`) | **PARTIAL** (aheadDays wired; cadences theater) |
| `long_stay_days` | yes (`forms.ts:58`) | `lib/analytics/org-dashboard.ts:250` via the org's own jurisdiction row (:241-254 — matches declared `org` scope) | `payload.days` sets the SQL custody cutoff (`org-dashboard.ts:259,326`) → `long_stay` attention flag | None — sole consumer resolves; default lives only in `business-rules-defaults.ts:118` | **WIRED** |

Commands per row: `rg -n 'resolveBusinessRule' --type ts` (resolution), `rg -n '<type-name>' -g '*.ts*'` (consumers), `rg -n 'REGISTRY_OPTIONS' app/(app)/mis-mascotas` (attestation shadow), `rg -n 'cadences' --type ts` (reminder shadow).

## Rule-changed → re-eval → notify loop

- `lib/infra/rule-types-effects.ts:34-43`: **only** `ppp_breed_list` and `ppp_weight_threshold` register a `reevalHook` (both → `reEvaluatePppClassificationChange`) + `impactPreview`. Confirmed — no other type has effects.
- This is correct, not a gap: PPP is the only rule whose output is **materialized** on a row (`pets.potentially_dangerous_breed`). The other wired types are computed-on-read (libreta summary, dashboards, cron sweep), so a rule change silently applies on the next read/cron run — no re-eval needed, and owners are not notified of window changes (acceptable; flag only if a future rule type materializes state).

## Known in-flight gaps (confirmed, not new findings)

- `lib/projections/pet-compliance.ts:83` — `FOOTNOTE` legal citations are hardcoded per-norm, not jurisdiction-resolved (legal intake gap #2). Confirmed THEATER-adjacent, but in scope of the in-flight jurisdiction-compliance SDD (2026-07-03) — do not double-file.
- No `requirement_level` dimension on rules — same SDD scope.

## Fix backlog (by impact)

1. **`ppp_attestation_required_registries` is pure theater**: wire `DangerousBreedAttestationForm.tsx:14` `REGISTRY_OPTIONS` (and/or the compliance projection's attestation obligation) to resolve the rule for the pet's jurisdiction — or pull the form from the console until a consumer exists. An admin editing this rule today changes nothing.
2. **`reminder_windows.cadences` is schema theater**: either consume `cadences` in `runVaccineDueScan` throttling or drop the field from the payload/schema — the console writes `[]` unconditionally, so any hand-inserted cadence row is silently ignored.
3. **Intake path defeats `ppp_weight_threshold`**: `create-intake.ts` passes `null` weight (no form field), so shelter-intaken dogs can never be weight-flagged. Add the weight field (already flagged as follow-up in the code comment).
4. **Inline PPP warning ignores jurisdiction overrides**: `PetForm.tsx:148` uses the static country list, so a locality that adds a breed shows no inline warning (server classification is still correct). Low impact — sync client shim by design; consider passing the resolved list as a prop.
5. **Public credential tier2 "vacunación vigente" uses a fixed 365-day rule** (`p/[publicToken]/page.tsx:220-225`) rather than catalog/due-soon-aware summary — already marked as a future PR in the code.

## Already good

- All 8 types have console forms (`RULE_FORM_REGISTRY`, `forms.ts:48-59`) — no write-side gaps.
- 6 of 8 types are resolved AND enforced with jurisdiction scoping that matches their declared `resolutionScope` (pet / org / jurisdiction-metric / global) — including the correct country-level fallback for global aggregates in surveillance metrics.
- The PPP write path, re-eval sweep, and impact preview all share one composed classifier (`classifyPpp`), so console edits, registration, and sweeps cannot diverge.
- Resolver cascade (locality > province > country > default) has direct test coverage for the promoted types (`__tests__/business-rules-resolver.test.ts:159-215`).
