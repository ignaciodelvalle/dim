# What six findings looked like from inside the running app

Companion to `recommendations-2026-08-30.md`. That page says what the repo
revealed about **how it is worked**. This one says what it revealed about
**the product**, and every item on it has the same provenance: it was found by
driving the thing, on a phone and in a browser, not by reading the code.

That provenance is the point. All six were sitting in files that had been read,
reviewed and gated many times, and not one is a bug a reviewer would catch. Two
are behaviours that are *correct in the code and wrong on the screen*. One is a
set of screens nobody registered because the rule for registering them is
deliberately strict. One is a property of the seed rather than of the app. And
**the last two do not exist in the repository at rest at all** — they only appear
after you run a command the docs tell you to run, which is why no amount of
reading was ever going to surface them. A reader who only reads cannot produce
this list.

**The walkthrough, for scope.** Owner surface exclusively in the native Android
app (`ar.mimar.app` on an emulator, dev build against a local Metro); every other
role in the browser. Four roles exercised end to end — owner, licensed vet,
CABA government officer, universal admin — against a local Supabase with
`seed:demo` + `seed:flagship` applied. Five writes landed: two `pet_events` on
one pet (an owner declaration and the vet signature that confirms it), one
`welfare_reports` row filed anonymously from the phone, one welfare report closed
with a written resolution, and the first row `govt_business_rules` has ever held.

**What it did not cover, said plainly so this page is not read as coverage:**
transfer, caretaker delegation, foster, adoption end to end, physical tags,
libreta share links, and lost mode were not exercised, and their tables remain at
zero. On the state side, `/gob`'s panorama, vigilancia, pérdidas, operativos,
decomisos, padrón and mortalidad sections were not opened, nor were most of
`/admin`'s thirty.

---

## 1. `pnpm dev` serves a web app whose client never boots

**This is the blocking one, and it is the reason this page exists.** With
`pnpm dev`, the server renders, the HTML arrives, the flight payload arrives —
and **React never hydrates**. The client bundle dies on:

```
EvalError: Evaluating a string as JavaScript violates the following
Content Security Policy directive ... 'strict-dynamic'
```

`middleware.ts` builds `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'` and
its own comment states the intent: *"No 'unsafe-inline' / no 'unsafe-eval'."*
**There is no `NODE_ENV` branch** — measured, zero occurrences of
`NODE_ENV|isDev|development` in that file. But `next dev` uses `eval()` for React
Refresh, so the policy that is exactly right in production is fatal in dev.

**The A/B that settles it.** Same machine, same database, same commit. Paste into
the console on any page:

```js
[...document.querySelectorAll('button,a,input')]
  .some(el => Object.keys(el).some(k => k.startsWith('__reactFiber')))
```

| | flight payload | any `__reactFiber` in the DOM |
|---|---|---|
| `pnpm dev` | present (105 chunks) | **no** |
| `pnpm build && pnpm start` | present | **yes** |

**Why nobody noticed, which is the more useful half.** Every path this repo has
for looking at the web skips dev mode: Playwright's `webServer.command` is gated
on `process.env.NEXT_BUILT`, `scripts/qa-up.ps1` starts the *production* server,
and the cowork clickthrough prompts point at staging. `next dev` is the one path
with no coverage, and it is the path a newcomer takes on their first afternoon.

**And the failure wears a disguise.** The forms are Server Actions with
progressive enhancement, so the login POSTs and works with no JavaScript at all.
A newcomer sees a flawless marketing page, signs in successfully, and then finds
that nothing else responds. That reads as "my machine is broken", not as "the
CSP has no dev branch".

**Do not loosen the production policy.** The two honest fixes are a dev-only
branch that adds `'unsafe-eval'` when `process.env.NODE_ENV !== 'production'`, or
a line in the README saying the local web is viewed with a build. A fence that
asserts the middleware's dev branch exists would keep it from regressing.

---

## 2. Every denuncia filed from the phone reaches the state marked unverified

Filed one from the emulator, picking the address from the geocoder's own result
list. The row landed with coordinates to seven decimals, a province, a locality,
and a resolved `locality_id`. The government triage queue still renders:

