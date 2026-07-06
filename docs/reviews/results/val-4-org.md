# Validación MiMAR — Pass 4: Sweep organizaciones (clínica + refugio)

**Agente:** Cursor (validación manual + browser MCP)  
**Fecha:** 2026-07-06  
**Entorno:** `http://localhost:3000` (build producción local tras `pnpm build` + restart `:3000`, seed demo)  
**Cuentas:** `alejo@dim.test` / `orgadmin@dim.test` — contraseña `Test1234!`  
**Side-effects:** ninguna mutación de negocio ejecutada (Atender vacuna no completada por crash; bulk approve/reject no enviados).

Screenshots: `docs/reviews/results/val-4-org-screenshots/`

**Tokens resueltos en runtime (no asumir docs viejos):**

| Org | Token | Cuenta |
|-----|-------|--------|
| Clínica Veterinaria Recoleta | `DIM-ZVD8-FEMN` | alejo@ |
| Refugio Test | `DIM-9M26-5HFN` | orgadmin@ (auto-redirect desde `/org`) |
| Refugio Patitas del Norte | `DIM-K8ZX-KHJV` | alejo@ (picker) |

---

## Matriz pantalla × rubric

Leyenda: ✅ suficiente · ⚠️ reservas · ❌ insuficiente / roto

### Clínica — `alejo@dim.test` → Clínica Veterinaria Recoleta (`DIM-ZVD8-FEMN`)

| Ruta / flujo | Screenshot | ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? | Notas |
|--------------|------------|---------|---------|-----------------|-----------------|-------|
| Nav org (clinic filter) | `01-clinic-atender-empty.png` (rail visible) | — | — | ✅ | ✅ | **Sin** Tránsitos, Voluntarios, Operaciones, Check-ins. Sí: Panel, Agenda, Ingresos, Censo, Mascotas, Transferencias, Casos, Servicios… |
| `/org/…/atender` (vacío) | `01-clinic-atender-empty.png` | — | — | ✅ | ✅ | Copy es-AR; hint claro; CTA "Buscar mascota". |
| Atender · código inválido | `02-clinic-atender-invalid-format.png` | — | — | ✅ | ✅ | Alert: *"El formato del código es DIM-XXXX-XXXX."* |
| Atender · código inexistente | `03-clinic-atender-not-found.png` | — | — | ✅ | ✅ | *"No se encontró ninguna mascota con el código DIM-XXXX-9999."* |
| Atender · mascota fallecida | `04-clinic-atender-deceased.png` | — | — | ✅ | ✅ | `DIM-TOMC-0008` → *"Esta mascota está registrada como fallecida y no acepta nuevos eventos."* |
| Atender · error se limpia al editar | (mismo flujo) | — | — | ✅ | ✅ | Tras cada error, al tipear de nuevo el alert desaparece antes del submit. |
| Atender · resolve `DIM-DEMO-0001` (Rocco) | `05-clinic-atender-rocco-crash.png` | — | superficie firma + vacuna | ❌ | ❌ | Lookup OK → redirect a `/atender/DIM-DEMO-0001` → **crash** digest `2342202159`. |
| Atender · firmar vacuna + atribución | — | — | todo el flujo | ❌ | ❌ | **No alcanzado** — bloqueado por crash anterior. |

### Refugio — `orgadmin@dim.test` → Refugio Test (`DIM-9M26-5HFN`)

| Ruta | Screenshot | ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? | Notas |
|------|------------|---------|---------|-----------------|-----------------|-------|
| Panel | `06-shelter-panel.png` | Onboarding + permisos largos | — | ✅ | ✅ | KPI Ocupación 3, Ingresos semana 3; "Todo en orden". |
| `/mascotas` | `07-shelter-mascotas.png` | Muchos CTAs por card | — | ✅ | ✅ | 3 en custodia; filtros + vista lista/tablero; bulk-select header. |
| `/intake` (Ingresos) | `08-shelter-intake.png` | — | — | ✅ | ✅ | Cola + Registrar; 3 ingresos recientes. |
| `/transitos` | `09-shelter-transitos.png` | — | — | ✅ | ✅ | Empty state honesto + link "Buscar voluntarios". |
| `/adopciones` (Operaciones) | (vacío — sin screenshot dedicado) | — | datos seed | ✅ | ✅ | 0 postulaciones pendientes; copy guía a `/adoptar`. **Bulk bar no visible** (sin filas). |

### Refugio con postulaciones — `alejo@dim.test` → Patitas del Norte (`DIM-K8ZX-KHJV`)

