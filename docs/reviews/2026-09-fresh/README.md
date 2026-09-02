# 2026-09 fresh audit — lens index

> Snapshot: `b975f3e9d` (`main`; `11c0ffc57` pushed 2026-09-02 plus `lenses/A01.md`) · Audited SHA: `d7dbf25f7` (lenses ran before WU-0 merged) · Facts: `docs/architecture/facts.json`
> Status: draft — finalized 2026-09-02 by the synthesis writer; fresh review fixes applied 2026-09-02

## Scope warning — read this before quoting any number

This audit was **cut to roughly 20% of its planned size by the PO on 2026-09-02**. Of 36 planned lenses, **15 ran** and **21 are deferred** to "auditoría 2026-09, lote 2". Nothing below is a whole-repo verdict. A lens that did not run says nothing about the code it would have covered — and three of the deferred lenses (`B11` fence honesty, `C08` test honesty, `D04` process and governance) are exactly the ones that would audit the machinery the executed lenses leaned on.

Rigour also differs between the two executed batches, and the difference is material:

| Batch | Lenses | Method |
|---|---|---|
| **Batch A** (security & data integrity) | A01–A11 | Full rigour: finder + **3 refuters per finding** (correctness / reproduce / impact) + a healthy-claim refuter, then a completeness critic that ordered **6 gap rounds** (A03 ×2, A06, A08, A10, A11), each with its own finder + 4 refuters + writer. 104 agents. |
| **Lote R** (reduced) | C04, C06, D05, B02 | **1 correctness refuter per finding**, no critic, no gap round. D05 escalated to 3 lenses only on claims the finder called PARTIAL or FALSE. B02 ran as a boundary explorer feeding a PO decision memo, not as a findings lens. 108 agents. |

A MED in batch A survived three independent attacks. A MED in lote R survived one. Do not merge the two into a single confidence class.

## Lens table

Severity counts are CONFIRMED findings only (refuted findings are excluded and listed in `FINDINGS.json` with `status: "refuted"`). "Healthy" is refuter-surviving / claimed.

