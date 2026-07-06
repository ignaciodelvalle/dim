# TRACK A — final acceptance (Cursor operator)

**Fecha:** 2026-07-06  
**Servidor:** `http://localhost:3000` (build)  
**Contraseña:** `Test1234!` en todas las cuentas  
**Nota seed:** el handoff cita clínica `DIM-UBHY-TCH5`; en el seed vivo de esta sesión la Clínica Recoleta de alejo@ resolvió a **`DIM-7QK3-FB8W`**. `DIM-UBHY-TCH5` → 404.

---

## Resumen por ítem

| # | Ítem | Veredicto | Evidencia |
|---|------|-----------|-----------|
| 1 | **A3 Atender** — error al código malo, se limpia al editar | **CONFIRMED-FIXED** | Browser: `ABC` → alert *"El formato del código es DIM-XXXX-XXXX."* · Vitest `CodeEntryForm.interaction.test.tsx` (2/2) cubre clear-on-edit con `fireEvent.change` |
| 2 | **A4 acceso** — owner@ → `/gob` → `/acceso-denegado` | **CONFIRMED-FIXED** | Playwright `e2e/auth-bypass` (owner /gob) · HTTP 307 → `/acceso-denegado?portal=gob` · Browser: heading + link *Volver al inicio* |
| 3 | **Bulk-aprobar** — diálogo de confirmación (paridad Rechazar) | **CONFIRMED-FIXED** *(código)* / **UI no ejecutada** | `AdoptionQueueList` `requireConfirm: true` · Vitest `OpBulkBar.test.tsx` · Cola orgadmin sin filas pendientes en seed → no hubo checkbox para disparar barra |
| 4 | **A2 contador** — Panel vs `/gob/cola` mismo scope | **CONFIRMED-FIXED** | SSR govt@: panel *"No hay solicitudes pendientes"* y cola vacía (match) · Vitest `approval-scope-visibility.test.ts` |
| 5 | **Nav clínica** — sin módulos refugio | **CONFIRMED-FIXED** | Playwright + browser alejo@ `DIM-7QK3-FB8W`: nav sin Tránsitos / Voluntarios / Operaciones / Check-ins |
| 6 | **Atender firma** — DIM-DEMO-0001 → vacuna | **STILL-BROKEN** | `/org/…/atender/DIM-DEMO-0001` → *No encontrada* / *"El formato del código es DIM-XXXX-XXXX."* — `ATENDER_TOKEN_PATTERN` solo acepta `DIM-XXXX-XXXX`; seed usa `DIM-DEMO-0001` como `public_token` |

---

## Hallazgos detallados

### (1) A3 Atender — CONFIRMED-FIXED

**Pantalla:** `/org/DIM-7QK3-FB8W/atender` · alejo@

**Repro:** Ingresar `ABC` → Buscar mascota.

**Esperado:** Error visible; al editar el código el error desaparece.

**Actual:** Error *"El formato del código es DIM-XXXX-XXXX."* visible tras submit. Clear-on-edit verificado en `CodeEntryForm.interaction.test.tsx` (RTL). La automatización del browser no pudo disparar el `onChange` de React al tipear (CDP/`press_key` no limpió el alert en vivo) — **[TOOLING-ARTIFACT]**, no regresión de producto; el test de interacción es la evidencia autoritativa.

**Área:** `app/org/[orgToken]/atender/CodeEntryForm.tsx`

**Clasificación:** PRODUCT-BUG fix confirmado

---

### (2) A4 acceso — CONFIRMED-FIXED

**Pantalla:** owner@ → `/gob`

**Repro:** 1. Login owner@ 2. Navegar a `/gob`

**Esperado:** `/acceso-denegado?portal=gob` con mensaje claro + link home; no rebote silencioso a `/mis-mascotas`.

**Actual:** Redirect 307 a `/acceso-denegado?portal=gob`. Título *"No tenés acceso al portal de gobierno"* + link *Volver al inicio*.

**Área:** `lib/infra/auth-guards.ts` → `requireAdminOrGovtOrRedirect`

**Clasificación:** PRODUCT-BUG fix confirmado

---

### (3) Bulk-aprobar — CONFIRMED-FIXED (código) / UI omitida por seed

**Pantalla:** orgadmin@ → `/org/DIM-Z3CX-DP7A/adopciones`

