# What this repo taught a collaborating agent, and what it should change

Companion to `handoff-2026-08-30.md`. That page says **what was done**. This one
says **what the work revealed about the repo itself** — including in places the
session never touched.

Every claim here carries the measurement that produced it. Where a number is
quoted, it was recounted at the source; where something is inference, it says so.
That is the repo's own rule and this page is not exempt from it.

---

## The one observation everything else hangs from

**This repo builds first-rate detectors and does not reliably close what they
find.** It is not a philosophical complaint; it is arithmetic, and the arithmetic
was gathered before any code was written.

- `e2e-nightly`: **21 runs, 21 failures. Never green in its life.** A fence that
  has never passed is not a fence — it is a red light nobody looks at.
- `db-doctor-staging`: 13 of 13 red.
- CI on the working branch: **96 failures in the last 100 runs** at the start of
  the session, while ~40 commits a day landed on top.
- Ten open issues, **none newer than 2026-07-02** — 58 days of no new tickets in
  a repo committing forty times a day.

The instruments are excellent. The habit of acting on them is where the gap is.
Everything below is a specific instance of that same shape.

---

## 1. Nothing enforces anything at the edge

`gh api rulesets` returns `[]`. There are no git hooks (`.husky`, `lefthook`:
absent). `CI on main is advisory` is a deliberate, written decision, and its
argument is correct as far as it goes: **the real gate is local**, and a required
check does not replace it.

But a required check was never meant to replace it. It is the backstop for the
one case the local gate cannot cover: **forgetting to run it, or believing a
summary instead of the verdict line.**

That is not hypothetical. It happened in this session, and it was the
orchestrator — not a subagent — who did it. A window was pushed after reading
"gate green" from a report without recounting the two verdict lines; one run had
`1 failing test(s)`. Documented in `40c42d5c4`, cause fixed in the window after.
The agents, held to "recount at the source", did not make that mistake. The human
layer did.

**Recommendation.** One required status check on `main`: the `Lint, typecheck,
build` job. It is cheap, deterministic, and needs no database. Cost on a green
push: nothing. It would have caught the one failure mode that discipline alone
did not.

---

## 2. Two fences exit 0 while proving nothing

Run standalone, without a prior build:

- `lint:route-weight` → exit 0, log says *"NO SE MIDIÓ NADA. El peso de las rutas
  no fue verificado en esta corrida."*
- `lint:csp-prerender` → exit 0, log says *"This run proved nothing about the
  CSP."*

Inside `pnpm verify` the build runs first, so they measure for real. Standalone
they are false greens — and every lane in this session had to be told to declare
them as *not measured* rather than count them as passing.

**Recommendation.** Make them exit non-zero when they self-skip, or rename them
so the dependency is in the name (`lint:route-weight:post-build`). An exit code
that means "I did nothing" is the exact thing `test:verified` exists to prevent,
reproduced inside two fences.

---

## 3. Floors loosen in silence; ceilings do not

Two pinned numbers use `toBeGreaterThanOrEqual`:

- `MIN_V1_ROUTE_FILES` (`scripts/check-api-v1-envelope.ts`)
- `MIN_IP_BUCKETS` (`__tests__/api-v1-rate-limit-families.test.ts`)

Both drifted **twice** during this session without anything going red, because
any larger number satisfies a floor. Measured cases: 21 pinned against 23 real
routes; 28 against 29; 34 against 35 buckets. Each time the fence was green and
loose.

Contrast `API_V1_CGNAT_FAMILY_IP_CEILING_PER_MINUTE`, which uses `toBe`. **It
goes red on its own** every time a bucket lands, and it did — repeatedly, and
usefully, forcing a re-derivation each time.

**Recommendation.** Convert both floors to exact equality with a recount, the way
the CGNAT ceiling already works. A floor communicates "at least this much
coverage"; what it actually enforces is "coverage never checked again".

---

## 4. Numbers transcribed into prose rot, and one class of them cannot be kept

Seven transcribed numbers were found stale and recounted during this session:

| Claimed | Actual | Where |
|---|---|---|
| "~30 call sites" | 26 | `check-storage-write-policies.ts` reason text |
| "21 tables" | 20, later 17 | `AGENTS.md` §6b vs §7 — **the file contradicted itself 46 lines apart** |
| "eighteen reached by the RPCs" | 22 | `check-subject-rights-coverage.ts` header |
| "seven per-IP ceilings" | twelve at minimum | `api-v1-limits.ts` |
| "26 segments" | 27 | commit body |
| "3 of 9 prefixes" | 9 of 12 | `redact.ts` |
| "10 SELECT policies" | 8 | `soft-delete-read-surface.test.ts` header |

And one that is structurally unmaintainable: a paragraph in `open-work.md` that
reports a **census of matches in that same file** changes the census by being
written. It moved twice while being drafted. The fix adopted was to argue by
location instead of by count.

