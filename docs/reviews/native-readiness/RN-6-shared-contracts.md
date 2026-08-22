# RN-6 — Shared contracts

> Adversarial read-only review, 2026-08-19. Builds on RN-1..RN-5 (not repeated).
> Verdict: **EXPENSIVE** — the cheapest of the EXPENSIVE dimensions, closest to CHEAP.

> **Status re-run 2026-08-22 (HEAD d0fe0fad + the 2026-08-22 follow-ups)**
>
> **The framing fact this review opens on is now inverted.** A package
> boundary exists: `pnpm-workspace.yaml` declares `packages: - packages/*`
> (added 2026-08-20 — before that date it really did have only an
> `allowBuilds` block, so the review was accurate when it was written), and
> `@dim/contract` (`packages/contract/`) is a real, zero-runtime-dependency
> package. `pnpm lint:contract` (`scripts/check-contract-purity.ts`) fences its
> purity in `verify` and CI. The event-type union is now PACKAGED, not
> trapped: `db/schema.ts:289` reads `export { EVENT_TYPES, type EventType }
> from "@dim/contract/events"` — the anchor direction Trap 1 warned about is
> inverted; `db/schema.ts` imports FROM the package now, not the other way
> round. Trap 1 (below) is rewritten to match.
>
> | Finding / improvement | Status | Evidence |
> |---|---|---|
> | Improvement 1 — create `packages/contract/`, move the event-type SoT into it | DONE | see framing note above |
> | Improvement 2 — move credential-badges.ts → packages/contract/credential/ | PARTIAL | moved to `lib/domain/credential-badges.ts` (RN-5 F11) — out of the route folder, not yet in the package |
> | Improvement 3 — write the input schemas the actions lack, in the package | PARTIAL | `packages/contract/src/input/` holds an intake schema; one per capture flow is still the target (TRACKS.md T1.3) |
> | Improvement 5 — ship `GET /api/v1/pets/{token}/credential` with payloadVersion + issuedAt/staleAfter | DONE | `713e4416`, 2026-08-21 |
> | Improvements 4, 6, 7, 8 (catalog version-stamping, `*_LABELS` consolidation, locale keys, localities/jurisdiction APIs) | NOT STARTED | unchanged |
>
> **New gap surfaced by having a package now: no CORS anywhere.** PO decision
> #2 ("CORS + a bearer API, never native-direct-Supabase") is **taken but
> unimplemented** — stated explicitly in
> `docs/architecture/api-invariants.md` §9 as of 2026-08-22: "no `/api/v1`
> route sets `Access-Control-*` headers or accepts a bearer token today."
>
> **Verdict update: EXPENSIVE → MODERATE.** The single biggest cost this
> review priced in — "no package boundary exists" — is paid off. What remains
> (input schemas, catalog versioning, copy consolidation, localities/
> jurisdiction APIs, CORS) is exactly the kind of mechanical, well-scoped work
> the original verdict called "the good kind of expensive," now with the
> keystone already placed.

## The framing fact

~~There is **no package boundary**. pnpm-workspace.yaml has only an allowBuilds
block — no `packages:` globs, no packages/ dir. tsconfig maps `@/* → ./*`, one
wildcard.~~ **No longer true — see the status block above.** At the time of
this review, every candidate contract module reached its deps through `@/...`,
and **every `@/` import is a re-export a native package cannot resolve** unless
it also ships the aliased file. The contracts weren't trapped in *Next* so much
as in *one giant path-alias graph anchored to `@/db/schema`* — a 4655-line
Drizzle file importing drizzle-orm/pg-core. "It's just types, easy to share" was
the reading to attack: the types are pure, but they transitively imported from
that ORM file. That anchor is now inverted (`@dim/contract` exists and
`db/schema.ts` imports the event-type union FROM it).

