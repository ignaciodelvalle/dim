# UX-gate battery v2 — 4 new Chrome-agent dimensions (post-Wave-F)

Run these on the FIXED instance AFTER Wave F + the re-gate (running on a half-remediated build = noise). Builds on the two v1 cohorts (fixture citizen/operator) — these are NEW dimensions, not repeats.

## Common contract (every prompt inherits this)
- Server: `http://localhost:3000` (built, not dev). Creds all `Test1234!`: owner@dim.test (10 pets, DIM-DEMO-0001=Rocco), owner2@, govt@, admin@, orgadmin@, alejo@/vet@.
- **Rubric per key screen** (4 questions): ¿Sobra? · ¿Falta? · ¿Autocontenido? · ¿De un vistazo?
- **Severity:** Blocker (rompe tarea/promesa) / Mayor (confunde o hace adivinar) / Menor (pulido). **PASS = 0 Blockers AND Mayores ≤ 5.**
- Screenshot every key screen. Mark `[POCO INTUITIVO]`. Log every side-effect (for revert). **NO irreversible actions** (account delete, hard-delete, payments) — stop at the confirmation.
- Output a structured addendum to the named file + a PASS/FAIL verdict.

## Run structure (instances + parallelism)
| Dimension | Instance | Agents | Parallelism |
|---|---|---|---|
| **Génesis** | EMPTY (`db:reset && db:bootstrap` + 1 admin) | both, RELAY | sequential handoffs via ledger — run ALONE |
| **Mobile** | populated (fixed) | Cowork=citizen, Cursor=operator | the pair in parallel |
| **Adversarial** | populated (fixed) | Cowork=citizen, Cursor=operator | the pair in parallel |
| **Costuras** | populated (fixed) | 1 agent (spans roles) | run alone (or after the Mobile/Adversarial pairs) |
Order: Génesis on its own empty run; then on the populated instance run Mobile (pair) → Adversarial (pair) → Costuras (solo). Never 4 browser agents on one :3000 at once.

---
## 1. GÉNESIS (empty world, relay) — see also 2026-07-05-uxgate-genesis.md
Precondition: `pnpm db:reset && pnpm db:bootstrap` then create ONLY admin@dim.test. Shared ledger: `docs/reviews/results/genesis-ledger.md`.

**OPERATOR agent (Cursor):** [common contract]. You own acts 1/3-verify/4-approve/5/7 of the Génesis chain: admin provisions the first government (locality); verifies the org the citizen registers; approves the vet matrícula; grants event.write in the permissions matrix; and (act 7) filters to the locality, acts on a rule, watches the system's behavior change. Read+append `genesis-ledger.md`; wait for an `AWAITING` you own before that act. Screenshot + rubric each screen. Output → `docs/reviews/results/genesis-cursor.md`.

**CITIZEN agent (Cowork):** [common contract]. You own acts 2/3-register/4-request/6: a person signs up + registers the first pet; registers an organization (→ awaits gov verify); requests a vet matrícula (→ awaits gov approve); and (act 6, after the vet exists) the life events — the vet signs a vaccine, the org intakes+publishes+finalizes an adoption, a bite→observation, a lost→found. Read+append `genesis-ledger.md`; wait for `AWAITING → ✓` before proceeding. Output → `docs/reviews/results/genesis-cowork.md`.

---
## 2. COSTURAS cross-POV (populated, 1 agent) — "the system is ONE"
[common contract]. Verify that a citizen action PROPAGATES to the operator side (and back), end-to-end, moving the shared state. Drive BOTH sides (you may log in/out across accounts). For EACH seam: do the citizen half, then confirm the operator half shows it + is actionable + the aggregate moved — screenshot both ends.
Seams: (a) **owner marks a pet lost** (owner@) → it appears in **govt** /gob/perdidas as a case AND on public /perdidas; owner marks found → the case closes. (b) **vet signs a vaccine** (alejo@ via Atender, DIM-DEMO-0001 code) → owner@'s libreta flips that vaccine declarada→verificada (MP) → govt rabies-coverage KPI moves. (c) **public denuncia** (anon, 5-step wizard, save the code) → **admin** moderation → **govt** welfare case; follow by code. (d) **org publishes adoption** (orgadmin@) → owner2@ applies → org finalizes → owner2@ becomes the owner + custody closes. For each: does the same entity/code (CAS-/DIM-/DEN-) cross portals consistently? Output → `docs/reviews/results/uxgate-costuras.md` with a seam-by-seam PASS/FAIL.

---
## 3. MOBILE / responsive (populated, pair) — real usage is the phone
[common contract]. **Set a phone viewport (390×844, iPhone-ish) for the whole run.** Assess: layouts don't overflow horizontally, touch targets ≥44px, no desktop-only assumptions, the hamburger/drawer nav works, forms are usable one-handed.
- **CITIZEN scope (Cowork):** landing, /perdidas, /adoptar, buscar por código, the **credential/libreta** (the flagship — does the flip + QR work on mobile?), alta, the denuncia wizard, /cuenta.
- **OPERATOR scope (Cursor):** /gob Panel + **Panorama map** (layers/legend/interaction on a phone — the hardest), the dense gob tables (casos/cola), /org mascotas, /admin dashboard.
Rubric + a MOBILE-specific note per screen (overflow? tap target? map usable?). Output → `docs/reviews/results/uxgate-mobile-{cowork|cursor}.md`.

---
## 4. ADVERSARIAL / unhappy-path (populated, pair) — the edges that break
[common contract]. Deliberately probe the UNHAPPY paths (do NOT execute irreversible ones — stop at confirmation): empty states (a brand-new account with 0 pets; an org with 0 animals; an empty queue), error states (submit a form with invalid/missing fields — is the error message clear + on the right field?), weird inputs (emoji/very-long text/SQL-ish strings in free-text fields, a malformed DIM/DEN code, a future date), double-submit / rapid double-click, back-button mid-flow, a direct-load of a deep URL with a bad param (?sheet=nonexistent, /mis-mascotas/DIM-DOESNT-EXIST), and session edge (open a protected page, note what happens if unauthenticated).
- **CITIZEN scope (Cowork):** the owner/public forms (alta, denuncia wizard, login, privacy toggles, lost-mode), empty owner account.
- **OPERATOR scope (Cursor):** the operator forms (mordedura, servicios, permisos, matrícula, org intake), empty org/queue, the Atender code lookup with bad codes.
For each edge: does it fail GRACEFULLY (clear message, no blank/crash/silent-swallow) or badly? Severity. Output → `docs/reviews/results/uxgate-adversarial-{cowork|cursor}.md`.
