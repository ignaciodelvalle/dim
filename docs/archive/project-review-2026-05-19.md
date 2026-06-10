# MiMAR / DIM — Project Review

**Date:** 2026-05-19
**Reviewer:** AI agent, sweep of `~671` tracked files, `~58k LOC` in `app/`, 52 server actions, 38 migrations, 82 test files
**Last commit on HEAD:** `cf44f58 feat(govt): per-jurisdiction business rules framework (POC, PPP) (#16)`

## TL;DR

Three categories of findings, in order of urgency:

1. **🚨 STOP-EVERYTHING — Your working tree is corrupted.** 69 source files are truncated relative to `HEAD`, and `.git/index` is unreadable. Before anything else, recover from git. Nothing else in this document matters until that's fixed.
2. **🔴 Real correctness and security bugs** in a handful of server actions — mostly around race conditions, authorization on shared resources (libreta shares, DNI claim, cross-org transfer), and a couple of redirect / token issues. Worth fixing before any real users touch this.
3. **🟡 Hygiene and consistency** — design tokens, form patterns, the half-finished `refugio → org` rename, missing DB indexes, and some schema constraints that live in migrations but not in Drizzle. None of it is bleeding, but it's the kind of debt that compounds.

Overall the project is in surprisingly good shape for a "brought back to life" effort. The spec system in `docs/superpowers/` is unusually well-disciplined; the event-sourcing pattern is real and consistent; tests cover the core flows. The biggest risks are concentrated in a small number of files.

---

## 1. 🚨 Critical: working tree is corrupted

This is the most important finding in this entire review.

### What happened

Running `tsc --noEmit` surfaces **9,326 TypeScript errors**, but they cascade from a small set of broken source files:

- `lib/libreta-sanitaria.ts` — file ends with a block of NUL bytes (`\0`) after line 235
- `lib/role-landing.ts` — truncated at line 21 (HEAD has 46 lines, mid-`switch` statement)
- `lib/rabies-observation-closer.ts` — truncated at line 187 mid-`.where(...)` clause (HEAD has 226)
- `scripts/seed-demo.ts` — unterminated string literal on line 906 (HEAD has more)
- `scripts/seed-storylines-*.ts` — multiple files truncated
- And **65 more tracked files** are shorter in the working tree than they are at `HEAD`

Examples (`HEAD lines` → `working tree lines`):

```
app/actions/events.ts:                          2599 → 2279   (missing 320 lines)
app/actions/bite.ts:                             772 → 687   (missing  85 lines)
app/actions/custody-disputes.ts:                 550 → 483   (missing  67 lines)
app/actions/foster.ts:                           338 → 287   (missing  51 lines)
app/(app)/mis-mascotas/[publicToken]/page.tsx:  1003 → 919   (missing  84 lines)
app/actions/welfare.ts:                          ...
__tests__/lost-pet-broadcast.test.ts:            813 → 779
AGENTS.md:                                       843 → 829
```

On top of that, **`.git/index` is unreadable** — `git status`, `git diff`, and most other git commands fail with `fatal: unknown index entry format 0x70680000` (the hex value changes between calls, which is a tell that random bytes are sitting where the index header should be).

### Likely cause

This is the signature of a partial / interrupted write — most commonly:

- Dropbox / iCloud / OneDrive sync that ran into a conflict or stopped mid-transfer
- An editor or process crashing while saving multiple files
- Disk-level issue (filesystem corruption, disk full)

The fact that `HEAD` is intact and only the working tree is broken says the *repo objects* are fine; the *index* and the *checked-out files* are what got corrupted.

### How to recover

In this order, in a terminal in `C:\Users\ignac\DIM\DIM`:

