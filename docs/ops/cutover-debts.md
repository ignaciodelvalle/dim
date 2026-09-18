# Cutover debts — what must be true before miMAR runs for real

> Opened 2026-09-14 by PO decision: "antes de salir en serio reseteamos todo y lo dejamos bien".
> Today there is ONE environment ("ensayo", Vercel `dim-staging` + Supabase `DIM-staging`),
> and it carries real testers, synthetic seed data and demo accounts side by side.
> This page is the list of things that are acceptable in that environment and are NOT
> acceptable in a real one. Append as they appear; strike through (`~~ ~~`) when done, with the date and evidence.
>
> **PO decision 2026-09-18**: the municipal pilot runs in this same "ensayo" environment;
> production stays a later phase. This page remains the list for that day.

## 1. Credentials and secrets

- [ ] **Rotate the staging database password.** It was pasted into an assistant chat on
  2026-09-14; treat it as disclosed. The PO accepted the risk until cutover. On rotation,
  update **both** Vercel variables in the same sitting — `DATABASE_URL` (transaction pooler,
  6543) and `ANALYTICS_DATABASE_URL` (session pooler, 5432) — then redeploy. Updating only
  one reproduces the 2026-09-12 outage (analytics pool on a stale password → Supavisor
  `ECIRCUITBREAKER`, /admin, /gob and org dashboards dead while the rest of the app looks fine).
- [ ] **Mark both database variables Sensitive in Vercel** once the values are confirmed
  working (Sensitive values cannot be read back — verify first, lock after). Keep a copy in a
  password manager; `vercel env pull` will not return them.
- [ ] **Demo accounts must not exist in a real environment.** `govt@`, `govt-local@`,
  `owner@`, `lilian@`, `orgadmin@`, `admin@dim.test` all share the same published demo
  password (`scripts/seed-test-users.ts:161`), and `admin@dim.test` is a superadmin.

  **Verified 2026-09-16, and the four legs matter together rather than separately.** The
  repository is `visibility: PUBLIC` and `scripts/seed-test-users.ts` is tracked in it, so the
  password is not a secret and never was. `admin@dim.test` is role `admin`, `active`, email
  confirmed, and carries a real `last_sign_in_at` (2026-09-15 16:07) — it is a live superadmin,
  not a dormant fixture. And `www.mimar.com.ar` resolves to the `dim-staging` Vercel project
  against Supabase `agnwyifsdxxoznodutgq`, which is the same environment those accounts live in.
  A published credential, on a superadmin, on a domain anyone can reach.

  **PO decision 2026-09-16: it stays until we stand up production, and we do not touch it now.**
  The reasoning is that staging is currently the demo environment and the accounts are what make
  the demos possible; the debt is accepted knowingly, with the shape above written down so the
  decision can be revisited if the domain's audience changes. Closing this item means, at
  minimum: the accounts are not seeded into the production project at all, and any that exist in
  staging after cutover get passwords that are not in the repository.
- [ ] **A tester's password was set by hand via SQL** (2026-09-13, one closed-test tester — the PO knows which;
  no personal data here), bypassing the password policy and leaked-password check). Ask her to choose her own before
  cutover, or force a reset.
- [ ] **Change the password of the superadmin demo account `admin@dim.test`** from the Supabase
  dashboard before the pilot's first day — its current password is published in the public repo
  (see above). Dated 2026-09-18.

  **Extended 2026-09-18 (security review MEDIUM-1): every seeded `govt` account, not only the
  superadmin.** `govt@dim.test`, `govt-local@dim.test`, `lucas@dim.test` and any other seeded
  `govt`, plus `nacional@dim.test` (country-wide read scope, so it overlaps every pilot), share the
  same published password and see real citizens' reports inside their assigned localities. Before a
  jurisdiction is onboarded, each seeded account whose scope overlaps it is deactivated
  (`/admin/govts/[userId]`, which also revokes its localities) or gets a new password — and
  `orgadmin@`/`owner@` too when their seeded org or pets fall inside it. The runbook step is
  `docs/pilotos/onboarding-municipio.md` §0.1. New passwords go to the password manager, never
  into a doc.

  **Two traps the runbook step now calls out explicitly (security review LOW-C,
  2026-09-18).** Changing a demo account's password does not revoke refresh tokens already
  issued to it — a session opened before the change keeps working after, so closing an
  account also needs `admin.signOut` / deleting its sessions from the Supabase Auth
  dashboard, or deactivating it outright. And no seed/bootstrap script
  (`seed-test-users`, `pnpm db:bootstrap`, any `seed:*`) may ever run against the pilot
  environment — every one of them recreates `*@dim.test` with the published demo password,
  undoing any close-out done here without anything flagging it.

