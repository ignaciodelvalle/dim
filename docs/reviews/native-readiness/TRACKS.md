# Native readiness — track plan

> Execution plan derived from [SYNTHESIS.md](SYNTHESIS.md) (RN-1..RN-8, 2026-08-19).
> Track 0 is **shipped**. Tracks 1–4 are pending. This document is written for
> architectural review: every "today" claim below was re-verified against
> `integration/all-20260703` @ `35c1a3d4`, not copied from the review docs.
>
> Each track states three things separately and honestly:
> **Today** (what exists, verified) · **Target** (the end state) · **Work** (the
> concrete change). Where the gap between Today and Target is larger than the
> ticket implies, it says so.

## Contents

- [Track 0 — shipped](#track-0--shipped-2026-08-19)
- [Track 1 — the boundary](#track-1--the-boundary)
- [Track 2 — the two flagship reads](#track-2--the-two-flagship-reads)
- [Track 3 — the channels](#track-3--the-channels)
- [Track 4 — the trust model](#track-4--the-trust-model-gated)
- [Not in any track](#not-in-any-track-honest-omissions)
- [Sequencing and critical path](#sequencing-and-critical-path)
- [Where this plan is weakest](#where-this-plan-is-weakest)

---

## Track 0 — shipped (2026-08-19)

| Ticket | Commit | What |
|---|---|---|
| RN-4 B24 | `f6efb1dd` | `revocations` bucket INSERT restricted to admin/govt — closed a live arbitrary-write vector |
| RN-3 B17 | `1310813e` | daily overdue-vaccine re-issue no longer pushes — killed the 01:00 ART push |
| RN-2 B10 | `35c1a3d4` | failed code exchange lands on `/recuperar` with a visible error, not an unread flag |

Note on scope honesty: B24 closed the **`revocations`** bucket. The same
blanket `bucket_id`-only INSERT grant pattern on **`pet-photos`** and
**`event-attachments`** was left in place deliberately — closing those without
the signed-ticket endpoint (B25) would break live upload paths. They remain
open; they are scheduled in Track 3 (T3.4), and until then the validation
bypass is still reachable on those two buckets by an authenticated account.

---

## Track 1 — the boundary

**Goal:** a native team can write code against a stable contract instead of
reverse-engineering RSC pages. Nothing here needs the mobile team to exist.

### T1.1 — `packages/contract/` (B40 + B46 + B47)

**Today (verified).** There is no package boundary at all.
`pnpm-workspace.yaml` exists but declares only `allowBuilds` — it has **no
`packages:` key**, so the repo is not a workspace in any usable sense.
`db/schema.ts` is a single **4,655-line** file, and every pure module that
needs one enum drags it in through `@/*`. Two genuinely portable assets already
exist in the right shape: the event-type source of truth (`lib/events/events.ts`
— single SoT, no second copy) and `lib/analytics/viz-scales.ts` (pure, tested).
Design tokens: there is no `tokens.ts` and no `tailwind.config`; the system is
one `@theme` block in `app/globals.css` plus ~4,400 lines of hand-authored
`.ln-*` CSS.

**Target.** A framework-free `packages/contract` — no `next`, no `drizzle`, no
`react` — that both the web app and a React Native app install. `db/schema.ts`
imports the event-type SoT *from* the package, inverting today's anchor.

**Work.**
1. Add `packages:` to `pnpm-workspace.yaml`; scaffold `packages/contract` with
   its own `tsconfig` and zero runtime deps.
2. Move the event-type SoT into the package; rewire `db/schema.ts` to import
   from it. This is the single highest-leverage move in the track — it is what
   unhooks every pure module from the ORM.
3. Move `viz-scales.ts` in unchanged as the proof-of-shape, and fix its false
   header claim while it moves (B47).
4. Codemod the `@theme` colors + scales into a typed TS object; **generate**
   `globals.css`'s `@theme` block from it (B46).
5. New ratchet `scripts/check-contract-purity.ts`: fails on any `next`/
   `drizzle`/`react` import inside `packages/contract`, and on `globals.css`
   drifting from the generated output.

**Honest gap.** Step 4 captures roughly **35%** of the design system. The
semantic credential/libreta identity — the other two-thirds — is `.ln-*` CSS
with raw px off the token scale and a CSS-var cascade that has no React Native
equivalent. It must be **re-architected as JS theme objects, not exported**
(B48, B49). That work is not in this track and should not be implied by
"tokens are done".

**Status 2026-08-20 — steps 1, 2, 3 and 5 SHIPPED; step 4 (B46) not started.**
`packages/contract` exists as `@dim/contract` (source-published TypeScript, zero
dependencies, `pnpm lint:contract` in `verify` and CI). `db/schema.ts` imports
`EVENT_TYPES` / `EventType` from the package and re-exports them, so the ~90
existing consumers are untouched; five pure modules were migrated off the
re-export deliberately (`src/modules/cases/domain/{available-actions,case-rules,
lifecycles/types}.ts`, `lib/domain/titular-only.ts`, `lib/events/event-schemas.ts`).
`viz-scales.ts` and `color-distance.ts` moved in with their tests, and the false
header claim was corrected (B47). The design-token codemod (B46) is untouched —
it regenerates a stylesheet the whole product depends on and is its own change.

**Two "Today (verified)" claims above were wrong about the code.** The event-type
source of truth was **`db/schema.ts:278`**, not `lib/events/events.ts` — that
file is timeline-rendering prose helpers that *import* `EventType` from the
schema. And `db/schema.ts` measured **4,835** lines, not 4,655. Both were
verified against `7363b419` before the move.

### T1.2 — `requireLiveUser()` + `createClientFromBearer` (B2 = B12 = RN-8 #2)

**Today (verified).** Guards live in `lib/infra/auth-guards.ts` and
`lib/infra/pet-access.ts`. `requirePetAccess` **already returns a result
shape** — the template exists and is proven. But write boundaries call bare
`getUser()`, and maintenance / erasure / deactivation enforcement lives in
**layouts**. Authorization itself is 100% DB-resolved (zero `auth.jwt()` across
276 RLS policies) — that property is the reason a bearer entry point is cheap,
and it must be protected as an invariant, not quietly eroded.

**Target.** One result-shaped guard —
`{ ok: true, user } | { ok: false, reason: NO_SESSION | ACCOUNT_ERASED | MAINTENANCE | DEACTIVATED }`
— used by every mutation entry point regardless of whether the credential
arrived as a cookie or a bearer token. The redirecting variant becomes a thin
wrapper over it.

**Work.**
1. Implement the guard; convert `requireUser()`'s redirect behaviour into a
   wrapper.
2. `createClientFromBearer(authorizationHeader)` — the Supabase client factory
   for non-cookie callers.
3. Migrate write boundaries off bare `getUser()`.
4. Move maintenance/erasure/deactivation out of layouts into the guard (B52).
5. Fitness test (B51): no guard on `/api/*` may read a middleware-stamped value
   with a silent default.

**Honest gap — this is a live web bug, not native prep.** Because the gates are
layouts, a maintenance window today **does not stop in-flight writes**, and the
erasure lockout has holes at write boundaries. Native readiness is the occasion;
correctness is the reason.

### T1.3 — de-couple the application layer (B4 + B41 + B1)

**Status: landed 2026-08-20** (items 1–4 of the original Work list). What
follows is the corrected picture — the plan's numbers were measured and three
of them were wrong.

**What the plan said, and what was actually there.**

| Plan said | Measured 2026-08-20 |
|---|---|
| exemption list of "exactly 47 files" | **46**, and two of those had already been fixed — the real coupling was **44** |
| the exemptions are FormData/redirect coupling | the dominant axis is `next/cache` (22 files, `revalidatePath`); `server-only` 9, `next/headers` 9, `next/navigation` only 4 |
| `create-intake.ts` is "the messiest of the nine coupled use-cases" | correct as a target, wrong as a description: its coupling was three `redirect()` calls, and fixing it paid down the `lint:action-redirect` baseline at the same time |

**Done.**

1. **Fence hole closed.** `@/lib/supabase/server` is now restricted in both the
   application and the domain override. It is `next/headers` behind an alias —
   the factory calls `cookies()`. Closing it surfaced three auth use-cases
   (`complete-identity`, `update-password`, `export-subject-data`), now on the
   exemption list until identity is injected from the actions layer. Tests
   under `application/**` are carved out by glob: a test that mocks a boundary
   has to be able to name it.
2. **Ratchet.** `scripts/check-application-fence.ts` (`pnpm lint:app-fence`, in
   `verify` and in CI), shaped after `check-db-budget.ts`'s baseline. It fails
   on: a missing fence, an empty corpus, an exemption pointing at a file that
   no longer exists, a STALE exemption, a coupled file outside the list, an
   unsorted list, and any count that does not equal
   `scripts/application-fence-baseline.json`. Fixing a file therefore forces
   lowering the number in the same commit. It also closes one hole biome itself
   has: a **runtime** `await import("next/headers")`. A `typeof import()` in
   type position deliberately does not count — it erases at compile time, biome
   does not flag it, and it is the shape a decoupled use-case uses to name the
   type of a client its caller injects.
3. **Burn-down: 46 → 37.** Two stale entries removed; nine use-cases dropped
   `import "server-only"` (free — each still reaches an infrastructure module
   that declares the marker, asserted by
   `__tests__/application-server-only-reachability.test.ts`); `create-intake.ts`
   now returns `redirectTo` instead of calling `redirect()`.
4. **Client-input schemas in `@dim/contract`.** `packages/contract/src/input/`
   holds the intake schema. The package takes its first deliberate dependency,
   `zod`, and `check-contract-purity.ts` went from "zero dependencies" to an
   explicit `ALLOWED_DEPENDENCIES` allowlist with the reasoning written into the
   file — plus the warning that a second entry needs a note of the same length.
   Failure codes are copy-free; the es-AR words are mapped in the app, so a
   native client reuses the codes with its own screens.

**Still open — 37 exemptions, and the shape of the remaining work.**

Counts below are per AXIS and they overlap: several files are coupled two ways,
so they sum to more than 37.

- **21 × `next/cache`** (`revalidatePath`). Mechanical but not free: each needs
  every caller found so the revalidation moves to the actions layer without
  being dropped. This is the bulk of the remaining list and the obvious next
  batch.
- **11 × `@/lib/supabase/server`** — newly visible, because the fence only
  started looking on 2026-08-20. Needs the authenticated identity (or the
  client itself) injected from the actions layer. `requireLiveUser` (T1.2) is
  the guard those call sites should be resolving through.
- **10 × `next/headers`** — mostly `headers()` for the client IP, plus the
  cookies the Supabase factory reads. Needs an injected request context.
- **4 × `next/navigation`** — `logout`, `start-apply-intent`,
  `claim-stub-profile`, `delete-vaccine-reminder`. Same treatment
  `create-intake` just got, and the same double payoff against
  `lint:action-redirect`, whose baseline still carries 6 calls across 4 files.
- **Client-input schemas** exist for intake only. One per capture flow is still
  the target.

**Honest gap.** The remaining 37 are weeks of mechanical work, and each one is a
small behavioural risk at a write boundary. What changed is that the list can no
longer grow by accident, and an exemption can no longer outlive the violation it
was written for.

**Adjacent finding (not fixed, out of scope):** several of these use-cases
import `@/db` and infrastructure repositories directly. The fence does not ban
that, and it is a separate layering question from framework coupling — but it is
the reason removing `server-only` was safe, so it is worth naming.

**Track 1 estimate: 1–2 weeks remaining.**

---

## Track 2 — the two flagship reads

**Goal:** the first `/api/v1` route, and the pattern every later read copies.
Merge point for RN-1 B5 = RN-5 B33 = RN-6 #5 = RN-8 #6.

**Today (verified).** `app/(public)/p/[publicToken]/page.tsx` is **1,423 lines**,
`export const dynamic = "force-dynamic"` with `Cache-Control: no-store` — a
deliberate, documented choice (the lost→found transition must never serve a
stale "SE BUSCA" + owner phone). `credential-badges.ts` sits **inside the route
folder**, so nothing else can reuse it. Across the Phase-1/2 surface, ~0% of the
reads a native app needs are callable: the 45 existing route handlers are crons,
CSV exports, panorama layers and auth callbacks — none serve the owner flow.
The good news is real: the derivation layer is pure, tested and portable, and
`/p/` is the most carefully built page in the repo.

**Target.** `GET /api/v1/pets/{token}/credential` returning Tier-0 as JSON with
`payloadVersion`, `issuedAt`, `staleAfter`, and a **per-section degraded
contract** — each section can report `unavailable` independently. The page
becomes a thin renderer over the same loader (direct call, never a self-fetch).

**Work.**
1. Extract the loader to `src/modules/pets/application/read/load-public-credential.ts`.
2. Move `credential-badges.ts` → `lib/domain/credential/` (B34), which also
   makes the WAVE D1 supersede contract reusable by cartel / OG / export.
3. Add the route handler over the loader.
4. Render the owner's QR client-side (B35) — `qrcode` runs in browsers, and
   this removes server-side SVG generation from the two heaviest owner renders.
5. Write `docs/architecture/api-invariants.md` (B8): the five anti-oracle
   invariants as a testable checklist gating every `/api/v1` merge.

**Honest gap.** This is the first `/api/v1` route, so it also has to establish
the response envelope, the error vocabulary and the invariants doc. Budget that
— the second endpoint is cheap, the first one is not.

**The risk this ticket exists to close (RN-8 #6).** Today a hung query
fails soft into a blank section, which a human reading a web page correctly
interprets as "something's missing". A native client rendering the same blank
JSON would present it as a **valid credential with no findings**. The
per-section degraded contract is the mechanism that prevents that; it is the
point of the ticket, not a refinement of it.

**Track 2 estimate: 1–2 weeks.** Side effect: the two most-regressed screens in
the repo become testable.

---

## Track 3 — the channels

The largest track, and the one with the most independent workstreams.

### T3.1 — Idempotency-Key header + `wasNoop` (B6 = B27 = RN-8 #3, + B7)

**Today (verified).** The engine is real and tested: `lib/events/event-idempotency.ts`,
`lib/ui/use-idempotency-key.ts`, migrations `0047_event_client_idempotency_key.sql`
and `0088_eno_durability_idempotency.sql`, plus `__tests__/event-idempotency.test.ts`
and `__tests__/idempotency-guards.test.ts`. The weakness is the **carrier**: the
key travels as a hidden form field, so a caller that omits it simply
double-writes, silently. `bookSlot`, transfer-accept and adoption-submit are not
covered at all.

**Target.** `Idempotency-Key` as an HTTP header, **required** by every mutating
`/api/v1` route; the response surfaces `wasNoop` so a retry toast stops claiming
creation; partial unique indexes on the three uncovered flows; a noop cleans up
its orphaned upload.

**Honest note.** B7 is a **live web risk today**, not a native one —
double-booking a slot on a flaky mobile connection needs no native app to
happen.

### T3.2 — push (B16, B18, B19, B20, B21) — the biggest single lump

**Today (verified).** `push_subscriptions` (`db/schema.ts:1580`) is keyed to a
browser push endpoint and **cannot hold an FCM/APNs device token**. The provider
seam itself is clean — adding an FCM sibling is an afternoon. Everything around
it is not:

- the eligibility boolean excludes **lost-pet broadcasts and custody updates** —
  two of the three use-cases the native pitch is built on;
- org members, who *are* the broadcast audience, run in a shell that never
  registers a service worker;
- there are no preferences, no quiet hours, no `profiles.timezone`;
- sends are inline on the request path, unretried and unobserved;
- 12 legacy call sites bypass `createNotification*` entirely — zero idempotency
  and zero dead-lettering on those.

**Target.** `push_targets` (platform, device_id key, nullable token) with the
promised stale-pruning cron; a 134-row notification type registry (severity,
pushable, collapse key, opt-out group) driving `isPushable()`; the 12 legacy
sites migrated onto `createNotification*` with real dedupe keys; sends moved off
the request path onto the outbox-drainer backoff shape; a delivery record and an
operator tile so "did it send?" is answerable.

**Honest note.** This is where "just add FCM" becomes 3–4 weeks. It is 4–5
discrete workstreams that happen to share a table. It is also **partly
gated**: the lost-pet broadcast half cannot be built before PO decision #3.

### T3.3 — deep links (B37 = B22)

**Today.** ~50 hand-built URL templates for notification CTAs; a
`mimar://appointment` custom scheme; live path collisions (`p/perdidas`,
`t/terminos`, `/adoptar` without a trailing slash).

**Target.** One `deepLinkMap` in `packages/contract`; AASA and
`assetlinks.json` generated from it; an overlap fitness test that fails CI on a
new collision. Kill the custom scheme.

**Honest note.** Cheapest item in Track 3, and it fixes template drift on the
web today. It depends on T1.1 (the package must exist first).

### T3.4 — media (B25, B26, and the rest of B24)

**Today (verified).** Reads have **no callable surface** — 33 handlers, none
mint a signed URL; every attachment URL is born inside a page body. Writes are
welded to `File`/`FormData`/server action. The one direct-to-storage path is
the *unprotected* one. `pet-photos` and `event-attachments` still carry the
blanket `bucket_id`-only INSERT grant (see the Track 0 scope note). Good news:
the offline stage-then-claim contract is already implemented and tested.

**Target.** `POST /api/v1/uploads` mints a signed ticket; validation moves to a
post-upload verify step; nothing is claimed before it is verified; the server
rejects any `storagePath` it did not mint. Land B24's remaining two buckets
**with** this, not before.

**Honest note.** This also kills the 125MB-through-a-50MB-limit dead end and
makes progress bars possible. Not scheduled here: EXIF/HEIC GPS stripping
(B28), the broken avatar feature (B29), the reconciliation cron (B30).

**Track 3 estimate: 3–4 weeks**, push being the bulk.

---

## Track 4 — the trust model (gated)

**Blocked on PO decision #1.** This track should not start before the decision;
writing the crypto first would encode an unmade product choice.

**Today (verified).** The QR encodes a **URL, not a credential**. There is no
signature, no expiry, no issuance concept and **no crypto dependency anywhere in
the repo**. The platform actively forbids caching the credential:
`force-dynamic` + `no-store`, and `public/sw.js` is policed by
`__tests__/sw-push-fitness.test.ts`, which **fails the build** if anything
caches `/p/`. That is a deliberate privacy invariant, not an oversight.

**Why it is the only BLOCKER.** A cached card asserts, against a clock the
subject controls: stale rabies vigencia; "profesional" for a vet who may have
been revoked since; and "SE BUSCA" plus the owner's phone number for a pet that
already came home. The premise has to be split before anything is built:

- **Offline display** — the owner shows their own card. Tractable now.
- **Offline verification** — a stranger's phone trusts it with no server
  round-trip. **Undesigned, not unbuilt.** This is a trust-model and legal
  question, not an engineering backlog item.

**Target, once decided.**
1. Detached JWS over the Tier-0 payload + a published JWK (B36) — converts a
   printed libreta, a cartel or a screenshot from unverifiable into checkable
   with an expiry.
2. Honest owner-scoped offline cache (B38): the service worker caches **only**
   the allowlisted own-credential route, and the fitness test is *flipped* from
   "nothing may be cached" to "only this may be cached" — so the invariant keeps
   its teeth instead of being deleted.

**Honest note.** The crypto is small. The design is the work, and it is the
PO's and counsel's, not the team's.

---

## Not in any track (honest omissions)

Real findings, currently unscheduled. Listing them so the plan is not read as
complete coverage:

| # | Item | Why it matters |
|---|---|---|
| **B14** | Amend the Mi Argentina convenio ask **now** (2 redirect URIs, public+PKCE variant, `tosAcceptedAt` in the OIDC write list) | A **doc edit today** vs re-negotiating a signed convenio later. Time-sensitive and nearly free — arguably it should be pulled forward ahead of Track 1. |
| B3 | `/api/v1/auth/{signup,login}` JSON adapters | Closes the GoTrue-direct trap door (bypasses our rate limits, enumeration defense and TOS capture) |
| B9 | Split session lifetime from the 8h operator shift policy | **PO decision.** Citizens are force-logged-out mid-day today; directly contradicts the wallet premise |
| B11 | `revokeAllSessions(userId)` | Zero server-side revocation exists; erasure depends on a best-effort delete |
| B13 | Re-key auth rate limits off subject, not IP | Live 4G/CGNAT availability bug today |
| B28–B31 | EXIF/HEIC stripping, avatars (broken since creation, ~30 lines), storage↔DB reconciliation, immutable cacheControl | B28 is a live GPS-PII leak; B30 is Ley 25.326 completeness |
| B42–B45 | Catalog version stamping, `*_LABELS` consolidation, locale keys, localities + jurisdiction-rules read APIs | The i18n leaks (40+ sites) are behind 19 known raw-enum bugs |
| B48–B50 | The `.ln-*` CSS tokenization, the skin remap as JS descriptors, fonts/a11y constants | The two-thirds of the design system T1.1 does **not** cover |
| B53–B55 | 409+confirmToken instead of hidden-field round-trips, codify denuncia timing-neutrality, redirectTo-as-data everywhere | B54 protects a live security property from a well-meaning native port |

## Sequencing and critical path

```
T1.1 packages/contract ──┬──▶ T1.3 client-input schemas
                         ├──▶ T3.3 deepLinkMap
                         └──▶ (B46 tokens)

T1.2 requireLiveUser ────────▶ T2 credential endpoint ──▶ every later /api/v1

PO decision #1 ──────────────▶ T4  (do not start before)
PO decision #3 ──────────────▶ T3.2 broadcast half only
PO decision #2 ──────────────▶ shapes T1.2 + T2, cheap now, expensive to retrofit
```

`T1.1` is the keystone: three separate items are waiting on the package
existing. `T1.2` is the keystone for everything callable. They are independent
of each other and can run in parallel.

**Total: 8–12 focused weeks of web-side work before the first native fetch is
worth writing** — and every week of it pays down web debt on its own merits. Be
suspicious of any estimate that treats native as "just add an API layer": RN-1
and RN-8 together show the API layer is the visible tenth of the iceberg.

## Where this plan is weakest

Stated plainly, for the reviewer to attack:

1. **The 47-file burn-down is estimated, not measured.** No one has done three
   of them and multiplied. It could be half the estimate or double it.
2. **T2 assumes the 1,423-line loader decomposes cleanly.** It has not been
   attempted. If the page body holds interleaved authorization decisions rather
   than pure reads, the extraction is a redesign, not a move.
3. **Track 3's push work is sized as one track but is five.** It is the item
   most likely to be under-estimated, and the only honest way to size it is to
   land `push_targets` first and re-forecast.
4. **Nothing here has a native-side spike to validate against.** The whole plan
   is inferred from the web codebase. One throwaway React Native screen
   consuming the T2 endpoint would test the contract's shape before we build
   twenty more like it — that is not currently scheduled, and probably should
   be.
5. **"8–12 weeks" assumes no parallel product work.** DIM is simultaneously
   running external QA and onboarding real funcionarios. The realistic calendar
   is longer than the effort.
