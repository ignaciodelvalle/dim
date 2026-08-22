# Native readiness — final synthesis

> Roll-up of the 8-dimension adversarial review loop (RN-1..RN-8), 2026-08-19.
> All reviews were read-only. Nothing here is implemented — this is a map and a
> recommended sequence for the PO to schedule against.

> **Status re-run 2026-08-22 (HEAD d0fe0fad + the 2026-08-22 follow-ups)**
>
> "Nothing here is implemented" (line 5, above) is no longer true. Per-dimension
> status lives in each RN-*.md's own re-run block; the headline changes that
> affect THIS roll-up:
>
> | Item | Status | Evidence |
> |---|---|---|
> | R6 verdict — "no package boundary" | now false | `packages/contract` (`@dim/contract`) exists, `pnpm-workspace.yaml` declares `packages/*`, `db/schema.ts` imports the event-type union FROM the package. RN-6's own verdict moved EXPENSIVE → MODERATE (see its status block). |
> | Recommended sequence, Track 1 | PARTIAL | boundary + bearer client + `requireLiveUser` shipped; design-token codemod and the remaining FormData/next-cache decoupling are not |
> | Recommended sequence, Track 2 | **COMPLETE (2026-08-21)** | `GET /api/v1/pets/{token}/credential` shipped with the per-section degraded contract; `credential-badges.ts` moved out of the route folder (not yet packaged) |
> | R8 note | improvements 5 (denuncia timing-neutrality doc) and 6 (per-section degraded contract) landed; improvements 1 (middleware headers), 2 (maintenance/erasure into the guard) and 7 (redirectTo-as-data) are PARTIAL — see RN-8's status block for the split |
>
> Track 3 (channels) and Track 4 (trust model, gated on PO decision #1) are
> unchanged as of this re-run, apart from two un-ticketed fixes: the daily
> 01:00 ART push (Track 0 / RN-3 B17, scoped to one re-emit path) and the cron
> dispatcher's fair-share budget (RN-3 F17, new, not in any track).

## Roles: who gets a native app, and why

**Phase 1 — Owner / citizen (dueño).** The strongest native case:
- The pet IS the credential — a wallet surface (QR always available, offline)
  is the product's core promise and how credentials behave everywhere else.
- Push with real reach (vaccine due, lost-pet alerts, custody updates) — web
  push reach is structurally thin.
- Camera-first (register a pet, attach a photo, scan someone's QR).
- Mi Argentina federation is the premise, and Mi Argentina is mobile-first.

**Phase 2 — Field professional (vet + org capture subset).** Atender is a
phone-in-hand walk-in flow; intake wants the camera at the kennel door. NOT the
whole org portal — only the capture surfaces.

**Not native — gobierno / admin.** Dense desktop dashboards, jurisdictional
consoles, moderation queues. Web is the right medium; no review was run.

## Verdicts

| Dim | Area | Verdict | The one-line reason |
|---|---|---|---|
| R1 | API boundary | **EXPENSIVE** | 1 usable route handler in the whole surface; writes ~60% wrappable, reads ~0% (all in page bodies) |
| R2 | Native auth | **EXPENSIVE** | session half designed for browser+cookie; 8h timebox hits citizens; recovery broken cross-device; no session revocation |
| R3 | Push channel | **EXPENSIVE** | clean provider seam, but the target table can't hold a device token and 2 of 3 pitch use-cases aren't pushed at all |
| R4 | Media pipeline | **EXPENSIVE** ⚠️ | reads have no callable surface; the one direct-upload path is the unprotected one — and a blanket INSERT grant makes that bypass live TODAY |
| R5 | Offline credential | **EXPENSIVE** (verify = **BLOCKER**) | the QR encodes a URL, not a credential; offline verification is undesigned, not unbuilt |
| R6 | Shared contracts | **EXPENSIVE** (closest to CHEAP) [**re-run 2026-08-22: MODERATE**] | at review time: no package boundary; every pure module drags a 4655-line Drizzle schema through `@/*`. Since fixed — `packages/contract` exists and `db/schema.ts` now imports the event-type union FROM it (RN-6 status block). |
| R7 | Design tokens | **EXPENSIVE** | a value export captures ~35%; the semantic identity is ~4,400 lines of CSS with no RN equivalent |
| R8 | Parity traps | **EXPENSIVE** | web-only mechanisms that are load-bearing AND silent — a missing header resolves to `/gob`, not an error |

**Headline:** no BLOCKER except one half of R5 (offline *verification*, which is
a trust-model to design, not code to write). Everything else is EXPENSIVE, and
— consistently across all eight — **the cost is not redesign, it is drawing
boundaries and spreading patterns the codebase already has in the right shape
somewhere.** That is the good kind of expensive. Do not let "no blockers" read
as "cheap": eight EXPENSIVE dimensions is a real programme, and the R8 traps in
particular ship green and diverge only in production.

## The common pattern (what every dimension is really saying)

1. **Writes are wrappable, reads are trapped.** ~60% of the write domain is
   typed use-cases with injected deps; ~0% of reads are — every read the two
   apps need is inline in a page body (49/105 owner+public pages, 31/44 org
   pages import `@/db` directly). A native app is 80% reads.
2. **No boundary exists.** No `packages/`, no `/api/v1`, no bearer client, no
   design-token object, no shared-contract package. Everything threads through
   `@/*` anchored to the ORM schema and the Next runtime.
3. **Three subsystems were designed for exactly one consumer** — a browser
   holding a cookie behind middleware that re-authenticates every navigation:
   the session model (R2), the credential (R5), and the token/visual system
   (R7). Each only works in that shape and must be re-expressed, not copied.
4. **The saving graces are real and worth protecting**: authorization is 100%
   DB-resolved (no custom JWT claims, zero `auth.jwt()` in 276 RLS policies);
   the idempotency engine, `requirePetAccess` result shape, the pure derivation
   layer, `viz-scales.ts`, the offline stage-then-claim contract, and `redirectTo`-
   as-data all already exist as the right template.

## Three decisions that gate everything else (PO)

1. **The offline credential trust model (RN-5 B32).** Split the conflated
   premise: offline DISPLAY (owner shows own card — tractable) vs offline
   VERIFICATION (a third party trusts it without the server — undesigned). Decide
   the verifier trust model and "may a stranger's phone cache /p/, for how
   long?". This is the only BLOCKER and it gates whether /p/ `no-store` can ever
   relax, whether the credential gets a signature, and the whole R5 line.
2. **The cross-origin/auth story (RN-8 F8 / RN-1 B2-B3).** CORS + a bearer API,
   or native-direct-Supabase. A doc decision now; expensive to retrofit after
   the mobile team writes their first fetch. Native-direct-Supabase is the trap
   door RN-2 warned about (bypasses rate limits + TOS).
3. **The lost-pet targeting unit (RN-3 B23).** Locality-string fanout to
   opted-in citizens vs centroid+radius (needs coordinates on pets/sightings).
   Decides whether "pet lost near you" is a transport port or a new feature.

## ⚠️ Live security finding, independent of native (schedule regardless)

**RN-4 B24**: blanket `bucket_id`-only storage INSERT grants on `pet-photos`,
`event-attachments`, and `revocations` let any authenticated account write
arbitrary bytes bypassing all server-side validation (magic-byte, sharp,
size cap), from a browser console. This is a hole in the CURRENT web app — not
a native concern. Recommend scheduling it on its own track.

## Recommended pre-native sequence

Everything below is web-improving on its own merits; none of it requires the
mobile team to exist. Grouped so the cross-dimension merges land once.

**Track 0 — do now, independent of native**
- RN-4 B24: close the blanket storage INSERT grants (live security).
- RN-3 B17: stop the 01:00 ART daily urgent push (live nuisance, no schema).
- RN-2 B10: render the password-recovery `auth_error` state (live dead-end).

**Track 1 — the boundary (before the mobile team writes anything)**
- RN-6 B40 + RN-7 B46: create `packages/contract/`; move the event-type SoT and
  the design-token object into it. The keystone both R6 and R7 need.
- RN-1 B2 = RN-2 B12 = RN-8 #2: `requireLiveUser()` result guard +
  `createClientFromBearer` — the bearer entry point AND the shared mutation
  guard that fixes the layout-only maintenance/erasure gates.
- RN-1 B4 + RN-6 B41: delete FormData from the coupled use-cases; write the
  client-input zod schemas.

**Track 2 — the two flagship reads**
- RN-1 B5 = RN-5 B33 = RN-6 #5 = RN-8 #6: ONE credential JSON endpoint
  (`GET /api/v1/pets/{token}/credential`) with payloadVersion + issuedAt/
  staleAfter + per-section degraded contract. Lifts the `/p/` loader (1,423
  lines at review time, 1,035 lines as of 2026-08-21 — **DONE**, see the
  status block above).
- RN-5 B34: move `credential-badges.ts` out of the route folder.

**Track 3 — the channels**
- RN-1 B6 = RN-4 B27 = RN-8 #3: Idempotency-Key header + surface wasNoop +
  extend to bookSlot/transfer/adoption; clean up orphaned uploads on noop.
- RN-3 B16 + B18: notification type registry; push_subscriptions → push_targets.
- RN-5 B37 = RN-3 B22: one deepLinkMap + generated AASA/assetlinks.

**Track 4 — the trust model (gated on PO decision #1)**
- RN-5 B36: sign the Tier-0 payload (detached JWS) + publish the JWK.
- RN-5 B38: honest owner-scoped offline cache (flip the SW fitness test).

## Honest effort estimate

- **Track 0**: days. Should not wait for anything.
- **Track 1**: ~2-3 weeks. The precondition for a native team being productive
  rather than reverse-engineering.
- **Track 2**: ~1-2 weeks, and it makes the two most-regressed web pages
  testable as a side effect.
- **Track 3**: ~3-4 weeks; the push half (R3) is 4-5 discrete workstreams and is
  the largest single lump.
- **Track 4**: gated on the trust-model decision; the crypto is small, the
  design is the work.

Roughly **8-12 focused weeks of web-side work before the first native fetch is
worth writing** — and every week of it also pays down web debt. Be suspicious of
any estimate that treats native as "just add an API layer": R1 and R8 together
show the API layer is the visible tenth of the iceberg.
