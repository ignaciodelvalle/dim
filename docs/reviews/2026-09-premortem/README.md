# Premortem — miMAR build 10 internal-testing pilot (14 Android testers, 2–4 weeks)

> Klein premortem of the miMAR build 10 internal-testing pilot — 14 Android testers, La Matanza, 2026-09-07 → 2026-10-04. Written 2026-09-04 by an opus-tier author pass, validated the same day by a fresh opus-tier validator pass against the live hosted project and the tree at `6cccd5b00`.
> Inputs: the live hosted Supabase project (`/auth/v1/settings`, hosted SQL reads), the tree at `6cccd5b00`, `docs/reviews/2026-09-fresh/{SYNTHESIS,BACKLOG}.md`, `docs/agents/open-work.md`, `docs/mobile/{eas-build-profiles,ota-policy,emulator-runbook,camera-modules-handback}.md`, and the `apps/mobile` / `src/modules/auth` source trees. · Status: current — see "Outcome so far" below.

**Outcome so far.** **A1** stays measured TRUE — `GET /auth/v1/settings` still reads `mailer_autoconfirm: true` — and **A2 is now CLOSED**: a password-recovery mail reached the PO's own inbox carrying the 6-digit code, the one test this document could not run from inside the QA loop. The La Matanza turnos mitigation FM7 called for is delivered: the campaign is seeded on hosted (`DIM-PILOT-BUENOS-AIRES-LA-MATANZA-E3C265`), and the native filter itself shipped in the same range (`c0c95813e`): the búsqueda de turnos screen now starts from the pet's own locality and lets a tester change it — locality choice shipped natively 2026-09-04, and A7's "cannot filter by locality" caveat is closed, not merely mitigated on the data side. FM3's tester note — this document's only top-three item with no mitigation of any kind — now has a draft: `docs/mobile/guia-tester.md`. And native QA batches 1-2 ran, finding and fixing defects D1-D7 in the same commit range this document cites; the QA report itself lands separately from this one. Separately, the FM8 mitigation — scrubbing PII from the mobile Sentry payload before it leaves the device — is being added in this same commit range.

It is six weeks from now, the pilot is over, and it produced nothing: this document works backwards from that outcome to the nine beliefs whose failure would have caused it.

