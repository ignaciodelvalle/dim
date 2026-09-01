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
| 4 | **WU-V** — the **camera scan** only. Confirmar el chip and reclamar landed 2026-08-30 — see the block below before starting. | M | The scan is the LAST of the three and the one the block did not attempt: reading a chip's barcode needs `expo-camera` → a native module → an EAS build, the same pipeline row 1 is held back by. It is strictly additive over what landed — it sets the same string the keyboard field sets. **Row left in place on purpose: one of three closed is not a row that comes off the table.** |
| 6 | **WU-P** — rehoming, foster, return, relocation, org memberships | L | Advanced custody cycle. |
| 7 | **The CSP has no dev branch, so `pnpm dev` serves a web app whose client never boots** | S | `middleware.ts` sets `script-src 'self' 'nonce-…' 'strict-dynamic'` with no `unsafe-eval` — correct in production, fatal under `next dev`, which needs `eval()` for React Refresh. Measured A/B on one commit: dev has the flight payload and **no `__reactFiber` on any node**; `build && start` hydrates. Every path this repo has for looking at the web skips dev (`NEXT_BUILT` for Playwright, the production server in `qa-up.ps1`, staging for the clickthroughs), so nothing sees it — and Server Actions make the login work without JS, which disguises it as "my machine is broken". **Do not loosen production.** A dev-only branch plus a fence asserting that branch exists. Evidence and the console one-liner: `walkthrough-findings-2026-08-31.md` §1. |
| 8 | **Every denuncia filed from the phone reaches the state marked "jurisdicción sin verificar"** | M | Touches the contract. `resolve_location` already hands the phone candidates carrying province and locality; the person picks one; `file` sends only lat/lng/address and **drops the pair**, so the D.11 gate re-derives from text and — correctly, by its own definition — marks the row unverified. Measured: `sin_verificar = 1 / total = 2790`, and that one row is also the only one of the 2,790 with a non-null `locality_id`. One row today, 100% of the mobile channel later, at which point the badge stops separating a careful address from a vague one. Fix: optional province/locality on the `file` input, passed through when present. §2 of the same page. |
| 9 | **Eight native screens render their own path as the header, and the class has no fence** | S | "Mis turnos" draws `turnos/index`. `_layout.tsx` records that WU-S left both `turnos` routes open on purpose under the integrator's rule — *the title is transcribed, not invented*, registered only once two surfaces have decided the string. **For `turnos/index` that condition is now met and was verified on screen**: the screen's own `<Title>` and the `/mascotas` footer button that reaches it both read "Mis turnos". The other seven need the same check one at a time. The recount command and the full list are in §3; a vitest file wrapping those three lines closes the class for good. |
| 10 | **"Confirmar y firmar" does not preselect the procedure it is confirming** | XS | The link carries `confirmEventId` and prefills `occurredAt` from the URL, but both `procedure` radios arrive `checked=false` — measured — even though the card that produced the link already reads "Castración" and the event being confirmed carries `procedure: castration` in its payload. The vet re-picks a value the system knows. §"What the walkthrough also confirmed" of the same page. |

**Rows 2 (WU-S, turnos) and 5 (WU-T, denuncias) are BOTH gone from the table
above, 2026-08-30, and the numbering was NOT closed up.** Buscar and reservar
were the two capabilities row 2 had left and they were one unit of work by that
row's own argument; denunciar maltrato works from the phone and is whole. Both
have blocks at the end of this page. Neither leaves the narrowed remainder rows 3
and 4 taught this page to fear: WU-S closed row 2 entirely, and the one thing
WU-T does not carry — attachments — is **returned rather than deferred**, with
the product question that has to be answered before anybody builds it written
into its block.

**The table holds SEVEN rows — 1, 4, 6, 7, 8, 9 and 10 — and the count, not
the highest number, is the thing to quote.** Two lanes removed a row each in
one window and each wrote "the table holds four"; then the 2026-08-31
walkthrough appended rows 7–10 and the sentence went on saying THREE for a
day, quoted verbatim by an audit that had to recount it to notice. That is the
fifth time a count in this preamble has rotted inside a single window, and the
lesson has stopped being "keep the sentence fresh" — it is: **read the table,
not this paragraph.** The paragraph stays only because deleting it would also
delete the record of how it kept failing.

**The integrator owns the renumbering call and RE-RATIFIED it here, by re-running
the audit rather than inheriting the conclusion.** `rg -io '\brows? [0-9]+\b'`
over this file, run on the merged tree on 2026-08-30, returns **twenty-six**
matches — not the nine the paragraph below still claims. That census was correct
when it was taken and two landings and one merge have happened since, which is
the same rot this preamble's counts keep dying of; **the number is a measurement
of a moment, not a maintained fact, so re-run the command instead of quoting
this figure.**

**The twenty-six is now stale too, and the 2026-08-30 integrator of the next
window RE-RATIFIED the call without replacing it with a fresh figure.** Two lane
blocks and an integrator block have landed since, and the reason no new number
goes here is sharper than "it rots": **the census counts matches in this file,
and any paragraph that reports the census is in this file, so writing the figure
down changes the figure.** It moved twice while that block was being drafted.
Run the command. The argument for the gaps is stated by LOCATION, not by count,
in the integrator block at the end of this page.

Every one of the twenty-six was read. Nothing survives that points a LIVE
instruction at a row that moved. The pointers at rows 2 and 5 are all either in
the `Attempted and turned back` prose this page forbids editing, or in dated
write-ups where "row 2" is a true statement about the table as it stood on a
named day — with three exceptions, which were the audit's actual yield and were
repaired in the same edit: the sentence below that still said "five rows — 1, 2,
4, 5, 6", the italic correction under it that had already been overtaken, and one
in the WU-S landed block that said "Row 2 above asked to be resized M, not L"
about a row no longer above. The four that say "row 3" and mean adopción are
untouched, and closing the gap would still repoint them at WU-V. **Gaps at 2, 3
and 5.**

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
this file. **The inventory that stood here — "nine pointers … three say row 1 …
three say row 2 … four say row 3" — was the census AS OF THE WU-U MERGE and is
kept in that tense rather than updated**, because the argument it carries does
not depend on the count: two of the row-3 pointers are in the `Attempted and
turned back` rows, which this page forbids editing on the ground that "a
rejection edited away stops teaching anybody anything", so closing the gap would
either repoint true sentences at WU-V or force an edit into the one table the
page protects. That is still why the numbering stays open. The live figure is at
the top of this section, where it is dated. **The count, not the highest number,
is the thing to quote.**

*The paragraph above once ended "the table below therefore holds five rows — 1,
2, 4, 5, 6". WU-T landed and row 5 came off, and the lane that removed it
corrected the sentence to "four … 1, 2, 4 and 6" — which was true of its own
worktree and false of `main` before the day was out, because WU-S removed row 2
in the same window. The count is now **three**, and it is stated once, in bold,
sixty lines up. This italic is left standing as the monument: a COUNT WRITTEN
INTO PROSE HAS NOW ROTTED FOUR TIMES ON THIS PAGE, and the fourth time it rotted
while being repaired, by a careful lane that ran the audit first. The
enumeration was never the problem. Stop writing the number in more than one
place.*

Also not done from the phone, each its own slice: correct species, rabies
appointment, physical tag, printable lost poster, health-record export,
assistance dog (Ley 26.858), attaching a photo to an entry, and five entry types
(tattoo, microchip replacement, bite, death, post-adoption check-in — the app
writes 11 of 16). Reminders are read-only rows: no "snooze 7 days", no "record".
Editing the pet now works, but only for three fields — see the landed block for
the fourteen columns it left on the web.

## Landed since this snapshot — do not pick it up again

**A landing written up below did not necessarily take a row off the table**, and
some did not: WU-V (row 4) is still there, narrowed to the capability it did not
close, and the `supabase start` retry was never a table row at all — it replaces
a branch the next section had marked as turned back. **The count of exceptions
that used to open this sentence is gone too**, for the same reason the count of
blocks two paragraphs down went: it read "three of them did not", it was correct
when written, and the very next landing made it wrong — WU-S closed its remainder
and its row came off, so three became two while nothing turned red. A number in
prose has to be edited by every lane that appends a block. Read the blocks. Each block is written up the same way:
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
list, and the write. The WU-S row — row 2, while it was still on the table above;
it came off on 2026-08-30 when this lane's remainder landed — asked to be resized
**M, not L**; the lane did
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