## 2. Environments

- [ ] **Stand up a production environment separate from "ensayo"** — its own Supabase project
  and its own Vercel project. Today `www.mimar.com.ar` is attached to `dim-staging`.
- [ ] **Decide what happens to the real accounts created during the closed test** (testers,
  vets, the gift transfer from 2026-09-12): migrate them, or ask them to re-register. They live
  in the same database as ~41k synthetic pets.
- [ ] **No seed data in production.** 99.7% of staging pets carry a synthetic `seed_tag`
  (panorama / cursor-bulk), plus 5,741 seeded welfare reports whose closures carry no
  resolution notes. Nothing a seed script produces may reach the real database.
- [ ] **Recreate Supabase Auth configuration in the new project**: custom SMTP (Resend,
  `smtp.resend.com:465`, `noreply@mimar.com.ar`), the code-only "Reset password" template,
  URL configuration, rate limits, attack protection. None of it travels with a schema migration.
- [ ] **MFA verification-attempt hook requires Supabase Teams/Enterprise; staging on Pro relies
  on GoTrue's per-IP limit only.** The hook (`public.hook_mfa_verification_attempt`, migrations
  0232/0233: 10 wrong codes per hour or 20 per day per account, and enrolment only within 15
  minutes of a real sign-in) exists as a function on Pro but GoTrue never calls it, so a caller
  posting TOTP codes straight to GoTrue — with the password or with a leftover session — meets
  only the per-IP limit. **Accepted by the PO 2026-09-18 as a known cutover debt.** At cutover,
  enable the hook if the plan allows: Authentication → Hooks → MFA Verification Attempt →
  `public.hook_mfa_verification_attempt`.
- [ ] **`NEXT_PUBLIC_SITE_URL` set, non-empty, to the real domain** — the hero QR encodes it,
  and an empty string makes it unscannable.

## 3. Database

- [ ] **Apply every migration to production and recount at apply time** (`pnpm db:migrate:status`
  — never from a number written in a doc). Includes the `pet_events` direct-write lock
  (`0212_pet_events_lock_postgrest_writes.sql`), recorded in
  `docs/presentation/2026-09-oficiales/limites-honestos.md` as written, tested and unapplied —
  verify its state on staging too.
- [ ] **Migration `0188` checksum drift**: it was edited after being applied. Reconcile the
  record before production inherits it.
- [ ] **Legal baseline**: `ar-v1` (PO-signed 2026-08-16) was applied to staging by the PO on
  2026-09-14 03:56 UTC (2 rows, `baseline_version = ar-v1`, audited under the PO's account —
  verified by query); production still needs it. `ar-v2` is an unsigned draft pending legal review. Production needs the reviewed,
  signed dataset applied with `scripts/seed-legal-baseline.ts` (checksum + sign-off gate). Note
  the ar-v2 finding: no Argentine norm mandates microchip; `AGENTS.md:333` and
  `lib/metrics/metric-legal-basis.ts:53-56` still claim otherwise.

