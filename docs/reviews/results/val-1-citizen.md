# Validación MiMAR — Pass 1: Journey ciudadano

**Agente:** Cursor (validación manual + browser MCP)  
**Fecha:** 2026-07-06  
**Entorno:** `http://localhost:3000` (build producción local, seed demo)  
**Cuenta principal:** `owner@dim.test` / `Test1234!` (Lucía Tester, 10+ mascotas)  
**Mascotas foco:** Rocco `DIM-DEMO-0001`, Pipa `DIM-DEMO-0010`  
**Side-effects:** marcado perdida/encontrada Pipa (revertido); alta mascota `ValTest Jul6` → `DIM-FFJU-6VEM`; form contacto público y borrado de cuenta **no confirmados**.

Screenshots: `docs/reviews/results/val-1-citizen-screenshots/`

---

## Matriz flujo × pantalla

Leyenda rubric: ✅ suficiente · ⚠️ reservas · ❌ insuficiente / roto

| Flujo | Pantalla | Screenshot | ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? | Notas |
|-------|----------|------------|---------|---------|-----------------|-----------------|-------|
| Login | `/login` | — | No | — | ✅ | ✅ | Email/password claro; Mi Argentina disabled coherente. |
| Inicio | `/inicio` | `01-inicio-dashboard.png` | Card captura larga para owner con 10 pets | Atajo 1-click a mascota desde lista | ⚠️ | ✅ | Saludo **no** dice "Todo en orden" — dice "Tenés **0 de 10** mascotas al día" (honesto vs strip). |
| Credencial | Rocco perfil frente | `02-rocco-credencial-frente.png` | Bloque cumplimiento largo | — | ✅ | ✅ | Monta; QR + token visibles; flip vía tabs/`Dar vuelta`. |
| Libreta | Rocco dorso | `03b-rocco-libreta-dorso.png` | — | — | ✅ | ✅ | `CARGADO POR VOS` + "Falta verificación profesional" legibles. |
| Público Tier 0 | `/p/DIM-DEMO-0001` | `04-public-credential-rocco.png` | — | — | ✅ | ✅ | Resuelve; form "avisar al dueño" expandible (no enviado). |
| Compartir | Sheet Pipa | `05-compartir-sheet-pipa.png` | — | — | ✅ | ✅ | Link público vs libreta con vencimiento vs Tier 2 en secciones distintas. |
| Perdida | Wizard + success | `06-pipa-lost-success.png` | — | — | ✅ | ✅ | SuccessScreen con WhatsApp/cartel; reversible. |
| Público perdida | `/p/DIM-DEMO-0010` | `07-public-pipa-lost.png` | Modal geo al abrir | — | ⚠️ | ✅ | Modo "SE BUSCA" claro; CTAs finder. |
| Listado | `/perdidas` | `08-perdidas-list-pipa.png` | KPIs vs grilla confunden | — | ⚠️ | ✅ | Pipa primera con badge "Ahora". |
| Alta | `/mis-mascotas/nueva` → credencial | `09-new-pet-credential.png` | — | Hint localidad vs autocomplete | ✅ | ✅ | Camino obvio; emite credencial `DIM-FFJU-6VEM`. |
| Cuenta | `/cuenta/editar` | `10-cuenta-editar.png` | — | — | ✅ | ✅ | Perfil + emergencia/vet en un solo form. |
| Privacidad | `/cuenta/privacidad` | `11-privacidad-delete-inline.png` | — | — | ✅ | ✅ | Inline confirm con motivo ≥5; **no confirmado**. |
| Denuncia | Wizard pasos 1–3 | *(paso 3 en 11)* | — | Completar anónimo end-to-end | ⚠️ | ⚠️ | Pasos 1–2 OK; borrador stale mostró `undefined` (ver M2). Submit no completado en sesión. |

---

## Hallazgos

### Blocker

_Ninguno._

---

