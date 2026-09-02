# 2026-09 fresh audit — synthesis

> Snapshot: `b975f3e9d` (`main`; `11c0ffc57` pushed 2026-09-02 plus `lenses/A01.md`) · Audited SHA: `d7dbf25f7` (lenses ran before WU-0 merged) · Facts: `docs/architecture/facts.json`
> Status: draft — finalized 2026-09-02 by the synthesis writer; fresh review fixes applied 2026-09-02

## Headline verdict

**The audit's one CRITICAL was found by refuting a claim the lens had already written down as healthy — not by any finder, in any lens, in either batch.** That is the class-level result, and it outranks every count below.

`A01-R1`: `"Profiles updatable by self"` (`db/rls.sql`, from migration `0086`) constrained the ROW — `id = auth.uid()` in both `USING` and `WITH CHECK` — and never a COLUMN. No column-level `GRANT`/`REVOKE` existed on `profiles`, no `BEFORE UPDATE` trigger compared `old.role`/`new.role`, the `account_type`/`role` pairing CHECK had been dropped in migration `0016`, and `supabase/config.toml:13` exposes the public schema over PostgREST. So any authenticated owner, holding nothing but the public anon key and their own JWT, could `PATCH /rest/v1/profiles?id=eq.<own uid>` with `{"role":"admin","account_type":"institutional"}` and become an admin. The authorization layer reads exactly those columns and never consults the JWT.

It is closed. Migration `db/migrations/0211_profiles_lock_postgrest_writes.sql` drops the policy outright — `profiles` now has a SELECT policy and no PostgREST write surface at all, the same shape `0163` gave `ownerships` — with fence `__tests__/rls/profiles-write-lockdown.test.ts`. Commits `ae97186b9` and `36c8204c9`; applied by the PO to Supabase `DIM-staging` on 2026-09-02, which is the only live database (there is no production database; the old `DIM` project is INACTIVE). Per the plan's CRITICAL rule the finding was escalated from three refuters to **five and survived 5/5**; the vote of record is engram topic `sdd/audit-2026-09/decisions`, and the re-refutation ran as workflow `wf_8bd36c20-bc1`.

**Why this is the lesson and not just an incident.** Eight prior review passes and the 2026-07 audit all treated "can a request set a role?" as an application-layer question, because the self-minted-admin CRITICAL of 2026-07 had been an application-layer bug and was fixed there. Every one of them shared the same belief — *`role` is the gate, and the gate is in our code.* Nobody asked which layers the invariant is enforced at and whether a caller can bypass all of them, because the answer felt known. The plan's "which layers, and does it bypass all of them?" impact lens exists precisely for that failure mode, and the only step that actually ran it here was the healthy-claim refuter — the one step whose job is to attack what the audit already believes. A pass that only re-checks findings can confirm what someone already suspected; it cannot find this.

**Everything else: AT RISK on the identity and data-rights boundary; solid everywhere that was looked at — and 21 of 36 lenses were not looked at.**

Fifteen lenses ran. Nine came back `SOLID WITH FINDINGS`, five came back `AT RISK`, one produced a decision memo instead of a verdict. Beyond `A01-R1`, **no CRITICAL was confirmed by any finder**, in either batch, including the six gap rounds a completeness critic ordered specifically to hunt for what the base passes missed.

Six HIGH findings survived. Five of them are one sentence:

> **An actor the system has already refused — erased, deactivated, or never proven to exist — keeps working, because the gate that would stop them reads the wrong column.**

- `A05-1` — `pii.caller_is_admin` checks `role`, `account_type` and `deactivated_at`, but never `deleted_at`. An **erased admin** still passes the admin branch of both subject-rights RPCs and can export or erase an arbitrary victim's data over PostgREST.
- `A01-1` — `requireLiveUser`'s deactivation refusal is gated on `accountType === "institutional"`. A **self-deactivated personal account** (owner or vet) is never locked out at any boundary; the dialog that offers the button comments that a layout guard will redirect, and no such guard exists for it.
- `A09-1` — the transfer-accept e-mail arm is a bare case-insensitive string compare with no `email_confirmed_at` check, and `enable_confirmations = false` in production. **Anyone who knows the addressee's e-mail** can sign up with it and take titularidad of the animal.
- `A02-1` — the `pet_events` PostgREST INSERT policy constrains ownership but not provenance. Any owner can post an event with `author_role: "govt"`, `author_verified: true`; the append-only spine then makes the forgery **permanent**, and the public credential and the compliance gate both consume it. This is `A01-R1`'s sibling — the same "row-scoped, not column-scoped" mistake on the more important table — and it is queued as migration **0212**.
- `A05-2` — the subject-rights coverage fence **cannot express one-sided coverage**: a table reached by exactly one of the two RPCs reads as covered. Five tables are live in that state, so an erased subject stays an active org member forever.

