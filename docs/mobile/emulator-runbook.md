# Emulator run-book — the native app on the `mimar` AVD, against the LOCAL backend

How to put the MiMAR dev build on the Android emulator and point it at the
local stack, on the PO's Windows box. Every duration below was measured on
2026-09-01 at `5092aa525`.

> **STATUS 2026-09-01: STEPS 1–2 REPRODUCE, STEP 3 DOES NOT.** The backend and
> the emulator come up exactly as written. `expo run:android` fails, four times
> out of four, in `:react-native-worklets:buildCMakeDebug` — see **T5**, which
> carries the full diagnosis and what was ruled out. No APK was produced, so the
> verification in step 4 has never been executed as written and is the *target*
> procedure, not a measured one. Do not read it as evidence.

## Prerequisites

| Thing | Value on this machine |
|---|---|
| JDK | 17 — `C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot` |
| Android SDK | `C:\Users\ignac\AppData\Local\Android\Sdk` |
| AVD | `mimar` — API 35 (Android 15), x86_64 |
| NDK / CMake | NDK 27.1.12297006, CMake 3.22.1 (both under the SDK) |
| Node / pnpm / Expo | 24.15 · 11.1.1 · Expo CLI 57.0.19 |
| Supabase | local stack up (`supabase_*_DIM` containers) |
| Web/API | production server on `:3000` via `pwsh scripts/qa-up.ps1` |

`JAVA_HOME` is set at User level but **a shell started before that does not have
it** — export it per command. `ANDROID_HOME` is not set anywhere; export it too.
Shell state does not persist between tool calls, so every command below carries
its own exports.

Note the two spellings, because both matter and they are not interchangeable:
Gradle reads `JAVA_HOME`/`ANDROID_HOME` as **Windows** paths (`C:/...`), while
bash resolves `PATH` entries as **POSIX** paths (`/c/...`). Set each accordingly.

## 1. Backend on :3000

```bash
pwsh scripts/qa-up.ps1          # or: powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/qa-up.ps1
```

The script refuses to run without `.next/BUILD_ID`, and only *warns* when the
build is older than HEAD — a warning you should act on, because a stale build
serves stale API routes. Rebuild first if so:

```bash
pnpm build                      # measured 140 s
```

Expected tail, all of it:

```
Supabase: Up 6 days (healthy)
Build is fresh relative to HEAD (5092aa525).
Serving the on-disk build (wc8Dom-e9_nOi8cKcXvZV) - verified after start.
smoke / -> 200
smoke /login -> 308
smoke /perdidas -> 200
All expected seed accounts present.
QA environment ready: http://localhost:3000
```

`qa-up.ps1` itself takes ~11 s when the build is already fresh. Confirm the two
routes the credential demo needs:

```bash
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/                 # 200
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/p/DIM-PAMP-0001  # 200
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/auth/v1/health  # 200
```

## 2. Emulator

```bash
export ANDROID_HOME="/c/Users/ignac/AppData/Local/Android/Sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
"$ANDROID_HOME/emulator/emulator.exe" -avd mimar -no-boot-anim -no-snapshot-load &
```

Run it in the background and **poll** — never end a turn with it unpolled:

```bash
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n ')" = "1" ]; do sleep 5; done
adb devices   # emulator-5554  device
```

Measured cold boot (`-no-snapshot-load`): **41 s**. `-no-snapshot-load` gives a
clean device every time; it also means anything installed in a previous session
is gone.

## 3. The environment recipe

Two rules, both paid for in lost hours (see
`docs/agents/walkthrough-findings-2026-08-31.md`, "Running the local stack"):

1. **From the AVD, the host is `10.0.2.2`** — not `localhost`, which is the
   emulator itself.
2. **Both `EXPO_PUBLIC_*` origins must name the same host.** Point only Supabase
   at the local stack and the app signs in against *staging*, gets a token signed
   with staging's key, hands it to *local* GoTrue, and gets
   `invalid JWT: unrecognized JWT kid <…> for algorithm ES256`. The screen then
   blames device storage, which is why this cost a day the first time.
   `apps/mobile/src/config/api.ts` now detects the crossed-planes case
   (`planesLookCrossed()`) and says so out loud — trust that message.

Never read, create, or edit any `.env*` file for this (PO rule). Take the anon
key from the running stack and pass it inline:

```bash
# `rg` is a Claude Code shell FUNCTION, not a binary — see T1. Pure bash only.
ANON=""
while IFS= read -r kv; do
  case "$kv" in ANON_KEY=*) ANON=${kv#ANON_KEY=}; ANON=${ANON//\"/}; ANON=${ANON%$'\r'} ;; esac
done < <(npx supabase status -o env 2>/dev/null)
[ -n "$ANON" ] || { echo "FATAL: no ANON_KEY"; exit 1; }

export EXPO_PUBLIC_API_BASE_URL="http://10.0.2.2:3000"
export EXPO_PUBLIC_SUPABASE_URL="http://10.0.2.2:54321"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON"
```

