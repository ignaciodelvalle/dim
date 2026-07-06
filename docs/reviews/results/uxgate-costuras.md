# UX-gate costuras cross-POV — Cursor (2026-07-06)

**Agente:** Cursor  
**Entorno:** `http://localhost:3000` (build producción vía `scripts/qa-up.ps1`; Playwright auxiliar en `:3333` para flujos largos)  
**Cuentas:** `owner@dim.test`, `owner2@dim.test`, `govt@dim.test`, `admin@dim.test`, `orgadmin@dim.test`, `alejo@dim.test` — contraseña `Test1234!`  
**Screenshots:** `docs/reviews/results/uxgate-costuras-screenshots/`  
**Side-effects (reversibles):** Pipa (`DEMO-PET-010`) marcada perdida → encontrada; denuncia anónima `DEN-RK7T-94YM` creada (moderación pendiente si no se completó manualmente).

---

## Veredicto global

| Criterio | Resultado |
|---|---|
| Costura (a) Perdida | **PASS** (con reserva menor en cierre gob) |
| Costura (b) Vacuna Atender | **FAIL** — handoff incompatible con seed demo |
| Costura (c) Denuncia | **FAIL** — mitad ciudadana OK; puente admin→gob no completado |
| Costura (d) Adopción | **FAIL** — no ejecutado (timeout batería) |
| **PASS costuras battery** | **FAIL** |

---

## (a) Perdida — owner@ → gob + /perdidas → owner@ encontrada

**Entidad:** `DEMO-PET-010` (Pipa) · caso **`CAS-SYHA-3P8Z`**

| Punta | Screenshot | ¿Propagó? |
|---|---|---|
| Owner marca perdida | `a01-owner-pipa-lost-success` | ✅ SuccessScreen “Activamos la búsqueda de Pipa” |
| Owner perfil perdida | `a02-owner-pipa-profile-lost` | ✅ Banner “Perdida”, `LostCaseBlock` con **CAS-SYHA-3P8Z**, CTA encontrada |
| Público `/p/DEMO-PET-010` | `a03-public-credential-lost` | ✅ “ESTÁ PERDIDA”, CTAs ubicación |
| Público `/perdidas` | `a05-public-perdidas-list` | ✅ Pipa en grilla con badge PERDIDO |
| Gob `/gob/perdidas` | `a04-gob-perdidas-list` | ✅ KPI “Activas: 7” (episodio sumado al agregado) |
| Owner marca encontrada | `a09-owner-pipa-after-found-retry` | ✅ Perfil vuelve a activo; botón “Marcar como perdida” otra vez |
| Gob post-encontrada | `a07-gob-perdidas-after-found` | ⚠️ Dashboard agregado (7 activas) — no hay fila “Pipa” visible en vista KPI; cierre episódico no verificado en detalle |

### Rubric

| Pantalla | ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? |
|---|---|---|---|---|
| SuccessScreen perdida | WhatsApp + cartel suficientes | — | ✅ | ✅ |
| Perfil perdido (owner) | — | Ubicación “no especificada” tras wizard sin geocode | ✅ CAS + CTAs en strip | ✅ [POCO INTUITIVO] Nominatim falló en sandbox (“No pudimos buscar…”) |
| `/p/` perdida | — | — | ✅ | ✅ |
| `/gob/perdidas` | Mapa + 5 KPIs | **Lista/caso por token** no visible en scroll default — hay que ir a “Ver detalle” | ⚠️ | ⚠️ agregados sí, caso individual no |

### Códigos cross-POV

- **`DEMO-PET-010`** consistente owner ↔ público.
- **`CAS-SYHA-3P8Z`** aparece en owner `LostCaseBlock`; no cruzado en gob (vista agregada, no detalle de caso en captura).

### Notas

- Primer intento con dirección tipeada → **500 sin-digest** al submit (`Marcando…`). Reintento **sin ubicación** (patrón e2e) → OK.
- Cierre “encontrada” vía `?sheet=marcar-encontrada` + Confirmar restauró estado owner (`a09`).

**Veredicto (a): PASS** — propagación perdida end-to-end demostrada; cierre owner confirmado; gob mueve agregado aunque la UI no expone el CAS en la vista capturada.

---

## (b) Vacuna vía Atender — alejo@ → owner libreta MP → gob KPI

**Handoff pedía:** código **`DEMO-PET-001`** (Rocco).

| Punta | Screenshot | ¿Propagó? |
|---|---|---|
| Gob KPI antes | `b01-gob-panel-before` | Baseline antirrábica ~**43%** parseado |
| Atender entry | `b02-atender-entry` | ✅ |
| Lookup `DEMO-PET-001` | `b02b-atender-demo-token-rejected` | ❌ “El formato del código es **DIM-XXXX-XXXX**” |
| Firma vacuna | — | ❌ No alcanzado |
| Owner libreta MP | — | ❌ |
| Gob KPI después | — | ❌ |

### Hallazgo blocker