The sixth, `C04-1`, is different in kind and is the sharpest fence finding in the audit: a cron route hands `budgetHeaders` to a code path that **never reads a clock**, and the ceiling fence certifies the job as budget-honouring because it text-matches the literal string `budgetHeaders` in the route's source. A false-green gate over a job that can SIGKILL the seven jobs behind it.

One further thing did not survive contact and belongs in the headline even though it is not a numbered finding:

> **`drain-outbox` re-delivers.** C04's refuter killed a healthy claim about double-invocation safety by showing that `FOR UPDATE SKIP LOCKED` is scoped to a transaction containing only the `SELECT`, which commits before per-row delivery — so a second overlapping run re-selects the same still-`pending` rows and re-delivers them. The repo demonstrates the correct claim-by-`UPDATE` pattern one file over in `src/modules/surveillance/infrastructure/surveillance-repository.ts`. C04's own write-up says this "describes a live double-delivery hazard" and asks the next audit to file it. Like `A01-R1`, it arrived as a healthy-claim refutation and carries no id — lote 2 should file it as `C04-R1` under the convention this synthesis introduces.

Two healthy-claim refutations, two of the three most serious things in the audit. That is not a coincidence; it is the method working, and it is the argument for keeping the step.

## Per-batch summary

### Batch A — security and data integrity (A01–A11), runId `wf_8e5adf2f-e17`

11 lenses, 104 agents, 3,700 tool calls. Every finding faced three independent refuters and every healthy claim faced one. A completeness critic then ordered six gap rounds — A03 twice, plus A06, A08, A10, A11 — each a fresh finder, four refuters and a writer, aimed at areas with zero reads in the base pass. The gap rounds produced **24 more confirmed findings (16 MED, 8 LOW, zero HIGH)**, which is the strongest single argument in this audit for running the deferred lote: a critic pointing at unread ground found a quarter of the batch's total findings, and none of them were severe. Coverage, not severity, was the binding constraint.

Verdicts: AT RISK ×4 (A01, A02, A05, A09), SOLID WITH FINDINGS ×7. Confirmed by the finder pipeline: 5 HIGH, 51 MED, 33 LOW = 89, plus `A01-R1` from the healthy-claim step. Refuted findings: 8. Healthy: 75 of 94 claims survived.

The refute stage was not a rubber stamp and was not theatre either: exactly one finding per lens was refuted in six of eleven lenses, zero in the other five, never two or more in a base pass. Several refutations *corrected* a finding rather than killing it — `A01-2`'s exploit path was wrong (the finder's route is blocked by a screen guard) and two refuters independently found a different working route through a `?province=` parameter, so the finding survived at MED with its story rewritten.

Batch A closed with exactly one area still fully unread anywhere: **`src/modules/search`**.

### Lote R — reduced (C04, C06, D05, B02), runId `wf_921e8827-a47`

108 agents, one correctness refuter per finding, no critic, no gap round. Treat every C04/C06 finding as having survived one attack, not three.

