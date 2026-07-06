# UX-gate costuras cross-POV — final battery (2026-07-06)

**Agente:** Cursor  
**Entorno:** `http://localhost:3000` (build producción)  
**Cuentas:** `owner@dim.test`, `owner2@dim.test`, `govt@dim.test`, `admin@dim.test`, `orgadmin@dim.test`, `alejo@dim.test` — contraseña `Test1234!`  
**Screenshots:** `docs/reviews/results/final-seams-screenshots/`  
**Automatización auxiliar:** `e2e/final-seams.spec.ts` + `playwright.localhost.config.ts`

---

## Veredicto global

| Costura | Entidades | ¿Código cruza portales? | Resultado |
|---|---|---|---|
| **(a) Perdida** | `DIM-DEMO-0002` (Greta) · CAS no capturado | Parcial — owner ↔ `/p/` sí; `/perdidas` y gob no verificados en esta corrida | **FAIL** |
| **(b) Vacuna Atender** | `DIM-DEMO-0001` (Rocco) · org clínica Recoleta | Sí en corrida limpia; inestable después | **PASS*** |
| **(c) Denuncia** | `DEN-773H-6FXT` | Ciudadano sí; admin→gob no completado | **FAIL** |
| **(d) Adopción** | — | No ejecutado (crash servidor) | **FAIL** |
| **Batería** | — | — | **FAIL** |

\* **(b)** pasó una corrida Playwright aislada (27 s): firma vacuna → `?firmado=1` → libreta owner con señal MP → revisita gob. Corridas posteriores chocaron con pantalla **`sin-digest`** (ver blocker abajo).

---

## Blocker transversal — `sin-digest`

[Blocker] Varias rutas operador / post-mutación · crash genérico Next  
**Repro:** 1) Ejecutar batería de costuras (marcar perdida + denuncia + login admin/org). 2) Navegar `/org/…/atender/…?evento=vacuna`, `/admin/moderacion`, `/org/…/mascotas`.  
**Expected:** Superficies operador renderizan.  
**Actual:** Pantalla “Algo salió mal” con código `sin-digest` (`b-error.png`, `c-error.png`, `d-error.png`, `b01-gob-panel-before.png` en estado degradado).  
**Area guess:** error boundary global / server action post-mutación — revisar logs del proceso `:3000`.  
**Bug or artifact:** **PRODUCT-BUG** (posible estado DB inconsistente tras muchas mutaciones en la misma sesión; requiere restart + reseed para re-verificar).

---

## (a) Perdida — owner@ → gob + `/perdidas` → owner@ encontrada

**Entidad:** `DIM-DEMO-0002` (**Greta**) — primera mascota “REGISTRADA” en `/mis-mascotas` (Pipa quedó en estado perdida de corridas previas).

| Punta | Screenshot | ¿Propagó? |
|---|---|---|
| Owner marca perdida | `a01-owner-lost-success.png` | ✅ SuccessScreen “Activamos la búsqueda de **Greta**” |
| Owner perfil + CAS | `a02-owner-profile-lost.png` | ⚠️ Skeleton de carga — **CAS-** no legible en captura |
| Público `/p/DIM-DEMO-0002` | `a03-public-credential-lost.png` | ✅ Banner “ESTÁ PERDIDA”, CTAs Llamar / La tengo / La vi |
| Público `/perdidas` | — | ❌ Greta no apareció en grilla (timeout Playwright) |
| Gob `/gob/perdidas` | — | ❌ No alcanzado (fallo previo en `/perdidas`) |
| Owner marca encontrada | — | ❌ No completado en esta corrida |
| Gob post-encontrada | — | ❌ |

### Rubric (SuccessScreen perdida)

| ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? |
|---|---|---|---|
| WhatsApp + cartel OK | — | ✅ | ✅ |

### Códigos cross-POV

- **`DIM-DEMO-0002`** consistente owner success → credencial pública Tier-1.
- **`CAS-`** no verificado (captura en loading).
- Hilo gob y cierre encontrada **no demostrados**.

