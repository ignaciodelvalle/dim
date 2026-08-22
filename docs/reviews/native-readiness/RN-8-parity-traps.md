# RN-8 — Parity traps: web mechanisms a native port silently inherits wrong

> Adversarial read-only review, 2026-08-19. Builds on RN-1..RN-7 (not repeated).
> Verdict: **EXPENSIVE**. The dangerous traps are not the flows that FAIL on
> native — those get noticed. They are the flows that DIVERGE QUIETLY because
> the web mechanism has a plausible-looking default.

> **Status re-run 2026-08-22 (HEAD d0fe0fad + the 2026-08-22 follow-ups)**
>
> | Finding / improvement | Status | Evidence |
> |---|---|---|
> | F1 — middleware-stamped headers resolve to plausible wrong defaults | PARTIAL (half fenced) | `scripts/check-api-guard-headers.ts` (`pnpm lint:api-headers`) now covers `x-portal-base`, `x-full-path`, `x-pathname` — the Vercel geo headers (`ipAreaFromHeaders`) are NOT covered by that fence and remain a silent-default trap |
> | F2 — denuncia after() timing oracle / improvement 5 | DONE | codified in `docs/architecture/api-invariants.md` §1.3 as "the model" for a response-equality test, with `__tests__/denuncia-access-timing-oracle.test.ts` cited as the reference shape |
> | F5 — maintenance/erasure/demo gates enforced only in layouts | PARTIAL | moved into `requireLiveUser()` for the flows RN-2 F4 named; the ORG capability-guard hole (`requireCapability`/`requireCapabilityForOrgToken` not checking liveness before an org write) was closed 2026-08-22 (`4a2f72ad`) — but that fix is scoped to org-capability writes, not every layout-gated surface this finding lists (demo banner, identityPending banner, offline banner remain layout-only) |
> | F6 — RSC streaming degraded-reveal is invisible resilience / improvement 6 | DONE | `GET /api/v1/pets/{token}/credential` ships the per-section `CredentialSection<T>` degraded contract (api-invariants.md §5, §10) |
> | F7 — /_next/image hides the real storage URL | corrected, still a live gap | the WEB page still renders through `/_next/image`; the NEW `/api/v1` credential JSON returns the direct `pet-photos` storage URL (`petPhotoUrl()`, no `/_next/image` indirection) — so this specific finding is now split: fixed for the JSON consumer, unchanged for the web page |
> | Improvement 7 — standardize on redirectTo-as-data | PARTIAL | `scripts/check-action-redirect.ts` (`pnpm lint:action-redirect`) fences it; baseline (`scripts/action-redirect-baseline.json`) is down to **4 files / 6 calls** (`start-apply-intent.ts` ×2, `logout.ts` ×2, `delete-vaccine-reminder.ts` ×1, `claim-stub-profile.ts` ×1) |
> | F8 — no CORS anywhere / improvement 8 | decided, unimplemented | PO decision #2 (CORS + bearer API) is taken; `docs/architecture/api-invariants.md` §9 states explicitly that no `/api/v1` route sets `Access-Control-*` headers or accepts a bearer token yet |
>
> F3, F4, F9 and improvements 1-4 are unchanged as of this re-run.

## Organizing principle

A native client is not "a browser without a screen." It structurally lacks:
middleware (no request-header injection), the RSC/Suspense/after() runtime, the
hidden-form-field round-trip protocol, /_next/image, non-auth cookies, the
layout render tree. Every one is load-bearing somewhere here, and in the worst
cases the absence resolves to a WRONG-BUT-VALID default, not an error.

## Findings (ranked by how SILENTLY it breaks a naive port)

### F1 — Middleware-stamped headers resolve to plausible WRONG defaults, never errors (quietest trap)
Five headers stamped every request, each reader with a silent fallback a native
client hits by default:
- **x-portal-base** → portalBase() returns "/gob" for anything not "/admin".
  Absent header ⇒ silently "/gob"; an admin surface's internal links point into
  the wrong portal. A wrong link, not a crash.