- **C04 (crons) — AT RISK.** 6 confirmed (1 HIGH, 2 MED, 3 LOW), 1 refuted. 27 of 28 priors closed — the strongest prior-triage result in the audit — but the one HIGH is a false-green fence, and a refuted healthy claim exposed the `drain-outbox` re-delivery hazard above.
- **C06 (deploy/env) — SOLID WITH FINDINGS.** 4 confirmed (2 MED, 2 LOW), 2 refuted. Both refutations are worth reading: the finder twice built a plausible failure narrative on code it had read only halfway, and both times the mitigation was real and documented.
- **D05 (pitch claims).** 63 claims from the govt-personas pitch and `README.md`: **43 TRUE, 17 PARTIAL, 3 FALSE**, zero unverified, zero contested. 16 claims changed class under refutation, and — this is the encouraging half — **10 of the 16 moved toward TRUE**, only 6 the other way. Two of the three FALSE claims are the product **under-selling itself**: jurisdiction-scoped govt moderation of anonymous denuncias already shipped and the deck lists it as a future gap, and two surfaces the README calls "deferred by design, not wired into navigation" are both one click away today.
- **B02 (app → db boundary).** Not a findings lens. A boundary explorer plus a checker pass, producing a PO decision memo. 28 of 32 recomputed counts matched the explorer's; four were corrected, none reversing the argument. **The decision has since been taken** — see `BACKLOG.md`.

## Class-level lessons

These recur across lenses. Each is drawn from what the lens files actually establish.

### 1. Row-scoped is not column-scoped, and a policy that pins the row reads as safe to every fence we own

`A01-R1` and `A02-1` are the same mistake on two tables, and the second was still open when the first was closed. An RLS policy whose `USING`/`WITH CHECK` names the row (`id = auth.uid()`, or an ownership `EXISTS`) constrains *which rows* the caller may write and says nothing about *which columns* — so a table that holds an authorization input (`profiles.role`) or a provenance claim (`pet_events.author_verified`) is wide open to the row's own owner. Every instrument we have reads this as safe: `__tests__/rls/write-path-matrix.test.ts:20-31` classifies an `auth.uid()`-scoped policy as SAFE by construction, `__tests__/rls/matrix.test.ts:64` sets `OPERATIONS_UNDER_TEST = ["select"]` so the declared write cells were never executed, and `findImpersonationExports` (`scripts/check-authz-guards.ts:818`) reads `"use server"` exports and cannot see PostgREST at all. The fix shape that worked is not a narrower policy and not a column `REVOKE` — `applySchemaGrants` (`scripts/deploy-provision.ts`) re-grants `ALL` on every provision, so a `REVOKE` is undone by the next deploy. It is deny-all: drop the write policy, since every legitimate writer goes through the BYPASSRLS Drizzle connection anyway.

### 2. A fence that greps for a token proves the token is present, not that the property holds

The single most expensive pattern in this audit. `C04-1` is the pure case: `READS_THE_BUDGET` in `__tests__/cron-budget-ceiling.test.ts` is a regex over the route's source, so passing `budgetHeaders` into a function that ignores it reads as compliance. Same shape elsewhere: `__tests__/cron-registry-parity.test.ts`'s telemetry and auth assertions are `src.includes(...)` substring checks that a prose mention would satisfy (C06); `check-subject-rights-coverage.ts`'s `bodyMentions` matches `public.<table>` **inside SQL comments** (A05 nit); `__tests__/content-report-read-coverage.test.ts` is a whole-file `src.includes("notReportedClause()")`, blind to *which* query carries the clause (A03); `scripts/check-storage-write-policies.ts` classifies any policy mentioning `auth.uid()` as non-permissive and checks nothing further, so widening that policy's predicate stays green (A07). The fix shape is the same everywhere: assert against a parsed structure or a live catalog, and add a non-vacuity control that fails when the enumeration sees nothing.

### 3. Hand lists miss a member; enumerate the subject

`A02-4` is the self-aware version: `SEARCH_PATH_PINNED` is a six-name hand list living in **the same file** whose sibling rule was upgraded to full `pg_proc` enumeration precisely because lists miss things — and that file's own comment says so. The same class: `AUTH_GUARDS` accepting a bare `auth.getUser()` (`A01-3`); `ACTION_SOURCE_GLOBS` excluding `lib/**` entirely (`A01-7`); the `no-store` allowlist drifting from the `force-dynamic` tree, with its own test positively asserting the drift is correct (`A03-1`); `DASHBOARD_PAGES` as a hand-kept array (`A03-G4`); `CHECKED_COLUMNS` as a hand map that has already silently missed `jurisdiction*` once and the condition columns once (`A08-4`); the locality-integrity sweep covering `govt_assignments` and never `pets` (`A10-4`); and `IN_EXPORT`/`IN_ERASE` being two flat lists that structurally cannot express "reached by one RPC only" (`A05-2`).