| Id | Lens | Status | Verdict | CRIT | HIGH | MED | LOW | Healthy | SHA | Workflow runId | Lens | Brief |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A01 | Authz boundary invariant | EXECUTED lote 1 | AT RISK | 1 (closed) | 1 | 3 | 4 | 4/5 | `d7dbf25f7` | `wf_8e5adf2f-e17` | `lenses/A01.md` | `briefs/A01.md` |
| A02 | RLS and DB privilege | EXECUTED lote 1 | AT RISK | 0 | 1 | 4 | 2 | 4/6 | `d7dbf25f7` | `wf_8e5adf2f-e17` | `lenses/A02.md` | `briefs/A02.md` |
| A03 | Public and unauthenticated surface abuse | EXECUTED lote 1 (+2 gap rounds) | SOLID WITH FINDINGS | 0 | 0 | 9 | 4 | 14/17 | `d7dbf25f7` | `wf_8e5adf2f-e17` | `lenses/A03.md` | `briefs/A03.md` |
| A04 | Auth, session, recovery, federation | EXECUTED lote 1 | SOLID WITH FINDINGS | 0 | 0 | 6 | 3 | 6/6 | `d7dbf25f7` | `wf_8e5adf2f-e17` | `lenses/A04.md` | `briefs/A04.md` |
| A05 | Erasure vs immutability (Ley 25.326 art. 14/16) | EXECUTED lote 1 | AT RISK | 0 | 2 | 2 | 2 | 3/5 | `d7dbf25f7` | `wf_8e5adf2f-e17` | `lenses/A05.md` | `briefs/A05.md` |
| A06 | Privacy and PII flows | EXECUTED lote 1 (+1 gap round) | SOLID WITH FINDINGS | 0 | 0 | 4 | 4 | 9/11 | `d7dbf25f7` | `wf_8e5adf2f-e17` | `lenses/A06.md` | `briefs/A06.md` |
| A07 | Uploads and storage | EXECUTED lote 1 | SOLID WITH FINDINGS | 0 | 0 | 5 | 1 | 5/6 | `d7dbf25f7` | `wf_8e5adf2f-e17` | `lenses/A07.md` | `briefs/A07.md` |
| A08 | Event-ledger integrity | EXECUTED lote 1 (+1 gap round) | SOLID WITH FINDINGS | 0 | 0 | 7 | 3 | 8/10 | `d7dbf25f7` | `wf_8e5adf2f-e17` | `lenses/A08.md` | `briefs/A08.md` |
| A09 | Ownership and custody trust chain | EXECUTED lote 1 | AT RISK | 0 | 1 | 1 | 4 | 5/6 | `d7dbf25f7` | `wf_8e5adf2f-e17` | `lenses/A09.md` | `briefs/A09.md` |
| A10 | Scoping: jurisdiction, org tenant, dashboards | EXECUTED lote 1 (+1 gap round) | SOLID WITH FINDINGS | 0 | 0 | 7 | 2 | 8/11 | `d7dbf25f7` | `wf_8e5adf2f-e17` | `lenses/A10.md` | `briefs/A10.md` |
| A11 | API v1 surface (mobile contract) | EXECUTED lote 1 (+1 gap round) | SOLID WITH FINDINGS | 0 | 0 | 3 | 4 | 9/11 | `d7dbf25f7` | `wf_8e5adf2f-e17` | `lenses/A11.md` | `briefs/A11.md` |
| B02 | app → db boundary (decision memo) | EXECUTED lote R | *decision memo — no verdict* | — | — | — | — | — | `d7dbf25f7` | `wf_921e8827-a47` | `lenses/B02.md` | `briefs/B02.md` |
| C04 | Crons: `vercel.json` vs the 25 route dirs, dispatcher, registry parity | EXECUTED lote R | AT RISK | 0 | 1 | 2 | 3 | 4/5 | `d7dbf25f7` | `wf_921e8827-a47` | `lenses/C04.md` | `briefs/C04.md` |
| C06 | Build, deploy and environment matrix | EXECUTED lote R | SOLID WITH FINDINGS | 0 | 0 | 2 | 2 | 5/6 | `d7dbf25f7` | `wf_921e8827-a47` | `lenses/C06.md` | `briefs/C06.md` |
| D05 | Pitch-claims verification | EXECUTED lote R | TRUE 43 / PARTIAL 17 / FALSE 3 | — | — | — | — | — | `d7dbf25f7` | `wf_921e8827-a47` | `lenses/D05.md` | `briefs/D05.md` |
| B01 | Module shape vs `hexagonal-lite.md` | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/B01.md` |
| B03 | Next.js edge (App Router + server actions) | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/B03.md` |
| B04 | Data access & indexing | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/B04.md` |
| B05 | Migrations & DB objects | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/B05.md` |
| B06 | Projections & cache pairing | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/B06.md` |
| B07 | `packages/contract` boundary & event catalog | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/B07.md` |
| B08 | Mobile app architecture & release config | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/B08.md` |
| B09 | Concurrency & idempotency | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/B09.md` |
| B10 | Performance & size budgets | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/B10.md` |
| B11 | Fence honesty | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/B11.md` |
| C01 | Cases, welfare, denuncias, decomiso, return-to-owner | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/C01.md` |
| C02 | Compliance rules & canonical metrics | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/C02.md` |
| C03 | Notifications & push | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/C03.md` |
| C05 | Observability & error handling | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/C05.md` |
| C07 | UI conventions, design system, es-AR copy | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/C07.md` |
| C08 | Test honesty | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/C08.md` |
| C09 | e2e practice | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/C09.md` |
| D01 | `AGENTS.md` §Data model / §Event catalog / §Roles / §Authorization / §Privacidad / §Legal vs code | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/D01.md` |
| D02 | `AGENTS.md` §Feature inventory / §Design rules / §Naming + `CLAUDE.md` vs code | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/D02.md` |
| D03 | `docs/agents/*`, `docs/superpowers/`, `docs/architecture/`, `README.md`, run-books, dangling paths | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/D03.md` |
| D04 | Process & governance | DEFERRED lote 2 | — | — | — | — | — | — | — | — | — | `briefs/D04.md` |

Totals across the 13 findings-bearing lenses — 90 from lote 1 (batch A) and 10 from lote R (C04, C06): **1 CRITICAL (closed) · 6 HIGH · 55 MED · 38 LOW = 100 confirmed**, 11 refuted findings, 84 of 105 healthy claims survived refutation. The 99 that are not the CRITICAL are all open.

**Why A01's CRIT column disagrees with A01's own lens file.** `lenses/A01.md` states "CRITICAL 0, HIGH 1, MED 3, LOW 4 (8 total)" and that is correct *for what the lens counted*: the CRITICAL arrived as a **healthy-claim refutation**, not as a finder submission, so the lens recorded it under "Claimed healthy, not verified" and it entered no severity tally. This synthesis assigns it the id **`A01-R1`** (`R` = refuter-originated) and counts it, because a finding without an id is a finding no fix can cite. The lens file is not restated; it carries a one-line closure note at `lenses/A01.md:58` and nothing else changed.

A third workflow, `wf_fc72359a-782`, produced the **conventions canon re-refutation** — it is not a lens. Its output is `docs/architecture/conventions-canon.md` (512 rules: 175 ENFORCED, 92 PARTIAL, 245 UNENFORCED) plus the per-scope pages under `docs/architecture/conventions-canon/`. Read it alongside this directory: the canon answers "what fails when you break this rule?", the lenses answer "what is broken today?".

## Closed since the audit

One finding has been closed end to end since the lenses ran. Nothing else on the backlog has moved.

| id | sev | what | fix | applied |
|---|---|---|---|---|
| `A01-R1` | CRITICAL | `"Profiles updatable by self"` constrained the ROW (`id = auth.uid()`) and not the COLUMNS, so any authenticated user could `PATCH /rest/v1/profiles?id=eq.<own uid>` with `{"role":"admin","account_type":"institutional"}` and mint themselves an admin. | Migration `db/migrations/0211_profiles_lock_postgrest_writes.sql` drops the policy — `profiles` keeps its SELECT policy and has no PostgREST write surface at all, mirroring what `0163` did for `ownerships`. Fence `__tests__/rls/profiles-write-lockdown.test.ts`. Commits `ae97186b9` (fix) and `36c8204c9` (`docs/architecture/rls-coverage.md`). | Applied by the PO to Supabase **`DIM-staging`** on 2026-09-02 — the only live database. There is no production database; the old `DIM` project is INACTIVE. |

Per the plan's CRITICAL rule the finding was escalated from 3 refuters to **5, and survived 5/5**. The vote is recorded in engram under topic `sdd/audit-2026-09/decisions`; the re-refutation ran as workflow `wf_8bd36c20-bc1`.

Three follow-ups the fix deliberately did **not** take, all queued rather than dropped: a `BEFORE UPDATE` trigger on `profiles` refusing a `role`/`account_type` change (belt-and-braces — a column `REVOKE` is useless here because `applySchemaGrants` in `scripts/deploy-provision.ts` re-grants `ALL` on every provision); a column-scope probe in the RLS matrix (`__tests__/rls/write-path-matrix.test.ts` classifies an `auth.uid()`-scoped policy as safe, which is true of rows and false of columns); and `A02-1`, the sibling HIGH on `pet_events`, now queued as migration **0212** (see `BACKLOG.md`).

## Deferred to lote 2

21 lenses, every one with a complete self-contained brief. Scope lines are in `BACKLOG.md` → "Deferred to lote 2".

`briefs/B01.md` · `briefs/B03.md` · `briefs/B04.md` · `briefs/B05.md` · `briefs/B06.md` · `briefs/B07.md` · `briefs/B08.md` · `briefs/B09.md` · `briefs/B10.md` · `briefs/B11.md` · `briefs/C01.md` · `briefs/C02.md` · `briefs/C03.md` · `briefs/C05.md` · `briefs/C07.md` · `briefs/C08.md` · `briefs/C09.md` · `briefs/D01.md` · `briefs/D02.md` · `briefs/D03.md` · `briefs/D04.md`

If lote 2 runs in a reduced form again, `B11` (fence honesty) is the one to keep: `C04-1` — the audit's sharpest finding — is an instance of the class B11 exists to enumerate, and it was found by accident inside a cron lens rather than by the lens that should own it.

## How to read this directory

The lens files live at `docs/reviews/2026-09-fresh/lenses/<id>.md`, the briefs at `docs/reviews/2026-09-fresh/briefs/<id>.md`. Every lens file has the same eight sections, and the order matters:

1. **Ground truth** — branch, SHA, file count, the scope sentence, what was new since the prior pass, which priors were triaged.
2. **Verdict** — `AT RISK` (a confirmed HIGH or CRITICAL exists), `SOLID WITH FINDINGS` (MED/LOW only), plus the counts.
3. **Healthy — verified solid** — properties that survived a refuter, each with its `guardedBy` fence and a `guardVerified` yes/no/partial. **The `guardVerified` flag is the most valuable field in the whole audit**: in roughly a third of healthy items the finder named the wrong guard and the refuter had to locate the real one, or found there is none. A healthy property with `guardVerified: false` is true today and unprotected tomorrow. It is also where the CRITICAL came from — read the "Claimed healthy, not verified" sub-section of every lens before the findings.
4. **Findings (CONFIRMED)** — grouped by final severity, each with an exploit or mutation, evidence commands with literal output, refuter votes, a one-line fix and a `fixClass`.
5. **Refuted** — findings that did not survive, with the reason. Read these: several refutations are more instructive than the findings they killed (`A08-5`, `C04-6`, `A03-G9`).
6. **Prior triage** — every finding of the 2026-07 audit, marked closed / still-open / not-reproducible with the evidence line.
7. **Nits** — below the severity floor; real, small, and often the seed of the next finding.
8. **Coverage** — areas read, areas NOT reached, and a collapsed full `filesRead` list. **Read the "Areas not reached" section before trusting a silence.** A lens saying nothing about `app/libreta/**` is not a clean bill of health for `app/libreta/**`.

Where a lens ran a gap round, that round appends its own Findings / Healthy / Coverage sub-sections after the base pass. Gap-round finding ids carry a `G` (`A03-G7`, `A08-G1`).

Finding ids (`A01-3`, `C04-1`) are stable identifiers. Keep them verbatim in commits, SDD change names and follow-up reviews — they are the only way a fix ties back to its evidence.

## How to run a deferred lens by hand

Every one of the 21 deferred lenses already has a **complete, self-contained brief**. The briefs were written to be executed by a human or an external read-only agent with no access to the workflow that produced them — you do not need this directory's context to run one.

Open `docs/reviews/2026-09-fresh/briefs/<id>.md` and follow it top to bottom:

- **Contract** — read-only; no `pnpm`, tests, builds, migrations or dev servers; never open `.env*`; every claim needs an `evidenceCmd` with its literal output, a repo-relative path and a line number. Exclusions: `.claude/worktrees/**`, `gate-*/**`, `docs/archive/**`, `node_modules`, `.next`.
- **SHA check first** — the brief expects `main` / `d7dbf25f7`. HEAD has since moved past `11c0ffc57`. **Re-locate every cited line by content, not by remembered line number**, and note the drift in the output.
- **Numbers to recount before use** — most briefs carry a block of counts the planning pass got wrong. Re-run the command in the block; do not trust the brief's own figure. Two of these are still open discrepancies worth resolving on the way (see `BACKLOG.md` → "Deferred to lote 2"); the third, the migration count, is resolved there.
- **Scope and lens** — several briefs merge two 2026-07 briefs verbatim; the merged text is preserved so a prior finding can still be triaged against its original wording. The old-brief → new-lens mapping is `docs/reviews/briefs/README.md`.
- **Priors** — where a lens has a 2026-07 result file, the brief names it. Triage every prior finding as closed / still-open / not-reproducible with evidence; do not re-file a prior as new without saying so.
- **Method** — an ordered checklist. **Output** — the exact JSON shape a lens file is rendered from. **Severity rubric** — per-lens, and it is not the same rubric across lenses; use the one in the brief you are running.

Three rules the executed lenses learned the hard way and a hand-run should inherit:

- **Enumerate the subject, not the spellings.** Half the confirmed fence findings in this audit are hand-maintained name lists that miss a member. When you check whether a fence covers a rule, open the fence and ask whether its predicate can FAIL on this rule's own files — not whether a fence with a matching name exists.
- **A finder's cited guard is a hypothesis.** Open it. Record `guardVerified` honestly, including "none — candidate".
- **Attack the healthy claims, not only the findings.** The one CRITICAL in this audit came from refuting a claim the lens had already written down as solid. A pass that only re-checks findings can only ever confirm what someone already suspected.
