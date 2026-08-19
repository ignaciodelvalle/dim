# Native readiness — adversarial review loop

> Working doc for the iOS/Android transition review cycle (started 2026-08-19).
> Each iteration runs ONE adversarial, read-only review dimension against the
> current codebase, distills findings here, and files improvements that make
> the native transition cheaper — prioritizing changes that also pay off for
> the web app today.

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
| R3 | Push channel | Everything is web-push (VAPID) or in-app rows. Where is the channel coupled? Can notification fanout target FCM/APNs without rewriting the 67 insert sites? | pending |
| R4 | Media pipeline | Uploads are server-action-mediated (`uploadAttachmentIfPresent`). Can a native client upload to storage + register the attachment without a form post? Public vs signed URLs. | pending |
| R5 | Offline credential + deep links | What does the QR encode, what must render with zero connectivity, universal-link mapping for `/p/`, `/t/`, `/libreta/compartir/`. | pending |
| R6 | Shared contracts | Event payload zod schemas, catalog data (vaccines, breeds, localities), es-AR copy. What could ship as a versioned contract package vs what is trapped in component files? | pending |
| R7 | Design tokens | LN token system → native design tokens. What is CSS-var-only vs extractable. | pending |
| R8 | Parity traps | Flows where web relies on something a native client won't have (middleware headers, RSC streaming, `after()` hooks, hidden form fields like idempotency keys). | pending |

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

## Improvement backlog

(distilled, ranked; PO decides what gets scheduled)

| # | From | Improvement | Also helps web today |
|---|---|---|---|
| B1 | RN-1 | Ratchet the application-layer import fence closed; add `@/lib/supabase/server` to its paths; burn down the 47-file exemption list weekly | Use-cases become unit-testable without a Next request |
| B2 | RN-1 | `createClientFromBearer` + result-shaped `requireUser()` (redirect variant becomes a wrapper) | Cleaner guards; `requirePetAccess` already proves the shape |
| B3 | RN-1 | `/api/v1/auth/{signup,login}` JSON adapters — close the GoTrue-direct trap (rate limits, enumeration defense, tosAcceptedAt) | Testable auth surface |
| B4 | RN-1 | Remove FormData/redirect from the 9 coupled use-cases (start: create-intake) | Testability; intake unblocked for Phase 2 |
| B5 | RN-1 | Extract the two flagship page loaders (public credential 1423-line page, owner profile 1450-line page) into read use-cases | The two most regressed screens become testable |
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