**Repro:** Seleccionar ≥1 fila → *Aprobar seleccionadas* → debe abrir confirm; cancelar.

**Esperado:** Diálogo antes de ejecutar (paridad con Rechazar).

**Actual:** Código tiene `requireConfirm: true` + test OpBulkBar. **No se pudo reproducir en UI:** la cola de adopciones del refugio seed no tiene postulaciones pendientes (`pendingHints: 0`). Sin filas → no aparece `OpBulkBar`.

**Área:** `components/AdoptionQueueList.tsx`, `OpBulkBar.tsx`

**Clasificación:** PRODUCT-BUG fix confirmado a nivel código; **SEED-DATA** impide click-through

---

### (4) A2 contador — CONFIRMED-FIXED

**Pantalla:** govt@ Panel + `/gob/cola`

**Repro:** Comparar conteo *Cola de aprobaciones* en `/gob` vs filas en `/gob/cola`.

**Esperado:** Mismo scope (vacío → 0, no stale 20).

**Actual:** Ambas superficies muestran cola vacía / *No hay solicitudes pendientes*. Match ✓

**Área:** `app/gob/page.tsx` + `lib/infra/approval-scope.ts`

**Clasificación:** PRODUCT-BUG fix confirmado

---

### (5) Nav clínica — CONFIRMED-FIXED

**Pantalla:** alejo@ → Clínica Veterinaria Recoleta (`DIM-7QK3-FB8W`)

**Repro:** Inspeccionar rail de navegación.

**Esperado:** Sin Tránsitos, Voluntarios, Adopciones-operaciones, Check-ins.

**Actual:** Nav muestra Operación (Panel, Agenda, Ingresos, Censo), Animales, Casos, Administración — sin módulos shelter-only.

**Área:** `components/layout/nav-presets.ts` (`orgType === "clinic"` filtra `shelterOnly`)

**Clasificación:** PRODUCT-BUG fix confirmado

---

### (6) Atender firma DIM-DEMO-0001 — STILL-BROKEN

**Pantalla:** alejo@ → `/org/DIM-7QK3-FB8W/atender` → código `DIM-DEMO-0001`

**Repro:** 1. Ir a Atender 2. Buscar `DIM-DEMO-0001` (o deep-link `/atender/DIM-DEMO-0001`) 3. Firmar vacuna

**Esperado:** Resuelve mascota (Rocco) → form vacuna → éxito + atribución MP.

**Actual:** Rechazo inmediato: *"El formato del código es DIM-XXXX-XXXX."* / breadcrumb *No encontrada*. `ATENDER_TOKEN_PATTERN = /^DIM-[A-Z0-9]{4}-[A-Z0-9]{4}$/i` no admite tokens demo `DIM-DEMO-*` aunque el seed los usa como `pets.public_token`.

**Área:** `app/org/[orgToken]/atender/atender-access.ts` + seed `scripts/seed-demo-scenario.ts`

**Clasificación:** **SEED-DATA** (token demo) vs **PRODUCT-BUG** (Atender debería aceptar demo tokens en entorno demo, o el battery debe usar el `DIM-…` real de Rocco)

---

## VEREDICTO

**NO PASA** — **1 blocker** (ítem 6).

### Top 3 hallazgos

1. **[Blocker] Atender firma con `DIM-DEMO-0001` imposible** — gate de formato `DIM-XXXX-XXXX` rechaza el token demo del seed; flujo de aceptación no completable. (`SEED-DATA` / posible `PRODUCT-BUG`)

2. **[Mayor] Bulk-aprobar sin click-through** — fix de `requireConfirm` verificado en código/tests; seed sin postulaciones pendientes impide validación visual del diálogo. (`SEED-DATA`)

3. **[Menor] Drift handoff vs seed vivo** — tokens de org (`DIM-UBHY-TCH5` documentado vs `DIM-7QK3-FB8W` real); actualizar runbook de batería. (`SEED-DATA`)

---

## Evidencia automatizada ejecutada

```
pnpm vitest run CodeEntryForm.interaction.test.tsx auth-guards.test.ts OpBulkBar.test.tsx approval-scope-visibility.test.ts
→ 4 files, 37 tests passed

pnpm exec playwright test e2e/auth-bypass.spec.ts
→ 2 passed (owner /admin + /gob redirect away)
```