**WU-T's ROW IS GONE FROM THE TABLE BELOW, 2026-08-30, and this sentence is what
replaces it** — the E2E precedent two paragraphs down from the table, and for the
same reason it gives: a row that says "this landed" is still a row telling the
next reader that work is waiting on a branch. It landed on the second attempt,
rebased onto `6671cff99` with the five conflicts resolved once and deliberately;
the write-up is the last block on this page. **The lesson in the paragraph above
is NOT removed with it and is the reason that paragraph stays**: it is still the
only entry in this section whose blocker was neither a fence nor a runtime, and
the second lane in a window should still measure the conflict surface early. What
changed is that the work is no longer waiting for anybody.

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
| The seed closes welfare reports without recording why | reading hazard | Measured 2026-08-31 after closing one by hand from `/gob`: `closed = 1841`, `with a written resolution = 1`, and the one is the one closed by hand. **Every closed report the seed produces carries `resolution_notes` NULL.** Any screen, export or metric that reads a closure reason has therefore never had data to render, and would look correct while being untested — worth knowing before trusting a widget that claims to summarise why cases close. Same row: the seed sets `triaged_at` while leaving `triaged_by_user_id` NULL, so a report can look triaged with nobody attached to the act. Attribution for the closure itself is intact (`assigned_to_user_id` + `audit_log`). |
| `expo start` silently rewrites `apps/mobile/tsconfig.json` | tooling | Measured diff: it deletes all four comment blocks the repo deliberately wrote and **drops `.expo/types/**/*.ts` and `expo-env.d.ts` from `include`**. Those are Expo Router's generated route types, so a gate run after an `expo start` is typechecking a different program than the one the repo declared. No fence can catch it because the file is legitimately in a pathspec a neighbouring commit would use. **Run `git status` after any `expo start` / `expo run:android`, before the gate and before any commit.** |
| Two files parked in the art.16 fence | small | `caretaker-public-contact.ts` and `app/page.tsx`, each with a rationale recorded in the fence. |
| Checksum drift on migration `0188` | pre-existing | Someone edited that migration **after** applying it. The database is fine; the record of what was applied is not. |
| ~~**Sign-in authenticates but the session never persists on Android**~~ | **ROOT-CAUSED AND CLOSED 2026-08-31 — it was never the device** | The previous text of this row was wrong about the subsystem, and the correct diagnosis was sitting in its own companion page the whole time. `walkthrough-findings-2026-08-31.md` (section "Running the local stack") records that pointing `EXPO_PUBLIC_SUPABASE_URL` at the local stack while `EXPO_PUBLIC_API_BASE_URL` keeps its **staging** default makes the app sign in at staging, receive a staging-signed token, and hand it to LOCAL GoTrue — which answers `invalid JWT: unrecognized JWT kid <staging-kid> for algorithm ES256`. **Two documents by the same author on the same day: one saying "not root-caused, the failure is downstream in createSecureStoreAuthStorage()" and the other carrying the full cause with its error text.** The library settles the tie independently, and this is the check to keep: `setSession` calls `_getUser(access_token)` over the network at `GoTrueClient.js:2835` and only reaches `_saveSession` at `:2847`, so on this path **SecureStore never executes**. That is also why `adb logcat` carried no `SecureStore` line — not because the logging was missing, but because the code never ran — and why the Keystore hypothesis could be refuted without the real cause surfacing. **What made it un-diagnosable was our own copy.** `signIn` collapsed both failure shapes onto one sentence blaming the device, and a test PINNED that collapse (`expect(viaThrow).toEqual(viaError)`, under "the user must not be able to tell"). They are opposite conditions: a RETURNED `AuthError` is the server refusing before storage is touched; a REJECTED promise is the storage failure, because auth-js rethrows non-AuthErrors. Now split, with the server branch naming the crossed-environment case outright. Closed by `planesLookCrossed()` in `apps/mobile/src/config/api.ts` with `config/api.test.ts`. **The fence this finding ASKED for would have been wrong**: it requested "a fence asserting that the two `EXPO_PUBLIC_*` origins share a host", and they deliberately do not — staging is `dim-staging.vercel.app` against a `*.supabase.co` project, so host-equality is red on every correct build. The invariant is one level up: same ENVIRONMENT, not same host, and the staging case is pinned so the weaker rule cannot creep back. **Consequence for this board's own priority list:** this was ranked the #1 launch blocker and it is not a blocker at all — a shipped build bakes both origins from one environment and cannot reach the clause. |
| ~~The turnos endpoint's four rate-limit gates say nothing about **who** spends them~~ | **CLOSED 2026-08-30** by the buscar/reservar lane | The row read: "the route passes the right identifier … but the test stubs `enforceRateLimit: async (endpoint: string)` and drops the second argument, so collapsing all four onto shared constants leaves the file 36/36 green". The stub now takes `(endpoint, identifier)`, the gate table carries a fourth column naming which key each gate must use, and two mutations were applied to prove it: keying the read-IP gate on a user id, and keying the write-USER gate on the address. Both red. It was the lane's own file to open, which is what the row predicted. |
| ~~**The liveness gate on `GET /api/v1/adoptions/{petToken}` is fenced by nothing**~~ | **CLOSED 2026-09-01** — exactly the fix the row prescribed | Two `it`s in a GET describe (`__tests__/api-v1-adoptions-route.test.ts`), copied from the POST cases plus the half they imply: `mockDetail` never ran. Mutation re-applied before writing them (`&& false` on the gate: 86 files green) and after (exactly two red). The original text stays below because its measurement is the reason the fence exists. — Accepted as a reserve at the 2026-08-30 gate, on the same terms as the two turnos rows below: the code is right today and no fence proves it. **Measured by mutation, not inferred.** `if (!live.ok && false) return liveUserRefusal(live.reason);` in the GET handler leaves **86 files / 1514 tests green** — the 46 sweeping fences, the whole adoption territory, `packages/contract` and all three route tests. The control that rules out a broken harness: the identical mutation in the **POST** handler of the same file turns two red, because `__tests__/api-v1-adoptions-route.test.ts:590-599` covers `DEACTIVATED` and `ACCOUNT_ERASED` on POST only — both `it`s sit inside `describe("POST … postularse")`, and the two GET describes have no equivalent. The sibling route `api-v1-me-adoption-applications-route.test.ts` does cover its own (lines 227/235), so this is an asymmetric hole in a **new** door, not a repo-wide convention. **Why it is worth a row rather than a shrug**: `createClientFromBearer` parses only the *shape* of the header — its own docblock says it decodes the token and "never reads a claim" — so `requireLiveUser` is the single barrier for `NO_SESSION` / `ACCOUNT_ERASED` / `DEACTIVATED` / `SHIFT_EXPIRED`, and an erased account keeps a syntactically valid JWT because erasure is state in the database, not revocation. A regression here opens adoption-detail reads to an ERASED account: the art. 16 class this repo has already been burned by four times over. Verified correct as merged — gate at line 110, read at 117. The fix is two `it`s copied from lines 590-599 into a GET describe. |
| ~~The same endpoint's documented **fail-open** has no test~~ | **CLOSED 2026-08-30** by the same lane | Flipping `spendBudget`'s `return true` to `return false` used to leave the file 36/36 green. It now carries the case five sibling files already had — and its PAIR, which none of them states: the authorization guard must still fail CLOSED while the limiter is broken, since a fail-open limiter that carried the guard open with it would be the same line doing two jobs. Both mutations applied, both red. |
| ~~**`submitFreeClaimForUser` can claim an ERASED pet, and tells you it was erased**~~ | **CLOSED 2026-09-01** — it was the biggest thing on this table and it is one clause | The fix is `isNull(pets.deletedAt)` on the in-transaction `SELECT ... FOR UPDATE`, copied from the sibling rather than re-derived: `lookup-for-claim.ts` already joined it under "erased must not be distinguishable from never existed". **Both consequences die on the same clause**, which is why no second guard was added: with the pet filtered out, the existing `if (!pet) throw ... "not_found"` three lines below answers exactly what an unregistered chip answers. **A dedicated `pet_erased` refusal was considered and REJECTED** — it would rebuild the oracle with better manners. There is one answer and it is the one that says nothing. Two cases in `__tests__/pet-claim.test.ts`, against **real Postgres** because the second consequence WROTE: an erased pet WITH active custody (the 409-vs-404 oracle) and one WITHOUT (the claim that completed). The second asserts the refusal AND that no ownership row and no `ownership_claimed` event exist — a writer that answered `not_found` after committing would satisfy the refusal alone and still have transferred the animal. Mutation: removing the clause turns both red, and only those two. **The web is fixed by the same commit** — `/mis-mascotas/reclamar` drives this identical writer, which is why the debt was recorded rather than patched inside a merge. |
| ~~**`submitClaimDisputeForUser` carried the SAME erased-pet hole, and the fix above had called only `lookup-for-claim` "the sibling"**~~ | **CLOSED 2026-09-01** — found by the pre-push review of the free-claim fix, closed the same day | The dispute door resolved the chip with a bare `innerJoin(pets, eq(...))`, so an erased pet answered "figura como fallecida" or "no tiene dueño activo registrado" — both distinguishable from "No encontramos la mascota." — and with a surviving active-owner row (ownerships outlive an erasure by design: `erase-subject-data.ts` soft-deletes only `pets`) a full dispute could be RAISED on the erased spine: case opened, `custody_dispute_raised` appended, `in_custody_dispute` flipped, the erased subject notified. Same clause as its two siblings, now on the join. Two cases in `__tests__/pet-claim.test.ts` against real Postgres (with-owner asserts refusal AND that no dispute row, no spine event, no flag were written; without-owner kills the second oracle). Mutation: removing the clause turns exactly those two red. **The lesson for the next fix of this class: "the sibling" is every writer the wizard reaches, not the one the comment happens to name — grep the directory, not the docblock.** |
| **`booking_slot_past` renders as a transient outage on builds older than the code** | small, self-resolving — noted 2026-09-01 by the pre-push review | An installed build validates unknown error codes against its baked `API_V1_ERROR_CODES` and falls back to `temporarily_unavailable`, so a field build older than the fold shows "El servidor no pudo responder. Volvé a intentar en unos segundos." for a permanent 409. Zero field impact today — the only published build (5) cannot sign in at all — and it dissolves as builds roll forward; recorded so the next new error code weighs the same cost deliberately. |
| ~~`api-v1-me-pet-claims-route.test.ts` needs an env var no setup forces~~ | **CLOSED 2026-09-01** — the two `vi.mock` lines the row named | Same stub as the fourteen siblings, with the row's own worktree measurement quoted in the mock's comment so the reason travels with the code. — It is the ONLY one of the fifteen `/api/v1` route tests that does not mock `@/lib/supabase/bearer`, so it builds a real supabase-js client and reads `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `__tests__/setup-env.ts` forces `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` and not that one. In a worktree with no `.env.local` the file reports 20 of 21 red with `Error: supabaseKey is required.` — credential-shaped, which is the FOURTH red signature `/CLAUDE.md` names, on a file that has nothing to do with RLS. Green in CI (the vitest job exports the real key) and green wherever the env is exported, so it hides no defect; it is a harness that is more coupled to the environment than its fourteen siblings, in the one direction that makes a red unreadable. Fix is the two `vi.mock` lines `api-v1-me-appointments-route.test.ts` already has. |
| ~~**`omnibox-search.test.ts` compares a NODE clock against a POSTGRES clock, and flaked the 2026-08-30 gate**~~ | **CLOSED 2026-08-30** by the `reloj-omnibox` lane — see its block at the end of this page. **The row's own sizing was wrong and that is the lesson to keep**: it said "small — owner: the next lane in that file", and the defect was TWO tests across THREE files, failing in OPPOSITE directions — the omnibox positive assertion could not see a row that existed, and the audit windows in `org-memberships` / `org-invitations` could see rows that belonged to an earlier run. A row that names one file is a hypothesis about blast radius, not a measurement of it. The fix took the clock from the database (`__tests__/_helpers/db-now.ts`) where a window is genuinely needed and deleted the window where it was not, plus the two dead sleeps and the comment that justified them. Proved by three applied mutations plus a ±5-minute host-clock control the new version survives 19/19 in both directions. The original diagnosis below is kept verbatim because it is the record of how a fifth red signature was read without re-rolling. | Two `test:verified` runs over the same tree: run 1 `reported 1473 file(s); 1473 discovered; 0 failing test(s); 0 broken file(s)`, run 2 `1 failing test(s); 0 broken file(s)`. **No `Worker exited unexpectedly` in either**, and nothing broken — so it is none of the three worker signatures, and none of their rules apply. The failing assertion is `expect(rows.length).toBe(1)` → `0`, in "writes a single `pii_queried` audit row". **Diagnosed rather than re-rolled.** The test takes `const since = new Date()` in Node, calls the action, sleeps 100 ms and then selects `where performed_at >= since`. Two things are wrong with that. (1) **The 100 ms sleep is dead and its comment is false**: it says "Fire-and-forget; give the insert a tick to land", and `search-omnibox.ts` awaits the write with a written argument for why it must NOT be fire-and-forget ("under Ley 25.326 the access audit must be durable"). The row is committed before the action returns, so lateness cannot be the cause. (2) What is left is the comparison itself — `since` is the host clock, `performed_at` defaults to Postgres's `now()` inside a container. Any moment where the container clock sits behind the host makes a row that really exists invisible to that predicate, and a Docker VM on macOS resyncs its clock without warning. **Evidence, all of it measured, none of it conclusive on its own**: the file passes 3/3 in isolation on the merged tree; the base `6671cff99` passes 2/2 under the full suite in a control worktree; the diff touches nothing the file imports and no audit path; and no previous integrator log in this scratchpad carries this failure. **Two clean control runs do not exonerate a coin that came up once in two** — recorded as unattributed rather than as "not mine". The fix is to take `since` from the database (`select now()`) or to drop the window and match on the payload, plus deleting the sleep and the sentence under it. |
| **A professional's personal phone goes out on the national turno search** | **PO first, then a lane** — added at the 2026-08-30 merge | Found by the review of the buscar/reservar lane and NOT fixed in the merge, because it is a product call and not a defect on its face. `search-bookable-slots.ts`'s `OFFERING_COLUMNS` selects `profiles.phone` and `organizations.jurisdiction_locality`, and both reach the wire through `app/api/v1/appointments/payload.ts` for ANY authenticated caller with no prior relationship to the offering. **The two web pages the module's header says it negates line by line select neither**: `buscar/page.tsx` takes only `displayName`/`matriculaNumber` from the professional, and `[offeringToken]/page.tsx` carries an explicit comment saying it omits `jurisdictionLocality` on purpose after the 2026-08-13 incident — the same incident that header cites. `organizations.phone` has a public precedent (`lib/infra/org-public-profile.ts`); `profiles.phone` crossed to a non-owner only in `list-appointments-for-user.ts`, for a turno you ALREADY HOLD, and the widening rode in on that type being reused. The docblock's argument for the reuse is about RENDERING ("one thing"), which is true and is not an authorization argument. **No fence sees it** — `lint:subject-rights`, `no-personal-contact-in-ui` and `welfare-org-pii-fitness` are all green. Either it is a decision the PO makes, or the two columns come out of `OFFERING_COLUMNS`; what it must not stay is a side effect. |
| **The `serviceKind` echoed in the search payload is unmeasured, and its comment is false about its own line** | small — owner: the next lane in `app/api/v1/appointments` | Mutation applied at the merge review: `serviceKind: \`${query.serviceKind}_MUTANT\`` leaves all 28 route tests GREEN — no case asserts the positive value of `body.serviceKind`. The docblock says "NON-NULL BY CONSTRUCTION … No `?? requested` fallback here — that is the very shape that printed a raw param as a heading", and the line is literally `findServiceKind(query.serviceKind)?.code ?? query.serviceKind`. Not exploitable today: the parser nulls an unknown code, and THAT half is fenced (mutating `query.ts` goes red, and so does bypassing the parser from the route). But it is the second layer of defence against S3-F07, it is described wrongly, and nothing would catch the parser loosening. |
| **The booking refusal fence can be bypassed by ADDING a sentence, not by rewording one** | small — owner: the next lane in `src/modules/events/application/booking` | Three mutations were applied at the merge review. Rewording a refusal → RED (the orphan check catches it). Moving an existing sentence to a template literal → RED (`sentences.size >= 8`). **Adding a new refusal via `const msg = "…"; throw new BookingError(msg);` while keeping the eight literals → 10/10 GREEN**: the new sentence never enters the set, the table does not cover it, and `bookSlotRefusalCode` sends it to the `slot_unavailable` fall-through. The direction is safe — it is still a refusal and grants nothing — so this is MISCLASSIFICATION risk, not an authorization hole. The row exists because the fence's own comment claims more than it proves. |
| **The reservar screen's primary button `disabled` has no fence** | small — owner: the next lane in `apps/mobile/src/turnos` | `disabled={submitting \|\| slotId === null \|\| petToken === null}` → `disabled={submitting}` leaves all 97 turnos tests green. It writes nothing — `submit` has its own `if (slotId === null \|\| petToken === null) return;` — so the failure is an enabled button that does nothing when tapped, not a write with no selection. Worth naming only because the five neighbouring mutations on the same screen (derived `canBook`, a blocked pet being selectable, no re-read after a refusal, navigating anyway, selection surviving a re-read) all go RED: the hole is one line wide and sits between fences that bite. |
| `claimDisputeUrl` builds its URL by hand while its neighbour uses the map | small — owner: same | `apps/mobile/src/claims/claim-view-model.ts`: `claimSightingUrl`, two functions above it, goes through `deepLinkUrl` with the written argument that "a rename is a compile error rather than a 404 nobody notices" — and `claimDisputeUrl` interpolates `${origin}/mis-mascotas/reclamar` directly. If the web renames that path the dispute link becomes a silent 404 and nothing turns red. `DEEP_LINK_MAP` has no entry for the wizard, but `myPets` is an exact precedent for a parameterless one. The file's own principle, applied to one of its two functions. |
| **The two-clock rule is a comment, and a comment puts nothing red** | small — owner: the next lane writing a `__tests__` sweeper. **Added at the 2026-08-30 merge, from the review of the lane that closed the row above it.** | Three instances of "assert a host `new Date()` against a column with `defaultNow()`" were closed this window, and the rule that closes them lives only in the docblock of `__tests__/_helpers/db-now.ts`. This repo fences every lesson it pays for — the 53 tree-sweeping fences exist for that reason — and this one is not fenced. Any new test that writes `const since = new Date()` and compares it to a `defaultNow()` column reintroduces exactly the defect that made the 2026-08-30 gate answer differently twice over one tree, and nothing goes red. **The nearest existing fence does NOT cover it**: `__tests__/no-raw-date-in-sql.test.ts` is about a `Date` interpolated into a `sql\`\`` template and it sweeps `lib` and `src`, not `__tests__`. The shape of the fix is a ~20-line sweeper over `*.test.ts*` for `(gte\|gt\|lte\|lt)(<column with defaultNow()>, <host Date>)`, with the column list DERIVED from `db/schema.ts` rather than typed by hand. **Recount it at write time and do not inherit this figure**: measured 2026-08-30 on the merged tree, `db/schema.ts` carries **77 column definitions** with `defaultNow()`, spread over **20 distinct column names** (`created_at`, `updated_at`, `performed_at`, `occurred_at` and sixteen more) — the review that raised this said "20 columns", which is the count of NAMES and not of columns, and a sweeper keyed on the wrong one of those two numbers scans the wrong set. Not done in the merge because a new fence needs its own mutation proof and its own gate, and an integrator writing one inside a merge commit is how an unproved fence enters the tree. |
| **`read-return-state.test.ts` asserts against a stub that throws its arguments away** | serious, not blocking — owner: the next lane in `src/modules/return-to-owner`. **Found by the review of the WU-P lane and MEASURED, not inferred.** | `makeDb()` in that file builds a chain whose `.where()` and `.orderBy()` both `return self`, so every argument they receive is discarded. Mutation applied at the merge review: deleting `eq(petEvents.eventType, "custody_transfer_proposed")` **and** flipping `orderBy(desc(petEvents.occurredAt))` to ascending, in one change, leaves `src/modules/return-to-owner` (3 files) plus `__tests__/api-v1-return-route.test.ts` at **106/106 green**. The irony is the lane's own: its sibling file `resolve-return-target-org.test.ts` opens by condemning exactly this shape — "a drizzle stub whose `.where()` discards its argument does not merely fail to test it: it makes every assertion in the file assert that the argument does not matter" — and the rule was applied in one of the two new files and not the other. **What it costs**: that row is what decides `inbound_pending` vs `awaiting_org` and supplies `actorName`, `proposedAt` and `notes`, so a reversed order describes an OLD resolved proposal instead of the live one and the screen can draw "Aceptar / Rechazar" against the wrong one, or hide a real inbound. **What it does NOT cost**: custody. All three use-cases re-check `to_user_id` under `pg_advisory_xact_lock`, so the blast radius is a wrong screen, not a wrong transfer — which is why it was recorded rather than treated as a merge blocker. |

## PO-gated — not agent work, do not attempt

Listed so you recognise them and hand them over instead of trying.

