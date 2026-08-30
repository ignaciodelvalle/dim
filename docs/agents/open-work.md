# Open work and milestones — snapshot 2026-08-28

Companion to `docs/agents/collaborating-writer.md`. That page is the contract
(how to work); this page is the board (what is left).

**This file goes stale.** It was written against `a3ec504c5`. Before trusting a
row, check it against the code — the repo's own history is full of boards that
were confidently wrong. Where a row says "measured", it was verified on the date
above and nowhere since.

It went stale exactly that way and it cost someone: two rows kept being offered
after they had already shipped, because the lanes that shipped them updated no
board. **Every row in the table below was re-checked against `4a87f661f` on
2026-08-29** — routes, modules and the merge that closed each one. That is the
only part of this page carrying that date.

## Where the project is

MiMAR is **published on Google Play, internal testing track**, since 2026-08-27.
Real testers are installing it. That single fact reorders everything below: a
gap a tester hits today outranks a gap that is architecturally more interesting.

The active initiative is the **native parity loop** — every capability a pet
owner has on the web, brought to `apps/mobile`. The authoritative inventory is
the gap matrix in engram, topic `native/owner-gap-matrix` (~95 owner
capabilities across 79 `app/(app)` pages, 28 public citizen pages, 6 auth pages,
70 action files, 354 use-cases). The live dashboard is the "Paridad del Dueño"
artifact, which the PO keeps updated.

## Milestones

| Milestone | What it means | State |
|---|---|---|
| **M6** | "A citizen installs the app and registers their pet" — install → sign up → sign in → register → credential + QR + offline cache → owner's pet view → health record → lost mode → share → P2P transfer → temporary caretaker | **Parity side complete.** No parity box gates M6 any more. |
| M6 remainder | What still gates the launch is **not** parity: build 6 must replace the broken build 5 on Play, and the Data Safety form must match the binary | PO-gated, see below |
| M7+ | The six remaining parity clusters (WU-P/R/S/T/U/V). None gates launch — the web already serves all of them | open |

## Open work an agent can pick up

Ordered by what a live tester hits first, not by size.

| # | Work | Size | Notes |
|---|---|---|---|
| 1 | **Pet photo** — native image picker | M | Server side is **done**: signed upload → private bucket → `confirm` re-authorizes, verifies magic bytes, re-encodes, then writes to the public bucket. Only the picker is missing — which needs a native module, so an EAS build. That pipeline cost 6 builds / 5 distinct root causes. **Not a first task.** |
| 2 | **WU-S** — appointments: **buscar and reservar** only. My appointments, cancel and the check-in QR landed 2026-08-30 — see the block below before starting. | M | **One unit of work, not two.** A search that cannot book is a screen listing slots nobody can take; a book with no search is unreachable. Needs a service-kind picker, jurisdiction-subsuming search, a slot list, and a concurrent write on `bookings_count` with its own route and rate-limit family. Not in the web nav either; deep links only. |
| 3 | **WU-U** — adoption: catalogue, detail, apply, my applications | M | The application flow earns its own rate limit here. |
| 4 | **WU-V** — the **camera scan** only. Confirmar el chip and reclamar landed 2026-08-30 — see the block below before starting. | M | The scan is the LAST of the three and the one the block did not attempt: reading a chip's barcode needs `expo-camera` → a native module → an EAS build, the same pipeline row 1 is held back by. It is strictly additive over what landed — it sets the same string the keyboard field sets. **Row left in place on purpose: one of three closed is not a row that comes off the table.** |
| 5 | **WU-T** — citizen abuse reports | M | Attachments blocked on signed uploads. **Not the same thing as reporting content** — this is Ley 14.346, nine types, routed to an authority. |
| 6 | **WU-P** — rehoming, foster, return, relocation, org memberships | L | Advanced custody cycle. |

Also not done from the phone, each its own slice: correct species, rabies
appointment, physical tag, printable lost poster, health-record export,
assistance dog (Ley 26.858), attaching a photo to an entry, and five entry types
(tattoo, microchip replacement, bite, death, post-adoption check-in — the app
writes 11 of 16). Reminders are read-only rows: no "snooze 7 days", no "record".
Editing the pet now works, but only for three fields — see the landed block for
the fourteen columns it left on the web.

## Landed since this snapshot — do not pick it up again

**A landing written up below did not necessarily take a row off the table**, and
two of them did not: WU-S (row 2) and WU-V (row 4) are both still there, each
narrowed to the capabilities it did not close. Each block is written up the same
way: what was done, what it **decided**, and what it did **not** solve. A row
deleted without its remainder is how the remainder gets lost — and a row left on
the table after it landed is how the next agent spends a day rebuilding it. Both
have happened here.

