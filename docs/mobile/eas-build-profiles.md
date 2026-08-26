# EAS build profiles — the commentary `eas.json` cannot carry

> Sibling document to `apps/mobile/eas.json`. Same split, same reason, as
> `apps/mobile/app.json` ↔ `apps/mobile/app.config.ts`: the file EAS reads is
> JSON, JSON has no comments, and every decision in it is one that could have
> gone the other way. This is where the "why" lives. Change one of them, change
> the other.

**Status as of 2026-08-26 (evening): the first real build has run, and failed.**
`npx eas-cli whoami` now answers `ignaciodelvalle2014@gmail.com`, account
`nachi7`. Build `9900114a-c134-41cf-af38-6aaf789d2942` — `production`, Android,
commit `c1b7fb977`, `versionCode` 2 — ran for fifteen minutes and errored. What
it broke on, and what was done about it, is the last section of this file:
[Two ways to break a fingerprint](#two-ways-to-break-a-fingerprint-and-the-first-real-build-found-both).
No update, no channel and no OTA has been published; claims below about *those*
are still read from EAS's contract rather than measured.

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

   **That claim is no longer read from a contract; it was measured.** The build
   that failed on 2026-08-26 carried `versionCode` **2**, having never produced
   an artifact and never reached Play. One number was already gone before it
   started, and it took a second one on its way to erroring fifteen minutes in.
   A failed build costs a `versionCode`.

---

## Two ways to break a fingerprint, and the first real build found both

`app.config.ts` sets `runtimeVersion: { policy: "fingerprint" }`, and the long
comment there explains what that buys: an OTA update is only served to a build
whose native runtime hashes to the same value, so JS that calls into a native
module the installed binary lacks reaches zero phones instead of crashing all of
them. What that comment does not say — because nobody knew it yet — is what the
policy *costs*:

> **A fingerprint that hashes toolchain-generated paths is only reproducible if
> the toolchain is pinned.**

EAS Build enforces this directly. eas-cli computes the fingerprint on the
developer's machine, the worker recomputes it after installing dependencies and
prebuilding, and the build is refused when the two disagree:

```
Runtime version calculated on local machine: 732cfe13cadf6b2c60cca478dee63b824be6aa79
Runtime version calculated on EAS:           a178f73ce819f5ae3261f6bbb76c75d51f6a3c0c
```

Build `9900114a-c134-41cf-af38-6aaf789d2942` died there. The printed diff had two
distinct causes in it, and they are worth separating because the smaller one was
nearly written off as noise from the larger.

### Cause 1 — pnpm truncates its virtual store differently on Windows and Linux

~150 of the diff entries were the same package under two spellings of its own
directory name:

```
local: node_modules/.pnpm/@expo+dom-webview@57.0.1_ex_0f048bff0e42b7ac3ac0bc1ac9518370/…
EAS:   node_modules/.pnpm/@expo+dom-webview@57.0.1_expo@57.0.16_react-native@0.86.2_@babel+core@7.29.7_@react-nat_0f048bff0e42b7ac3ac0bc1ac9518370/…
```

Same trailing hash, different visible length, because pnpm's
`virtual-store-dir-max-length` **default depends on the platform**. From pnpm
11.1.1's own source:

```js
"virtual-store-dir-max-length": isWindows() ? 60 : 120,
```

60 on Windows because of its 260-character path limit, 120 everywhere else. And
`@expo/fingerprint` hashes the native dependency set **by path** — run
`npx expo-updates fingerprint:generate --platform android` and the source list is
full of `../../node_modules/.pnpm/<truncated-dir>/…` entries. Two platforms, two
truncations, two runtime versions, out of one lockfile.

There is no `.npmrc` in this repo, so both sides were sitting on their platform
default. The fix is one line in `pnpm-workspace.yaml`:

```yaml
virtualStoreDirMaxLength: 60
```

**60 rather than 120**, on purpose. 60 is what Windows already did, so the pin
changes nothing on the PO's daily machine — measured before the pin, the longest
directory name in the store was exactly 60 characters. 120 would instead push
every Windows checkout 60 characters deeper against a 260-character ceiling that
the repo path already spends part of, which trades a broken build for a broken
checkout. Truncation is not ambiguity: the 32-character suffix that survives it
is a hash of the *full* peer string. The whole argument sits in the comment above
that line.

Two consequences worth knowing before anyone changes the number again. pnpm
records it in `node_modules/.modules.yaml` and refuses to reuse a tree built with
a different one (`ERR_PNPM_VIRTUAL_STORE_DIR_MAX_LENGTH_DIFF` — the cure is
`pnpm install`). And it moves the fingerprint, which means a new runtime version
and a fleet that no longer matches whatever was last published.

### Cause 2 — EAS prebuilds `android/`, and nothing was ignoring it

One line in the same diff had no story:

```json
{"op":"added","addedSource":{"type":"dir","filePath":"android","reasons":["bareNativeDir"]}}
```

`apps/mobile/android` does not exist locally. EAS's own prebuild creates it, and
then fingerprints it. This is **not** a second symptom of cause 1 — pinning the
store length would have left it standing.

The mechanism is in `@expo/fingerprint/build/ProjectWorkflow.js`. Before hashing,
fingerprint decides whether the project is CNG (`managed`) or has hand-maintained
native projects (`generic`): it looks for `android/app/build.gradle` and the
AndroidManifest, and if either **exists and is not ignored**, the project is
`generic`. Only `managed` appends `android/**/*` to the ignore list, and that is
what makes the directory hash to `null` and drop out of the fingerprint entirely.

The repo's root `.gitignore` deliberately did not list `android/` — the comment
there said the generated-or-committed question was "its own change". On an EAS
worker that reads as *generic*, and the entire prebuild output goes into the hash.

The remedy is `apps/mobile/.gitignore` carrying `/android/` and `/ios/`, and
**the location is load-bearing**. To answer "is this ignored", fingerprint needs
a VCS client; when `git rev-parse --show-toplevel` fails it falls back to a
NoVCSClient that globs `**/.gitignore` **from the Expo project root**. An EAS
worker unpacks an archive, not a git clone, so it takes that path — and a rule in
the repo root's `.gitignore` is out of its reach. The same rule inside
`apps/mobile/` is seen by both clients.

`.easignore` gained `apps/mobile/android/` and `apps/mobile/ios/` at the same
time, for a different reason: it replaces every `.gitignore` for upload purposes,
so without them a locally-run `expo prebuild` would be shipped to EAS and land on
top of the one EAS runs for itself.

### What was measured, and what is still unproven

Measured locally, on the fixed tree:

- `npx expo-updates fingerprint:generate --platform android` returns
  `8e47f6dbffad896a681a3fe56c5caf494c964c19` on three consecutive runs.
- With a stub `android/app/build.gradle` + AndroidManifest planted to imitate
  EAS's prebuild, and `apps/mobile/.gitignore` in place, the fingerprint is
  **unchanged** — `8e47f6db…`, with the `bareNativeDir` source present in the
  list carrying `"hash": null`. Null-hash sources are skipped by the hasher, so
  the entry may still appear in a source listing without touching the number.
- Move `apps/mobile/.gitignore` out of the way and the same tree fingerprints
  `a8ac6ea0728cc9c40d82003ab224f06525e6eb87`, with `bareNativeDir` carrying a
  real hash. That is cause 2, reproduced and then cured, on a Windows machine.
- The NoVCSClient path was replayed against the real `glob` and `ignore` packages
  fingerprint ships: rooted at `apps/mobile` it finds exactly one `.gitignore` —
  the new one — and reports all three workflow markers ignored.
- `npx expo-doctor`: 21/21 checks passed.

**Not proven, and not provable from here:** that the Linux fingerprint now equals
the Windows one. Nothing on this machine can compute EAS's side. The pin removes
the *known* divergence and the reasoning is mechanical, but the only evidence
that settles it is the next build's own runtime-version line.

### The dependency bump that came with it

The same build's `expo doctor` step failed a second check — nine packages behind
the SDK's expected patch versions — and doctor's exit code fails the build. They
were aligned with `npx expo install --fix`: `expo`, `expo-constants`,
`expo-dev-client`, `expo-linking`, `expo-router`, `expo-secure-store`,
`expo-updates`, `react-native` and `jest-expo`.

That was done **after** pinning the store length, deliberately: a dependency bump
changes the native dependency set and therefore *should* move the fingerprint,
and there is no point stabilising a number that is about to change. Pin first,
bump second, measure once.

It surfaced one thing nobody asked for. `expo-router@57.0.17` depends on
`@expo/metro-runtime@^57.0.14`, and the lockfile kept resolving it to `57.0.13` —
a version outside the declared range — through `pnpm update`,
`pnpm install --resolution-only` and `pnpm install --fix-lockfile` alike. A
throwaway project with `expo-router@57.0.17` as its only dependency resolved
`57.0.14` on the first try, which is how the lockfile was identified as the thing
at fault rather than the registry. `pnpm remove` followed by `pnpm add` on
`expo-router` dropped the stale resolution and it came back correct. If a doctor
run ever reports a version that contradicts a package's own declared range, that
is the shape of it: the lockfile is holding an old auto-installed peer, and only
removing the dependent forces a re-resolution.

### Two dead keys in `app.json`

The same doctor run failed the config-schema check on `newArchEnabled` and
`android.edgeToEdgeEnabled`. Both were removed. Both are **no-ops in SDK 57**,
which was checked rather than assumed: neither name appears anywhere in
`@expo/config-types@57.0.2` (the schema doctor validates against), and a
case-insensitive sweep of `@expo/prebuild-config@57.0.14` and
`@expo/config-plugins` finds no reader for either. The New Architecture and
edge-to-edge are unconditional now; the keys were vestigial, and the only thing
they still did was fail the build.
