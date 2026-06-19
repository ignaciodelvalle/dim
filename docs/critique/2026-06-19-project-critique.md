# MiMAR / DIM — Project Critique & Resolution Paths

> Date: 2026-06-19 · Scope: whole-project evaluation (architecture, privacy/security, UX & a11y, testing/CI, AI-handoff readiness)
> Method: parallel code investigation across the repo, with key claims verified directly against git and the schema/logs. Verified corrections are called out explicitly so this doc can be trusted as a baseline.
>
> **Assumption (2026-06-19 revision):** Mi Argentina is a **launch fact**, not roadmap. Personal-account identity and **DNI verification happen through Mi Argentina** — so the data strategy below is "don't store the raw DNI," not "encrypt it."
>
> **This document is the *evaluation* (the why).** The *executable* version for Claude Code — items scoped per session, in repo convention — lives in
> [`../superpowers/specs/2026-06-19-wave5-launch-hardening-handoff.md`](../superpowers/specs/2026-06-19-wave5-launch-hardening-handoff.md) and is indexed in `docs/superpowers/README.md`.

---

## 1. Stage assessment

**Where it is: a feature-complete MVP entering production-hardening — not yet production-ready for national-ID data.**

The signals of maturity are real and unusual for a solo/codename project: four portals (owner, org, govt, admin) live end-to-end, eight cleanly-sliced domains under a consistently-enforced hexagonal-lite architecture, an audited two-tier design system with WCAG-checked tokens, event-sourcing discipline, a spec-first culture, and comprehensive CI gates (lint, typecheck, build, dep-audit, migration-presence, schema-parity). The documentation (AGENTS.md, CONTRIBUTING.md, architecture guide, event-design checklist) is better than most funded teams produce.

The gap between "impressive MVP" and "production system that holds citizens' DNIs and feeds government dashboards" is **hardening**, not features. That gap is concentrated in five places: data-at-rest encryption, defense-in-depth on authorization, test-runner reliability, accessibility completion on operator surfaces, and finishing the strangler migration. None are existential; all are addressable.

A useful one-line framing: *the architecture is production-grade; the data-protection posture and the test/release reliability are not yet.*

**Execution state (read from `docs/superpowers/README.md`).** Much of the UX critique from earlier rounds has already shipped: unified `AppShell` (Item 7, fixes the logged-in-user-stranded-on-public-surfaces bug), loading skeletons (Item 8), event-forms mobile hardening (Item 9), operator omnibox + bulk bar with PII-logging (Item 10), and the metrics-IA **k-anonymity boundary** (Item 0, `suppressSmallCells` k=5 — the privacy gap that was open is now closed in code). So the open surface is genuinely the hardening items below, not the UX foundation. Operator-portal a11y (Item 11) and the cases system (Items 12 / `2026-05-19-cases-system.md`) remain queued in their own waves and are referenced — not duplicated — here.

---

## 2. What's genuinely working (don't touch)

