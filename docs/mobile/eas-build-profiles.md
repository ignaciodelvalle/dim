# EAS build profiles — the commentary `eas.json` cannot carry

> Sibling document to `apps/mobile/eas.json`. Same split, same reason, as
> `apps/mobile/app.json` ↔ `apps/mobile/app.config.ts`: the file EAS reads is
> JSON, JSON has no comments, and every decision in it is one that could have
> gone the other way. This is where the "why" lives. Change one of them, change
> the other.

**Status as of 2026-08-26: nothing in this file has been executed.** `npx
eas-cli whoami` answers `Not logged in`. `eas.json` is a declaration of how this
app *will* be built; no build, no credential, no channel and no update has ever
been created. Treat every claim below about EAS's behaviour as read from its
contract, not as measured here.

---

## The three profiles, and who each one is for

| Profile | Who installs it | Artifact | Distribution |
|---|---|---|---|
| `development` | The PO, on his own device | APK with the dev client embedded | `internal` |
| `preview` | The 12 testers | APK | `internal` |
| `production` | Everyone, via Play | Android App Bundle (`.aab`) | `store` |

### `development` — `developmentClient: true`

This is not "the debug build". It is a **different app**: one that ships the
`expo-dev-client` runtime instead of a fixed JS bundle, so it can be pointed at
a Metro server running on a laptop and reload the whole app on save. Everything
the PO would otherwise have to rebuild for — a copy change, a layout fix, a new
screen — becomes a save.

What it buys over `expo start` in Expo Go is the reason it exists at all: this
app has native modules Expo Go does not contain (`expo-secure-store`,
`expo-updates`, and every module a future SDK bump adds). Expo Go can only run
the subset of the SDK it was compiled with. A development build contains *this*
app's native runtime, so what the PO tests on the phone is the runtime that
ships.

`distribution: internal` because there is no Play track involved: EAS hosts the
artifact behind an install page and a QR, and the phone sideloads it.

### `preview` — an APK, deliberately, and not an App Bundle

An `.aab` is **not installable**. It is a publishing format: a container Google's
servers split into per-device APKs at download time. Handing a tester an `.aab`
hands them a file their phone cannot open.

So `preview` builds `buildType: "apk"` — one universal APK, every ABI and
density inside it, bigger than what Play would deliver and installable by
anyone with the link. That size penalty is the entire cost of the decision and
it is the right trade for 12 people who need to *have the app* more than they
need it to be small.

`distribution: internal` again: no Play review, no track, no wait. The 12 get a
URL.

### `production` — `app-bundle`, because Play does not accept anything else

New applications have been required to publish as App Bundles since August 2021.
There is no choice to document here; what is worth documenting is that this is
the ONLY profile that produces a format nobody can sideload, which is why the
other two do not inherit from it.

`autoIncrement: true` — see below.

---

## `cli.appVersionSource: "remote"` — the decision that costs something

`versionCode` (Android) and `buildNumber` (iOS) are **not** the user-facing
version. `version` in `app.json` (`0.0.1`) is what a human reads. `versionCode`
is an integer Play uses to order releases, and it carries one brutal rule:

> A `versionCode` is **burned the moment an artifact carrying it is uploaded** —
> to production, to internal testing, to a closed track, anywhere. Play will
> never again accept that number for this package, and it will never accept a
> number lower than the highest one it has seen. There is no undo, no support
> ticket, no reset.

`appVersionSource` decides who owns that counter.

- **`local`** — the number lives in the repo (`app.json` / `build.gradle`) and a
  human increments and commits it.
- **`remote`** — the number lives on EAS's servers, and `autoIncrement: true`
  bumps it there, once, per build.

### Why `remote` is correct for THIS repo

Because `local` makes a monotonic counter depend on a human remembering to
commit a number, and this repo's working norms actively break that assumption:

1. **Parallel writers run in git worktrees** (`CLAUDE.md`, "Parallel writers only
   in worktrees"). Two worktrees at the same base commit hold the *same*
   `versionCode`. Two builds, two identical numbers, and the second upload is
   rejected — after the first one has already burned the number, so the fix is
   to burn another.
2. **The PO is not the only one who can trigger a build.** A CI-triggered build
   and a laptop-triggered build read the same committed integer.
3. **A forgotten bump is silent until Play refuses the upload**, which is the
   worst possible moment to discover it: the artifact is built, the release is
   being cut, and the answer is "build it again".

`remote` replaces "everyone agrees to increment a file" with a single
authority that hands out each number exactly once. That is the same shape as
every other counter in this system that must not collide.

### What `remote` costs — and it is not nothing

**The number leaves the repo.** This project's default posture is that the tree
is the record; `git log` answers questions about what shipped. It cannot answer
"which commit is `versionCode` 7?" any more. Only `eas build:list` can. EAS does
record the git commit on each build, so the mapping exists — it just lives on a
server that a `git clone` does not bring with it, and that a lapsed subscription
takes away.

**Builds now need the network and a session to know their own version.** There
is no offline answer to "what is the next `versionCode`". This is a hard
dependency added to the release path.

**Local builds are numbered in a different universe.** `pnpm -C apps/mobile
android` (`expo run:android`) never talks to EAS, so it uses whatever the native
project says — `1`, forever. That is harmless *only* as long as no locally-built
artifact is ever uploaded to Play. That is a rule enforced by nobody. Write it
down here and do not upload local builds.

**Rollback is still not free.** `remote` fixes collisions, not burns. Shipping a
bad build and wanting the previous one back means a *new*, higher `versionCode`
carrying the old code — never the old number again.

---

### `cli.version: ">= 12.0.0"` — a floor, not a pin

eas-cli is not a repo dependency; it runs through `npx`, so whatever version the
machine resolves is the version that reads this file. `cli.version` is the only
thing that can refuse an old one, and 12.0.0 is where `remote` became the
default version source for new projects — i.e. the first release where the
behaviour this file depends on is the mainline path rather than an option.

It is a floor rather than a pin on purpose: pinning would mean a version bump in
this repo every time the CLI moves, for a tool nobody here installs. The
trade-off is real — a future CLI could change what these profiles mean and this
floor would not catch it. That is what the `release-config.test.ts` assertions
are for: they check the values, not the version that reads them.

---

## What is deliberately NOT in `eas.json`

**No `submit` block.** `eas submit` to Play needs a Google Play service-account
JSON key, which needs a Play Console account, which does not exist. An empty
`"submit": { "production": {} }` would read as configured and is worth less than
its absence.

**No `ios` blocks on any profile.** The app declares `ios` in `platforms` and
takes its bundle identifier from `@dim/contract/links`, but there is no Apple
Developer enrolment — the same blocker `app.config.ts` documents as the reason
Universal Links cannot be wired yet. An iOS `development`/`preview` build needs
an ad-hoc provisioning profile with each tester's device UDID registered against
a Team ID that does not exist. When the enrolment lands, the iOS defaults EAS
applies are the right starting point; guessing at them now would ship
configuration nobody can test.

**No `owner`, no `projectId`, no credentials.** `extra.eas.projectId` lives in
`app.config.ts` — written by hand on 2026-08-25 precisely so `eas init` would
never rewrite that heavily-commented file — and `owner` is deliberately absent
there for reasons that file explains. Credentials are generated by EAS on first
build and never enter the repo.

---

## The `channel` field, and where OTA fits

Each profile declares a `channel`, and each channel maps 1:1 to the profile
name. That mapping is what lets `eas update --channel preview` reach exactly the
builds the testers installed and nothing else.

**Channels are not a release mechanism here.** OTA is fenced to hotfixes by PO
decision, the fence is `runtimeVersion`, and the whole argument lives in
[`ota-policy.md`](./ota-policy.md). Read that before running `eas update`.

---

## First-run order, when the PO logs in

1. `npx eas-cli login`
2. `npx eas-cli build --profile development --platform android` — the first
   build generates the Android keystore, and **EAS holds it**. Run
   `eas credentials` and take a backup before the first *production* build.

   Being precise about the risk, because the folklore overstates it in one
   direction and understates it in another: under **Play App Signing** the key
   Play distributes with is Google's, and a lost *upload* key can be reset
   through Play Console support — so this is recoverable, not fatal. Without
   Play App Signing, or for any artifact distributed outside Play, the keystore
   is the only thing that can sign an update to this package and losing it ends
   the package. Take the backup either way; the two-minute version costs less
   than finding out which case you are in.
3. Install on device, `pnpm -C apps/mobile start`, scan.
4. `--profile preview` when there is something for the 12 to look at.
5. `--profile production` only after the Play Console exists — and note that the
   first production build burns `versionCode` 1 whether or not it is ever
   uploaded, because `autoIncrement` bumps the counter at build time.