> **JURISDICCIÓN SIN VERIFICAR** — "No pudimos confirmar la ubicación con el
> geocodificador: la jurisdicción se tomó del texto de la denuncia y puede no
> corresponder a este municipio."

**The flag is literally correct**, and the code says so before you can accuse it.
`app/api/v1/welfare-reports/commands.ts` calls the D.11 gate with
`province: null, locality: null, localityId: null, addressText`, and its comment
is explicit: *"The phone sends coordinates and no geocoder result, so `province`
is always null here and this always takes the inference path."*
`lib/infra/jurisdiction-from-text.ts` defines `unverified` as
*"TRUE when the pair came from the form text, not from a geocoder."* By that
definition the mark is earned.

**The gap is one request earlier.** The phone uses two commands. `resolve_location`
makes the server call the same geocoder the web calls and hand back candidates
**carrying province and locality** — that is how the screen renders
"…Balvanera, Comuna 3, Ciudad Autónoma de Buenos Aires, C1193AAQ". The person
picks one. Then `file` sends `locationLat`, `locationLng` and `locationAddress`
and **drops the province and locality of the candidate they picked**. The data
existed on the server, in this flow, moments before it was discarded.

**Why it matters more later than now.** Measured today:

```
sin_verificar = 1  /  total = 2790
```

and that single marked row is also **the only one of the 2,790 with a non-null
`locality_id`** — the 2,789 seeded reports carry `locality_id` NULL and
`jurisdiction_unverified` false. So the best-resolved row in the table is the
only one flagged as unresolved. Today that is one row. When the mobile channel
carries real volume it is 100% of that channel, and a badge that fires on
everything from one door stops separating a careful address from a vague one —
which is the only job it has.

**The fix touches the contract**, not one line: an optional province/locality on
the `file` command's input, passed to the D.11 gate when present, leaving the
text path for when it is genuinely absent. The seed does not exercise this route
at all, which is why no fence sees it.

---

## 3. Eight native screens render their own path as the header

"Mis turnos" draws `turnos/index`. Recount the set — do not transcribe it:

```bash
cd apps/mobile
fd -t f -e tsx . app | sd '^app/' '' | sd '\.tsx$' '' | rg -Nv '_layout' | sort > /tmp/a
rg -N -o 'name="([^"]+)"' -r '$1' app/_layout.tsx | sort -u > /tmp/b
comm -23 /tmp/a /tmp/b
```

At the time of writing that yields nine lines, of which `+not-found` is Expo
Router's own and the other eight are real screens: `cuidado/[grantToken]`,
`mascotas/[publicToken]/compartir`, `.../credencial`, `.../cuidado`,
`.../perdida`, `recuperar`, `turnos/[appointmentToken]`, `turnos/index`.

**This is not an oversight and the code says so.** `_layout.tsx`'s comments
record that WU-S left both `turnos` routes open deliberately, under a rule the
integrator set when it closed `/reclamar`: **the title is transcribed, not
invented** — a route is registered only when the string has already been decided
by two surfaces, so that a merge is never the place a copy argument happens.

**For `turnos/index` that condition is now met, and it was met on screen.** The
screen's own `<Title>` reads "Mis turnos", and the `/mascotas` footer button that
reaches it reads "Mis turnos". Two surfaces, one string, nothing to argue. The
remaining seven each need the same check, one at a time.

**The class is fence-shaped and has no fence.** The three commands above, as a
vitest file that fails on any difference, would close all eight and keep them
closed. Eight accumulated precisely because nothing ever went red.

---

## 4. The seed closes welfare reports without recording why

Measured after closing one by hand from `/gob`:

```
closed = 1841   ·   with a written resolution = 1
```

The one is the one closed during this walkthrough. **Every closed report the seed
produces carries `resolution_notes` NULL.** So any screen, export or metric that
reads a closure reason has never once had data to render, and would look correct
while being untested. Worth knowing before trusting a widget that claims to
summarise why cases close.