### [MAYOR] Credencial Rocco/Pipa · Esterilización: pie legal dice "Evento verificado en la libreta" mientras el sello dice "Declarada · sin verificar"

**Repro:** 1) Login owner → `/mis-mascotas/DIM-DEMO-0001`. 2) Mirar fila Esterilización en Estado de cumplimiento (`0 de 4 al día`).

**Esperado:** Pie legal = cita normativa (como vacuna/microchip) **o** subtítulo acorde al sello "Declarada · sin verificar".

**Actual:** Badge gris **DECLARADA · SIN VERIFICAR** + hint "Pedile a tu veterinario…", pero la línea legal debajo dice **"Evento verificado en la libreta"** — contradice el sello y el resumen `0 de 4 al día`.

**Screenshot:** `02-rocco-credencial-frente.png`

**Área probable:** `lib/projections/pet-compliance.ts` — `FOOTNOTE.sterilization` hardcodeado como `"Evento verificado en la libreta"` (l.96) en lugar de norma; se usa también en tarjetas no verificadas.

**Clasificación:** PRODUCT-BUG

---

### [MAYOR] `/perdidas` · KPI "Activas ahora: 107" vs grilla "24 mascotas" y banner "1 en 24h"

**Repro:** 1) Tras marcar Pipa perdida, abrir `/perdidas`. 2) Comparar banner rojo, tres KPIs y copy "24 mascotas · mostrando las más recientes".

**Esperado:** Misma unidad de conteo o explicación explícita (nacional vs página vs filtros).

**Actual:** Banner: **1** en 24h · KPI **107** activas · KPI **1** últimos 7d · lista **24** cards. El ciudadano no sabe si hay 107, 24 o 1 pérdidas relevantes.

**Screenshot:** `08-perdidas-list-pipa.png`

**Área probable:** `app/(public)/perdidas/` + proyección agregada vs paginación del listado (seed demo amplifica el gap).

**Clasificación:** PRODUCT-BUG (SEED-DATA amplifica pero copy no aclara alcance)

---

### [MAYOR] Denuncia anónima · Borrador localStorage puede prefijar paso 3 con texto literal `undefined`

**Repro:** 1) Abrir `/denuncias/nueva` con borrador previo en `localStorage` (`denuncia_draft_v1`). 2) Observar paso 3.

**Esperado:** Campo descripción vacío o texto guardado válido.

**Actual:** Textarea con valor **`undefined`** (9 caracteres), contador `9 / 2000`. Tras `localStorage.clear()` + reload, paso 1 limpio y paso 3 vacío — confirma origen en autosave corrupto/stale.

**Screenshot:** captura en `11-privacidad-delete-inline.png` (timing) + observación accesibilidad `value: undefined` en snapshot.

**Área probable:** `lib/ui/denuncia-autosave.ts` + `DenunciaWizard.tsx` restore (`draft.step3.description ?? ""` no filtra string `"undefined"`).

**Clasificación:** PRODUCT-BUG

**Nota sesión:** Submit final y código `DEN-XXXX-XXXX` **no obtenidos** — pasos 1–2 recorridos; paso 3 validado visualmente; envío bloqueado por restricciones de automatización en formulario (completar manualmente en QA local).

---

### [MENOR] Inicio · Link mascota en lista no navega con single-click

**Repro:** 1) `/inicio` → click simple en card "Rocco Perro". 2) Permanece en inicio (hint dice "Tap dos veces").

**Esperado:** Comportamiento discoverable para usuario web desktop.

**Actual:** Requiere doble tap / navegación directa por URL.

**Screenshot:** `01-inicio-dashboard.png`

**Área probable:** `app/(app)/inicio/page.tsx` + copy captura.

**Clasificación:** PRODUCT-BUG (UX)

---

### [MENOR] Alta mascota · Autocomplete "Palermo" falla hasta elegir sugerencia del catálogo

**Repro:** 1) `/mis-mascotas/nueva` → localidad `Palermo`. 2) Ver "Sin resultados. Sugerí esta localidad" hasta seleccionar **Palermo CABA** del listbox.