Never write the anon key into a file under the repo, and never print
`SERVICE_ROLE_KEY` anywhere. `API_URL` from `supabase status` reads
`http://127.0.0.1:54321`; the AVD needs it respelled as `10.0.2.2`.

**Babel inlines these at bundle time.** In a dev build, changing an origin means
**restarting Metro — not rebuilding the APK**. A build made with one of them
empty carries the empty string into the binary with no later chance to notice,
which is why `api.ts` trims and rejects empty rather than using `??`.

## 4. Build and install

```bash
export JAVA_HOME="C:/Program Files/Microsoft/jdk-17.0.20.101-hotspot"
export PATH="/c/Program Files/Microsoft/jdk-17.0.20.101-hotspot/bin:$PATH"
export ANDROID_HOME="C:/Users/ignac/AppData/Local/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="/c/Users/ignac/AppData/Local/Android/Sdk/platform-tools:$PATH"

cd apps/mobile
npx expo run:android            # background it, redirect to a log, and poll the log
```

This is a 10–25 minute command on a cold tree; background it and poll the log
file rather than blocking a foreground shell (600 s tool ceiling). Poll for the
process exiting, **not** for a success string — see T7.

`apps/mobile/android/` does not exist in a clean checkout. The first run
prebuilds it (measured ~25 s, ends 113 MB). It is gitignored
(`apps/mobile/.gitignore:42`) *and* Biome-ignored (`biome.json` `files.ignore`),
the latter fixed in the 08-31 walkthrough §5 after 1.4 GB of generated CMake and
Gradle JSON turned `pnpm verify` permanently red with 44 errors in files
`git status` could not show. **Delete `apps/mobile/android/` freely** — it is
regenerated; nothing in it is authored.

In this run `expo run:android`'s prebuild modified **no tracked file**. Do not
assume that: the 08-31 walkthrough measured `expo start` rewriting
`apps/mobile/tsconfig.json`, stripping its four comment blocks and dropping
`.expo/types/**/*.ts` and `expo-env.d.ts` from `include` — which silently points
`pnpm --filter mimar typecheck` at a different program. **Run `git status` after
any `expo start` or `expo run:android`, before any gate and before any commit.**

## 5. Verify it worked

Target procedure — **not yet executed**, because step 4 has never produced an
APK on this machine (T5).

```bash
adb shell dumpsys activity activities | rg ar.mimar.app     # app resumed
adb exec-out screencap -p > boot.png                        # look at it
adb logcat -d | rg -i "invalid JWT|ECONNREFUSED|Network request failed|FATAL EXCEPTION"
```

The third must come back empty. `invalid JWT` means the two origins disagree
(step 3, rule 2); `ECONNREFUSED` means `:3000` or the Supabase stack is down, or
you wrote `localhost` where the AVD needs `10.0.2.2`.

Sign in as **`ignacio@dim.test` / `Test1234!`** — owner, 17 pets. Every
`@dim.test` account shares that password.

To drive the UI from the shell: `adb shell uiautomator dump`, pull the XML, read
the field bounds, then `adb shell input tap <x> <y>` and `adb shell input text`.

## Traps

Each of these was hit on 2026-09-01 unless marked inherited.

**T1 — `rg` is a shell function, and it vanishes in a background script.**
Claude Code injects `rg` as a bash *function* wrapping `claude.exe`. Functions
are not inherited by `bash script.sh`, so a backgrounded launcher dies with
`rg: command not found`. Cost: one 10-minute poll of a script that had already
exited in the first second. Use pure bash (`case`/parameter expansion) in any
script you background. `sd`, `fd` and `eza` are not installed at all.

**T2 — `expo run:android --device` takes the AVD name, not the adb serial.**
`--device emulator-5554` fails with `Could not find device with name:
emulator-5554`. Use `--device mimar`, or omit the flag entirely — with one
device attached Expo picks it. The failure lands *after* prebuild, so it costs a
prebuild each time.

**T3 — `qa-up.ps1` errors without `.next/BUILD_ID`, and only warns when stale.**
Missing build = hard `Write-Error`. A build older than HEAD is a warning you
should treat as an error: run `pnpm build` (140 s) first. Do not run `pnpm build`
while `next dev` is alive — dev rewrites `.next` underneath it and `next start`
then reports no production build (inherited, 08-31).

**T4 — there is no `curl` or `wget` inside the AVD.** Android 15's toybox ships
neither, so you cannot probe `http://10.0.2.2:3000` from `adb shell` to prove
host reachability before the app runs. The app is the first thing that tests it.

**T5 — THE BLOCKER: `:react-native-worklets:buildCMakeDebug` never compiles.**
Four attempts, four identical failures (515 s, 75 s, 46 s, 46 s):