**Veredicto (a): FAIL** — mitad ciudadana OK; costura operador + cierre + listado público incompletos.

---

## (b) Vacuna vía Atender — alejo@ → owner libreta MP → gob KPI

**Entidad:** `DIM-DEMO-0001` (**Rocco**) · org **Clínica Veterinaria Recoleta** (token resuelto en runtime vía picker `/org`).

| Punta | Screenshot | ¿Propagó? |
|---|---|---|
| Gob KPI antes | `b01-gob-panel-before.png` | ⚠️ Degradado a `sin-digest` en corrida final; corrida limpia: KPI parseado |
| Atender form vacuna | `b02-atender-vacuna-form.png` | ⚠️ `sin-digest` en corrida final |
| Resuelve Rocco | `b03-atender-rocco-resolved.png` | ⚠️ `sin-digest` en corrida final |
| Firma vacuna | — | ✅ **Corrida aislada 27 s** — URL `?firmado=1` |
| Owner libreta MP | — | ✅ Corrida aislada — texto “verificada / matrícula” |
| Gob KPI después | — | ✅ Corrida aislada — KPI antirrábica parseado (delta no siempre >0 por redondeo) |

### Hallazgo corregido vs. batería anterior

`ATENDER_TOKEN_PATTERN` **sí acepta** `DIM-DEMO-0001` (`DIM-[A-Z0-9]{4}-[A-Z0-9]{4}`). El handoff y el seed **están alineados**; el FAIL previo en `uxgate-costuras.md` fue por org equivocado / sesión cruzada, no por formato de token.

### Rubric (Atender)

| ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? |
|---|---|---|---|
| — | — | ✅ deep-link `?evento=vacuna` | ✅ |

**Veredicto (b): PASS*** — costura demostrada en corrida limpia; **re-run bloqueado** por `sin-digest` tras estrés de batería. Requiere restart `:3000` para evidencia screenshot completa b04–b06.

---

## (c) Denuncia anónima → admin moderación → gob maltrato

**Entidad:** **`DEN-773H-6FXT`**

| Punta | Screenshot | ¿Propagó? |
|---|---|---|
| Wizard 5 pasos + comprobante | `c01-denuncia-comprobante.png` | ✅ Código **DEN-773H-6FXT**, mapa Balvanera, estado ABIERTA |
| Admin `/admin/moderacion` | `c-error.png` | ❌ `sin-digest` al relogin admin |
| Gob `/gob/maltrato` | — | ❌ No alcanzado |

### Rubric (comprobante anónimo)

| ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? |
|---|---|---|---|
| Banner Ley 14.346 placeholder | — | ✅ código + mapa + severidad | ✅ |

### Códigos

- **`DEN-773H-6FXT`** consistente en URL `/denuncias/codigo/DEN-773H-6FXT` y cabecera del comprobante.
- Puente admin→gob **no verificado**.

**Veredicto (c): FAIL** — mitad A (ciudadano) **PASS**; mitad B (operador) no demostrada.

---

## (d) Adopción — orgadmin@ → owner2@ → orgadmin finaliza → owner2 dueño

| Punta | Screenshot | ¿Propagó? |
|---|---|---|
| Org publica | `d-error.png` | ❌ `sin-digest` en `/org/DIM-SUMP-M8CC/mascotas` |
| Owner2 postula | — | ❌ |
| Org finaliza (confirm dialog) | — | ❌ |
| Owner2 dueño + custodia cierra | — | ❌ |

**Nota:** `orgadmin@` resolvió org `DIM-SUMP-M8CC` (no “Refugio Test” del seed mínimo) — posible divergencia seed-demo vs seed-test-users. Sin mascotas visibles en listado al momento del crash.

**Veredicto (d): FAIL** — sin evidencia de costura.

---

## Side-effects log

| Acción | Persiste |
|---|---|
| Greta (`DIM-DEMO-0002`) marcada perdida | **Sí** — revertir con `?sheet=marcar-encontrada` |
| Denuncia `DEN-773H-6FXT` | **Sí** — cola moderación |
| Vacuna Atender Rocco | Posible (corrida limpia) — verificar libreta |
| Adopción | No aplicada |

