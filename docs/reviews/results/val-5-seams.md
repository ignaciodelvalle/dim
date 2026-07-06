# Validación MiMAR — Pass 5: Costuras cross-POV

**Agente:** Cursor (Playwright `e2e/final-seams.spec.ts` + capturas suplementarias)  
**Fecha:** 2026-07-06  
**Entorno:** `http://localhost:3000` (build producción local + `next start`)  
**Cuentas:** `owner@`, `owner2@`, `govt@`, `admin@`, `orgadmin@`, `alejo@` — contraseña `Test1234!`  
**Side-effects:** Pipa (`DIM-DEMO-0010`) quedó **perdida** con caso `CAS-WJKK-W9T5` al cierre de la corrida (cierre “encontrada” no completado). Denuncia `DEN-AS5Q-PGQQ` creada y moderada (triage enviado). Vacuna Atender sobre Rocco intentada. Adopción **no** finalizada.

Screenshots: `docs/reviews/results/val-5-seams-screenshots/`  
**Resultados machine:** `val-5-seams-screenshots/results.json`

---

## Veredicto global

| Costura | Entidades | ¿Código cruza portales? | Resultado |
|---|---|---|---|
| **(a) Perdida** | `DIM-DEMO-0010` (Pipa) · `CAS-WJKK-W9T5` | Parcial — owner ↔ `/perdidas` sí; `/p/` throttle; gob lista no capturada; cierre no hecho | **FAIL** |
| **(b) Vacuna Atender** | `DIM-DEMO-0001` (Rocco) · org `DIM-ZVD8-FEMN` | Parcial — deep-link Atender OK en Pass 4; libreta MP y delta KPI no demostrados en capturas | **FAIL** |
| **(c) Denuncia** | `DEN-AS5Q-PGQQ` | Ciudadano + admin sí; gob cola no muestra el código post-triage | **FAIL** |
| **(d) Adopción** | org `DIM-9M26-5HFN` · pet `DIM-YMZK-DDMU` (Rocco refugio) | No — mascota sin elegibilidad; `/adoptar` sin CTA postular | **FAIL** |
| **Batería** | — | — | **NO PASA** |

---

## Consistencia de códigos cross-POV

| Código | Owner / ciudadano | Operador org | Admin | Gob | Público anónimo | ¿Consistente? |
|---|---|---|---|---|---|---|
| **`DIM-DEMO-0010`** | Perfil perdida + credencial impresa ✅ | — | — | KPI panel 7 activas ⚠️ (lista no verificada) | `/perdidas` card “Pipa” ✅ · `/p/` throttle ❌ | **Parcial** |
| **`CAS-WJKK-W9T5`** | `LostCaseBlock` en perfil owner ✅ | — | — | No buscado en detalle | No expuesto en listado público (by design) | **Parcial** — solo punta owner |
| **`DIM-DEMO-0001`** | Libreta antirrábica “declarada sin verificar” en perfil Pipa-adjacent seed | Atender deep-link ✅ (Pass 4) | — | KPI 42% antes/después sin delta | — | **Parcial** — firma MP no verificada |
| **`DEN-AS5Q-PGQQ`** | Comprobante anónimo ✅ | — | Cola + detalle + triage ✅ | **Ausente** en primeras filas `/gob/maltrato` ❌ | Código en comprobante ✅ | **Parcial** — se rompe en gob |
| **`DIM-9M26-5HFN`** | — | Portal refugio ✅ | — | — | — | N/A |
| **`DIM-ZVD8-FEMN`** | — | Clínica Recoleta ✅ | — | — | — | N/A |

---

## (a) Perdida — owner@ → gob + `/perdidas` → owner@ encontrada

**Entidad:** `DIM-DEMO-0010` (**Pipa**) · caso **`CAS-WJKK-W9T5`**

| Punta | Screenshot | ¿Propagó? |
|---|---|---|
| Owner — episodio perdida / CAS | `a-error.png` (perfil cargado) | ✅ Banner rojo “Perdida”, **`CAS-WJKK-W9T5`**, CTAs compartir / marcar encontrada |
| Owner — SuccessScreen (marca previa) | `a01-owner-lost-success.png` | ✅ “Activamos la búsqueda de Pipa” (corrida anterior) |
| Owner — perfil (skeleton) | `a02-owner-profile-lost.png` | ⚠️ Skeleton — CAS no legible en esa captura |
| Público `/p/DIM-DEMO-0010` | `a03-public-credential-lost.png` | ❌ **Throttle** “Demasiadas consultas” (rate limit `/p/*`) |
| Público `/perdidas` | `a04-public-perdidas.png` | ✅ **Pipa** primera card “PERDIDA · HACE 1 DÍA” |
| Gob `/gob/perdidas` | `a05-gob-perdidas.png` | ⚠️ KPIs (7 activas, 18% reunificación) — captura cayó en **login** govt, lista de filas no obtenida |
| Owner marca encontrada | — | ❌ No ejecutado (test abortó en `/p/`) |
| Gob post-encontrada | — | ❌ |

