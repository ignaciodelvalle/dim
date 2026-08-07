# Tier 1 critique — decisions report (judgment-required findings)

Findings the critique loop SURFACES for PO/architect decision (not auto-fixed —
each changes a privacy/security posture or is a cross-module identity refactor).
Auto-fixable defects are handled in-loop and not listed here.

## DNI hashing — subsystem SOUND (no confirmed leak)

Verified clean: no plaintext-DNI persistence (mig 0106 drops `profiles.dni_number`),
no raw-DNI logging, pepper server-only (no client import, no `NEXT_PUBLIC`),
`dniLast4` display-only (never a query key), erasure nulls the hash columns,
fail-closed contract test-pinned for the Vercel target.

| # | Sev | Finding | Where | Decision needed |
|---|---|---|---|---|
| D1 | MEDIUM | `isRealProdDeploy` gate (`NODE_ENV==='production' && !isLocalDb`, substring-scan of DATABASE_URL) can be fooled on **self-hosted** deploys → silent fallback to the public dev pepper → reversible hashes. NOT reachable on Vercel (sets NODE_ENV=prod + remote host). | `lib/utils/dni-hash.ts:39-42`, `lib/infra/env.ts:49-53` | Harden host detection (parse host, not substring) + positive prod signal? Only matters if we ever self-host. |
| D2 | LOW | Two divergent `normalizeDni` impls — auth: strip `[.\s-]`, 7–8 digits; adoption/stub: strip `\D`, 7–9 digits. No real collision for canonical DNIs; latent consistency smell. | `complete-identity.ts` / `verify-dni.ts` vs `finalize-rules.ts` / `finalize-adoption.ts` / `claim-stub-profile.ts` | Centralize one `normalizeDni` next to `hashDni`; reconcile the length range (7–8 vs 7–9 — which is correct?). Cross-module identity refactor. |
| D3 | LOW/INFO | No `pepper_version` column → a pepper rotation silently orphans every existing hash (no staged rotation possible). No code silently rehashes (that part is safe). | `dni-hash.ts`, `db/schema.ts:415` | Add `pepper_version` for a future staged rotation? Operational decision. |
| D4 | INFO | Non-unique-violation branches surface `err.message` to the user (echoes hash/constraint name, never the raw DNI). | `verify-dni.ts:116`, `claim-stub-profile.ts:130,241` | Generic error text? Minor internals disclosure. |

## Public credential page — subsystem SOUND (no PII leak on active pet)

Verified clean: field-by-field, an active (non-lost) pet's public payload has ZERO
owner PII; lost-mode exposes only first-name + owner-opted-in fields (each gated
at query AND component); DNI never referenced; chip number never rendered;
`/p/` stamped `private, no-store`; token `31^8` uniform crypto-random; finder
writes never return owner data and force `recordedByUserId=null`.

| # | Sev | Finding | Where | Decision needed |
|---|---|---|---|---|
| C1 | MEDIUM | The main `/p/` page rate-limits before any fetch (anti-enumeration), but 4 sibling unauth lookups skip it: `opengraph-image`, `sighting`, `encontre`, `generateMetadata`. The `encontre` form-disabled branch renders owner **phone + email UNTHROTTLED** — same PII the main page throttles. Bounded impact (Tier-0 / opted-in data + big keyspace) but contradicts the documented control. | `app/(public)/p/[publicToken]/{opengraph-image,sighting/page,encontre/page,page(generateMetadata)}` | Match the main page's limit on the PII-rendering siblings? Touches share-scraper behavior on the highest-legit-traffic lost-pet surface — tighten vs owner-recovery friction. |
| C2 | HIGH (grief) | Anonymous write flows (sighting, encontre, notify-owner) are rate-limited but lack the honeypot/dwell-time that welfare reports have. With finder-chosen (spoofable) coords + rotating IPs, a griefer can flood fake "SE BUSCA"/possession `urgent` notifications + pollute the event log. | `src/modules/pets/application/{report-pet-sighting,notify-owner-of-found-pet}.ts`, `.../encontre/action.ts` | Add honeypot + dwell-time (copy welfare pattern)? Trades anti-bot vs friction on the anonymous-finder flow. |
| C3 | INFO | Token entropy (`DIM-` + 31^8) — already tracked as a widening follow-up; only matters in concert with C1. | `lib/.../publicToken.ts`, `page.tsx` header | Widen token length? Low priority. |

## THE CUBE — subsystem SOUND (privacy + fail-safe well-tested)

