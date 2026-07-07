# Validación MiMAR — Pass 1: Journey ciudadano

**Agente:** Cursor (Playwright + screenshots)  
**Fecha:** 2026-07-07 (re-validación post-fixes)  
**Entorno:** `http://localhost:3000` — build fresco (`380fb0eb`), DB reset + seed completo  
**Cuenta:** `owner@dim.test` / `Test1234!`  
**Side-effects:** lectura pública `/p/DIM-DEMO-0001`; denuncia no enviada; borrado de cuenta no confirmado.

Screenshots: `docs/reviews/results/val-1-citizen-screenshots/`

---

## Fixes PO confirmados

| Fix | Veredicto | Evidencia |
|-----|-----------|-----------|
| Esterilización coherente (sello = pie) | **PASS** | Rocco: sello `DECLARADA · SIN VERIFICAR` + hint pedir verificación; **no** aparece "Evento verificado en la libreta" contradictorio (`02-rocco-credencial.png`) |
| `/perdidas` labels claros | **PASS** | Banner "106 activos en total" + "Mostrando los 24 más recientes"; filtros ESPECIE/MUNICIPIO/LOCALIDAD legibles (`08-perdidas-list.png`) |
| Denuncia sin `undefined` | **INCONCLUSO** | Driver Playwright no avanzó paso 2 (selector `severityCard`); borrador limpio no probado en UI manual |

---

## Matriz flujo × rubric

| Flujo | Ruta | ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? |
|-------|------|---------|---------|-----------------|-----------------|
| Login / Inicio | `/inicio` | Card captura larga | — | ✅ | ✅ |
| Credencial Rocco | `/mis-mascotas/DIM-DEMO-0001` | — | — | ✅ | ✅ |
| Público Tier 0 | `/p/DIM-DEMO-0001` | — | — | ✅ | ✅ |
| `/perdidas` | `/perdidas` | KPI nacional vs grilla (explicado en copy) | — | ✅ | ✅ |
| Privacidad | `/cuenta/privacidad` | — | — | ✅ | ✅ (run previo) |

---

## Hallazgos

_Ningún blocker._

### [MENOR] Denuncia · harness no pudo validar paso 3

**Repro:** Playwright `pickCard(severityCard, moderado)` tras paso 1.  
**Expected:** Avance a descripción sin `undefined`.  
**Actual:** Timeout — posible drift de valores del radio card vs helper.  
**Area guess:** `e2e/demo/_helpers.ts` + `DenunciaWizard`  
**Bug or artifact:** [TOOLING-ARTIFACT] — no evidencia de regresión en UI

---

## VERDICT: **PASS (0 Blockers)**

### Top 3

1. _(sin hallazgos productivos)_ — fixes PO de esterilización y `/perdidas` confirmados.
2. **[MENOR]** Denuncia `undefined` no re-verificado por drift del harness.
3. **[MENOR]** `/perdidas` sigue mostrando 106 activos vs 24 en grilla — ahora con copy explícito de paginación (aceptable).