### Rubric

| ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? |
|---|---|---|---|
| CTAs compartir OK en perfil | CAS no en listado gob/perdidas público | ✅ en owner | ✅ banner perdida |

### Hallazgos

- **[MAYOR] Rate limit en credencial pública** — Tras batería automatizada, `/p/{token}` devuelve “Demasiadas consultas”. Metadata OG sí refleja `SE BUSCA: Pipa`, pero el banner `[data-section="lost-urgent-banner"]` no renderiza para el visitante. **Área:** `app/(public)/p/[publicToken]/page.tsx` throttle.
- **[MENOR] Playwright matcheó `<title>` como “visible”** — el assert `.or(getByText(/SE BUSCA/))` resolvió al `<title>` (hidden). Corregir selector a contenido body.
- **Nota:** En corrida previa FOTO (`DIM-FFJU-6VEM`) no aparecía en `/perdidas`; con **Pipa** seed demo el listado funciona cuando existe `status_changed → lost`.

**Veredicto (a): FAIL** — costura ciudadana owner + listado público OK; punta QR throttle + gob detalle + cierre incompletos.

---

## (b) Vacuna vía Atender — alejo@ → owner libreta MP → gob KPI

**Entidades:** `DIM-DEMO-0001` (**Rocco**) · org **`DIM-ZVD8-FEMN`** (Clínica Veterinaria Recoleta)

| Punta | Screenshot | ¿Propagó? |
|---|---|---|
| Gob KPI antes | `b01-gob-panel-before.png` | ✅ Cobertura antirrábica **42%** |
| Atender form vacuna | `b02-atender-vacuna-form.png` | ⚠️ Captura muestra **skeleton Panel** (no formulario vacuna) |
| Resolve Rocco | `b03-atender-rocco-resolved.png` | ⚠️ Ídem skeleton |
| Firma vacuna `?firmado=1` | `b04-vaccine-signed.png` | ⚠️ Ídem skeleton — Playwright reportó URL con `firmado=1` pero UI no evidenciada |
| Owner libreta | `b05-owner-libreta.png` | ❌ Skeleton; texto “verificada/MP” **no** detectado |
| Gob KPI después | `b06-gob-panel-after.png` | ⚠️ Sigue **42%** — sin delta |

### Contexto Pass 4

El crash `ATENDER_EVENTOS.map is not a function` (**BLOCKER Pass 4**) está corregido en tree (`atender-eventos.ts` server-safe). Pass 4 demostró lookup + deep-link; esta corrida no logró capturas limpias post-firma.

### Rubric Atender

| ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? |
|---|---|---|---|
| — | Evidencia visual firma + sello MP | ⚠️ | ⚠️ |

**Veredicto (b): FAIL** — cadena no demostrada en screenshots; KPI plano; libreta sin sello verificado.

---

## (c) Denuncia anónima → admin moderación → gob maltrato

**Entidad:** **`DEN-AS5Q-PGQQ`**

| Punta | Screenshot | ¿Propagó? |
|---|---|---|
| Wizard 5 pasos + comprobante | `c01-denuncia-comprobante.png` | ✅ Código **DEN-AS5Q-PGQQ**, mapa Balvanera, ABIERTA |
| Admin `/admin/moderacion` | `c02-admin-moderacion-queue.png` | ✅ Fila con flag “Descripción muy corta o en mayúsculas” |
| Admin detalle | `c03-admin-moderacion-detail.png` | ✅ Mismo **DEN-AS5Q-PGQQ**, ubicación exacta oficial |
| Admin post-triage | `c04-admin-after-triage.png` | ✅ “Pasar a triage” — botón procesando |
| Gob `/gob/maltrato` | `c05-gob-maltrato.png` | ❌ Primeras filas muestran **DEN-AXV6-P2SF**, **DEN-48JP-85TD** — **no** `DEN-AS5Q-PGQQ` |

### Rubric

| ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? |
|---|---|---|---|
| Copy integración MPF pendiente OK | Denuncia en cola gob tras triage | ✅ comprobante | ✅ |

### Hallazgos

- **[MAYOR] Triage no materializa en cola gob visible** — Tras “Pasar a triage”, el código no aparece en las primeras 113 filas de `/gob/maltrato` (filtro 30d, cola Todas). Posibles causas: scope jurisdicción govt vs fila denuncia, timing async, o paginación. **Requiere búsqueda omnibox / SQL** en follow-up.
- Auto-flag por MAYÚSCULAS funciona como diseño (`triggerModerationFlag` en wizard QA).