**THE COUNT THAT USED TO OPEN THIS PARAGRAPH IS GONE, deliberately.** It read
"Five landings are written up below, and only four of them took a row off the
table", and it was written that way precisely because "five blocks" and "five
rows gone" are not the same claim. The distinction was right and the instrument
was wrong: a number in prose has to be edited by every lane that appends a block,
nothing goes red when it is not, and the very next window appended one. Two
numbers in one sentence are two chances to rot. The claim survives without
either — read the blocks, count them yourself if you need a figure, and do not
write it down here.

### `auth_signup_ip` — the plaza registration drive

15 signups/hour per gateway, which refused five of twenty neighbours at a plaza
registration drive. Re-derived on 2026-08-29 into a wide burst allowance under a
day ceiling (60/min · 180/hr · 360/day, the day window being new). The
derivation, the costs it accepts — including a UTC-boundary straddle that nearly
doubles the worst-case rolling-24h yield — and the four instruments it considered
and rejected are in `src/modules/auth/application/signup-limits.ts`.

What it did **not** solve is still open and is still not agent work: signup has no
per-identity anchor to derive against, and the two instruments that would give it
one are email confirmation (blocked behind the Resend setup, PO-gated item 4
below) and phone verification. No arrangement of windows substitutes for either.

### Edit pet identity + emergency contacts + vet — landed `ecc835aa4` (lane def-1)

`GET/POST /api/v1/pets/{publicToken}/profile` plus the native
`app/mascotas/[publicToken]/editar.tsx` screen. "Editar datos" used to be a
footer that said "Desde la web"; it now edits the animal. Both capabilities
already existed server-side for the web and neither had a bearer-session entry
point, so the three walls a tester hit were one wall.

What it **decided**:

- **Two commands behind one endpoint, not one "Guardar".** `edit_identity`
  mirrors `requireTitularAccess` and appends a bundled `pet_profile_updated` to
  the spine — the correction is itself an entry. `set_emergency_contacts` is
  strictly narrower (`ownerships.role = 'owner'` alone), moves four preference
  columns and appends nothing, because they are a preference of the person and
  not a fact about the pet. Both rules are copied as negations of the web's own
  call sites rather than re-derived, and the read reports them as **two
  booleans** so a client never draws a control the write would refuse. A foster
  in transit holds the animal and does not see the titular's vet or phone.
- **`composePetIdentityEdit`** (`src/modules/pets/domain/pet-identity-edit.ts`)
  exists because `updatePetProfile` writes **seventeen** columns from `parsed`
  in one unconditional `SET`. A three-field request assembled from itself would
  have nulled weight, favourite foods, allergies, training level, insurance and
  permanent conditions, flipped two disclosure booleans off, returned 200, and
  written an event recording the wipe as if somebody had asked for it.
