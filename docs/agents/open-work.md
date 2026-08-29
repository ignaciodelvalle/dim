# Open work and milestones — snapshot 2026-08-28

Companion to `docs/agents/collaborating-writer.md`. That page is the contract
(how to work); this page is the board (what is left).

**This file goes stale.** It was written against `a3ec504c5`. Before trusting a
row, check it against the code — the repo's own history is full of boards that
were confidently wrong. Where a row says "measured", it was verified on the date
above and nowhere since.

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
| 1 | **Edit pet identity** (name, breed, colour, markings) + **emergency contacts** + **vet** — native screens | M | The three walls testers hit first. No native module needed. `apps/mobile/app/` is expo-router; there is no edit screen of any kind today. The web serves both; reuse its guards — edit identity is **titular-only** on the web, match that exactly. |
| 2 | **Pet photo** — native image picker | M | Server side is **done**: signed upload → private bucket → `confirm` re-authorizes, verifies magic bytes, re-encodes, then writes to the public bucket. Only the picker is missing — which needs a native module, so an EAS build. That pipeline cost 6 builds / 5 distinct root causes. **Not a first task.** |
| 3 | **WU-S** — appointments: search, book, my appointments, cancel, check-in QR | L | Not in the web nav either; deep links only. |
| 4 | **WU-U** — adoption: catalogue, detail, apply, my applications | M | The application flow earns its own rate limit here. |
| 5 | **WU-V** — camera scan + confirm chip + claim | M | |
| 6 | **WU-T** — citizen abuse reports | M | Attachments blocked on signed uploads. **Not the same thing as reporting content** — this is Ley 14.346, nine types, routed to an authority. |
| 7 | **WU-P** — rehoming, foster, return, relocation, org memberships | L | Advanced custody cycle. |
| 8 | Animated card flip on the native profile | S | The two-faced profile shipped with an instant swap, which is exactly the path the web takes under reduced-motion. The animation (~485ms, one face painted at a time) is the follow-up. |

**Landed since this snapshot — do not pick it up again.** The row that used to sit
at #3 was **WU-R**, "rest of account: edit profile, ARCO privacy, native
account-deletion screen". All three shipped on 2026-08-29, behind two new
endpoints and two new native routes.

- **What was built.** `GET|POST /api/v1/me/privacy` (art. 14 export, art. 16
  supresión) and `GET|POST /api/v1/me/profile` (the six editable account
  fields), plus `apps/mobile/app/cuenta/privacidad.tsx` and
  `apps/mobile/app/cuenta/editar.tsx`. `AccountDeletionCard` is now a signpost
  into the native screen instead of a link out to a browser.
- **What was decided, and what it cost.** The erasure is NOT a second
  implementation: `eraseSubjectDataFor` and `exportSubjectDataFor` were carved
  out of the two server actions so the cookie door and the bearer door run the
  same six ordered steps. That split is also where the two rights got their
  FIRST rate limit — neither surface had one, on either side, and the budgets
  live in the use-cases so the web button and the app spend one budget
  (`revoke-sessions.ts`'s 2026-08-25 lesson). Their failure directions are
  deliberately opposite: the export fails CLOSED (a limiter outage would be an
  unbounded PII dump), the erasure fails OPEN (nothing leaves, and an abuse
  control must not stand between a person and a legal right). The URL is one
  path with two methods rather than the `DELETE /api/v1/me` that
  `apps/mobile/src/config/api.ts` predicted — that verb serves one of the two
  rights and cannot carry the other.
- **What it did NOT solve, and none of it is blocked:**
  - **No file lands on the phone.** The export is SHOWN and handed to the OS
    share sheet (`react-native`'s own `Share`, no new dependency). Writing a
    real `.json` needs `expo-file-system` → a native module → an EAS build, the
    pipeline row #2 rules out. The web link stays underneath for exactly this,
    and the Data safety form still names it. Delete that affordance the day the
    app can write a file, not before.
  - **No avatar.** Same reason as the pet photo: it needs an image picker.
    `GET /me/profile` deliberately carries no avatar URL either.
  - **`MyProfileUpdatedV1` is `{ saved: true }` and should be
    `{ changed: boolean }`.** The writer already computes the diff for its audit
    row, and `pets/{token}/profile` reports exactly that. It was not done
    because `UpdateProfileResult` is shared with `updateEmergencyContactsForPet`
    and splitting a shared writer's return type mid-worktree-window was the one
    change worth deferring. Reasoned out in `packages/contract/src/api/my-profile.ts`.
  - **Rectificación (the "R" in ARCO) is still served nowhere in this product.**
    The input schema is a one-member discriminated union so that right is one
    more member rather than a migration, but nobody has specified it.
  - **`AR_PHONE_RE` rejects a well-formed Bariloche mobile.** Found while
    writing a fixture: `+54 9 294 123-4567` warns. The regex is pre-existing and
    was moved, not edited — it now lives in `@dim/contract/input`'s `ar-phone.ts`
    with `lib/reference/ar-phone.ts` re-exporting it, so there is one place to
    fix. Reported, not fixed: it is a soft hint, it blocks no save, and widening
    a regex on a hunch is how one gets wrong in the other direction.

The row before that, at #9, was `auth_signup_ip` — 15 signups/hour per gateway,
which refused five of twenty neighbours at a plaza registration drive. Re-derived on 2026-08-29 into a
wide burst allowance under a day ceiling (60/min · 180/hr · 360/day, the day
window being new). The derivation, the costs it accepts — including a UTC-boundary
straddle that nearly doubles the worst-case rolling-24h yield — and the four
instruments it considered and rejected are in
`src/modules/auth/application/signup-limits.ts`.

What it did **not** solve is still open and is still not agent work: signup has no
per-identity anchor to derive against, and the two instruments that would give it
one are email confirmation (blocked behind the Resend setup, PO-gated item 4
below) and phone verification. No arrangement of windows substitutes for either.

Also not done from the phone, each its own slice: correct species, rabies
appointment, physical tag, printable lost poster, health-record export,
assistance dog (Ley 26.858), attaching a photo to an entry, and five entry types
(tattoo, microchip replacement, bite, death, post-adoption check-in — the app
writes 11 of 16). Reminders are read-only rows: no "snooze 7 days", no "record".

## Declared debts, with an owner

| Debt | Weight | What it is |
|---|---|---|
| The **21 tables** the Ley 25.326 fence revealed | open | Owner notes on appointments, reminder titles, foster proposal notes, org invitation emails **in plaintext**. We closed five gaps and found twenty-one. Named, printed on every run, ratcheted in both directions. |
| A tester crash is unreadable | no instrument | R8 does **not** run in this app (verified in the Expo template), so Play's warning names nothing. But a tester's crash will be JavaScript: measured on the shipped `.hbc`, three of six local functions keep their names and three don't, no source map ships, and there is no crash reporter. |
| Two band tints outside the contract | small | **Pregnancy** and **memorial** use colours absent from `@dim/contract/tokens`, so the shared contract does not carry the web's full palette. They fall back to the default tint and the chip still says what is happening — no information lost, but it is debt in the shared layer. |
| Two files parked in the art.16 fence | small | `caretaker-public-contact.ts` and `app/page.tsx`, each with a rationale recorded in the fence. |
| Checksum drift on migration `0188` | pre-existing | Someone edited that migration **after** applying it. The database is fine; the record of what was applied is not. |

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
