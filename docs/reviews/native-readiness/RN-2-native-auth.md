# RN-2 — Native auth: session lifecycle, deep links, claims, federation

> Adversarial read-only review, 2026-08-19. Verdict: **EXPENSIVE**.
> Builds on RN-1 (cookies-only client, redirecting guards, GoTrue trap door —
> taken as given, not repeated).

> **Status re-run 2026-08-22 (HEAD d0fe0fad + the 2026-08-22 follow-ups)**
>
> | Finding / improvement | Status | Evidence |
> |---|---|---|
> | F1 — 8h timebox hits citizens | NOT STARTED | `supabase/config.toml:276-279` unchanged |
> | F2 — cross-device password reset dead-end | PARTIAL | see corrected fact below — the silent flag is fixed, `verifyOtp` cross-device path is not |
> | F3 — no server-side session revocation | NOT STARTED | `auth.admin.signOut` still appears zero times |
> | F4 — erasure lockout holes at bare `getUser()` write boundaries | DONE | all six write boundaries this finding named now resolve through `requireLiveUser()` |
> | F5 — per-IP auth rate limits vs CGNAT | NOT STARTED | unchanged |
> | F6 — Mi Argentina OIDC frozen as confidential single-redirect client | NOT STARTED | unchanged |
> | F7 — one collapsed auth-error class / header trap | PARTIAL | the header-trap half is fenced (below); the collapsed-error-class half is untouched |
> | F8 — parallel cookie-only capability sessions | NOT STARTED | unchanged |
> | F9 — authorization is 100% DB-resolved | holds, undocumented | still true; still not written into `api-invariants.md` as a protected invariant (improvement 8) |
> | Improvement 8 — write "no custom JWT claims" into `api-invariants.md` | NOT STARTED | no such line in the document today |
>
> **Corrected facts.** F2's `/?auth_error=1` — "which nothing in the repo
> reads" — is fixed: a failed code exchange now lands on
> `/recuperar?error=enlace_invalido`, rendered by `app/(auth)/recuperar/page.tsx`
> (`35c1a3d4`, 2026-08-20; the redirect itself is built in
> `app/auth/callback/route.ts`). The cross-device dead-end itself is
> **unfixed** — the fix is a better error message, not `verifyOtp`. F4's bare
> `getUser()` list (createPetAction, libreta-share create/revoke, upgrade
> requests, adoption apply, leaveOrganization, notifications/reminders/welfare/
> scans) now goes through `requireLiveUser()` at all six boundaries; the one
> residual — a local `requireUser()` defined INSIDE `app/actions/notifications.ts`
> that shadowed the recognized guard name and let `check-authz-guards.ts` count
> it as protected while it was a bare `getUser()` — was closed 2026-08-22
> (`4a2f72ad`), and the fence now flags a guard NAME defined outside its home
> (`findShadowedGuardDefinitions`). F7's header trap
> (middleware-stamped headers meaningless on `/api/*`) is fenced by
> `scripts/check-api-guard-headers.ts` (`pnpm lint:api-headers`). Also: org
> capability guards (`requireCapability`, `requireCapabilityForOrgToken`) now
> resolve `requireLiveUser` first, so a maintenance kill-switch or a deactivated
> institutional account stops org writes, not just the six boundaries this
> review named (`4a2f72ad`). The "**zero `auth.jwt()` uses across 276 RLS
> policy sites**" figure is **unverified** — a direct grep for `CREATE POLICY`
> across `db/migrations/*.sql` gives 38, not 276; the `auth.jwt()` count itself
> (1 hit) is not in dispute, only the denominator. Treat "276" as unverified
> until someone reconciles it against whatever corpus produced it.

## Findings (ranked by severity for the native transition)

### F1 — `timebox = "8h"` is an operator-shift rule silently applied to citizens
supabase/config.toml:276-279 sets a project-wide 8h session ceiling; the
comment above it says it exists for operators on shared terminals (PO
interview 2026-07-23 item 8). GoTrue's timebox has no role dimension, and the
custom_access_token hook is deliberately unconfigured — so the Phase-1 wallet
app would force-log-out every citizen every 8 hours, forever. Compounding on
device: refresh rotation with a 10s reuse interval breaks when concurrent SDK
instances (app + notification extension + widget) resume outside the window —
reuse detection kills the whole token family.

