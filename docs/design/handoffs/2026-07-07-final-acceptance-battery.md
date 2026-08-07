# Final acceptance battery (2026-07-07) — pre/post-demo

Purpose: browser-verify the overnight fixes + sweep the whole system, producing reports Claude can remediate from directly. Run on a **freshly rebuilt** `:3000` (stale-build hazard: a cohort hitting an old build reports phantom bugs — always `rm -rf .next && pnpm build && pnpm start` first, or confirm the build is newer than HEAD).

## Common contract (every prompt inherits this)
- Server `http://localhost:3000` (built, not dev). Accounts, all `Test1234!`: `owner@dim.test` (10 pets, DIM-DEMO-0001), `owner2@`, `govt@` (focal CABA), `admin@`, `orgadmin@`, `alejo@` (vet, clinic `DIM-UBHY-TCH5`).
- **Rubric per screen:** ¿Sobra? ¿Falta? ¿Autocontenido? ¿De un vistazo?
- **Severity:** Blocker (breaks a task/promise) · Mayor (confuses / forces guessing) · Menor (polish).
- **NO irreversible actions** — stop at the confirmation dialog (no real account-delete, hard-delete, payment).
- **Artifact-vs-bug discipline (learned the hard way):** if something fails, RELOAD once + try a fresh tab. If it only fails under your extension's DevTools/viewport manipulation but works on a plain reload, label it `[TOOLING-ARTIFACT]`, not a product bug. The credential 3D flip is a known example — it works in a clean browser.

## Report template (USE THIS EXACTLY — it's what makes the report actionable)
For each finding:
```
[SEVERITY] Screen/route · short title
Repro:   1) … 2) … 3) …   (exact clicks, from a known account)
Expected: …
Actual:   … (+ screenshot filename)
Area guess: <route file / component / "seed data" / "not sure">
Bug or artifact: PRODUCT-BUG | [TOOLING-ARTIFACT] | [SEED-DATA]
```
End each report with: **VERDICT (PASS = 0 Blockers) + the 3 highest-value findings ranked.** Save to the named file + a `-screenshots/` dir.

---

## TRACK A — regression of the overnight fixes (run the pair in parallel)
Goal: confirm each fix Claude made last night actually works in a real browser. For each item, do the repro + state **CONFIRMED-FIXED** or **STILL-BROKEN** (with the report template).

### A-citizen (Cowork) → `docs/reviews/results/final-A-citizen.md`
1. **Credential (flagship):** owner@ → a pet → the credential **mounts**, the **flip** works both ways, the **QR** shows; scan/open the QR → public `/p/<code>` resolves with contact. Repeat on 2 pets + a reload. (If the flip stalls only under your extension, `[TOOLING-ARTIFACT]`.)
2. **C1 — PPP seal:** find a pet whose breed is a PPP breed (e.g. a Boxer) with the breed VISIBLE. The credential compliance seal must NOT say "completá la raza" when the breed is shown — it should name only what's truly missing (e.g. the weight). CONFIRMED-FIXED?
3. **C2 — share sheet:** open Compartir on a pet. The libreta-link duration and the Tier-2 duration must be **unambiguous** — Tier-2 behind a disclosure, each duration clearly bound to its share type. No confusion about which duration applies.
4. **/inicio consistency:** owner@ /inicio — the per-pet health status must MATCH the pet's profile (no "SIN PENDIENTES" on home vs "0 DE 4 AL DÍA" on the profile).
5. **Signup no-enumeration:** try to sign up with `owner@dim.test` (an existing email). The response must NOT reveal the account exists (generic message, not "ya existe una cuenta").
6. **Erasure boundary (STOP at confirm):** owner@ → account → "eliminar cuenta" → reach the confirmation screen. Do NOT confirm. Note whether the copy is clear about what gets erased.

### A-operator (Cursor) → `docs/reviews/results/final-A-operator.md`
1. **A3 — Atender alert:** alejo@ → /org/`DIM-UBHY-TCH5`/atender. Enter a bad code → error shows. Now EDIT the code → the old error must CLEAR as you type. CONFIRMED-FIXED?
2. **A4 — access explained:** log in as `owner@` (a personal account) and open `/gob` directly. You must land on `/acceso-denegado` with a clear "no tenés acceso al portal de gobierno" message + a link home — NOT a silent bounce.
3. **Bulk-approve confirm:** orgadmin@ → /org/…/adopciones. Select ≥1 postulación → the bulk bar. Click **"Aprobar seleccionadas"** → it must open a **confirmation dialog** (parity with "Rechazar"), not fire immediately. Cancel it. Then confirm "Rechazar" still asks for a motivo.
4. **A2 — count honesty:** govt@ /gob Panel — the "Cola de aprobaciones" count must match `/gob/cola` in the same jurisdiction scope (empty scope → 0, not a stale number; a deep queue → "200+").
5. **Clinic nav:** alejo@ (clinic org) — the nav must NOT show shelter-only modules (Tránsitos / Voluntarios / Adopciones-operaciones / Check-ins).
6. **Atender sign:** alejo@ atender → code DIM-DEMO-0001 → sign a vaccine. It should succeed + be attributed. (This mutates — it's OK, it's the flow.)

---

## TRACK B — the 4 seams (1 agent, solo, after Track A) → `docs/reviews/results/final-seams.md`
"The system is ONE." Costuras stalled last night — re-run it. Drive both sides; for each seam do the citizen half then confirm the operator half + the aggregate moved; screenshot both ends.
- (a) owner@ marks a pet **lost** → appears in `/gob/perdidas` + public `/perdidas` → marks **found** → the case closes.
- (b) alejo@ signs a vaccine via **Atender** (DIM-DEMO-0001) → owner@'s libreta flips it **declarada→verificada (MP)** → govt rabies-coverage KPI moves.
- (c) anon **denuncia** (5-step wizard, save the DEN- code) → admin@ moderation → govt welfare case; follow the code across portals.
- (d) orgadmin@ publishes an **adoption** → owner2@ applies → orgadmin@ **finalizes** (now behind the new confirm) → owner2@ becomes owner + custody closes.
Verify the same code/entity (CAS-/DIM-/DEN-) is consistent across portals.

---

## TRACK C — cold real-user first-impression (1 agent, solo) → `docs/reviews/results/final-firstimpression.md`
Simulate the ACTUAL demo: a person who has never seen DIM/MiMAR analyzes it cold. Start logged-OUT on `/`. Judge as a skeptical outsider (a municipality official or a citizen):
- Does the landing explain WHAT this is + WHY to trust it, in 10 seconds?
- Sign up as a brand-new real citizen + register your first pet — is the path obvious? where do you get stuck?
- The credential: does it FEEL like a real, trustworthy national document? (This is the product's core promise.)
- As govt@: does Panorama (the map) make the value obvious to an official? Could you make a decision from it?
- Overall: 3 things that build trust, 3 that erode it, and the single biggest "I don't get it" moment.
This report is about PERCEPTION + trust, not bugs — it's the closest proxy to tomorrow's real user.

---

## Run order + parallelism
1. **Rebuild first** (or confirm build ≥ HEAD).
2. **Track A pair in parallel** (Cowork citizen + Cursor operator) — different accounts, low collision.
3. **Track B seams SOLO** (mutation-heavy) — after Track A.
4. **Track C** can run anytime on the populated instance (mostly read + one signup); solo-ish.
5. Never 4 browser agents on one :3000.
6. When all land, Claude synthesizes into `docs/reviews/results/final-acceptance-synthesis.md` and remediates PRODUCT-BUGs (discounting artifacts).