| Ruta | Screenshot | ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? | Notas |
|------|------------|---------|---------|-----------------|-----------------|-------|
| Panel | — | — | screenshot | ✅ | ✅ | KPI **Adopciones en curso: 2** coherente con cola. |
| `/adopciones` pendientes | `10-shelter-adopciones-queue.png` | — | — | ✅ | ✅ | 2 postulaciones (Coco, Negro); checkboxes + "Seleccionar todo (2)". |
| Bulk **Aprobar** → confirm dialog | — | — | **runtime no probado** | — | — | Código tiene `requireConfirm: true` (`AdoptionQueueList.tsx` L232–237); **click en checkbox/bulk bar no completado** (sesión MCP interrumpida). |
| Bulk **Rechazar** → motivo | — | — | **runtime no probado** | — | — | Código: `requireReason: true`, `minReasonLength: 5` (L254–255). |

---

## Chequeos críticos solicitados

| Chequeo | Esperado | Actual | Veredicto |
|---------|----------|--------|-----------|
| Nav clínica **sin** módulos refugio | No Tránsitos / Voluntarios / Operaciones / Check-ins | ✅ Confirmado en rail de `DIM-ZVD8-FEMN` | ✅ |
| Nav refugio **con** módulos refugio | Tránsitos, Voluntarios, Operaciones, Check-ins visibles | ✅ Confirmado en `DIM-9M26-5HFN` y `DIM-K8ZX-KHJV` | ✅ |
| Atender · códigos malos | Gracia + error limpiable | ✅ Tres casos (formato / inexistente / fallecida) + clear on edit | ✅ |
| Atender · Rocco + vacuna + atribución | Resolve → form vacuna → mutación OK | ❌ Crash al renderizar superficie de firma | ❌ **BLOCKER** |
| Adopciones bulk Aprobar | Confirm dialog (paridad Rechazar) | ⚠️ Shipped en código; UI con 2 filas; **dialog no disparado en browser** | ⚠️ **Parcial** |
| Adopciones bulk Rechazar | Motivo obligatorio | ⚠️ Shipped en código; **no probado en browser** | ⚠️ **Parcial** |
| es-AR (sin enums inglés) | UI operador en español | ⚠️ Capability slugs (`pet.read_held`, `adoption.review`…) en panel Permisos; prefijos KPI `"Normal :"` / `"Atención :"` | ⚠️ |

---

## Hallazgos

### Blocker

#### [BLOCKER] Atender · Superficie de firma crashea al resolver mascota viva (`DIM-DEMO-0001`)

**Repro:** 1) `alejo@` → Clínica Recoleta → `/atender`. 2) Buscar `DIM-DEMO-0001` (Rocco). 3) Redirect a `/org/DIM-ZVD8-FEMN/atender/DIM-DEMO-0001`.

**Esperado:** Header "Atendiendo a Rocco", grid de eventos clínicos (Vacuna, …), atribución del firmante, form vacuna funcional.

**Actual:** Error boundary *"Algo salió mal"* — digest **`2342202159`**. Log servidor:

```text
TypeError: k.ATENDER_EVENTOS.map is not a function
  at l (.next/server/app/org/[orgToken]/atender/[publicToken]/page.js:…)
```

**Screenshot:** `05-clinic-atender-rocco-crash.png`

**Área probable:** `app/org/[orgToken]/atender/[publicToken]/page.tsx` importa `ATENDER_EVENTOS` desde `"use client"` module `AtenderCaptureMounter.tsx`; en el bundle server el export no es array iterable. Mover `ATENDER_EVENTOS` a un módulo shared server-safe o duplicar la lista en el server component.

**Clasificación:** PRODUCT-BUG (crash — flujo clínico core)

---

### Mayor

#### [MAYOR] Error boundary org · "Volver al panel del **refugio**" en contexto clínica

**Repro:** Mismo crash Atender en clínica Recoleta.

**Esperado:** Copy genérico ("Volver al panel" / "Volver al inicio de la organización") o label según `org_type`.

**Actual:** CTA **"Volver al panel del refugio"** en `/org/DIM-ZVD8-FEMN/atender/DIM-DEMO-0001`.

**Screenshot:** `05-clinic-atender-rocco-crash.png`

**Área probable:** `app/org/[orgToken]/error.tsx` — `homeLabel` hardcodeado.

**Clasificación:** PRODUCT-BUG (copy / org-type awareness)

---

### Menor

#### [MENOR] es-AR · Slugs de capability en panel Permisos

**Repro:** Panel clínica o refugio → sección "Tus permisos".

**Actual:** Cada fila muestra slug inglés junto al label (`pet.read_held`, `intake.create`, `adoption.review`, `event.write`, …).

**Screenshot:** `06-shelter-panel.png` (scroll permisos)

**Clasificación:** PRODUCT-BUG (i18n residual — operador no técnico)

---

#### [MENOR] Panel clínica · Pendiente "Propuestas de tránsito" en org tipo clinic

**Repro:** `alejo@` → Clínica Recoleta → Panel.