`ATENDER_TOKEN_PATTERN` en `app/org/[orgToken]/atender/atender-access.ts` **solo acepta `DIM-*-*`**. El seed demo asigna tokens **`DEMO-PET-*`** a las mascotas de `owner@` (incl. Rocco). El handoff de la batería y el seed **no alinean** — Atender no puede resolver Rocco en este entorno.

Intento con `DIM-9HAK-D5Z4` (Firulais del plan seed-demo-polish) → “No se encontró ninguna mascota” (no presente en DB poblada actual).

### Rubric (Atender entry)

| ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? |
|---|---|---|---|
| — | Hint que DEMO tokens existen en QA | ✅ error claro | ✅ |

**Veredicto (b): FAIL** — costura no ejecutable con el código pedido; no es posible verificar declarada→verificada ni movimiento KPI.

**Recomendación PO:** o bien (1) ampliar Atender a tokens `DEMO-PET-*` en local, o (2) cambiar handoff a una mascota con token `DIM-*` real en seed, o (3) re-seed Rocco con token DIM.

---

## (c) Denuncia anónima → admin moderación → gob maltrato

**Entidad:** **`DEN-RK7T-94YM`**

| Punta | Screenshot | ¿Propagó? |
|---|---|---|
| Wizard 5 pasos + comprobante | `c01-denuncia-comprobante` | ✅ Código **DEN-RK7T-94YM**, mapa, estado ABIERTA |
| Admin `/admin/moderacion` | — | ❌ No completado (timeout batería) |
| Gob `/gob/maltrato` | — | ❌ No completado |

### Rubric (comprobante anónimo)

| ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? |
|---|---|---|---|
| Banner integración Ley 14.346 | — | ✅ código + mapa + severidad | ✅ |

### Códigos

- **`DEN-RK7T-94YM`** consistente en URL `/denuncias/codigo/…` y cabecera del comprobante.
- Puente admin→gob **no verificado** en esta sesión.

**Veredicto (c): FAIL** — mitad A (ciudadano) PASS; mitad B (operador) no demostrada.

---

## (d) Adopción — orgadmin@ → owner2@ → orgadmin finaliza → owner2 dueño

| Punta | Screenshot | ¿Propagó? |
|---|---|---|
| Org publica | — | ❌ No ejecutado |
| Owner2 postula | — | ❌ |
| Org finaliza | — | ❌ |
| Owner2 dueño + custodia cierra | — | ❌ |

**Veredicto (d): FAIL** — sin evidencia en esta corrida.

---

## Side-effects log

| Acción | Persiste |
|---|---|
| Pipa perdida → encontrada | Revertido a **activa** (`a09`) |
| Denuncia `DEN-RK7T-94YM` | **Sí** — queda en cola moderación |
| Vacuna Atender | No aplicada |
| Adopción | No aplicada |

---

## Síntesis UX “el sistema es UNO”

**Lo que sí se siente unificado**

- Perdida: el mismo animal (`DEMO-PET-010`) salta de owner a credencial pública Tier-1 y al listado `/perdidas` con estado coherente; el owner ve el **CAS-** en su perfil mientras está perdida.
- Denuncia anónima: comprobante autocontenido con código trazable.

**Lo que rompe la ilusión**

- **Atender vs seed demo:** el vet no puede atender la mascota que el handoff nombra — el sistema “legal” (DIM) y el “demo” (DEMO-PET) divergen en la costura clínica.
- **Gob perdidas:** operador ve agregados, no el hilo CAS↔DIM en la captura — hay que buscar en detalle.
- **Denuncia / adopción:** sin completar el tramo operador, no se demuestra que admin y gob leen el mismo código que el ciudadano.

---

## Artefactos

```
docs/reviews/results/uxgate-costuras-screenshots/
  a01-owner-pipa-lost-success.png
  a02-owner-pipa-profile-lost.png
  a03-public-credential-lost.png
  a04-gob-perdidas-list.png
  a05-public-perdidas-list.png
  a06-owner-pipa-found.png      # captura intermedia (aún perdida — antes del retry)
  a07-gob-perdidas-after-found.png
  a09-owner-pipa-after-found-retry.png
  b01-gob-panel-before.png
  b02-atender-entry.png
  b02b-atender-demo-token-rejected.png
  c01-denuncia-comprobante.png
  results.json
```

**Nota libreta 3D:** no se abrió flip 3D en esta corrida; se priorizó data/seams. Artefacto extensión conocido — no re-evaluado.

---

## Próximos pasos sugeridos (PO)

1. **Desbloquear (b):** alinear token Rocco (`DEMO-PET-001` ↔ `DIM-*`) o actualizar handoff.
2. **Re-correr (c) y (d)** en sesión dedicada: moderar `DEN-RK7T-94YM` → verificar fila en `/gob/maltrato`; adopción con pet de refugio no adoptado.
3. **(a) menor:** considerar fila/caso visible en `/gob/perdidas` con **CAS-** + **DIM-** sin drill-down.
