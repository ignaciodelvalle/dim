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
| 4 | **WU-V** — the **camera scan** only. Confirmar el chip and reclamar landed 2026-08-30 — see the block below before starting. | M | The scan is the LAST of the three and the one the block did not attempt: reading a chip's barcode needs `expo-camera` → a native module → an EAS build, the same pipeline row 1 is held back by. It is strictly additive over what landed — it sets the same string the keyboard field sets. **Row left in place on purpose: one of three closed is not a row that comes off the table.** |
| 5 | **WU-T** — citizen abuse reports. **A branch exists and it is nearly whole — do NOT start from zero.** | M | Attachments blocked on signed uploads. **Not the same thing as reporting content** — this is Ley 14.346, nine types, routed to an authority. **Turned back at the 2026-08-30 integration gate on five merge conflicts with the adoption lane, not on a fence** — the branch's own gate is green except for two declared reds it hands to the integrator. Read its entry in "Attempted and turned back" before opening it; the conflict surface, the resolution the integrator would not take, and one *serio* runtime finding are all recorded there. |
| 6 | **WU-P** — rehoming, foster, return, relocation, org memberships | L | Advanced custody cycle. |

**Row 3 (WU-U, adopción) is GONE from the table above and the numbering was NOT
closed up.** The four capabilities all landed on 2026-08-30 — see the block at
the end of this page — so unlike rows 2 and 4 there is no narrowed remainder to
leave behind, and the page's own rule applies in the other direction: "a row left
on the table after it landed is how the next agent spends a day rebuilding it".
The gap between 2 and 4 is deliberate. **These numbers are identifiers, not an
ordering** — three merge conflicts on this page have come from lanes renumbering
a table by hand, and every write-up in this file, in engram, and in the rejection
history says "row 3" and means adopción. A renumber would silently repoint all of
them at WU-V.

**The integrator owns that call and RATIFIED it on 2026-08-30, after auditing
the pointers rather than taking the argument on trust.** Renumbering is the
integrator's job precisely so it happens once and not per-lane, so "the lane said
not to" is not a reason on its own. The audit is: `rg -i '\brows? [0-9]+\b'` over
this file returns nine pointers. Three say **row 1** (pet photo) and three say
**row 2** (WU-S); both survive a renumber untouched, because nothing before the
gap moves. One says **row 4** and is self-referential. The remaining **four all
say "row 3" and all mean adopción** — two of them are the `Attempted and turned
back` rows, which this page forbids editing on the ground that "a rejection
edited away stops teaching anybody anything". So closing the gap would either
repoint four true sentences at WU-V or force an edit into the one table the page
protects. **The table below therefore holds five rows — 1, 2, 4, 5, 6 — and the
count, not the highest number, is the thing to quote.**

Also not done from the phone, each its own slice: correct species, rabies
appointment, physical tag, printable lost poster, health-record export,
assistance dog (Ley 26.858), attaching a photo to an entry, and five entry types
(tattoo, microchip replacement, bite, death, post-adoption check-in — the app
writes 11 of 16). Reminders are read-only rows: no "snooze 7 days", no "record".
Editing the pet now works, but only for three fields — see the landed block for
the fourteen columns it left on the web.

## Landed since this snapshot — do not pick it up again

**A landing written up below did not necessarily take a row off the table**, and
three of them did not: WU-S (row 2) and WU-V (row 4) are both still there, each
narrowed to the capabilities it did not close, and the `supabase start` retry at
the end of this section was never a table row at all — it replaces a branch the
next section had marked as turned back. Each block is written up the same way:
what was done, what it **decided**, and what it did **not** solve. A row deleted
without its remainder is how the remainder gets lost — and a row left on the
table after it landed is how the next agent spends a day rebuilding it. Both have
happened here.

**THE COUNT THAT USED TO OPEN THIS PARAGRAPH IS GONE, deliberately.** It read
"Five landings are written up below, and only four of them took a row off the
table", and it was written that way precisely because "five blocks" and "five
rows gone" are not the same claim. The distinction was right and the instrument
was wrong: a number in prose has to be edited by every lane that appends a block,
nothing goes red when it is not, and the very next window appended one. Two
numbers in one sentence are two chances to rot. The claim survives without
either — read the blocks, count them yourself if you need a figure, and do not
write it down here.

**This paragraph is itself the evidence.** In the same window that deleted the
count, a second lane edited the very sentence being deleted — "Five landings" →
"Six" — and the two edits collided at the merge. Both lanes were right about the
same defect and only one of them fixed it; the integrator resolved the conflict
in favour of no number and folded the sixth block into the prose. That is the
whole argument for the deletion, played out in one merge.

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
- ~~**`api_v1_me_pet_claims_ip` IS NOT IN `API_V1_IP_BUCKET_FAMILIES`**~~ —
  **CLOSED AT THE MERGE, 2026-08-30.** It was left open on the branch because
  `lib/infra/api-v1-limits.ts` was another lane's territory in the window, and
  the lane called it out rather than leaving it to be discovered — which is the
  difference from the turnos rejection this has the exact shape of. The
  integrator added the entry (`authenticated-write`) and RECOUNTED both pins from
  the merged tree rather than moving them by what the lanes reported:
  `Object.keys(API_V1_IP_BUCKET_FAMILIES).length` → **30** (`MIN_IP_BUCKETS` 29 →
  30) and the CGNAT ceiling hand-summed per family — 14×600 + 7×120 + 2×60 +
  1×600 + 1×240 + 2×180 + 1×240 + 1×120 + 1×144 — → **11 064** (pin 10 944 →
  11 064), with the computed `reduce` agreeing. **The recount was not ceremony
  here:** a third lane in the same window reported 32 buckets and 12 204 and was
  turned back, so arithmetic over the reported numbers would have pinned a tree
  nobody was going to have. `MIN_V1_ROUTE_FILES` was recounted too and did NOT
  move — 25, equal rather than merely satisfied, because the lane that would have
  taken it to 27 is the one that did not land.
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
- ~~**`/reclamar` is not registered in `apps/mobile/app/_layout.tsx`**~~ —
  **CLOSED AT THE MERGE, 2026-08-30**, with `title: "Reclamar una mascota"`. The
  lane was right not to write it: that file was another lane's territory in the
  window, and what a header should SAY is copy. The integrator could close it
  because the copy did not have to be invented — that exact string is already the
  screen's own `<Title>` in its entry state and the web's `<h1>` on
  `/mis-mascotas/reclamar`, so the registration transcribes a decision somebody
  already made rather than making one. **The two `turnos` routes and
  `cuidado/[grantToken]` are still unregistered**, and were deliberately not
  swept up: no such precedent exists for their wording, and picking three headers
  in a merge commit is exactly how copy stops being argued.

### The `supabase start` retry that retried zero times — landed 2026-08-30 (lane 3d7aec24-53c-2)

`.github/actions/supabase-start` (new), the two `ci.yml` call sites, the
`::error::` repair in `.github/actions/supabase-env`, and the two fences
`__tests__/supabase-start-action.test.ts` / `__tests__/supabase-env-action.test.ts`
over a shared harness, `__tests__/_helpers/github-step-shell.ts`. This is the
work the block below was turned back for; the diagnosis was kept and the fix and
its fence were rewritten.

What it **decided**:

