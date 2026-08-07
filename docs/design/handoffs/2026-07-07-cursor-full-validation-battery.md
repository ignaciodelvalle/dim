# Cursor full-validation battery (2026-07-07)

One agent (Cursor), run the passes **in sequence** today. Goal: validate the WHOLE app so Claude only triages findings (fix or backlog). Each pass = one report file + screenshots. Claude synthesizes + remediates.

## Common contract (every pass inherits)
- Server `http://localhost:3000` (built). Accounts, all `Test1234!`: `owner@dim.test` (10 pets, **Rocco = DIM-DEMO-0001**, Pipa = DIM-DEMO-0010), `owner2@`, `govt@` (focal CABA), `admin@`, `orgadmin@`, `alejo@` (vet — **navigate to the clinic via alejo@'s org nav**, don't hardcode the org token; it changes per re-seed).
- **Rubric per screen:** ¿Sobra? ¿Falta? ¿Autocontenido? ¿De un vistazo?
- **Severity:** Blocker (breaks a task/promise) · Mayor (confuses / forces guessing) · Menor (polish).
- **NO irreversible actions** — stop at the confirmation (no real account-delete, hard-delete, payment).
- **🩺 SERVER HYGIENE (important):** if operator routes start throwing "Algo salió mal" / sin-digest after many mutations, the local server got into a stale state — **run `pwsh scripts/qa-up.ps1` (or ask Claude to restart :3000) and continue**. Do NOT report that as a product bug; note "server needed a restart after N mutations" once.
- **Artifact-vs-bug:** if a UI glitch only happens under your extension's viewport/DevTools manipulation but not on a plain reload/fresh tab, label `[TOOLING-ARTIFACT]`. The credential 3D flip is a known one (works clean).
- **Report template (USE EXACTLY):**
```
[SEVERITY] Screen/route · short title
Repro:   1) … 2) … 3) …   (exact clicks, from a known account)
Expected: …
Actual:   … (+ screenshot filename)
Area guess: <route file / component / "seed data" / "not sure">
Bug or artifact: PRODUCT-BUG | [TOOLING-ARTIFACT] | [SEED-DATA]
```
End each pass: **VERDICT (PASS = 0 Blockers) + the 3 highest-value findings ranked.** Save to the named file + a `-screenshots/` dir.

---