- **Species and jurisdiction stay FULL-LOCK** (PO decision #40). There is no
  request field for either, so the fabricated-species breed bypass closed on
  2026-08-14 is unreachable here by construction rather than by a check.
- **No length cap was invented over `pets.name` / `pets.color`.** They are
  unbounded `text` and the web's only writer never capped them, so longer values
  already exist; a cap applied on the way back out would have locked an owner
  out of correcting the COLOUR because the form posts both fields.
  `resolvePetIdentityLengths` gates only NEW values. The two contact caps (80 /
  40) are in the schema because they mirror a server cap that already exists.

What it did **not** solve:

- **The screen edits three identity fields — name, breed, colour.** The other
  fourteen columns `updatePetProfile` writes remain web-only: sex, date of birth
  and its estimated flag, weight, favourite foods, allergies, training level,
  insurance company and policy, acquisition method, permanent conditions and
  their free-text, and the two disclosure booleans.
- **"Markings" was never a field.** The old row promised it; there is no such
  column on `pets`, on the phone or on the web. Do not go looking for it.
- The endpoint sends notifications through `lib/infra/notification-service.ts`
  rather than the raw insert the neighbouring cookie door still uses. That door
  is baselined debt and is still there.

### Animated card flip on the native profile — landed `28aa329f7` (lane def-3)

`apps/mobile/src/pets/document-turn.ts` (the choreography as data, no React) and
`DocumentTurn.tsx` (the driver). The two-faced document had shipped with an
instant swap; the turn is now the animated path and the instant swap stays a
first-class path for a reader who asked for less motion, not a fallback.

What it **decided**:

- **87°, not 90°, is a requirement.** This app mounts one face at a time, so a
  lone face has no backface to hide behind: past 90° the reader would be looking
  at the front of the credential from behind, mirrored and legible as such. The
  sheet stops one hair short, swaps behind the edge, and returns from the OTHER
  edge. `extrapolate: "clamp"` is what makes that true — RN defaults to
  `"extend"` on both ends, so an off-plan 180 would have rendered as `180deg`.
- **Core `Animated` with the native driver, never Reanimated** — this repo lost
  a production build to the worklets runtime, and the screen animates while the
  other face's fetch is in flight on the JS thread.
- **Reduced motion is read at turn time, not during render**, and the
  `reduceMotionChanged` event beats the mount-time read when they disagree: the
  read answers a question asked before the reader touched anything.
- The libreta's fetch now starts at the swap (~205ms later than before) so the
  whole screen changes in the one moment the document turns, instead of in two
  visible waves.

What it did **not** solve:

- **The six copied numbers have no shared source.** 200 / 205 / 260 / 280 (the
  durations, which derive the 485 the old row quoted), 87 and 1700 were
  transcribed by hand from `components/pet-profile/FlipCard.tsx` and
  `app/globals.css`; `@dim/contract/tokens` carries colour and radius and no
  motion at all. `document-turn.test.ts` pins all seven values as literals, so
  the MOBILE side cannot drift silently — but nothing reads the web files, so if
  the web's FlipCard changes a duration the two simply disagree and every test
  stays green. Same shape as the two band tints in the debts table below.
- One test header in `DocumentTurn.test.tsx` had to be corrected rather than
  the test: React coalesces every state update inside one `act` window into a
  single commit, so a log of painted faces cannot count how many turns ran. The
  spy call count is the assertion now; the log is degraded to what it can hold.

### WU-R — rest of the account from the phone — landed 2026-08-29 (lane 838-1)

`GET|POST /api/v1/me/privacy` (art. 14 export, art. 16 supresión) and
`GET|POST /api/v1/me/profile` (the six editable account fields), plus
`apps/mobile/app/cuenta/privacidad.tsx` and `apps/mobile/app/cuenta/editar.tsx`.
`AccountDeletionCard` is now a signpost into the native screen instead of a link
out to a browser that does not share the session.

What it **decided**:

- **The erasure is NOT a second implementation.** `eraseSubjectDataFor` and
  `exportSubjectDataFor` were carved out of the two server actions so the cookie
  door and the bearer door run the same ordered steps. The one piece deliberately
  left on one side is the session close: on a bearer client `signOut()` is a
  no-op (`revoke-sessions.ts` measured it in auth-js 2.105.4 — it reads the
  session from storage, and a `persistSession: false` client never stored one, so
  it reports success and revokes nothing).
- **That split is where the two rights got their FIRST rate limit.** Neither
  surface had one on either side, and the budgets live in the use-cases so the
  web button and the app spend one budget.
- **Their failure directions are deliberately opposite.** The export fails
  CLOSED (a limiter outage would be an unbounded PII dump); the erasure fails
  OPEN (nothing leaves, and an abuse control must not stand between a person and
  a legal right).
- **One path, two methods** — not the `DELETE /api/v1/me` that
  `apps/mobile/src/config/api.ts` predicted. That verb serves one of the two
  rights and cannot carry the other.

What it did **not** solve, and none of it is blocked:

- **No file lands on the phone.** The export is shown and handed to the OS share
  sheet (`react-native`'s own `Share`, no new dependency). Writing a real `.json`
  needs `expo-file-system` → a native module → an EAS build, the pipeline row #1
  rules out. The web link stays underneath for exactly this, and the Data safety
  form still names it. Delete that affordance the day the app can write a file,
  not before.
- **No avatar**, same reason as the pet photo. `GET /me/profile` deliberately
  carries no avatar URL either.
- **`MyProfileUpdatedV1` is `{ saved: true }` and should be
  `{ changed: boolean }`.** The writer already computes the diff for its audit
  row. Deferred because `UpdateProfileResult` is shared with
  `updateEmergencyContactsForPet`, and splitting a shared writer's return type
  mid-worktree-window was the one change worth postponing. Reasoned out in
  `packages/contract/src/api/my-profile.ts`.
- **Rectificación (the "R" in ARCO) is still served nowhere in this product.**
  The input schema is a one-member discriminated union so that right is one more
  member rather than a migration, but nobody has specified it.
- **`AR_PHONE_RE` rejects a well-formed Bariloche mobile.** Found while writing
  a fixture: `+54 9 294 123-4567` warns. The regex is pre-existing and was moved,
  not edited — it now lives in `@dim/contract/input`'s `ar-phone.ts` with
  `lib/reference/ar-phone.ts` re-exporting it, so there is one place to fix.
  Reported, not fixed: it is a soft hint, it blocks no save, and widening a regex
  on a hunch is how one gets wrong in the other direction.
- **A DEACTIVATED account is refused both rights on the phone and granted both
  on the web, and nobody has decided which is right.** `requireUserOrRedirect`
  passes DEACTIVATED on purpose (`lib/infra/auth-guards.ts`), so the web's
  `/cuenta/privacidad` serves a deactivated person; both new routes answer 403
  `account_deactivated`. The read half is argued in the route docblock; the
  WRITE half — art. 16, the right to be erased — is denied on one surface and
  allowed on the other with no written reason. **This is a PO decision, not an
  agent one**, and it is recorded here because it was previously only a code
  comment.

### WU-S — turnos from the phone, three of five — landed 2026-08-30 (lane 094-1)

`GET/POST /api/v1/me/appointments`, `listAppointmentsForUser`, the turnos
vocabulary in `@dim/contract`, and the two native screens
(`apps/mobile/src/turnos/`). **Mis turnos, cancelar and the check-in QR are
done. Buscar and reservar are not**, and they are the two with no native surface
of any kind — a service-kind picker, a jurisdiction-subsuming search, a slot
list, and the write. Row 2 above asked to be resized **M, not L**; the lane did
not edit the size cell, because the board is append-only within a window and two
lanes renumbering one table by hand is how the last conflict happened. **The
integrator applied it on 2026-08-30** (lane 094-1's merge), rewrote the row's
work cell to name only buscar and reservar, and left the row in place — three of
five closed is not a row that comes off the table.

What it **decided**:

- **"Próximos" closes at `ends_at`, and this deliberately DIFFERS from the web.**
  `/mis-turnos/page.tsx` buckets on `starts_at >= now`, so a consultation that
  began ten minutes ago is filed under "Pasados" while its check-in QR is still
  valid — somebody arriving late looks under the wrong heading for the code they
  need. Here `section === "upcoming"` and `canCheckIn` agree for every confirmed
  row. The price is that a turno stays in Próximos for its own duration (90 min
  for the longest service in the catalogue) with `canCancel` saying plainly that
  it can no longer be cancelled. **The page was NOT migrated**, so the two
  surfaces really do disagree today; migrating it is a browser-facing change with
  its own e2e gate.
- **`section`, `canCancel` and `canCheckIn` are the SERVER'S**, and the phone
  never recomputes them. A slow clock keeps offering "Cancelar" on a turno the
  clinic already started; a fast one takes the QR away from somebody standing at
  the desk. `canCheckIn` is not `canCancel`: cancelling closes at `starts_at`,
  the QR lives until `ends_at`.
- **The status vocabulary is FIVE values, not six.** The `appointment_status_valid`
  CHECK admits `confirmed`, `attended`, `no_show`, `cancelled_by_owner` and
  `cancelled_by_org`. The web additionally handles a bare `"cancelled"` in two
  places that the database cannot write; those branches are dead and the wire
  vocabulary does not copy them. An unknown status is **dropped**, not defaulted
  to `confirmed` — which is how the web's detail page painted a green
  "Confirmado" badge over a state it did not know.
- **The write is `authenticated-write`, not `inbox-state`.** Both are `/me`
  writes a person taps, but the inbox family was derived from what its write
  costs (one indexed UPDATE on the caller's own rows) and a cancellation is a
  transaction across three tables that hands a place back to somebody else.
- **The QR encodes `mimar://appointment/{token}`, byte for byte the same string
  the web already prints.** That is a DECLARED DEBT and this lane did not touch
  it: `DEEP_LINK_MAP.appointment` is the one entry whose `appPath` names no
  screen (`APP_PATH_NAMES_NO_SCREEN`), because it is a payload for a
  counter-side reader that does not exist yet. Minting a second string would be
  worse than the debt — the browser and the phone would print two different
  codes for one turno.

What it did **not** solve:

- **Buscar and reservar** — see above. `@dim/contract`'s input union is shaped to
  admit `book` without a version bump; leaving it out is scope, and the contract
  test says so, so adding it later is a deliberate edit rather than a discovery.
- **The web's cancel has NO rate limit of any kind.** It is a bare server action
  behind `requireUserOrRedirect`; this door has one because every `/api/v1` write
  takes the shared family. The gap is the WEB'S, and closing it means editing an
  action the browser also uses.
- **There is no cancellation WINDOW anywhere in this feature.** The only clock
  rule is `starts_at > now()`, so an owner may cancel sixty seconds before the
  slot and the clinic learns from a notification. Whether that deserves a floor
  is a product question.
- **`/mis-turnos/page.tsx` still has its own inline predicate** and its own
  inline query. Two implementations of one bucketing rule, one of them now
  knowingly wrong about turnos in progress.
- **Neither `turnos` route is registered in `apps/mobile/app/_layout.tsx`**, so
  both take expo-router's default header instead of a title. The route resolves
  and the screens draw their own titles, which is why the lane judged it
  unnecessary; the same gap already exists on `cuidado/[grantToken]`. Left as
  reported rather than fixed at the merge, because what a header should SAY is
  copy, and every other registration in that file argues its wording.

**Two blockers this row was REJECTED for, and what the second one is really
about** — recorded because both are patterns, not incidents:

1. The endpoint's two per-IP buckets were never added to
   `API_V1_IP_BUCKET_FAMILIES`, so `__tests__/api-v1-rate-limit-families.test.ts`
   was 2-red and, worse, the aggregate CGNAT ceiling — a `reduce` over that map —
   silently under-declared itself by 720/min. Two floors had also drifted with no
   red at all: `MIN_V1_ROUTE_FILES` (23 against 24 routes) and `MIN_IP_BUCKETS`
   (20 against 29 buckets). **A floor is satisfied by any number above it, so it
   loosens in silence; recount it from the tree, never increment it from the
   previous value.** All three were re-derived at the merge on 2026-08-30 rather
   than trusted: `listV1RouteFiles().length` → **24** (pin 24),
   `Object.keys(API_V1_IP_BUCKET_FAMILIES).length` → **29** (pin 29), and the
   CGNAT ceiling hand-summed per family over the merged map — 14×600 + 6×120 +
   2×60 + 1×240 + 1×600 + 2×180 + 1×240 + 1×120 + 1×144 — → **10 944** (pin
   10 944). Exact on all three, not merely satisfied, which is the state that
   makes the next route go red.
2. **`listAppointmentsForUser`'s authorization `WHERE` had ZERO coverage**, and
   the cause is worth knowing before writing any use-case test in this repo. The
   drizzle stub read `self.where = async () => control.rows` — it discarded the
   predicate. A reviewer mutated `eq(appointments.ownerUserId, args.userId)` to a
   tautology returning every user's appointments and the file stayed 21/21 green,
   with three tests that read like authorization fences passing throughout. **A
   stub that ignores an argument does not merely fail to test it: it makes every
   assertion in the file assert that the argument does not matter.** The same
   hole sat one line higher, in the art. 16 join, which was guarded by a
   source-text `toContain("isNull(pets.deletedAt)")` — that passes for
   `or(isNull(pets.deletedAt), sql\`true\`)`, which keeps the substring and stops
   filtering. The instrument that closes both: capture the fragment the use-case
   hands drizzle and compile it with `PgDialect().sqlToQuery()`, then assert the
   SQL text **exactly** and the bound params. It proves what Postgres is asked,
   not what Postgres answers — but "what is it asked" is the half a tautology
   breaks, and it needs no database. Seven mutations were applied for real and
   each killed at least one test.

### WU-V — reclamar desde el teléfono, two of three — landed 2026-08-30 (lane 53c-3)

`POST /api/v1/me/pet-claims` with two commands (`lookup`, `claim_free`), the
claim vocabulary in `@dim/contract`, and `apps/mobile/src/claims/` behind
`/reclamar`, linked from the footer of `/mascotas`. **Confirmar el chip and
reclamar are done. The camera scan is not**, and it is the one capability of the
three that needs a native module.

The endpoint is an adapter over `lookupForClaimForUser` and
`submitFreeClaimForUser` — the same two use-cases `/mis-mascotas/reclamar` drives
— and re-derives no guard.

What it **decided**:

- **The route hangs off `/me` and names no animal, because there may not be one
  to name.** Both writers resolve the pet FROM the private identifier and consult
  no caller-supplied token; `submit-claim-dispute.ts` records what a `petToken`
  in that position cost the last time it was there — it went straight into a
  `where` behind nothing but a session, which made the dispute writer "a national
  denial-of-rescue button", because `/perdidas` publishes the token of every lost
  animal with no login. A `/pets/{token}/claim` route would be a route whose
  shape invites the bug back, so the wire shape has no token field at all and the
  contract test asserts one sent anyway is dropped by the parse.
- **`canClaim` is on the wire and the phone never derives it.** It equals
  `variant === "free"` today and deriving it would still be wrong: "free" is an
  authorization rule owned by the writer (no active custody of ANY role,
  re-checked inside the claiming transaction under `SELECT … FOR UPDATE`, plus
  three status gates). `ClaimScreen.test.tsx` pins it BY CONTRADICTION — a `free`
  ack carrying `canClaim: false` must draw no button — which is the case that
  separates "reads the flag" from "reads the variant and the flag happens to
  agree".
- **The DISPUTE is refused rather than deferred, and that is the difference from
  WU-S's missing `book`.** `submitClaimDisputeForUser` requires at least one
  evidence FILE and refuses without one (PO decision 2026-07-30), because raising
  one notifies the registered owner, appends an uneditable row to the animal's
  spine, flips `pets.in_custody_dispute` — which strips the owner's phone and the
  finder form off the public credential — and opens a case an authority must
  adjudicate. A JSON transport cannot carry a file, so a `dispute` member would
  be a command the server refuses on every call while the client draws the
  control anyway. The screen names the browser instead, and the input union has
  two members with a test saying so.
- **The failure arm of both use-cases is now TYPED** (`ClaimFailureCode`, five
  values), so this door maps a code to a status instead of matching es-AR prose.
  `me/appointments/commands.ts` does match sentences and states its own failure
  mode — "a reworded sentence falls through to a 500" — and this is the repair
  `AmendEventFailureCode` already is. The web reads `result.error` and is
  unaffected; the field is REQUIRED so a new refusal arm cannot land without
  deciding which of the five it is.
- **`petToken` comes back only for `lost`,** one step tighter than the web's own
  action, which returns one for `free` and `active_owner` too. A token is a
  navigable capability and travels only where the client has a destination — the
  avistaje form. `free` does not need it: the CLAIM's ack carries the token the
  writer resolved, which is the one to navigate with.
- **No per-user bucket at the route.** The per-user ceiling already exists inside
  both use-cases (`claim_lookup`, 30/min + 200/hr, shared between lookup and
  claim so a burst of probes counts as one) and it is the budget the WEB spends.
  Adding `API_V1_AUTHENTICATED_WRITE_USER_LIMIT` on top would make the phone
  three times tighter than the browser for the same act.
- **Stricter than the web on a DEACTIVATED account, said out loud.**
  `requireUserOrRedirect` passes one on purpose so the browser's wizard serves
  it; `requireLiveUser` answers 403. The direction is the safe one — it grants
  nothing the browser grants — and it is pinned by a test so it stays a decision
  rather than becoming drift. It is the same divergence `me/privacy` recorded,
  and it is NOT the same question: that one is about a legal right.

What it did **not** solve:

- **The camera.** `expo-camera` is a native module and that is an EAS build —
  row 1's pipeline, six builds and five root causes. The screen says so in a
  callout rather than leaving somebody hunting for a scan button, and the change
  is strictly additive: a scanner would set the same string the keyboard field
  sets and nothing else on the screen would move.
- **`api_v1_me_pet_claims_ip` IS NOT IN `API_V1_IP_BUCKET_FAMILIES`**, because
  `lib/infra/api-v1-limits.ts` was another lane's territory in this window. Two
  assertions in `__tests__/api-v1-rate-limit-families.test.ts` are red on the
  branch and the fix is one map entry (`authenticated-write`) plus the floor and
  the CGNAT pin, recounted from the merged tree. **The under-declaration is the
  turnos rejection's exact shape and is called out here rather than left to be
  discovered**: while the bucket is missing from the map, the computed ceiling
  under-declares by 120/min.
- **The ceiling it spends is TIGHTER than this act's own derivation, knowingly.**
  `api-v1-limits.ts`'s rule is 12× the per-user anchor, which for
  `claim_lookup` would be a `pet-claim` family at 360/min + 2 400/hr. It spends
  `API_V1_AUTHENTICATED_WRITE_IP_LIMIT` (120/min) meanwhile, which is FOUR
  simultaneous callers per carrier gateway rather than twelve. Tighter is the
  safe direction for a bucket, and the cost is named: four people behind one
  CGNAT address each probing at their full personal rate exhaust the minute.
- **`reclamar-dni` is untouched.** The web's claim page carries a second door —
  "¿Te adoptó un refugio? reclamá por DNI" — pointing at
  `/mis-mascotas/reclamar-dni`, and `claimStubProfile` is behind a
  `STUB_CLAIM_ENABLED` gate that is OFF (`__tests__/claim-gate.test.ts` asserts
  the pausado message). Nothing native was built for a flow the web itself has
  switched off.
- **`/reclamar` is not registered in `apps/mobile/app/_layout.tsx`**, so it takes
  expo-router's default header instead of a title — the same gap WU-S recorded
  for both `turnos` routes and `cuidado/[grantToken]`. The screen draws its own
  title. Left as reported rather than fixed, for WU-S's reason plus one: that
  file was another lane's territory in this window.

## Attempted and turned back — the work exists, on a branch, and did not land

Written down for the same reason the landed blocks are: the next agent who picks
one of these rows should start from the branch and the review, not from zero.
**Neither branch is merged and neither is a base to build on without reading its
blockers first.** Both were turned back by a fresh-context reviewer at the
integration gate on 2026-08-30, and in both cases the blocker was a fence or a
runtime that the lane's own evidence never exercised.

| Row / topic | Branch | Why it did not land |
|---|---|---|
| Row 3 — **WU-U**, adoption from the phone | `worktree-wf_60cb7fe0-094-2` (`be4c73874`) | The lane declared **one** red fence (rate-limit families) and there were **four**. `check-file-size` (`adoption-repository.ts` at 1521 lines against a hard 1500 — the fix is splitting the file, not baselining it), `check-notifications-service` (new code doing a raw `db.insert(notifications)` where the fence exists to migrate call sites onto `createNotification()`), and `check-audit-log-coverage` (seven operator actions with no reachable audit write). All three go red at `bcbaf2ed9` and are green at the base. The audit one has a root cause the reviewer established empirically rather than inferred: a module-level alias `const flushNotifications = flushAdoptionNotifications;` is followed by the fence's `importedIdentifiers()`, which then resolves into a file with no audit write. |
| The **E2E job's permanent red** (not a table row) | `worktree-wf_60cb7fe0-094-3` (`2010d7655`) | The diagnosis is worth keeping — the stack was **up in 44 of 45 runs**, so "is the stack up?" was never the failure — but the fix is not. GitHub runs a composite action's `shell: bash` as `bash --noprofile --norc -e -o pipefail`; the new `supabase-start` action sets `set -uo pipefail` and never `set +e`, so the runner's `-e` kills the step on the first failed attempt and the retry loop, its two `::warning::`s and the `::error::` it exists to emit are all unreachable in CI. The test that fences it runs the script under bare `bash` (no `-e`), so eight tests pass over a script that does not retry — the harness reproduced the author's belief about the runner instead of the runner. |

Two findings from the second branch are real regardless of whether that branch
ever lands, and both are **PO-gated**, so they are recorded here rather than
carried into code by an integrator: `e2e-nightly.yml` declares
`STAGING_SUPABASE_URL` / `STAGING_SUPABASE_ANON_KEY` and the job log shows both
**empty**, which is why the cross-tenant isolation spec dies naming the anon key;
and the registry throttling in those runs is **ECR Public**, not Docker Hub, so a
`docker/login-action` with Hub credentials would buy nothing. Neither is written
into the numbered PO list below, because the branch that measured them was turned
back and a rejected lane's evidence should be re-measured before it becomes a
standing instruction.

## Declared debts, with an owner

| Debt | Weight | What it is |
|---|---|---|
| The `KNOWN_GAP` register the Ley 25.326 fence revealed | open | Owner notes on appointments, reminder titles, foster proposal notes, org invitation emails **in plaintext**. Named, printed on every run, ratcheted in both directions. **This row carried "21 tables" until 2026-08-29 and had been wrong since migration 0207** — the fourth copy of a number that has now rotted three times. It states none: `pnpm lint:subject-rights` prints the live count, and AGENTS.md §7 is the one document that writes it down. |
| A tester crash is unreadable | no instrument | R8 does **not** run in this app (verified in the Expo template), so Play's warning names nothing. But a tester's crash will be JavaScript: measured on the shipped `.hbc`, three of six local functions keep their names and three don't, no source map ships, and there is no crash reporter. |
| Two band tints outside the contract | small | **Pregnancy** and **memorial** use colours absent from `@dim/contract/tokens`, so the shared contract does not carry the web's full palette. They fall back to the default tint and the chip still says what is happening — no information lost, but it is debt in the shared layer. |
| Two files parked in the art.16 fence | small | `caretaker-public-contact.ts` and `app/page.tsx`, each with a rationale recorded in the fence. |
| Checksum drift on migration `0188` | pre-existing | Someone edited that migration **after** applying it. The database is fine; the record of what was applied is not. |
| The turnos endpoint's four rate-limit gates say nothing about **who** spends them | owner: the next lane in `me/appointments` (row 2) | Landed as an accepted reserve on 2026-08-30. The route passes the right identifier — `callerIp(request.headers)` on the two IP gates, `live.user.id` on the two user gates — but `__tests__/api-v1-me-appointments-route.test.ts` stubs `enforceRateLimit: async (endpoint: string)` and drops the second argument, so collapsing all four onto shared constants leaves the file 36/36 green. **Ten sibling route tests already take `(endpoint, identifier)` and assert the pair**; `api-v1-me-profile-route.test.ts` even pins the literal IP. One-line fix, in the file the next lane is already opening. Not a blocker: the production identifiers are correct and no authorization boundary is involved. |
| The same endpoint's documented **fail-open** has no test | owner: same | `spendBudget` catches a non-`RateLimitError` and returns `true` on purpose — a limiter outage must not stand between an owner and cancelling a turno. Flipping that `return true` to `return false` leaves the file 36/36 green, so the invariant its docblock argues at length is unmeasured. Five sibling files carry a test literally named "FAILS OPEN when the limiter itself is broken"; this one does not. |

## PO-gated — not agent work, do not attempt

Listed so you recognise them and hand them over instead of trying.

1. Upload **build 6** to Play. Build 5 is published and **cannot sign in** — it shipped without `EXPO_PUBLIC_SUPABASE_*`, which are baked at build time.
2. Revise the **Data Safety** form before any build with uploads reaches Play. It declared on 27/08 that the app does not collect photos; that stops being true the moment uploads ship, and a form that no longer matches the binary is a policy violation by itself.
3. Apply migrations **0205, 0206, 0207** to staging and production. Written and green locally. **Applying to a remote DB is Ignacio's call, never yours.**
4. Resend email setup (domain verification → API key → SMTP in Supabase → env in Vercel). Until it lands, the 6-digit password-recovery code does not travel and the screen promises what the mail does not deliver.
5. The two store graphics, pointing `mimar.com.ar` at Vercel, the tester acceptance link, the Supabase "exceeding limits" warning, and the 12 tester emails.

## Two live hazards, today

- **16 open PRs are based on the dead `main` tip** (14 dependabot + one July draft + one June docs). They will show phantom conflicts. Leave them; closing or rebasing them is the PO's call.
- **Something started a merge of the old `main` into the working tree on 2026-08-28** and aborted it, leaving conflict markers in `package.json` for a few minutes. Root cause unknown; there are 9 agent worktrees registered. If you see an unexplained `UU` or a `reset: moving to HEAD` you did not run, stop and audit before editing.

## Docs whose headers lie

`docs/superpowers/README.md` is the spec/plan index and its body is useful, but
its top banner is **stale**: it names an active branch (`integration/session-review`),
a working copy path (`C:\dim`) and a test count (6511) that no longer exist. Read
the tables, ignore the banner. Older initiative docs — the master integrity plan
(Ola II) and the Ola 1 batch plan — date from July and may or may not still be
live; ask before picking work from them.

`docs/agents/collaborating-writer.md` — **fixed on 2026-08-30 by the integrator**,
after two consecutive windows reported it and neither owned the file. Its "Your
first task" section had handed every new writer "let an owner edit their pet's
data and their emergency contacts" and claimed "there is no edit screen of any
kind"; both stopped being true at `ecc835aa4`. It was **not** retargeted at row 1
as this page previously asked — row 1 is the pet photo, which the same table
marks **"Not a first task"**, so that instruction contradicted itself. The
section now names no task at all and points here instead, keeping only the
guidance that does not go stale (pick by what a tester hits, copy the web's guard
rather than re-deriving it, and do not start with the pet photo). The ten rules
on that page were current and were not touched.

### The subject-rights counts no longer lie, and cannot again in the same way

Four documents wrote the size of the debt register and three were wrong —
AGENTS.md §6b, the coverage fence's own header, and this page's debts row. Only
§7 was current. Measured against the live lint on 2026-08-29: the two RPCs reach
**22** of the 54 classified public tables, and the register holds **17**. The
stale figures are not quoted here on purpose; a wrong number reads as current no
matter what the sentence around it says.

The literals were not simply retyped, because that had already been the fix
twice and the number rotted anyway. Instead: §6b and this page's debts row carry
no count at all, §7 carries one, and
`__tests__/documented-subject-rights-counts.test.ts` derives every remaining
number from `IN_EXPORT` / `IN_ERASE` / `KNOWN_GAP` and goes red when the prose
disagrees — including a sweep of both this file and AGENTS.md for any second,
contradicting count. **Do not add a fifth copy.** If you need the number, run
`pnpm lint:subject-rights`.

One number in that family is still NOT derived, and it is written down where it
matters rather than only here: the header of
`__tests__/rls/soft-delete-read-surface.test.ts` says eight read policies over
the six `deleted_at`-bearing tables (it said ten, which was every policy
including two UPDATEs). Its section 5 asserts only `rows.length > 0`, so an
eventual ninth would not turn anything red. Pinning it is one line in that
assertion.

## Branch topology — changed 2026-08-28

`main` **is the working branch.** You commit and push to it directly. It is the
same commit as `integration/all-20260703`, CI triggers on push to it (`ci.yml`:
`push: branches: [main, develop, "integration/**"]`), and the six scheduled
fences finally execute today's tree instead of a frozen one.

Protection is deliberately thin so ordinary work needs no PR dance: no required
PR, no blocking status checks, `required_linear_history` off (the worktree flow
generates merge commits by design). What stays on: the branch cannot be deleted
and cannot be force-pushed. Those two cost nothing on a normal push and are the
only ones that save you from a bad day.

**CI on `main` is advisory, not blocking — and that moves the burden onto you.**
The real gate is local: `pnpm verify` + `pnpm test:verified`, the Definition of
Done in `/CLAUDE.md`. Nothing on the server will stop you from pushing red. Do
not let that mean what it does not: the green local gate is still required, it
is simply no longer enforced by a machine at the last moment.

### Open follow-up: `DEPLOY_REF` still points at the integration branch

`scripts/check-scheduled-fence-refs.ts` declares
`DEPLOY_REF = "integration/all-20260703"`, and eleven `ref:` pins across six
workflows follow it. Those pins exist because `main` used to be three weeks
stale — they force a scheduled run to check out real code instead of the frozen
default branch.

That reasoning is now inverted, and the pins will re-create the original bug in
mirror image the moment `integration/all-20260703` stops moving. **This is not
fixed yet**, because it depends on something outside the repo: staging deploys
from `integration/all-20260703` on Vercel, and `db-doctor-staging` and
`staging-health` compare a tree against *that deployment*. Repointing the pins
before Vercel's deploy branch moves would break them in the other direction.

Sequence, once the PO decides: Vercel staging deploy branch → `main`, then
`DEPLOY_REF` → `main`, then the eleven pins can be deleted outright (a scheduled
`actions/checkout` with no `ref:` already checks out the default branch). Do not
do any one of those steps alone.