1. Upload **build 6** to Play. Build 5 is published and **cannot sign in** — it shipped without `EXPO_PUBLIC_SUPABASE_*`, which are baked at build time.
2. Revise the **Data Safety** form before any build with uploads reaches Play. It declared on 27/08 that the app does not collect photos; that stops being true the moment uploads ship, and a form that no longer matches the binary is a policy violation by itself.
3. Apply migrations **0205, 0206, 0207 and 0208** to staging and production. Written and green locally. **Applying to a remote DB is Ignacio's call, never yours.** **Staging: done 2026-09-01** — the PO ran `--status` → `--dry-run` → `pnpm db:migrate` → `pnpm db:migrate:check` against the staging pooler, and the check reports `Applied 209 / Pending 0`, i.e. 0205–0210 (the two welfare ones from this row's item 8 included), BEFORE the push that needs them. Production stays on this row. **This row said three until 2026-08-31 and there are four** — `0208_subject_rights_watermarks_tag_interest_org_invitations.sql` was written 2026-08-29 (`eb4ae835c`) and no list was recounted. It was found the way this repo's rotted numbers usually are: not by reading, but by a fence going red — `check-subject-rights-coverage` failed on the three tables that migration adds, because the local database did not have it either. Recount with `pnpm db:migrate:status`, never off this line.
4. Resend email setup (domain verification → API key → SMTP in Supabase → env in Vercel). Until it lands, the 6-digit password-recovery code does not travel and the screen promises what the mail does not deliver.
5. The two store graphics, pointing `mimar.com.ar` at Vercel, the tester acceptance link, the Supabase "exceeding limits" warning, and the 12 tester emails.
6. Create the two **staging secrets the nightly e2e job reads**, `STAGING_SUPABASE_URL` and `STAGING_SUPABASE_ANON_KEY`. Re-measured 2026-08-30 and PROMOTED from the turned-back block above, with a root cause stronger than the original report: they are not empty by accident, **they were never created**. `gh secret list` on the repo returns exactly one row, `STAGING_DATABASE_URL`; `e2e-nightly.yml` declares no `environment:`, so no environment-scoped secret can supply them either, and `${{ secrets.X }}` on an undefined secret is the empty string with no warning. The consequence is visible in every run: the job log prints `NEXT_PUBLIC_SUPABASE_ANON_KEY:` with nothing after it, and `e2e/cross-tenant-isolation.spec.ts:265` throws `NEXT_PUBLIC_SUPABASE_ANON_KEY not set — the cross-tenant isolation suite cannot probe anything`. Present identically in run 33252469499 (2026-08-29) and run 32108115808 (2026-08-18); all **12** of the 12 most recent nightly runs are red. **Creating a secret is the PO's**, never an agent's — the values are the staging project's URL and anon key.
7. **Accept or close the `rate_limit_buckets` de-anonymisation channel** (denuncia, WU-T). An anonymous denuncia filed from the phone writes no uuid into the record and DOES write one into `welfare_auth:{userId}:hour:{window}`. Fully derived in `app/api/v1/welfare-reports/commands.ts` — deny-all under RLS, no product reader, gone within the hour, and identical on the web because both spend the same bucket. Closing it means either no per-user ceiling on the anonymous path or a per-IP one, and the web's own anonymous door prices that: `welfare_anon` at 1/min and 3/hr per address is one denuncia per carrier per minute behind a CGNAT gateway. **A flood-control trade on a legal filing is not an agent's call.** (The second, worse channel found in the same window — the caller's uuid reaching Vercel's function logs through a limiter error message — was NOT left for this decision; it is closed in code, see `redactCallerId`.)
8. ~~**Decide whether `observedSymptoms` is a field or a paragraph.**~~ **Closed 2026-09-01 — it is a field.** The denuncia screen asked "¿notaste síntomas?" and the `/api/v1` door threw the answer away on every request; the web twin (`WelfareReportForm.tsx`) discarded it just as silently. Decided as a column, not a paragraph — rewriting somebody's testimony into the description was the option refused: `welfare_reports.observed_symptoms` (migration 0209, view 0210), stored by both intakes (`create-welfare-report`, `create-org-welfare-report`) and by `/api/v1`, read at the `/gob/maltrato` detail, the inspector panel and the MPF export (`a395292f9`). Both migrations reached staging the same day — see item 3.
9. ~~**Answer "is adding evidence to an existing denuncia a capability?" before anybody builds the attachment picker.**~~ **ANSWERED 2026-09-01: it is NOT a capability.** The PO chose the strongest of the three options offered (stronger than the recommended "yes, after the test"): evidence attaches at CREATION, period, and every screen's copy aligns to that. The alignment was then SWEPT rather than assumed — both languages, all surfaces (`app`, `apps/mobile/src`, `components`, `src`, `lib`): the only match for the add-later promise anywhere is the view-model docblock that records its own removal. The native screen already said the honest thing up front. What remains of the original item is only its SMALL half — the attachment picker at creation (WU-T's returned attachments), which is D2 build territory, not a product question. — Original text: the picker is the small half; the large half: NO surface accepts evidence for a denuncia that already exists — not `/denuncias/codigo`, not `/denuncias/seguimiento`, not for an authenticated reporter (`addReporterCommentAction` adds TEXT and nothing else).
10. ~~**Decide whether a professional's personal phone belongs in the national turno search payload.**~~ **ANSWERED 2026-09-01: it does not — removed the same morning.** `profiles.phone` is out of `OFFERING_COLUMNS`, the contract's professional variant carries no `phone` key, and `__tests__/appointment-search-provider-pii.test.ts` pins BOTH directions (the professional's absent, the organization's public number present — so neither creeps by symmetry), compile-time and runtime, mutation applied red. A turno the caller already HOLDS still carries it (`MyAppointmentsV1`), which is the relationship that earns it. — Original text: see the debts row above; the two web pages that serve the same catalogue both decline to select it, one citing a dated incident.
11. Decide whether to authenticate **ECR Public** pulls in CI, or accept the throttling. Re-measured 2026-08-30 and PROMOTED from the turned-back block above. Every Supabase image resolves to `public.ecr.aws/supabase/*`, and in runs 33273180809 / 33269256483 / 33260290131 every `toomanyrequests: Rate exceeded` line is immediately followed by the CLI's own `Retrying after Ns: public.ecr.aws/supabase/<image>` — so the throttle is named, not inferred. The only `docker.io` reference in any of those runs is `library/postgres:16`, a service container that is not part of this stack. **A `docker/login-action` with Docker Hub credentials would change nothing**; write that down before someone spends a day on it. ECR Public throttles anonymous pulls by source IP and raising the ceiling needs an AWS account to authenticate against, which is a spend decision. Not urgent on its own: the CLI already retries a throttled pull and recovers.

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


## Appended 2026-08-30 by lane a78516a7-c68-1

### WU-T — denunciar maltrato from the phone — LANDED 2026-08-30, second attempt

**Row 5 is off the table.** `POST /api/v1/welfare-reports` with two commands
(`resolve_location`, `file`), the denuncia vocabulary in `@dim/contract`, and
`apps/mobile/src/denuncias/` behind `/denunciar`, linked from the footer of
`/mascotas` and titled in `app/_layout.tsx`. The endpoint is an adapter over
`createWelfareReport` — the use-case `/denuncias/nueva` drives — and re-derives no
guard.

**The first attempt's code was whole and its review was
*aprobado-con-reservas*.** It was turned back on **five content conflicts**
against the adoption lane, which merged an hour earlier in the same window — not
on a fence and not on a red. This attempt brought the first attempt's five code
commits onto `6671cff99` — **by cherry-pick and not by rebase**, deliberately, so
that each conflict could be stopped at rather than swept through in one
operation — where the other side is already in `main` and every conflict could be
resolved ONCE, with both arguments visible. That is the whole difference between
the two attempts, and it is why the conflicts are written up below as decisions
rather than as merge mechanics.

*"Rebased" is what this sentence said until the integrator corrected it on
2026-08-30. The mapping was verified — the five code commits of `1f660b7c7` are
1:1, and the sixth, `e013b8dfa`, was a board commit deliberately left behind —
so the FACT was right either way. Only the word was wrong, and the word is what
the next lane copies when it has the same problem.*

#### The five conflicts, and how each was resolved

Four were the same shape — **both lanes appended at the end of a list** — and all
four kept both sides, adoption first because it landed first: one member in
`API_V1_ERROR_CODES`, one arm in `error-copy.ts`'s switch, one entry in `ROUTES`,
one function in `endpoints.ts`. Mechanical, and correctly so.

**The fifth was not mechanical and is the one nobody had taken.** Both lanes
appended a `SecondaryButton` to the same `/mascotas` footer and **both wrote a
long comment arguing for the slot they took**, so any `--ours`/`--theirs` would
leave one comment standing over an arrangement it does not describe.