Related, and measured on the same row: `triaged_at` is set by the seed while
`triaged_by_user_id` stays NULL, so a report can look triaged with nobody
attached to the act. Attribution for the closure itself is intact — it lands in
`assigned_to_user_id` and in `audit_log`.

---

## 5. Building the Android app turned `pnpm verify` permanently red — fixed here

This one was found the hard way: the walkthrough's own gate came back
`VERIFY_EXIT=1` with **44 Biome errors**, none of them in anything anybody wrote.
They were in CMake and Gradle JSON under `apps/mobile/android/`, generated by the
`expo run:android` that put the app on the emulator in the first place.

**Two ignore lists that were supposed to agree, and did not.** `apps/mobile/.gitignore:42`
ignores `/android/` and `/ios/`, and the root `.gitignore` even carries a comment
pointing at it: *"`android/` and `ios/` are ignored too — but from
`apps/mobile/.gitignore`."* So git never shows these files. `biome.json` sets
`vcs.useIgnoreFile: true` — but that reads the **root** ignore file, not nested
ones, and `files.ignore` did not name the directory either. Biome was therefore
linting 1.4 GB of generated native build output that `git status` reports as a
clean tree.

The shape of the failure is the worst kind: **you run one documented command,
your gate goes red forever, and the diff that would explain it is invisible.**

**Fixed in this commit** by naming both directories in `biome.json`'s
`files.ignore`. Measured before and after, same tree:

```
before:  Checked 4394 files  ·  Found 44 errors
after:   Checked 4349 files  ·  Found 0 errors (1 pre-existing warning)
```

The 45-file difference is exactly the generated build output. `ios` is listed
alongside `android` because the same nested rule covers it and the same trap
waits for the first person who runs `expo run:ios`.

---

## 6. `pnpm seed:demo` puts the database in a state `pnpm verify` rejects

Found the same way as §5 — by trying to gate this very page. After the Biome fix,
`pnpm verify` still exits, now at `check-catalog-drift`:

```
✗ raza — 17 valor(es) fuera de catálogo
```

and it names them: `Mestizo Dachshund/Beagle`, `Cobayo americano`, `Rough Collie`,
`Pit Bull Terrier Americano`, `Scotch Collie`, `Pastor Australiano (Blue Heeler)`
and eleven more.

**All seventeen are written by the repo's own seed scripts** —
`scripts/seed-storylines-original10.ts`, `scripts/seed-storylines-supporting.ts`,
`scripts/seed-perf.ts` — and none of them is in `lib/reference/breeds.ts`. So two
documented commands of this repository contradict each other: seed the demo data
the docs tell you to seed, and the gate the DoD requires goes red.

**The control, run because the doctrine in `/CLAUDE.md` requires one.** Stashed
every change on this branch, ran the fence alone on the untouched tree, unstashed:

```
with my changes:   exit = 8
base tree:         exit = 8      (output byte-identical, diff -q clean)
```

It is not this change, and it is not any change — it is the database.

**Two things about this fence are worth separating.** It is *right* to refuse to
auto-fix: its own message says each value *"es una decisión, no un error a
aplastar"* — either the breed is real and belongs in the catalog, or it is a
spelling of one already there and belongs in `BREED_ALIASES`. Seventeen product
decisions are not an agent's to guess.

But the shape has a cost the recommendations page would recognise. This fence's
verdict is a function of **your local database**, not of the tree, and it
**skips entirely when `DATABASE_URL` is not local** — so CI never runs it. That
means `pnpm verify` does not mean the same thing on two machines, and the one
environment where it would be consistent is the one where it is skipped. A gate
whose answer depends on data nobody pinned is a gate that will eventually be
worked around rather than satisfied.

**Left open on purpose.** The seventeen decisions belong to the PO, and this page
is not the place to make them. What this section buys is that the next person who
sees `VERIFY_EXIT=8` after seeding knows in thirty seconds that it is not their
change — with the control recipe to prove it for themselves.

---

## Two tooling traps that cost real time

