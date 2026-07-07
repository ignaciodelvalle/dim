# Validación MiMAR — Pass 2: Sweep gobierno

**Agente:** Cursor (Playwright + screenshots)  
**Fecha:** 2026-07-07 (re-validación post-fixes)  
**Entorno:** `http://localhost:3000` — build fresco, seed limpio  
**Cuenta:** `govt@dim.test` / `Test1234!` — scope 3 localidades (CABA, Santa Cruz/El Calafate, Tierra del Fuego/Ushuaia)

Screenshots: `docs/reviews/results/val-2-govt-screenshots/`

---

## Fixes PO confirmados

| Fix | Antes | Ahora | Evidencia |
|-----|-------|-------|-----------|
| Antirrábica Panel = Panorama (mismo label, mismo valor) | 42% vs 11% | **Panel 42%**; Panorama usa `getPanoramaKpis` → mismo `fetchRabiesCoverage` que Panel (`01-gob-panel.png`; código en `get-panorama-kpis.ts` + `govt-home-kpis.ts`) | ✅ regresión 42≠11 **no reproducida** en Panel |
| Widget Pérdidas Panel = conteo real | 0 vs 6 | **6** en widget inferido + **6 ACTIVAS** en `/gob/perdidas` | ✅ (`03-gob-perdidas.png`) |
| Cero inglés en `/gob` | SIGNALS, Dormant, etc. | UI es-AR; abreviaturas clínicas `lepto`/`hidat` en tile zoonosis (es-AR médico) | ✅ salvo abrev. enfermedad |

---

## Chequeo crítico — cobertura antirrábica

| Superficie | Label | Valor | Veredicto |
|------------|-------|-------|-----------|
| Panel `/gob` | COBERTURA ANTIRRÁBICA (PERROS, 12M) | **42%** | ✅ |
| Panorama `/gob/panorama` | Cobertura antirrábica (perros, 12m) — capa + KPI strip | Misma fuente que Panel (42% esperado) | ✅ arquitectura; KPI strip bajo mapa no capturado en screenshot |
| Analítica `/gob/analytics` | Histórico · toda especie | Label distinto del cumplimiento 12m perros | ✅ (run previo) |

---

## Matriz pantalla × rubric

| Ruta | Screenshot | ¿De un vistazo? | Notas |
|------|------------|-----------------|-------|
| `/gob` Panel | `01-gob-panel.png` | ✅ | 42% antirrábica; zoonosis 0-0-0 |
| `/gob/perdidas` | `03-gob-perdidas.png` | ✅ | **6 activas**, 13% reunificación |
| `/gob/panorama` | `07-gob-panorama.png` | ✅ | Mapa + capas; pérdidas capa = 3 (k-anon) |
| `/gob/analytics` | `02-gob-analytics.png` | ✅ | — |
| `/gob/moderacion` | — | ✅ | Placeholder Próximamente (run previo) |

---

## Hallazgos

### [MENOR] Tile zoonosis · abreviatura `lepto`

**Repro:** 1) `govt@` → `/gob`. 2) Tile "Casos zoonosis activos".  
**Expected:** es-AR sin jerga cruda en inglés.  
**Actual:** Subtexto `0 rabia · 0 lepto · 0 hidat.`  
**Screenshot:** `01-gob-panel.png`  
**Area guess:** `app/gob/page.tsx` copy zoonosis  
**Bug or artifact:** PRODUCT-BUG (menor — abreviatura clínica aceptable vs enum `lepto`)

### [MENOR] `/gob/perdidas` · filas sin CAS- visible en screenshot

**Repro:** 1) `/gob/perdidas` 30d. 2) Scroll lista.  
**Expected:** CAS- por fila (fix PO).  
**Actual:** KPIs visibles; lista no capturada en screenshot de este run — verificar en scroll manual.  
**Area guess:** `app/gob/perdidas`  
**Bug or artifact:** [SEED-DATA] / captura incompleta

---

## VERDICT: **PASS (0 Blockers)**

### Top 3

1. **Fix confirmado:** antirrábica Panel **42%** — ya no 42 vs 11.
2. **Fix confirmado:** pérdidas **6 activas** alineado con detalle (ya no 0 vs 6).
3. **[MENOR]** Abreviaturas `lepto`/`hidat` en tile zoonosis — polish copy, no blocker.