```
Execution failed for task ':react-native-worklets:buildCMakeDebug[x86_64][worklets]'.
> ninja: Entering directory `…\react-native-worklets\android\.cxx\Debug\5z3q3nw7\x86_64'
  [0/2] Re-checking globbed directories...
  [1/2] Re-running CMake...
  -- Configuring done / -- Generating done
  … (repeats)
  ninja: error: manifest 'build.ninja' still dirty after 100 tries
```

Ninja regenerates `build.ninja`, reloads, finds it dirty again, and gives up at
100 iterations. `ninja -d explain` names the cycle: CMake's `CONFIGURE_DEPENDS`
machinery declares `CMakeFiles/VerifyGlobs.cmake_force` as a phony output that
never exists, so `cmake.verify_globs` is always dirty, so the `RERUN_CMAKE` edge
that produces `build.ninja` always fires. Ninja also reads `cmake.verify_globs`
with **mtime 0** although the file exists and `stat` reads it fine.

Zero real object files are ever written — the only `.o` present are CMake's own
`CMakeCCompilerId.o` / `CMakeCXXCompilerId.o` compiler probes.

Ruled out, each measured, not assumed:

* *Stale `.cxx`* — deleted it; identical failure (8m25s → 1m07s, same task).
* *Poisoned Gradle build cache* — attempt 1 restored 119 tasks from cache;
  re-ran `gradlew app:assembleDebug --no-build-cache --no-configuration-cache`
  on a wiped `.cxx`; identical failure.
* *Windows MAX_PATH* — `LongPathsEnabled` is **1** in the registry.
* *Unstable globs* — ran `cmake -P CMakeFiles/VerifyGlobs.cmake` by hand: exits
  0, reports no change, leaves `cmake.verify_globs` in place. The globs are
  stable; the loop is structural, not a real source change.
* *Manifest older than its inputs* — `touch build.ninja` made it newer than
  every prefab input; ninja still called it dirty.
* *Stale `.cxx` anywhere else* — wiped **all three** `.cxx` trees
  (`react-native-worklets`, `react-native-screens`, `expo-updates`; the
  `apps/mobile/android/.cxx` and `apps/mobile/android/app/.cxx` the hint named
  do not exist in this layout) and re-ran `expo run:android` from a fully cold
  native cache. Identical failure in 46 s.

The pnpm symlink is real and is the shape behind the path arithmetic:
`apps/mobile/node_modules/react-native-worklets` →
`../../../node_modules/.pnpm/react-native-worklets@0.10._<32-hex>/node_modules/react-native-worklets`.
Ninja is handed the resolved `.pnpm` path, which is where the doubled cost comes
from.

What the evidence points at, and why it is not an agent's call to fix: CMake
warns 40+ times that the object directory `…/CMakeFiles/worklets.dir/./` is
**187 characters**, over its 250-char full-path budget, and the object paths it
would write measure **382 characters** — because worklets' sources live outside
its CMakeLists tree (`android/../Common/cpp`), so CMake mirrors the *absolute
source path* inside the object directory, and pnpm's virtual-store segment
(`.pnpm/react-native-worklets@0.10._<32-hex>/node_modules/react-native-worklets/`,
~85 chars) is therefore spent **twice**.

Every real cure is a repo-level decision, not an environment fix:

* `node-linker=hoisted` in `.npmrc` (drops ~130 chars, forces a full reinstall);
* moving the checkout to a shorter root (`C:\dev\dim` is already only 10 chars —
  buys ~7, almost certainly not enough on its own);
* patching the dependency's `externalNativeBuild.cmake.buildStagingDirectory` to
  a short path — a `node_modules` edit that any reinstall erases, so it needs a
  patch file to survive;
* pinning a `react-native-worklets` version whose CMake layout does not mirror
  absolute source paths.

**This needs the PO.** Note the 08-31 walkthrough did get the app onto an
emulator, so this is a regression against a state that once worked — worth
bisecting the mobile dependency set before choosing any of the above.

**T6 (inherited, 08-31) — the two `EXPO_PUBLIC_*` origins.** Covered in step 3;
repeated here because it is the trap most likely to be re-hit: the symptom
("we could not save your session on this device") names the wrong subsystem
entirely.

**T7 — poll on the process, not on a success string.** A poll loop matching only
`BUILD SUCCESSFUL|BUILD FAILED|EXPO_EXIT=` sat for the full 580 s over a script
that had died in its first second with a `FATAL:` line the pattern did not
cover. Make the launcher echo a terminal marker unconditionally
(`echo "EXPO_EXIT=$?"`) and poll for that, or poll process liveness.

## What is left running

Nothing. On 2026-09-01 the `:3000` server and the `mimar` emulator were both
stopped at the end of the session: the phase they were held for is blocked by
T5, and a DoD gate was waiting behind them (`pnpm verify` rebuilds `.next`,
which would have clobbered the running server anyway — see the
`.next`-clobber note in the agent memory). Metro never ran; there was no APK
for it to serve. Bringing both back costs 11 s and 41 s respectively.