**Decided on the product question, not the merge: denunciar goes LAST, below
adoptar.** The footer was already ordered by distance from what the reader is
responsible for — Transferencias and Notificaciones are addressed to them, Mis
turnos belong to their animals, Reclamar is an animal that IS theirs recorded
under somebody else, Adoptar is one they may come to hold. **Denunciar is where
that line ends rather than another point on it**: denunciar maltrato is not an act
on your animals at all. It is a civic act about somebody else's, and it ends with
a case file at an authority naming a person. It is on this screen because this
list is the only hub either client has — which is exactly what the web says in its
own comment ("about someone else's animal, so it can never live on your own
credential") — and not because it belongs among what the list is about.

**Adoption's comment was corrected in the same edit, because the decision left it
lying.** It called itself "the odd one out in this footer", which was true while
it was the last button and stopped being true underneath it.

**Both comments are now FALSIFIABLE, which neither was before.**
`apps/mobile/app/mascotas/index.tsx` is the app's most-opened screen and it had
**no test of any kind** — every button in that footer, this lane's and the
adoption lane's and reclamar's, was unfenced. `apps/mobile/src/pets/
MisMascotasFooter.test.tsx` pins the order, the separation and the route off the
RENDERED tree, never off the source: a source-text fence over a JSX order passes
for any rearrangement that keeps the same lines. **And its own first version
fenced nothing** — `renderedFooterOrder()` mapped over the expected labels and
merely filtered the missing ones, so it handed that constant back regardless of
the arrangement and the swap mutation left it **3/3 green**. Same defect as a stub
that discards its argument, found by applying the mutation rather than by reading
the helper. Three mutations now, one per test, each killing only its own.

**And denuncia's own comment was lying too, in a way the conflict hid.** It
claimed "the gap between the two is bigger", and `styles.footer` sets ONE uniform
`gap` for every child — the separation was a sentence with nothing on the screen
behind it. It exists now (`styles.civicAction`, a `marginTop` that stacks on the
parent's gap, applied through a wrapper `View` because `SecondaryButton` takes no
`style` prop and `kit.tsx` is not this lane's territory). The argument is real: a
button that files a criminal allegation must not be reachable by a thumb aiming at
the one above it.

#### The *serio* from the first review, fixed

**`geocodeAddressPublicAction` was called bare and the header claimed the
opposite.** `geocodeAddress` throws on three paths — `rate_limited` (its own token
bucket, not the `geocode_public` one the door already spent), `fetch_failed`,
`provider_error` — and the public action re-throws all three. `route.ts` does not
wrap `runWelfareReportCommand` either, so all three escaped as a **bare Next 500
with no `{ error }` envelope**, on the only path this phone can turn an address
into a point. Meanwhile the file's header said every guard on it "is a copy of a
call site": `components/LocationFields.tsx` wraps that same action, so the call had
been copied without the try/catch around it. Now caught → 503
`temporarily_unavailable`, which already had es-AR copy on the client and already
had `unavailable()` in this file: no new error code, no contract change.

**A 503 and NOT an empty list, which was the tempting fix.** The screen renders
`matches: []` as "no encontramos esa dirección", so a nominatim outage would tell
somebody standing in front of an injured animal that the street they are looking at
does not exist, and they would retype it until they gave up — an infrastructure
failure wearing the costume of a user error. That wrong fix is now **pinned by a
test** so nobody applies it later.

**The test comment was false in both directions and is corrected.** It said the
miss, the timeout and the rate-limit refusal are "deliberately indistinguishable":
false about the code (the other two THROW rather than returning empty) and false
about the test (the stub could not throw). A stub that only ever resolves makes
every assertion in the file an assertion about the happy path — the drizzle-stub
defect, one file over. `control.geocodeThrows` closes it, and the stub records the
query BEFORE throwing so a 503 minted upstream cannot pass for this one.

Three mutations applied, not predicted: deleting the try/catch → **5 red**;
`return unavailable()` → `matches = []` → **4 red**; putting the address in the
error sink → **1 red** (spec D10).

#### The rate-limit bucket, and the pin that goes RED

`api_v1_welfare_reports_ip: "authenticated-write"` is in
`API_V1_IP_BUCKET_FAMILIES`, **added by the lane that shipped the route** rather
than handed to an integrator — this file is this lane's territory in this window,
so the pattern the map's own comments record ("the route arrived with its bucket
spent and undeclared") had no reason to repeat.

All three pins **recounted from the tree, never incremented**:
`Object.keys(API_V1_IP_BUCKET_FAMILIES).length` → **34** (`MIN_IP_BUCKETS` 33 →
34), `listV1RouteFiles().length` → **29** (`MIN_V1_ROUTE_FILES` 28 → 29), and the
CGNAT aggregate → **12 444** (`toBe(12_324)` → `toBe(12_444)`). Hand-summed per
family over the merged map rather than read off the `reduce` the test compares
against, because a computed value agreeing with itself is not evidence: 16×600 +
8×120 + 2×60 + 1×240 + 1×600 + 2×180 + 1×240 + 1×120 + 1×144 + 1×60 = **12 444**
over 34 buckets in 10 families.

**The aggregate pin goes RED when the bucket lands, and the first attempt's
handover said twice that it stayed green.** Measured before touching the pins:
`expected 12444 to be 12324`. The mistake is easy because it is half true — the
other two assertions really do go red→green with the entry — but the aggregate is a
sum OVER the map, so growing the map grows the sum.

**`MIN_V1_ROUTE_FILES` was ALREADY slack before this commit**, and that is this
page's own warning happening rather than being repeated. The route file entered the
tree with the rebase, so for the whole lane the count was 29 against a floor of 28:
satisfied, loose by one, green, with nothing anywhere going red to say so. It was
caught only because the floor was recounted instead of read. **"The fence was
green" is not evidence a floor is right.**

#### The residual de-anonymization channel, declared with its exact reach

An anonymous denuncia **does** write the caller's uuid to the database, and the
file that owns the anonymity rule did not say so. `spendUserBudget` runs on the
anonymous branch too: `reporterUserId` is null and `userId` is the caller's,
unconditionally.

- **What is written**: `rate_limit_buckets`, PRIMARY KEY
  `welfare_auth:{userId}:hour:{windowStartMs}`, plus `count` and `first_seen_at`.
  The uuid is in the key, not a column.
- **What it discloses**: `welfare_auth` has exactly two spenders and both are
  denuncia creation, so the key's existence asserts "this user filed at least one
  denuncia in this hour" and `count` says how many. Against a `welfare_reports` row
  with `reporter_user_id` null and `created_at` in that window, a reader could
  re-attach a name — unambiguously, in a quiet hour.
- **Who can read it**: not `anon`, not `authenticated`. RLS is enabled
  (migrations 0113 and 0165) and **no policy and no grant has ever been written**,
  so PostgREST denies everything; migration 0139 cites this table as the precedent
  for that shape. What reaches it is the service role — the server's Drizzle
  client, and whoever holds the service key or a psql connection. **No product
  surface reads it at all.**
- **How long it lives**: `expires_at = window + 1h`, deleted by the first of the
  five purges behind `/api/cron/data-lifecycle`. Not indefinite retention.
- **Does it break the promise**: no, and only because the promise is written
  narrowly — this door and the screen both say anonymity here is a property of the
  RECORD, not unattributability in flight. A deny-all counter with no reader that
  erases itself within the hour is on the "in flight" side. **What it is not is
  zero**, which is why it is written down.
- **It is not this door's channel.** `src/modules/welfare/actions.ts` branches on
  whether a `user` exists, never on `contactMode`, so a logged-in person choosing
  "Enviar anónima" in the BROWSER spends the identical bucket under the identical
  key. Closing it means either no per-user ceiling on the anonymous path (which the
  PO decision of 2026-07-08 assumes) or a per-IP one, and the web's own anonymous
  door shows that price: `welfare_anon` is 1/min + 3/hr per IP, which behind a
  CGNAT gateway is one denuncia per carrier per minute for everyone on it. **A PO
  trade, not an agent's.**

#### What it RETURNS rather than solves

- **ATTACHMENTS ARE RETURNED, NOT DEFERRED, and the reason is not "no native
  picker".** That is the smaller half. The larger half is that **no surface in this
  product accepts evidence for a denuncia that already exists** — not
  `/denuncias/codigo`, not `/denuncias/seguimiento`, not even for an authenticated
  reporter (`addReporterCommentAction` adds TEXT and nothing else). So "add them
  later from the web" is a promise the product cannot keep on ANY client, and the
  screen says so up front instead. **Whoever unblocks attachments has to answer a
  product question first — is "add evidence after filing" a capability or not? —
  and only then the picker.** Two blockers, and the second one is not an agent's to
  decide.
- **The HEIC/EXIF leak stays declared and untouched**, with the sentence that
  matters: the web's denuncia form accepts HEIC, so an iPhone photo carries the GPS
  EXIF of where it was taken — frequently an anonymous reporter's own home. Fixing
  it needs server-side transcoding. **A door that carries no bytes is not a
  mitigation of that; it is simply not a new mouth.** Anyone adding uploads here
  lands the transcoding first.
- **`observedSymptoms` was a black hole and the field is GONE**, recorded because
  the reasoning generalises. It shipped on the wire and on the screen ("¿Notaste
  algún síntoma en el animal?") before anybody checked where it LANDED:
  `welfare_reports` has no such column, and its only consumer is
  `createWelfareReport`'s `symptom_observed` bridge, which sits inside
  `subjectKind === "registered_pet" && subjectPetId` — a subject this door does not
  accept. The server discarded it on every request the door can make. **A form
  field whose answer is structurally dropped is worse than a missing one**: somebody
  describes an injured animal and no inspector ever reads it. **The same silent
  discard exists on the WEB and is reported, not fixed**: `WelfareReportForm.tsx`
  (the ORG intake) has an `observedSymptoms` textarea and an org report's subject
  may equally be an `unowned_animal`. Closing it is either a column or a decision to
  fold the text into the description, and rewriting somebody's testimony is not a
  thing to do without asking.
- **`uploadWelfareEvidence` has THREE call sites, not two**, and three docblocks in
  this lane said two. The third is
  `src/modules/pets/application/claim/submit-claim-dispute.ts`, a custody DISPUTE
  rather than a denuncia, present since before the lane. The conclusion survives —
  it is also a creation path — but that sentence is the reason the screen's copy
  exists, so it does not get to be approximately true. Corrected in all three, with
  the instruction to recount rather than trust the number.
- **The pin drag is still missing versus the web**, which is the map. The screen
  searches, the server returns candidates, the person taps one; retyping the address
  INVALIDATES the chosen point, because the dangerous state is a denuncia filed
  against the previous street after somebody corrected the text and never touched
  the list again.
- **This page's own pointer census is stale and is NOT this lane's to fix.** The
  row-3 paragraph says `rg -i '\brows? [0-9]+\b'` "returns nine pointers"; run
  today it returns **nineteen** matches. The census belongs to the adoption/row-3
  renumbering decision, which is the integrator's call. Reported.

#### What was measured

- **The 53 tree-sweeping vitest fences, enumerated over the WHOLE tree** with
  `rg -l 'readdirSync|globSync|discoverTestFiles' --glob '*.test.ts*' --glob
  '!node_modules' .` — 53 files, the 46 under `__tests__/` plus the 7 that live
  beside the code they police. **And the set spans TWO RUNNERS, which the recipe
  does not say and which a vitest-only run hides**: 52 are vitest (**52 files /
  1131 tests green**) and the 53rd,
  `apps/mobile/src/release/release-config.test.ts`, is in neither vitest project's
  include — it is a mobile **Jest** test and vitest answers "No test files found"
  for it. Run under Jest: **31/31 green**. A run that reports 52 and stops looks
  complete and is one short.
- **The whole `lint:*` chain, all 66, each run separately**: **64 measured and
  green**. `lint:route-weight` and `lint:csp-prerender` are declared **NOT
  MEASURED**, not counted green — both self-skip without a build and exit **0**
  while saying so in words ("NO SE MIDIÓ NADA", "This run proved nothing about the
  CSP").
- **The whole `unit` vitest project**: 646 files, 9391 passed, 3 skipped.
- **Targeted blast radius** (the welfare module, the contract package, the
  `/api/v1` envelope and limits fences, the deep-link map, the three
  `uploadWelfareEvidence` callers, the redaction fences): 67 files, 1051 tests
  green.
- **Mobile Jest**: 55 suites, 860 tests. **Both typechecks clean**, and `biome
  check` over the repo is clean apart from ONE pre-existing warning this lane did
  not touch and does not own — the dead `suppressions/unused` at
  `__tests__/auth-callback-redirect.test.ts:107`, already a reported item on this
  page. Verified present at `6671cff99`.
- **`pnpm verify` and `pnpm test:verified` were NOT run** — the local Supabase is
  shared with a parallel lane and the brief forbids it. The full suite is the
  integrator's gate. Named rather than implied, because that is precisely the gap
  that sank an earlier lane on this page.

## Appended 2026-08-30 by lane a78516a7-c68-2

### WU-S — buscar y reservar, the two that were left — LANDED 2026-08-30

**Row 2 is off the table.** A citizen can now find a turno and take it from the
phone: `GET /api/v1/appointments` (the service picker and one service's results),
`GET /api/v1/appointments/{offeringToken}` (the sixty-day slot grid plus which of
the caller's animals may take a place), and `command: "book"` as the second member
of `POST /api/v1/me/appointments`. Natively: `apps/mobile/src/turnos/`'s
`BuscarTurnoScreen` and `ReservarTurnoScreen`, behind `/turnos/buscar` and
`/turnos/buscar/{offeringToken}`, reached from a primary button on Mis turnos.

**They landed as ONE unit because the row said they were one**, and the row was
right in both directions: the search decides everything the write would refuse, so
the write has almost no refusal a person can reach by ordinary use; and the write
is what makes the search a screen rather than a list of things nobody can have.

#### What it decided

- **The contention is ALREADY SOLVED and this door reuses it rather than
  re-deriving it.** `bookSlotWriter` takes `pg_advisory_xact_lock(hashtext(slot))`,
  re-reads capacity inside the lock, and stands on a `CHECK` plus two partial
  unique indexes (migrations 0177 and 0181). The bearer door calls that writer
  unchanged. **The one race nobody had measured is the CAMPAIGN one**, and
  `book-slot.ts` says in its own comment why the lock cannot cover it: the key is
  per SLOT, so two concurrent submits against DIFFERENT slots of one campaign do
  not serialise there. `booking.test.ts` covers that guard SEQUENTIALLY, which
  exercises the in-transaction re-read and never the index. A concurrent case is
  now in `__tests__/booking-race.test.ts`, and it was established by mutation
  rather than assumed: with the 23505 translator removed the test goes red
  carrying `duplicate key value violates unique constraint
  "appointments_one_live_per_pet_offering"` — both transactions passed the in-lock
  read and the INDEX refused the second. As a CONTROL, removing the in-lock read
  entirely leaves the test GREEN, which is the comment's claim made measurable.
- **The write hangs off `/me/appointments` beside `cancel`, and adds NO
  rate-limit bucket.** A write's home is the resource it MUTATES, and the two
  commands share an anchor `api-v1-limits.ts` already derived against: each is a
  transaction across three tables that moves a place between people. A `booking`
  family carrying identical numbers would be the eleven-paragraphs problem that
  file exists to refuse.
- **TWO read routes, ONE bucket** (`api_v1_appointment_search_ip`,
  `authenticated-read`). Opening a grid is what a person does FROM the results,
  several times in one sitting — the adoption catalogue and ficha's argument,
  verbatim. It is `authenticated-read` and NOT `public-reference` even though what
  it reads IS a public catalogue: that family's derivation turns on `localities`
  having no identity to key on, so its per-IP bucket is the only one there is.
  This route requires a session and spends a per-user bucket underneath.
- **The three pins were RECOUNTED from the tree, not incremented**: 34 buckets,
  30 route files, CGNAT ceiling **12 924/min** — hand-summed per family
  (17×600 + 7×120 + 2×60 + 1×240 + 1×600 + 2×180 + 1×240 + 1×120 + 1×144 + 1×60)
  as well as read off the `reduce`, because a computed value agreeing with itself
  is not evidence. **Whoever merges this alongside the denuncias lane must recount
  again**: that lane carries `api_v1_welfare_reports_ip` and its own route, and
  34 + 1 is only right if nothing else lands in between.
- **`appointments` joins `CAPABILITY_PATH_SEGMENTS`**, with the exact precedent
  two lines above it: `adoptions` was added for `/api/v1/adoptions/[petToken]`
  after `adoptar` already covered the screens carrying the same token. Without it
  `lib/observability/redact-prefix-coverage.test.ts` goes red — the fence that
  turned the WU-U integration red, and one of the seven no `__tests__`-scoped
  command returns.
- **The refusals speak the EXISTING error vocabulary, and the coarseness is
  DECLARED rather than discovered.** `packages/contract/src/api/errors.ts` and
  `apps/mobile/src/api/error-copy.ts` were another lane's territory in this
  window, so no `booking_*` family was added. Six typed domain refusals
  (`BookSlotFailureCode`) fold onto four codes: `pet_not_yours` → `not_found`,
  `pet_deceased` → `event_not_allowed`, `slot_past` → `appointment_past`, and the
  three that all mean "re-read the grid" → `appointment_already_resolved`. That
  last fold meets `errors.ts`'s only bar — the client's move is identical in all
  three — but the es-AR copy for those four was written for CANCELLING, so
  somebody refused a booking reads "Este turno ya cambió de estado" about a slot
  they never held. **The exact codes and copy they deserve are in the hand-off.**
  The fold lands on races and on hand-posted requests and never on ordinary use:
  the read drops a deceased or erased animal from `pets` entirely.
- **The failure arm is TYPED**, which is the repair `me/appointments/commands.ts`
  still needs for `cancel` — that one matches es-AR SENTENCES and its own header
  admits a reworded one falls through to a 500. Third instance of the
  `AmendEventFailureCode` / `ClaimFailureCode` shape.
- **`pets[].canBook` is on the wire and the phone never derives it.** The rule is
  ONE confirmed appointment per (pet, offering) — the guard that stopped one
  animal eating the 08:00 AND the 08:15 of one free campaign (QA A3, 2026-08-13) —
  and it is invisible in a slot grid. The blocked animal is drawn DISABLED with
  its reason rather than hidden, because a silently missing row reads as a bug.
- **`jurisdictionSource` is on the wire and the web has nothing like it.** The
  server prefills the search from the person's first registered animal; the
  browser draws that into its own filter form where it reads as something they
  typed, so somebody whose pet is registered elsewhere concludes their barrio has
  no campaigns when they never chose their barrio.
- **The two guards on the write are copied as a negation of
  `app/actions/booking.ts:51-79` and cited line by line**, not re-derived: an
  ACTIVE ownership row of ANY role (a foster books under their own id and the
  turno is theirs), not deceased, not erased — art. 16 folding into the same
  "not yours" a stranger's token gets.
- **The search floor rejects a day that does not exist.** `2026-02-31` matches
  `^\d{4}-\d{2}-\d{2}$` and `new Date` neither throws nor returns `NaN` for it:
  JavaScript ROLLS IT OVER to 3 March, so the floor moved three days forward and
  hid every slot in between with nothing reporting a substitution. Found by a test
  written believing the opposite. The fix is `isRealArDay`, IMPORTED from the
  contract rather than restated — it already refuses exactly this on two schemas —
  and it is now exported from `@dim/contract/input`, because a query string
  carries dates too and a search floor is a filter rather than a field.

#### What it did NOT solve

- **The LOCALITY FILTER is not on the phone.** The web's filter form is a
  typeahead over `/api/v1/localities`; the native screen searches where the server
  defaulted to and SAYS SO, and its empty state names the place it looked in
  rather than reading as "this service exists nowhere". Wiring the typeahead is a
  further slice and needs no server work — the query param is already parsed.
- **`bookSlotAction` is NOT migrated onto `bookSlotForUser`.** It is a
  `"use server"` entry point the browser drives, three fences read that file, and
  changing it is a browser-facing edit with its own e2e gate — the identical
  arrangement `list-appointments-for-user.ts` recorded one file over, for the
  identical reason. So one rule has two copies, declared, with the citation in the
  module header and the predicate pinned on compiled SQL rather than on source
  text. The migration is a small, self-contained follow-up.
- **`turnos-routes.ts` and `turnos-api.ts` are DECLARED DEVIATIONS.** Their
  contents belong in `apps/mobile/src/ui/routes.ts` and
  `apps/mobile/src/api/endpoints.ts`, both of which were the denuncias lane's
  territory this window and both of which are among the five files that lane was
  turned back on. Each file says so at the top and the exact move is in the
  hand-off. Note the WRITE needed no new client function at all —
  `sendAppointmentCommand` already takes an `AppointmentCommandInput`, which is
  the discriminated-union argument arriving on time.
- **Neither new route is registered in `apps/mobile/app/_layout.tsx`**, so both
  take expo-router's default header. Same lane's territory, and the two existing
  `turnos` routes and `cuidado/[grantToken]` are unregistered for the same reason.
  The titles are in the hand-off; what a header should SAY is copy, and this lane
  did not invent it.
- **`/mis-turnos/page.tsx` and `/turnos/buscar/page.tsx` still carry their own
  inline queries.** The browser's search is now a second implementation of what
  `search-bookable-slots.ts` does, with one difference this lane did not port
  back: the web renders offerings in whatever order Postgres returns them, which
  on a screen answering "when can I take my animal" is no order at all.
- **`apps/mobile/src/turnos/turnos-view-model.test.ts` carries the false-green
  this lane found in its OWN fences and did not fix in that one.**
  `appointmentWhenLabel` and `appointmentShortWhenLabel` both pin
  `timeZone: America/Argentina/Buenos_Aires`, and this project is developed on a
  machine resolving to `America/Argentina/Salta` — the same offset. Deleting the
  option changes not one character, so the three cases under "the clock and the
  calendar are Argentina's" pass over exactly the mutation they exist to catch.
  Setting `process.env.TZ` inside the module does not help either: the environment
  has already resolved its default zone by the time a test body runs. The
  instrument that works is in `buscar-view-model.test.ts` — `timeZonesAskedFor`, a
  spy over `Intl.DateTimeFormat` collecting the requested `timeZone`, which asks
  the question a compiled-SQL fence asks of a query: what did the code REQUEST?
  Three mutations red there. **Copying it into the sibling file is a few lines**,
  and it covers a capability that landed in a previous window rather than this one.

#### The 53-file recipe is off by one, in the other direction

`rg -l 'readdirSync|globSync|discoverTestFiles' --glob '*.test.ts*' --glob
'!node_modules' .` returns **53**, as this page says. Running all 53 under vitest
reports **52 files**. The 53rd is
`apps/mobile/src/release/release-config.test.ts`, which is a MOBILE test: vitest's
projects are computed from the Next tree, so it is silently NOT collected —
`No test files found` — while `pnpm --filter mimar test` runs it, 31/31. Nothing
is missing and no fence was skipped; the recipe spans two RUNNERS and the count
does not say so. A reader who runs the command, sees 53, runs vitest and reads 52
has the same doubt the trailing-filter paragraph above exists to remove. Both
runners were used for this lane.

## Appended 2026-08-30 by the integrator — the WU-T + WU-S window

**Both lanes landed. Nothing was left out.** `merge(wu-t)` at `eb9784090` and
`merge(wu-s)` at `a38650d7d`, in that order because the turnos lane's hand-off
asked to be applied after the denuncias lane's entries so the two would not
collide in the same arrays twice. Both reviews came back
*aprobado-con-reservas*; neither carried a RECHAZADO and neither had an open
blocker, which is the only bar this gate applies to a merge.

### The denuncias lane merged with ZERO conflicts, and that is the finding

It was turned back a window earlier on **five content conflicts**. Its second
attempt cherry-picked onto `6671cff99` and resolved all five there, in its own
worktree, one at a time. The result is that `git merge` on this side had nothing
to do: **26 files, no conflict, not one marker.** Conflicts do not have to be
paid for at the merge — they can be paid for earlier, by whoever has the context
to argue them, and this window is the first clean demonstration on this page.

### The turnos lane conflicted in four files, all on ONE axis

Both lanes added a per-IP bucket and a route under `/api/v1` in the same window,
and every pinned number on that surface is derived from those two sets.

| File | What collided | How it was resolved |
|---|---|---|
| `lib/infra/api-v1-limits.ts` | Two bucket entries appended at the same place | Both kept, denuncia above turnos. No argument to settle — the two blocks reason about different families and neither cites the other. |
| `scripts/check-api-v1-envelope.ts` | `MIN_V1_ROUTE_FILES`, 29 vs 30 | **Recounted: 31.** `listV1RouteFiles().length` on the merged tree. |
| `__tests__/api-v1-rate-limit-families.test.ts` | `MIN_IP_BUCKETS` 34 vs 34, and the CGNAT `toBe` 12 444 vs 12 924 | **Recounted: 35 buckets. Re-summed by family: 13 044.** |
| `docs/agents/open-work.md` | Each lane removed a row and rewrote the preamble | Both removals kept; the count rewritten once, by the owner of the renumbering. |

### The three pins, and which two would have loosened in SILENCE

This is the first window on this surface where **both** lanes wrote the
"recount, do not add" instruction and **both** were the other's counter-example.
Each declared 34 buckets for its own worktree and each was right about a tree
the other was about to invalidate.

- `MIN_IP_BUCKETS` — `toBeGreaterThanOrEqual`. Carrying either lane's 34 leaves
  it satisfied, green, and slack by one. **Silent.** Recounted: 35.
- `MIN_V1_ROUTE_FILES` — also a floor, also silent. Each lane said 29 and 30;
  the merged count is 31. Both lanes' arithmetic would also have given 31 this
  time, and that agreement is a coincidence of this merge, not a method: two
  previous windows on this same constant were repaired because somebody added
  instead of counting and was wrong.
- `API_V1_CGNAT_FAMILY_IP_CEILING_PER_MINUTE` — `toBe`, so it is the one that
  goes red on its own. 12 444 and 12 924 both die at the merge; the merged sum,
  hand-checked per family and cross-checked as 12 324 + 120 + 600, is **13 044**.

### What the integrator added under `necesitaDelIntegrador`

The turnos lane could not touch five shared mobile files without re-creating the
exact five-file collision that turned WU-T back once already. It wrote the text
out and handed it over; all five landed here, in `a1599aaef`.

- **Three booking error codes and their es-AR copy** — `booking_slot_taken`,
  `booking_pet_not_bookable`, `booking_already_in_offering`. The fold they
  replace was declared, not discovered, and it cost exactly what a fold costs: a
  person refused a booking read "Este turno ya cambió de estado" about a turno
  they never held. **Two folds survive on purpose and both are named in code**:
  `pet_not_yours`/`pet_deceased` share one code so this door is not an existence
  oracle over erased pets, and `slot_past` still borrows `appointment_past`,
  whose copy ends in "no se puede cancelar" — a fourth code and a fourth string,
  written down rather than quietly kept.
- **`turnos-routes.ts` and `turnos-api.ts` deleted**, their contents moved into
  `src/ui/routes.ts` and `src/api/endpoints.ts`. Each file existed as a declared
  deviation from the one rule its destination exists to enforce — one place the
  route tree is described, one screen that answers "what can this app do to my
  account".
- **Two `Stack.Screen` registrations.** Unregistered, the header comes from the
  path segment, lowercase and English-shaped.
- **`sendAppointmentCommand`'s docblock**, which said "cancel a turno. The one
  command, and the only one" and explained that booking was absent for reasons
  of scope. Booking arrived. The distinction the paragraph was drawing survives
  the correction and is kept: the three writes still missing are missing by RULE.

**One defect was introduced by the move and caught by the mobile suite**, worth
one line because the shape recurs: the reservar test had two separate
`jest.mock` calls, one per source file. Repointing both at one path made the
second silently replace the first, and `fetchBookableOffering` came back
`undefined` — 14 red in one suite. Two `jest.mock`s on one path do not compose.

### Two *serio* findings were FIXED here rather than declared

- **The anonymous branch wrote the reporter's uuid into Vercel's function logs.**
  `enforceRateLimit` throws `UPSERT returned no rows for key
  "welfare_auth:{userId}:hour:{window}"` on its driver-glitch path — a plain
  `Error`, so it lands in the fail-open arm — and `reportError` writes
  `error.message` verbatim. That sink has **none** of the three properties the
  declared `rate_limit_buckets` channel rests on: no RLS, no one-hour TTL, and a
  reader population of anybody with dashboard access. It is also this door's own
  — the web path rethrows and never reports. Closed at the call site
  (`redactCallerId`), and the enumeration that claimed to list "its exact reach"
  now says what it missed and why: it was written carefully, was right about the
  table it was looking at, and did not look at the catch block eight lines down.
- **The harness could not have seen it**, which is why the same commit changed
  the stub. It threw a tidy `"rate_limit_buckets is unavailable"` where
  production throws a message carrying the bucket key. The sweep that asserts the
  uuid appears nowhere in `trace()` — and `trace()` does read `control.errors` —
  passed for free, because there was no id in the string to find. Same defect
  this lane wrote up one file over: *a stub that drops the predicate does not
  fail to test it, it makes the whole file assert that the argument does not
  matter.* The stub now throws production's message and the fail-open case
  asserts both halves — the uuid is gone, the bucket and window are still there.
  Measured: reverting `redactCallerId` to `return message` turns it red.

**One stale header was corrected**, `app/api/v1/welfare-reports/route.ts`. It
said the bucket entry was not in the map, that it was being handed to the
integrator, that two tests were red, and that the ceiling pin stayed green. All
four went false **inside the lane's own branch**, six commits after that file was
last edited, and nothing turned red: prose is not compiled. It cost a reader an
afternoon proving a line was already applied, for the second time on this
surface.

### What was NOT fixed, and why

**The professional's phone on the turno search is the one to read first.** It is
now a debts row and a PO item. It was not stripped in the merge because removing
two columns from a shipped payload is not a merge commit's decision, and because
the reviewer was right that it might be a legitimate product call — what it must
not be is a side effect of reusing a type derived for a turno you already hold.
The other three reserves (the unmeasured `serviceKind` echo whose comment
contradicts its own line, the refusal fence that a new sentence walks past, and
the reservar button's unfenced `disabled`) are debts rows with their mutation
evidence. `booking-race.test.ts` and `booking.test.ts` need real Postgres and
were run here, in the gate, which is the half the lane could not measure.

### The pointer census, which was itself a stale number

`rg -io '\brows? [0-9]+\b'` over this page returned **nine** when it was written
into the ratification paragraph and returns **twenty-six** now. Every one was
read. The audit's actual yield was three live mis-pointers, all repaired: the
sentence still claiming "five rows — 1, 2, 4, 5, 6", the italic correcting it to
four (true of one lane's worktree, false of `main` before the day was out), and
"Row 2 above asked to be resized M, not L" pointing at a row no longer above.

**The table holds THREE rows — 1, 4 and 6.** The numbering stays open, for the
third consecutive window and for the same reason: the row-3 pointers live in the
`Attempted and turned back` table this page forbids editing.

**A count in prose has now rotted four times on this page, and the fourth time it
rotted while being repaired** — by a careful lane that ran the audit first, wrote
"four", and was made wrong by a sibling lane in the same window. That is not a
discipline problem and one more careful reader will not fix it. The number is
stated once, in bold, in the preamble; everything else names the capability.

### The gate went red on the second run, and the red is NOT one of the three

`pnpm verify` exit 0. `pnpm test:verified` **twice over one tree**: run 1
`reported 1473 file(s); 1473 discovered; 0 failing test(s); 0 broken file(s)`,
run 2 `1473 / 1473 / 1 failing test(s) / 0 broken file(s)`. **No `Worker exited
unexpectedly` in either run**, and no broken file — so this is not the teardown
crash, not the collection-error signature, and not the worker-dies-mid-file one.
`/CLAUDE.md` names three red signatures and three rules; **this is a fourth, and
none of the three rules covers it.** It was not re-run, because that is the
re-roll that file forbids.

**It was diagnosed instead**, and the diagnosis is a debts row above with its
evidence. The short version: the assertion compares a `new Date()` taken in Node
against a `performed_at` column defaulted from Postgres's `now()` inside a
container, and the 100 ms sleep it leans on is justified by a comment ("Fire-
and-forget; give the insert a tick to land") that the code it tests contradicts
in writing. A baseline control at `6671cff99` was run **twice**, per the rule
that one clean control just resets the coin, and came back clean both times —
which narrows attribution without settling it, and is recorded that way.

**CORRECTED 2026-08-30 by the integrator of the next window. The diagnosis above
is no longer open: it was verified, found INCOMPLETE, and closed.** The
`reloj-omnibox` lane confirmed the two-clock reading independently and then found
that it was two tests across three files rather than one, failing in opposite
directions — the omnibox assertion missing a row that existed, and two
`audit_log` windows in `org-memberships` / `org-invitations` admitting rows from
an earlier run. Both directions were measured, the fix is applied, and it is
proved by three applied mutations plus a ±5-minute host-clock control. **The
sentence about the control at `6671cff99` stays valid and is not withdrawn**:
two clean control runs narrowed attribution without settling it, and settling it
took a root cause, not another sample. The debts row above is struck; the
capability write-up is the lane block at the end of this page. What remains
unproven is the same thing that was unproven then — that this was the ONLY
source of nondeterminism — and the gate at the end of THIS page's last block is
the measurement that speaks to it.

**So the Definition of Done was not met by the letter on this tree, and the next
reader should know that before trusting the merge rather than after.** What the
merge itself is standing on: `pnpm verify` green including the build, the mobile
Jest suite at 58 suites / 916 tests, both typechecks clean, `biome check` clean
but for the one pre-existing warning this page already lists, and one fully
green `test:verified`.

The verdict lines above are quoted anyway, against the WU-U block's precedent of
omitting them — because that precedent exists to avoid describing a tree the
gate did not run on, and a RED has to be written down where the next reader
looks even at the cost of a doc commit landing on top of it. The only commits
after the gated tree are this section and its debts row.

## Appended 2026-08-30 by lane wf_02ec3f2f-339-1

### The fifth red signature is closed — the omnibox PII test compared two clocks

**The debts row "`omnibox-search.test.ts` compares a NODE clock against a
POSTGRES clock" is DONE and wants striking by the integrator**, along with the
sentence in "The gate went red on the second run" that calls the diagnosis
unfinished. This block does not edit either: the board is append-only within a
window and striking a row is the integrator's call.

**The diagnosis on that row was right, and it was verified here rather than
inherited.** `db/schema.ts:2613` declares `performed_at` as
`timestamp(...).notNull().defaultNow()`, and `logPiiQueryForAuthority` supplies
no value for it — so the column is Postgres's `now()` inside the Docker
container, while `const since = new Date()` is the host's. Two clocks, no reason
to agree.

**It was also incomplete in one way that matters: the defect was in TWO tests,
not one, and they fail in OPPOSITE directions.** Measured on this tree by
simulating each drift direction rather than waiting for one:

- Postgres 200 ms **behind** the host → `writes a single pii_queried audit row`
  fails `expected +0 to be 1`. That is byte for byte the failure the gate saw.
- Postgres 200 ms **ahead** → `does not log or query for a query shorter than 2
  chars` fails `expected 1 to be +0`, because the FIRST test's row then sits
  past the second test's `since`. A negative assertion that leaks is the worse
  half: it goes red on a tree where nothing is wrong.

#### What it decided

- **The window was not replaced in `omnibox-search.test.ts`. It was removed.**
  `govtUserId` is a fresh `randomUUID()` per run, so the ACTOR already isolated
  this run's rows and the timestamp was redundant scaffolding that imported a
  second clock for nothing. Keying on the actor is **strictly stronger** than
  the window it replaces — it also catches a row written with a timestamp the
  window would have missed — so this is a tightening, not the loosening the
  brief warned against. The negative test counts rows before and after the call
  instead of filtering by time, which says "the short query added none" without
  depending on either clock **or on test order**.
- **`performed_at` stays covered**, on the one property no drift can move: the
  row carries a timestamp at all (`toBeInstanceOf(Date)`). Asserting WHEN is
  what was unsound; asserting THAT is free.
- **The two sleeps are deleted and so is the sentence under them.** The comment
  read "Fire-and-forget; give the insert a tick to land" over a use-case that
  AWAITS the write and argues in writing that it must not be fire-and-forget
  ("under Ley 25.326 the access audit must be durable",
  `search-omnibox.ts:29-33`). The row is committed before the action resolves;
  the sleep was 150 ms of dead wait per run and the file got faster without it
  (2.62s → 1.33s).

#### Two more files had the same defect, and there the window IS load-bearing

Swept with `rg '\b(gte|gt|lte|lt)\((\w+)\.(<the 20 defaultNow columns>)'` over
every `*.test.ts*` in the tree, the column list derived from `defaultNow()` in
`db/schema.ts` rather than guessed. Four files match. Two use 365- and 730-day
windows (`macro-invariants`, `pf1-consolidation-parity`) and are immune to
millisecond drift — and the second is a parity comparison, so any window applies
to both sides equally. **The other two had it exactly**:
`org-memberships.test.ts` (`testStart`, seven assertions) and
`org-invitations.test.ts` (`acceptStart`).

**These were fixed the other way, and the difference is the point.** Their
window carries real weight: `audit_log` is append-only (a trigger blocks
DELETE), the org and member ids are reused, and four of the seven cases assert
the same `(org, member, action)` triple — only the timestamp separates them. So
the fix changes WHICH CLOCK the bound comes from, not whether the bound exists:
`__tests__/_helpers/db-now.ts` returns Postgres's `now()`, putting both sides of
the comparison on one clock. **A tolerance was rejected**: it is a guess about
how far two clocks may drift, there is no honest value for it, and any value
large enough to be safe is large enough to stop excluding what the window exists
to exclude.

There is no raw-SQL variant of this defect anywhere in the tree — searched
separately, since a `sql` template interpolating a JS Date would not match the
drizzle-operator sweep.

#### The mutations, all applied rather than predicted

| Mutation | Result |
|---|---|
| Remove the `await logPiiQueryForAuthority(...)` from `search-omnibox.ts` | RED, `expected +0 to be 1` |
| Log twice instead of once | RED, `expected 2 to be 1` — the "single" in the test name is real |
| Log on the `< MIN_QUERY_LENGTH` branch | RED **only** on the negative test, `expected 2 to be 1` |
| `dbNow()` returns epoch | **7 RED** in `org-memberships` (`expected 4 to be 1`, `expected 5 to be 1`, four `expected 2 to be 1`, one `expected true to be false`) — the window still bites |

**The control that makes the fix's claim falsifiable**: with Node's `Date.now`
offset by **±5 minutes** — 1500× the 200 ms that broke the old version — the
file is **19/19 green in both directions**. The old version died at 200 ms. You
cannot be sensitive to a clock you never read.

**One mutation did NOT go red and is reported rather than buried**: `dbNow()`
returning epoch leaves `org-invitations` green, because within a single run
nothing else writes its triple. That change is DEFENSIVE — but the table is
never cleaned, so between runs the previous run's row is exactly what its window
has to exclude, and the host clock was the wrong instrument for that either way.

**CORRECTED AT THE MERGE — the paragraph above understates its own change, and
an understatement is a defect of evidence like any other.** The reviewer showed
the instrument was the wrong one, not the change: `dbNow()` returning epoch
WIDENS the window, and the defect being fixed NARROWS it, so widening it cannot
turn the assertion red. The mutation that answers the question is a host-clock
skew, and it was applied: on the OLD tree (`40c42d5c4`) with Node's clock pushed
**+200 ms**, `acceptInvitationAction > happy path` in `org-invitations.test.ts`
goes RED with `expected +0 to be 1`, alongside the other eight. **So the
`org-invitations` change is load-bearing and proved, not speculative** — and the
line was worth correcting because "not proved" left on this page is how the next
lane re-opens a closed row as debt.

#### What was measured

- **The 53 tree-sweeping fences, enumerated over the WHOLE tree** with the
  command this page prescribes: **52 vitest files / 1131 tests green**, plus the
  53rd (`apps/mobile/src/release/release-config.test.ts`) under **Jest, 31/31**.
  Both numbers match what this page already records, which is the point of
  quoting them.
- **The whole `lint:*` chain, all 66, each run separately: 64 measured and
  green.** `lint:route-weight` and `lint:csp-prerender` are declared **NOT
  MEASURED** — both self-skip without a build and exit **0** while saying so
  ("NO SE MIDIÓ NADA", "This run proved nothing about the CSP").
- **Blast radius** — every test file naming `omnibox`, `auditLog`, `audit_log`,
  `pii_queried` or `logPiiQuery`: **121 files / 1660 tests green**.
- **`tsc --noEmit` clean**; `biome check` clean over the four touched files.
- **`pnpm verify` and `pnpm test:verified` were NOT run** — the local Supabase is
  shared with a parallel lane and the brief forbids it. Named rather than
  implied, per this page's own standing instruction.

**What this lane cannot claim**: that the gate will now be deterministic. It
removes one proven source of nondeterminism and proves that one is gone; whether
it was the ONLY one is not settled by anything measured here. The control at
`6671cff99` came back clean twice, which the previous window already recorded as
narrowing attribution without closing it, and that remains the honest reading.

## Appended 2026-08-30 by lane wf_02ec3f2f-339-2

### WU-P — mudanza y devolución, dos de las cinco — LANDED 2026-08-30

**Row 6 stays on the table, narrowed.** WU-P named five capabilities —
rehoming, foster, return, relocation, org memberships — and two of them now work
from the phone:

- **RELOCALIZACIÓN (mudanza)**: `POST /api/v1/pets/{publicToken}/move` over
  `recordJurisdictionMove`, and `apps/mobile/src/custody/MudanzaScreen` behind
  `/mascotas/{token}/mudanza`, reached from a "Localidad" row inside EDITAR —
  which is exactly where the web puts its own entry point.
- **DEVOLUCIÓN (return)**: `GET|POST /api/v1/pets/{publicToken}/return` with
  three commands (`accept_return`, `reject_return`, `propose_return`) over the
  three use-cases `/mis-mascotas/{token}/devolucion` already drives, and
  `apps/mobile/src/custody/DevolucionScreen` behind
  `/mascotas/{token}/devolucion`, reached from the "⋯ Más" list.

**Both routes are registered in `apps/mobile/app/_layout.tsx`** — that file was
this lane's territory in this window — with titles TRANSCRIBED from the web's own
`<h1>` and the screens' own `<Title>`, never invented, which is the condition the
integrator set when it closed `/reclamar`'s registration.

**RE-HOGAR, TRÁNSITO AND ORG MEMBERSHIPS ARE NOT DONE**, and they are returned
rather than half-built — see "What it did NOT solve" below. Three of five open is
a row that stays on the table.

#### What it decided

- **THE MOVE GUARD IS NOT A COPY OF THE WEB'S — IT IS THE WEB'S GUARD'S OWN TWO
  HALVES.** `recordMoveAction` gates on `requireTitularAccess`, which is a
  cookie-session guard a bearer door cannot call. What it decomposes into can be:
  `resolvePetHolderAccess` (extracted precisely so "a second door can enforce the
  SAME rule BY CONSTRUCTION rather than by resemblance") followed by
  `isTitularHolder`, which is the predicate `requireTitularAccess` ITSELF calls.
  So the two doors cannot drift into disagreeing about who a titular is. What
  that admits is said out loud in the route: a co-owner passes, a FOSTER passes,
  the ORG path passes, and the only refusal is a person-path caretaker — the deny
  shape `isTitularHolder`'s docblock argues for. It does NOT check `deceased`,
  because `recordMoveAction` uses `requireTitularAccess` and not
  `requireAlivePetAccess`: a phone that refused what the browser allows is not
  parity either.
- **THE 2026-08-18 DESEMPATE WAS OPEN IN THE RETURN WRITER AND IS NOW CLOSED.**
  `adoption-public-reads.ts` carries a paragraph about the scar: a `.limit(1)`
  with no `ORDER BY` picked an ARBITRARY ownership row for a pet transferred
  between orgs and, in the wild, picked the ORIGINAL shelter's ENDED row, so the
  public ficha credited a refuge that no longer answered for the animal.
  `ownerProposeReturnToOrgUseCase` had the same shape in TWO branches (and
  `.../devolucion/page.tsx` has a third copy), deciding WHICH ORGANISATION is
  asked to take an animal back. Both writer copies moved into
  `resolveReturnTargetOrg`, which the writer now calls, with
  `orderBy(desc(ownerships.startedAt))`. Extracting from the INSIDE of a use-case
  changes no entry point and no e2e surface, which is why this is a shared
  implementation rather than the declared-two-copies arrangement `bookSlotAction`
  settled for. **Fenced on COMPILED SQL by equality** (`PgDialect().sqlToQuery()`),
  never `toContain`, and both the delete-the-ORDER-BY and the flip-to-`asc`
  mutations were applied and are red.
- **THE WEB'S DEVOLUCIÓN PAGE HAS A DEFECT AND THIS DOOR DOES NOT COPY IT.**
  That page renders the acceptance card whenever `hasPendingProposal` is true,
  without checking the proposal is ADDRESSED to the viewer — so an owner whose
  OWN outgoing proposal to a shelter is in flight is shown "Aceptar" and
  "Rechazar", and `ownerAcceptReturnUseCase` refuses both with "Esta propuesta no
  está dirigida a vos." A control that can only be refused. Here that case is its
  own state (`awaiting_org`) with all three capabilities false. **Reported, not
  fixed on the web**: that page is a browser-facing surface with its own e2e gate.
- **`capabilities` AND `state.kind` ARE TWO DIFFERENT QUESTIONS, and the screen
  reads the first.** The read and the write share ONE derivation
  (`petReturnCapabilities`), so a client can never be offered a control the POST
  refuses — the arrangement `pets/{token}/profile` uses. The screen test pins it
  in BOTH directions: a capability true draws its control, and a capability false
  draws none EVEN WHEN THE STATE LOOKS LIKE IT SHOULD, which is the half a screen
  reading `kind` fails.
- **THE RETURN REFUSALS DO NOT FOLD ONTO 403.** 403 is a fact about the CALLER
  (`not_titular`, `not_the_adopter`); 409 is a fact about the animal's situation
  (`return_no_proposal`, `return_already_pending`, `return_no_source_org`).
  Collapsing them would tell somebody they lack a permission when what actually
  happened is that the proposal they were answering had already been cancelled —
  and they would go looking for the permission.
- **`autoCancelled` IS ON THE WIRE WITH ITS SENTENCE.**
  `ownerAcceptReturnUseCase` has a SUCCESS arm in which the animal did not come
  back: preconditions failed, so it appends `custody_transfer_cancelled` instead
  of transferring. The ack carries the flag and the server's own es-AR reason —
  the one place on this surface where a sentence crosses the wire on purpose,
  because the four `autoCancelBody` messages are already copy the web renders
  verbatim — and the screen paints it in the ERROR tone. A green "Listo" there
  would tell somebody their pet is home.
- **THE MOVE'S NO-OP IS COMPUTED, NOT PATTERN-MATCHED.** `recordMoveAction` reads
  the writer's failure as `result.error.includes("no-op") || .includes("differ")`,
  a match on the text of a Zod message. `recordJurisdictionMove` makes the three
  equality comparisons `movementJurisdictionChanged`'s `superRefine` makes,
  against the CANONICALIZED destination, before the writer is called — same rule,
  no prose in the path, and a no-op costs no transaction.
- **BOTH FAILURE ARMS ARE TYPED** (`MoveFailureCode`, `resolveReturnTargetOrg`'s
  codes), the shape `ClaimFailureCode` and `AmendEventFailureCode` already are.
  The web reads `result.error` and is unaffected; the two role-specific refusal
  SENTENCES stay byte-for-byte at the writer, because they are copy a person
  reads.
- **THE MOVE ACK CARRIES THE CANONICAL PAIR, not the posted one.** The
  destination is resolved against the INDEC catalog in `strict` mode before it is
  stored, so `AR-R`/`bariloche` comes back as `Río Negro`/`San Carlos de
  Bariloche`. A screen that echoed the request would confirm a registration in
  words that are not on the record.
- **ART. 16 IS THE RESOLVER'S AND NEITHER DOOR OPENS A SECOND READ OF `pets`.**
  `resolvePetHolderAccess` filters `isNull(pets.deletedAt)` on both paths, so an
  erased animal answers `{ kind: "none" }` and both doors 404 it exactly as they
  404 a stranger's token. **Neither door spells `unerasedPetByToken` or
  `publicPetByToken`**, so neither is a new entry in the two census fences —
  checked, not assumed: `public-token-throttle-coverage` and
  `content-report-read-coverage` are green.
- **BOTH DOORS ARE `authenticated-write` AND BOTH CHOICES REJECT A NEIGHBOUR.**
  The move is NOT `pet-record-write` (whose anchor is "a vet day at a rescue is
  many animals from one egress in one afternoon"; a person moves house) and NOT
  `pet-disclosure-write` (a move publishes nothing new — the locality was already
  on the public credential). The return's write JOINS the family `/me/transfers`
  derived, because it is the same act: "a change of who owns an animal in the
  national registry".
- **THE MOBILE ENTRY POINTS ARE THE WEB'S, except one that is deliberately
  WIDER.** Mudanza is reached from EDITAR, mirroring `PetForm.tsx`'s locked
  "Localidad" row and its "Registrar mudanza" link. Devolución's "⋯ Más" row is
  UNCONDITIONAL, and that is declared: `deriveMasSheetItems` adds its row only
  when a proposal is already pending, so the INITIATION mode of the web's own page
  — proposing a return to the shelter that placed or fostered the animal — is
  reachable from no browser navigation at all. The capability exists in the server
  and in the page; what is missing there is the link.

#### What it did NOT solve

- **RE-HOGAR (the titular's "acompañamiento de adopción") is not built.** It is
  the largest of the three remaining and the one closest to a live tester: an org
  picker over `organizationCoverage` narrowed by `coverageAreaCoversZone`, three
  states (none / pending / active) and three writers
  (`requestRehomeSponsorship`, `withdrawRehomeRequest`,
  `withdrawRehomeSponsorship`). **Start here.** Two things a reader should know
  before opening it: `buscar-hogar/page.tsx` serves TWO different people on one
  route (a `foster` asking an org to find a permanent home, and a `titular`
  asking for adoption accompaniment) and "the two never share an authorization
  check (spec §3, REQ-14)"; and `findCoveringOrgs` deliberately does NOT decide
  the zone half — `coverageAreaCoversZone`, the predicate the request use-case
  refuses on, is the single rule, "so a POST straight at the action cannot
  address an org this page would never have listed". Any bearer door must call
  that same predicate rather than re-deriving a coverage query.
- **TRÁNSITO (foster) is not built, and most of it is not a citizen surface.**
  `src/modules/foster` has fourteen use-cases and the great majority are the
  ORG's: proposing, assigning, expiring, allowing a co-foster. What a citizen
  reaches is `upsertFosterVolunteer` (offering yourself as a transit home),
  `acceptFosterProposal` / `rejectFosterProposal` / `withdrawFosterVolunteer`, and
  `endFoster`. That is a real slice and it is a different SHAPE from this lane's
  two — a `/me`-scoped inbox rather than a pet-scoped door, because a proposal
  arrives about an animal the person does not yet hold.
- **ORG MEMBERSHIPS is untouched and is the right thing to leave for last**, for
  the reason WU-U recorded about `/adopciones`: this app has no organisation
  screens at all, and a citizen wallet that could manage a membership would be the
  first. It is also the furthest from anything a tester on the internal track can
  reach.
- **`recordMoveAction` IS NOT MIGRATED ONTO `recordJurisdictionMove`.** It is a
  `"use server"` entry point the browser drives, so one rule has two thin copies
  — declared, with the citation in the module header. The identical arrangement
  `list-appointments-for-user.ts` and `bookSlotAction` record, for the identical
  reason. What is duplicated is which arguments to pass: both call
  `normalizeLocationForWrite(…, { locality: "strict" })` and both call
  `recordMovementWriter`.
- **`.../devolucion/page.tsx` STILL HAS A THIRD COPY of the custody lookup**, and
  it is still unordered. The two WRITER copies moved into
  `resolveReturnTargetOrg`; the page's own foster-branch query did not, because
  editing that page is a browser-facing change with its own e2e gate
  (`e2e/rehome-by-titular.spec.ts` is in the same territory). So the page and the
  writer can still name different organisations for a pet with two open
  `shelter_custody` rows — which the invariant says cannot exist, and which is
  exactly what the 2026-08-18 scar was.
- **THE WEB'S DEVOLUCIÓN PAGE RESOLVES ITS ACCESS ROW WITH AN UNORDERED
  `.limit(1)`**, so a person who holds one animal as BOTH owner and foster gets a
  random role and therefore a random branch of that page. It is the same class as
  the `resolvePetHolderAccess` `.limit(1)` that was fixed when the role became
  load-bearing ("harmless while the result was role-agnostic, a coin flip the
  moment `role` became load-bearing"). The bearer door avoids it by construction —
  that resolver ranks owner before co_owner before foster before caretaker — so
  this is reported about the WEB, not carried.
- **`actorCancelProposalAction` HAS NO NATIVE SURFACE and that is copied, not
  omitted.** Withdrawing your own outgoing return proposal is reachable from the
  web's ORG side and from no owner-facing page, so `awaiting_org` carries no
  capability rather than a `canCancel: false` that would read like a rule.
- **NO `proposedAt` FIELD on the propose command.** The web's form offers a date
  input defaulting to today; there is no reader that treats `proposed_at` as
  anything but "when this was proposed", so a phone offering to back-date one
  would be offering a way to describe a conversation as having happened when it
  did not. The server stamps its own clock. Written into the contract.
- **The two doors are STRICTLY TIGHTER than the browser on rate limits and on
  DEACTIVATED accounts.** The web has no limiter on `recordMoveAction` or on any
  of the three return actions — all bare server actions behind
  `requireUserOrRedirect`, which passes a deactivated account on purpose. Both
  gaps are the WEB'S; closing either means editing actions the browser also uses.
  Tighter is the safe direction and both are pinned by tests so they stay
  decisions rather than becoming drift.

#### One false green found in this lane's OWN fences, and one left standing

`record-jurisdiction-move.test.ts` injected a clock of `2026-08-30` — the day the
file was written. The mutation its `effective_date` case exists to catch,
replacing the injected `now` with a second `new Date()`, left the file **14/14
GREEN**, because the host clock produced the same string. That is
`turnos-view-model.test.ts`'s timezone false-green one domain over. The clock is
now a date in the past, which no host clock can agree with, and the note is in the
file.

A SECOND one was found and is written into the test rather than edited away,
because the honest fix was a new case: `MudanzaScreen.test.tsx`'s "posts NOTHING
when no destination was picked" fences the button's `disabled` and NOT
`buildMove` — with the button disabled, `submit` is never reached, so deleting the
`return` after the local validation's refusal leaves the suite green. The header
said the opposite. A case that DOES reach `submit` (a reason past the cap, with a
destination picked) was added and the mutation is red there. Same shape as the
declared debt on the reservar screen's `disabled`, in mirror image: there the
affordance was unfenced, here it was the only thing fenced while the comment
claimed the rule was.

#### What was measured

- **The 53 tree-sweeping vitest fences, enumerated over the WHOLE tree** with
  `rg -l 'readdirSync|globSync|discoverTestFiles' --glob '*.test.ts*' --glob
  '!node_modules' .` — 53 files. **52 under vitest: 52 files / 1131 tests green**,
  run twice (once over the mudanza tree, once over the return tree). The 53rd,
  `apps/mobile/src/release/release-config.test.ts`, is a mobile JEST test vitest
  does not collect; run under Jest, **31/31 green**.
- **The whole `lint:*` chain, all 66, each run separately: 64 MEASURED AND
  GREEN.** (**The block first said "all 67 … 65 measured" and that was wrong; the
  integrator recounted it from `package.json` on the merged tree — 66 in the root
  and zero in `apps/mobile` or `packages/contract`.** The 67 was inherited from a
  sentence higher up this page rather than minted here, and the merge found where
  it originally comes from: **`lint:ci-parity` prints "all 67 gate(s) in
  `verify`", and that is a true number about a DIFFERENT set.** `verify` chains
  **70** `&&`-separated terms — the 66 `lint:*` scripts (every one of them, none
  left out) plus `typecheck`, `verify:mobile`, `lint` (biome) and `build`. So 67
  was never rot; it was a correct count of gates transplanted into a sentence
  about lint scripts, which is the same accident as the hourly figure this repo
  once put in a per-minute slot. The stale copy sits inside `Attempted and turned
  back`, which this page forbids editing, and is left standing there.) `lint:route-weight` and
  `lint:csp-prerender` are declared **NOT MEASURED**, not counted green — both
  self-skip without a build and exit 0 while saying so in words ("NO SE MIDIÓ
  NADA", "This run proved nothing about the CSP"). Verified by running each on
  its own and reading its output.
- **The whole `unit` vitest project**: 646 files, 9396 passed, 3 skipped.
- **Targeted blast radius**: every `__tests__/api-v1-*`, the redaction and
  public-token census fences, the soft-delete and content-report sweeps, and the
  notification fences — **59 files / 1407 tests green**; plus `packages/contract`,
  `src/modules/pets`, `src/modules/return-to-owner` and
  `__tests__/return-to-owner.test.ts` — **33 files / 474 tests green**.
- **Mobile Jest, the whole suite**: 62 suites / 978 tests green. **Both
  typechecks clean** (`tsc --noEmit` at the root and `pnpm --filter mimar
  typecheck`), and `biome check` clean over `apps/mobile`, `packages/contract`,
  `src` and `app`.
- **Mutations: 68 applied and RED.** The per-file tally below was RECOUNTED from
  the run log after this block was first written, and the first figure in it was
  wrong in five of its seven terms — a count written from memory a few minutes
  after the fact, which is this page's own lesson arriving inside the paragraph
  that reports it. Recounted: 13 on `recordJurisdictionMove`, 10 on the move
  route, 7 on `resolveReturnTargetOrg` (including both ORDER-BY ones), 6 on
  `readPetReturnState` (including the one that reproduces the web page's defect),
  8 on the return route, 11 on the mobile mudanza pair, 13 on the mobile
  devolución pair. **Two more were applied and came back GREEN**; both are written
  up under "One false green" above — one fixed, one closed with a new case.
- **The three pins RECOUNTED from the tree, never incremented**:
  `Object.keys(API_V1_IP_BUCKET_FAMILIES).length` → **38**,
  `listV1RouteFiles().length` → **33**, and the CGNAT ceiling **13.884/min**,
  hand-summed per family (18×600 + 10×120 + 2×60 + 1×600 + 1×240 + 2×180 + 1×240
  + 1×120 + 1×144 + 1×60) as well as read off the `reduce`. **Whoever merges this
  alongside another lane must RECOUNT rather than add 720**: these are right for a
  tree carrying this lane's two doors and no others.
- **`pnpm verify` and `pnpm test:verified` were NOT run** — the local Supabase is
  shared with a parallel lane and the brief forbids it. The full suite is the
  integrator's gate. Named rather than implied, because that is precisely the gap
  that sank an earlier lane on this page.

## Appended 2026-08-30 by the integrator — the reloj-omnibox + WU-P window

**Both lanes merged. Nothing was turned back, so `Attempted and turned back`
above is unchanged and that is a statement, not an omission.** `reloj-omnibox`
came back *aprobado* with five minor findings; `wu-p-custodia` came back
*aprobado-con-reservas* with one **serio** the reviewer itself scoped as
non-blocking (wrong screen, not wrong custody — the three use-cases re-check
`to_user_id` under `pg_advisory_xact_lock`) and five minor. Neither carried a
RECHAZADO or an open blocker, which is the only bar this step applies.

### The merge: one conflict, and it was the one both lanes predicted

`git merge --no-ff` twice onto `40c42d5c4`. The first lane merged clean. The
second conflicted in **exactly one file — `docs/agents/open-work.md`** — because
both lanes append their block at the end of it, which both said in advance.
Resolved by keeping BOTH blocks in lane order and deleting only the three
markers; verified afterwards with `git diff --stat 40c42d5c4 -- docs/agents/open-work.md`
→ **380 insertions, 0 deletions**, so the append-only property survived the
resolution rather than being asserted about it.

**Zero conflicts in code.** The file sets are disjoint: the clock lane touched
four test files (one of them new) and this page; the custody lane touched 40
files and this page, and had verified in advance that `__tests__/omnibox-search.test.ts`
was not among them. The additive-at-the-end discipline the WU-T window recorded
held again — `lib/infra/api-v1-limits.ts`, `packages/contract/src/api/errors.ts`,
`apps/mobile/app/_layout.tsx` all took their new entries at the tail of their
lists and no other lane wrote there.

### The renumbering call: RE-RATIFIED, after re-running the audit

**The table still holds THREE rows and they are still numbered 1, 4 and 6.** The
integrator owns this call and it is taken once per window, not inherited: the
audit is `rg -io '\brows? [0-9]+\b'` over this file, re-run on the merged tree
after every edit in this window. Every match was read.

**This block deliberately writes NO total, and the reason is a finding.** The
previous two windows each wrote the census figure into this page, and each
figure was stale within a day. It is worse than stale: **the census counts
matches in this file, and a paragraph reporting the census is itself in this
file, so writing the number down changes the number.** Drafting the sentence
above with a figure in it moved the count twice while it was being written. The
audit is a command, it takes a second, and the page already says it in an italic
nobody has been able to obey — *stop writing the number in more than one place.*
This block obeys it.

What the audit yields does not need a total, because the argument rides on
LOCATIONS: the pointers that say "row 3" and mean **adopción** are the two WU-U
attempt rows inside `Attempted and turned back`, and "Row 3 is off the table" in
the WU-U landed block. **Closing the gap would repoint all three at WU-V, and two
of the three sit inside the one table this page forbids editing** — so it would
either falsify true sentences or force an edit into protected prose. Everything
else the audit returns is either this preamble arguing about those pointers, or a
dated write-up where the number is true of the table as it stood on a named day.
**Nothing points a LIVE instruction at a row that moved.** These numbers are
identifiers, not an ordering; **quote the count of rows, never the highest
number.**

### The three pins, RE-DERIVED on the merged tree — and why adding would have worked by luck

The custody lane bumped all three on a tree carrying its two doors and no
others, and said in writing that a merger must recount rather than add. Recounted
here from the merged tree, not from arithmetic on the lane's figures:

| Pin | Re-derived | How |
|---|---|---|
| `MIN_IP_BUCKETS` | **38**, and `Object.keys(API_V1_IP_BUCKET_FAMILIES).length` is **38** | the map on the merged tree, not `35 + 3` |
| `MIN_V1_ROUTE_FILES` | **33**, and `listV1RouteFiles().length` is **33** | the glob on the merged tree, not `31 + 2` |
| `API_V1_CGNAT_FAMILY_IP_CEILING_PER_MINUTE` | **13.884/min**, and the test pins `toBe(13_884)` | hand-summed per family, below |

The CGNAT arithmetic, done from the family tally and the per-family
`maxPerMinute` read out of `lib/infra/api-v1-limits.ts` **by hand** rather than
off the `reduce` that computes the constant — because a computed value agreeing
with itself is not evidence:

`18×600 + 10×120 + 2×60 + 1×600 + 1×240 + 2×180 + 1×240 + 1×120 + 1×144 + 1×60`
= `10.800 + 1.200 + 120 + 600 + 240 + 360 + 240 + 120 + 144 + 60` = **13.884**.

The tally is 18 `authenticated-read` (600), 10 `authenticated-write` (120), 2
`account-security` (60), 1 `public-reference` (600), 1 `inbox-state` (240), 2
`pet-disclosure-write` (180), 1 `pet-record-write` (240), 1 `pet-registration`
(120), 1 `media-upload` (144), 1 `adoption-application` (60) — **38 buckets**,
which is the same number the floor pins, arrived at from the other side.

**All three floors sit EXACTLY on the measured value, with no slack.** That is
the outcome the last window did not get: two of its pins were loose by one and
nothing went red, because each lane measured correctly on its own tree and both
were stale after the merge. Here only one lane added routes and buckets, so its
figures survived — but they were recounted rather than trusted, which is the
whole point, and `lint:authz` on the merged tree reports **82 route handlers
authorized** (13 intentionally public), not the 81 the lane's own report carried
from a mid-lane reading.

### What was done under `necesitaDelIntegrador`

**From the clock lane, all four of its asks:**

1. **The omnibox debts row is STRUCK** and points at that lane's block. Its
   sizing was corrected in the strike rather than dropped: the row said "small —
   owner: the next lane in that file" and the defect was two tests across three
   files in opposite directions. A row that names one file is a hypothesis about
   blast radius.
2. **"The gate went red on the second run" is CORRECTED in place**, not deleted.
   The sentence the lane asked to keep — two clean control runs at `6671cff99`
   narrow attribution without settling it — is kept and explicitly not withdrawn.
3. **The fifth signature DID go into `/CLAUDE.md`**, and not as a fourth
   signature. The entry says what the lane proposed: this red was a **defect in a
   test**, it is closed, and the general rule is that **no assertion compares a
   clock read on the host against a column with `defaultNow()`** — take the
   instant from the database or drop the window, never widen it with a tolerance.
   Writing it as "a fourth signature with a fourth rule" would have taught the
   next reader to tolerate a red that has a root cause and a fix.
4. **The gate ran.** Verdicts at the end of this block.

**From the custody lane:** the recount, above. It asked for nothing else and
was right that it needed nothing else — every file it touched was its own
declared territory.

### Three claims inside the lanes' own blocks were corrected at the merge

This page's recurring failure is a number or a claim that was true when written
and false when read. Three were caught here and fixed in place, each marked as a
correction rather than silently overwritten:

- **"all 67 `lint:*` … 65 measured"** → **66 and 64.** Recounted from
  `package.json` on the merged tree: 66 in the root, zero in `apps/mobile` and
  zero in `packages/contract`. **And the 67 turned out not to be rot at all** —
  `lint:ci-parity` prints "all 67 gate(s) in `verify`", a true count of a
  different set. `verify` chains 70 terms: the 66 `lint:*` plus `typecheck`,
  `verify:mobile`, `lint` and `build`. A correct number about one set, moved into
  a sentence about another, is a shape this repo has been bitten by before. The
  stale copy sits inside `Attempted and turned back` and is left standing.
- **"One mutation did NOT go red"** about `org-invitations.test.ts` → it is
  **load-bearing and proved.** The lane picked an instrument that could not
  answer: `dbNow()` returning epoch WIDENS the window and the defect NARROWS it.
  The mutation that answers is host-clock skew, and at **+200 ms** on the OLD
  tree `acceptInvitationAction > happy path` goes red with `expected +0 to be 1`.
  A lane understating its own evidence is a defect of evidence: left as written,
  the next lane reopens a closed row as debt.
- **"20 columns with `defaultNow()`"**, from the review that asked for a fence →
  **77 column definitions over 20 distinct NAMES.** The 20 is a count of names.
  A sweeper keyed on the wrong one of those two numbers scans the wrong set.

### What was NOT fixed, and why

Two review findings became **declared debts with owners** in the table above
rather than merge-commit patches — the absent fence for the two-clock rule, and
the `read-return-state.test.ts` stub whose `.where()` and `.orderBy()` discard
their arguments. Both were re-verified here rather than inherited: the stub was
read on the merged tree and it does `return self` on both. A fence needs its own
mutation proof and its own gate; an integrator writing one inside a merge commit
is how an unproved fence enters the tree.

Three further minor findings are recorded here and NOT patched, because they are
each inside a lane's declared territory and none of them changes behaviour:

- **`packages/contract/src/api/errors.ts`** — the docblock says the return set is
  "FOUR" and then lists **five** bullets. The array and the es-AR copy both carry
  five; the sentence is the thing that is wrong, and it contradicts a correct
  "Four codes" for `move` two paragraphs above it.
- **`apps/mobile/app/_layout.tsx`** — the MUDANZA block claims the title was
  transcribed from the web's `<h1>`. It was not: the web renders
  `Mudanza de ${pet.name}` and the registered title is the new string
  "Registrar una mudanza". The title is good; the claim about its provenance is
  what is false. The DEVOLUCIÓN block's equivalent claim does hold.
- **`__tests__/_helpers/db-now.ts`** — `as Array<{ now: Date | string }>` is
  correct for postgres-js and would fail at RUNTIME, not at compile time, under a
  driver that returns `{ rows: [...] }`. It is a type assertion at the one point
  both surviving windows depend on.

Also noted and not chased: **`docs/agents/collaborating-writer.md` calls
`/CLAUDE.md` "86 lines"** and it is not, in either direction — before this
window's edit or after it. That page is nobody's territory this window.

### Two environment facts, verified before the gate rather than after

- **The live database functions are RESTORED.** A previous window mutated
  `public.erase_subject_data` and `public.export_subject_data` in the live
  container to prove its fences bite. Both were dumped with
  `pg_get_functiondef` on the merged tree and compared against
  `db/migrations/0208_*.sql` — the newest migration defining each — and each
  live body **contains the migration body exactly** after comment and whitespace
  normalisation. Checked against the migration, not only against the previous
  window's own restore snapshot: a snapshot of a mutated function would have
  matched itself.
- **The gate ran on the PINNED Node, 22.23.2, through `fnm`.** The machine's
  default `node` is v25.8.1, and above the 22 line Node's built-in Web Storage
  shadows jsdom's and ~125 suites fail for reasons that belong to nobody. A gate
  run on the default node answers a different question than the one being asked.

### THE GATE: two `test:verified` runs over one tree, and they are IDENTICAL

This is the measurement the whole window existed to take, so it is written out
in full rather than summarised. Tree `134eac590`, `git status` clean before and
after, Node **22.23.2** via `fnm`, nothing else running on the machine.

**`pnpm verify` — exit 0**, including the build. Notable, because both lanes
declared `lint:route-weight` and `lint:csp-prerender` **NOT MEASURED**: run
standalone they self-skip for want of a build manifest, and inside `verify` they
run **after** `pnpm build`, so here they measured for real —
`✓ CSP × prerender — no prerendered pages; every route gets a request nonce` and
`✓ route-weight clean — 2 ruta(s) vigilada(s) sobre un manifiesto de 546`. The
lanes were right to refuse to count them green from a standalone run, and the
gate is where they actually get counted.

**`pnpm test:verified`, run TWICE over that one tree. The two verdict lines,
quoted:**

```
reported 1478 file(s); 1478 discovered; 0 failing test(s); 0 broken file(s)
reported 1478 file(s); 1478 discovered; 0 failing test(s); 0 broken file(s)
```

Both exit **0**. Neither log contains `Worker exited unexpectedly`. And the
agreement goes past the verdict line, which is the part that answers the
previous window: **both runs report `Test Files 1477 passed | 1 skipped (1478)`
and `Tests 18946 passed | 15 skipped | 5 todo (18966)`** — the same file count,
the same test count, the same skip and todo counts. The 2026-08-30 defect the
`reloj-omnibox` lane closed showed up precisely as two runs over one tree
disagreeing; two runs now agree down to the last of 18.966 tests.

**So the Definition of Done IS met on this tree** — the first window in three to
be able to say that without a caveat attached. What it does NOT prove is that no
other source of nondeterminism exists: two agreeing runs are two samples, and
this page's own rule is that one clean sample of a nondeterministic failure only
resets the coin. What they do prove is that the source that was measured, named
and fixed is gone, and that nothing the two lanes landed introduced another one
that fires within two draws.

**The mobile Jest suite is NOT in `test:verified`** and is reported separately,
as this page requires: it runs inside `verify` as `verify:mobile` and came back
**62 suites / 978 tests passed, 0 failed** (up from the 58 / 916 the previous
window recorded — the custody lane's four new native test files).

**Database probes, before and after every run**, because a suite that writes to
a shared Supabase can move a number that a later fence reads:

| Moment | audit_log | profiles | pets | pet_events | ownerships | public funcs |
|---|---|---|---|---|---|---|
| baseline, before `verify` | 119.243 | 4.280 | 30.006 | 109.773 | 30.006 | 50 |
| after `verify` | 119.243 | 4.280 | 30.006 | 109.773 | 30.006 | 50 |
| after `test:verified` run 1 | 121.610 | 4.366 | 30.006 | 109.773 | 30.006 | 50 |
| after `test:verified` run 2 | 123.977 | 4.452 | 30.006 | 109.773 | 30.006 | 50 |

**The deltas are identical run to run — exactly +2.367 `audit_log` and +86
`profiles` each time**, and the spine (`pets`, `pet_events`, `ownerships`,
`organizations`, `cases`) does not move at all. That is a second, independent
witness to the same determinism: not only did the two runs report the same
numbers, they did the same amount of work. `verify` writes nothing.

**The two live subject-rights functions were re-dumped after the gate and are
byte-identical to the pre-gate dump.** The suite mutates neither, and neither
does the merge.

### What this window did NOT verify

- **Playwright.** e2e is a separate gate and is not in `pnpm verify`; the two
  new bearer doors are `/api/v1` surfaces with no browser flow, but the nightly
  job is still the only thing that speaks to the web pages they were copied from.
- **That the gate is deterministic in general.** Two agreeing runs are two
  samples. See above; this is stated rather than implied on purpose.
- **The three minor findings listed under "What was NOT fixed"** — the contract
  docblock's "FOUR", the `_layout.tsx` transcription claim, the `db-now.ts`
  cast. Each was read and none was patched.
- **Nothing was pushed.** `main` is at the hash below, local only.

**These last two sections are the only commits standing above the gated tree**,
which is the same disclosure the previous window made and for the same reason: a
gate result has to be written where the next reader looks. The doc-sweeping
fences were re-run afterwards against this final tree, so the disclosure is not
also a hole.

## Appended 2026-08-30 by lane wf_9beb61d4-fd6-1 — rows 1 and 4, closed up to the native wall

### Rows 1 (pet photo) and 4 (WU-V camera scan) — everything writable without the EAS build LANDED; what remains is the module and the build, and both are the PO's

**Neither row comes off the table, and this lane does not edit them — rows are
the integrator's.** What changed is what the rows MEAN: both now name only the
`npx expo install` + adapters commit and the EAS build, with every screen,
state machine, sentence and test already in the tree behind two seams. The
integrator is asked (below) to rewrite the two work cells to say so.

**The handback document is `docs/mobile/camera-modules-handback.md`** — the
page both seam files were already citing by name. It carries the install
command, the FULL adapter sources (with the one API note that must be verified
against the installed `expo-image-manipulator` major), the two wiring lines,
the config plugins with es-AR permission strings, what happens to the
fingerprint and why that rules out any OTA, the build order with an owner per
step, and the on-device verification checklist — including downloading the
public photo and running an EXIF viewer over it, because "the GPS leak is
closed" is measured, not assumed.

What it **decided**:

- **Two seams, not one, and they are shaped differently on purpose.**
  `image-picker-port.ts` is a function (`pickImage()`) because picking IS a
  call; `chip-scanner-port.ts` carries a COMPONENT-or-`null` because a camera
  is a view the screen mounts, and a `scan(): Promise` would force adapters to
  mount UI from inside a promise. `null` — not an apology component — is the
  module-missing signal, so a screen cannot mount a scanner that is not there.
  Both defaults say the truth (`available: false` / `ScanView: null`), which is
  what lets every screen ship TODAY without a single dead control.
- **The scan is an input method, not a command.** A read goes through
  `chipCodeFromScan` — fifteen digits after stripping a sticker's separators,
  or `null` and the field is left alone — into the SAME field the keyboard
  writes, and fires nothing. The person still reads the number and still taps
  Buscar, which is what row 4's own text demanded ("sets the same string the
  keyboard field sets"). One validation door for two input methods; a wrong
  barcode (a lot number) cannot plant a value somebody has to notice and
  delete. The scan control renders only under Microchip — a tattoo is not a
  barcode — and only when the seam carries a view; the "el número va a mano"
  callout renders exactly when it does not, so it can never be false.
- **The photo reviews before it uploads.** Pick → preview → "Usar esta foto";
  nothing travels until the tap, because the upload costs data on a phone plan
  and the credential is the animal's public face. Every failure of the
  ticket → PUT → confirm walk lands BACK ON REVIEW with the photo intact —
  re-picking would punish the person for a network error — and the three
  failure arms carry three different instructions because retrying does three
  different things: an expired ticket promises the fresh permission the retry
  actually mints, a dead PUT names the connection, a refused confirm speaks
  the server's own sentence (`photo_not_an_image` copy exists already; a second
  copy would drift). The ticket dies inside the flow function — no result
  carries the capability.
- **The screen-side gate mirrors, never invents.** jpeg/png/webp is membership
  in the CONTRACT's own array; HEIC gets its own sentence because its fix
  (export as JPG) differs from "not an image"; the 5 MiB cap transcribes
  `MAX_IMAGE_BYTES` / migration 0206's `file_size_limit` so the refusal costs a
  sentence instead of a full upload the bucket would refuse anyway.
- **`/mascotas/{token}/foto` is a route, not a field on `/editar`, and the Más
  row is NOT behind `isCaretaker` — that transcribes the server's own gate.**
  `POST /pets/{token}/photo` takes any holder role (`titular-only.ts` lists
  photos among what a caretaker MAY do); folding the photo into `/editar` would
  bolt a caretaker-allowed act onto a screen a caretaker cannot use. The
  caretaker test pins the row so it stays a decision. `_layout.tsx` registers
  the route with "Foto de la mascota" — transcribed from the screen's own entry
  `<Title>` and the web's field label, per the `/reclamar` condition. **The
  registration sits beside `editar` in the pet-route group, not at the list's
  tail** — said out loud because the tail is this file's collision discipline;
  the only other lane this window is docs-only, so the discipline had no
  counterparty, but a merger should know the entry is mid-list.

What it did **not** solve, and none of it is agent-blocked:

- **The modules and the build.** `expo-image-picker`, `expo-image-manipulator`
  (not optional — it is the HEIC conversion AND the EXIF/GPS strip),
  `expo-camera`; the fingerprint changes; the release is the SAME build 6 the
  PO already owes Play (PO-gated item 1), so one release serves both and burns
  one `versionCode`. Order and owners are in the handback doc.
- **The Data Safety form is the FIRST step and it is the PO's** — PO-gated
  item 2, restated here because the handback doc now depends on it: the form
  declared on 27/08 that the app does not collect photos, that stops being
  true the moment a build with these modules reaches Play, and a form that no
  longer matches the binary is a policy violation by itself. Revise it before
  or with build 6's rollout, never after.
- **Two comments will grow half-stale the day the adapters land**, reported
  rather than pre-edited: `ClaimScreen.tsx`'s header and
  `claim-view-model.ts`'s both argue the dispute refusal partly from "this
  build has no image picker". The refusal SURVIVES the modules (a JSON
  transport still cannot carry the evidence file the dispute writer demands —
  the WU-V block's own argument), but the premise sentence should be reworded
  in the adapters commit, not silently left to read false.
- **`apps/mobile/app/mascotas/index.tsx`'s placeholder note** (photo upload "is
  an `expo install` rather than a protocol") is still true and was not touched.

**Fences and evidence, exactly what ran and what did not:**

- The sweeping-fence census over the WHOLE tree
  (`rg -l 'readdirSync|globSync|discoverTestFiles' --glob '!node_modules'
  --glob '*.test.ts*'`) returns **53** on this tree — the same 46 + 7 split the
  preamble records, none of them new to this lane.
- What actually ran is BROADER than the 53, and that is a disclosure, not a
  boast: one targeted `vitest run` over all of `__tests__/`, the four
  `lib/*` fence files and `src/modules/rehome/__tests__` —
  `Test Files 965 passed | 1 skipped (966)`, `Tests 13814 passed | 18 skipped |
  5 todo (13837)`, zero failing, zero broken, on the lane's worktree with the
  four env keys exported and Node 22.23.2 via fnm. The brief said targeted
  tests because the local Supabase is shared; this run was wider than
  "targeted" and DID touch the shared database. Nothing went red and the spine
  tables' writes are the suite's own, but the integrator should know the run
  happened when reading its own before/after probes.
- The mobile Jest suite (which contains the 53rd fence,
  `release-config.test.ts`): **66 suites / 1027 tests, green TWICE in a row**,
  plus mobile `tsc --noEmit` clean and Biome clean over `apps/mobile`.
- **NOT MEASURED, declared per the standing lesson:** `lint:route-weight` and
  `lint:csp-prerender` (they self-skip without a build; only the integrator's
  full `pnpm verify` measures them), and the full `pnpm verify` +
  `pnpm test:verified` themselves — forbidden to this lane, the merge gate's
  job.
- **One flake found, and it was this lane's own, fixed at the cause**: the
  photo screen test's shared helper waited on a NEGATIVE (a transient label
  vanishing) under `waitFor`'s default 1s ceiling; stable 11/11 in isolation,
  2-then-1 red across two full parallel runs, always the same helper. The
  ceiling is now the explicit 5000 the neighbouring `PetDocumentScreen.test`
  already uses, and two consecutive full runs agree green. Diagnosed, not
  re-rolled — recorded because "a test that answers differently under load"
  is this page's favourite way to waste the next reader's day.
- **Every new test carries an applied mutation**, listed per commit in the
  commit messages: seventeen distinct mutations across the view-models, the
  flow, the two screens and the entry row, each run to red and reverted. One
  mutant came out INERT and is documented in its commit (`void run("lookup")`
  after a scan is neutralized by `run`'s stale closure over `value`) — the
  meaningful mutation for "a scan runs nothing" is the direct send, which its
  test kills.

**Para el integrador (`necesitaDelIntegrador`):**

1. Rewrite the WORK cells of rows 1 and 4 to name only what remains: the
   modules-install + adapters commit (mechanical agent work, on the PO's go)
   and the PO's build — pointing at `docs/mobile/camera-modules-handback.md`.
   Both rows stay on the table until a build with the modules ships.
2. No pin moved and no shared file outside this lane's territory was touched:
   `lib/infra/api-v1-limits.ts`, `packages/contract/*` and
   `apps/mobile/src/api/*` are byte-identical to the base. `_layout.tsx` took
   one entry (position disclosed above); `OwnerFace.tsx` one row;
   `routes.ts` one helper. No new route under `app/api`, so no bucket, no
   route-file floor, no redaction segment.
3. The full gate on the merged tree is the integrator's, as always — this
   lane's evidence stops at the boundary declared above.

## Appended 2026-08-31 — the PO answered the twelve of handoff section C

Every decision in `docs/agents/handoff-2026-08-30.md` §C was put to Ignacio on
2026-08-31 with a recommendation attached, and he answered all twelve. **None of
them is "live behaviour nobody ratified" any more**, which was the state that
page was written to end.

### Ratified as they stand — nine

1, 2, 4, 5, 7, 8, 9, 11 and 12 of §C. No code change; they are decisions now
rather than side effects. Two carry a note the ratification is not complete
without:

- **§C.4 (signup 60/min · 180/hr · 360/día)** — ratified INCLUDING the burst,
  which is the number the derivation does not put first. 360/day is neutral
  (15/hr × 24 already handed it over), but the rolling 4 h window straddling
  00:00 UTC goes from 75 to 720 — **9.6×**. Ratified knowing that; the real
  close is email verification (PO item 4), and no arrangement of windows
  substitutes for it.
- **§C.9 (the phone stricter than the web on DEACTIVATED)** — ratified as a
  PATTERN, with its boundary now written: **"stricter is always safe" holds for
  product writes and NOT for legal rights, where refusing IS the harm.** That
  exception is not decorative — it is the rule that produced §C.6 below, which
  is the one the same window got wrong.

### Decided and implemented — three

- **§C.6 — art. 16 outranks a deactivation.** DECIDED (not ratified): the phone
  now GRANTS erasure to a DEACTIVATED account and still refuses the export. The
  asymmetry is the decision. The export refusal was argued at length in
  `app/api/v1/me/privacy/route.ts`; the erasure refusal was never argued at all
  — it rode in on symmetry with art. 14, and the web has always granted it
  (`lib/infra/auth-guards.ts`: `DEACTIVATED → PASSES`). An organisation closing
  an account must not stand between a person and Ley 25.326 art. 16.
  Four cases in `__tests__/api-v1-me-privacy-route.test.ts`, one of which pins
  the asymmetry itself (same caller, both doors, one case) so a future symmetry
  has to delete it deliberately. Mutation: routing the reason back to
  `liveUserRefusal` → 2 red.
- **§C.10 — the surviving copy fold is closed.** `slot_past` had its own
  `booking_slot_past` code and string; it no longer borrows `appointment_past`,
  whose es-AR copy ends in "así que no se puede cancelar" and was being read by
  people refused a BOOKING. The OTHER fold (`pet_not_yours`/`pet_deceased` on
  one code, so the door is not an existence oracle over erased pets) is
  explicitly RATIFIED and stays. The route test's mapping table is the fence.
- **§C.3 — the turnos divergence is closed by deletion, not by syncing.**
  `app/(app)/mis-turnos/page.tsx` bucketed on `startsAt` and the phone's
  `sectionOf` on `endsAt`; the page now IMPORTS `sectionOf` and has no predicate
  of its own. Its query stays inline — pulling the page through the whole
  use-case is a larger change than the one decided — so the two coexist as
  QUERIES and no longer as RULES.

### What the §C.3 work found on the way, and it is the reusable part

**Neither copy of the section rule had a single test.** That is why they could
disagree for weeks across reviews and green gates: nothing asserted where the
boundary was, so moving it cost nothing and neither copy could go red for being
wrong about the other. `__tests__/appointment-section-boundary.test.ts` closes
it, and the shape is worth copying — **every case sits INSIDE the slot's own
duration**, which is the only interval where `startsAt` and `endsAt` give
different answers. A test asserting "a turno next week is upcoming" passes under
both rules, which is exactly how the divergence survived being looked at.
Mutation: `endsAt > now` → `startsAt > now` turns 2 of 6 red.

Two smaller things measured in the same pass:

- The page filtered on `status === "cancelled"`, **a branch the database cannot
  produce**: `appointment_status_valid` admits exactly the five in
  `APPOINTMENT_STATUSES_V1` and that is not among them. Dead since the
  constraint was written; gone with the rewrite.
- `isKnownAppointmentStatus` is exported alongside `sectionOf` on purpose.
  Drizzle types `appointments.status` as `string` — the CHECK is a database fact
  the compiler cannot see — so a caller handed the section rule WITHOUT the
  narrowing that feeds it writes its own `as`, which is how the second copy
  starts again.

### The gate, and the three reds it took to get there

**The DoD is met.** `pnpm verify` exit 0 including the build, and
`pnpm test:verified` twice over one tree:

```
reported 1479 file(s); 1479 discovered; 0 failing test(s); 0 broken file(s)
reported 1479 file(s); 1479 discovered; 0 failing test(s); 0 broken file(s)
Tests  18955 passed | 15 skipped | 5 todo (18975)   ← both runs, identical
```

Getting there took three reds and **none of them was this change**. Each is
worth more than the fix.

**1. The PO's machine could not run the gate at all.** Node v24.15.0 against
`engines.node: >=22.23.0 <23`. Cured by installing **fnm** + Node 22.23.2
alongside the existing 24 (`FNM_DIR` is under **Roaming**, not Local — the
binary is at `AppData/Roaming/fnm/node-versions/v22.23.2/installation`).

**2. `check-subject-rights-coverage` failed on six violations, and it was
right.** Three tables declared IN_EXPORT/IN_ERASE while the LIVE function body
never named them. Not the code — **migration 0208 was not applied to the local
database**. The filename says so without a query:
`0208_subject_rights_watermarks_tag_interest_org_invitations.sql` carries all
three table names. Applied locally, the fence passed on its own.

Two numbers fell out of it, both correcting documents:
- **Migrations pending against remote are FOUR (0205–0208), not three.** The
  PO-gated list on this page and the handoff both say "0205, 0206, 0207"; 0208
  was written 2026-08-29 (`eb4ae835c`) and nobody recounted.
- The Ley 25.326 `KNOWN_GAP` register reads **17 tables** today, live off
  `pnpm lint:subject-rights`. The parity board carried 21.

And the SHAPE repeats a lesson this repo learned two days earlier with
`check-catalog-drift`: a fence whose verdict is a function of your **local
database** rather than of the tree means `pnpm verify` does not mean the same
thing on two machines — and the one environment where it would be consistent is
the one where it is skipped. Second of that class in three days.

**3. `supabase-start-action.test.ts` cannot pass on Windows, and that broke the
DoD itself.** Two tests, **identical across two `test:verified` runs** — no
crash signature, deterministic. `workflowFiles()` built paths with the platform
`join` and compared them against literals written with forward slashes, so
Windows produced `.github\workflows\ci.yml` and failed **on the separator while
agreeing on the file**.

Why it matters past the one-line fix: **CI runs Ubuntu and was green, while this
repo's DoD is met locally, on Windows, on the PO's machine.** A test landed that
made the local gate unpassable, and CI could not see it *even in principle*.
Fixed with `posix.join`; the rest of the suite was swept for the same class and
it is a single instance — and the repo already had the idiom
(`.split(sep).join("/")`) in four other files.

**One more, found in the same run and fixed here.**
`apps/mobile/src/pets/PetPhotoScreen.test.tsx` timed out under `verify`. The
cause was NOT the one patched at `8469e3f3a`: **the `waitFor` ceiling and Jest's
per-test ceiling were both 5000 ms**, so the `waitFor` could never fail with its
own message (Jest killed the test first, reporting a timeout that names no
label, step or cause) and nothing was left for the asserts. Measured: the two
slowest cases take **2244 ms and 2211 ms in isolation** — 45% of the budget
before the suite is under load. Test ceiling moved to 15000 (3× the `waitFor` it
must contain, derived rather than borrowed; the 5000 was borrowed from
`PetDocumentScreen.test.tsx`, which is how the two ended up equal).

**The trap that hides it**: `npx jest` in `apps/mobile` passed **66/66 suites,
1027/1027** on the same tree minutes after `verify` failed that one file. The
mobile suite run on its own NEVER reproduces this — it only appears inside
`verify`, where the build and the lint chain compete for the same cores. Running
`pnpm --filter mimar test` proves nothing about this failure mode.