**Recommendation.** Derive or fence; do not transcribe. Where a number must
appear in prose, add a test that recomputes it from the source and pins it — the
repo already does this well in several places. And treat a self-referential count
as a defect of form, not of diligence: no amount of care keeps it true.

---

## 5. `pnpm test:verified` does not cover `apps/mobile`

Its discovered set is the two vitest projects, `db` + `unit`. `apps/mobile` never
appears in it. The native suite is a **separate Jest run** inside `pnpm verify`,
via `verify:mobile`.

This matters because the Definition of Done names `test:verified` as half the
gate, and for any mobile-only change that half proves the work **broke nothing
else** — never that the work itself is covered. Three windows in this session
were mostly mobile. The evidence for those lives in the Jest block of the verify
log, and nothing in `/CLAUDE.md` says so.

**Recommendation.** State it in `/CLAUDE.md` next to the Definition of Done. One
sentence. Whoever reads the verdict line for a mobile change is currently reading
the wrong instrument without being told.

---

## 6. The board is a guaranteed collision, by design

`docs/agents/open-work.md` must be edited by **every** lane — the norms require
it. With two or more parallel writers that is not a risk, it is a certainty. It
produced the only real merge conflict of the session, and a semantic one: two
lanes renumbered the same table simultaneously and rewrote the same landing
section in different shapes. Picking a side lost real work from the other.

What worked, after being adopted mid-session: **lanes are append-only** (mark the
row, append the block, never renumber), and **the integrator renumbers once** at
the end.

**Recommendation.** Write that rule into `collaborating-writer.md`. It cost one
hand-merged conflict to learn and it generalises to any file every lane must
touch.

---

## 7. There are five red signatures, not three

`/CLAUDE.md` documents three and teaches them well. Two more were measured here:

**Fourth — a live conflict marker inside a test file.** Produces a *broken file*,
not a failing test, and is **invisible to all 67 `lint:*` fences**. Found inside
`api-v1-rate-limit-families.test.ts`.

**Fifth — Node's clock against Postgres's clock.** A test took `new Date()` in
Node and compared it to a column defaulted from `now()` inside the Docker
container. Measured drift on this machine: −1.0 to +6.5 ms, enough. **It fails in
both directions**, and the second is worse: with Postgres *ahead*, a negative
assertion leaks a row from a previous test and goes red on a healthy tree.

This is what made `test:verified` give two different verdicts over one frozen
tree — the single most expensive kind of failure this repo can have, because it
makes the gate unable to decide anything.

**Recommendation.** Add both to the signature list. And sweep for the fifth: the
20 `defaultNow()` columns crossed against `gte|gt|lte|lt` in tests found four
files, two of which needed fixing.

---

## 8. The defect can live in the stub or the harness, not the assertion

This is the class of finding that generalises furthest, and it appeared twice.

**The stub.** `self.where = async () => control.rows` discarded the predicate. All
**21 assertions in that file** were therefore made on rows the `WHERE` could not
touch. A stub that ignores an argument does not merely fail to test it — *it makes
the entire file assert that the argument does not matter.* The authorization
predicate for "my appointments" could be mutated into a tautology returning every
user's rows, with the suite 21/21 green and all three authz fences green.

**The harness.** A fence around a CI retry script ran it via
`execFileSync("bash", [path])` — bash **without** `-e`. GitHub runs `shell: bash`
as `bash --noprofile --norc -e -o pipefail`. Eight tests passed over a script
that, in production, never retried at all.

**Recommendation.** When reviewing a test, ask of the harness what you ask of the
code: *does this reproduce production?* And add it to the reviewer contract —
the fresh-context reviewer caught both of these, and only because it was told to
look there.

---

## 9. A fence anchored in source text fences nothing

`toContain("isNull(pets.deletedAt)")` passes just as happily for
`or(isNull(pets.deletedAt), sql\`true\`)`. Measured, not supposed: the mutation
was applied and the text anchor stayed green.

Worse in the same file: degrading an `innerJoin` to a `leftJoin` leaves the `ON`
clause **word for word** and stops excluding — the row survives with the pet
null, and the payload publishes the appointment of a suppressed animal.

**Recommendation.** Anchor on the **compiled SQL** or on behaviour. The repo
already has the tool: `PgDialect().sqlToQuery()` gives the exact statement and
bound parameters. Several fences were converted to it during this session and
they caught mutations the text anchors let through.

---

## 10. The method that actually worked

One rule caught the dominant defect **five separate times**, including a case
where the entire credential-flip feature could be deleted and the suite stayed
178/178 green:

> **For every new test, name the exact production mutation that breaks it — and
> apply it.**

Not predict it. Apply it, watch the red, restore. Agents that were told this
found their own decorative assertions before a reviewer did. Agents that were not
shipped tests that could not fail.

**Recommendation.** Put it in `collaborating-writer.md` as an eleventh rule. It
is cheap, it is mechanical, and on this evidence it is the highest-yield review
practice in the repo.

---

## 11. What actually worked — the method, for whoever runs the next session

The nine points above are what to change. This one is what to keep. Each of
these was adopted mid-session because something broke without it, and each one
paid for itself afterwards.