- **A `shell: bash` step runs under `-e` and a script may not pretend
  otherwise.** GitHub executes `bash --noprofile --norc -e -o pipefail {0}`. The
  rejected version opened with `set -uo pipefail` and a comment claiming errexit
  was off, so its bare `pnpm exec supabase start` / `RC=$?` pair died on the
  first failed attempt: the retry, both `::warning::`s and the `::error::` were
  unreachable in CI, and the action retried **zero** times in the only
  environment it runs in. The fix is `set -euo pipefail` DECLARED plus
  `cmd || RC=$?` — the left of an AND-OR list is exempt from errexit and `$?` is
  read at the `||`, so it holds whether or not the caller set `-e`. A `set +e`
  around the call was rejected: it is a global switch that has to be re-armed by
  guessing a state the script does not know, and it would make every later line
  of the loop non-fatal.
- **The harness derives the interpreter from the step, and refuses to guess.**
  The old fence ran the script with `execFileSync("bash", [scriptPath])` — no
  flags — so eight tests passed over a script that does not retry in production.
  `readCompositeStep()` now returns the `run:` block WITH the `shell:` it
  declares, and `runnerArgv()` throws for a shell it has no mapping for rather
  than falling back to bash's. Same shape as the drizzle stub that discarded its
  predicate: **the defect was in the scaffolding, so every assertion standing on
  it inherited it.** One case runs the same script under bare `bash` and asserts
  the two agree, because "retries only if the caller set the right flags" is the
  original bug restated.
- **`inbucket` was a dead name and the CLI only WARNS about one.** Run
  33260290131: `not valid to exclude: inbucket` — renamed `mailpit` upstream, so
  the mail catcher had been starting on every run. It is **dropped, not
  translated**: dropping changes nothing about which containers come up (the CLI
  was already ignoring it), while writing `mailpit` newly excludes a service on
  two jobs this lane cannot watch. The fence checks every name against the CLI's
  own accepted list, so the next typo goes red instead of silently starting a
  service.

What it did **not** solve:

- **`panorama-qa-nightly.yml` still starts the stack inline, twice**, each with
  its own copy of the exclude list. The drift the action prevents between the two
  `ci.yml` jobs is therefore still live between `ci.yml` and the nightly.
  Reported rather than migrated — it is a behaviour change to a job with no local
  gate — and the count is PINNED at two, so a third copy goes red and so does
  migrating these two without deleting the expectation.
- **The E2E job is still red, and this was never the cure.** The stack was up in
  44 of 45 measured runs; the other 42 reds are inside `Run Playwright e2e suite`
  and are the suite's own assertions. Anyone reading this block as "the E2E fix"
  has the wrong file.

  **A lead for whoever takes that red, measured 2026-08-30 on run 33260290131
  and reported rather than touched** — the specs were NOT edited to pass, which
  is the whole point. The failures are their own PRECONDITIONS, not their
  subjects: `e2e/cross-tenant-isolation.spec.ts` dies with `Owner A has no pets
  visible via PostgREST — every cross-tenant probe below would compare against
  nothing. Re-run pnpm seed:test.`, and `e2e/rehome-by-titular.spec.ts` with
  `owner@dim.test has no active pet — the rehome walk needs one (seeded by
  scripts/seed-test-users.ts).` The `Bootstrap DB` step runs and reports no
  error, so this is not "the seed step failed"; it is that what the step leaves
  behind is not what the specs look for. Counted by file across that run:
  `executive-smoke` 41, `cross-tenant-isolation` 35, `rehome-by-titular` 19,
  `synthetic-monitor` 18, `public-smoke` 17, `api-v1-auth-refusals` 15. Start at
  the fixtures, not at the specs — and note this is a different failure from the
  nightly's, which is PO item 6 (a secret that does not exist).
- **Excluding `mailpit` for real** — worth doing (one fewer anonymous ECR Public
  pull on a stack throttled by pull volume), and left to whoever can watch the
  job.

**Four gaps in this lane's OWN fences, found by the reviewer at the gate and
accepted as reserves rather than blockers** — the code that shipped is right in
all four cases and it is the measurement that is narrower than its prose. Every
one was established by applying the mutation and watching the suite stay green,
so they are facts about the fence, not opinions about it. **Whoever next opens
`__tests__/supabase-start-action.test.ts` should close them there**, since the
file is already the right place for all four:

1. **The `env:` block that wires the inputs into the script is fenced by
   nothing** — the strongest of the four, and the same shape as the `inbucket`
   defect this lane exists to have caught. The fence pins the `default:` (YAML
   text) and the script pins the USE of `$SUPABASE_EXCLUDE`; the link between
   them is unmeasured, and so is a call site's right to override the default with
   `with:`. Three mutations, all 25/25 green: replacing
   `SUPABASE_EXCLUDE: ${{ inputs.exclude }}` with a literal that both excludes
   `gotrue` (auth dead on two jobs) and reinstates the dead `inbucket`; pointing
   `SUPABASE_ATTEMPTS` at `inputs.backoff-seconds` (attempts silently becomes
   15); and adding `with: exclude: studio` to one `ci.yml` call site, which
   re-diverges the two jobs — the only reason this action exists. The test's own
   prose says the default "is the single source of truth for which services the
   CI stack skips — and nothing fenced it". Fix: parse the YAML and assert each
   `env:` value is exactly `${{ inputs.<name> }}` for its input, and that no call
   site passes `with:`.
2. **A JOB-level `continue-on-error` walks past the assertion that says it
   cannot.** Adding `continue-on-error: true` to `ci.yml`'s `e2e:` job leaves the
   suite 25/25 green. The test is named "is not wired with `continue-on-error` at
   any call site" and its comment says "the loop can be perfect and still be
   neutralised one level up" — but `stepsUsing()` returns the STEP, and the job
   is the level up it is talking about. The shipped YAML is clean at both levels
   (verified by parsing); it is the promise that overreaches.
3. **Nothing fences the `sleep` between attempts.** Every case runs with
   `SUPABASE_BACKOFF: "0"`, so deleting the `sleep "${BACKOFF}"` line entirely is
   25/25 green. The comment justifies the zero — "the doubling is arithmetic, not
   behaviour" — which is true of the doubling and not of the sleep's existence,
   and this is the one place it matters: the only measured failure motivating the
   retry is a container still holding 54322, which is precisely the case that
   needs the wait. Without it the retry re-hits the port AND the `::warning::`
   that says "retrying in ${BACKOFF}s" starts lying.