**`next build` while `next dev` is alive produces an unusable build.** Dev
rewrites `.next` underneath the build, and `next start` then answers *"Could not
find a production build in the '.next' directory."* This is already documented in
`playwright.config.ts` and it still caught this session. Kill dev, then build.

**`expo start` rewrites `apps/mobile/tsconfig.json`.** Measured diff: it deletes
all four comment blocks the repo deliberately wrote (why it extends
`expo/tsconfig.base`, why the root excludes `apps`, why `moduleResolution:
bundler`, why `allowImportingTsExtensions`), reflows the arrays, and **drops
`.expo/types/**/*.ts` and `expo-env.d.ts` from `include`**. Those two are not
cosmetic: they are Expo Router's generated route types, and without them
`pnpm --filter mimar typecheck` — which `pnpm verify` runs — is looking at a
different program than the one the repo declared. **Run `git status` after any
`expo start` or `expo run:android`, before the gate and before any commit.**

---

## Running the local stack, since none of it is obvious

**The mobile app has two environment variables and they travel together or not
at all.** `apps/mobile/src/config/api.ts` defaults `API_BASE_URL` to
`https://dim-staging.vercel.app`. Point only Supabase at the local stack and the
app signs in against **staging**, receives an access token signed with staging's
key, and hands it to the **local** GoTrue, which rejects it:

```
AuthApiError: invalid JWT: ... unrecognized JWT kid <staging-kid> for algorithm ES256
```

The screen then says *"Iniciaste sesión, pero no pudimos guardarla en este
dispositivo."* — a message that is honest about the symptom and points at the
device while the defect is in the network. Worth remembering if it is ever seen
in production. A fence asserting that the two `EXPO_PUBLIC_*` origins share a
host would close the whole class.

```bash
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000     # 10.0.2.2 = the host, from the AVD
EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=…
```

Babel inlines these at bundle time, so in a dev build restarting Metro is enough;
the APK does not need rebuilding.

**Accounts.** All fifteen `@dim.test` accounts share `Test1234!`. The ones a
walkthrough needs: `ignacio@dim.test` (owner, 17 pets), `lilian@dim.test` (vet,
matrícula V-99001-CABA verified, lands on `/org/DIM-S6XT-8BX7`),
`lucas@dim.test` (CABA government), `gov-pba@dim.test` (four PBA partidos, the
account with seeded custody disputes), `admin@dim.test` (universal),
`alejo@dim.test` (shelter admin across four orgs). One structural note that is
invisible from `profiles.role`: **there is no shelter role.** Shelter access is a
row in `organization_memberships` pointing at an organization with
`org_type='shelter'`.

---

## What the walkthrough also confirmed, and should not be lost

The provenance mechanism works end to end, across two surfaces and two people.
An owner declared a sterilization from the phone; a licensed vet confirmed it
from `/org/.../atender` eleven minutes later; the owner's credential moved from
`SIN DATO · 0 de 2` to `AL DÍA · 1 de 2 · Verificada` without the owner touching
anything in between. In the spine that is **two rows, not one modified**:

```
owner  verified=f  (no organization)                  02:18:24
vet    verified=t  Clínica Veterinaria Recoleta S.A.  02:29:24
```

Append-only held, the declaration survived intact, and the badge the citizen sees
changed because somebody else signed. That is the product's central claim and it
is true.

Two smaller confirmations worth recording. The anonymous denuncia filed from a
**logged-in** phone stored `reporter_user_id` NULL — the promise the screen makes
is kept in the row. And closing a report writes two `audit_log` entries, the
second of which is `welfare_location_viewed`: an officer *looking at* the address
a citizen reported is itself a recorded act. Neither of those was asked for by a
spec anybody was checking; both are the repo choosing the harder correct thing.

**One rough edge in the same flow, small and real:** the "Confirmar y firmar"
link carries `confirmEventId` and prefills `occurredAt` from the URL, but does not
preselect the `procedure` radio — measured, both radios arrive `checked=false` —
even though the card that produced the link already reads "Castración" and the
event being confirmed carries `procedure: castration` in its payload. The vet
re-picks a value the system already knows.
