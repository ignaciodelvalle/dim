# RN-1 — API boundary: what is callable from outside a Next.js render, today

> Adversarial read-only review, 2026-08-19. Verdict: **EXPENSIVE**.
> Reviewer brief: "an iOS/Android team starts Monday — what stops them?"

## Headline

`app/api/**` contains 33 route handlers: 24 cron, 5 panorama, 2 gob, 1 health.
**Exactly one serves a Phase-1 flow, and it returns HTML** (libreta-export print
view). Every owner/atender MUTATION is a server action; every READ is inline in
a `page.tsx` body. There is no `/api/v1` — by explicit ADR decision
(docs/adr/2026-07-18-native-readiness.md §5: "not until a real native consumer
exists"). A native team IS that consumer.

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
| Public credential /p/[token] | PAGE | 1423 lines; loader `loadCredentialViewData` is a NON-EXPORTED local (:1003) |
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
| Resolve pet by DIM code | SA | atender/actions.ts:87; throttle `atender_lookup` keyed org:ip (atender-access.ts:236) |
| Sign clinical events (×7 types) | SA | atender/actions.ts:113-727 — all FormData; reuse shared events use-cases |
| Org intake with photos | SA | create-intake.ts:213 — use-case takes FormData and calls redirect() (:52) |
| Intake screen context | PAGE | intake/page.tsx (202 lines inline db) |
| Agenda day view | PAGE | agenda/page.tsx:97,123 |
| Attendance mutations | SA | attendance.ts:60-147 |
| Bite report | SA | surveillance/actions.ts:123,281 — idempotent insert |

**Tally: 1 usable route handler (HTML), ~45 server actions, ~15 page-bound
reads.** Repo-wide: 49/105 owner+public pages and 31/44 org pages import
`@/db` directly.

## The three findings the optimistic reading misses

1. **The import fence is bypassed by a frozen 47-file exemption list**
   (biome.json:108-164) with no expiry, no ratchet, no comment — and the list
   IS the Phase-1/2 flow list (login, signup, intake, check-in, scans,
   lost/found, notifications). ADR Decision 1 is enforced only for code
   written after the list froze.
2. **`@/lib/supabase/server` (cookie-bound) is NOT in the fence's paths** —
   cookie coupling can enter a use-case and pass lint cleanly (does, in
   complete-identity.ts:25, update-password.ts:8, export-subject-data.ts:2).
3. **FormData reaches the application layer in ≥9 use-cases**; create-intake
   even `redirect()`s from inside. Nothing lints for it.

Good news, equally concrete: events/transfers/adoption write use-cases take
typed inputs + Deps and return UseCaseResult; `requirePetAccess` is already
result-shaped and transport-neutral; `insertEventIdempotent` (advisory lock →
ON CONFLICT → refetch → wasNoop) is a correct, framework-free idempotency
engine; `pet-tab-data.ts` is a working guard→use-case→JSON template. ~60% of
the WRITE domain is wrappable. **The reads are ~0%.**

## Auth coupling

- `lib/supabase/server.ts` is cookies-only; no bearer client exists anywhere.
- Guards throw navigations (`redirect()`, `notFound()`) — in a route handler
  that's a 307 to an HTML login, not `401 {code}`. Exception + model to copy:
  `requirePetAccess` returns `{ok:false, reason}`.
- **Trap door**: with no /api/auth, a native team will use supabase-js on
  device — silently bypassing per-IP/per-email login limits, signup
  enumeration defense, deactivated-account signOut, **and tosAcceptedAt** —
  a compliance regression that ships looking like it worked.

## Invariants any API layer must preserve (the oracle list)

- Public token throttle (60/min, 400/h per IP, fail-open) — first statement of
  every /p/* page; a naive `/api/v1/p/{token}` re-opens the old hole.
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