Good news (RN-5 confirmed): the derivation/schema logic is unusually pure.
lib/domain and lib/projections are almost entirely free of next/*, server-only,
@/db connection, @/lib/supabase, env. event-confidence.ts has ZERO imports.
This codebase COULD ship a contract package — it just hasn't drawn the line.

## Packageable-vs-trapped inventory

| Module | Verdict | Evidence |
|---|---|---|
| Event payload zod schemas | PACKAGEABLE after de-anchoring | event-schemas.ts value-imports EVENT_TYPES + findDisease |
| Event type union (SoT) | PACKAGED (2026-08-22, was TRAPPED) | `packages/contract/src/events/event-types.ts` is now the source; `db/schema.ts:289` re-exports `EVENT_TYPES`/`EventType` FROM `@dim/contract/events` — single source, no longer inside the Drizzle file |
| Upcaster registry | PACKAGEABLE but native-hazardous | runs server-side on read; schemas STRICT → a version-behind native client REJECTS a newer payload. Version skew is a real break |
| event-capture-registry (50 events) | PACKAGEABLE as-is | zero framework imports |
| events.ts (summaries/queries) | TRAPPED (DB) | imports sql from drizzle-orm |
| credential-badges.ts | PARTIALLY FIXED (2026-08-22, was TRAPPED) | moved to `lib/domain/credential-badges.ts` (`4c63dbb3`) — out of the /p/ route folder, still pure, but not yet inside `packages/contract` |
| pet-compliance / rabies-observation / libreta-health-status / credential-claims / dim-token / provenance | PACKAGEABLE | all pure lib/type-only |
| event-confidence | PACKAGEABLE as-is | zero imports |
| amendment (WAVE D1 supersede) | PACKAGEABLE | pure (misleadingly in lib/infra) |
| Static catalogs (breeds/PPP, vaccines, diseases, symptoms, service-kinds, drugs, sanitary-vocab, legal-KB, corridors) | PACKAGEABLE — but native ships a COPY, no sync/version stamp | lib/reference/* all pure hardcoded TS; change one → web+native drift silently |
| ar_localities (INDEC) | NEEDS AN API | tens of thousands of DB rows |
| Jurisdiction rules | NEEDS AN API; seed IS a precedent | govt_business_rules + data/legal-baseline (zod-validated, versioned ar-v1/v2, **manifest + signoff** — the only versioned+signed data contract in the repo) |
| es-AR copy | TRAPPED + not structured for a 2nd consumer | format.ts (1475L "all UI strings here"), ~120 NOTIFICATION_TYPE_LABELS, dozens of scattered *_LABELS + 40+ raw-enum leaks (19-i18n review). No keys, no locale param |
| format/operator-vocabulary/sanitary-vocab/pluralizeEs | PACKAGEABLE | pure (type-only db import) |
| Form/input validation | TRAPPED in server actions (doesn't exist as a schema) | actions hand-parse String(formData.get()); the zod validates the assembled DB payload, NOT client input |

## Three skeptic traps

1. ~~**The `@/db/schema` anchor**: the purest module still re-exports EVENT_TYPES
   from the 4655-line Drizzle file — ship as-is and you drag pg-core into a
   phone bundle to read a string array.**~~ **REWRITTEN (2026-08-22): the
   anchor is inverted, not gone.** `EVENT_TYPES` / `EventType` now live in
   `packages/contract/src/events/event-types.ts`, and `db/schema.ts:289`
   re-exports them FROM the package (`export { EVENT_TYPES, type EventType }
   from "@dim/contract/events"`) so the ~90 existing `@/db/schema` consumers
   are untouched while a native client can `import { EVENT_TYPES } from
   "@dim/contract/events"` directly, with zero drizzle-orm in its bundle. The
   remaining risk moved, not disappeared: `db/schema.ts` still imports OTHER
   value-level exports from itself (findDisease, REQUIREMENT_LEVELS) that have
   NOT been moved into the package, so a module reaching for those still drags
   the ORM file in. Type-only imports erase; value imports don't — that part
   of the original warning still holds for everything not yet migrated.
2. **Copy is not i18n**: no next-intl/i18next/react-intl anywhere. "Centralized
   copy" = Spanish string literals, no message keys, no locale param; already
   leaks in 40+ sites. A native app can call eventTypeLabel() only by importing
   the whole alias-bound graph, and can never translate.
3. **The zod schemas validate the wrong shape**: they guard the immutable log
   at insert (snake_case, derived fields). The client submits camelCase form
   fields. "Native runs the same validation" needs a NEW input schema that
   doesn't exist — same root as RN-1's unwritten client-input contract.

## Ranked improvements (native cheaper AND web better today)

1. **Create `packages/contract/` (first workspace boundary); move the event
   type SoT into it** and have db/schema.ts import FROM the package. Kills the
   drizzle anchor on every pure module. One const move + re-export.
2. **Move credential-badges.ts → packages/contract/credential/** (RN-5 B34).
   OG/degraded-card/cartel/export stop re-deriving the projection.
3. **Write the input schemas the actions lack, in the package** — one zod
   object per capture flow (camelCase, client-shaped), used by the action AND
   shippable for pre-submit validation. Replaces ~40 lines of
   String(formData.get()) per action; the offline-validation seam RN-1 wants.
4. **Version-stamp the static catalogs + drift guard** reusing the
   data/legal-baseline manifest+signoff pattern; extend the existing
   check-catalog-drift.ts to fail CI on an unversioned change.
5. **Ship `GET /api/v1/pets/{token}/credential` with payloadVersion +
   issuedAt/staleAfter** (merges RN-5 B33 / RN-1 B5). The upcaster runs
   server-side so a version-behind client never sees a shape its strict schema
   rejects — the ANSWER to the skew hazard, not a workaround.
6. **Consolidate the scattered *_LABELS into packages/contract/copy/** and
   route the 19-i18n leaks through them. Closes 40+ raw-enum bugs directly.
7. **Locale-keyed structure for the highest-traffic labels** (event types,
   notification types, statuses) — keys not literals; the only path to a
   non-Spanish-only second consumer. Do the ~120 notification labels +
   eventTypeLabel first (the push/timeline surfaces the pitch is built on).
8. **Publish localities + jurisdiction-rules read APIs** (can't ship as
   files). The localities use-case already exists — expose /api/v1/localities
   so both pickers share one contract.

## Verdict: EXPENSIVE (cheapest of the EXPENSIVE dimensions)

The raw material is better than any other dimension — pure derivation layer,
pure zod schemas, pure catalogs, and a SINGLE source of truth for event types
(no schema/union/enum/label quadruplication, contrary to the usual). Not a
BLOCKER: nobody redesigns the logic. Not CHEAP either: no package boundary
exists, every pure module threads through @/* and drags a 4655-line Drizzle
schema for a single enum, the "centralized" copy is keyless Spanish literals
that already leak in 40+ places, the form-validation zod validates the DB write
shape not client input, and the two datasets native most needs (localities,
jurisdiction rules) are DB-resident and need APIs that don't exist. The work is
mechanical (move files, draw a boundary, add input schemas, version catalogs) —
the good kind of expensive — and data/legal-baseline proves the team already
knows how to ship a signed versioned contract. Improvements 1-3 are a few days
and simultaneously de-risk RN-1 testability and RN-5's offline story, so
schedule R6 BEFORE the native team starts.
