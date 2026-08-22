# RN-1 — API boundary: what is callable from outside a Next.js render, today

> Adversarial read-only review, 2026-08-19. Verdict: **EXPENSIVE**.
> Reviewer brief: "an iOS/Android team starts Monday — what stops them?"

> **Status re-run 2026-08-22 (HEAD d0fe0fad + the 2026-08-22 follow-ups)**
>
> | Finding | Status | Evidence |
> |---|---|---|
> | HF1 — frozen exemption list, no ratchet | DONE | 37 entries, ratcheted by `scripts/check-application-fence.ts` + `scripts/application-fence-baseline.json` (`pnpm lint:app-fence`) |
> | HF2 — `@/lib/supabase/server` NOT fenced | DONE | fenced in both the application and domain biome overrides since 2026-08-20 (`biome.json:80,102`) |
> | HF3 — FormData reaches the application layer | PARTIAL | 17 application files still take `FormData` (verified by grep, down from the original ≥9-use-case estimate as more surface was found) |
> | B1 — ratchet the fence + fence `supabase/server` | DONE | see HF1/HF2 |
> | B2 — bearer client + result-shaped guard | PARTIAL | `lib/supabase/bearer.ts` `createClientFromBearer` exists with zero non-test callers; `requireLiveUser()` shipped (T1.2) but the bearer path is still unwired from any route |
> | B3 — `/api/v1/auth/{signup,login}` JSON adapters | NOT STARTED | no such routes exist |
> | B4 — delete FormData from the coupled use-cases | PARTIAL | see HF3; `create-intake.ts` no longer `redirect()`s (`a4e3fcd8`, 37→ exemptions) |
> | B5 — extract the two flagship page loaders | PARTIAL | public credential loader shipped and exported (below); owner profile page (`app/(app)/mis-mascotas/[publicToken]/page.tsx`) is 1,447 lines, untouched |
> | B6 — Idempotency-Key header + surface `wasNoop` | NOT STARTED | key still travels as a hidden form field |
> | B7 — idempotency for bookSlot/transfer accept/adoption submit | NOT STARTED | no coverage found |
> | B8 — `api-invariants.md` + a response-equality test per oracle | PARTIAL | doc landed (`docs/architecture/api-invariants.md`); equality tests exist for denuncia (`__tests__/denuncia-access-timing-oracle.test.ts`) and the new `/api/v1` credential route (`__tests__/api-v1-credential-route.test.ts`), NOT for atender, chip/DNI, or uploads |
>
> **Corrected facts.** `app/api/**` now has **35** route handlers (25 cron, 5
> panorama, 2 gob, 1 health, 1 libreta-export, 1 `/api/v1`; the auditors'
> "24 cron" undercounts by one — `ls app/api/cron | wc -l` gives 25, confirmed
> by `docs/architecture/api-invariants.md`'s own provenance note), **48** across
> `app/` (`pnpm lint:authz` prints the live count). **`GET
> /api/v1/pets/[publicToken]/credential` landed 2026-08-21** (`713e4416`) — see
> `docs/architecture/api-invariants.md` §10 for the full checklist mapping. The
> public credential page is **1,035 lines** (not 1,423); its loader,
> `loadCredentialViewData`, is **exported** at
> `src/modules/pets/application/read/load-public-credential.ts:61`, and the
> four-way `throttled | not_found | degraded | ok` decision the page and the
> new route both call is `lookup-public-credential.ts`. The public-token
> throttle is no longer a copy-pasted "first statement of every `/p/*` page" —
> it is the shared `lib/infra/public-token-throttle.ts`, applied inside the
> `lookupPublicCredential` door via five distinct buckets
> (`public_token_page`, `public_token_encontre`, `public_token_sighting`,
> `public_token_og_image`, `public_token_api_credential`). The line fixes below
> (`:8`, `:31`, `:53`, `:67-69`, `:72`, `:87`, `:98-99`) apply these facts in
> place. **Verdict update:** ready for a native client for exactly one read
> today — the credential envelope, `no-store`, and per-lookup fencing are now
> enforced by `pnpm lint:api-v1` (`scripts/check-api-v1-envelope.ts`,
> 2026-08-22), not left to convention.

## Headline

`app/api/**` contains 35 route handlers [was 33; see status block above]: 25
cron, 5 panorama, 2 gob, 1 health, 1 libreta-export. **Exactly one served a
Phase-1 flow at the time of this review, and it returns HTML** (libreta-export
print view). Every owner/atender MUTATION was a server action; every READ was
inline in a `page.tsx` body. There was no `/api/v1` — by explicit ADR decision
(docs/adr/2026-07-18-native-readiness.md §5: "not until a real native consumer
exists"). **`GET /api/v1/pets/[publicToken]/credential` landed 2026-08-21** —
see the status block above and `docs/architecture/api-invariants.md` §10.

## Flow classification (RH = route handler / SA = server action / PAGE = locked in page body)

### Phase 1 — Owner

| Flow | Class | Evidence |
|---|---|---|
| Signup step 1 | SA | src/modules/auth/application/signup.ts:29 (FormData, headers(), rate limit :56) |
| Signup step 2 (identity/DNI/TOS) | SA | complete-identity.ts:33 — **the ONLY site recording tosAcceptedAt** (:113) |
| Login | SA | login.ts:36 — per-IP + per-email limits :57-61; deactivated force-signOut :96 |
| Password reset | SA | password-reset/request-password-reset.ts:20, update-password.ts:14 |
| Pet list | PAGE | mis-mascotas/page.tsx:128,143 — inline db; 587 lines |
| Pet profile (credential+libreta) | PAGE | [publicToken]/page.tsx — 1450 lines, inline db ×7; partial escape: getLibretaFaceData via app/actions/pet-tab-data.ts:29 |
| Pet registration | SA | src/modules/pets/actions.ts:97 — ~180 lines of parsing in the ACTION |
| Event capture (vacuna/peso/etc.) | SA | src/modules/events/actions.ts:175,274 — use-cases properly Deps-injected |
| Attachment upload | SA | lib/infra/uploads.ts — magic-byte sniff, sharp re-encode; only reachable via action multipart |
| Credential QR | PAGE | page.tsx:773 — server-rendered SVG; payload itself portable (site-url.ts:63) |
| Public credential /p/[token] | PAGE | 1,035 lines [was 1,423]; loader `loadCredentialViewData` is now EXPORTED at `src/modules/pets/application/read/load-public-credential.ts:61` |
| Lost/found mark + update | SA | events/actions.ts; use-cases ALL in the import-fence exemption list |
| Finder possession / sighting / scan log | SA | encontre/action.ts:57; pet-sighting.ts:30; scans.ts:26 (use-cases import next/headers) |
| Libreta share create/revoke | SA | app/actions/libreta-share.ts:67,83,143 |
| Libreta share public view | PAGE | compartir/[shareToken]/page.tsx:87-115 |
| Libreta export | **RH** | api/mis-mascotas/.../libreta-export — but text/html, cookie-authed |
| Notifications list | PAGE | notificaciones/page.tsx:125 — keyset + read-time reconciliation SQL inline |
| Notifications mark-read | SA | app/actions/notifications.ts:31-41 |
| Push subscription | SA | push-subscriptions.ts:35 — schema is WEB-push-shaped (endpoint/p256dh/auth) |
| Turnos search / reserve screen | PAGE | turnos/buscar/page.tsx:49-140; reservar/[slotId]/page.tsx:26-60 |
| Turnos reserve/cancel | SA | booking.ts:43,86 — book-slot.ts uses raw db singleton, no injected deps |
| Transfers list | PAGE | transferencias/page.tsx:36-67 |
| Transfers mutations | SA | src/modules/transfers/actions.ts:92-258 — **typed inputs + Deps; best-shaped family** |
| Adoption apply | SA | adoption/actions.ts:247 → submit-adoption-application.ts:47 (typed + Deps) |
| Adoption apply-intent | SA | start-apply-intent.ts:123 — FormData + cookies() + redirect() in the use-case |
| My applications | PAGE | postulaciones/page.tsx:88 — raw SQL |
| Post-adoption check-in | SA | record-post-adoption-checkin.ts:49 — use-case receives FormData incl. File |

### Phase 2 — Atender / field

| Flow | Class | Evidence |
|---|---|---|
| Resolve pet by DIM code | SA | atender/actions.ts:87; throttle `atender_lookup` keyed org:ip (atender-access.ts:237 [was :236]) |
| Sign clinical events (×7 types) | SA | atender/actions.ts:113-727 — all FormData; reuse shared events use-cases |
| Org intake with photos | SA | create-intake.ts:213 — use-case took FormData; no longer calls `redirect()` (`a4e3fcd8`, 2026-08-20 — returns `redirectTo` instead) |
| Intake screen context | PAGE | intake/page.tsx (202 lines inline db) |
| Agenda day view | PAGE | agenda/page.tsx:97,123 |
| Attendance mutations | SA | attendance.ts:60-147 |
| Bite report | SA | surveillance/actions.ts:123,281 — idempotent insert |

**Tally: 1 usable route handler (HTML), ~45 server actions, ~15 page-bound
reads.** Repo-wide: 49/105 owner+public pages and 31/44 org pages import
`@/db` directly.

## The three findings the optimistic reading misses

1. ~~**The import fence is bypassed by a frozen 47-file exemption list**
   (biome.json:108-164) with no expiry, no ratchet, no comment~~ — **FIXED.**
   `scripts/check-application-fence.ts` (`pnpm lint:app-fence`, in `verify` and
   CI) now ratchets the list: it fails on a missing fence, an empty corpus, an
   exemption pointing at a deleted file, a stale exemption, an unexempted
   coupled file, an unsorted list, or a count that disagrees with
   `scripts/application-fence-baseline.json`. The list is down to **37**
   entries (was 46-47, two of which were already stale when measured).
2. ~~**`@/lib/supabase/server` (cookie-bound) is NOT in the fence's paths**~~ —
   **FIXED.** It is restricted in both the application and domain biome
   overrides since 2026-08-20 (`biome.json:80,102`), closing this exact hole;
   the three sites this finding named (complete-identity.ts, update-password.ts,
   export-subject-data.ts) are now on the exemption list until identity is
   injected from the actions layer instead.
3. **FormData reaches the application layer in 17 use-cases** (verified by grep
   against `**/application/**/*.ts`, excluding tests — up from the original
   "≥9" estimate as more surface was measured, not as new coupling was added);
   create-intake no longer `redirect()`s from inside (`a4e3fcd8`, 2026-08-20).
   Nothing lints for FormData itself.

Good news, equally concrete: events/transfers/adoption write use-cases take
typed inputs + Deps and return UseCaseResult; `requirePetAccess` is already
result-shaped and transport-neutral; `insertEventIdempotent` (advisory lock →
ON CONFLICT → refetch → wasNoop) is a correct, framework-free idempotency
engine; `pet-tab-data.ts` is a working guard→use-case→JSON template. ~60% of
the WRITE domain is wrappable. **The reads are ~0%.**

## Auth coupling

- `lib/supabase/server.ts` is cookies-only. ~~No bearer client exists
  anywhere.~~ **FIXED.** `lib/supabase/bearer.ts` `createClientFromBearer`
  exists (landed the same day as this review) — but has zero non-test callers
  today; nothing wires it to a route yet.
- Guards throw navigations (`redirect()`, `notFound()`) — in a route handler
  that's a 307 to an HTML login, not `401 {code}`. Exception + model to copy:
  `requirePetAccess` returns `{ok:false, reason}`.
- **Trap door**: with no /api/auth, a native team will use supabase-js on
  device — silently bypassing per-IP/per-email login limits, signup
  enumeration defense, deactivated-account signOut, **and tosAcceptedAt** —
  a compliance regression that ships looking like it worked.

## Invariants any API layer must preserve (the oracle list)

- Public token throttle (60/min, 400/h per IP, fail-open) — was hand-copied as
  the first statement of every /p/* page; now the shared
  `lib/infra/public-token-throttle.ts`, applied inside the `lookupPublicCredential`
  door via five distinct buckets (one per surface, incl. the new
  `/api/v1` route's `public_token_api_credential`) — a naive `/api/v1/p/{token}`
  that skipped the door would still re-open the old hole.
- Atender lookup throttle (org:ip) — an authenticated DIM lookup is a national
  existence oracle.
- Denuncia MAC anti-oracle — success and failure byte-identical; REST's
  404-vs-200 instinct breaks it immediately.
- Chip / DNI match oracles (verify-dni.ts notes it has NO rate limit today).
- Upload validation (magic bytes, no SVG, sharp re-encode) — all three gone if
  native uploads direct-to-storage with a signed URL.

## Idempotency: server half ready, client contract missing

- Key arrives as hidden form field; ADR promises an `Idempotency-Key` header;
  nothing reads a header.
- `wasNoop` never reaches the client — a retry on rural connectivity cannot
  distinguish "created" from "already had it".
- Coverage is pet_events-only: bookSlot, transfer accept, adoption submit have
  NO key (double-book on flaky mobile is a live web risk today).
- Soft-dedupe prompts (sameDayPrompt/duplicatePrompt) are hidden-field
  round-trips — an API needs them as explicit 409 + confirm flag.

## Ranked improvements (native cheaper AND web better today)

1. **Ratchet the fence closed; add `@/lib/supabase/server` to it.** First step:
   fence the path, delete the 5 cheapest Phase-1 exemptions (revalidatePath-only)
   by hoisting revalidatePath into the calling action. Weekly burndown.
2. **Result-shaped auth guard + bearer path.** `createClientFromBearer(token)`
   in lib/supabase/server.ts; `requireUser()` returning a result next to
   `requireUserOrRedirect` (which becomes a 3-line wrapper).
3. **/api/v1/auth/{signup,login} JSON adapters** over the existing actions —
   closes the GoTrue-direct trap (rate limits + TOS) before anyone falls in.
4. **Delete FormData from the 9 use-cases.** Start: create-intake — move
   parseIntakeForm (:104) up to the action, type the input, drop redirect().
5. **Extract the two flagship page bodies into read use-cases**: public
   credential loader (export loadCredentialViewData) and owner pet profile.
   A native app is 80% reads; these two screens ARE the app.
6. **Idempotency-Key header + surface wasNoop** in EventFormState — also fixes
   the web's retry toast lying about creation.
7. **Idempotency key for bookSlot / transfer accept / adoption submit** with
   partial unique index mirroring pet_events_idempotency_idx.
8. **docs/architecture/api-invariants.md** — the 5 oracles as a testable
   checklist + a response-equality test per oracle, BEFORE any /api/v1 merge.

## Verdict: EXPENSIVE

Not BLOCKER: the write-side domain is genuinely wrappable and the idempotency
engine + result-shaped guard already exist as templates. EXPENSIVE because the
cost is concentrated where nobody budgets: (a) the fence that was supposed to
guarantee callability is off for exactly the flows the apps need; (b) every
READ is page-locked and a native app is 80% reads; (c) the auth trap door is a
compliance regression that would ship green. Do improvements 1, 2, 4, 5 before
the mobile team writes their first fetch and R1 becomes CHEAP.
