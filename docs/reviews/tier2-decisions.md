# Tier 2 critique — decisions report (authz & tenancy)

**Verdict: no CRITICAL. Authorization is exceptionally well-defended** (3 CI
linters: check-authz-guards / check-authz-scoping / check-confused-deputy, plus
consistent in-use-case tenant fences). Clean & verified: `role` never
client-writable, one institutional gate on every operator surface, deactivation/
erasure revoke immediately, Mi Argentina premise intact, no impersonation-class
exports, IDOR fences present on every caller-supplied-secondary-id query,
confused-deputy closed, RLS coverage test genuinely tripwires a NO-RLS table,
deny-all tables correct, no `USING(true)` defeats a PII table, no cross-tenant
write.

Auto-fixed in-loop (commits `373afecc`/`d9c3572e`/`3eee210b`/`38c2709e`/`47b23229`):
govt-scope US-1, auth AU-2, auth AU-1, RLS test-hardening R3, and migration
`0140_rls_scope_govt_pii_reads.sql` for R1/R2 — **applied to LOCAL only; Ignacio
must APPLY to remote prod/staging.** Empirical result: **R2 (pet_service_dog) was
a REAL reachable leak** — a govt JWT read all assistance-dog rows nationwide,
verified 1→0 after the fix. **R1 (pet_identifications) was already gated** by
nested-table RLS (its subquery hits `pets`, which has no govt read policy → 0
reads pre & post); the tightening is correct defense-in-depth but changes no
observable PostgREST behavior today. R3's zero-policy check confirmed all 14
deny-all tables carry exactly 0 policies.

## Decisions for the PO / architect (judgment-required)

| # | Sev | Finding | Where | Decision |
|---|---|---|---|---|
| **R1** | **HIGH** | `pet_identifications` govt READ policy matches **province only** (no locality clause) + omits `role='govt'`/`deactivated_at` guards its siblings carry. A govt user assigned to (BA, La Plata), via their authenticated JWT on PostgREST `/rest/v1/pet_identifications`, reads chip/ISO/tattoo PII (Ley 25.326) for EVERY BA locality. On prod (RLS on) this policy is the active defense. **Migration to tighten is written + tested; needs Ignacio to apply.** | `db/migrations/0105_...:96`, live `0137:276` | Confirm the tightening migration + apply to remote. |
| **R2** | MED-HIGH | `pet_service_dog` govt/admin READ policy has NO jurisdiction join — any institutional govt reads assistance-dog status (disability-proxy special-category data) NATIONWIDE. | live `0137:282` | Same batch as R1 — jurisdiction-scope it (migration written). Apply gated. |
| R3 | MED | RLS coverage test asserts RLS-*enabled*, not RLS-*correct* — a table shipped with RLS + a `USING(true)` SELECT policy passes. `matrix.data.ts` is a hardcoded 10-table subset (no `govt` role). **Test hardening auto-applied** (assert zero-policy on the deny-all set + add govt + R1/R2 tables to the matrix). | `__tests__/rls/coverage.test.ts:135`, `matrix.data.ts` | — (auto) |
| R4 | LOW | anon can INSERT `welfare_reports` with a spoofed `reporter_user_id`/`assigned_to`/`status` (`WITH CHECK (true)`). No READ leak (no anon SELECT). Integrity/attribution nuisance; real app inserts via Drizzle. | `db/welfare_rls.sql:12`, `0086:426` | Bind `reporter_user_id` to `auth.uid()` OR null in WITH CHECK? Low priority. |
| AZ1 | LOW | Bare-`requirePetAccess` toggles (`setPetDisclosurePrefsAction`, `tier2-public`, `reactivate-lost-search`, `checkin`, `physical-tag-interest`) admit ANY active member of a custodian org — incl. a foster org with ZERO granted capabilities — because `requirePetAccess` (unlike `requireAlivePetAccess`) doesn't consult capabilities. Not cross-tenant (org holds custody); appears intended. Disclosure prefs control owner-contact visibility on the public lost page. | `app/actions/lost-mode.ts:19` + siblings | Should disclosure toggling require a specific capability for org-path callers? Route through `requireAlivePetAccess` if so. |
| AU3 | INFO | `login.ts` checks `deactivatedAt` but not `deletedAt`; a survived auth row (erasure's best-effort `auth.admin.deleteUser` failed) could get a session, but `requireUserOrRedirect` bounces it on `deletedAt` before any guarded surface. Defense-in-depth inconsistency, no persistent access. | `src/modules/auth/application/login.ts:91` | Add `deletedAt` to login's early reject? Belt-and-suspenders. |