**The window shape the repo already prescribed, rediscovered the expensive way.**
`CLAUDE.md`'s working norms say it in one line: *parallel writers only in
worktrees, with disjoint file territory + targeted tests, landing through a
serial integration merge gate.* Two or three lanes writing at once, each running
only targeted tests plus its own fences, and **one** integrator who merges,
re-derives the pins and runs the full gate. The reason is in the norm itself —
the local Supabase is shared. Gating per-lane *and* at integration was tried
first; it poisoned three lanes at once (one measured 223 pets inserted by another
process in fifteen seconds) and cost a full window.

**One integrator, and it says no.** Six times a lane was left out of a window for
an open blocker, and six times that was right. *A clean window of two beats a
window of three with one broken inside it.* Rejecting is cheap — the worktree
survives and the lane comes back from its own branch, not from zero. Two lanes
were rejected twice and landed on the third try, better than they started.

**The fresh-context adversarial reviewer, per lane.** Rule 8 of the contract, and
it earns its cost. It found: an authorization `WHERE` mutable into a tautology
with the suite 21/21 green; a fence whose text anchor let the mutation through; a
lane that ran 68 `lint:*` fences and missed two vitest ones; and the stub that
neutered 21 assertions at once. **None of these were visible to the author.** The
brief that made it work is short: *apply the mutation, do not predict it; recount
every number at the source; ask whether the harness reproduces production.*

**Resolve conflicts where the context is, not at the merge.** One lane came back
from rejection having resolved its five conflicts in its own worktree, one at a
time, with the other side's code visible — and `git merge` had nothing left to
do. The conflict that had blocked it was a product decision about button order
that no merge strategy can make. Conflicts are not obligatorily paid at the
merge; they are better paid by whoever can argue them.

**Reset the worktree base; do not verify it.** This harness creates worktrees
from `origin/main`, which can be far behind the local tip. Told to *verify and
stop*, one lane correctly stopped — and its reasoning is the lesson: its own file
territory was byte-identical between the two revisions, so continuing looked
safe, but `main` had meanwhile extracted the `isTitularHolder` predicate. **A
fence recognises guards by form**, so a sweep written against the old file pins a
vocabulary that has already moved. Detecting was not enough; the first action has
to be the reset.

**Commit incrementally, and often.** Four session interruptions happened. Every
time, the lanes that batched their work to the end lost all of it and the ones
committing as they went kept everything. On the fourth, a lane's nine commits
survived intact and the window resumed from them.

**Append-only on any file every lane must touch.** The board is edited by every
lane by rule, so with two writers it is a guaranteed collision. Lanes mark and
append; the integrator renumbers once at the end.

**Hand back rather than attempt.** Eleven items were returned to the PO instead
of being half-done: the EAS builds, the Data Safety form, the remote migrations,
the telemetry vendor, the retention policy. A returned item with its reason
written is a finished piece of work, not a failure — and one lane's best
contribution was a costed recommendation it explicitly declined to decide.

**And the one that mattered most, restated because it belongs in this list too:**
require every new test to name the production mutation that breaks it, and to
**apply** it. It caught the dominant defect five separate times.

---

## What is still open, and none of it was touched by this session

Listed so it is in one place, with its weight named honestly:

- **The two blanket storage grants.** `pet_photos_authenticated_upload` and
  `event_attachments_authenticated_upload` have `bucket_id` as their only
  predicate — **true for any authenticated account in the country**, over buckets
  holding vaccination records. The signed primitive that replaces them exists.
  26 call sites, one chokepoint (`lib/infra/uploads.ts`). `event-attachments`
  additionally needs the confirm step to take a parent event id.
- **EXIF/GPS on the old upload door.** The abuse-report forms still accept
  `image/heic`, so **an anonymous reporter's home GPS travels in every iPhone
  photo**. Deferred by a written PO decision; the consequence is written too.
- **No GC for any storage bucket.** 25 crons, none touches storage. Two
  event-driven deletes exist; nothing scheduled. Abandoned uploads are never
  collected.
- **Retention policy**, open since 2026-06-11 awaiting legal sign-off. Four
  tables carry a deliberately inert `retention_until`.
- **The declared debts** in `open-work.md` — fifteen open at the close.
- **`e2e-nightly`**, still never green. Its CI failure was diagnosed here
  (ECR Public throttling, not Docker Hub as previously believed; the stack was up
  in 44 of 45 runs) but the fix is not landed.

---

## One thing that is genuinely excellent and should not be traded away

The commit messages. 97-character average subject over 500 commits, domain scopes
in Spanish, and — this is the rare part — **they name the lie, not the file**:
*"route-weight corría antes del build, así que salía verde sin medir nada"*,
*"el nightly era inocente"*, *"dos números que decían 'medido' y no reproducían"*.

That is not decoration. Every one of those subjects is a fence's post-mortem, and
reading `git log` here teaches the codebase faster than any document. Whatever
else changes, keep that.