4. **The structural grep fence only sees single-line assignments**, so it does
   not catch the original bug in its original form. The filter requires `grep` on
   the same line that opens the assignment, and the broken `CLEAN=` this lane
   repaired was multi-line with the `grep -E` on a continuation. Reverting it goes
   red once — from the EXECUTED case, not from this fence. Reverting the
   single-line `ANON=` goes red twice. Nothing ships broken, because the executed
   case covers it; the declared purpose ("a future edit that reintroduces a bare
   `grep` in an assignment is named") is narrower than it reads. Fix: join
   backslash continuations before filtering.

## Attempted and turned back — the work exists, on a branch, and did not land

Written down for the same reason the landed blocks are: the next agent who picks
one of these rows should start from the branch and the review, not from zero.
**No branch here is merged and none is a base to build on without reading its
blockers first.** Each was turned back at an integration gate.

**Until 2026-08-30 that sentence continued "and in every case the blocker was a
fence or a runtime that the lane's own evidence never exercised". It is no longer
true, and the exception is the most useful thing in this section.** WU-T was
turned back with a **green** lane gate and an *aprobado-con-reservas* review. Its
blocker was **five content conflicts against the lane that merged an hour
earlier**, in files neither lane was wrong to touch. No amount of fence-running
would have caught it, because the defect was not in either tree — it was between
them. If you are the second lane in a window, the conflict surface is a thing to
measure early, not a thing to discover at the gate.

**One row was turned back TWICE, on different blockers each time — and it LANDED
on the third, 2026-08-30.** The two rows below are kept exactly as they were
written, because a rejection edited away stops teaching anybody anything; the
pair remains the most instructive thing on this page about how thorough evidence
can still be blind. **But neither is work waiting on a branch any more.** Do not
open either one looking for something to do: WU-U is closed, its write-up is the
block at the end of this page, and the third attempt's own account of the seam
both of these fell through is in "The two census fences" there. What survives
here is the diagnosis, not the task.

| Row / topic | Branch | Why it did not land |
|---|---|---|
| Row 3 — **WU-U**, adoption from the phone — **attempt 1** | `worktree-wf_60cb7fe0-094-2` (`be4c73874`) | The lane declared **one** red fence (rate-limit families) and there were **four**. `check-file-size` (`adoption-repository.ts` at 1521 lines against a hard 1500 — the fix is splitting the file, not baselining it), `check-notifications-service` (new code doing a raw `db.insert(notifications)` where the fence exists to migrate call sites onto `createNotification()`), and `check-audit-log-coverage` (seven operator actions with no reachable audit write). All three go red at `bcbaf2ed9` and are green at the base. The audit one has a root cause the reviewer established empirically rather than inferred: a module-level alias `const flushNotifications = flushAdoptionNotifications;` is followed by the fence's `importedIdentifiers()`, which then resolves into a file with no audit write. |
| Row 3 — **WU-U**, adoption from the phone — **attempt 2** | `worktree-wf_3d7aec24-53c-1` (`4bf8cc280`) | **All four of attempt 1's fences were fixed, at the cause rather than the symptom, and the lane was turned back on two it never ran.** Both are vitest files, both under `pnpm test:verified`, both isolated green at `3a1a7f1c1` and red at `4bf8cc280` in the same environment. (1) `__tests__/public-token-throttle-coverage.test.ts` — "every file spelling `unerasedPetByToken(` is a reviewed authenticated resolver, in both directions": the new `src/modules/adoption/infrastructure/adoption-public-reads.ts` spells it and is not in the `ALIAS_RESOLVERS` pin. The fence's own comment says a new speller must fail until a human decides which name it deserves, and that an ANONYMOUS surface must spell `publicPetByToken` and take the read limiter — the file's docblock says two of its five methods serve sessionless requests on the public web. The answer may well be "add the path to the pin", since the bearer door does authenticate; **the decision is what the fence demands and it was not taken.** (2) `__tests__/content-report-read-coverage.test.ts` — "NO read of a lost-feed note is outside the list": `src/modules/adoption/infrastructure/my-applications-read.ts` comes back `unaccounted`. Lifting the page's raw SQL into a module put the reader inside the moderation sweep — it reads `pet_events`, matches `CAN_CARRY_LOST_NOTE`, carries no `notReportedClause()`, and is triaged into none of `MUST_SUBTRACT` / `DECLARED_EXEMPTIONS` / `NOT_A_LOST_NOTE_READ`. Probably a triable false positive (the query uses `note_added` only for a `MAX(recorded_at)` that derives `info_requested`, and renders no note text), but the triage is the fence's whole demand. |
| Row 5 — **WU-T**, denunciar maltrato from the phone (Ley 14.346) | `worktree-wf_9fe8ac47-d4e-2` (`1f660b7c7`) | **Not a fence and not a red. Five content conflicts against WU-U, which merged first in the same window.** Measured on the merged tree, not predicted: `apps/mobile/app/mascotas/index.tsx`, `apps/mobile/src/api/endpoints.ts`, `apps/mobile/src/api/error-copy.ts`, `apps/mobile/src/ui/routes.ts`, `packages/contract/src/api/errors.ts`. Three more shared files auto-merged (`packages/contract/src/api/index.ts`, `packages/contract/src/input/index.ts`, and **this page**), so the count of *shared* files is eight and the count of *conflicts* is five — do not quote the first for the second. **The integrator's standing rule is that a conflict outside this page stops the merge and gets reported**, and the footer conflict shows why that rule is not bureaucracy: both lanes appended a `SecondaryButton` to the same `/mascotas` footer, and **both wrote a long comment arguing for the slot they took** — WU-U's says adoption "sits with them anyway because the alternative … is a screen that exists and cannot be reached", WU-T's says denunciar "is LAST, below reclamar, and the gap between the two is bigger than the gap between reclamar and registrar". A `git checkout --theirs` would leave one of those two comments standing over an arrangement it does not describe. That is a product decision about button order, and nobody took it. The other four are narrower (an endpoint, an error-copy switch arm, a `ROUTES` entry, one `API_V1_ERROR_CODES` member) but sit in the same append-at-the-end shape. **Everything else about this lane is sound**: 64 of 66 `lint:*` green with `route-weight`/`csp-prerender` honestly declared unmeasured, the whole `unit` vitest project at 645/645 files and 9373 tests, 31/31 targeted `db` files, mobile Jest 53 suites / 824 tests, both typechecks clean. It hands the integrator three things and **all three are still unapplied**, because applying them without the code they serve would break the tree: the `api_v1_welfare_reports_ip: "authenticated-write"` entry in `API_V1_IP_BUCKET_FAMILIES`, the `<Stack.Screen name="denunciar">` registration in `apps/mobile/app/_layout.tsx`, and the recount of the two floors. **Its reviewer found one *serio* the next lane must fix before re-offering it**: `geocodeAddressPublicAction` is called bare in `app/api/v1/welfare-reports/commands.ts:142` and `route.ts` does not wrap `runWelfareReportCommand` in try/catch, while `geocodeAddress` throws on three paths (`rate_limited`, `fetch_failed`, `provider_error`). The reviewer measured it with a `geocodeThrows` arm on the stub and got `PROBE thrown: Error: fetch_failed` escaping the handler — a bare Next.js 500 with no `{error: code}` envelope, on the only path this phone can produce a coordinate, against a test that asserts the geocoder's miss and its failures are "deliberately indistinguishable". The web caller it claims to mirror, `components/LocationFields.tsx:257`, does wrap. Also worth carrying: the aggregate-ceiling pin goes **red**, not green, when that bucket entry lands — the lane's handover says green twice, and it is wrong in a way that is easy to miss because the *other* two assertions really do go green. **The numbers the lane quotes are all stale now, so here are the merged-tree ones, re-derived by the integrator rather than incremented**: today `Object.keys(API_V1_IP_BUCKET_FAMILIES).length` is **33**, `listV1RouteFiles().length` is **28**, and the computed ceiling is **12 324/min**. Adding one `authenticated-write` bucket at 120/min makes them **34**, **29** and **12 444** — and all three are written down in three different places (`MIN_IP_BUCKETS`, `MIN_V1_ROUTE_FILES`, the `toBe()` in `api-v1-rate-limit-families`), of which only the third goes red on its own. **Re-derive them anyway; do not add 1 to these.** Last: `uploadWelfareEvidence` has a third call site the lane's docblocks deny — `src/modules/pets/application/claim/submit-claim-dispute.ts:164`, present since before the lane. |

**The E2E row is GONE from this table**, and this sentence is what replaces it —
not a marked row, because a row that says "this landed" is still a row telling
the next reader that work is waiting on a branch. `worktree-wf_60cb7fe0-094-3`
(`2010d7655`) was turned back on 2026-08-30 for running its fence under bare
`bash` while GitHub runs the step under `-e`; the diagnosis was kept, the fix and
its fence were rewritten from scratch by another lane, and both landed the same
day. See "The `supabase start` retry that retried zero times" in the section
above — which also carries the lead for the E2E red that is **still there**, since
none of this was ever that red's cure.

**What the two WU-U attempts had in common WAS the thing attempt 3 fixed, and it
is the one paragraph on this page worth reading before any gate.**
Neither lane's evidence was thin — attempt 2 ran **68** fences and re-measured
every one of attempt 1's four. What both missed is the same seam: the `lint:*`
chain and the vitest suite fence overlapping surfaces, and a lane that runs the
whole of one and none of the other can be exhaustive and still blind. Attempt 2
could not run `pnpm test:verified` (the local Supabase is shared and the brief
forbids it), which is correct and is not an excuse — the two files that turned it
back need no database and would have run in seconds under a targeted
`vitest run <file>`. **Before declaring a gate, list the vitest files whose
subject your diff touches and run those**, not only the fences whose names you
recognise.

**Attempt 3 did exactly that and it is now a concrete recipe, not advice.** The
sweeping fences are enumerable — run

```
rg -l 'readdirSync|globSync|discoverTestFiles' __tests__ | rg '\.test\.tsx?$'
```

and you get **46** files, every one of which classifies the tree it finds rather
than the diff you wrote, so any new file can land in one. All 46 were run.
**The trailing filter is load-bearing and was added by the integrator on
2026-08-30**, because the recipe as first written omitted it and printed **47**:
the extra path is `__tests__/db-reachability.ts`, a helper that exports `ROOT`,
`DB_SINK` and `resolveSpecifier` and contains no `describe` or `it` at all, so
vitest never collects it. Off by one against the command it prints is the worst
shape a recipe can have — the next reader cannot tell whether they are missing a
fence or looking at a non-test, which is the same class of doubt this page exists
to remove.

**And 46 is not the number of sweeping fences. It is the number that live in
`__tests__/`, which is a different thing, and the gap cost this row its gate.**
The integration run of WU-U came back `1 failing test(s)` on
`lib/observability/redact-prefix-coverage.test.ts` — a fence that globs
`{app,apps/mobile/app}/**/*.{ts,tsx}`, derives every route segment whose next
segment is a token, and asserts each one is in the redaction list. It reported
`adoptions (from app/api/v1/adoptions/[petToken])`. **The lane could not have
caught it with the recipe above**, because the fence is not under `__tests__/`
and no `__tests__`-scoped command will ever return it. Widen the search to the
whole tree:

```
rg -l 'readdirSync|globSync|discoverTestFiles' --glob '*.test.ts*' --glob '!node_modules' .
```

**53 files: the 46 above plus 7 that live beside the code they police** —
`lib/observability/redact-prefix-coverage`, `lib/analytics/jurisdiction-targets`,
`lib/metrics/province-disclosure`, `lib/projections/pet-compliance`,
`apps/mobile/src/release/release-config`, and two under
`src/modules/rehome/__tests__/`. A fence's directory says nothing about how much
of the tree it reads.
Two were the known blockers; a third, `api-v1-rate-limit-families`, turned out to
be a **broken file** rather than a failing test (a conflict marker survived the
cherry-pick and the file did not parse) — invisible to all 67 `lint:*` scripts,
and the kind of red `/CLAUDE.md` forbids committing. Three of the 46 mattered and
none of the three was predictable from the diff's filenames, which is the whole
argument for running the set instead of guessing at it.

Two findings from the E2E branch were real regardless of whether that branch ever
landed, and both are **PO-gated**, so they were recorded here rather than carried
into code by an integrator: `e2e-nightly.yml` declares `STAGING_SUPABASE_URL` /
`STAGING_SUPABASE_ANON_KEY` and the job log shows both **empty**, which is why the
cross-tenant isolation spec dies naming the anon key; and the registry throttling
in those runs is **ECR Public**, not Docker Hub, so a `docker/login-action` with
Hub credentials would buy nothing. They were not written into the numbered PO list
at the time, because the branch that measured them was turned back and a rejected
lane's evidence should be re-measured before it becomes a standing instruction.

**Both were re-measured on 2026-08-30 from a different lane and both held**, so
they are now items **6 and 7** of the numbered PO list below, with the evidence
that promoted them. The second one came back stronger than the original claim:
the staging secrets are not merely empty at runtime, they **do not exist**.

## Declared debts, with an owner

| Debt | Weight | What it is |
|---|---|---|
| The `KNOWN_GAP` register the Ley 25.326 fence revealed | open | Owner notes on appointments, reminder titles, foster proposal notes, org invitation emails **in plaintext**. Named, printed on every run, ratcheted in both directions. **This row carried "21 tables" until 2026-08-29 and had been wrong since migration 0207** — the fourth copy of a number that has now rotted three times. It states none: `pnpm lint:subject-rights` prints the live count, and AGENTS.md §7 is the one document that writes it down. |
| A tester crash is unreadable | no instrument | R8 does **not** run in this app (verified in the Expo template), so Play's warning names nothing. But a tester's crash will be JavaScript: measured on the shipped `.hbc`, three of six local functions keep their names and three don't, no source map ships, and there is no crash reporter. |
| Two band tints outside the contract | small | **Pregnancy** and **memorial** use colours absent from `@dim/contract/tokens`, so the shared contract does not carry the web's full palette. They fall back to the default tint and the chip still says what is happening — no information lost, but it is debt in the shared layer. |
| Two files parked in the art.16 fence | small | `caretaker-public-contact.ts` and `app/page.tsx`, each with a rationale recorded in the fence. |
| Checksum drift on migration `0188` | pre-existing | Someone edited that migration **after** applying it. The database is fine; the record of what was applied is not. |
| The turnos endpoint's four rate-limit gates say nothing about **who** spends them | owner: the next lane in `me/appointments` (row 2) | Landed as an accepted reserve on 2026-08-30. The route passes the right identifier — `callerIp(request.headers)` on the two IP gates, `live.user.id` on the two user gates — but `__tests__/api-v1-me-appointments-route.test.ts` stubs `enforceRateLimit: async (endpoint: string)` and drops the second argument, so collapsing all four onto shared constants leaves the file 36/36 green. **Ten sibling route tests already take `(endpoint, identifier)` and assert the pair**; `api-v1-me-profile-route.test.ts` even pins the literal IP. One-line fix, in the file the next lane is already opening. Not a blocker: the production identifiers are correct and no authorization boundary is involved. |
| **The liveness gate on `GET /api/v1/adoptions/{petToken}` is fenced by nothing** | owner: the next lane in `src/modules/adoption` or that route | Accepted as a reserve at the 2026-08-30 gate, on the same terms as the two turnos rows below: the code is right today and no fence proves it. **Measured by mutation, not inferred.** `if (!live.ok && false) return liveUserRefusal(live.reason);` in the GET handler leaves **86 files / 1514 tests green** — the 46 sweeping fences, the whole adoption territory, `packages/contract` and all three route tests. The control that rules out a broken harness: the identical mutation in the **POST** handler of the same file turns two red, because `__tests__/api-v1-adoptions-route.test.ts:590-599` covers `DEACTIVATED` and `ACCOUNT_ERASED` on POST only — both `it`s sit inside `describe("POST … postularse")`, and the two GET describes have no equivalent. The sibling route `api-v1-me-adoption-applications-route.test.ts` does cover its own (lines 227/235), so this is an asymmetric hole in a **new** door, not a repo-wide convention. **Why it is worth a row rather than a shrug**: `createClientFromBearer` parses only the *shape* of the header — its own docblock says it decodes the token and "never reads a claim" — so `requireLiveUser` is the single barrier for `NO_SESSION` / `ACCOUNT_ERASED` / `DEACTIVATED` / `SHIFT_EXPIRED`, and an erased account keeps a syntactically valid JWT because erasure is state in the database, not revocation. A regression here opens adoption-detail reads to an ERASED account: the art. 16 class this repo has already been burned by four times over. Verified correct as merged — gate at line 110, read at 117. The fix is two `it`s copied from lines 590-599 into a GET describe. |
| The same endpoint's documented **fail-open** has no test | owner: same | `spendBudget` catches a non-`RateLimitError` and returns `true` on purpose — a limiter outage must not stand between an owner and cancelling a turno. Flipping that `return true` to `return false` leaves the file 36/36 green, so the invariant its docblock argues at length is unmeasured. Five sibling files carry a test literally named "FAILS OPEN when the limiter itself is broken"; this one does not. |
| **`submitFreeClaimForUser` can claim an ERASED pet, and tells you it was erased** | **pre-existing, and the biggest thing on this table** — owner: the next lane in `pets/application/claim`, or the PO if it wants a migration-grade answer | Found by the reviewer at the 2026-08-30 gate and MEASURED against real Postgres, not inferred. `lookup-for-claim.ts` resolves through `innerJoin(pets, and(eq(pets.id, …), isNull(pets.deletedAt)))`; `submit-free-claim.ts` resolves the same identifier and then selects the pet with a bare `eq(pets.id, ident.petId)`, because `pet_identifications` rows stay `status = 'active'` after an erasure. Two consequences: (1) an erased pet's chip answers `not_claimable` → **409** while an unregistered chip answers `not_found` → **404**, so any self-registered account can tell "this animal was erased" from "never existed" off the status line — the exact art. 16 distinction the endpoint's own header refuses to put there; (2) if that erased pet has no active custody, **the claim succeeds** — it returns the animal's name and public token, inserts the ownership, appends `ownership_claimed` to the spine, notifies and audits, while the lookup on the same door still answers `not_found`. **The bearer door did not introduce this** — it is one missing clause in a writer the web's `/mis-mascotas/reclamar` wizard drives identically, which is why the integrator recorded it instead of patching it in a merge commit: the fix changes browser behaviour and belongs with its own test. **No fence goes red for it and none can as written**: this is an ABSENCE of a predicate, not a mutable one, so the mutation instruments this repo relies on have nothing to flip. The shape of the fix is `isNull(pets.deletedAt)` on the in-transaction select (and/or filtering the identification by a live pet), copied from the sibling rather than re-derived. The two docblocks that claimed the invariant held end to end were corrected in the same merge — `claim/types.ts` and `me/pet-claims/commands.ts` — because a promise and the note that it is half kept have to travel together. |
| `api-v1-me-pet-claims-route.test.ts` needs an env var no setup forces | small — owner: the next lane in that file | It is the ONLY one of the fifteen `/api/v1` route tests that does not mock `@/lib/supabase/bearer`, so it builds a real supabase-js client and reads `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `__tests__/setup-env.ts` forces `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` and not that one. In a worktree with no `.env.local` the file reports 20 of 21 red with `Error: supabaseKey is required.` — credential-shaped, which is the FOURTH red signature `/CLAUDE.md` names, on a file that has nothing to do with RLS. Green in CI (the vitest job exports the real key) and green wherever the env is exported, so it hides no defect; it is a harness that is more coupled to the environment than its fourteen siblings, in the one direction that makes a red unreadable. Fix is the two `vi.mock` lines `api-v1-me-appointments-route.test.ts` already has. |
| `claimDisputeUrl` builds its URL by hand while its neighbour uses the map | small — owner: same | `apps/mobile/src/claims/claim-view-model.ts`: `claimSightingUrl`, two functions above it, goes through `deepLinkUrl` with the written argument that "a rename is a compile error rather than a 404 nobody notices" — and `claimDisputeUrl` interpolates `${origin}/mis-mascotas/reclamar` directly. If the web renames that path the dispute link becomes a silent 404 and nothing turns red. `DEEP_LINK_MAP` has no entry for the wizard, but `myPets` is an exact precedent for a parameterless one. The file's own principle, applied to one of its two functions. |

## PO-gated — not agent work, do not attempt

Listed so you recognise them and hand them over instead of trying.

1. Upload **build 6** to Play. Build 5 is published and **cannot sign in** — it shipped without `EXPO_PUBLIC_SUPABASE_*`, which are baked at build time.
2. Revise the **Data Safety** form before any build with uploads reaches Play. It declared on 27/08 that the app does not collect photos; that stops being true the moment uploads ship, and a form that no longer matches the binary is a policy violation by itself.
3. Apply migrations **0205, 0206, 0207** to staging and production. Written and green locally. **Applying to a remote DB is Ignacio's call, never yours.**
4. Resend email setup (domain verification → API key → SMTP in Supabase → env in Vercel). Until it lands, the 6-digit password-recovery code does not travel and the screen promises what the mail does not deliver.
5. The two store graphics, pointing `mimar.com.ar` at Vercel, the tester acceptance link, the Supabase "exceeding limits" warning, and the 12 tester emails.
6. Create the two **staging secrets the nightly e2e job reads**, `STAGING_SUPABASE_URL` and `STAGING_SUPABASE_ANON_KEY`. Re-measured 2026-08-30 and PROMOTED from the turned-back block above, with a root cause stronger than the original report: they are not empty by accident, **they were never created**. `gh secret list` on the repo returns exactly one row, `STAGING_DATABASE_URL`; `e2e-nightly.yml` declares no `environment:`, so no environment-scoped secret can supply them either, and `${{ secrets.X }}` on an undefined secret is the empty string with no warning. The consequence is visible in every run: the job log prints `NEXT_PUBLIC_SUPABASE_ANON_KEY:` with nothing after it, and `e2e/cross-tenant-isolation.spec.ts:265` throws `NEXT_PUBLIC_SUPABASE_ANON_KEY not set — the cross-tenant isolation suite cannot probe anything`. Present identically in run 33252469499 (2026-08-29) and run 32108115808 (2026-08-18); all **12** of the 12 most recent nightly runs are red. **Creating a secret is the PO's**, never an agent's — the values are the staging project's URL and anon key.
7. Decide whether to authenticate **ECR Public** pulls in CI, or accept the throttling. Re-measured 2026-08-30 and PROMOTED from the turned-back block above. Every Supabase image resolves to `public.ecr.aws/supabase/*`, and in runs 33273180809 / 33269256483 / 33260290131 every `toomanyrequests: Rate exceeded` line is immediately followed by the CLI's own `Retrying after Ns: public.ecr.aws/supabase/<image>` — so the throttle is named, not inferred. The only `docker.io` reference in any of those runs is `library/postgres:16`, a service container that is not part of this stack. **A `docker/login-action` with Docker Hub credentials would change nothing**; write that down before someone spends a day on it. ECR Public throttles anonymous pulls by source IP and raising the ceiling needs an AWS account to authenticate against, which is a spend decision. Not urgent on its own: the CLI already retries a throttled pull and recovers.

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

## Appended 2026-08-30 by lane 3d7-1, completed by lane 9fe-1

### WU-U — adopción from the phone — LANDED 2026-08-30, third attempt

**Row 3 is off the table.** Catálogo, ficha, postular and mis postulaciones all
work from the phone: `GET /api/v1/adoptions`, `GET|POST /api/v1/adoptions/
{petToken}`, `GET /api/v1/me/adoption-applications`, and the four screens under
`apps/mobile/src/adoption/` behind `/adoptar`, linked from the footer of
`/mascotas` and titled in `app/_layout.tsx`.

**Three attempts, and the third one added almost no feature code.** Attempt 2's
work was whole and correct; it was rejected on two vitest fences it never ran,
both of which need no database and run in seconds. This attempt cherry-picked its
twelve commits onto `235d22c8c`, resolved eight conflicts by hand — the two
collision magnets `lib/infra/api-v1-limits.ts` and `apps/mobile/app/_layout.tsx`
among them, both purely additive against the reclamar door that landed in
between — and then closed the two fences. **What the third attempt is really a
record of is the seam the first two fell through**, and it is written up under
"The two census fences" below rather than as a footnote, because both attempts
had thorough evidence and neither had THIS evidence.

#### The four red fences, and what each one really was

The rejection's headline was that the lane declared ONE and there were FOUR. The
count matters less than what the four had in common: none of them had been RUN.

1. **`lint:file-size`** — `adoption-repository.ts` at 1521 against a hard 1500.
   Fixed by splitting, never by baselining: that tope is a ratchet. The split is
   at the boundary that means something rather than the one a line count would
   suggest — the five queries a CITIZEN reaches (`findPetForApplication`,
   `findPetForPublicDetail`, `findLatestAdoptionFinalizedAt`,
   `findApplicantProfile`, `findExistingApplication`) move to
   `adoption-public-reads.ts`; everything left in that file is reached through an
   ORG capability. The object is spread back into `AdoptionRepository`, so no call
   site moved — and there is a test that the spread's methods are IDENTICAL to the
   module's, because a key declared after a spread silently wins.
2. **`lint:notifications`** — a raw `db.insert(notifications)` in new code. The
   first attempt achieved "one implementation for both doors" by making the RAW
   one the shared one, which is the opposite of what that fence is migrating
   toward. `actions.ts` is back byte-for-byte at its baselined state and the
   BEARER door goes through `createNotificationsBulk`, which is the shape the
   editar door landed in at `ecc835aa4`.
3. **`lint:audit-log`** — seven operator actions, and the mechanism is worth
   knowing because nothing about it is obvious and this page's own note is one
   word off. The alias `const flushNotifications = flushAdoptionNotifications;`
   resolves **exactly as designed** (`importedIdentifiers` follows
   `const alias = imported` — measured, not assumed); what broke is WHAT it
   resolves into. That fence walks ONE hop out of an exported action into the
   modules it calls; while the raw insert sat inside `actions.ts` as a private
   function it was invisible to the walk, because `findCandidates` scans the
   exported action's BODY and a module-level helper is not in it. Extracting it
   put a mutation one resolvable hop from all seven actions for the first time,
   and none of them writes an audit row. **Fixing (2) fixes this**: with the raw
   insert gone from that module nothing reachable mutates, and the seven leave the
   candidate set exactly as they were at the base.
4. **`__tests__/api-v1-rate-limit-families.test.ts`, 2-red** — the one the lane
   did declare, and the one whose real cost it understated. Three `api_v1_*`
   buckets were spent by the routes and never added to
   `API_V1_IP_BUCKET_FAMILIES`, so the CGNAT aggregate — a `reduce` over that
   map — under-declared what a single address may spend by **1.260/min** while
   still reading like a computed figure. Same defect as the turnos rejection, one
   window later.

#### What it decided

- **`API_V1_ADOPTION_APPLICATION_IP_LIMIT` moved to `lib/infra/api-v1-limits.ts`
  with a family of its own, `adoption-application`.** Leaving it beside its
  use-case resolved it to `route-local`, and that family is kept **EMPTY** on
  purpose — it is where a bucket lands when nobody derived it, and the fence
  exists so a second `pre-cgnat` pile cannot form. The per-USER anchor stays
  beside the use-case, because the web form spends the same counter; the 12×
  relationship is asserted ACROSS the module boundary so a per-user raise cannot
  carry a silent twelvefold per-IP raise with it.
- **Both floors were RECOUNTED from the tree, not incremented** — and then
  recounted AGAIN on the third attempt's base, which is the part worth reading.
  On `3a1a7f1c1` this lane measured `Object.keys(API_V1_IP_BUCKET_FAMILIES).length`
  → 32, `listV1RouteFiles().length` → 27, aggregate → 12 204. **All three are
  stale and none of them is what shipped.** The reclamar door (WU-V) landed in
  between and brought one more bucket and one more route, so on `235d22c8c` the
  same three measurements are **33** (pin 33), **28** (pin 28) and **12 324**
  (pin 12 324), each equal rather than merely satisfied and each read off the
  merged tree with the live `reduce` agreeing.
  **This row is now the page's best example of its own rule.** It states three
  numbers that were correct when measured, were never wrong, and were all
  obsolete within one window — which is exactly why the instruction is "recount
  from the tree", never "carry the literal across the rebase". The lane's 12 204
  is also, word for word, the "third lane declared 32 buckets and 12 204 and was
  turned back" that the WU-V block warns about: same figures, different tree.
- **One read bucket for TWO routes** (`adoptions` and `adoptions/{petToken}`),
  which no other pair on the surface does. Opening a ficha is what a person does
  FROM the catalogue, dozens of times in one session; two budgets for one
  behaviour would say the list and the detail are bounded independently, and they
  are not.
- **The four adoption routes are registered in `apps/mobile/app/_layout.tsx`.**
  The header says "Mascota en adopción" and not the animal's name — the header
  draws before the fetch resolves, and one that fills in afterwards reads as the
  screen changing under the reader — and "Mis postulaciones" rather than
  "Postulaciones", because on the web that word is the REFUGIO's review queue and
  this app has no org surfaces at all.

#### Four claims from the first hand-off that were FALSE, and are now measured

Recorded as claims rather than as bugs, because the pattern is the lesson: every
one was a sentence about a guard that no test executed.

- **"The soft-delete surface is closed on the way in, WITH A TEST"** — the first
  half was true and the second was not. `public-soft-delete-resolution.test.ts` is
  a source-text sweep over `app/` and never looks at
  `src/modules/adoption/infrastructure/` at all. Now fenced on the COMPILED
  predicate (`PgDialect().sqlToQuery()`): nine mutations applied to
  `adoption-public-reads.ts`, nine red — including the reviewer's own, and the one
  a `toContain` can never catch, `or(unerasedPetByToken(t), sql\`true\`)`.
- **The ficha's privacy branch** — `readAdoptionDetail` had no test of any kind,
  and the branch that needed one states a privacy rule in its own docblock: a
  custody dispute and a rabies observation must keep answering 404, because the
  "paused" screen NAMES THE SHELTER and would tell a stranger holding a token
  which animal that organisation is fighting over. Eight mutations, eight red.
- **The authorization predicates inside `readMyAdoptionApplications`'s raw SQL**
  were mutable to tautology with everything green — the same defect that turned
  turnos back. Anchored now on the compiled SQL by EQUALITY (never `toContain`)
  plus the exact bound params `[userId, userId, 100]`. The params assertion alone
  kills three of eight mutations; the equality kills the two `OR TRUE` ones that
  leave params untouched.
- **"The flow fails CLOSED, deliberately inverting the erasure's fail-open"** —
  unmeasured, because `submit-adoption-application.test.ts` injects a fake budget
  on every call and the real `spendApplicantBudget` was executed by nothing.
  `return "ok"` in its catch left the whole module green. Both directions are now
  asserted AGAINST EACH OTHER, because the argument only works as a pair: the
  per-IP gate is allowed to fail OPEN precisely because the per-applicant one
  still refuses.

#### One code that was documented and unreachable, and the hole under it

`adoption_application_failed` was declared in `@dim/contract/api`, given a
paragraph there, given es-AR copy in `apps/mobile/src/api/error-copy.ts`, and
produced by nothing. That was not a dead code — it was a hole:
`submitAdoptionApplication` returns `{ ok: false }` only for its DOMAIN refusals,
so a transaction that throws propagated out of the handler and Next answered with
something that is **not the one-key `{ error }` envelope** every `/api/v1` failure
is required to be. The route now catches, reports, and answers 500 with the code
the contract already described.

#### What it did NOT solve

- **The cookie door still does the raw insert.** `actions.ts`'s private
  `flushNotifications` is untouched and still baselined. Migrating it means
  minting a dedupe key for the five other use-cases that build notifications, and
  `finalize-adoption`'s three carry no `relatedEventId` — so a content-derived key
  there would risk SILENTLY collapsing two legitimately distinct rows. That is a
  change to a writer the web shares and it wants its own window. The bearer door's
  key is `adoption:{type}:{eventId}:{userId}`, and its fallback branch is
  unreachable on that door — pinned at the PRODUCER
  (`submit-adoption-application.test.ts`) rather than asserted in a comment.
- **`src/modules/adoption/` writes no audit rows at all, and the fence cannot see
  it.** The actions pass `repo: AdoptionRepository` as a VALUE rather than calling
  `AdoptionRepository.something()`, so `reachableSources`' one-hop walk never opens
  the repository. Seven operator actions — eligibility, listing status, listing
  content, approve, reject, finalize, reverse — mutate custody and the spine with
  no `writeAuditLog` anywhere reachable, and `lint:audit-log` is green over all of
  them. **Reported, not fixed:** it is pre-existing, it is the whole module's
  shape, and inventing an audit trail for seven operator acts is not a
  fence-fixing edit.
- **`NewNotification.severity` declared `"error"`, which the `notification_severity`
  pgEnum does not have.** Postgres would have rejected such a row and the raw
  insert's `catch` would have eaten it. Nobody produces one, so the union was
  narrowed to the four real values — which is also what let the fan-out reach the
  service without a cast. Named here because it is a latent CLASS and not just a
  typo: the raw path's `catch` makes every schema mismatch silent.
- **`app/(public)/adoptar/[petToken]/page.tsx` still has its own query.** The
  bearer door reads through `adoption-detail-read.ts`; the page does not.
  **The list of what the two SHARE was wrong in this block's first draft and is
  corrected here, because getting it wrong is what turned attempt 2 back.** It
  named `isListable` and `findPetForPublicDetail` among the shared parts. Grepped
  on the merged tree, the page imports exactly ONE thing from the module —
  `livesWithFamilyUnder` — builds its own `isListable` as a local const (its
  comment says it "mirrors every isListable suppression guard"), and runs its own
  inline pet lookup spelling the ANONYMOUS `publicPetByToken` with
  `isPublicTokenReadThrottled`. It never calls `findPetForPublicDetail`.
  That distinction is not pedantry: believing the public page reads through this
  module is precisely what made a reviewer classify
  `adoption-public-reads.ts` as an anonymous surface spelling the authenticated
  alias, which is blocker (1) of the two that turned this row back. Carving the
  page out remains a change to a live public surface with its own e2e gate.
- **`/adopciones`, the org review queue, has no native surface**, and none was
  attempted: this app has no organisation screens at all.

#### The hand-off numbers the first attempt got wrong

Written down because both were checkable and neither was checked. The previous
summary said the hand-off was **five steps** and it was six (the sixth being the
board edit itself), and claimed "biome clean over the 134 files touched" when the
diff touched **40**. Attempt 2's diff against `3a1a7f1c1` was **48 files**; the
landed lane's diff against `235d22c8c` is **51 files** over **16 commits**
(`git diff --name-only 235d22c8c..HEAD | wc -l`). Fence results are reported
per-fence by name rather than counted.

#### The two census fences — the actual reason this took three attempts

Both blockers were **census** fences: instruments that demand every reader of a
certain class be declared, and that fail on a file they have never been told
about. Neither is satisfied by making the assertion pass, and both offer a pin
that would do exactly that. **Adding a line to a census to quiet it is the move
this repo hunts**, so both are recorded by what was DECIDED, not by what turned
green.

1. **`__tests__/public-token-throttle-coverage.test.ts`** — "every file spelling
   `unerasedPetByToken(` is a reviewed authenticated resolver, in both
   directions". `adoption-public-reads.ts` spells it and was not in
   `ALIAS_RESOLVERS`. The two names are ONE predicate; the spelling is a claim
   about the caller — `publicPetByToken` means "anonymous, takes the per-IP read
   limiter", the alias means "behind an auth gate, takes none".

   The rejection assumed the file was anonymous, and it assumed it **from the
   file's own header**, which said two of its five methods "answer a request
   carrying no session at all on the web's public `/adoptar/{token}`". That
   sentence was FALSE. Traced on the merged tree: `findPetForApplication` is
   reached only through `submitAdoptionApplication`, whose step 1 is
   `if (!applicant) return …` before the lookup at step 3 — the web action does
   admit an anonymous caller and is refused exactly there; `findPetForPublicDetail`
   and `findLatestAdoptionFinalizedAt` are reached only through
   `readAdoptionDetail`, called only by `GET /api/v1/adoptions/{petToken}`, which
   runs `requireLiveUser` first. The public web ficha never calls this module at
   all — it carries its own inline query spelling `publicPetByToken` with
   `isPublicTokenReadThrottled`.

   So the file IS a reviewed authenticated resolver, it is censused as one, and
   **the header was corrected in the same commit**, because a pin entry and the
   file's own account of itself must not be able to disagree — that disagreement
   was the whole cost here. The review is written into the pin beside the path
   rather than left implicit.

2. **`__tests__/content-report-read-coverage.test.ts`** — "NO read of a lost-feed
   note is outside the list". `my-applications-read.ts` came back `unaccounted`.
   It is the SAME query as `app/(app)/mis-mascotas/postulaciones/page.tsx`, which
   is already triaged `NOT_A_LOST_NOTE_READ` for the same reason; lifting the SQL
   into a module moved it across the sweep's `src/` boundary. That is the fence
   working: an extraction is exactly when a classification gets re-declared
   instead of inherited.

   Re-declared and verified: the `note_added` join lives in the `info_requests`
   CTE, filters `kind = 'adoption_info_requested'`, and selects
   `MAX(n.recorded_at)` and nothing else — no payload text, and `RawRow` has no
   field that could hold a sentence.

   **The triage did not stop at a list entry**, because the census is file paths
   and prose and cannot see a predicate: widen that join tomorrow and the triage
   becomes a false statement while the sweep stays green, since the path is still
   in the list. Both halves are now pinned against the COMPILED SQL in
   `my-applications-read-sql.test.ts`, and both mutations were applied — deleting
   the kind filter, and adding `n.payload->>'text'` to the CTE. Each is red there
   and, for the first one, **`content-report-read-coverage` stays 8/8 green**,
   which is the measurement that justifies the test existing.

#### What this lane found on its own, beyond the two blockers

- **A conflict marker survived the cherry-pick inside
  `__tests__/api-v1-rate-limit-families.test.ts`** — the resolution consumed the
  `=======` and its upper half but not the closing `>>>>>>>`. It does not read as
  a failing test: the file does not PARSE, oxc stops with `Encountered diff
  marker`, and vitest reports a **broken file** — the signature `/CLAUDE.md`
  forbids committing. The whole `lint:*` chain is blind to it. It surfaced only
  from running the tree-sweeping vitest fences, which is the same lesson as the
  two blockers arriving through a third door.
- **Two of this lane's own route tests took a hard dependency on a Supabase
  credential that their nearest sibling does not.**
  `api-v1-adoptions-route.test.ts` and
  `api-v1-me-adoption-applications-route.test.ts` mocked `@/lib/supabase/server`
  but not `@/lib/supabase/bearer`, so `createClientFromBearer` built a real
  supabase-js client and read `NEXT_PUBLIC_SUPABASE_ANON_KEY` —
  which `__tests__/setup-env.ts` does not force. Measured with the key unset:
  **37 failures** across the two, every one `Error: supabaseKey is required.`,
  against **36/36 green** for `api-v1-me-appointments-route.test.ts`, which
  already carries the mock. That is the FOURTH red signature on files with no RLS
  anywhere near them. Fixed with the two `vi.mock` lines the sibling has; both
  files now run 39/39 with the credential and 39/39 without it.

#### What it returned rather than solved

- **`api-v1-me-pet-claims-route.test.ts` still has that same coupling.** It is
  already a declared debt on this page with an owner, it belongs to another
  lane's territory, and the fix is the identical two lines. Reported, untouched.
- **`__tests__/auth-callback-redirect.test.ts:107` carries a dead
  `suppressions/unused`.** Pre-existing at this base and in another territory.
  Reported. (The two dead suppressions this lane's OWN tests carried were
  removed — biome over the adoption territory is 142 files, zero warnings.)
- **`lint:route-weight` and `lint:csp-prerender` were run and measured NOTHING.**
  Both self-skip without a build and exit **0** while saying so in words — "NO SE
  MIDIÓ NADA" and "This run proved nothing about the CSP". They are declared
  here as not-measured rather than counted green, because an exit code that says
  "pass" over an unmeasured surface is the same false-green channel this page
  keeps paying for.
- **`pnpm verify` and `pnpm test:verified` were NOT run** — the local Supabase is
  shared with a parallel lane and the brief forbids it. Everything above is
  targeted: the whole `lint:*` chain, all 46 vitest fences that sweep the tree,
  and the adoption/contract/mobile suites. **That is precisely the gap that sank
  attempt 2**, so it is named rather than implied: the full suite is the
  integrator's gate, and the two files that turned attempt 2 back needed no
  database and are green here.

#### What the integrator did with it, 2026-08-30

**Merged, and it was the only thing merged in its window.** The sibling lane
(WU-T, denuncias) was stopped on five content conflicts against this branch and
is written up in "Attempted and turned back" above.

**The three pins were re-derived from the merged tree, not taken on trust**, and
all three matched what the lane reported: `Object.keys(API_V1_IP_BUCKET_FAMILIES)`
**33** against a `MIN_IP_BUCKETS` floor of 33, `listV1RouteFiles().length` **28**
against a `MIN_V1_ROUTE_FILES` floor of 28, and the CGNAT aggregate **12 324/min**
against the `toBe(12_324)` assertion. The aggregate was also summed **by hand
per family** rather than read off the `reduce` that the test compares against,
because a computed value agreeing with itself is not evidence: 2×60 +
1×60 + 16×600 + 7×120 + 1×240 + 1×144 + 2×180 + 1×240 + 1×120 + 1×600 = 12 324,
over 33 buckets in 10 families. Both floors are **tight**, not slack — a floor
sitting one below its subject is the failure mode this page has already recorded
twice, and neither is in it.

**No bucket was added by the integrator**, so no ceiling moved. WU-T's
`api_v1_welfare_reports_ip` entry was NOT applied: the map may not declare a
family for a bucket no route spends, and the route did not land.

**The first full-suite run came back RED, and the fix is the only line of
product code the integrator wrote.** `reported 1467 file(s); 1467 discovered;
1 failing test(s); 0 broken file(s)` — one real failing assertion, no
`Worker exited unexpectedly`, so **none of the three crash signatures in
`/CLAUDE.md`** and no grounds for a re-run. The victim was
`lib/observability/redact-prefix-coverage.test.ts`, reporting
`adoptions (from app/api/v1/adoptions/[petToken])`: a route this merge created,
whose URL carries a bearer token, on a path segment the redaction list did not
name. Attribution is not a judgement call — the fence's output is a pure
function of the directory layout, and `app/api/v1/adoptions/` does not exist at
`235d22c8c`.

The fix is one entry, `"adoptions"`, in `CAPABILITY_PATH_SEGMENTS`, and it has
an exact precedent two lines below it: `pets` is listed for
`/api/v1/pets/[publicToken]` even though `mascotas` already covers the screens
carrying the same token. **That pair is the pattern, and the docblock now says
so** — a capability ships as a Spanish screen segment, gets its entry, and the
`/api/v1/<english-plural>/` twin arrives later as a second URL for the same
token. `adoptar`/`adoptions` is the second instance. Reverting eighteen reviewed
commits over a derived list that told you exactly what it was missing would have
been the wrong trade; so would committing red.

**One reservation from the fresh-context review was accepted rather than fixed**
— the unfenced liveness gate on the detail GET, now a row in "Declared debts" with
its mutation evidence. An integrator merge is not the place to author a missing
test, and the row names the two `it`s and the file to copy them from.

The gate's verdict lines are not transcribed here on purpose: they belong to the
window's handover, and quoting them would mean a doc commit landing *after* the
tree the gate ran on. This block describes the tree that was gated.