### F2 — Password recovery is PKCE-cookie-bound; cross-device reset is broken TODAY
The emailed reset link only completes in the cookie jar that requested it
(@supabase/ssr persists the PKCE verifier as a cookie). Request on desktop,
open on phone → exchangeCodeForSession fails → ~~redirect to `/?auth_error=1` —
**which nothing in the repo reads**~~ **FIXED 2026-08-20 (`35c1a3d4`):** now
redirects to `/recuperar?error=enlace_invalido`, which
`app/(auth)/recuperar/page.tsx` renders as a visible "request a fresh link from
this device" message. The underlying cross-device dead-end is **still live** —
the fix makes the failure legible, it does not make the reset work
cross-device (that needs the `verifyOtp` variant, improvement 2's second half).
Scope saving grace: it is the ONLY GoTrue-emailed link (no confirmations, no
magic links) — one path to fix.

### F3 — No server-side session revocation exists (audit-28 #7 still open)
`auth.admin.signOut` appears zero times. Vet-role revocation, org verification
revocation, govt deactivation: all mutate the DB, never the IdP. Web survives
because every guard re-reads the DB (F9). Native manifestation: a vet whose
matrícula was revoked keeps SEEING "verificado" in the app while their
signatures silently drop to declared provenance — a data-integrity failure
only native exposes. No session/device table exists anywhere; right-to-erasure
has no "log out my other devices" story.

### F4 — Erasure lockout is a hand-maintained convention with holes at write boundaries
Bare `getUser()` straight into a write (no deletedAt check): createPetAction,
libreta-share create/revoke, upgrade requests, adoption apply,
leaveOrganization, notifications/reminders/welfare/scans. Today mitigated
ACCIDENTALLY by the best-effort auth.users delete in erase-subject-data —
which logs failure and reports success anyway. On web the middleware catches
the user next navigation; on device there is no navigation.

### F5 — Per-IP auth rate limits assume one human per IP; Argentine mobile is CGNAT
signup 15/hour per IP, login 100/hour per IP — a launch-day self-DoS behind a
Movistar/Claro NAT pool, indistinguishable from a personal lockout by design
(enumeration defense returns identical copy). The repo already learned this
lens in public-token-throttle.ts:57-62 ("carrier-grade NAT") — the auth limits
predate it. GoTrue's own `token_refresh = 150/5min per IP` shares the flaw.

### F6 — Mi Argentina OIDC is frozen as a confidential, single-redirect web client
Requires CLIENT_SECRET to even enable; single scalar redirect URI declared an
ABI in the SDD ("changing it breaks the convenio"). Native OIDC needs a public
client + PKCE + a second registered redirect — convenio registrations are slow
and political, so asking for ONE web redirect now paints the premise into a
corner. Also: the OIDC path bypasses completeIdentityAction — **a Mi Argentina
signup currently captures no tosAcceptedAt at all** (R3.4's write list omits
it).

### F7 — One collapsed auth-error class
middleware's updateSession swallows ALL AuthApiErrors (a stale refresh token
once crashed the server, 2026-07-02). Native needs refresh_token_not_found /
invalid_jwt / user_not_found to be three different answers; nothing produces
that distinction. Also: guards read middleware-stamped headers (x-portal-base
etc.) that carry meaningless values on /api/* routes — a trap for guard reuse.

### F8 — Parallel cookie-only capability sessions
Denuncia reporter session and apply-intent are separate httpOnly-cookie
mini-sessions with no native path. Org invites (`/r/invite/<token>`) are the
clean exception: plain URL token, renders logged-out — a ready universal-link
target.

### F9 — The saving property: authorization is 100% DB-resolved, never client-derived
No custom JWT claims; zero `auth.jwt()` uses across "276 RLS policy sites"
[**unverified** — a direct `CREATE POLICY` grep across `db/migrations/*.sql`
gives 38, not 276; re-run the exact query this figure came from before citing
it again];
role/membership/capabilities/matrícula/deletedAt all re-read per request with
request-scoped memoization only. A native client can cache anything and none
of it is authoritative. **Protect this — it is undocumented and therefore
unprotected.** The moment someone adds a custom_access_token hook to "make
native cheaper", every F3 gap becomes a real hole up to jwt_expiry.

## Ranked improvements (native cheaper AND web better today)

1. **Split session lifetime from shift policy** — document that the 8h timebox
   hits citizens; PO question in writing; likely shape: inactivity_timeout
   global + shift check inside loadActiveInstitutionalProfile. (Owners are
   being logged out mid-day TODAY for an operator rule.)
2. **Device-agnostic password recovery** — first fix the silent `?auth_error=1`
   nobody renders; then move to the OTP variant (`verifyOtp({type:'recovery'})`;
   otp_length/expiry already configured). Fixes a live cross-device dead-end.
3. **`revokeAllSessions(userId)`** wrapping `admin.signOut(global)`, wired
   into erase-subject-data FIRST (correctness fix — its auth.users delete is
   best-effort), then the four revocation writers. Closes audit-28 #7.
4. **One shared result-shaped `requireLiveUser()` guard** (NO_SESSION |
   ACCOUNT_ERASED) replacing the bare getUser() pattern — start at the two
   artifact-minting boundaries (createPet, libreta-share). Same function is
   RN-1 B2's bearer entry point, arriving from the other direction.
5. **Re-key auth rate limits off the subject, not the IP** — per-email budgets
   already do the brute-force work; the CGNAT-correct control for signup is
   the captcha gate config.toml already sketches. Live 4G availability bug.
6. **Amend the convenio ask NOW (cheapest, most expensive to retrofit)**: two
   redirect URIs (web + native), public+PKCE client variant, tosAcceptedAt in
   the R3.4 write list, one-time app-exchange code as an R3.6 variant. Pure
   doc edit — 25b hasn't landed.
7. **Auth error vocabulary** (AUTH_EXPIRED / AUTH_REVOKED / ACCOUNT_ERASED /
   ACCOUNT_DEACTIVATED) in the ADR envelope, produced by requireLiveUser.
8. **Write "no custom JWT claims" into api-invariants.md** (RN-1 B8) as a
   protected invariant with the evidence inline.

## Verdict: EXPENSIVE

Not BLOCKER for one narrow reason: authorization is never client-derived —
the server re-decides everything per request, which is worth more to the
transition than any API layer. EXPENSIVE because the SESSION half was designed
for exactly one consumer (a browser + cookie + middleware), and four
individually-reasonable decisions only work in that shape: the 8h timebox
contradicting the wallet premise, PKCE-cookie recovery (broken cross-device on
web today), nonexistent server-side revocation (fine when the server renders
every screen, wrong when the client renders its own), and CGNAT-hostile
per-IP limits. Each is cheaper to fix this week than after a mobile team
builds around them.