> **Validated 2026-09-04 against the live system and the tree at `6cccd5b00`.** Three of the original scores rested on document claims that measurement removed — the hosted confirmation toggle, the "versionCode-10 AAB on the track", and the "never observed succeeding" Sentry upload. All three are corrected below and the register is re-ranked. Every change is listed in [Validation log](#validation-log). **Build 10 does not exist yet**: the highest recorded build is 9 (`5704cf7c…`, commit `02db08408`), and every A5/A6 test below is therefore a **pre-upload gate**, not a today-action.

## Assumptions to Kill

| ID | Assumption (a belief held without proof) | Test now | Falsifier | Evidence |
|---|---|---|---|---|
| **A1** | Email confirmation will still be OFF on the hosted project on invitation day, so a tester who taps "Crear cuenta" receives a session immediately and lands in the app. | `curl -s -H "apikey: $ANON" https://agnwyifsdxxoznodutgq.supabase.co/auth/v1/settings` and read `mailer_autoconfirm` and `disable_signup`. One unauthenticated call, repeatable weekly, no dashboard needed. | `mailer_autoconfirm` is anything other than `true`, **or** `disable_signup` is `true`. | Code belief: `src/modules/auth/application/signup.ts:145-152` ("email confirmation is intentionally OFF — PO decision 2026-07-10 … If confirmations are EVER turned ON, signUp returns NO session"); `apps/mobile/src/auth/CrearCuentaScreen.tsx:32-48` repeats it. **Measured 2026-09-04 07:20Z: `disable_signup: false`, `mailer_autoconfirm: true`, `external.email: true` — the belief is TRUE today.** The 2026-09-02 reading at `docs/reviews/2026-09-fresh/SYNTHESIS.md:26` ("confirmation ACTIVE: 42/43 users confirmed, 0 unconfirmed-with-login") is **stale and was a misread**: autoconfirm stamps `email_confirmed_at` on every row, so 42/43-confirmed-with-0-unconfirmed is precisely autoconfirm's own signature, not a confirmation gate's. The live pressure to flip it is `docs/reviews/2026-09-fresh/BACKLOG.md:193` option (c). |
| **A2** | A transactional e-mail from the hosted project reaches a non-team inbox, and the recovery template renders the 6-digit code. | **PO, one minute:** trigger one password reset from `mimar.com.ar` to a non-team Gmail address, time arrival, and read whether the mail carries a code or only a link. Then Supabase → Logs → Auth, last hour, filter `mailer` / `rate limit` / `429` / `email address not authorized`. | No mail within 10 minutes, **or** the mail carries only a link and no 6-digit code, **or** any auth-log line naming a rate limit or an unauthorized recipient. | `docs/agents/open-work.md:851` (PO-gated item 4): "Resend email setup (domain verification → API key → SMTP in Supabase → env in Vercel). **Until it lands, the 6-digit password-recovery code does not travel and the screen promises what the mail does not deliver.**" The app ships a code field for a code it says it cannot send: `apps/mobile/src/auth/RecuperarScreen.tsx:20-23` ("Supabase's default recovery template renders the link and not the code"), the 6-digit promise at `:172-177`, the field at `:190-194`, the apology block at `:246-256`. **The PO believes the template and SMTP were validated at some earlier point; nothing readable from here confirms it**, which is exactly why this stays an assumption. Confirmation mail is NOT in scope here — autoconfirm means none is sent (see A1). |
| **A3** | A tester who hits `identidad-pendiente` completes step 2 on the web and comes back to the app. | On the emulator, sign up fresh, tap "Abrir en el navegador", and count every re-authentication prompt and tap to reach a completed profile. Then hand two testers the same path with no help. | Any tester needs help, **or** the browser lands somewhere other than a usable `/registro` for a signed-out arrival. | `apps/mobile/app/identidad-pendiente.tsx:15-18` states the awkward part in its own header: "The link does NOT carry this session … the browser will open signed out and ask for the same email and password again." `IDENTITY_COMPLETION_URL = ${API_BASE_URL}/registro` (`apps/mobile/src/config/api.ts:196`). No tester script exists: `docs/mobile/` holds exactly four files (`camera-modules-handback.md`, `eas-build-profiles.md`, `emulator-runbook.md`, `ota-policy.md`) and none of them is one. |
| **A4** | When build 10 is built and uploaded, its row lands in the tally and its provenance is recorded before any tester touches it. | `npx eas-cli build:list --platform android --limit 5 --json` → record id, `appBuildVersion`, `gitCommitHash`, profile, status for the newest `finished` `production` build; compare to the last row of the tally at `docs/mobile/eas-build-profiles.md:249` and to what Play Console shows as the live internal release. | A `finished` `production` build exists whose `appBuildVersion` is absent from the tally, **or** its commit differs from what the PO believes he uploaded. | The doc declares itself the record — `docs/mobile/eas-build-profiles.md:9-11` — and the tally is **current through build 9** (`:249`, written 2026-09-04 in `02658b0d0`), which is one commit-day old. The failure mode is named in the same file at `:276-280`: "Build 7 failed on 2026-09-02 and sat unnoticed for a day … **A tally nobody updates stops being a record and becomes a reassurance.**" Because `appVersionSource` is `remote`, only `eas build:list` can answer "which commit is versionCode 10?" (`:133-138`) — and `:260-266` records that command answering for every row on 2026-09-03. This is prospective, not present. |
| **A5** | Build 10, when built, will have `EXPO_PUBLIC_SUPABASE_ANON_KEY` baked in and can therefore refresh a session. | **Pre-upload gate, not a today-action.** After build 10 finishes: `eas build:list --json` → `logFiles[0]`, `zlib.brotliDecompressSync`, filter NDJSON lines on `phase == "SPIN_UP_BUILDER"`, assert all three `EXPO_PUBLIC_*` are present. Cheaper cross-check: install the AAB and confirm the app does **not** draw "Esta app no está configurada". | Any of the three variables absent from the env dump, **or** the config-error screen renders on first launch. | `apps/mobile/eas.json:30-37` — the `production` profile pins the API base and the Supabase URL and **carries no anon key**; it is an EAS dashboard variable. `apps/mobile/src/release/release-config.test.ts:140-144` records both that the fence structurally cannot check it **and that the variable was created 2026-08-27**. Build 6 shipped this class and could sign nobody in (`docs/mobile/eas-build-profiles.md:245`); build 7's own `SPIN_UP_BUILDER` dump then listed all three correctly (`:1223-1227`). The refusal path is `apps/mobile/src/auth/useGate.tsx:105-116` via `authPlaneConfigured()` (`apps/mobile/src/config/api.ts:78-80`). |
| **A6** | If build 10 is wrong, we can fix it inside the pilot window. | Publish one no-op `eas update --channel preview` against a preview APK **built from build 10's commit** on a real device; open twice; confirm it lands. Then `eas fingerprint:compare` between that preview and the production build. | The update reaches no device, **or** the fingerprints differ so a hotfix rehearsed on `preview` cannot be promoted to `production` at all. | `docs/mobile/ota-policy.md:11-18` — "**nothing has been published** … No channel, no update and no runtime version exists on the server … not a mechanism anyone here has watched run." `:215-216` — the crash-recovery fallback "has never been exercised in this project". Propagation is second-open-only (`:193-198`); the policy's step 4 requires rehearsing on `preview` (`:185-187`). **The only preview APK is build 7-again (`3016d593…`, commit `71f7b8ca0`), measured 13 commits behind build 9's commit and 18 behind HEAD `6cccd5b00`** — no fingerprint-matching rehearsal target exists. The store path is worse: monotonic `versionCode`, every failed build burns one (`docs/mobile/eas-build-profiles.md:98-102, 229-233`), and there is no Play service account, so every upload is manual (`:174-177`). |
| **A7** | A tester can complete the pilot's named flows end-to-end on their own pet, in their own town, without leaving the app. | On the emulator against local, sign in as a seeded owner whose pet is outside CABA and run: buscar turno → reservar; pet photo; check-in QR; a transfer offer received while the app is closed. Count how many of the brief's named flows terminate in a success state without a browser. **Precondition:** the dev client must actually build — see the QA-loop precondition below. | More than two named flows hand off to the web or show an empty state a tester will read as "broken". | Turnos: hosted check 2026-09-04 finds 75 `service_schedule_rules`, only **2 live** (`effective_until` null), **both CABA**, 1520 open slots to 2026-11-03 — while the pilot runs mostly in **La Matanza**. The native screen cannot filter by locality and says so (`apps/mobile/src/turnos/BuscarTurnoScreen.tsx:22-26`), empty-state copy at `:157` points at the web. Check-in QR encodes a deep link naming no screen (`apps/mobile/src/turnos/turnos-view-model.ts:27-35`). Photo upload draws its web-handoff callout whenever the picker module is absent, which is every build so far (`apps/mobile/src/pets/PetPhotoScreen.tsx:87-100`; `expo-image-picker` is not in `apps/mobile/package.json`). `expo-notifications` appears **nowhere in `apps/mobile`** (rg over the whole app returns zero) → no push. See the classification table under FM7. |
| **A8** | Nothing a tester does in two to four weeks produces a privacy or data incident. | On the emulator, type a fake DNI and a phone number into a pet's free-text fields, force a JS crash, then open the Sentry event and search its payload for those digits. Separately, re-run the A09-1 transfer path: sign up with a *known* address you do not control and attempt to accept a titularidad transfer. | The digits appear in the Sentry event, **or** the transfer is accepted by an address whose owner never proved control of it. | `docs/reviews/2026-09-fresh/BACKLOG.md:62` (A06-2, **MED**) — `apps/mobile/src/observability/sentry.ts:41` sets `sendDefaultPii: false` and `tracesSampleRate: 0` but has **no `beforeSend` and no `beforeBreadcrumb`**, so message and breadcrumb text reach a third party unredacted; the web has `lib/observability/redact.ts` and the app does not. `BACKLOG.md:40` (A09-1, HIGH, open, PO-decision) — the transfer-accept e-mail arm is a bare case-insensitive string compare with no `email_confirmed_at` check. **A1's measurement makes A09-1 live today**: `SYNTHESIS.md:26` says the attack works "once their account clears whatever confirmation policy is actually live", and the live policy is autoconfirm — no barrier at all. Governing rules: `CLAUDE.md:17` (no DNI in plaintext), `AGENTS.md:1102-1111` (Ley 25.326 arts. 14/16). |
| **A9** | The pilot will produce feedback we can act on. | Confirm one real Sentry event from a build-10 install arrives with a **readable JS stack** (file + line), not just a native frame. Then define, today, the one sentence each tester is asked to reply to, and measure the reply rate at 72 h. | No symbolicated JS frame from build 10 in Sentry after the first week, **or** fewer than half the testers reply once. | There is **no in-app feedback surface** (swept `apps/mobile/app` + `apps/mobile/src`: zero "reportar un problema"/"sugerencia"/"soporte" affordances; the only "escribinos" is an error sentence with no channel behind it, `apps/mobile/src/claims/claim-view-model.ts:162`; `ajustes.tsx` offers profile edit, sign-out and session revoke only). No push, so nothing prompts a reply. The symbolication gap is written down at `docs/mobile/eas-build-profiles.md:1348-1357` — but **that measurement predates Sentry**, which entered the tree 2026-09-01 (`:1143`), so its "nothing collects a crash" half is already false. The `sentry-cli` failure that errored build 7 (`:1088-1099`) is **fixed** — `@sentry/cli` is now a direct dependency for exactly that reason (`apps/mobile/app.config.ts:228-241`, `apps/mobile/package.json:23`) and builds 8 and 9 both finished with `@sentry/react-native/expo` in `plugins` (`app.config.ts:241`). What remains unverified is the only thing that matters: whether an event from those builds shows a **file and a line**. Nobody has read one. |

## Summary of Failure Modes

Bands: **CRITICAL ≥ 15 · HIGH 9–12 · MEDIUM 6–8 · LOW ≤ 5.**

| ID | Title | Archetype | Root cause (assumption) | Owner | Risk |
|---|---|---|---|---|---|
| FM3 | Step 2 sends them to a browser that asks who they are again | Market/Human | A3 — handoff assumed self-explanatory | PO (script), QA loop (measure) | 4×3 = **12 HIGH** |
| FM7 | The app hands the tester back to the web at the moments that matter | Market/Human | A7 — flows assumed exercisable everywhere | PO (turnos data), QA loop (enumerate) | 4×3 = **12 HIGH** |
| FM6 | Something breaks and there is no way to un-break it | Process/Operational | A6 — OTA assumed available as a net | PO | 3×4 = **12 HIGH** |
| FM1 | The door gets locked mid-pilot and the app is forbidden from saying so | Technical/Logistical | A1 — confirmations OFF today, one decision away from ON | PO (Supabase dashboard) | 2×5 = **10 HIGH** |
| FM8 | A tester's DNI leaves the country inside a crash report | Technical/Logistical | A8 — incident assumed impossible | QA loop (probe), PO (decide) | 2×5 = **10 HIGH** |
| FM9 | Three weeks pass and nobody can say what happened | Market/Human | A9 — feedback assumed to arrive | PO | 3×3 = **9 HIGH** |
| FM2 | The recovery mail nobody can read the dashboard for | Process/Operational | A2 — SMTP and template assumed working | PO | 3×2 = **6 MEDIUM** |
| FM5 | Build 10 is build 6 again | Technical/Logistical | A5 — anon key assumed baked in | PO (EAS environment) | 1×5 = **5 LOW** |
| FM4 | The tally stops one build short of the one testers hold | Process/Operational | A4 — the record assumed to keep up | PO | 2×2 = **4 LOW** |

**Calibration note.** The distribution is **0 CRITICAL / 6 HIGH / 1 MEDIUM / 2 LOW**, and the interesting part is what it used to be. Written from documents, this register scored **3 CRITICAL / 5 HIGH / 1 MEDIUM**, and all three CRITICALs rested on claims that measuring removed:

- FM1's "measured contradiction" was one dated audit line read backwards — `mailer_autoconfirm: true` produces exactly the `42/43 confirmed, 0 unconfirmed` pattern that line called "confirmation ACTIVE". 20 → 10, and what survives is a *coupling*, not a contradiction: `BACKLOG.md:193` option (c) proposes turning confirmations ON to close A09-1, and this document's own FM8 asks the PO to decide A09-1 before the pilot. FM1 is now a risk this premortem could trigger.
- FM4's "the tally says 9 and the track says 10" had no versionCode-10 to point at. There is no build 10; the tally is current through 9 and was updated twice in 48 h. 8 → 4.
- FM7's "four dead ends" was four items of unequal weight: two are documented deliberate scope, one is a debt no tester walks, and one — the turnos data gap — has a PO mitigation in progress. 15 → 12, with the title corrected to what a tester actually experiences.

Nothing was moved up to compensate, and nothing sits at CRITICAL now, because after the measurements no item is both near-certain and pilot-ending. What the register lost in drama it gained in discrimination: the top three are the three items where **nothing at all** currently mitigates the belief. The two 5-impact scores (FM1, FM5, FM8) are still reserved for outcomes matching the brief's own failure definitions verbatim ("testers cannot get in", "a privacy incident"), and both now carry low likelihoods, which is the combination the scale exists to express.

## Top 3

Three items tie at 12; they are ordered by how little stands between the belief and the failure.

1. **FM3 — Step 2 sends them to a browser that asks who they are again (12).** The highest likelihood in the set, gating every downstream flow, and the only top item with **zero** mitigation of any kind: the handoff is architecture (it protects invariant #6), the screen is honest about it, and the one thing that would soften it — a written tester note — does not exist. `docs/mobile/` has four files and none is a script.
2. **FM7 — The app hands the tester back to the web at the moments that matter (12).** Two of its four components are documented deliberate scope and will not change for this pilot; the one that can change — live turnos windows in La Matanza — is a PO mitigation **in progress and unproven**, and the pilot's locality was decided today. A tester who searches a turno before that lands sees an empty state pointing at the web.
3. **FM6 — Something breaks and there is no way to un-break it (12).** The only failure here with no workaround once it fires, and the measurement made it worse rather than better: the sole preview APK is 13 commits behind build 9 and 18 behind HEAD, so the rehearsal target the policy requires does not exist and cannot be assumed to fingerprint-match anything.

Why the other six rank lower:

- **FM1 (10)** measured open. `GET /auth/v1/settings` on 2026-09-04 returned `mailer_autoconfirm: true`, so the door is unlocked today; what is left is one dashboard decision away, and the tripwire that would catch it is a public endpoint that costs nothing to poll.
- **FM8 (10)** needs two things to coincide — a crash *and* PII in its payload — and `sendDefaultPii: false` already keeps the SDK from attaching its own. The residue is free text and breadcrumbs, plus A09-1, which A1's measurement makes live but which needs someone to actually try it among fourteen known testers.
- **FM9 (9)** degrades rather than fails, and it improved on measurement: the `sentry-cli` blocker that errored build 7 is fixed and two builds have shipped with the plugin, so the crash channel is plausibly alive. What is unverified is whether a frame carries a file and a line, and that is one Sentry event away from being answered.
- **FM2 (6)** dropped two bands because A1 removed its biggest arm: with autoconfirm on, no confirmation mail is needed at all, and hosted `auth.sessions` carries **0 rows with `not_after`** across 617 — sessions never expire absolutely, so a tester who gets in once stays in for the whole pilot and never needs recovery. What is left is one forgotten password the PO can reset from the dashboard.
- **FM5 (5)** has maximal impact and the lowest likelihood in the register: the anon key is an EAS environment variable created 2026-08-27, build 7's own env dump listed all three variables, and builds 8 and 9 came from that same environment — one of them installed and validated on the PO's phone.
- **FM4 (4)** lost its premise. There is no versionCode-10 artifact; the tally is current through build 9 and moved twice in two days. It stays on the register because the row for build 10 does not exist yet and every later diagnosis starts from it.

## Failure Modes

### FM1 — The door gets locked mid-pilot and the app is forbidden from saying so

- **Archetype:** Technical/Logistical
- **Root cause:** A1
- **Risk analysis:** `signup.ts:145-152` and `CrearCuentaScreen.tsx:32-48` encode the belief that email confirmation is OFF, a PO decision from 2026-07-10, and **the belief is correct**: `GET https://agnwyifsdxxoznodutgq.supabase.co/auth/v1/settings` on 2026-09-04 07:20Z returned `mailer_autoconfirm: true`, `disable_signup: false`. The 2026-09-02 audit line that read the opposite (`SYNTHESIS.md:26`) was inferring a gate from `email_confirmed_at` being populated, which is what autoconfirm does to every row. So this is not a live contradiction — it is a **live pressure**. `BACKLOG.md:193` lists "turn `enable_confirmations` ON" as option (c) for closing A09-1 at the root, and FM8 below asks the PO to decide A09-1 before the pilot. If that decision goes to (c) inside the pilot window, `POST /api/v1/auth/signup` starts returning `{ session: null }` and the app shows a panel pointing at the login screen. That panel is *deliberately* silent about why — `session: null` means "already registered" OR "waiting for confirmation", and the server keeps the two byte-identical to avoid rebuilding the account-enumeration oracle a prior audit closed (`CrearCuentaScreen.tsx:41-48`). The correct engineering decision is what would make the failure silent, and with no working mailer (FM2) there would be no escape hatch either.
- **Early warning signs:** `mailer_autoconfirm` reads `false` on a weekly settings poll; `auth.users` rows appear with `email_confirmed_at IS NULL` and never gain a session; testers say "me dice que vaya a ingresar pero no me deja entrar".
- **Owner:** PO (the only operator of the Supabase dashboard)
- **Likelihood:** 2 — measured OFF today, but one documented proposal (`BACKLOG.md:193c`) would flip it, and this premortem asks for that decision. **Impact:** 5 — this is "testers cannot get in", the brief's own failure definition.
- **Tripwires:**
  - `mailer_autoconfirm != true` **or** `disable_signup != false` on **≥ 1** of the weekly reads of `GET https://agnwyifsdxxoznodutgq.supabase.co/auth/v1/settings`. (Public endpoint, anon key, no dashboard access required.)
  - `select count(*) from auth.users where created_at > now() - interval '24 hours' and email_confirmed_at is null` **≥ 1** on any pilot day. (Supabase SQL editor.)
  - Signups in the first 48 h **< 10** of 14, read as `select count(*) from auth.users where created_at > <pilot start>`. (Supabase SQL.)
- **Playbook:**
  - **Contain:** stop inviting testers; tell the ones already in to wait rather than retry (each retry spends `auth_signup_ip`, 3/min · 15/hr per address — `src/modules/auth/application/login-limits.ts:112`).
  - **Assess:** re-read the settings endpoint, then run the two SQL counts; determine whether the flip was the A09-1 decision (deliberate) or a dashboard accident.
  - **Respond:** either turn confirmations back OFF for the pilot window and close A09-1 with `BACKLOG.md:193` option (a) or (b) instead, or leave them ON and fix FM2 first — never leave them ON with no working mailer.
- **Proactive mitigation:** (QA loop, today) add the `/auth/v1/settings` poll to the weekly cadence — it costs one HTTP call and it is the only machine-readable view of a dashboard nobody here can open. (PO, before invitations) when deciding A09-1, choose option (a) or (b) and write down that (c) is deferred until after the pilot.
- **Stop rule:** if fewer than 10 of 14 testers hold a session 72 h after the invitations go out, pause the pilot and do not send reminders until the signup path is proven end-to-end.

### FM2 — The recovery mail nobody can read the dashboard for

- **Archetype:** Process/Operational
- **Root cause:** A2
- **Risk analysis:** `docs/agents/open-work.md:851` lists Resend setup — domain verification, API key, SMTP in Supabase, env in Vercel — as PO-gated and undone, and states the consequence in its own words: the six-digit recovery code does not travel. `RecuperarScreen.tsx:20-23` says the same thing from the app's side and keeps a browser bridge on the screen for exactly that reason. The PO believes the template and SMTP were validated at some earlier point, and **nothing readable from this loop can confirm or refute it** — no dashboard, no inbox. That is the whole risk: an unverifiable belief about the only recovery channel. What shrank it is A1's measurement plus one hosted count: with autoconfirm on, no confirmation mail is ever sent, and hosted `auth.sessions` holds **617 rows with 0 `not_after` values** — no absolute session time-box is configured, so a tester who signs in once is never logged out during a four-week pilot and never needs recovery unless they wipe the app. The residual is a forgotten password the PO can reset from the dashboard, plus any institutional invitation for the web-side officials the vet/org/govt circuits need.
- **Early warning signs:** a test reset to a non-team address never arrives; Auth logs carry `rate limit exceeded` or an unauthorized-recipient error; testers report the code box is empty because the mail carried only a link.
- **Owner:** PO
- **Likelihood:** 3 — the board row is still open and the PO's belief is unverified from here. **Impact:** 2 — it removes a recovery path that autoconfirm plus never-expiring sessions make rarely necessary, and the PO can reset a password from the dashboard.
- **Tripwires:**
  - Delivery latency to a non-team address **> 10 min**, measured once on day 1. (Inbox + Supabase Auth logs.)
  - **≥ 1** `429`/rate-limit line in the hosted Auth logs in any 24 h window. (Supabase → Logs → Auth.)
  - **≥ 2** testers reporting "no me llegó el mail" across the pilot. (Tester replies.)
- **Playbook:**
  - **Contain:** remove every flow that depends on mail from the tester script; give the 14 their credentials out of band and tell them not to sign out.
  - **Assess:** send one reset to a team address and one to an outside address — if only the first arrives, the mailer is restricted, not merely slow.
  - **Respond:** reset the affected password from the Supabase dashboard rather than waiting on the mail path; finish the Resend wiring (domain → key → SMTP → env) before week 2 and say in the tester note that recovery is unsupported until then.
- **Proactive mitigation:** (PO, today — one minute) send one password reset to an address outside the project team, time it, and read whether the mail carries a 6-digit code or only a link. That single test answers both halves of A2. (QA loop, today) draft the one-line tester-note sentence that declares recovery unsupported, so the PO's answer only has to select it or delete it.
- **Stop rule:** do not advertise password recovery to testers at all while a test reset to an outside address fails, exceeds 10 minutes, or arrives without a code.

### FM3 — Step 2 sends them to a browser that asks who they are again

- **Archetype:** Market/Human
- **Root cause:** A3
- **Risk analysis:** Identity completion is deliberately not native — building a second, weaker identity capture would fork the definition the Mi Argentina federation path has to slot into (invariant #6, `CLAUDE.md:18`; the argument is `identidad-pendiente.tsx:3-13`). The consequence is that the app hands a signed-in person a URL that opens **signed out**, and asks them to type the same credentials into a browser. The screen says so plainly, which is the right call and does not make the step shorter. A tester who does not complete it can register no pet and receive no credential, so every downstream flow in the pilot is gated behind a hand-off nobody has scripted — `docs/mobile/` contains four files (`camera-modules-handback.md`, `eas-build-profiles.md`, `emulator-runbook.md`, `ota-policy.md`) and none of them is a tester script. This is the only top-three item with no mitigation of any kind in the tree or on the board.
- **Early warning signs:** accounts exist in `auth.users` with no matching `profiles` row; testers ask "¿y ahora qué hago?"; the app's `/registro` link is opened and abandoned.
- **Owner:** PO (the script), QA loop (measuring the path)
- **Likelihood:** 4 — a signed-out browser re-auth mid-onboarding is a well-known drop point and nothing here mitigates it. **Impact:** 3 — recoverable with one paragraph of instructions, and the screen is already honest.
- **Tripwires:**
  - `select count(*) from auth.users u left join profiles p on p.id = u.id where p.id is null and u.created_at > <pilot start>` **≥ 3**. (Supabase SQL.)
  - **> 48 h** median gap between a tester's `auth.users.created_at` and their `profiles.created_at`. (Supabase SQL.)
  - **≥ 2** testers asking what to do after the handoff. (Tester replies.)
- **Playbook:**
  - **Contain:** send the 14 a three-line note that names the handoff before they hit it ("vas a tener que entrar una vez más en el navegador; es el paso 2 y se hace una sola vez").
  - **Assess:** run the profile-less-account query; if the gap is concentrated on one day, it is the script, not the design.
  - **Respond:** keep the handoff (it protects invariant #6) and fix the words, not the architecture.
- **Proactive mitigation:** (QA loop, today) walk the whole path on the emulator and write down the exact tap count and every prompt, so the tester note describes reality. (PO, today) approve that note before the invitations go out.
- **Stop rule:** if more than a third of testers hold an account with no profile 72 h in, stop inviting and rewrite the onboarding note first.

### FM4 — The tally stops one build short of the one testers hold

- **Archetype:** Process/Operational
- **Root cause:** A4
- **Risk analysis:** `docs/mobile/eas-build-profiles.md:9-11` designates its own tally as the record. **Measured 2026-09-04: the tally is current.** Its last row is build 9 (`5704cf7c…`, commit `02db08408`, "AAB handed to the PO for the manual Play upload") at `:249`, written the same day in commit `02658b0d0`; `rg "build 10|versionCode 10"` over `docs/` returns nothing, because build 10 has not been built. `:260-266` records `npx eas-cli build:list --json` answering for every row on 2026-09-03 and confirming the derivation. So the original claim — a versionCode-10 AAB on the track against a tally ending at 9 — was false. What remains is prospective and cheap to lose: build 10 will be built, uploaded, and installed by fourteen people, and because `appVersionSource` is `remote` the number lives on EAS's servers, so `git log` cannot answer "which commit is versionCode 10?" (`:133-138`) — only `eas build:list` can. The file documents the cost of exactly this at `:276-280`: build 7 failed on 2026-09-02 and "sat unnoticed for a day while the tester round was assumed to be under way". Every diagnosis in this document that starts "which build did the tester have?" starts there.
- **Early warning signs:** the tally's last row is not the build on the track; a Sentry event's release string does not match any recorded build; the PO cannot say which commit is installed.
- **Owner:** PO
- **Likelihood:** 2 — the habit is demonstrated (two updates in 48 h) but the build-10 row does not exist yet. **Impact:** 2 — costs a day and corrupts the evidence base; does not itself stop a tester.
- **Tripwires:**
  - `eas build:list --limit 5 --json` shows **≥ 1** `finished` `production` build whose `appBuildVersion` is absent from the tally at `eas-build-profiles.md:249`. (EAS CLI — false today, and that is the baseline.)
  - **≥ 1** Sentry release tag matching **0** rows in the tally. (Sentry.)
  - **> 24 h** between a build finishing and its row being written. (Doc git history.)
- **Playbook:**
  - **Contain:** treat the doc as untrusted the moment the first tripwire fires; take every build fact from `eas build:list` directly until reconciled.
  - **Assess:** pull the last five builds as JSON, map `appBuildVersion` → id → `gitCommitHash` → Play release.
  - **Respond:** write the row for build 10, and record the commit sha in the Play release notes so the two records can never diverge silently again.
- **Proactive mitigation:** (QA loop, the hour build 10 finishes) run `eas build:list --platform android --limit 5 --json` and hand the PO the exact row text for build 10, so the row is written before the AAB is uploaded rather than after. (PO, at upload) paste the commit sha into the Play internal release notes.
- **Stop rule:** no build may be uploaded, and no incident may be diagnosed, while `eas build:list`'s newest `finished` `production` row is absent from the tally.

### FM5 — Build 10 is build 6 again

- **Archetype:** Technical/Logistical
- **Root cause:** A5
- **Risk analysis:** `apps/mobile/eas.json:30-37` pins the API origin and the Supabase URL for `production` but carries no anon key — that value is an EAS dashboard environment variable, and `apps/mobile/src/release/release-config.test.ts:140-144` records both that the repo's fence structurally cannot see it and that the variable was **created 2026-08-27**. `authPlaneConfigured()` requires both URL and key (`api.ts:78-80`), and when it returns false `useGate` renders "Esta app no está configurada" (`useGate.tsx:105-116`) — which is precisely what build 6 shipped as (`eas-build-profiles.md:245`). The values are inlined by Babel at build time, so there is no runtime correction: a bad build is a re-upload and a burned `versionCode`. This is now the lowest-likelihood item in the register, and it stays on it only because the impact is total and the check is one log read.
- **Early warning signs:** the config-error screen on first launch; zero rows in `auth.sessions` from the new build despite installs; Play install count rising with no auth traffic.
- **Owner:** PO (operates the EAS environment and Play Console)
- **Likelihood:** 1 — build 7's own `SPIN_UP_BUILDER` dump listed all three variables (`eas-build-profiles.md:1223-1227`), the EAS variable was created 2026-08-27, and builds 8 and 9 came from that same environment with one of them installed and validated on the PO's phone (`:247`). **Impact:** 5 — the build cannot sign anyone in; the pilot ends on day 1.
- **Tripwires:**
  - Build 10's `SPIN_UP_BUILDER` env dump listing **fewer than 3** `EXPO_PUBLIC_*` variables. (EAS build log — read before upload.)
  - **0** successful token grants in the hosted Auth logs in the 24 h after the first installs. (Supabase → Logs → Auth.)
  - **≥ 1** tester screenshot of "Esta app no está configurada". (Tester replies.)
- **Playbook:**
  - **Contain:** pull the internal release immediately — an app that cannot authenticate teaches testers it is broken, and that impression outlives the fix.
  - **Assess:** read the env dump from build 10's log before rebuilding; the answer is in the log, not in a guess.
  - **Respond:** set the variable in the `production` EAS environment, rebuild (burning versionCode 11), re-upload manually.
- **Proactive mitigation:** (QA loop, the hour build 10 finishes and **before** the AAB is uploaded) fetch and decode build 10's log and assert the three variables — this is the one check that would have caught build 6 before it reached anyone, and it costs one command. (PO, before inviting) install build 10 on one device and confirm the login screen, not the config screen, appears.
- **Stop rule:** pull the build the moment the config-error screen is confirmed on any device; do not wait for a second report.

### FM6 — Something breaks and there is no way to un-break it

- **Archetype:** Process/Operational
- **Root cause:** A6
- **Risk analysis:** OTA is the only sub-store-release repair path and it has never run: `ota-policy.md:11-18` states no channel, no update and no runtime version has ever been served, and `:215-216` states the crash-recovery fallback has never been exercised here. The policy also requires rehearsing on `preview` first (`:185-187`), and **the only preview APK is build 7-again (commit `71f7b8ca0`), measured at 13 commits behind build 9's commit `02db08408` and 18 behind HEAD `6cccd5b00`** — far enough that a fingerprint match cannot be assumed, and a mismatch would silently deliver a rehearsed hotfix to zero devices. The store path is no better: `versionCode` is monotonic, a failed build burns one (`eas-build-profiles.md:229-233`), there is no Play service account so every upload is manual (`:174-177`), and Play's internal-track review adds hours the pilot cannot plan around. The base rate is not small: of the **nine** recorded builds in the tally (`:240-249`), four errored and one shipped unable to sign anyone in.
- **Early warning signs:** a reproducible defect reported by two or more testers with no available remedy; the first `eas update` attempt failing or reaching no device.
- **Owner:** PO
- **Likelihood:** 3 — conditional on another failure, but two of the four shipped artifacts to date carried a blocking defect. **Impact:** 4 — a known, unfixable defect for the whole pilot window.
- **Tripwires:**
  - Time from a confirmed tester-blocking defect to a remedy on a device **> 72 h**. (PO's own clock.)
  - A rehearsal `eas update --channel preview` reaching **0** of 1 devices within two opens. (`eas update:list` / device.)
  - `eas fingerprint:compare` between preview and production returning **≥ 1** differing runtime-version field. (EAS CLI.)
- **Playbook:**
  - **Contain:** publish nothing to `production` that has not landed on `preview` first — that is the policy's step 4 and it is the only cheap place a bad bundle exists.
  - **Assess:** run `eas fingerprint:compare` before believing any hotfix will reach anyone.
  - **Respond:** if the fingerprints differ, the fix is a store release, not an update; plan the versionCode burn rather than discovering it.
- **Proactive mitigation:** (PO, this week — **before** the invitations) build one `preview` APK from build 10's exact commit so a rehearsal target with a matching fingerprint exists; the current one is 13 commits stale. (QA loop, this week) publish and verify one no-op OTA against it, so the mechanism is watched running once before it is needed under pressure.
- **Stop rule:** if a tester-blocking defect has no delivery path within 72 h of confirmation, pause the pilot rather than let fourteen people keep hitting it.

### FM7 — The app hands the tester back to the web at the moments that matter

- **Archetype:** Market/Human
- **Root cause:** A7
- **Risk analysis:** The original framing of this item — "four dead ends" — did not survive measurement. Four things are true in the tree, and they are not four of the same thing:

  | # | Finding | Verified at | Classification |
  |---|---|---|---|
  | 1 | The turnos search cannot filter by locality, and the only live windows are in CABA | `BuscarTurnoScreen.tsx:22-26` (comment), `:157` (empty state → web); hosted 2026-09-04: 75 rules, **2 live, both CABA**, 1520 slots to 2026-11-03 | ~~**DELIBERATE SCOPE** for the filter ("wiring it here is a further slice")~~ — **delivered 2026-09-04** (`c0c95813e`): the native screen now starts from the pet's own locality and lets a tester change it, so this half of row 1 is closed rather than scoped out. The **data** half has a **PO mitigation IN PROGRESS** — pilot runs mostly in **La Matanza** and a live campaign will be seeded there on hosted before build 10 (PO decision 2026-09-04, plan being written) |
  | 2 | The check-in QR encodes a deep link naming no screen; following it would land on `+not-found` | `turnos-view-model.ts:27-35`, `TurnoDetailScreen.tsx:26-33`, `app/turnos/[appointmentToken].tsx:3-9`, `packages/contract/src/links/deep-link-map.ts:284` + `:487`, `__tests__/deep-link-map.test.ts:24`, `open-work.md:392` | **DELIBERATE SCOPE**, and **not a path a tester walks**: it is a declared, fenced debt (`APP_PATH_NAMES_NO_SCREEN`, one member) and a placeholder payload for a front-desk reader that does not exist. The tester *renders* the QR; nothing in the app follows it. Changing the string would make the web and the phone print different codes for one turno |
  | 3 | The pet-photo screen refuses in-app and points at the browser | `PetPhotoScreen.tsx:87-100` — refuses **only when `getImagePickerPort().available` is false**, which is true for every build so far because `expo-image-picker` is not in `apps/mobile/package.json`; `docs/mobile/camera-modules-handback.md:33-36` | **DELIBERATE SCOPE.** The handback doc is explicit: "In a build without the modules, nothing above is a dead end: the photo screen draws a callout naming the web … that is the seam's whole point." The install is one command and "mechanical agent work the day the PO says go", but it is gated behind the Data Safety re-file (`open-work.md:849`). **Hold for the PO** |
  | 4 | There is no push at all | `rg "expo-notifications" apps/mobile/` returns **zero** across the whole app, not only `package.json` and `app.config.ts` | **UNVERIFIED.** Unlike the other three, no document anywhere declares push out of scope — it is absent by omission, with no recorded decision. Not fixable by the QA loop under a small-and-reversible rule: it needs a native module, a new EAS build, a Data Safety change and a server-side token store |

  What a tester outside a seeded locality therefore experiences is not four dead ends: it is an empty turnos search that points at the web, a photo step that points at the web, and nothing ever announcing a transfer offer, a sighting or a caretaker grant until they happen to open the app. Each is individually honest; together, over two to four weeks, they teach a tester that the app is a viewer and the web is the product.
- **Early warning signs:** median sessions per tester per week falling after week 1; turnos searched with zero results outside the seeded localities; the app opened once and never again.
- **Owner:** PO (turnos data, photo-module go-ahead), QA loop (enumerate and classify)
- **Likelihood:** 4 — three of the four components are present in the tree today and will not change for this pilot; the fourth has a mitigation in progress but unproven. **Impact:** 3 — testers can still complete credential, libreta, lost mode and transfers, which is most of the pilot's value.
- **Tripwires:**
  - `select count(*) from service_schedule_rules where effective_until is null and locality ilike '%matanza%'` **= 0** at 24 h before invitations. (Supabase SQL over hosted — the seeding tripwire.)
  - **≥ 8** of 14 testers with fewer than 3 sessions in week 2. (Play Console vitals / Sentry sessions.)
  - `select count(*) from appointments where created_at > <pilot start>` **= 0** after week 1. (Supabase SQL.)
  - **≥ 3** testers reporting an empty turnos search. (Tester replies.)
- **Playbook:**
  - **Contain:** rewrite the tester script around the flows that work end-to-end, and mark photo as "mirá cómo se ve, todavía no se completa acá" with the reason.
  - **Assess:** run the emulator sweep and produce the definitive list of which of the named flows terminate natively, hand off to the web, or are absent.
  - **Respond:** confirm the La Matanza seed landed before invitations; if it did not, drop turnos from the pilot scope explicitly rather than letting it read as a bug.
- **Proactive mitigation:** (PO, before build 10 — **in progress**) seed the La Matanza campaign on hosted and confirm at least one live `service_schedule_rules` row with `effective_until` null and open future slots there. (QA loop, today) run each named flow on the emulator against local as a seeded owner outside CABA and classify it complete / hands-off-to-web / absent, so the tester script is written from the classification rather than from hope.
- **Stop rule:** if the La Matanza seeding tripwire reads 0 at 24 h before invitations, turnos is cut from the pilot scope in writing before the invitations go out, not after the complaints.

### FM8 — A tester's DNI leaves the country inside a crash report

- **Archetype:** Technical/Logistical
- **Root cause:** A8
- **Risk analysis:** Sentry is live in the binary and its `Sentry.init` sets `sendDefaultPii: false` and `tracesSampleRate: 0` but has **no `beforeSend` and no `beforeBreadcrumb`**, so exception messages and http breadcrumbs travel verbatim to a third party — filed as A06-2 (`BACKLOG.md:62`, MED, against `apps/mobile/src/observability/sentry.ts:41`), with the web's `lib/observability/redact.ts` named as the correct form the app does not use. `sendDefaultPii: false` keeps the SDK from attaching its own PII, so the exposure is what the app itself writes into a message: free text, form values and query strings — not the identity column, which is hashed at its real boundary (`CLAUDE.md:17`). But this pilot is the first time real people type real data into the binary. Separately, A09-1 (`BACKLOG.md:40`, HIGH, still open, PO-decision) lets anyone who knows an addressee's e-mail take titularidad of an animal through the transfer-accept e-mail arm — and **A1's measurement makes it live today**: `SYNTHESIS.md:26` scopes the attack to "once their account clears whatever confirmation policy is actually live", and the live policy is autoconfirm, i.e. no barrier at all. The PO decision this document asks for is therefore a real fork, and one of its three options (turn confirmations ON) fires FM1.
- **Early warning signs:** a Sentry event whose message contains a digit run of 7–8 characters; a transfer accepted by an account created after the invitation was sent.
- **Owner:** QA loop (to probe), PO (to decide A09-1)
- **Likelihood:** 2 — needs a crash and PII in the same payload, and `sendDefaultPii: false` removes the SDK's own contribution. **Impact:** 5 — a privacy incident is a stated pilot-failure condition and this is Ley 25.326 territory (`AGENTS.md:1102-1111`).
- **Tripwires:**
  - **≥ 1** Sentry event matching `\d{7,8}` in message or breadcrumb text. (Sentry search.)
  - **≥ 1** `custody_transfer` accepted by a `profiles` row created **after** the transfer was proposed. (Supabase SQL over the event spine.)
  - Crash-free session rate **< 99%** in any week — more crashes means more payloads means more chances. (Sentry.)
- **Playbook:**
  - **Contain:** disable Sentry event ingestion for the project (dashboard kill switch) rather than shipping a build.
  - **Assess:** export the affected events and determine whether any contains a real person's identifier; a hash is not an incident, a digit run is.
  - **Respond:** add `beforeSend`/`beforeBreadcrumb` reusing the web's redact rules and ship it in the next store release; record the exposure window in `docs/architecture/privacy-known-limitations.md` the way PD1 is recorded.
- **Proactive mitigation:** (QA loop, today) force a crash on the emulator with a fake DNI in a free-text field and inspect the resulting Sentry payload — a one-hour test that either closes the question or proves the finding live. (PO, before invitations) decide A09-1 using `BACKLOG.md:193` option (a) or (b) — gating the e-mail arm on `email_confirmed_at`, or binding the invitation to a single-use secret — and **not** option (c), which would fire FM1 mid-pilot.
- **Stop rule:** any confirmed real identifier in a third-party system pauses the pilot immediately and starts an incident record — no exceptions, no "it was only one".

### FM9 — Three weeks pass and nobody can say what happened

- **Archetype:** Market/Human
- **Root cause:** A9
- **Risk analysis:** The app has no in-app feedback surface — a sweep of `apps/mobile/app` and `apps/mobile/src` finds no "reportar un problema", "sugerencia" or "soporte" affordance; the single "escribinos" in the tree is an error sentence with no channel behind it (`claim-view-model.ts:162`), and `ajustes.tsx` offers only profile edit, sign-out and session revoke. There is no push (FM7, row 4), so nothing prompts a tester to say anything. The crash channel is the part that **improved on measurement**: the `sentry-cli` path failure that errored build 7 (`eas-build-profiles.md:1088-1099`) is fixed — `@sentry/cli` is now a direct dependency of `apps/mobile` precisely so the path Gradle guesses exists (`app.config.ts:228-241`, `package.json:23`) — and builds 8 and 9 both finished with `@sentry/react-native/expo` in `plugins` (`app.config.ts:241`). The often-cited "no source map ships, and nothing collects a crash" measurement at `:1348-1357` **predates Sentry**, which entered the tree 2026-09-01 (`:1143`), so its second half is already false and its first half is now contested by a build task that runs. What nobody has done is the only thing that settles it: read one event from a shipped build and see whether a frame carries a file and a line. So the pilot's evidence base is fourteen people volunteering unprompted messages to one non-technical PO, plus Play vitals, plus a crash channel that is probably alive and unverified.
- **Early warning signs:** week 1 ends with fewer than half the testers having said anything; Sentry shows events with no file/line; feedback that arrives is "no anda" with no reproduction.
- **Owner:** PO
- **Likelihood:** 3 — likely to degrade, unlikely to be total. **Impact:** 3 — "the pilot produces nothing usable" is a stated failure condition, but partial signal still arrives from fourteen people the PO recruited personally.
- **Tripwires:**
  - **< 7** of 14 testers having sent any message by day 7. (Tester replies.)
  - **0** Sentry events from build 10 carrying a JS frame with a file and line, at day 7. (Sentry.)
  - **≥ 3** reports with no reproduction steps and no follow-up possible. (PO's own log.)
- **Playbook:**
  - **Contain:** replace open-ended solicitation with one named task per week and one question ("¿pudiste registrar la mascota? sí/no/dónde se trabó").
  - **Assess:** check whether a build-10 Sentry event carries a readable JS stack; if not, the crash channel is not a channel.
  - **Respond:** if symbolication is dead, ask testers for the app version and a screenshot as a standing rule, since that is then the only reproduction evidence that exists.
- **Proactive mitigation:** (PO, today) write the weekly one-question prompt for all four weeks before the pilot starts. (QA loop, this week) force one crash from a `production`-profile build and confirm whether Sentry shows a file and a line — the blocker that made this untestable is fixed, so this is now answerable before the pilot rather than after.
- **Stop rule:** if day 14 ends with **0** readable JS frames **and** fewer than 7 of 14 testers having replied once, the pilot is extended rather than concluded and no report may be written from that evidence base — a pilot with no signal has not run.

## External Shock

### The Data Safety declaration stopped matching the binary, and Play noticed

- **Archetype:** external / regulatory — not an execution failure
- **Scenario:** The Data Safety form filed for the 2026-08-27 upload declared that the app does not collect photos (`docs/agents/open-work.md:849`). Since then the binary gained a third-party crash reporter — Sentry entered the tree on 2026-09-01 and ships in every build from 7 onward (`eas-build-profiles.md:1143`) — which is a *diagnostics* data type the form does not declare, and it does so with no redaction (`BACKLOG.md:62`). Separately, the IARC content questionnaire declares this as an app where content can be reported (`AGENTS.md:762`). Google reviews Data Safety declarations asynchronously and can act months after the upload. If the declaration is judged inaccurate, the consequence is not a rejected update: `ota-policy.md:62-64` states it plainly — "a suspended listing, which takes the whole app down for everyone, including the people who never got the update."
- **Risk analysis:** The trigger is entirely outside the team's execution: a reviewer, a policy sweep, or a user report. The exposure window opened the day Sentry shipped and nobody re-opened the form. Because there is no Play service account, there is also no automated way to re-file quickly — the PO does it by hand. A suspension mid-pilot removes the app from all fourteen devices' update path and ends the pilot without a single line of code being wrong. This is also the gate standing in front of FM7's photo module: the handback doc puts the Data Safety re-file first, before the install, "a policy obligation rather than an engineering step".
- **Early warning signs:** a Play Console policy notice or "action required" banner; the internal release showing a review status other than available; an unexplained drop in installs.
- **Owner:** Play Console (PO)
- **Likelihood:** 1 · **Impact:** 5 — kept out of the top-3 ranking as instructed.
- **Tripwires:**
  - **≥ 1** unread policy notification in Play Console — check weekly. (Play Console.)
  - Internal-track release status not `Available` for **> 24 h**. (Play Console.)
  - Data Safety form's last-edited date **older than** 2026-09-01, the date Sentry entered the tree. (Play Console — true today.)
- **Playbook:**
  - **Contain:** stop distributing the tester link; do not upload a new build into an open policy question.
  - **Assess:** read the notice, and diff the declared data types against what the binary actually sends — diagnostics via Sentry, photos via the (still web-only) upload path, location via denuncia coordinates.
  - **Respond:** re-file the Data Safety form to match the binary, in the same session; appeal only after the form is correct.
- **Proactive mitigation:** (PO, this week — **before build 10 is uploaded**) re-open the Data Safety form and declare crash/diagnostics data; it is a 15-minute form, it removes the entire scenario, and it unblocks the camera modules. (QA loop, this week) produce the one-page list of data types the binary actually transmits, so the form is filled from evidence rather than memory.
- **Stop rule:** any Play policy notice pauses all uploads until the declaration matches the binary; never upload a new build to argue with a policy flag.

## Pilot Review Cadence

The risk landscape is not static: each checkpoint below reads specific tripwires and then *re-scores* the assumptions, because a killed assumption removes a failure mode and a confirmed one promotes everything downstream of it.

| When | Tripwires read | By whom | From where | "Update the assumptions" means |
|---|---|---|---|---|
| **Weekly, every week (incl. before invitations)** | A1 settings poll: `curl -s -H "apikey: $ANON" https://agnwyifsdxxoznodutgq.supabase.co/auth/v1/settings` → `mailer_autoconfirm`, `disable_signup`; external-shock Play policy notices | QA loop (endpoint) + PO (Play) | Public Supabase auth endpoint, Play Console | The one tripwire in this document that costs nothing and needs no dashboard. If `mailer_autoconfirm` ever reads anything but `true`, FM1 goes from 10 to CRITICAL-confirmed the same hour and FM2 inherits its impact. |
| **Before invitations** | FM7 La Matanza seeding count; FM5 build-10 env dump; FM4 `build:list` row for build 10; FM6 preview APK from build 10's commit; external-shock Data Safety re-file | QA loop (EAS, SQL) + PO (dashboard, Play) | EAS build log, Supabase SQL, Play Console | These are the pre-flight gates. A5 and A4 are answered **before a single tester installs anything**; if the La Matanza rows read 0, turnos leaves the pilot scope in writing here and not later. |
| **Day 1** | FM1 unconfirmed-users count; FM2 delivery latency to a non-team address; FM5 auth token grants | PO (inbox) + QA loop (SQL, logs) | Supabase Auth logs & SQL, inbox | A2 is answered **yes/no today** by one PO minute — no later checkpoint should still be guessing. If A5 holds, FM5 drops out of the register entirely. |
| **Day 3** | FM1 signup count (≥10/14); FM3 profile-less accounts; FM7 first turnos searches | PO | Supabase SQL, tester replies | Convert FM1/FM3 from predicted to measured drop rates. If signups are healthy, FM1 drops further and FM3 is confirmed as the top item — the bottleneck was always step 2, not the door. |
| **Week 1** | FM7 sessions-per-tester and appointment count; FM8 Sentry digit-run search + crash-free rate; FM9 reply rate (≥7/14) and first readable JS frame; FM6 rehearsal OTA result | QA loop (Sentry, SQL) + PO (replies) | Sentry, Supabase SQL, Play vitals, tester replies | First point where *engagement* data exists. Re-score FM7 with real session counts, and decide whether FM9's channel needs replacing before week 2 rather than after the pilot. |
| **Week 2** | FM7 sessions in week 2; FM9 readable JS frames; FM6 time-to-remedy on any open defect; external-shock Play notices | PO + QA loop | Play Console, Sentry, Supabase | The mid-point where the stop rules bite. Any FM still scoring 12 with its tripwire tripped either gets a mitigation shipped or gets cut from the pilot's scope in writing. |
| **End** | All nine, plus every tripwire that never fired | PO + QA loop | All of the above | Write down which assumptions were **killed**, which **survived**, and — most valuable — which tripwire was never readable, because an unreadable tripwire is a blind spot the next pilot inherits. |

## Inputs for the QA loop

Ordered by what unblocks the most downstream analysis, deduplicated, and split by who can actually execute it. The QA loop has: an Android emulator with the dev client + Metro against the LOCAL stack, Playwright for web roles on `:3000`, read-only SQL on hosted, and `eas build:list/view`. It **cannot** read the Supabase dashboard, Play Console, or any real inbox.

> **Precondition, check this first.** `docs/mobile/emulator-runbook.md:7-12` records that as of 2026-09-01 **step 3 did not reproduce**: `expo run:android` failed four times out of four in `:react-native-worklets:buildCMakeDebug` (diagnosis at `:242-340`) and no APK was produced. Every emulator-based item below (2, 4, 5, 6) inherits that. Confirm the dev client actually launches before scheduling them; if it does not, T5 is the first thing to fix and the run-book's own step 4 has still never been executed as written.

### QA loop can do

| # | Assumption | Action |
|---|---|---|
| 1 | **A1** | `curl -s -H "apikey: $ANON" https://agnwyifsdxxoznodutgq.supabase.co/auth/v1/settings` and record `mailer_autoconfirm`, `disable_signup`, `external.email`. One unauthenticated call answers the highest-impact belief in the register and becomes the weekly tripwire. |
| 2 | **A7** | On the emulator against local, as a seeded owner whose pet is **outside CABA**, run each named flow (credential+QR, libreta/events, photo, lost mode, emergency contacts, turnos, transfers, caretakers, adoption, claims, denuncia, reclamo, mudanza, devolución, ARCO) and classify each: completes natively / hands off to web / absent. This is what the tester script gets written from. |
| 3 | **A7** | Read-only SQL on hosted: `select count(*) from service_schedule_rules where effective_until is null` grouped by locality, plus the open future-slot count per locality. Re-run at 24 h before invitations to check the La Matanza seed landed. |
| 4 | **A3** | Walk signup → `identidad-pendiente` → browser → `/registro` → back to the app; record every re-auth prompt and the total tap count, and draft the three-line tester note from it. |
| 5 | **A8** | Type a fake 8-digit DNI and a phone number into a pet's free-text fields, force a JS crash, and search the resulting Sentry event payload for those digits. |
| 6 | **A9** | Force one crash from a `production`-profile build and confirm whether the Sentry event carries a JS frame with a **file and a line** — the `sentry-cli` blocker is fixed, so this is now answerable. |
| 7 | **A5** | *(the hour build 10 finishes, before upload)* `npx eas-cli build:list --platform android --limit 5 --json` → take build 10's `logFiles[0]`, brotli-decompress, filter NDJSON on `phase == "SPIN_UP_BUILDER"`, assert `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are all present. |
| 8 | **A4** | *(same JSON, same hour)* Record build 10's id, `appBuildVersion`, `gitCommitHash`, profile and status, and hand the PO the exact tally row text for `eas-build-profiles.md:249`. |
| 9 | **A6** | *(once a preview APK from build 10's commit exists)* Publish one no-op `eas update --channel preview` against it, open the device twice, confirm it lands; then `eas fingerprint:compare` preview vs production. |

### PO must do (dashboard / inbox / Play Console)

| # | Assumption | Action |
|---|---|---|
| P1 | **A2** | **One minute.** Trigger one password reset from `mimar.com.ar` to a **non-team** address; time the arrival and read whether the mail carries a **6-digit code** or only a link. Then Supabase → Logs → Auth, last hour, for `mailer` / `rate limit` / `429` / unauthorized-recipient lines. Nothing in the QA loop can see any of this. |
| P2 | **A8 / A1** | Decide A09-1 before the invitations, using `BACKLOG.md:193` option **(a)** or **(b)** — and record that option (c) (turning confirmations ON) is deferred until after the pilot, because it fires FM1. |
| P3 | — | Re-file the Data Safety form to declare crash/diagnostics data **before build 10 is uploaded**. 15 minutes; it removes the external-shock scenario and unblocks the camera modules. |
| P4 | **A6** | Build one `preview` APK from build 10's exact commit, so item 9 above has a fingerprint-matching target. The existing one is 13 commits stale. |
| P5 | **A7** | Seed the La Matanza campaign on hosted (live `service_schedule_rules` row, `effective_until` null, open future slots) before build 10. |
| P6 | **A4** | Paste build 10's commit sha into the Play internal release notes at upload. |
| P7 | **A9 / A3** | Write the weekly one-question prompt for all four weeks, and approve the tester note from item 4, before the invitations go out. |
| P8 | **A5** | Install build 10 on one device and confirm the login screen — not "Esta app no está configurada" — appears. |

```json
{
  "assumptions_to_kill": [
    {
      "id": "A1",
      "archetype": "technical",
      "statement": "Email confirmation will still be OFF on the hosted project on invitation day, so a tester who taps 'Crear cuenta' receives a session immediately and lands in the app.",
      "test_now": "curl -s -H \"apikey: $ANON\" https://agnwyifsdxxoznodutgq.supabase.co/auth/v1/settings and read mailer_autoconfirm and disable_signup. One unauthenticated call, repeatable weekly, no dashboard needed.",
      "falsifier": "mailer_autoconfirm is anything other than true, or disable_signup is true.",
      "evidence": "src/modules/auth/application/signup.ts:145-152; apps/mobile/src/auth/CrearCuentaScreen.tsx:32-48. MEASURED 2026-09-04 07:20Z: disable_signup false, mailer_autoconfirm true, external.email true — belief TRUE today. docs/reviews/2026-09-fresh/SYNTHESIS.md:26 ('confirmation ACTIVE: 42/43 confirmed') is stale and a misread — autoconfirm produces exactly that pattern. Live pressure to flip: docs/reviews/2026-09-fresh/BACKLOG.md:193 option (c)."
    },
    {
      "id": "A2",
      "archetype": "process",
      "statement": "A transactional e-mail from the hosted project reaches a non-team inbox, and the recovery template renders the 6-digit code.",
      "test_now": "PO, one minute: trigger one password reset to a non-team address, time arrival, and read whether the mail carries a code or only a link; then filter Supabase Auth logs for mailer / rate limit / 429 / unauthorized-recipient lines.",
      "falsifier": "No mail within 10 minutes, or the mail carries only a link and no 6-digit code, or any auth-log line naming a rate limit or an unauthorized recipient.",
      "evidence": "docs/agents/open-work.md:851 (Resend setup PO-gated and undone); apps/mobile/src/auth/RecuperarScreen.tsx:20-23, :172-177, :190-194, :246-256. PO believes the template and SMTP were validated earlier; nothing readable from this loop confirms it. Confirmation mail is out of scope — autoconfirm sends none."
    },
    {
      "id": "A3",
      "archetype": "human",
      "statement": "A tester who hits identidad-pendiente completes step 2 on the web and comes back to the app.",
      "test_now": "On the emulator, sign up fresh, follow the handoff to /registro, and count every re-authentication prompt and tap; then hand two testers the same path unaided.",
      "falsifier": "Any tester needs help, or the browser lands somewhere other than a usable /registro for a signed-out arrival.",
      "evidence": "apps/mobile/app/identidad-pendiente.tsx:15-18; apps/mobile/src/config/api.ts:196; docs/mobile/ contains exactly four files (camera-modules-handback.md, eas-build-profiles.md, emulator-runbook.md, ota-policy.md) and no tester script"
    },
    {
      "id": "A4",
      "archetype": "process",
      "statement": "When build 10 is built and uploaded, its row lands in the tally and its provenance is recorded before any tester touches it.",
      "test_now": "npx eas-cli build:list --platform android --limit 5 --json; record the newest finished production build's id, appBuildVersion, gitCommitHash, profile and status; compare to the last tally row at docs/mobile/eas-build-profiles.md:249 and to the live Play internal release.",
      "falsifier": "A finished production build exists whose appBuildVersion is absent from the tally, or its commit differs from what the PO believes he uploaded.",
      "evidence": "docs/mobile/eas-build-profiles.md:9-11 (the tally is the record), :249 (tally current through build 9, written 2026-09-04 in 02658b0d0), :260-266 (build:list answered for every row on 2026-09-03), :276-280 ('a tally nobody updates stops being a record'), :133-138 (remote versionCode leaves the repo). Build 10 does not exist: rg 'build 10|versionCode 10' over docs/ returns nothing."
    },
    {
      "id": "A5",
      "archetype": "technical",
      "statement": "Build 10, when built, will have EXPO_PUBLIC_SUPABASE_ANON_KEY baked in and can therefore refresh a session.",
      "test_now": "Pre-upload gate, not a today-action. After build 10 finishes: fetch its EAS log via logFiles[0], brotli-decompress, filter NDJSON on phase == 'SPIN_UP_BUILDER', assert all three EXPO_PUBLIC_* present; cross-check by installing and confirming the config-error screen does not render.",
      "falsifier": "Any of the three variables absent from the env dump, or 'Esta app no está configurada' renders on first launch.",
      "evidence": "apps/mobile/eas.json:30-37 (no anon key in any profile); apps/mobile/src/release/release-config.test.ts:140-144 (fence cannot check it AND the EAS variable was created 2026-08-27); docs/mobile/eas-build-profiles.md:245 (build 6 shipped this class), :1223-1227 (build 7's dump listed all three); apps/mobile/src/auth/useGate.tsx:105-116; apps/mobile/src/config/api.ts:78-80"
    },
    {
      "id": "A6",
      "archetype": "process",
      "statement": "If build 10 is wrong, we can fix it inside the pilot window.",
      "test_now": "Publish one no-op `eas update --channel preview` against a preview APK built from build 10's commit, open the device twice, confirm it lands; then run `eas fingerprint:compare` between preview and production.",
      "falsifier": "The update reaches no device, or the fingerprints differ so a rehearsed hotfix cannot be promoted to production.",
      "evidence": "docs/mobile/ota-policy.md:11-18 (nothing ever published), :215-216 (recovery never exercised), :185-187 (rehearse on preview), :193-198 (second-open propagation); docs/mobile/eas-build-profiles.md:98-102, 174-177, 229-233. The only preview APK is 3016d593 (commit 71f7b8ca0), measured 13 commits behind build 9's 02db08408 and 18 behind HEAD 6cccd5b00."
    },
    {
      "id": "A7",
      "archetype": "human",
      "statement": "A tester can complete the pilot's named flows end-to-end on their own pet, in their own town, without leaving the app.",
      "test_now": "On the emulator against local, as a seeded owner whose pet is outside CABA, run every named flow and classify each: completes natively / hands off to web / absent. Precondition: confirm the dev client actually builds (emulator-runbook.md:7-12, T5).",
      "falsifier": "More than two named flows hand off to the web or show an empty state a tester will read as broken.",
      "evidence": "Hosted 2026-09-04: 75 service_schedule_rules, 2 live (effective_until null), both CABA, 1520 open slots to 2026-11-03; pilot runs mostly in La Matanza (PO 2026-09-04, seed in progress). apps/mobile/src/turnos/BuscarTurnoScreen.tsx:22-26,157; apps/mobile/src/turnos/turnos-view-model.ts:27-35 + packages/contract/src/links/deep-link-map.ts:284,487; apps/mobile/src/pets/PetPhotoScreen.tsx:87-100 + docs/mobile/camera-modules-handback.md:33-36; rg 'expo-notifications' over all of apps/mobile returns zero."
    },
    {
      "id": "A8",
      "archetype": "technical",
      "statement": "Nothing a tester does in two to four weeks produces a privacy or data incident.",
      "test_now": "Type a fake DNI and phone into a pet's free-text fields, force a JS crash, and search the Sentry event payload for those digits; separately attempt the A09-1 transfer-accept path with an address you do not control.",
      "falsifier": "The digits appear in the Sentry event, or a transfer is accepted by an address whose owner never proved control of it.",
      "evidence": "docs/reviews/2026-09-fresh/BACKLOG.md:62 (A06-2, MED — apps/mobile/src/observability/sentry.ts:41 sets sendDefaultPii false and tracesSampleRate 0 but has no beforeSend and no beforeBreadcrumb); BACKLOG.md:40 (A09-1 HIGH, open, po-decision); SYNTHESIS.md:26 scopes A09-1 to 'whatever confirmation policy is actually live', and A1 measured that policy as autoconfirm — no barrier; CLAUDE.md:17; AGENTS.md:1102-1111"
    },
    {
      "id": "A9",
      "archetype": "human",
      "statement": "The pilot will produce feedback we can act on.",
      "test_now": "Confirm one Sentry event from a production-profile build carries a readable JS frame with file and line; define the single weekly question each tester is asked and measure the 72 h reply rate.",
      "falsifier": "No symbolicated JS frame from build 10 after week 1, or fewer than half the testers reply once.",
      "evidence": "No in-app feedback surface anywhere in apps/mobile (ajustes.tsx offers profile edit / sign-out / session revoke only; the only 'escribinos' is claim-view-model.ts:162, an error sentence with no channel). docs/mobile/eas-build-profiles.md:1348-1357 ('no source map ships, nothing collects a crash') PREDATES Sentry, which entered the tree 2026-09-01 (:1143). The sentry-cli failure that errored build 7 (:1088-1099) is FIXED — @sentry/cli is a direct dependency for that reason (apps/mobile/app.config.ts:228-241, package.json:23) — and builds 8 and 9 finished with @sentry/react-native/expo in plugins (app.config.ts:241). Unverified: whether an event shows a file and a line."
    }
  ],
  "failure_modes": [
    {
      "id": "FM1",
      "title": "The door gets locked mid-pilot and the app is forbidden from saying so",
      "archetype": "technical",
      "assumption": "A1",
      "owner": "PO (Supabase dashboard)",
      "likelihood_5": 2,
      "impact_5": 5,
      "score": 10,
      "class": "HIGH",
      "risk_analysis": "signup.ts:145-152 and CrearCuentaScreen.tsx:32-48 encode the belief that email confirmation is OFF (PO decision 2026-07-10), and the belief is CORRECT: GET /auth/v1/settings on 2026-09-04 07:20Z returned mailer_autoconfirm true, disable_signup false. The 2026-09-02 audit line reading the opposite inferred a gate from email_confirmed_at being populated, which is what autoconfirm does to every row. This is therefore not a live contradiction but a live pressure: BACKLOG.md:193 lists 'turn enable_confirmations ON' as option (c) for closing A09-1 at the root, and FM8 asks the PO to decide A09-1 before the pilot. If that decision goes to (c) inside the pilot window, /api/v1/auth/signup returns session: null and the app shows a panel pointing at the login screen — deliberately silent, because session: null means 'already registered' OR 'awaiting confirmation' and the server keeps them byte-identical to avoid an account-enumeration oracle. With no working mailer (FM2) there would be no escape hatch either.",
      "early_warning_signs": ["mailer_autoconfirm reads false on a weekly settings poll", "auth.users rows with email_confirmed_at IS NULL that never gain a session", "testers report 'me manda a ingresar pero no entro'"],
      "tripwires": [
        {"threshold": "mailer_autoconfirm != true or disable_signup != false on >= 1 of the weekly reads", "read_from": "GET https://agnwyifsdxxoznodutgq.supabase.co/auth/v1/settings (public endpoint, anon key)"},
        {"threshold": "count of auth.users created in last 24h with email_confirmed_at IS NULL >= 1", "read_from": "Supabase SQL editor"},
        {"threshold": "signups in first 48h < 10 of 14", "read_from": "Supabase SQL (auth.users created_at)"}
      ],
      "playbook": {
        "contain": "Stop inviting testers; tell those already in to wait rather than retry (each retry spends auth_signup_ip 3/min-15/hr per address, login-limits.ts:112).",
        "assess": "Re-read the settings endpoint, run the two SQL counts, and determine whether the flip was the A09-1 decision (deliberate) or a dashboard accident.",
        "respond": "Either turn confirmations back OFF for the pilot window and close A09-1 with BACKLOG.md:193 option (a) or (b) instead, or leave them ON and fix FM2 first — never ON with no working mailer."
      },
      "proactive_mitigation": ["QA loop today: add the /auth/v1/settings poll to the weekly cadence — one HTTP call, the only machine-readable view of a dashboard nobody here can open", "PO before invitations: when deciding A09-1, choose option (a) or (b) and record that (c) is deferred until after the pilot"],
      "stop_rule": "If fewer than 10 of 14 testers hold a session 72 h after invitations, pause the pilot and send no reminders until signup is proven end-to-end."
    },
    {
      "id": "FM2",
      "title": "The recovery mail nobody can read the dashboard for",
      "archetype": "process",
      "assumption": "A2",
      "owner": "PO",
      "likelihood_5": 3,
      "impact_5": 2,
      "score": 6,
      "class": "MEDIUM",
      "risk_analysis": "open-work.md:851 lists Resend setup as PO-gated and undone and states the consequence itself: the six-digit recovery code does not travel. RecuperarScreen.tsx:20-23 says the same from the app's side and keeps a browser bridge on screen for that reason. The PO believes the template and SMTP were validated earlier, and nothing readable from this loop can confirm or refute it — no dashboard, no inbox. What shrank this item is A1 plus one hosted count: with autoconfirm on, no confirmation mail is ever sent, and hosted auth.sessions holds 617 rows with 0 not_after values, so no absolute session time-box is configured and a tester who signs in once is never logged out during a four-week pilot. The residual is a forgotten password the PO can reset from the dashboard, plus institutional invitations for the web-side officials the vet/org/govt circuits need.",
      "early_warning_signs": ["a test reset to a non-team address never arrives", "rate-limit or unauthorized-recipient lines in hosted Auth logs", "testers report the code box is empty because the mail carried only a link"],
      "tripwires": [
        {"threshold": "delivery latency to a non-team address > 10 min", "read_from": "inbox + Supabase Auth logs"},
        {"threshold": ">= 1 429/rate-limit line in hosted Auth logs per 24 h", "read_from": "Supabase Logs > Auth"},
        {"threshold": ">= 2 testers reporting 'no me llegó el mail'", "read_from": "tester replies"}
      ],
      "playbook": {
        "contain": "Remove every mail-dependent flow from the tester script; hand the 14 their credentials out of band and tell them not to sign out.",
        "assess": "Send one reset to a team address and one outside it — if only the first arrives, the mailer is restricted, not slow.",
        "respond": "Reset the affected password from the Supabase dashboard rather than waiting on the mail path; finish the Resend wiring (domain -> key -> SMTP -> env) before week 2 and declare recovery unsupported in the tester note until then."
      },
      "proactive_mitigation": ["PO today, one minute: send one password reset to an address outside the project team, time it, and read whether it carries a 6-digit code or only a link — that single test answers both halves of A2", "QA loop today: draft the one-line tester-note sentence declaring recovery unsupported, so the PO's answer only has to select it or delete it"],
      "stop_rule": "Do not advertise password recovery to testers while a reset to an outside address fails, exceeds 10 minutes, or arrives without a code."
    },
    {
      "id": "FM3",
      "title": "Step 2 sends them to a browser that asks who they are again",
      "archetype": "human",
      "assumption": "A3",
      "owner": "PO (script), QA loop (measure)",
      "likelihood_5": 4,
      "impact_5": 3,
      "score": 12,
      "class": "HIGH",
      "risk_analysis": "Identity completion is deliberately not native, because a second identity capture would fork the definition the Mi Argentina federation path must slot into (invariant #6, CLAUDE.md:18; the argument is identidad-pendiente.tsx:3-13). The consequence is that the app hands a signed-in person a URL that opens signed out and asks for the same credentials. The screen says so plainly, which is right and does not make the step shorter. A tester who does not complete it can register no pet and receive no credential, so every downstream flow is gated behind a hand-off nobody has scripted: docs/mobile/ contains four files and none is a tester script. This is the only top-three item with no mitigation of any kind in the tree or on the board.",
      "early_warning_signs": ["auth.users rows with no matching profiles row", "testers asking what to do after the handoff", "the /registro link opened and abandoned"],
      "tripwires": [
        {"threshold": "count of auth.users since pilot start with no profiles row >= 3", "read_from": "Supabase SQL"},
        {"threshold": "median gap between auth.users.created_at and profiles.created_at > 48 h", "read_from": "Supabase SQL"},
        {"threshold": ">= 2 testers asking what to do after the handoff", "read_from": "tester replies"}
      ],
      "playbook": {
        "contain": "Send the 14 a three-line note naming the handoff before they hit it.",
        "assess": "Run the profile-less-account query; concentration on one day means the script, not the design.",
        "respond": "Keep the handoff (it protects invariant #6) and fix the words, not the architecture."
      },
      "proactive_mitigation": ["QA loop today: walk the whole path on the emulator and record the exact tap count and every prompt", "PO today: approve the resulting tester note before invitations go out"],
      "stop_rule": "If more than a third of testers hold an account with no profile at 72 h, stop inviting and rewrite the onboarding note first."
    },
    {
      "id": "FM4",
      "title": "The tally stops one build short of the one testers hold",
      "archetype": "process",
      "assumption": "A4",
      "owner": "PO",
      "likelihood_5": 2,
      "impact_5": 2,
      "score": 4,
      "class": "LOW",
      "risk_analysis": "eas-build-profiles.md:9-11 designates its own tally as the record, and measured 2026-09-04 the tally is CURRENT: its last row is build 9 (5704cf7c, commit 02db08408) at :249, written the same day in 02658b0d0, and rg 'build 10|versionCode 10' over docs/ returns nothing because build 10 has not been built. :260-266 records eas build:list answering for every row on 2026-09-03. The original claim — a versionCode-10 AAB on the track against a tally ending at 9 — was false. What remains is prospective: build 10 will be built, uploaded and installed by fourteen people, and because appVersionSource is remote only eas build:list can answer which commit that is (:133-138). The file documents the cost at :276-280: build 7 failed on 2026-09-02 and sat unnoticed for a day while the tester round was assumed to be running.",
      "early_warning_signs": ["the tally's last row is not the build on the track", "a Sentry release string matching no recorded build", "the PO cannot say which commit is installed"],
      "tripwires": [
        {"threshold": "eas build:list shows >= 1 finished production build whose appBuildVersion is absent from the tally at eas-build-profiles.md:249 (false today — that is the baseline)", "read_from": "EAS CLI"},
        {"threshold": ">= 1 Sentry release tag matching 0 rows in the tally", "read_from": "Sentry"},
        {"threshold": "> 24 h between a build finishing and its row being written", "read_from": "doc git history"}
      ],
      "playbook": {
        "contain": "Treat the doc as untrusted the moment the first tripwire fires; take build facts from eas build:list directly until reconciled.",
        "assess": "Pull the last five builds as JSON and map appBuildVersion -> id -> gitCommitHash -> Play release.",
        "respond": "Write the row for build 10 and record its commit sha in the Play release notes so the records cannot diverge silently again."
      },
      "proactive_mitigation": ["QA loop, the hour build 10 finishes: run eas build:list --platform android --limit 5 --json and hand the PO the exact tally row text, so the row is written before the AAB is uploaded rather than after", "PO at upload: paste the commit sha into the Play internal release notes"],
      "stop_rule": "No build may be uploaded, and no incident may be diagnosed, while eas build:list's newest finished production row is absent from the tally."
    },
    {
      "id": "FM5",
      "title": "Build 10 is build 6 again",
      "archetype": "technical",
      "assumption": "A5",
      "owner": "PO (EAS environment)",
      "likelihood_5": 1,
      "impact_5": 5,
      "score": 5,
      "class": "LOW",
      "risk_analysis": "eas.json's production profile pins the API origin and the Supabase URL but carries no anon key — it is an EAS dashboard variable, and release-config.test.ts:140-144 records both that the repo's fence cannot see it and that the variable was created 2026-08-27. authPlaneConfigured() requires both URL and key, and when false useGate renders 'Esta app no está configurada' — exactly what build 6 shipped as. The values are inlined by Babel at build time, so there is no runtime correction: a bad build is a re-upload and a burned versionCode. This is the lowest-likelihood item in the register and stays on it only because the impact is total and the check is one log read.",
      "early_warning_signs": ["the config-error screen on first launch", "zero rows in auth.sessions from the new build despite installs", "install count rising with no auth traffic"],
      "tripwires": [
        {"threshold": "build 10's SPIN_UP_BUILDER env dump listing fewer than 3 EXPO_PUBLIC_* variables", "read_from": "EAS build log, read before upload"},
        {"threshold": "0 successful token grants in hosted Auth logs in the 24 h after first installs", "read_from": "Supabase Logs > Auth"},
        {"threshold": ">= 1 tester screenshot of 'Esta app no está configurada'", "read_from": "tester replies"}
      ],
      "playbook": {
        "contain": "Pull the internal release immediately — an app that cannot authenticate teaches testers it is broken and that impression outlives the fix.",
        "assess": "Read the env dump from build 10's log before rebuilding; the answer is in the log, not in a guess.",
        "respond": "Set the variable in the production EAS environment, rebuild (burning versionCode 11), re-upload manually."
      },
      "proactive_mitigation": ["QA loop, the hour build 10 finishes and BEFORE the AAB is uploaded: fetch and decode its log and assert the three EXPO_PUBLIC_* variables", "PO before inviting: install build 10 on one device and confirm the login screen, not the config screen, appears"],
      "stop_rule": "Pull the build the moment the config-error screen is confirmed on any device; do not wait for a second report."
    },
    {
      "id": "FM6",
      "title": "Something breaks and there is no way to un-break it",
      "archetype": "process",
      "assumption": "A6",
      "owner": "PO",
      "likelihood_5": 3,
      "impact_5": 4,
      "score": 12,
      "class": "HIGH",
      "risk_analysis": "OTA is the only sub-store repair path and it has never run: no channel, no update and no runtime version has ever been served (ota-policy.md:11-18), and the crash-recovery fallback has never been exercised here (:215-216). The policy requires rehearsing on preview first (:185-187), and the only preview APK is 3016d593 (commit 71f7b8ca0), measured 13 commits behind build 9's 02db08408 and 18 behind HEAD 6cccd5b00 — far enough that a fingerprint match cannot be assumed, and a mismatch would deliver a rehearsed hotfix to zero devices. The store path is no better: monotonic versionCode, a failed build burns one, no Play service account so every upload is manual. Of the nine recorded builds in the tally, four errored and one shipped unable to sign anyone in.",
      "early_warning_signs": ["a reproducible defect reported by two or more testers with no remedy available", "the first eas update attempt failing or reaching no device"],
      "tripwires": [
        {"threshold": "time from a confirmed tester-blocking defect to a remedy on a device > 72 h", "read_from": "PO's own clock"},
        {"threshold": "a rehearsal eas update --channel preview reaching 0 of 1 devices within two opens", "read_from": "eas update:list / device"},
        {"threshold": "eas fingerprint:compare returning >= 1 differing runtime-version field for preview vs production", "read_from": "EAS CLI"}
      ],
      "playbook": {
        "contain": "Publish nothing to production that has not landed on preview first — preview is the only cheap place a bad bundle exists.",
        "assess": "Run eas fingerprint:compare before believing any hotfix will reach anyone.",
        "respond": "If fingerprints differ, the fix is a store release, not an update; plan the versionCode burn rather than discovering it."
      },
      "proactive_mitigation": ["PO this week, before invitations: build one preview APK from build 10's exact commit so a fingerprint-matching rehearsal target exists — the current one is 13 commits stale", "QA loop this week: publish and verify one no-op OTA against it so the mechanism is watched running once before it is needed"],
      "stop_rule": "If a tester-blocking defect has no delivery path within 72 h of confirmation, pause the pilot rather than let fourteen people keep hitting it."
    },
    {
      "id": "FM7",
      "title": "The app hands the tester back to the web at the moments that matter",
      "archetype": "human",
      "assumption": "A7",
      "owner": "PO (turnos data, photo-module go-ahead), QA loop (enumerate)",
      "likelihood_5": 4,
      "impact_5": 3,
      "score": 12,
      "class": "HIGH",
      "risk_analysis": "The 'four dead ends' framing did not survive measurement; the four findings are of unequal weight. (1) The turnos search cannot filter by locality and the only live windows are CABA (BuscarTurnoScreen.tsx:22-26,157; hosted 2026-09-04: 75 rules, 2 live, both CABA, 1520 slots) — DELIBERATE SCOPE for the filter, with the DATA gap under a PO mitigation IN PROGRESS: the pilot runs mostly in La Matanza and a live campaign will be seeded there before build 10 (PO 2026-09-04). (2) The check-in QR names no screen (turnos-view-model.ts:27-35; deep-link-map.ts:284,487; __tests__/deep-link-map.test.ts) — DELIBERATE SCOPE and NOT a path a tester walks: a declared, fenced debt and a placeholder payload for a front-desk reader; the tester renders the QR, nothing follows it. (3) The photo screen refuses only when getImagePickerPort().available is false (PetPhotoScreen.tsx:87-100), true for every build because expo-image-picker is not installed — DELIBERATE SCOPE per camera-modules-handback.md:33-36 ('nothing above is a dead end … that is the seam's whole point'), install gated behind the Data Safety re-file. (4) expo-notifications appears nowhere in apps/mobile — UNVERIFIED: absent by omission with no recorded decision anywhere, and not fixable under a small-and-reversible rule. What a tester outside a seeded locality experiences is an empty turnos search pointing at the web, a photo step pointing at the web, and nothing ever announcing a transfer offer, a sighting or a caretaker grant until they open the app.",
      "early_warning_signs": ["median sessions per tester per week falling after week 1", "turnos searched with zero results outside the seeded localities", "the app opened once and never again"],
      "tripwires": [
        {"threshold": "count of service_schedule_rules with effective_until null in La Matanza = 0 at 24 h before invitations", "read_from": "Supabase SQL over hosted"},
        {"threshold": ">= 8 of 14 testers with fewer than 3 sessions in week 2", "read_from": "Play Console vitals / Sentry sessions"},
        {"threshold": "count of appointments created since pilot start = 0 after week 1", "read_from": "Supabase SQL"},
        {"threshold": ">= 3 testers reporting an empty turnos search", "read_from": "tester replies"}
      ],
      "playbook": {
        "contain": "Rewrite the tester script around flows that work end-to-end; mark photo as look-only with the reason.",
        "assess": "Run the emulator sweep and produce the definitive native / hands-off / absent classification of all named flows.",
        "respond": "Confirm the La Matanza seed landed before invitations; if it did not, drop turnos from pilot scope explicitly rather than letting it read as a bug."
      },
      "proactive_mitigation": ["PO before build 10 (IN PROGRESS): seed the La Matanza campaign on hosted and confirm at least one live service_schedule_rules row with effective_until null and open future slots there", "QA loop today: run each named flow on the emulator against local as a seeded owner outside CABA and classify it complete / hands-off-to-web / absent, so the tester script is written from the classification"],
      "stop_rule": "If the La Matanza seeding tripwire reads 0 at 24 h before invitations, turnos is cut from the pilot's scope in writing before the invitations go out, not after the complaints."
    },
    {
      "id": "FM8",
      "title": "A tester's DNI leaves the country inside a crash report",
      "archetype": "technical",
      "assumption": "A8",
      "owner": "QA loop (probe), PO (decide A09-1)",
      "likelihood_5": 2,
      "impact_5": 5,
      "score": 10,
      "class": "HIGH",
      "risk_analysis": "Sentry is live in the binary and its Sentry.init sets sendDefaultPii false and tracesSampleRate 0 but has no beforeSend and no beforeBreadcrumb, so exception messages and http breadcrumbs travel verbatim to a third party — filed as A06-2 (MED) with the web's redact.ts named as the correct form the app does not use. sendDefaultPii false keeps the SDK from attaching its own PII, so the exposure is what the app writes into a message: free text, form values and query strings, not the identity column, which is hashed at its real boundary. But this pilot is the first time real people type real data into the binary. Separately A09-1 (HIGH, open, po-decision) lets anyone who knows an addressee's e-mail take titularidad through the transfer-accept e-mail arm — and A1's measurement makes it live TODAY: SYNTHESIS.md:26 scopes the attack to 'whatever confirmation policy is actually live', and the live policy is autoconfirm, no barrier at all. The PO decision this document asks for is a real fork, and one of its three options (turn confirmations ON) fires FM1.",
      "early_warning_signs": ["a Sentry event whose message contains a 7-8 digit run", "a transfer accepted by an account created after the invitation was sent"],
      "tripwires": [
        {"threshold": ">= 1 Sentry event matching \\d{7,8} in message or breadcrumb text", "read_from": "Sentry search"},
        {"threshold": ">= 1 custody transfer accepted by a profiles row created after the transfer was proposed", "read_from": "Supabase SQL over the event spine"},
        {"threshold": "crash-free session rate < 99% in any week", "read_from": "Sentry"}
      ],
      "playbook": {
        "contain": "Disable Sentry event ingestion at the project level rather than shipping a build.",
        "assess": "Export the affected events and determine whether any carries a real identifier — a hash is not an incident, a digit run is.",
        "respond": "Add beforeSend/beforeBreadcrumb reusing the web's redact rules in the next store release and record the exposure window in docs/architecture/privacy-known-limitations.md."
      },
      "proactive_mitigation": ["QA loop today: force a crash on the emulator with a fake DNI in a free-text field and inspect the Sentry payload", "PO before invitations: decide A09-1 using BACKLOG.md:193 option (a) or (b) — gate the e-mail arm on email_confirmed_at, or bind the invitation to a single-use secret — and NOT option (c), which fires FM1 mid-pilot"],
      "stop_rule": "Any confirmed real identifier in a third-party system pauses the pilot immediately and starts an incident record."
    },
    {
      "id": "FM9",
      "title": "Three weeks pass and nobody can say what happened",
      "archetype": "human",
      "assumption": "A9",
      "owner": "PO",
      "likelihood_5": 3,
      "impact_5": 3,
      "score": 9,
      "class": "HIGH",
      "risk_analysis": "The app has no in-app feedback surface anywhere in apps/mobile; the only 'escribinos' is an error sentence with no channel behind it (claim-view-model.ts:162), and ajustes.tsx offers only profile edit, sign-out and session revoke. There is no push, so nothing prompts a tester to say anything. The crash channel IMPROVED on measurement: the sentry-cli path failure that errored build 7 is fixed — @sentry/cli is a direct dependency of apps/mobile precisely so the path Gradle guesses exists (app.config.ts:228-241, package.json:23) — and builds 8 and 9 both finished with @sentry/react-native/expo in plugins. The often-cited 'no source map ships, and nothing collects a crash' measurement at eas-build-profiles.md:1348-1357 predates Sentry (:1143), so its second half is already false and its first half is contested by a build task that now runs. What nobody has done is read one event from a shipped build and see whether a frame carries a file and a line. The evidence base is therefore fourteen people volunteering unprompted messages to one non-technical PO, plus Play vitals, plus a crash channel that is probably alive and unverified.",
      "early_warning_signs": ["week 1 ends with fewer than half the testers having said anything", "Sentry events with no file/line", "feedback that is 'no anda' with no reproduction"],
      "tripwires": [
        {"threshold": "< 7 of 14 testers having sent any message by day 7", "read_from": "tester replies"},
        {"threshold": "0 Sentry events from build 10 carrying a JS frame with file and line, at day 7", "read_from": "Sentry"},
        {"threshold": ">= 3 reports with no reproduction steps and no follow-up possible", "read_from": "PO's own log"}
      ],
      "playbook": {
        "contain": "Replace open-ended solicitation with one named task per week and one yes/no question.",
        "assess": "Check whether a build-10 Sentry event carries a readable JS stack; if not, the crash channel is not a channel.",
        "respond": "If symbolication is dead, make app version plus screenshot a standing request, since that is then the only reproduction evidence available."
      },
      "proactive_mitigation": ["PO today: write the weekly one-question prompt for all four weeks before the pilot starts", "QA loop this week: force one crash from a production-profile build and confirm Sentry shows a file and a line — the blocker that made this untestable is fixed, so it is answerable before the pilot"],
      "stop_rule": "If day 14 ends with 0 readable JS frames AND fewer than 7 of 14 testers having replied once, the pilot is extended rather than concluded and no report may be written from that evidence base."
    }
  ]
}
```

## Validation log

Fresh-context validation run 2026-09-04 against the live hosted project and the tree at `6cccd5b00`. Every citation below was opened with `sed -n` on the cited lines before it was accepted, corrected, or removed.

### Re-scorings driven by measurement

| # | Change | Why | Evidence |
|---|---|---|---|
| V1 | **FM1: 4×5 = 20 CRITICAL → 2×5 = 10 HIGH.** A1's statement rewritten from "confirmation is OFF" to "will still be OFF on invitation day"; `test_now` replaced with the settings-endpoint call; falsifier rewritten to the two field values. | `GET https://agnwyifsdxxoznodutgq.supabase.co/auth/v1/settings` 2026-09-04 07:20Z returned `disable_signup: false`, `mailer_autoconfirm: true`, `external.email: true`. Confirmation is OFF; the belief the code encodes is TRUE. | Live endpoint; the assumption stays an assumption because it is still a belief about a dashboard setting nobody here can read. |
| V2 | **The "measured contradiction" removed** and replaced with a staleness note that explains the misread. | `SYNTHESIS.md:26` reads "42/43 users confirmed, 0 unconfirmed-with-login" as proof of an active confirmation gate. Autoconfirm stamps `email_confirmed_at` on every row, so that is autoconfirm's own signature, not a gate's. The line is stale AND was an inference error. | `docs/reviews/2026-09-fresh/SYNTHESIS.md:26` (verified verbatim). |
| V3 | **FM1 likelihood is 2, not 1** — a coupling this premortem creates itself. | `BACKLOG.md:193` lists "turn `enable_confirmations` ON, which closes it at the root" as option (c) for A09-1, and this document's FM8 asks the PO to decide A09-1 before the pilot. FM8's mitigation can fire FM1. FM8's proactive mitigation now names (a)/(b) and forbids (c) for the pilot window. | `docs/reviews/2026-09-fresh/BACKLOG.md:193` (verified). |
| V4 | **FM4: 4×2 = 8 MEDIUM → 2×2 = 4 LOW.** Title changed from "The tally says 9 and the track says 10". A4 rewritten as prospective. | **Build 10 does not exist.** `rg "build 10\|versionCode 10"` over `docs/` returns nothing; the tally's last row is build 9 (`5704cf7c…`, commit `02db08408`, "AAB handed to the PO for the manual Play upload"), written 2026-09-04 in `02658b0d0`. HEAD is `6cccd5b00`, four commits later. The original premise was false. | `docs/mobile/eas-build-profiles.md:249`; `git log`. |
| V5 | **Removed FM4's "nobody has run it since build 9"** and the tripwire marked "true today". | `eas-build-profiles.md:260-266` records `npx eas-cli build:list --json` answering for every row on 2026-09-03 and confirming the versionCode derivation. The tally is current and moved twice in 48 h. The tripwire is now stated with "false today — that is the baseline". | `docs/mobile/eas-build-profiles.md:260-266`. |
| V6 | **FM5: 2×5 = 10 HIGH → 1×5 = 5 LOW**, and A5's `test_now` relabelled a **pre-upload gate**. | Build 10 does not exist, so nothing about it is testable today. The likelihood evidence is stronger than the original text said: `release-config.test.ts:140-144` records the EAS variable was **created 2026-08-27**, not merely that the fence cannot see it. | `apps/mobile/src/release/release-config.test.ts:140-144`; `docs/mobile/eas-build-profiles.md:1223-1227`. |
| V7 | **FM2: 4×4 = 16 CRITICAL → 3×2 = 6 MEDIUM.** Title changed; A2 extended to cover the template, not only delivery. | A1 removes the confirmation arm entirely (autoconfirm sends no confirmation mail), and hosted `auth.sessions` holds **617 rows with 0 `not_after`** — no absolute session time-box, so a tester who signs in once is never logged out during a four-week pilot. The residual is a forgotten password the PO can reset from the dashboard. The PO's belief that the template/SMTP were validated is recorded and kept unverified. | Hosted SQL; `docs/agents/open-work.md:851`. |
| V8 | **FM7: 5×3 = 15 CRITICAL → 4×3 = 12 HIGH**, title changed from "Fourteen testers arrive at four dead ends", and a classification table added. | The four findings are not four of the same thing — see the FM7 dead-end classification below. Two are documented deliberate scope, one is a debt no tester walks, and the turnos data gap has a PO mitigation in progress (La Matanza seed before build 10, PO 2026-09-04) with its own tripwire. | See classification table. |
| V9 | **FM9's evidence corrected**; likelihood/impact unchanged at 3×3 = 9. | The claim "the upload task … has never been observed succeeding end-to-end" is **wrong**. The `sentry-cli` START failure is fixed: `@sentry/cli` is a direct dependency of `apps/mobile` for exactly that reason, and builds 8 and 9 both finished with `@sentry/react-native/expo` in `plugins`. What is unverified is whether an event carries a file and a line. | `apps/mobile/app.config.ts:228-241`, `:241`; `apps/mobile/package.json:23`; `docs/mobile/eas-build-profiles.md:1088-1099`, `:1143`. |
| V10 | **FM8 strengthened** (score unchanged at 2×5 = 10) with two facts the original omitted. | (a) `Sentry.init` also sets `sendDefaultPii: false` and `tracesSampleRate: 0` — a partial mitigation that belongs in the risk analysis. (b) A09-1 is exploitable **today**: `SYNTHESIS.md:26` scopes it to "whatever confirmation policy is actually live", and A1 measured that policy as autoconfirm — no barrier. | `apps/mobile/src/observability/sentry.ts:41` (verified: no `beforeSend`, no `beforeBreadcrumb`); `BACKLOG.md:40`, `:62` (A06-2 is **MED**, now stated). |

### FM7's four "dead ends" — classification

| Finding | Classification | Basis |
|---|---|---|
| Turnos: no locality filter, live windows only in CABA | **DELIBERATE SCOPE** (filter) + **PO mitigation IN PROGRESS** (data) | `BuscarTurnoScreen.tsx:22-26` states it and gives the reason ("wiring it here is a further slice"); empty state at `:157` verified verbatim. Hosted 2026-09-04: 2 live rules, both CABA. La Matanza seed decided 2026-09-04, plan being written; tripwire added on the seeded rows. |
| Check-in QR → `+not-found` | **DELIBERATE SCOPE**, and **not a tester-walked path** | `turnos-view-model.ts:27-35` verified verbatim ("A phone that FOLLOWED it would land on `+not-found`"). It is a fenced, declared debt: `APP_PATH_NAMES_NO_SCREEN` has exactly one member (`packages/contract/src/links/deep-link-map.ts:284`), `deepLink…` returns null for it (`:487`), it is asserted in `__tests__/deep-link-map.test.ts:24` and documented at `TurnoDetailScreen.tsx:26-33`, `app/turnos/[appointmentToken].tsx:3-9` and `open-work.md:392`. The tester renders the QR on their own screen; nothing in the app follows it. Changing the string would make the web and the phone print different codes for one turno. Hold for the PO — it closes when the front-desk reader is built. |
| Pet photo "refuses in-app" | **DELIBERATE SCOPE** — and the original wording was wrong | `PetPhotoScreen.tsx:87-100`: the refusal is **conditional** on `getImagePickerPort().available === false`, which is true for every build so far only because `expo-image-picker` is not installed. `docs/mobile/camera-modules-handback.md:33-36` is the deliberate handback and says so: "In a build without the modules, nothing above is a dead end: the photo screen draws a callout naming the web … that is the seam's whole point." The install is one `npx expo install` and "mechanical agent work the day the PO says go", but it is gated behind the Data Safety re-file (`open-work.md:849`). **Not QA-loop fixable under a small-and-reversible rule** — it needs a new EAS build. |
| No `expo-notifications` anywhere | **UNVERIFIED** | `rg --color=never -n "expo-notifications" apps/mobile/package.json apps/mobile/app.config.ts` returns **zero**, and so does a sweep of all of `apps/mobile/`. But unlike the other three, **no document anywhere declares push out of scope** — it is absent by omission with no recorded decision. Not fixable by the QA loop: it needs a native module, a new EAS build, a Data Safety change and a server-side token store. |

### Citations corrected

| Was | Now | Note |
|---|---|---|
| `docs/agents/open-work.md:848` | `:851` | The Resend row. Verified verbatim at 851. |
| `docs/agents/open-work.md:846` | `:849` | The Data Safety row (external shock). Verified verbatim at 849. |
| `eas-build-profiles.md:132-138` | `:133-138` | Off by one; 132 is blank. |
| `eas-build-profiles.md:230-234` | `:229-233` | Off by one. "A failed build costs a `versionCode`" is at 233. |
| `eas-build-profiles.md:279-280` | `:276-280` | Widened to carry the whole "sat unnoticed for a day" sentence. |
| `ota-policy.md:184` | `:185-187` | Off by one; step 4 (`eas update --channel preview`) starts at 185. |
| `ota-policy.md:216` | `:215-216` | Widened; the sentence starts on 215. |
| `ota-policy.md:63-64` | `:62-64` | Widened; the sentence starts on 62. |
| `release-config.test.ts:141` | `:140-144` | Off by one, and widened to capture "created 2026-08-27", which the original evidence dropped. |
| `useGate.tsx:108-112` | `:105-116` | Widened to the whole `UnconfiguredScreen`. |
| `api.ts:79` | `:78-80` | Widened to the whole `authPlaneConfigured`. |
| `identidad-pendiente.tsx:15-19` / `:4-13` | `:15-18` / `:3-13` | Both off by one at an edge. |
| `CrearCuentaScreen.tsx:32` + `:41-48` | `:32-48` | Merged; both citations point into one comment block. |
| `RecuperarScreen.tsx:174,249-252` and `:22`, `:193` | `:20-23`, `:172-177`, `:190-194`, `:246-256` | All four were near-misses. 20-23 is the template claim, 172-177 the 6-digit promise, 190-194 the code field, 246-256 the browser-bridge apology. |
| `PetPhotoScreen.tsx:92-95` | `:87-100` | Widened, because 92-95 shows the callout without the `getImagePickerPort().available` guard above it — which is the entire difference between "refuses" and "this build has no picker module". |
| `eas-build-profiles.md:1348-1357` | kept, staleness named | The citation is accurate; the claim built on it was not. That measurement predates Sentry (`:1143`), so "nothing collects a crash" is already false. |
| `SYNTHESIS.md:26`, `BACKLOG.md:40/:62/:193`, `CLAUDE.md:17/:18`, `AGENTS.md:1102-1111/:762`, `eas.json:30-37`, `sentry.ts:41`, `api.ts:196`, `signup.ts:145-152`, `BuscarTurnoScreen.tsx:22-26/:157`, `turnos-view-model.ts:27-35`, `eas-build-profiles.md:9-11/:98-102/:174-177/:245/:249/:1088-1099/:1143/:1223-1227`, `ota-policy.md:11-18/:193-198` | **unchanged — verified correct** | Sixteen further citations opened and confirmed verbatim. |

### Numbers corrected

| Was | Now | Evidence |
|---|---|---|
| "the only preview APK is build 7 … **two commits** behind what shipped" | **13** commits behind build 9's commit `02db08408`, **18** behind HEAD `6cccd5b00` | `git rev-list --count 71f7b8ca0..02db08408` = 13; `…..HEAD` = 18. This makes FM6 worse, not better. |
| "**five of the last eight** builds errored or shipped dead" | **five of the nine** recorded builds | The tally (`:240-249`) has 10 rows, one of which ("1 — consumed before the first recorded build") is not a build. Of the nine builds: 4 errored (2, 3, 4, 7) and 1 shipped unable to sign in (6). |
| "**four of the last eight** builds errored" (FM6) | **four of the nine** recorded builds errored, and 2 of 4 shipped artifacts carried a blocking defect | Same tally. |
| `auth_signup_ip` "3/min · 15/hr" | unchanged — **verified**, and "per address" added | `src/modules/auth/application/login-limits.ts:112`, `signup-limits.ts:95`. |

### Structural fixes

- **`stop_rule` must be a hard condition.** FM4 and FM9 both read `"None — …"`, which is not a rule. FM4 is now "No build may be uploaded, and no incident may be diagnosed, while `eas build:list`'s newest `finished` `production` row is absent from the tally." FM9 is now "If day 14 ends with **0** readable JS frames **and** fewer than 7 of 14 testers having replied once, the pilot is extended rather than concluded and no report may be written from that evidence base."
- **Non-numeric tripwires made numeric.** FM1's "the toggle reads ON" became `mailer_autoconfirm != true … on ≥ 1 of the weekly reads`, with the endpoint named. FM6's `fingerprint:compare` tripwire became "≥ 1 differing runtime-version field" and its OTA tripwire "0 of 1 devices". FM9's symbolication tripwire gained a deadline ("at day 7"). FM4's "true today" was removed and replaced with the correct baseline. FM7 gained a fourth, load-bearing tripwire on the La Matanza seeded rows.
- **Cadence table**: added a recurring **Weekly** row carrying the `/auth/v1/settings` poll (costs one HTTP call, needs no dashboard) and a **Before invitations** row carrying the five pre-flight gates that must not wait for day 1.
- **`## Inputs for the QA loop`** rebuilt as two ordered, deduplicated, assumption-tagged tables: nine items the QA loop can execute (emulator, hosted read-only SQL, `eas build:list`) and eight the PO must execute (dashboard, inbox, Play Console). Items 7–9 are marked as gated on build 10 existing.
- **QA-loop precondition added.** `docs/mobile/emulator-runbook.md:7-12` records that as of 2026-09-01 step 3 did **not** reproduce — `expo run:android` failed four out of four times in `:react-native-worklets:buildCMakeDebug` (T5, `:242-340`) and no APK was produced, so the run-book's own verification step "has never been executed as written". Four of the nine QA-loop items depend on that dev client. Flagged at the top of the inputs section rather than assumed away.
- **1:1 mapping re-checked**: 9 assumptions, 9 failure modes, A1→FM1 … A9→FM9, each assumption used exactly once. The External Shock deliberately carries no assumption (it is not an execution failure) and stays out of the ranking.
- **Generic-template check**: every failure mode was re-read for whether it could be pasted into another project unchanged. All nine now turn on this repo's own evidence — a fenced deep-link constant, a named handback doc, a specific EAS variable creation date, a measured commit distance, a hosted rule count. FM9 was the closest to generic ("the pilot will produce feedback") and is now anchored to `claim-view-model.ts:162`, `ajustes.tsx` and the Sentry-plugin state.
- **JSON block regenerated** to mirror the corrected markdown: two keys, 9 assumptions and 9 failure modes, with every re-scored `likelihood_5`/`impact_5`/`score`/`class`, the rewritten stop rules, the new tripwires and the corrected citations.

### Still ungrounded (flagged, not fixed)

- **A2 cannot be closed from here at all.** No inbox, no Supabase dashboard. The PO's one-minute test is the only instrument, and it is P1 in the inputs table for that reason.
- **A9's decisive question is unanswerable until a build ships.** Whether a Sentry event carries a file and a line needs a `production`-profile install and a real crash; every prior statement about it in the tree is either pre-Sentry or inferred.
- **The emulator dev client's buildability is itself untested** as of the last written measurement (2026-09-01, 4/4 failures). If it still does not build, four of the nine QA-loop items cannot run and T5 is the pilot's real first blocker.
- **Push (`expo-notifications`) has no recorded decision anywhere.** It is the one FM7 component that is absent rather than declared, and until someone writes down whether that is intentional it should not be counted as scope.