- **x-full-path** → currentReturnTo() returns undefined ⇒ session-expiry bounce
  loses the deep link (the exact bug qa-triage #13 fixed, reintroduced silent).
- **x-pathname** → layouts default to "/"/"/inicio" ⇒ wrong chrome decision.
- **Vercel geo headers** → ipAreaFromHeaders returns null ⇒ a native scan logs
  scan_ip_area: null; the lost-pet scan trail loses its geography, and it looks
  intentional because the code says null is valid.
Nothing throws. A native port "works" in every demo and ships with wrong
portals, null geo, stranded returnTo. Highest priority precisely because QA
cannot see it. (RN-2 F7 flagged the /api/* variant; R8 owns the whole set.)

### F2 — The denuncia after() is a security property a "cleanup" reintroduces as an oracle
The access-link email is scheduled with after() SPECIFICALLY so response latency
doesn't vary by branch — otherwise the endpoint is a timing oracle revealing a
cruelty reporter's email (guarded by denuncia-access-timing-oracle.test). The
only after() in the codebase. An API port has no after(); the obvious rewrite is
`await sendAccessLink(...)` — which silently re-opens the oracle against the
exact person the feature protects. Ships green, fails only against an attacker
with a stopwatch. Quiet and dangerous.

### F3 — Hidden-field state machines a native client must reproduce or silently corrupt data
- **clientIdempotencyKey** — client UUID as a hidden input, read at ~35 sites;
  the DB dedupe conflicts on it. A native client that omits it ⇒ every flaky-4G
  retry double-writes a vaccine/bite/intake. And wasNoop never reaches the
  client (RN-1), so even a correct retry can't tell created from already-had.
- **sameDayOverride / duplicateOverride** — a 409-confirm protocol smuggled
  through form re-renders: server returns a prompt, expects a resubmit with the
  flag. Native unaware either can never register a legitimate same-day second
  dose (dead-end) or blindly sets the flag and defeats the dedupe.
- **.bind() closures encoding trust** — confirmEventId bound from a URL param
  into the action closure; the server trusts "this is the owner-declared event
  being signed." On web the encrypted bound arg is tamper-resistant; a native
  JSON body has no such encryption — "sign THIS declaration" must become an
  explicit server-validated input.

### F4 — Two contradictory redirect conventions; a naive port mishandles one
- Returned as data (NAV CONTRACT N3): login, all events actions, business-rules
  — because redirect() from these actions is silently dropped by the client
  router in production (engram #621/#622). Consumer calls window.location.
- Thrown from inside the use-case: start-apply-intent, create-intake, logout,
  register-pet ⇒ on native a NEXT_REDIRECT digest EXCEPTION, not data.
A native client must special-case both (use-retryable-action already sniffs
`digest.startsWith("NEXT_")`). N3 is the dominant native-friendly pattern; the
trap is the inconsistency.

### F5 — Maintenance / demo / erasure gates enforced in the LAYOUT → native bypasses them
isMaintenanceMode short-circuits in the (app)/org/admin layouts — RENDERING-time
gates only. No server action or route handler re-checks it. A native client
calling actions directly never passes a layout, so a declared maintenance window
does NOT stop native writes at all. (Also a latent web bug: a page loaded before
maintenance was flipped keeps submitting.) Same layout-only enforcement for the
demo banner, the identityPending signup-recovery banner, the offline banner.
NEXT_PUBLIC_* are build-baked; native gets whatever was compiled and no layout
to act on it.

### F6 — RSC streaming + loadWithTimeout degraded-reveal is invisible resilience the JSON port loses
/p/ flushes a shell then streams tier-2 medical + origin-org behind Suspense,
each wrapped in loadWithTimeout with per-section budgets (6s/3s) and a degraded
fallback strip on timeout — so a hung tier-2 query cannot blank the finder's
credential. A native client gets one JSON response, no streaming: unless the
credential API reproduces the per-section bounded-timeout + degraded-status
contract, one slow medical query blanks the entire card — the most important
public surface — where web degrades gracefully.

### F7 — /_next/image is the URL in the HTML for every photo, incl. the offline credential face
Photo.tsx / CredentialPhoto render next/image ⇒ the HTML carries /_next/image,
not the storage URL. Native must build the direct storage URL itself (petPhotoUrl
is a pure builder, tractable) and do its own resize — and the credential photo
inherits the optimizer's 1h TTL (RN-5 F14), so an offline wallet loses the pet's
face after an hour. The onError fallback is client-JS-only; native re-implements.

### F8 — No CORS configured anywhere; the whole app assumes same-origin
Zero Access-Control-Allow-Origin, no OPTIONS handlers, headers() sets only
security headers. A native HTTP client ignores CORS so it isn't blocked — but
this confirms there is NO cross-origin story: no bearer path (RN-1), cookie auth
won't cross origin. Fails loud, ranks low, but it's the structural precondition
the whole review assumes missing.

### F9 — Non-auth cookies carrying UX state (least trappy; short honest list)
dim_last_org (last-org sort pref), adoption_apply_intent + pet_token,
denuncia_reporter_session. Each device-storage-or-API relocatable. No
theme/onboarding/consent cookies (theme is CSS-only per RN-7).

## Ranked improvements (native cheaper AND web better today)

1. **Turn middleware-stamped values into an explicit typed request context with
   NO silent defaults** (F1); fitness test that no guard reads them on /api/*.
   Kills the /gob-default-masks-admin and lost-returnTo classes.
2. **Move maintenance/erasure/deactivation enforcement out of layouts into a
   shared mutation guard** (requireLiveUser, RN-1 B2 / RN-2 B12). The single fix
   that pays most for both: a maintenance window actually stops in-flight writes;
   erasure/deactivation stop depending on the next navigation.
3. **Promote clientIdempotencyKey to an Idempotency-Key header, surface wasNoop,
   extend to bookSlot/transfer-accept/adoption-submit** (RN-1 B6/B7, RN-4 B27).
   Retry toast stops lying; live double-book risk closes.
4. **Replace sameDayPrompt/duplicatePrompt hidden-field round-trips with an
   explicit 409 + confirmToken in the result envelope; fold confirmEventId into
   the typed action input** (F3). The soft-dedupe + atender-signature flows
   become unit-testable.
5. **Codify the denuncia timing-neutrality as a named invariant ("never await a
   side-channel; schedule it") in api-invariants.md** (RN-1 B8) with the oracle
   test cited. Cheapest; protects a live security property from a port.
6. **Ship the credential JSON endpoint with a per-section degraded contract**
   (RN-5 B33 / RN-1 B5, F6). Flagship loader becomes testable.
7. **Standardize on ONE redirect convention — redirectTo as data everywhere** —
   converting the thrown redirect()s (F4). Removes the router-drop defect class.
8. **Decide the cross-origin/auth story before native starts** (F8): CORS +
   bearer API, or native-direct-Supabase. A doc decision now; expensive after
   the first fetch.

## Verdict: EXPENSIVE

Not BLOCKER: the codebase already contains the right shapes in enough places to
prove the team knows how — redirectTo as data, result-typed guards, a
timing-neutral after(), a real idempotency key, per-section bounded degraded
reveal. A spread-the-good-pattern problem, not a redesign. EXPENSIVE because
R8's mechanisms are uniquely nasty: load-bearing AND silent. A middleware header
not sent resolves to /gob, not an error. A maintenance flag lives in a layout
native never renders. An idempotency key omitted just double-writes. A
privacy-preserving after() "cleans up" into a timing oracle against a cruelty
reporter. A hung query web fails-soft around blanks the native credential. Every
one ships green, demos perfectly, and diverges only in production on a specific
device under a specific condition — the profile of a bug that reaches national
scale before anyone notices. Do 1, 2, 3 before the mobile team writes their
first mutation and R8 drops toward CHEAP.