- [ ] **Delete the demo "test rules" in CABA · Barracas** — `sterilization`, `microchip_required`
  and `compliance_targets`, all with `legal_basis = 'REGLA DE PRUEBA — no refleja una norma vigente'`,
  inserted 2026-09-14 for the government meeting (audited under the PO's account). They must never
  reach production, and in staging they should go once the meeting is over.
- [ ] **Backups**: the Supabase organization is on plan Pro (verified via API 2026-09-18);
  confirm daily backups in the dashboard and run one restore drill into the local stack (pilot
  contract T5-D2); point-in-time recovery is a paid add-on for the PO to decide.

## 4. Mobile

- [ ] **Production build profile bakes production origins.** `EXPO_PUBLIC_SUPABASE_*` and the
  API base are compiled into the binary; a build pointed at staging cannot be fixed by OTA.
- [ ] **OTA channel separation** between the tester build and the production build.
- [ ] **Apply for production access in Play** after the 14-day closed test (earliest ~2026-09-26);
  discard the stray draft of release 12 on the Alpha track first.
- [ ] **Crash reporting decision.** Docs disagree on whether the app reports crashes to Sentry
  at all (and with what PII filtering) — see
  `docs/architecture/client-error-sink-pending-decision.md`. Resolve before real users.

## 5. Product gaps that should not ship to the public

- [x] **Web password recovery** — closed 2026-09-16. The mail sends a code and the web flow now
  takes that code, so the two halves match. Redemption moved to the browser, which also removed a
  denial-of-service shape nobody had noticed: the server-side verify limiter keyed every request
  in the country under `"deployment"` and capped national recovery at 240 per hour.
- [ ] **Brightness override** left pinned after the public credential; **hardware back** on the
  pet document — same table.

## 6. Legal and privacy (Ley 25.326)

- [ ] **Retention policy** decided and implemented (`docs/architecture/retention-policy-pending-decision.md`).
- [ ] **Rectification** (the R in ARCO) implemented.
- [ ] **Subject-rights coverage**: tables holding personal data outside export/erase
  (`pnpm lint:subject-rights` prints the live count — do not copy a number here).

## 7. CI

- [ ] **Nightly e2e against the real environment**: its red is a consumed fixture (the seeded
  refugio has no live shelter custody), not missing secrets — `.github/workflows/e2e-nightly.yml:48-60`.
  A production smoke suite must not depend on seeded fixtures at all.
- [ ] **`e2e/crisis-seams.spec.ts` seam (d) grows staging by one pet every night** (dated
  2026-09-18, code review). The seam intakes a fresh refugio pet named `E2EIntake-<timestamp>`
  (`e2e/_shelter-custody.ts` `intakeShelterPet`), publishes it for adoption, and has owner2 apply
  and the refugio finalize the adoption — a real, event-sourced custody transfer. Its own
  `beforeAll`/`afterAll` sweep the `E2EIntake-` prefix, but `deletePetsByNamePrefix`
  (`e2e/demo/_db-cleanup.ts`) is LOCAL ONLY by design — a no-op against any non-local database,
  same guard as every other cleanup helper in that file — so on the nightly run against
  `dim-staging` (`.github/workflows/e2e-nightly.yml`) the pet is never removed. **There is no UI
  path that would fix this even if wired in**: the pet is the credential (invariant #1) and
  events are append-only (invariant #2) — there is deliberately no "delete a pet" or "unwind an
  adoption" flow, by design, everywhere else this codebase touches the question (see the header
  comment on `deletePetsByNamePrefix` and `deleteTagsByLotePrefix`). A "rehome" or "mark
  deceased" action would change custody or status, not remove the row, so it would not stop the
  count from growing. Before a real cutover: either (a) this seam must stop running against a
  shared/staging database (scope it to local-only runs, same pattern as
  `e2e/degraded-states.spec.ts`'s `isLocalDatabase()` self-skip), or (b) `_db-cleanup.ts` needs a
  narrowly-scoped, explicitly-opt-in remote cleanup path for CI-manufactured `E2EIntake-` rows
  specifically — never a general remote delete. Until one of those lands, staging's pet count (and
  owner2's registry) grows by one real row per nightly run.