## PASS 1 — Citizen full journey → `val-1-citizen.md`
Walk the whole owner/citizen experience end to end, logged in as `owner@` (and logged-out for public):
- **Onboarding:** login; /inicio (does the greeting match reality? — it should only say "Todo en orden" when everything is al día).
- **The credential (flagship):** open Rocco → mounts, flip both ways, QR; open `/p/DIM-DEMO-0001` logged-out → resolves with a contact path; try the finder "avisar al dueño" form (don't submit).
- **Libreta:** the vaccine/health record — does declarada vs verificada read clearly? any contradiction with the credential seal?
- **Alta:** register a NEW pet (real flow) — is the path obvious? does the new pet get a proper credential?
- **Lost/found:** mark a pet lost → the public `/perdidas` + the `/p/` lost view; mark found → reverts. (Reversible — OK to do.)
- **Compartir:** the share sheet — libreta-link duration vs Tier-2 (behind "Mostrar libreta médica") — unambiguous?
- **Cuenta:** editar perfil; privacidad (descargar datos; "Quiero eliminar mi cuenta" → the inline confirm appears → **STOP, don't confirm**).
- **Denuncia:** the anonymous 5-step welfare wizard → save the DEN- code (don't rely on it being processed).

## PASS 2 — Government operator sweep → `val-2-govt.md`
Logged in as `govt@` (focal CABA). Every /gob screen, rubric each:
- **/gob Panel** — the 3-alarm "¿qué explota hoy?" + KPIs; does each number lead to its case/queue?
- **/gob/analytics** — **CRITICAL CHECK: is any metric shown twice with different values?** Especially rabies coverage — the "cumplimiento" number (Panel/Panorama) vs the "histórico · toda especie" tile (analytics) must have DISTINCT labels and NOT both compare to 80%. Flag any same-label-different-number.
- **/gob/perdidas** — the lost-pet list now shows a **CAS- code** per row, linkable → confirm it opens the case in the operator shell.
- **/gob/casos, /gob/maltrato** (severity + MPF export), **/gob/mortalidad, /gob/vigilancia** (outbreak signals), **/gob/reglas** (per-jurisdiction rules), **/gob/cola** (approvals — count matches the list), **/gob/moderacion** (the new "Próximamente" placeholder — is the copy honest + clear?).
- **Panorama** (the map) — layers/legend/interaction; does it make the value obvious to an official?
- **es-AR check:** NO raw English enums anywhere (`dog`, `lepto`, `GOVT`/`ADMIN` in the chrome, `Dormant`, etc.) — this was just swept; confirm it's clean.

## PASS 3 — Admin (platform operator) sweep → `val-3-admin.md`
Logged in as `admin@`. Every /admin screen: moderación (anonymous denuncia queue), observaciones (rabies 10-day, microchip reemplazar), jurisdicciones/reglas (national cascade), organizaciones, admins/govts (create/deactivate — STOP before destructive), auditoría/historial, outbox, casos, cola, censo, inteligencia, programa (PII oversight). Rubric each; es-AR check; flag any KPI that drills to an unfiltered/unreconcilable list (e.g. "Decisiones 7d").

## PASS 4 — Org operator sweep → `val-4-org.md`
Logged in as `orgadmin@` (shelter/rescue) and `alejo@` (clinic — via their org nav):
- **Clinic (alejo@):** the nav must show NO shelter modules (Tránsitos/Voluntarios/Adopciones-op/Check-ins). **Atender:** enter `DIM-DEMO-0001` → resolves Rocco → sign a vaccine (mutates, OK) → confirm attribution. Bad codes (invalid format, nonexistent, deceased) fail gracefully; the error clears on edit.
- **Shelter (orgadmin@):** mascotas, intake, transitos, adopciones. **Bulk "Aprobar"** in adopciones must open a **confirmation dialog** (parity with Rechazar) — needs ≥1 postulación selected.

## PASS 5 — The 4 seams (cross-POV) → `val-5-seams.md`
"The system is ONE." Drive both sides; screenshot both ends; **restart the server first if it's crashy from earlier passes**:
- (a) owner@ marks a pet lost → `/gob/perdidas` (with CAS) + public `/perdidas` → marks found → case closes.
- (b) alejo@ signs a vaccine via Atender (DIM-DEMO-0001) → owner@'s libreta declarada→verificada (MP) → govt rabies KPI moves. *(known-working — reconfirm)*
- (c) anon denuncia (save DEN-) → admin moderation → govt welfare case; follow the code.
- (d) orgadmin@ publishes adoption → owner2@ applies → orgadmin@ finalizes (behind the confirm) → owner2@ becomes owner + custody closes.

## PASS 6 — Adversarial / edge → `val-6-adversarial.md`
Unhappy paths across roles (no irreversible): empty states (0 pets, empty queue), form errors (invalid/missing fields — clear message on the right field?), weird inputs (emoji / very-long / SQL-ish in free-text, malformed DIM/DEN codes, future dates), double-submit, back mid-wizard, deep-URL bad params (`?sheet=x`, `/mis-mascotas/DIM-NOPE`, `/gob/casos/CAS-NOPE`), unauth access to protected routes (clean redirect to /acceso-denegado or /login?).

## PASS 7 — Mobile / responsive → `val-7-mobile.md`
Phone viewport (390×844). Citizen: landing, /perdidas, credential+flip+QR (the flagship on a phone), alta, denuncia wizard, /cuenta. Operator: /gob Panel + Panorama map on a phone, dense tables. No horizontal overflow, tap targets ≥44px, drawer works. (If the extension can't hit 390, note it + test as narrow as it allows.)

## PASS 8 — Cold first-impression → `val-8-firstimpression.md`
Logged-OUT on `/`, as a skeptical outsider (a municipality official / a citizen). Does the landing explain WHAT + WHY-trust in 10s? Sign up as a brand-new citizen + first pet — obvious? The credential — does it FEEL like a trustworthy national document? As govt@, does Panorama make the value obvious? Report PERCEPTION + trust: 3 things that build trust, 3 that erode it, the biggest "no entiendo" moment.

---

## For Claude (after each pass)
Read the pass report → PRODUCT-BUGs get fixed or become tasks (with the post-demo-backlog reasoning); artifacts/seed-data get discounted; findings roll into `docs/reviews/results/val-synthesis.md`. Order of value: seams + canonical-number + credential + Atender > operator polish > mobile > first-impression narrative.