```powershell
# 1. Take a quick backup of anything you don't want git to overwrite (just in case
#    you had uncommitted work — though if files were silently truncated by sync,
#    "uncommitted work" probably isn't trustworthy either).
git stash --include-untracked   # may fail because the index is broken — that's fine

# 2. Rebuild the index from HEAD.
del .git\index                  # safe: index is regenerated from objects
git reset                       # rebuilds the index from HEAD

# 3. Restore every tracked file from HEAD.
git restore .

# 4. Verify nothing is mysteriously short anymore.
git status
```

After that, re-run:

```bash
pnpm install      # node_modules has at least one I/O error too (typescript folder)
pnpm typecheck    # should be zero errors, or just a handful of real ones
```

If `pnpm install` complains about the `typescript` package, nuke `node_modules` and reinstall — `ls node_modules/typescript` failed with `Input/output error` during this review, suggesting the install is also damaged.

### If you're on Windows + cloud-sync

Move the repo out of any sync folder. Cloud sync clients regularly corrupt git repos because they treat `.git/objects/*` and `.next/cache/*` as regular files and try to dedupe / delta them.

---

## 2. 🔴 Correctness & security findings

These were found by reading the actual code in the working tree (the parts that aren't truncated). They apply at `HEAD` too — verify after recovery and treat the file paths/line numbers as approximate.

### 2.1 Stub-profile claim is brute-forceable

**File:** `app/actions/claim.ts` (≈ lines 41–122)

`claimStubProfileAction` takes a DNI from form data and merges any stub profile that matches:

```ts
const dni = normalizeDni(dniRaw);
const [stub] = await db
  .select(...).from(profiles)
  .where(and(eq(profiles.dniNumber, dni), ne(profiles.id, user.id)))
  .limit(1);
```

There's nothing tying the DNI to the authenticated user. An attacker who knows or guesses someone's DNI (Argentine DNIs are ~8 digits, ~100M space, and not secret — they're printed on national ID cards) can claim that person's stub profile and inherit any pet ownerships, vet records, etc. that were attached to it.

This is paired with `dni-verification.ts`, which has a `TODO(mi-argentina)` noting that DNI verification is currently a self-attestation. Until Mi Argentina OAuth ships, **anyone can set any DNI as their own and then claim the matching stub.**

Severity: **Critical** if any production data exists. Mitigations until Mi Argentina lands: a rate limit on claim attempts; a one-time confirmation token sent through an out-of-band channel; or simply block stub claims entirely behind a manual admin review.

There's also a race condition: the stub lookup at line ~78 happens *outside* the transaction at line ~117. Two concurrent claim attempts can both see the stub, both enter their transactions, and both try to move ownerships. `SELECT ... FOR UPDATE` (or moving the lookup inside the transaction with an advisory lock keyed on the normalized DNI) fixes it.

### 2.2 Libreta share revocation can be done by any current owner

**File:** `app/actions/libreta-share.ts` (≈ lines 73–101)

`revokeLibretaShareForUser` correctly checks that the caller is either the creator of the share *or* a current owner of the pet. The intent (per the comment) is that co-owners can clean up shares they didn't make. In practice this means: if I share my pet's libreta with my vet, then transfer the pet to a new owner, the new owner can revoke my share at any time — and so can anyone else with an active ownership row, including a temporary foster placement.

That may be the intended product behavior, but it's worth a deliberate decision: do you want a foster to be able to revoke the previous owner's veterinarian's access to the medical history? If not, restrict to `createdByUserId` and `userRole = 'admin'`.

### 2.3 Open-redirect in DNI verification

**File:** `app/actions/dni-verification.ts` (≈ lines 125–131)

```ts
function sanitizeNext(raw: string | null): string {
  if (!raw) return "/cuenta";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return "/cuenta";
  if (trimmed.includes("//") || trimmed.includes("://")) return "/cuenta";
  return trimmed;
}
```

The intent is to only allow same-origin redirects. The check rejects `//attacker.com` (because of `"//"`) — but `URL` parsing in browsers treats backslashes the same as forward slashes in many contexts, and there are edge cases like `/\\attacker.com` or `/%2F%2Fattacker.com`. Safer pattern: parse the URL, take only `pathname + search`, and prefix with `/`. Today's check is *probably* fine but it's brittle.

### 2.4 Cross-org transfer accept trusts payload fields

**File:** `app/actions/cross-org-transfer.ts` (≈ line 299)

`acceptCrossOrgTransferAction` loads the proposal event payload and checks `proposalPayload.to_organization_id !== organization.id`. The `to_organization_id` comes from the stored event payload. If two transfer proposals for the same case ever get crossed in storage (or if an attacker can produce a forged event), the check passes against the *payload* rather than against the *case state*. Re-derive the receiver from the case row (or from the most recent open proposal event for that case), not from the payload of whichever event is being read.

### 2.5 Notifications inside transactions

**Files:** `cross-org-transfer.ts`, `foster-proposals.ts`, several others

Multiple actions do something like:

```ts
await db.transaction(async (tx) => {
  await tx.update(cases).set({ ... });
  for (const uid of recipients) {
    await tx.insert(notifications).values({ ... });
  }
});
```

Notifications inserts are coupled to the transactional outcome. If a notification insert fails (e.g., unique constraint hiccup, deadlock, transient connection issue), the whole transfer or foster decision rolls back and the user sees an error even though the *intent* (the transfer) was perfectly valid.

Move notifications outside the transaction (after the commit), or write them to a `pending_notifications` table inside the transaction and have a worker drain it.

### 2.6 Public-token entropy

**File:** `lib/publicToken.ts`

The comment in the file is already honest about this: 31^8 ≈ 8.5e11 combinations, no collision detection, no retry. At low volumes it's fine. The libreta share tokens, which protect medical records, share the same generator. Add a uniqueness check + retry loop on insert, and consider bumping the entropy for the share-token variant specifically.

There's also a small modulo-bias issue (`random[i] % 31` on `crypto.randomBytes(256)` — 256 isn't divisible by 31). The bias is tiny but free to fix: use rejection sampling.

### 2.7 Capability checks are server-side only — which is correct, but…

Server actions correctly call `requireCapability(...)` before mutating. UI elements are hidden based on the same capability list. There's no shared client-side guard, so a developer adding a new action has to remember the server check. Two suggestions:

- Add an ESLint rule (or a Biome rule, since you're using Biome) that flags any exported server action that doesn't import `requireCapability` or `requireUser`.
- Add a unit test that imports every action file and checks for the auth call.

### 2.8 Booking double-booking falls back on a CHECK constraint

**File:** `app/actions/booking.ts` (≈ line 96)

The action uses an advisory lock + a manual capacity check, and the `slot_bookings_within_capacity` CHECK constraint is the safety net. If the advisory-lock path ever has a bug, the user sees the raw constraint violation message instead of "no hay cupo." Wrap the catch and translate the error.

---

## 3. 🟠 Database

The schema is large, mostly clean, and well-commented. Specific things to fix:

### 3.1 Missing `ON DELETE` clauses

**File:** `db/schema.ts`

Roughly **42 of 78** foreign-key references don't specify `onDelete`, so Postgres defaults to `RESTRICT`. Migration `0014_scheduling_fk_fix.sql` already shows this caused integration-test failures once, and the pattern is repeated in newer tables.

Highest-impact ones to fix (most should be `set null` because they're audit fields — who decided / who granted):

```
pets.adoptionEligibilitySetByUserId         → profiles.id     (should be set null)
govtAssignments.grantedByUserId             → profiles.id     (set null)
govtAssignments.revokedByUserId             → profiles.id     (set null)
approvalRequests.initiatedByUserId          → profiles.id     (set null)
approvalRequests.decidedByUserId            → profiles.id     (set null)
auditLog.{approvalRequestId, targetUserId, targetOrganizationId, targetGovtAssignmentId}  (set null)
custodyDisputes.revokedByUserId             → profiles.id     (set null)
adoptionApplications.cancelledByUserId      → profiles.id     (set null)
adoptionApplications.resolvedOwnershipId    → ownerships.id   (cascade? set null? – product decision)
```

### 3.2 Missing FK indexes

Postgres does **not** automatically index FK columns. Without an index, every parent-row delete scans the child table. The audit-log and adoption-applications tables are the worst offenders (5+ FKs, 0 indexes). Suggested priority:

```
auditLog.approvalRequestId
auditLog.targetUserId
auditLog.targetOrganizationId
adoptionApplications.proposedByUserId
adoptionApplications.cancelledByUserId
adoptionApplications.resolvedOwnershipId
approvalRequests.initiatedByUserId
approvalRequests.decidedByUserId
pets.adoptionEligibilitySetByUserId
```

### 3.3 Constraints in migrations but not in Drizzle

Migration `0023_pets_adoption_eligibility.sql` adds four CHECK constraints, but `db/schema.ts` only declares the columns — no `.check()` calls, and `adoptionEligibilitySetAt` isn't marked `.notNull()` even though the migration's constraint requires it. The schema and DB end up technically equivalent but drift is invisible to anyone reading `schema.ts`. Mirror migration-level constraints in Drizzle.

### 3.4 Event-log mutation escape hatch is silent

`db/triggers.sql` defines `pet_events_no_update` / `pet_events_no_delete` triggers that can be bypassed by setting `app.allow_event_mutation`. The escape hatch is documented in code but writes to it don't auto-log to `auditLog`. Wire a trigger to insert into `auditLog` whenever the GUC is set during a UPDATE/DELETE on `pet_events`.

### 3.5 Projection rebuild has a TOCTOU window

`scripts/rebuild-projections.ts` reads events outside a transaction, computes derived state, then issues `UPDATE pets SET ...`. If anything writes a new event in the gap, the projection regresses. Today this only runs manually with `--apply`, so the risk is bounded, but if you ever wire it to cron, wrap the per-pet read+compute+update in an advisory lock keyed on `pet_id`.

### 3.6 `materialize-slots.ts` is not atomic

If the script crashes halfway through, some rules are materialized and some aren't, with no resumability marker. There's already a `cron_runs` table (`schema.ts` ≈ line 824); use it to track which rules have been processed in a given run.

---

## 4. 🟡 UI / design system

### 4.1 Form classes are copy-pasted everywhere

Roughly the same Tailwind string lives at the top of every form file:

```ts
// PetForm.tsx, IntakeForm.tsx, WelfareReportForm.tsx, ClinicalInfoForm.tsx, …
const inputClass = "px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950";
const labelClass = "block text-sm font-medium text-neutral-800 dark:text-neutral-100";
```

Make a `lib/form-classes.ts` (or a `<TextField label="…">` wrapper component) and import from there. Every time the design tweaks, you don't have to chase 12 files.

### 4.2 `refugio → org` rename is half done

- Routes use `/org/[orgToken]/...` — good
- `app/refugio/` does not exist as a folder, but `app/refugios/` does (note the trailing `s`); README claims "Live at `/refugio/` — rename pending"
- DB schema comments still mention "refugios" repeatedly
- User-facing copy uses "Refugio" as the shelter *type* — which is correct AR-ES vocabulary
- A rename plan exists at `docs/superpowers/plans/2026-05-17-code-rename-refugio-to-org.md`

The mix is currently navigable but every new contributor pays a tax learning which token to use where. Either close out the rename or accept it explicitly in `AGENTS.md` ("internal lingua: `org`; user-facing: `refugio` *only* for the shelter org-type, not for the portal route").

### 4.3 Error-alert and empty-state inconsistencies

- `state.error && <p role="alert">{state.error}</p>` is the dominant pattern — good — but a few forms use `EditProfileForm`'s bespoke `useState`-based local errors instead. Pick one.
- Empty states are inconsistent: some lists have a nice "no tenés X" card, others render an empty `<ul/>`. A shared `<EmptyState title=… description=… cta=…/>` component would help.
- No shared loading skeleton. `app/loading.tsx` files exist in some routes and not others.

### 4.4 Accessibility quick check

- The MapLibre `<div>` in `components/LocationPicker.tsx` has no `role` or `aria-label` — screen-reader users get nothing
- `▲ / ▼` markers in collapsible sections (e.g., `WelfareReportForm`) rely on the native `<details>` semantics — which is fine — but a couple of *non-native* collapsibles I found don't have `aria-expanded`
- Icon-only buttons are mostly OK because they currently include visible text; once iconography lands, this becomes a real audit item

---

## 5. 🟡 Tidiness & dead code (real findings, ignoring the corruption)

### 5.1 Notifications inside transactions

Already mentioned above (§2.5) — repeated here because it'll cause production user-visible incidents and the fix is mechanical.

### 5.2 Commented-out blocks

`app/actions/return-to-owner.ts`, `app/actions/auth.ts`, `app/actions/transfer.ts`, `app/actions/admin-institutional.ts` contain blocks of commented-out code. Delete (you have git) or extract to a known-experiment file.

### 5.3 Test gaps

82 test files, comprehensive on the core flows. The places without tests are mostly the planned-but-not-built portals (`/pro`, `/gob`) — expected. Two gaps worth filling:

- Full RLS enforcement matrix (the existing `rls-smoke.ts` is a spot check, not a matrix)
- Cross-org transfer including the abuse cases described in §2.4

### 5.4 The two real `TODO`s

`lib/authority.ts` has two clearly-scoped `TODO(authority-integration)` stubs. Healthy. Not debt.

### 5.5 README claim vs reality

The README says "every non-obvious file has a header explaining its job." Sampled 15 files in `lib/` — claim holds up. Nice work.

### 5.6 Git hygiene

`.gitignore` covers `.next/`, `*.tsbuildinfo`, `node_modules/`, `.env.local`, `.atl/`, `.claude/`. Clean. Once the index is rebuilt, things should look tidy.

---

## 6. Suggested priority order

Once the working tree is recovered (§1):

1. **Fix the §2.1 claim-flow auth gap.** Either gate stub claims behind admin review or accelerate the Mi Argentina OAuth integration.
2. **Move notifications out of transactions** (§2.5) — mechanical, high-leverage.
3. **Decide on the libreta-share revoke policy** (§2.2). Code change is trivial; the question is product intent.
4. **Audit-trail the event-log GUC escape hatch** (§3.4) — also mechanical.
5. **Add the missing `ON DELETE` clauses and FK indexes** (§3.1, §3.2). Big migration, can be done as a single PR.
6. **Extract `inputClass` / `labelClass` to a shared module** (§4.1) — 30 minutes, removes a category of future drift.
7. **Mirror migration CHECK constraints into Drizzle** (§3.3).
8. **Close out the `refugio → org` rename** or pin it in `AGENTS.md` (§4.2).
9. **Add the RLS enforcement matrix test** (§5.3).

---

## Things I liked

So this doesn't read like an entirely grumpy document:

- The event-sourcing pattern is real and consistent — pet events are append-only, projections are derived, the schema reflects it
- `docs/superpowers/` is unusually disciplined; specs carry honest status labels (✅ / 🟢 / 🟡 / ⚪) and the implementation actually tracks them
- The capability model and admin / govt / vet / owner separation are coherent and enforced server-side
- Tests are real tests against real flows, not just shallow happy paths
- The codebase has a clear lingua: English for identifiers, es-AR for copy, no accidental drift
- `AGENTS.md` is genuinely useful as an onboarding doc — most projects this size don't bother

The bones are good. Fix the file corruption, knock out the auth findings in section 2, and this is ready to keep building on.