### 4. Budget-ceiling fences that text-match, and jobs bounded by rows instead of by clock

`C04-1` and `C04-2` are the pair. Three ceiling-EXEMPT daily jobs reserve 0 ms and justify themselves by row caps — `close_rabies_observations` can start 500 per-pet transactions at 54.9 s of a 55 s budget, and the seven jobs behind it are killed without even being recorded as `skipped_budget`. The web has the mirror image: `app/sitemap.ts` runs a three-way DB fan-out with no `loadWithTimeout`, no `withDbBudget` and no `.limit()`, on an anonymous route with no throttle, while `app/(public)/perdidas/page.tsx` wraps the identical queries with a written rationale for bounding exactly this class (`A03-G2`, `A03-G8`). `check-db-budget.ts` misses the sitemap by one — its fan-out is 3 against a `FANOUT_THRESHOLD` of 4.

### 5. `role` vs `account_type` — one invariant, two columns, no DB tie

Migration 0015 added a CHECK pairing them and 0016 dropped it, so the invariant is app-layer only (D05-40, TRUE and verified). That dropped CHECK is also part of why `A01-R1` reached all the way to a usable admin: the same `PATCH` set both columns, and no database object objected. The consequences show up as findings, not as prose: `A01-1`'s deactivation refusal keys on `accountType` and misses every personal account; `isInstitutionalPrincipal()` ORs the two; the two DB guards that *do* exist (the profiles CHECK and the `ownerships_institutional_no_pets` trigger) key on `account_type`, so `role` carries no database backstop at all (D05-41, PARTIAL). Any fix that widens a gate needs to state which of the two columns it is keying on and why.

### 6. Erased-actor semantics: `deleted_at` is set, and almost nothing reads it

`erase_subject_data` soft-deletes the profile — it sets `deleted_at` and leaves `role`, `account_type` and `deactivated_at` **untouched**. Four confirmed findings are downstream of exactly that: `A05-1` (`pii.caller_is_admin`), `A10-G1` (the `alert_subscriptions` RLS admin branch), `A10-G3` (the alert owner sweep with no liveness join), `A06-G2` (the dead-letter drain resurrecting a redacted notification). The correct predicate already exists in the tree: `db/migrations/0188_revocations_upload_admin_govt_only.sql` writes `AND p.deleted_at IS NULL`, and A10's own write-up calls it "the intended form". This is one migration and one sweep away from closed, and it is the highest-value cluster on the backlog.

### 7. The correct form is almost always one file over

In nearly every confirmed finding, the fix is not invention — it is copying a sibling. `A01-R1`'s own fix was migration `0163`, which had already done exactly this to `ownerships` 48 migrations earlier. `A01-2`'s unscoped query has a fail-closed twin in `govt-queue-aging.ts`. `A03-2`'s missing IP-less cap exists in `submit-org-contact.ts`. `A05-1`'s missing predicate exists in migration 0188. `A08-G1`/`A08-G2`'s missing overlay exists in `refresh-pet-cache-after-amendment.ts` and `rederive-pet-cache.ts`. `A09-2`'s missing notification fan-out is called by all four sibling hand-offs and by none in `src/modules/transfers`. `A11-1`'s missing per-user bucket exists eight lines away in the sibling route. This is a good sign about the codebase and a bad sign about its fences: the knowledge exists, nothing forces its adoption.

### 8. Comments that claim a guard which does not exist

Ten confirmed findings carry `fixClass: doc-fix`, and the pattern is narrower than "stale docs": a comment asserts a protection that is absent. `DeactivateAccountDialog.tsx:45` says "the layout guard redirects to /login" for a guard that does not cover personal accounts (`A04-8`). `isMetadataStripped`'s docblock calls itself "the gate" and says it "fails closed"; it has zero callers and would fail OPEN (`A07-5`). `repair-pet-cache-drift.ts` claims to use "the SAME canonical check" as a sibling that overlays amendments while it does not (`A08-G4`). `alert-evaluation.ts:137-139` says a govt actor "keeps its own scoping" where the code keeps the subscription's (`A10-G2`). `db/rls.sql` is a maintained-looking decoy whose own header (and `AGENTS.md:1024`) invite an operator to paste it into Studio, re-opening two policies migrations closed (`A02-2`) — the same file whose profiles block was the CRITICAL, which is worth sitting with. A comment that names a guard is a claim, and this audit found it false about as often as it found it true.