**Veredicto (c): FAIL** — 3/4 puntas OK; costura admin→gob no cerrada en UI.

---

## (d) Adopción — orgadmin@ publica → owner2@ postula → finaliza

**Entidades:** org **`DIM-9M26-5HFN`** (Refugio Test) · mascota **`DIM-YMZK-DDMU`** (Rocco en custodia refugio)

| Punta | Screenshot | ¿Propagó? |
|---|---|---|
| Org publicar adopción | `d01-org-publish.png` | ❌ **Bloqueo:** “La mascota no está marcada como apta para adopción” |
| Owner2 postular | `d-error.png` | ❌ `/adoptar/{token}` sin botón Postular |
| Org aprobar / finalizar | — | ❌ No alcanzado |
| Owner2 dueño | — | ❌ |

### Rubric

| ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? |
|---|---|---|---|
| Mensaje bloqueo claro ✅ | Paso elegibilidad en flujo QA | ✅ | ✅ |

**Veredicto (d): FAIL** — precondición seed/QA: marcar **elegibilidad adopción** antes de publicar; elegir mascota ya listada (p. ej. cola Patitas del Norte del Pass 4).

---

## Blockers / fricciones transversales

| ID | Severidad | Descripción |
|---|---|---|
| X-1 | **MAYOR** | Rate limit `/p/*` tras batería — impide validar Tier-1 perdida anónima |
| X-2 | **MAYOR** | Screenshots en skeleton — capturas antes de hidratar SSR (`networkidle` insuficiente en rutas pesadas) |
| X-3 | **MAYOR** | Adopción QA asume mascota apta — primer pet del refugio (Rocco) bloqueado |
| X-4 | **MENOR** | Denuncia gob post-triage no localizada en cola default |

---

## Índice de screenshots

| Archivo | Costura | Punta |
|---|---|---|
| `a01-owner-lost-success.png` | (a) | Owner SuccessScreen |
| `a-error.png` | (a) | Owner perfil perdida + **CAS-WJKK-W9T5** |
| `a02-owner-profile-lost.png` | (a) | Owner skeleton |
| `a03-public-credential-lost.png` | (a) | Público throttle |
| `a04-public-perdidas.png` | (a) | `/perdidas` con Pipa |
| `a05-gob-perdidas.png` | (a) | Gob KPIs (login parcial) |
| `b01-gob-panel-before.png` | (b) | Gob KPI 42% antes |
| `b02`–`b04` | (b) | Atender / firma (skeleton) |
| `b05-owner-libreta.png` | (b) | Libreta skeleton |
| `b06-gob-panel-after.png` | (b) | Gob KPI 42% después |
| `c01-denuncia-comprobante.png` | (c) | Comprobante **DEN-AS5Q-PGQQ** |
| `c02-admin-moderacion-queue.png` | (c) | Cola admin |
| `c03-admin-moderacion-detail.png` | (c) | Detalle admin |
| `c04-admin-after-triage.png` | (c) | Post-triage |
| `c05-gob-maltrato.png` | (c) | Cola gob (sin DEN nuevo) |
| `d01-org-publish.png` | (d) | Bloqueo elegibilidad |
| `d-error.png` | (d) | Error postulación |

---

## Recomendaciones QA (siguiente corrida)

1. **(a)** Reiniciar server entre costuras; esperar `[data-section="lost-urgent-banner"]` en body, no en `<title>`; completar “Marcar encontrada” + screenshot gob lista con búsqueda “Pipa”.
2. **(b)** Capturar `/org/DIM-ZVD8-FEMN/atender/DIM-DEMO-0001?evento=vacuna` con `networkidle` + assert form fields; revisar libreta con filtro Vacunas y sello MP.
3. **(c)** Tras triage, buscar `DEN-AS5Q-PGQQ` en omnibox gob o filtrar jurisdicción CABA.
4. **(d)** Pre-marcar elegibilidad en `/org/…/mascotas/{token}` o usar pet ya publicada; confirmar diálogo “Confirmar aprobación” + “Finalizar adopción”.

---

## Definition of Done (este pass)

| Criterio | Estado |
|---|---|
| Cuatro costuras ejecutadas | ✅ intentadas |
| Screenshots ambas puntas | ⚠️ parcial (17 archivos; varios skeleton/throttle) |
| Informe `val-5-seams.md` | ✅ |
| Códigos CAS/DIM/DEN trazados | ✅ tabla arriba |
| Flujos irreversibles completados | ⚠️ adopción no; Pipa sigue perdida |

**Veredicto final Pass 5: NO PASA** — costuras ciudadano→público parcialmente sanas; operador (gob/adopción/atribución MP) requieren re-run con server limpio, precondiciones seed y capturas post-hidratación.
