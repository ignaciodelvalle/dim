# Native readiness — adversarial review loop

> Working doc for the iOS/Android transition review cycle (started 2026-08-19).
> Each iteration runs ONE adversarial, read-only review dimension against the
> current codebase, distills findings here, and files improvements that make
> the native transition cheaper — prioritizing changes that also pay off for
> the web app today.

> **Status re-run 2026-08-22 (HEAD d0fe0fad + the 2026-08-22 follow-ups)**
>
> Backlog items with a status change since 2026-08-19 (full detail in each
> RN-*.md's own status block and in `TRACKS.md`):
>
> | # | Status | Evidence |
> |---|---|---|
> | B33 | **DONE** | `GET /api/v1/pets/{token}/credential`, `713e4416`, 2026-08-21 |
> | B34 | **PARTIAL** | `credential-badges.ts` moved to `lib/domain/credential-badges.ts` (`4c63dbb3`) — out of the route folder, not yet in `packages/contract` |
> | B35 | **DONE** | `components/ui/CredentialQr.tsx`, `d40381be`, 2026-08-21 |
> | B40 | **DONE** | `packages/contract` (`@dim/contract`) exists; `pnpm-workspace.yaml` declares `packages/*` |
> | B41 | **PARTIAL** | `packages/contract/src/input/` holds an intake schema only; one per capture flow is still the target |
> | B5 | line counts corrected | public credential page: 1,423 → **1,035** lines (loader extracted, DONE); owner profile page: 1,450 → **1,447** lines (untouched) |
>
> Everything else in this backlog is unchanged as of this re-run.

## Who gets a native app, and in what order

**Phase 1 — Owner / citizen (dueño).** The strongest native case by far:

- The pet IS the credential — a wallet-style surface (QR always available,
  including offline) is the product's core promise, and a home-screen app is
  how credentials behave everywhere else (boarding passes, DNI digital).
- Push notifications with real reach: vaccine due/overdue, lost-pet alerts in
  your area, custody/adoption updates. Web push requires an opted-in browser
  session; the current outbound-channels work showed how thin that reach is.
- Camera-first flows: registering a pet, attaching a photo to a dose, "lo
  encontré" scans of someone else's QR.
- Mi Argentina federation is the premise, and Mi Argentina is mobile-first.

**Phase 2 — Field professional (vet + org operative subset).** Atender is a
walk-in, phone-in-hand flow (scan a DIM code, sign a dose); org intake wants
the camera at the kennel door. NOT the whole org portal — just the capture
surfaces.

**Not native: gobierno / admin.** Dense desktop dashboards, jurisdictional
consoles, moderation queues. Web is the right medium; nothing to review.

## Review dimensions (the adversarial set)

Each review asks: "an iOS/Android team starts Monday — what stops them, what
do they duplicate, what silently breaks?" Verdicts: BLOCKER / EXPENSIVE /
CHEAP / READY.

| # | Dimension | Question | Status |
|---|---|---|---|
| R1 | API boundary | Owner+atender flows run on RSC pages + server actions. What is callable from OUTSIDE a Next.js render — today, honestly? Inventory every mutation/read the Phase 1-2 flows need and classify: route handler exists / server action only / logic locked inside a page body. | **EXPENSIVE** → [RN-1](RN-1-api-boundary.md) |
| R2 | Native auth | Supabase tokens vs the cookie/middleware assumptions. Session refresh, deep-link password recovery, rate limits keyed on what, Mi Argentina OIDC on mobile. | **EXPENSIVE** → [RN-2](RN-2-native-auth.md) |
| R3 | Push channel | Everything is web-push (VAPID) or in-app rows. Where is the channel coupled? Can notification fanout target FCM/APNs without rewriting the 67 insert sites? | **EXPENSIVE** → [RN-3](RN-3-push-channel.md) |
| R4 | Media pipeline | Uploads are server-action-mediated (`uploadAttachmentIfPresent`). Can a native client upload to storage + register the attachment without a form post? Public vs signed URLs. | **EXPENSIVE** (⚠️ live sec) → [RN-4](RN-4-media-pipeline.md) |
| R5 | Offline credential + deep links | What does the QR encode, what must render with zero connectivity, universal-link mapping for `/p/`, `/t/`, `/libreta/compartir/`. | **EXPENSIVE** (verify = BLOCKER) → [RN-5](RN-5-offline-credential-deeplinks.md) |
| R6 | Shared contracts | Event payload zod schemas, catalog data (vaccines, breeds, localities), es-AR copy. What could ship as a versioned contract package vs what is trapped in component files? | **EXPENSIVE** (closest to CHEAP) → [RN-6](RN-6-shared-contracts.md) |
| R7 | Design tokens | LN token system → native design tokens. What is CSS-var-only vs extractable. | **EXPENSIVE** → [RN-7](RN-7-design-tokens.md) |
| R8 | Parity traps | Flows where web relies on something a native client won't have (middleware headers, RSC streaming, `after()` hooks, hidden form fields like idempotency keys). | **EXPENSIVE** → [RN-8](RN-8-parity-traps.md) |

## Findings index

- [RN-1 — API boundary](RN-1-api-boundary.md) · **EXPENSIVE** · 1 usable route
  handler in the whole Phase-1/2 surface; writes ~60% wrappable, reads ~0%;
  import fence bypassed by a frozen 47-file exemption list; auth has a
  GoTrue-direct trap door (rate limits + TOS bypass).
- [RN-2 — Native auth](RN-2-native-auth.md) · **EXPENSIVE** · 8h operator
  timebox silently applied to citizens; password recovery PKCE-cookie-bound
  (broken cross-device on web TODAY, error param nobody reads); zero
  server-side session revocation; erasure-lockout holes at write boundaries;
  CGNAT-hostile per-IP auth limits; Mi Argentina OIDC frozen as confidential
  web client (and its signup path records no TOS). Saving property to protect:
  authorization is 100% DB-resolved, never client-derived.
- [RN-3 — Push channel](RN-3-push-channel.md) · **EXPENSIVE** · one clean
  provider-neutral seam (FCM sibling = an afternoon) but: target table can't
  hold a device token; the eligibility boolean excludes lost-pet broadcasts
  and custody updates (2 of the 3 use-cases the native pitch is built on);
  org members — the broadcast audience — run in a shell that never registers
  a SW; no preferences/quiet hours/timezone (daily urgent push at 01:00 ART);
  sends inline+unretried+unobserved.
- [RN-4 — Media pipeline](RN-4-media-pipeline.md) · **EXPENSIVE** (⚠️ live
  security) · reads have NO callable surface (33 handlers, zero mint a signed
  URL — every attachment URL born in a page body); writes welded to
  File/FormData/action; the one direct-to-storage path is the unprotected one
  and blanket `bucket_id`-only INSERT grants make that bypass available TODAY
  from a browser console; avatars broken since creation; intake/bite media
  greenfield; unstripped iPhone HEIC GPS; no GC. **Good news:** offline
  stage-then-claim contract already implemented + tested.
- [RN-5 — Offline credential + deep links](RN-5-offline-credential-deeplinks.md)
  · **EXPENSIVE** (verify-offline half = **BLOCKER**) · the QR encodes a URL,
  not a credential — no signature/expiry/issuance/crypto dep anywhere; the
  platform actively FORBIDS caching /p/ (no-store + a SW fitness test that
  fails the build on any cache); a cached card would assert stale rabies
  vigencia against a subject-controlled clock, "profesional" for a revoked
  vet, and SE BUSCA + owner phone for a pet that came home. Offline DISPLAY
  (own card) tractable; offline VERIFICATION is undesigned, not unbuilt.
  **Good news:** derivation layer is pure/tested/portable; /p/ is the most
  carefully built page in the repo.
- [RN-6 — Shared contracts](RN-6-shared-contracts.md) · **EXPENSIVE**
  (cheapest, closest to CHEAP) · no package boundary exists; every pure module
  threads through `@/*` and drags a 4655-line Drizzle schema for a single
  enum; es-AR "centralized copy" is keyless Spanish literals leaking in 40+
  places; form-validation zod validates the DB write shape not client input;
  localities + jurisdiction rules need APIs. Mechanical, not conceptual —
  event types have a SINGLE source of truth, and data/legal-baseline proves
  the team can ship a signed versioned contract.
- [RN-7 — Design tokens](RN-7-design-tokens.md) · **EXPENSIVE** · no
  tokens.ts/tailwind.config — the system is one @theme CSS-var block + ~4,400
  lines of hand-authored `.ln-*` CSS with RAW px off the token scale; theming
  is a CSS-var cascade with no React Native equivalent (must be re-architected
  as JS theme objects, not copied). A value export captures ~35%; the semantic
  credential/libreta identity is the other two-thirds. **Good news:**
  viz-scales.ts / pet-situation.ts / icon map port as-is; a11y invariants
  (44px = Apple HIG, 4.5:1, ΔE floors) already testable numbers.
- [RN-8 — Parity traps](RN-8-parity-traps.md) · **EXPENSIVE** · the web-only
  mechanisms here are load-bearing AND silent: a missing middleware header
  resolves to `/gob` not an error; maintenance/erasure gates live in layouts
  native never renders; an omitted idempotency key just double-writes; the
  privacy-preserving denuncia `after()` "cleans up" into a timing oracle; a
  hung query web fails-soft around blanks the native credential. Every one
  ships green and diverges only in production. **Good news:** the right shapes
  (redirectTo-as-data, result guards, timing-neutral after) already exist —
  a spread-the-pattern problem.

See [SYNTHESIS.md](SYNTHESIS.md) for the final roll-up.

## Improvement backlog

(distilled, ranked; PO decides what gets scheduled)

| # | From | Improvement | Also helps web today |
|---|---|---|---|
| B1 | RN-1 | Ratchet the application-layer import fence closed; add `@/lib/supabase/server` to its paths; burn down the 47-file exemption list weekly | Use-cases become unit-testable without a Next request |
| B2 | RN-1 | `createClientFromBearer` + result-shaped `requireUser()` (redirect variant becomes a wrapper) | Cleaner guards; `requirePetAccess` already proves the shape |
| B3 | RN-1 | `/api/v1/auth/{signup,login}` JSON adapters — close the GoTrue-direct trap (rate limits, enumeration defense, tosAcceptedAt) | Testable auth surface |
| B4 | RN-1 | Remove FormData/redirect from the 9 coupled use-cases (start: create-intake) | Testability; intake unblocked for Phase 2 |
| B5 | RN-1 | Extract the two flagship page loaders (public credential — was 1,423 lines, now **1,035**, DONE 2026-08-21; owner profile — was 1,450, now **1,447**, untouched) into read use-cases | The two most regressed screens become testable |
| B6 | RN-1 | `Idempotency-Key` header + surface `wasNoop` to the client | Web retry toast stops claiming creation on a noop |
| B7 | RN-1 | Idempotency keys for bookSlot / transfer accept / adoption submit (+ partial unique index) | Live double-booking risk on flaky mobile web TODAY |
| B8 | RN-1 | `docs/architecture/api-invariants.md`: the 5 anti-oracle invariants as a testable checklist gating any `/api/v1` merge | Encodes what today lives only in file-header comments |
| B9 | RN-2 | Split session lifetime from operator-shift policy (8h timebox hits citizens; wallet premise contradiction) — PO decision needed | Owners are force-logged-out mid-day today |
| B10 | RN-2 | Device-agnostic password recovery: render the auth_error state, then move to OTP (`verifyOtp`) | Fixes a LIVE silent cross-device dead-end |
| B11 | RN-2 | `revokeAllSessions(userId)` wired into erasure + the 4 revocation writers | Closes audit-28 #7; erasure stops depending on a best-effort delete |
| B12 | RN-2 | Shared result-shaped `requireLiveUser()` (NO_SESSION/ACCOUNT_ERASED) replacing bare getUser() at write boundaries | Closes real erasure holes; is RN-1 B2's bearer entry point |
| B13 | RN-2 | Re-key auth rate limits off subject not IP (CGNAT); captcha for signup | Live 4G availability bug today |
| B14 | RN-2 | Amend the Mi Argentina convenio ask NOW: 2 redirect URIs, public+PKCE variant, tosAcceptedAt in the OIDC write list | Doc edit; avoids re-negotiating a signed convenio |
| B15 | RN-2 | Auth error vocabulary in the ADR envelope + "no custom JWT claims" as a protected invariant | Middleware stops hiding auth misconfig behind expired-token silence |
| B16 | RN-3 | Notification type registry (**~149 rows** as of 2026-08-22, was 134: severity, pushable, collapse, opt-out group) driving isPushable() — NOT STARTED | Kills category drift; CTA fitness asserts a table |
| B17 | RN-3 | Quiet hours + profiles.timezone + preferences; IMMEDIATE: stop the 01:00 ART daily urgent push | Live nuisance fix this week, no schema |
| B18 | RN-3 | push_subscriptions → push_targets (platform, device_id key, nullable token) + promised stale-pruning cron | Real device list in /cuenta; dead rows stop accumulating |
| B19 | RN-3 | Migrate the 12 legacy push-calling sites onto createNotification* with real dedupeKeys | Those sites today have zero idempotency AND zero dead-lettering |
| B20 | RN-3 | Delivery record (push_deliveries or cron_runs counters) + operator tile beside outbound-channels | "Did it send?" becomes answerable |
| B21 | RN-3 | Sends off the request path via outbox-drainer backoff shape | Actions stop blocking on N sequential HTTPS calls |
| B22 | RN-3 | notificationTarget() deep-link map + fitness test | 50 hand-built URL templates stop drifting; AASA export mechanical |
| B23 | RN-3 | PO decision: lost-pet targeting unit (locality fanout vs centroid+radius) | The /perdidas audience gets an alert channel at all |
| B24 | RN-4 | ⚠️ **Close the blanket `bucket_id`-only storage INSERT grants** (pet-photos, event-attachments, revocations) — LIVE web hole | Any account can write arbitrary bytes bypassing validation TODAY |
| B25 | RN-4 | `POST /api/v1/uploads` signed-ticket endpoint; validation moves to post-upload verify; nothing claims unverified (keystone, land with B24) | Kills the 125MB-through-50MB dead-end; progress bars |
| B26 | RN-4 | Route the browser-direct revocations upload through the ticket; reject any storagePath the server didn't mint | Removes the unvalidated precedent + proves stage-then-claim |
| B27 | RN-4 | Surface wasNoop → clean up orphaned uploads on duplicate submit (storage half of B6) | Stops silent orphan accumulation on flaky-connection retries |
| B28 | RN-4 | Make EXIF stripping default; extend to HEIC in welfare-uploads | Live GPS-PII leak fix on web today |
| B29 | RN-4 | Fix avatars end-to-end (validate, store path, sign at render) | A broken whole feature, ~30 lines |
| B30 | RN-4 | Storage↔DB reconciliation cron (report-only first) + erasure covers avatars/welfare/zero-parent | Ley 25.326 completeness; sizes the orphan problem |
| B31 | RN-4 | cacheControl immutable on uploads + enable Storage image transformation | Phone stops re-downloading 5MB originals hourly |
| B32 | RN-5 | **PO decision (gates everything): the offline credential trust model** — split display vs verification; may a stranger's phone cache /p/, for how long? | Decides whether /p/ no-store can ever relax |
| B33 | RN-5 | **DONE** (`713e4416`, 2026-08-21) — `GET /api/v1/pets/{token}/credential` — Tier-0 as JSON with issuedAt+staleAfter (RN-1 B5 credential-first) | Flagship page gets a testable loader; degraded card shows real data |
| B34 | RN-5 | **PARTIAL** (`4c63dbb3`) — moved to `lib/domain/credential-badges.ts`, not yet in `packages/contract` | WAVE D1 supersede contract reusable by cartel/OG/export |
| B35 | RN-5 | **DONE** (`d40381be`, 2026-08-21) — `components/ui/CredentialQr.tsx` | Removes server SVG from the 2 heaviest owner renders |
| B36 | RN-5 | Sign the Tier-0 payload (detached JWS) + publish JWK — converts F1 from undesigned to phased | Printed libreta/cartel/screenshot become checkable with an expiry |
| B37 | RN-5 | One deepLinkMap + generated AASA/assetlinks + overlap fitness test (merge RN-3 B22); kill mimar://appointment | Catches p/perdidas, t/terminos, live /adoptar-no-slash collisions |
| B38 | RN-5 | Honest owner-scoped offline cache: SW caches only the allowlisted own-credential route; flip the fitness test to enforce that | Keeps the no-store privacy invariant intact |
| B39 | RN-5 | Accept TAG- serials in resolveAtenderPet + copy-to-clipboard footer token | Removes a live re-typing step in the walk-in clinical flow |
| B40 | RN-6 | **DONE** — `packages/contract/` (first workspace boundary) exists; the event-type source of truth moved into it, db/schema imports from it | Kills the drizzle anchor on every pure module |
| B41 | RN-6 | **PARTIAL** — `packages/contract/src/input/` holds an intake schema only | Replaces String(formData.get()) hand-parsing; the offline-validation seam RN-1 wants |
| B42 | RN-6 | Version-stamp static catalogs + extend check-catalog-drift to fail CI on unversioned change | The eventual native copy can detect staleness |
| B43 | RN-6 | Consolidate scattered *_LABELS into packages/contract/copy/; route the 40+ i18n leaks through them | Closes the 19-i18n raw-enum bugs directly |
| B44 | RN-6 | Locale-keyed structure for high-traffic labels (event/notification types, statuses) — keys not literals | Only path to a non-Spanish-only second consumer |
| B45 | RN-6 | Publish /api/v1/localities + jurisdiction-rules read APIs (can't ship as files) | Both pickers share one contract instead of re-importing INDEC |

| B46 | RN-7 | `packages/contract/tokens` (on B40): codemod the @theme colors+scales into a typed object, generate globals.css @theme FROM it | Ratchet points at a SoT without parsing CSS |
| B47 | RN-7 | Move viz-scales.ts into the package unchanged as the template; fix its false header claim | Zero-risk proof-of-shape |
| B48 | RN-7 | Tokenize the credential CSS off raw px, starting with .ln-asiento; lower the CSS ratchet baseline | Web finally uses the scale it declares |
| B49 | RN-7 | Extract the skin remap (citizen/op-surface/situation-room) into a JS theme descriptor; generate the CSS var blocks from it | Native gets three palettes as plain objects |
| B50 | RN-7 | Bundle fonts as OFL files + weight-contract JSON; publish a11y invariants as platform-neutral constants; share the Icon name map | Web stops depending on Google CDN at build |

| B51 | RN-8 | Middleware-stamped values → explicit typed request context with NO silent defaults; fitness test that no guard reads them on /api/* | Kills the /gob-masks-admin + lost-returnTo classes |
| B52 | RN-8 | Move maintenance/erasure/deactivation enforcement out of layouts into the shared mutation guard | A maintenance window actually stops in-flight writes (latent web bug too) |
| B53 | RN-8 | Replace sameDay/duplicate hidden-field round-trips with explicit 409+confirmToken; fold confirmEventId into typed input | Soft-dedupe + atender-signature flows become unit-testable |
| B54 | RN-8 | Codify denuncia timing-neutrality ("never await a side-channel; schedule it") in api-invariants.md | Protects a live security property from a well-meaning port |
| B55 | RN-8 | Standardize on redirectTo-as-data everywhere; convert the thrown redirect()s | Removes the router-drop defect class the repo already fights piecemeal |

**Cross-dimension merges**: RN-5 B33 = RN-1 B5 = RN-6 #5 = RN-8 #6 (one credential JSON endpoint with payloadVersion + freshness + per-section degraded contract). RN-5 B37 = RN-3 B22 (one deepLinkMap driving both notification CTAs and AASA). RN-4 B27 = RN-1 B6 = RN-8 #3 (surface wasNoop + Idempotency-Key header). RN-2 B12 = RN-1 B2 = RN-8 #2 (result-shaped requireLiveUser is the bearer entry point AND the shared mutation guard). RN-7 B46 builds on RN-6 B40 (the `packages/contract/` boundary is shared).