---

## Síntesis UX “el sistema es UNO”

**Lo que sí se siente unificado**

- Perdida: el mismo `DIM-DEMO-0002` salta de owner a credencial pública Tier-1 con CTAs coherentes.
- Denuncia anónima: comprobante autocontenido con **`DEN-773H-6FXT`** trazable en URL y UI.
- Atender: cuando el servidor responde, **`DIM-DEMO-0001`** cruza clínica → libreta owner con atribución MP.

**Lo que rompe la ilusión**

- **`sin-digest`** tras mutaciones encadenadas — operador no puede cerrar el circuito en la misma sesión.
- Listado `/perdidas` no mostró Greta en automation (propagación pública incompleta en captura).
- **CAS-** no visible sin drill-down / captura en loading.
- Adopción y moderación admin→gob sin evidencia.

---

## Plantilla de reporte (hallazgos accionables)

```
[Blocker] Post-mutación operador · sin-digest
Repro:   1) Marcar perdida + crear denuncia en :3000  2) login admin@ o alejo@ org  3) navegar moderacion/atender/mascotas
Expected: Superficies operador renderizan
Actual:   Pantalla “Algo salió mal” sin-digest (b-error.png, c-error.png, d-error.png)
Area guess: error boundary / server logs del proceso :3000
Bug or artifact: PRODUCT-BUG
```

```
[Mayor] (a) /perdidas no lista mascota recién perdida
Repro:   1) owner@ marca Greta perdida  2) anon /perdidas
Expected: Greta en grilla
Actual:   No visible en 15s (automation)
Area guess: src/modules/lost/infrastructure/lost-listing-read.ts
Bug or artifact: PRODUCT-BUG (confirmar manual tras restart)
```

```
[Menor] (a) CAS no capturado en screenshot perfil
Repro:   1) Tras marcar perdida  2) /mis-mascotas/DIM-DEMO-0002
Expected: LostCaseBlock con CAS-XXXX
Actual:   Skeleton loading en captura a02
Area guess: loading.tsx / hidratación perfil
Bug or artifact: [TOOLING-ARTIFACT] posible — reintentar tras networkidle
```

---

## VEREDICTO

**PASS costuras battery: FAIL** (1 de 4 costuras demostrada end-to-end; 1 parcial; 2 no completadas)

**Top 3 hallazgos**

1. **[Blocker] `sin-digest`** tras batería mutante — impide moderación, adopción y re-verificación Atender en la misma sesión.
2. **[Mayor] (a)** credencial pública OK pero **listado `/perdidas` + gob + cierre** no demostrados.
3. **[Mayor] (c)** ciudadano emite **`DEN-773H-6FXT`** pero **admin→gob no cruza** el mismo código en esta corrida.

---

## Artefactos

```
docs/reviews/results/final-seams-screenshots/
  a01-owner-lost-success.png      # Greta perdida — owner
  a02-owner-profile-lost.png      # skeleton (CAS no legible)
  a03-public-credential-lost.png  # /p/ Tier-1 perdida
  a-error.png
  b01-gob-panel-before.png
  b02-atender-vacuna-form.png
  b03-atender-rocco-resolved.png
  b-error.png
  c01-denuncia-comprobante.png    # DEN-773H-6FXT
  c-error.png
  d-error.png
  results.json
```

---

## Próximos pasos (PO)

1. **Restart** proceso `:3000` (o `pwsh scripts/qa-up.ps1`) y **re-correr (c)→(d)** siguiendo `DEN-773H-6FXT` en admin→gob.
2. **Revertir** Greta a activa (`?sheet=marcar-encontrada`) y reintentar **(a)** con captura CAS + `/perdidas` + `/gob/perdidas`.
3. **Re-run (b)** en sesión limpia para screenshots b04–b06 (libreta MP + KPI).
4. Investigar logs del **`sin-digest`** — probable excepción no digerida en server action post-mutación.