### 9. Fetch-then-redact vs never-fetch

The repo has a genuinely strong convention here — `load-public-credential.ts` substitutes a SQL `null` literal into the SELECT list rather than fetching and hiding, and the lost feed runs two physically separate queries so a non-disclosing owner's payload never leaves Postgres. Both survived refutation. But **no test pins the query shape** in either case: the named guards are output tests that a fetch-then-redact implementation would satisfy identically (`A03` healthy items, `guardVerified: false`). The one place inside those files that still fetches-then-narrows is `A03-G10`. The convention is real, well-argued in comments, and completely unfenced.

### 10. Test theatre, honestly labelled

`A02-5`: the behavioural RLS matrix declares an INSERT/UPDATE/DELETE answer for every cell and executes none of them — `OPERATIONS_UNDER_TEST = ["select"]`. Its own header says so, which is why it landed MED and not HIGH. That gap is the direct reason `A02-1`'s scoped-but-wrong INSERT policy was never caught, and the direct reason `A01-R1` went undetected from migration `0086` until this audit: `matrix.data.ts` declared `profiles.owner.update = allow` and nothing ever executed the cell to ask *which columns*. An honestly-labelled hole is still a hole, and this one cost the audit its only CRITICAL. Related: `A11-3` — one of 33 v1 route handlers is imported by no test, and it is the one carrying the surface's core anti-oracle rule; `A08-1` — the `pet_events` override's accountability clause is tested for `case_events` and not for the more important table; `A06-G5` — an anon-callable custody-dispute gate with no server-side test at all.

## What changed since the 2026-07 audit

Aggregated across every lens's Prior triage section — **184 prior findings triaged: 132 closed, 48 still-open, 4 not-reproducible.**

| Lens | closed | still-open | not-reproducible |
|---|---|---|---|
| A01 | 4 | 10 | 0 |
| A02 | 6 | 5 | 0 |
| A03 | 5 | 1 | 0 |
| A04 | 10 | 3 | 0 |
| A05 | 13 | 2 | 1 |
| A06 | 12 | 5 | 0 |
| A07 | — | — | — (first run) |
| A08 | 11 | 5 | 0 |
| A09 | 7 | 2 | 0 |
| A10 | 37 | 14 | 3 |
| A11 | — | — | — (first run) |
| C04 | 27 | 1 | 0 |
| C06 | — | — | — (first run) |
| **Total** | **132** | **48** | **4** |

A 72% closure rate over one audit cycle. The two standouts are C04 (27 of 28 — the cron fleet consolidation genuinely landed) and A10 (37 of 54, including every one of the fifteen org-token confused-deputy items, now closed in code *and* fenced by `scripts/check-confused-deputy.ts` with an empty allowlist and a `lint:authz-orgtoken` key inside `pnpm verify`).

**The closure rate is real and it is not the same thing as safety.** A01 closed 4 of 14 priors and shows the audit's single worst result on the same lens: the 2026-07 CRITICAL is marked closed in A01's prior-triage table, correctly, on the path it was closed on — and the same lens's healthy-claim refuter found the class alive on a path that audit never considered. A prior marked "closed" answers "does the old reproduction still work?", not "is the invariant enforced?". Read the triage tables that way.

The 48 still-open are not evenly distributed. A10 carries 14 and A01 carries 10, and in both cases most are the same shape: a helper that takes a bare id with no in-query scope predicate, safe only because every current caller happens to be guarded. A01 folded six of those into a single finding (`A01-5`) rather than re-filing them individually, which is the right call and worth repeating.