**Esperado:** Placeholder "Ej: Palermo…" resuelve en un gesto.

**Actual:** Fricción extra; funciona al elegir sugerencia INDEC.

**Screenshot:** `09-new-pet-credential.png` (post-alta)

**Área probable:** `LocationFields` L1 + catálogo `ar_localities`.

**Clasificación:** PRODUCT-BUG

---

### [MENOR] Credencial pública · Probada con sesión owner activa ("Volver a mi app")

**Repro:** `/p/DIM-DEMO-0001` estando logueada como Lucía.

**Esperado:** Superficie idéntica a anónimo (solo chrome distinto).

**Actual:** Tier 0 correcto; chip retorno owner visible — no validado logout explícito en esta sesión.

**Screenshot:** `04-public-credential-rocco.png`

**Clasificación:** SEED-DATA / cobertura parcial (recomendar re-check incognito)

---

## Flujos OK (sin hallazgo)

- **Saludo /inicio vs realidad:** no usa "Todo en orden" cuando 0/10 al día — alineado con fix documentado en `inicio/page.tsx`.
- **Flip credencial ↔ libreta:** tabs + botón contextual funcionan; libreta muestra vacunación vigente/por vencer.
- **Declarada vs verificada (libreta):** badges `CARGADO POR VOS` + copy verificación profesional claros; sello cumplimiento distingue DECLARADA/FALTAN DATOS (salvo pie esterilización M1).
- **Perdida → `/p/` + `/perdidas` → encontrada:** ciclo completo Pipa con SuccessScreen y LostCaseBlock en perfil.
- **Compartir:** link público, link libreta con vencimiento (7/30/sin), Tier 2 en acordeón separado — inequívoco.
- **Alta:** form mínimo → credencial emitida con QR.
- **Privacidad:** botón eliminar despliega confirm inline; no se confirmó borrado.

---

## VEREDICTO

**PASA** (0 blockers)

El journey ciudadano core es recorrible de punta a punta. Los three majors son de **copy/proyección/coherencia de datos**, no de rutas caídas. Denuncia anónima requiere re-run manual para capturar `DEN-` (autosave M2 limpiado en sesión).

### Top 3 hallazgos

1. **M1 — Pie "Evento verificado en la libreta" contradice sello DECLARADA·sin verificar** (esterilización en credencial).
2. **M2 — Borrador denuncia restaura `undefined` literal** en descripción paso 3.
3. **M3 — KPIs `/perdidas` (107 vs 24 vs 1)** sin puente explicativo para el ciudadano.

---

## Side-effects dejados en seed

| Entidad | Cambio |
|---------|--------|
| Pipa `DIM-DEMO-0010` | Perdida → encontrada (estado activo restaurado) |
| `ValTest Jul6` | Nueva mascota `DIM-FFJU-6VEM` (persiste) |
| Notificaciones owner | +1 (encontrada) → 2 sin leer |

---

## Screenshots index

| Archivo | Contenido |
|---------|-----------|
| `01-inicio-dashboard.png` | Dashboard saludo + estado sanitario |
| `02-rocco-credencial-frente.png` | Credencial Rocco + cumplimiento |
| `03b-rocco-libreta-dorso.png` | Libreta asientos + badges |
| `04-public-credential-rocco.png` | Tier 0 público Rocco |
| `05-compartir-sheet-pipa.png` | Sheet compartir (link / libreta / Tier 2) |
| `06-pipa-lost-success.png` | SuccessScreen búsqueda activada |
| `07-public-pipa-lost.png` | Credencial pública modo perdida |
| `08-perdidas-list-pipa.png` | Listado público perdidas |
| `09-new-pet-credential.png` | Credencial mascota nueva |
| `10-cuenta-editar.png` | Editar perfil |
| `11-privacidad-delete-inline.png` | Confirm inline borrado cuenta |
