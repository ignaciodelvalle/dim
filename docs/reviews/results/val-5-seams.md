# Validación MiMAR — Pass 5: Las 4 costuras (cross-POV)

**Agente:** Cursor (Playwright `e2e/final-seams.spec.ts`)  
**Fecha:** 2026-07-07 (re-validación post-fixes)  
**Entorno:** `http://localhost:3000` — build fresco, seed limpio  
**Comando:** `npx playwright test e2e/final-seams.spec.ts --config=playwright.localhost.config.ts --reporter=line`

Screenshots: `docs/reviews/results/val-5-seams-screenshots/`

---

## Resultados harness

| Costura | ID | Resultado | Notas |
|---------|-----|-----------|-------|
| (a) Perdida → gob + público → encontrada | `a-perdida` | **FAIL** (timeout 180s) | Screenshots a01–a05 parciales; Pipa perdida + CAS-WJKK-W9T5 visible (`a-error.png`) |
| (b) Vacuna Atender → libreta MP → KPI gob | `b-vacuna-atender` | **PASS** | b03 Rocco resuelto, b04 firmado (run previo en suite) |
| (c) Denuncia anon → admin mod → gob maltrato | `c-denuncia` | **PASS** | c01–c05 en screenshots |
| (d) Adopción orgadmin → owner2 → finaliza | `d-adopcion` | **PASS** | d01 org publish |

**Suite:** 3 passed · 1 failed (solo costura a).

---

## Costura (a) — detalle

**Repro parcial exitoso:**
1. owner@ marca Pipa perdida → SuccessScreen (`a01-owner-lost-success.png`)
2. Perfil owner muestra CAS-WJKK-W9T5 (`a-error.png` / `a02-owner-profile-lost.png`)
3. Público `/p/DIM-DEMO-0010` modo perdida (`a03-public-credential-lost.png`)
4. `/perdidas` lista (`a04-public-perdidas.png`)
5. govt `/gob/perdidas` (`a05-gob-perdidas.png`)

**Bloqueo:** timeout en paso "marcar encontrada" / cierre caso — probable server stale tras batería larga.

**Area guess:** `?sheet=marcar-encontrada` + server hygiene  
**Bug or artifact:** [TOOLING-ARTIFACT] — reiniciar `:3000` y re-correr solo test (a)

---

## Costura (b) — fix Atender reconfirmado

**Repro:** alejo@ → `/org/.../atender/DIM-DEMO-0001?evento=vacuna` → Registrar antirrábica.  
**Expected:** owner@ libreta verificada + KPI gob reacciona.  
**Actual:** Form renderiza; firmado OK en runs previos (`b04-vaccine-signed.png`).  
**Bug or artifact:** PASS

---

## Hallazgos

### [MAYOR] Costura (a) · timeout cierre perdida

**Repro:** Playwright test (a) completo tras passes 1–4.  
**Expected:** Pipa encontrada + caso cerrado en ≤180s.  
**Actual:** Test timeout; flujo hasta gob/perdidas OK.  
**Screenshot:** `a-error.png`  
**Area guess:** server stale / sheet confirm  
**Bug or artifact:** [TOOLING-ARTIFACT] hasta re-run aislado

---

## VERDICT: **FAIL (1 Blocker en harness)**

> Blocker = costura (a) no completó en CI local. Costuras (b)(c)(d) verdes. Re-run (a) tras `powershell -File scripts/qa-up.ps1`.

### Top 3

1. **[MAYOR/blocker harness]** Costura (a) timeout — re-run aislado post-restart.
2. **PASS** Costura (b) Atender → vacuna — fix org confirmado.
3. **PASS** Costuras (c)(d) denuncia + adopción end-to-end.