Verified clean: atomic swap (one txn, no "meta ok but data partial"), build-time
k-anon (sub-k nulled before store), fail-safe + 6h staleness gate (never
stale-as-fresh), deny-all RLS, **partial-scope govt can never read the cube**
(hard-stop on non-admin, server-authoritative actor), no new differencing surface,
reaper-exempt. 1 auto-fixable (CB2, handled in-loop) not listed here.

| # | Sev | Finding | Where | Decision needed |
|---|---|---|---|---|
| CB1 | LOW-MED | Cube reader hardcodes `truncated: false` at the department grain — it structurally can't reproduce the live `PER_LAYER_CAP` (2000) truncation flag. A whole-province drill on Buenos Aires (~2000 INDEC localities) would have live say `truncated:true`, cube say `false` → parity break + the map claims a complete slice it doesn't have. Not triggerable at seed scale. The cap path is also non-deterministic (no ORDER BY). | `load-layer-features-cube.ts:131,152` | Store a per-province locality-truncation flag + OR them in the reader? Honesty posture at national/large-province scale. |
| CB3 | INFO | Comments say "byte-identical / byte-parity" but the enforced (and correct) property is order-independent SET-equality (no ORDER BY; parity test sorts before compare). Documentation-honesty nit — soften wording so nobody builds an order-sensitive consumer. | `cube-builder.ts:9`, `load-layer-features-cube.ts:7`, `repository.ts:1336` | Reword comments only. Trivial — could fold into an auto-fix. |

## k-anon + complementary suppression — cell layer SOUND; MARGINALS leak by differencing

Verified clean: no raw sub-k value escapes a loader (per-cell path, defensively
re-nulled at build-features), suppressed always renders as a distinct hatch
category, department-tier fold preserves k, cube/live differencing closed by
construction, verifiedOnly bounded, k==5 boundary consistent, zero/suppressed/
no-data trichotomy clean. The exposure is in the PUBLISHED MARGINALS, not the cells.
Auto-fixables (KA3/KA5/KA6) handled in-loop, not listed here.

| # | Sev | Finding | Where | Decision needed |
|---|---|---|---|---|
| KA1 | **HIGH** | Complementary suppression stops at "≥2 suppressed cells" — insufficient when the province marginal total is published. Density departments `{A:1,B:5}` → both suppressed, but `total − noLocality − Σvisible = 6` with `A<5,B≥5` → unique `A=1,B=5`. **Sub-k department count recovered by subtraction.** Reachable on density layers (mortalidad/zoonosis/ppp/mordeduras/sintomas) where a province has 2 depts with data. Narrow full-disclosure window (S=6). | `lib/metrics/anonymity.ts:107-138`, `repository.ts:673,1416` | Suppress until the suppressed set's feasibility interval ≥ k (e.g. `Σsuppressed ≥ 2k`, suppress a 3rd cell, or round/suppress the published province marginal). Changes the §U5 "province totals published" posture. |
| KA2 | MED-HIGH | "Province cells never suppressed" is unenforced for DENSITY metrics. Fine for RATE metrics (% published, denominator hidden); for density the published value IS a raw count with no ≥k guarantee — it's the marginal that powers KA1. | `repository.ts:939-974,1391-1405` | Suppress/round small province density counts? Same posture call as KA1. |
| KA4 | MED | Unit-history trend sparkline discloses per-(unit, day) counts below k. Guard suppresses on windowed TOTAL <5, but once total clears 5 the DAILY buckets are unbounded (often 1). Attacker widens the window (query param) to clear k, then reads the daily series → recovers a `(dept, day)` count of 1 the map never exposes. | `repository.ts:3120-3355`, `unit-history/route.ts:102` | k-anon the per-day buckets, or coarsen the sparkline? Design call. |
| KA-auto | — | **FIXED in-loop** (each with regression test + own commit): KA3 mortalidad guard now mirrors the current-state map, no window (`7c4f5c39`, stash-proven no-leak); KA5 `byType` counts the full window (`4faa3e5d`); KA6 suppressed reunificacion units render as hatch (`dc6e2caf`). Cube: CB2 parity now covers CABA + Buenos Aires — **passed, no break** (`0237d4da`); CB3 wording softened (`6cfcf428`). | `repository.ts` | ✅ done |

## Operational note (surfaced by CB2)

The LIVE cobertura Buenos-Aires-locality query (rabies trailing-12m `EXISTS` over
~2000 BA localities) measures **~96s**. This is exactly the query THE CUBE exists
to replace. With `CUBE_READS` OFF (current default), a BA-locality admin drill on
the live path hits the `db-budget` 8s cap → degrades honestly (never hangs), but
the operator sees degraded data there until the cube is activated. Argues for
turning `CUBE_READS=1` (+ Vercel Pro for the */15 refresh) before national rollout.