**Actual:** Sección Pendientes incluye link **"Propuestas de tránsito"** (0) pese a que el nav lateral ya oculta Tránsitos/Voluntarios.

**Clasificación:** UX consistency (nav filtrado vs panel tiles)

---

#### [MENOR] KPI tiles refugio · Prefijos `"Normal :"` / `"Atención :"` en copy operador

**Repro:** Patitas del Norte panel / adopciones KPI strip.

**Actual:** Badges tipo `"Normal : Disponibles"`, `"Atención : Adopciones en curso"` — parece filtrar severidad interna, no copy usuario.

**Clasificación:** UX copy

---

#### [MENOR] Adopciones queue · "Postulante" genérico sin nombre

**Repro:** `/org/DIM-K8ZX-KHJV/adopciones`.

**Actual:** Filas **"Postulante → Coco"** / **"Postulante → Negro"** — no muestra display name del aplicante (puede ser privacidad intencional; operador pierde disambiguación).

**Screenshot:** `10-shelter-adopciones-queue.png`

**Clasificación:** UX (verificar spec privacidad vs usabilidad)

---

## Flujos OK (sin hallazgo)

- **Nav clinic vs shelter:** `buildOrgNav` filtra `shelterOnly` correctamente — clínica sin Tránsitos/Voluntarios/Operaciones/Check-ins; refugio los muestra.
- **Atender code entry:** validación formato, 404 graceful, rechazo fallecidos, dismiss error on edit — todos OK.
- **Refugio Test sweep:** panel, mascotas (3), intake (3), tránsitos (empty), adopciones (empty) — render estable, copy es-AR.
- **Patitas adopciones list:** 2 pendientes alinean con KPI "Adopciones en curso: 2"; tabs Pendientes/Aprobadas/Rechazadas; selección múltiple UI presente.
- **No crashes** en rutas refugio visitadas (solo Atender signing surface en clínica).

---

## Adopciones bulk — evidencia de código (runtime incompleto)

`components/AdoptionQueueList.tsx` define paridad solicitada:

| Acción | Confirm | Motivo |
|--------|---------|--------|
| Aprobar seleccionadas | `requireConfirm: true`, título *"Aprobar postulaciones seleccionadas"* | — |
| Rechazar seleccionadas | `requireReason: true` | `minReasonLength: 5` |

**Runtime:** no se llegó a seleccionar fila ni abrir `OpBulkBar` en browser (interrupción MCP). Re-verificar manualmente en Patitas con ≥1 checkbox marcado.

---

## VEREDICTO

**NO PASA** (1 blocker · 1 mayor · 4 menores)

El portal refugio es navegable y coherente; el filtro nav clínica/refugio funciona; Atender en la entrada de código es robusto. El **flujo clínico central** (resolver Rocco → firmar vacuna → atribución) está **roto** por crash server en la superficie de firma. Bulk approve/reject está implementado en código pero **no verificado en runtime** en esta sesión.

### Top 3 hallazgos

1. **B1 — Atender signing surface crash** (`ATENDER_EVENTOS.map is not a function`, digest `2342202159`) — bloquea vacuna + atribución.
2. **M1 — Error boundary "Volver al panel del refugio"** en org clínica.
3. **m1 — Capability slugs inglés** en "Tus permisos" (ambos tipos de org).

---

## Side-effects dejados en seed

Ninguno — no se ejecutaron mutaciones (vacuna, bulk approve/reject, intake nuevo).

---

## Screenshots index

| Archivo | Contenido |
|---------|-----------|
| `01-clinic-atender-empty.png` | Clínica · Atender vacío + nav sin módulos refugio |
| `02-clinic-atender-invalid-format.png` | Atender · error formato |
| `03-clinic-atender-not-found.png` | Atender · código inexistente |
| `04-clinic-atender-deceased.png` | Atender · mascota fallecida |
| `05-clinic-atender-rocco-crash.png` | Atender · crash al resolver Rocco |
| `06-shelter-panel.png` | Refugio Test · panel |
| `07-shelter-mascotas.png` | Refugio Test · mascotas en custodia |
| `08-shelter-intake.png` | Refugio Test · ingresos |
| `09-shelter-transitos.png` | Refugio Test · tránsitos (vacío) |
| `10-shelter-adopciones-queue.png` | Patitas del Norte · 2 postulaciones pendientes |

---

## Pendiente manual (5 min)

1. Patitas `/adopciones` → marcar 1 checkbox → **Aprobar seleccionadas** → confirmar dialog aparece (no confirmar envío si no querés mutar seed).
2. Misma fila → **Rechazar seleccionadas** → verificar campo motivo ≥5 chars.
3. Tras fix B1: repetir Atender Rocco → Vacuna → confirmar `?firmado=1` y línea de atribución en header.