Four priors are **not-reproducible**, all for the honest reason: the file moved or the read budget ran out (`A10` 14-14, 14-16, 21-1 — the last because `docs/reviews/results/21-authz-scoping-audit.md` is truncated at line 6 and finding #1 is unrecoverable; `A05` prior 8, where both named files no longer read raw `pet_events` payloads at all).

### Known-answer calibration (batch A)

Two calibration probes were planted, both **`present-first-pass`** — the audit re-derived the known answer without being told it:

1. **Self-minted-admin CRITICAL — closed on its own path, and re-opened on another.** A01's prior-triage row is correct: the `handle_new_user` trigger hard-codes `'owner'` (`db/triggers.sql:62-70`), and all five `/api/panorama/*` routes now resolve the caller through one shared gate (`app/api/panorama/_guard.ts:71-91`) that runs maintenance, session, erasure, deactivation, shift-expiry, role and `accountType` — the exact set the page guard enforces. The probe therefore passed *as a calibration*, and the calibration was the least interesting thing it produced: the same lens's healthy-claim refuter found the class alive over PostgREST, which became `A01-R1`, the audit's only CRITICAL. **Both halves are now closed** — the application half by the 2026-07 work, the database half by migration 0211 on 2026-09-02. The methodological reading is uncomfortable and worth stating plainly: a known-answer probe verifies the answer you planted. It cannot tell you the question was too narrow.
2. **The 27-rerun #15 class (`requirePetAccess` / bare `auth.getUser()` vs erasure lockout) — closed.** `lib/infra/pet-access.ts:40` imports `requireLiveUser` and `:211` calls it, and the file's own comment records that this replaced a hand-rolled `auth.getUser()` plus inline `deletedAt` check. The remaining `auth.getUser()` calls in `src/modules/transfers/actions.ts` resolve the caller's e-mail *after* `requireUserOrRedirect`, not authorization.

No calibration probe was planted in lote R, so its findings have no independent accuracy estimate.

## Cross-lens observations the individual lenses could not make

- **`A04-4` and `C06-4` are the same defect, found independently by two batches with different methods.** Both land on `apps/mobile/eas.json:22`: no EAS profile declares an `env` block, so a `production` store build inherits `api.ts`'s `https://dim-staging.vercel.app` default. Batch A filed it as `fence-candidate`, lote R as `code-sdd`. Two independent confirmations on one line is the strongest signal in the audit; fix it once, and pick one fixClass.
- **`A07-1` was mis-attributed and both owning lenses disclaimed it.** `A02.md` says the finding is "primarily owned by A07"; `A07.md` says its "primary lens [is] A02". Neither lens's severity tally includes it, so a real, three-refuter-confirmed MED finding fell through a crack between two documents. **This synthesis attributes `A07-1` to lens A07 everywhere** — its subject is the `pet-photos` bucket's write grant and MIME/size ceilings, which is A07's scope — and A07's confirmed count is 6 (5 MED, 1 LOW), A02's is 7 (1 HIGH, 4 MED, 2 LOW). The digest's arithmetic gap (64 vs 65) closes on that attribution. Two findings fell through a document crack in this audit (`A07-1` between two lenses, `A01-R1` between "healthy" and "finding"); both were recoverable only because a human read both documents.
- **A03's gap-round id collision, flagged in the batch digest, does not exist in the published lens.** The digest warned that gap round 2 reused `G1`, `G2`, `G4`, `G5`. `A03.md` renumbered round 2 as `G7`–`G11`. The published file is the source of truth and it is clean; `A03-G3` and `A03-G4` sit under the MED heading despite the verdict line's id list omitting one and misfiling the other — a cosmetic slip in a summary sentence, not a count error (9 MED, 4 LOW is right).
- **The erased-actor cluster spans four lenses that never spoke to each other.** A05 found it in a SECURITY DEFINER function, A10 found it in an RLS policy and in a cron sweep, A06 found it in a dead-letter drain, A01 found the personal-account half. Individually they are one HIGH and three MEDs across four subsystems. Together they are one decision — *what, exactly, does `deleted_at` mean to a gate?* — with one migration and one shared predicate behind it.
- **B02 and D05 corroborate each other on the app→db boundary.** D05-44 rates the README's "`infrastructure/` is the only place that issues Drizzle queries" as PARTIAL because 153 application-layer files import `drizzle-orm` directly. B02's independent count found 204 `app/` files importing `@/db` and 132 read-only. Same fact, two lenses, no shared context. The PO decision that follows from it has since been taken — writes fenced, reads baselined shrink-only — and is recorded in `BACKLOG.md`.

## Method limits

Read this before treating any silence in this audit as a clean bill of health.

- **The scope cut is the dominant limit.** 15 of 36 lenses ran. This is not a whole-repo verdict and cannot be quoted as one. Three of the deferred lenses (`B11` fence honesty, `C08` test honesty, `D04` process and governance) audit the very machinery the executed lenses leaned on — so the audit's own instruments were never themselves audited.
- **The two batches are not one confidence class.** Batch A: 3 refuters per finding, a healthy-claim refuter, a completeness critic and 6 gap rounds. Lote R: 1 correctness refuter, no critic, no gap round. A MED from C04 or C06 has survived one attack; a MED from A01–A11 has survived three. Do not average them.
- **The sample re-audit was NOT run.** The plan called for an independent pass over a sample of the executed lenses' findings to estimate the audit's own false-positive and false-negative rates. It did not happen — it fell inside the scope cut. So the audit has no measured accuracy, only the two known-answer probes in batch A (both of which passed, and one of which, as noted above, passed while missing the CRITICAL that sat beside it). **Lote R has neither a probe nor a re-audit.**
- **Nothing was executed.** No `pnpm`, no test run, no build, no database query, in any lens, in either batch. Every RLS claim is read from repo source at one SHA; the live `pg_policies` / `pg_proc` / `storage.objects` state was never queried and the contract forbade it. Whether `pnpm verify` and `pnpm test:verified` were green at `d7dbf25f7` is not established by this audit.
- **`__tests__/rls/*` was never executed.** It matters most for `A02-2`: nobody knows from this audit whether `db/rls.sql` has already been pasted into an environment. It also means every fence this audit calls "wired" was verified by reading `package.json` and the workflow files, not by watching it fail.
- **Line numbers are as of `d7dbf25f7`.** HEAD has moved past `11c0ffc57`. Re-locate every citation by content before acting on it; several are already stale by a handful of lines.
- **The findings were written before the CRITICAL was closed.** The lens files, this synthesis's per-lens counts and `FINDINGS.json` describe the tree at `d7dbf25f7`. `A01-R1` is the only entry whose status has moved since. Twelve commits landed after the audited SHA. Besides the 0211 fix (`ae97186b9`, closes `A01-R1`, partly moves `A02-2`) and the architecture-facts work (`0cf63af8e`: `AGENTS.md`, `package.json`), three touched audited surfaces — `f899f52f8` (`e2e/demo/_db-cleanup.ts`), `264032a38` (`scripts/check-seed-hygiene.ts`), `11c0ffc57` (`scripts/clean-test-orphans.ts`) — and **none of those closes a numbered finding**; all three touch test-infrastructure files that no executed lens filed against. They do move `facts.json` (`vitest_files` 1485 → 1487) and they change the ground the deferred `C08` and `C09` lenses will walk.
- **No timing analysis anywhere**, by construction. A11 verified status-code, error-code and body equality between the not-permitted and not-existing arms, which is as far as a read-only audit reaches.

## What this audit did not look at

Beyond the 21 deferred lenses, the executed ones logged 96 `areasNotReached` entries. The ones that most change how you should read a verdict:

- **Migrations 0209 and 0210 are applied on staging and were never applied to a production database** — there is none. A demo runs against staging, which now also carries 0211.
- **`src/modules/search`** has zero reads anywhere, in any lens, in either batch.
- **`app/libreta/**`** was named in A01's scope and never opened. **`app/admin/**`**'s 20 pages were assumed covered by the layout guard, not verified page by page. **13 `/gob` sub-views** were enumerated and never opened.
- **~30 fetchers in `lib/analytics/dashboards/*.ts`** were swept with a presence heuristic and no WHERE clause was read; `lib/analytics/dashboards/_scope.ts` was never opened at all.
- **`e2e/`** — one file, in one lens. Playwright is a separate gate from `pnpm verify`; deferred brief `C09` is the lens for it.

The full lens × area table, including which zero cells a gap round actually covered, is `COVERAGE-MATRIX.md`.