- **Architecture is enforced, not aspirational.** Biome's `noRestrictedImports` actively blocks `@/db`/`next` in domain layers, so the dependency rule survives contact with real contributors. Eight domains share one anatomy — learn it once, read them all.
- **Design system is real and audited.** `Ln*`/`Op*` token families in `globals.css`, a documented contrast audit (10/11 AA, the warn color darkened to 5.28:1 to fix the failure), self-hosted fonts, reusable primitives (`Button`, `Field`, `Card`, skeletons with `aria-busy`).
- **Public credential path is well-built.** Rate-limited (60/min, 400/hr) *before* touching data, privacy tiers 0/1/2, alt text on pet photo and QR, skip-link and loading states.
- **Secrets hygiene is correct.** `.env.local` gitignored, service-role key behind a `server-only` admin helper, cron endpoints guarded with `timingSafeEqual`. SQL is parameterized throughout (no string interpolation into `sql``).
- **Handoff scaffolding exists.** CODEOWNERS, PR template, issue templates, and a clear "start at AGENTS.md" entry point are all present.

---

## 3. Verification corrections (claims that did NOT hold up)

Investigation surfaced several issues that direct checking disproved. Recording them so they don't get actioned by mistake:

| Claimed problem | Reality |
| --- | --- |
| Build artifacts (`.vitest-full*.log`, `tsconfig.tsbuildinfo`) committed to git | **Not tracked.** Gitignored local cruft. No repo bloat. |
| `design_handoff_*` dirs committed despite gitignore | **0 tracked files.** Correctly ignored. |
| Stray `C:dimappperdidas` / `C:dimsrcmoduleslostinfrastructure` dirs polluting the repo | Empty, **untracked**, local only. Path-bug artifacts from a Windows tool writing literal paths — cosmetic. |
| Test suite is red (14 assertion failures) | **159 tests pass, 0 failures.** The noise is 311 *worker-exit* errors — a runner/teardown problem, not failing assertions (see §4 Testing). |
| Missing CODEOWNERS / PR template | Both **present**. |

The lesson for the real findings below: they're worth confirming the same way before large remediation.

---

## 4. Findings by dimension

Severity: 🔴 Critical (block production / data-protection risk) · 🟡 Moderate · 🟢 Minor.

### Privacy & Security

| # | Finding | Sev | Resolution |
| --- | --- | --- | --- |
| S1 | **DNI stored as a plaintext `text` column** (`db/schema.ts`) with a unique index on `dni_number`. A DB dump exposes national IDs in the clear. With Mi Argentina now verifying DNI at launch, storing the raw number is both a liability *and* unnecessary. | 🔴 | **Don't store the raw DNI.** Mi Argentina returns a verified identity; persist `miarg_sub` (opaque subject id), `dni_verified`/`dni_verified_at`/`identity_source`, a **keyed HMAC `dni_hash`** (pepper in env/KMS, never in DB) only for the equality-matching flows that need it (bite reconciliation, adoption applicant identity), and optionally `dni_last4` for operator disambiguation. Drop the plaintext column; move the unique index to `dni_hash`. Full detail → Wave 5 Item 25. |
| S2 | **Authorization is single-layered.** RLS is enabled on only ~8 of 100+ tables; Drizzle runs as service-role and bypasses it by design, so each `actions.ts` is the *only* gate. One missing check on one action = PII leak. | 🔴 | Keep the action edge as primary, but enable RLS as a backstop on the sensitive tables (`profiles`, `ownerships`, `pets`, `pet_events`, `pet_identifications`, `welfare_*`, share tokens). Document it as defense-in-depth, and make the public/anon read paths the highest-priority authz test surface. |
| S3 | **Event payloads carry PII and are queried/returned wholesale.** Adoption-application events appear to hold applicant name/phone/address/DNI in the event payload; `findOpenApplicationForPet` selects the payload rather than a redacted projection. | 🟡 | Project PII out of returned shapes; keep the immutable event for audit but never return raw payloads to callers. Audit every `payload->>` read for over-exposure. |
| S4 | **Lost-pet location not filtered by the owner's own privacy flag.** `discloseLastLocationWhenLost` is selected but not applied in the `WHERE`; redaction happens only at the view layer, so any JSON/error path leaks it. | 🟡 | Push the flag into the query predicate, not the template. |
| S5 | **Credential-scan events create an indefinite location/time trace** of who viewed which pet, with no retention policy. | 🟡 | Define a retention TTL (e.g. auto-purge scanner events > N days); never store IP/lat-lng in scan payloads; document the scan-privacy model in AGENTS.md. |
| S6 | Welfare reference codes use Web Crypto (`getRandomValues`) while `lib/publicToken.ts` uses `node:crypto.randomBytes`. Both are adequate; the inconsistency is a smell. | 🟢 | Standardize on `node:crypto` server-side. |
| S7 | No documented secret-rotation policy / SECURITY.md; admin-client instantiation isn't audit-logged. | 🟢 | Add SECURITY.md with rotation cadence; log admin-client use. |

> Note: the token generator (rejection-sampled `randomBytes`, 31^8 space) and public-credential rate limiting are **fine** — earlier "missing rate limit / weak token" suspicions were disproved within the review.

### Architecture & code quality

| # | Finding | Sev | Resolution |
| --- | --- | --- | --- |
| A1 | **Domain-purity leak:** `organizations/domain/capabilities.ts` imports the runtime constant `ORGANIZATION_CAPABILITIES` from `@/db/schema`. Biome's rule catches named imports but not this pattern, so the guard has a blind spot. | 🟡 | Move the catalog to a domain-owned constant; tighten the lint rule to cover re-exported runtime values. |
| A2 | **Strangler migration ~80% done.** Legacy `app/actions/*` (e.g. `intake.ts`, `pet-sighting.ts`) still issue Drizzle queries directly instead of delegating to `src/modules/*`. Since actions are the security boundary, scattered DB access spreads the authz surface (ties to S2). | 🟡 | Finish extracting cases/welfare actions into their modules; set a sunset date for `app/actions/` shims. |
| A3 | `lost/` module has only `infrastructure/` — no `domain`/`application`/`actions`. Likely planned, but it's an inconsistency a new agent will trip on. | 🟢 | Either scaffold the missing layers or add a README noting it's intentional/pending. |
| A4 | Repository pattern is inconsistent (`class` in some modules, `const` namespace object in others). | 🟢 | Pick one; document it. |

### UX, design & accessibility

| # | Finding | Sev | Resolution |
| --- | --- | --- | --- |
| U1 | **Operator-portal accessibility deferred.** Dense govt/admin tables lack `<th scope>`/`<caption>`/keyboard nav; KPI badges and severity use color alone (WCAG 1.4.1). axe coverage only spans credential + denuncia + owner, not `/gob`, `/admin`, `/org`. For a government tool this is also a legal exposure (public-sector AA mandate, Ley 26.653). | 🔴 (for govt rollout) | **Already tracked as Wave 2 Item 11** — not re-scoped here. Wave 5 only adds it as a launch-gate dependency for the govt rollout. |
| U2 | **PWA is declared but not configured** — no `manifest.json`, no service worker; `next.config.ts` only has a placeholder comment. The README sells it as an installable PWA. | 🟡 | Add manifest + icons + SW (or `next-pwa`) if install/offline is in scope; otherwise soften the README claim. |
| U3 | **Lost/found flow clarity.** The `/encontre` and `/sighting` sub-pages lack a back/breadcrumb and a "what happens next" confirmation — exactly the moment a stranger needs reassurance their report reached the owner. | 🟡 | Add a confirmation/"el dueño recibirá tu contacto" closure and a back affordance; test the 320px viewport. |
| U4 | Case UX is scattered across `/casos`, `/maltrato`, `/decomisos`, `/disputas`, `/observaciones` (Item 12 deferred); owner account hub `/cuenta` is a flat list with destructive actions not separated (Item 14 deferred). | 🟡 | Build a shared `CaseDetailShell`/`CaseQueue`; reorg `/cuenta` into semantic groups with an isolated "Zona de riesgo." |
| U5 | `design_handoff_*` references are now superseded by live tokens in `globals.css`. | 🟢 | Move any still-valuable mockups to a tracked `docs/design-reference/`; retire the rest. |

### Testing, CI & handoff readiness

| # | Finding | Sev | Resolution |
| --- | --- | --- | --- |
| T1 | **Test runner is unstable.** The last captured integration run passed all 159 tests but emitted **311 "Worker exited unexpectedly" errors** and ran ~5 hours — classic Postgres connection-pool exhaustion / non-idempotent teardown under `fileParallelism:false`. This erodes trust in `pnpm test` and will eventually flake CI red. | 🔴 | Audit `__tests__/_helpers` setup/teardown for connection cleanup and state isolation; cap worker lifetime; get the suite back to minutes, not hours. |
| T2 | **Projection coverage is thin.** ~20 pure projections in `lib/projections/`; only ~4 are tested. These compute pet status/microchip/weight/pregnancy — silent regressions here corrupt records. | 🟡 | Unit-test the remaining projections with edge cases (they're pure — cheap to cover). |
| T3 | **No e2e for the auth/RLS boundary** (owner A must not see owner B). Given S2's single-layer design, this is the one e2e you most want. | 🟡 | Add a cross-tenant access e2e per role (owner/vet/org/govt/admin). |
| T4 | **No SAST / secret-scanning / Dependabot** in CI; deploy is manual via Vercel CLI. Government integration will demand a security pipeline. | 🟡 | Add CodeQL + secret scanning + Dependabot; script/gate the deploy. |
| T5 | **AGENTS.md is ~100KB.** It's well-structured but too large to load whole into an agent's context — ironic for a repo whose stated purpose is Claude Code handoffs. | 🟡 | Split into a slim always-load index (≤ ~1.5k tokens: invariants, where-things-live, the dependency rule, the checklist) that links out to deep sections loaded on demand. |
| T6 | Git working state is unusual — current branch `chore/ve` reports "no commits yet" with everything staged, and a `.git/index.lock` was present. | 🟢 | Confirm the branch/worktree isn't mid-operation before more work lands. |

---

## 5. Resolution paths (sequenced)

> **The executable version of this section is the Wave 5 handoff** (`docs/superpowers/specs/2026-06-19-wave5-launch-hardening-handoff.md`), written in repo convention with per-item file-level detail, legal anchors, and a "cierre por item" checklist. The waves below map to it: **Item 25** Mi Argentina identity + DNI-less storage (S1), **Item 26** RLS defense-in-depth backstop (S2), **Item 27** PII-exposure fixes (S3/S4), **Item 28** scan retention (S5), **Item 29** test-runner reliability (T1), **Item 30** security CI pipeline (T4), **Item 31** AGENTS.md slim + privacy rules (T5).

Framed as handoff-able work packages, in the order I'd run them.

### Wave A — Data-protection gate (do before any real user data or Mi Argentina talks)
1. **Encrypt DNI/matrícula at rest** (S1) — `pgcrypto`, keyed-hash index, decrypt at edge.
2. **RLS backstop on sensitive tables** (S2) + **cross-tenant e2e** (T3) — make the single gate a double gate and prove it.
3. **Stop returning raw event payloads / filter lost-location in-query** (S3, S4).

*Exit criteria: no plaintext national ID in the DB; a deliberately wrong-user request is denied at two layers and has a test proving it.*

### Wave B — Release reliability (do before scaling contributors/agents)
4. **Fix the test runner** (T1) — teardown/pool isolation; suite back under a few minutes.
5. **Cover projections** (T2) and finish the **strangler extraction** of `app/actions/*` (A2), closing A1 along the way.
6. **Slim AGENTS.md into an index + deep-links** (T5) — directly serves this project's handoff purpose.

### Wave C — Government-readiness polish
7. **Operator-portal a11y** (U1) — axe coverage + non-color status + table semantics.
8. **Security pipeline** (T4) — CodeQL, secret scan, Dependabot, scripted deploy.
9. **Case-UX unification & account-hub reorg** (U4), **PWA decision** (U2), **lost/found closure UX** (U3), scan-retention policy (S5).

### Always-on housekeeping
- Standardize repository pattern (A4), the welfare RNG (S6), retire `design_handoff_*` (U5), confirm git branch state (T6), add SECURITY.md (S7).

---

## 6. Suggested next move

Two of these double as the project's actual purpose (designing Claude Code handoffs): **T5 (slim AGENTS.md index)** and **Wave A as a spec**. The highest-leverage single artifact would be a short "Privacy & data-handling rules" section folded into AGENTS.md — a checklist any agent must satisfy when touching a public route, a token, or a PII field — paired with the AGENTS.md restructure so agents actually load it.
