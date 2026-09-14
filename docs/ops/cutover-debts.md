# Cutover debts — what must be true before miMAR runs for real

> Opened 2026-09-14 by PO decision: "antes de salir en serio reseteamos todo y lo dejamos bien".
> Today there is ONE environment ("ensayo", Vercel `dim-staging` + Supabase `DIM-staging`),
> and it carries real testers, synthetic seed data and demo accounts side by side.
> This page is the list of things that are acceptable in that environment and are NOT
> acceptable in a real one. Append as they appear; strike through (`~~ ~~`) when done, with the date and evidence.

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
  `owner@`, `lilian@`, `orgadmin@`, `admin@dim.test` all share `Test1234!`
  (`scripts/seed-test-users.ts:161`), and `admin@dim.test` is a superadmin.
- [ ] **A tester's password was set by hand via SQL** (2026-09-13, one closed-test tester — the PO knows which;
  no personal data here), bypassing the password policy and leaked-password check). Ask her to choose her own before
  cutover, or force a reset.

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

- [ ] **Web password recovery** cannot be completed (code-only mail, link-only web flow) —
  Declared debts in `docs/agents/open-work.md`.
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
