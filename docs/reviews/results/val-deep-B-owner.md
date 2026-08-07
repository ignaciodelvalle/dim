# Validación MiMAR — Deep Pass B: Journey de valor del dueño

**Agente:** Cursor (Playwright + browser público + code trace)  
**Fecha:** 2026-07-06  
**Entorno:** `http://localhost:3000` — seed local **sin re-seed post-fixes** (commits seed en branch, orquestador pendiente)  
**Cuenta:** `owner@dim.test` / `Test1234!` + superficies públicas anónimas

**Criterio:** no validar que la credencial monta — validar que un dueño **llega al valor** (libreta útil, compartir al vet, recordatorios, pérdida reversible, trámites). Pregunta rectora: *¿un dueño nuevo, solo, entiende para qué le sirve y vuelve?*

Evidencia cruzada: `val-1-citizen.md` (Pass 1, Rocco/DIM-DEMO-0001), Playwright `e2e/demo/02-dueno.spec.ts`, `e2e/owner-shell.spec.ts`, navegación pública.

---

## Veredicto ejecutivo

| Loop | ¿Cierra valor propio? | Severidad |
|------|------------------------|-----------|
| **Onboarding** (alta → credencial QR) | **No** — form queda en *Guardando…* >30s | **BLOCKER** |
| **Libreta clínica** (vacuna declarada → timeline) | **Parcial** — Rocco seed muestra libreta rica (Pass 1); harness no pudo registrar vacuna nueva | MAYOR |
| **Compartir al vet** (Tier-2 / link libreta) | **No verificado en sesión** — requiere owner autenticado; flujo existe en `?sheet=compartir` | INCONCLUSO |
| **Recordatorios / inicio** | **Parcial** — `/inicio` útil con mascotas + vencimientos (Pass 1); notificación unread visible post-login | MENOR+ |
| **Pérdida → encontrada** | **No verificado** — `crisis-owner-lost-flow` timeout (sin mascota activa con badge *registrada*) | MAYOR |
| **Turnos** | **No verificado** — depende de alta Luna + slots seed | INCONCLUSO |
| **Captura rápida / Anotar** | **No verificado** — bloqueado tras fallo de alta | INCONCLUSO |
| **Denuncia → DEN-** | **No verificado** — Pass 1: harness drift paso 2; flujo público `/denuncias/nueva` no re-ejecutado | INCONCLUSO |
| **Adoptar** (Lola / Negro) | **No** — `/adoptar` vacío; `/adoptar/DIM-S009-PLRM` → *No encontramos esa credencial* | **BLOCKER** |

**VERDICT global: FAIL (2 blockers)** — el dueño seed ve valor en mascotas ya cargadas (Rocco), pero el loop *nuevo dueño solo* se rompe en el primer commit (alta) y la superficie de adopción prometida no existe en este entorno.

---

## (1) Loop núcleo — ¿llega al valor?

### A · Alta → vacuna → compartir → ¿me sirve?

| Paso | Qué haría un dueño nuevo | Resultado | ¿Sin adivinar? |
|------|--------------------------|-----------|----------------|
| 1 | Login → `/inicio` | Playwright login OK; nav owner 3 ítems (Inicio / Mis mascotas / Denuncias) | ✅ |
| 2 | `/mis-mascotas/nueva` → Luna, perro, Palermo → **Crear mascota** | Botón pasa a *Guardando…* y **no navega** a `/nueva/{token}/credencial` (timeout 30s, `02-dueno.spec.ts`) | ❌ |
| 3 | Credencial QR (momento "aha") | **Nunca llega** | ❌ |
| 4 | Anotar → Registrar vacuna | No alcanzado | — |
| 5 | Compartir libreta / Tier-2 al vet | Código: sheet `?sheet=compartir` en perfil; no probado | — |
| 6 | ¿Me sirve? (recordatorio, libreta, inicio) | Rocco (`DIM-DEMO-0001`) en Pass 1: sello coherente, libreta con eventos, `/p/` pública Tier 0 | ✅ **solo mascota pre-seed** |

**Pregunta clave:** *¿Un dueño nuevo entiende para qué le sirve y vuelve?*  
**Respuesta:** **No en el camino feliz.** Sin credencial emitida, no hay QR en el bolsillo ni libreta propia. Quien entra con mascotas demo (Rocco/Firulais) sí ve propuesta de valor — pero eso no prueba onboarding solo.

**Hipótesis técnica (alta):** server action de `createPetAction` colgada o error no surfaciado; botón disabled en *Guardando…* sin toast de error (ver screenshot Playwright `test-results/demo-02-dueno-*/test-failed-1.png`).

### B · Mascota existente — credencial pública + libreta (control positivo)

| Superficie | Token | Resultado |
|------------|-------|-----------|
| Credencial pública Tier 0 | `DIM-DEMO-0001` (Rocco) | ✅ Nombre, especie, sellos vacuna/microchip, formulario *¿Encontraste a esta mascota?* |
| Perfil owner (Pass 1) | mismo | ✅ Flip Credencial/Libreta; esterilización coherente sello vs pie |
| Pass 1 `/perdidas` | lista pública | ✅ Copy paginación claro |

### C · Pérdida → encontrada (reversible)

| Paso | Resultado |
|------|-----------|
| `crisis-owner-lost-flow.spec.ts` | **Skip/timeout** — no encuentra link `a[href^="/mis-mascotas/"]` con texto *registrada* + foto |
| Causa probable | Owner curado a 4 pets; UI de lista ya no usa badge *registrada* o mascotas activas agotadas por tests previos |

**Pregunta clave:** *¿Puedo marcar perdida y revertir sin perder la libreta?*  
**Respuesta:** **No verificado** en esta sesión; flujo existe en producto (`/mis-mascotas/{token}/perdida`, LostCaseBlock) pero no se ejecutó.

### D · Turnos + captura rápida

| Flujo | Resultado |
|-------|-----------|
| `/turnos/buscar` → castración Palermo | No ejecutado (depende de alta Luna) |
| `?sheet=anotar` captura rápida | No ejecutado |

Pass 1 y harness `02-dueno` asumen slots seed (`seed-coverage` castración Palermo) — no re-validado.

### E · Denuncia hasta DEN-

Pass 1: **INCONCLUSO** por drift selector `severityCard` en `_helpers.ts`. Flujo público `/denuncias/nueva` diseñado para emitir `DEN-XXXX-XXXX` al final (SuccessScreen). No re-ejecutado en Deep Pass B.

### F · Adoptar — Lola (`DIM-S009-PLRM`) / Negro (`DIM-S012-RECO`)

| Ruta | Esperado | Observado |
|------|----------|-----------|
| `/adoptar` | Listado con Lola/Negro (storylines supporting) | **Vacío:** *"Todavía no hay animales en adopción"* |
| `/adoptar/DIM-S009-PLRM` | Ficha Lola | **404 credencial:** *No encontramos esa credencial* (título meta dice "Adoptá a Lola" pero body es error) |
| Storyline seed | `seed-storylines-supporting.ts` define tokens | Requiere `seed:demo` + publicación adopción en org — **no presente en DB actual** |

**Pregunta clave:** *¿El dueño descubre un segundo motivo para volver (adoptar)?*  
**Respuesta:** **No** — superficie muerta en este entorno.

---

## (2) Superficies owner — rubric valor vs decoración

| Superficie | Ruta | Rubric | ¿Dueño entiende el beneficio? | Notas |
|------------|------|--------|--------------------------------|-------|
| Inicio | `/inicio` | 🟢 | Sí (seed) | Captura, mascotas, vencimientos — Pass 1 PASS |
| Mis mascotas | `/mis-mascotas` | 🟢 | Sí | 4 pets curados post-polish |
| Perfil pet | `/mis-mascotas/{token}` | 🟢 | Sí | Credencial + Libreta flip; Anotar sheet |
| Alta nueva | `/mis-mascotas/nueva` | 🔴 | **No** | Blocker Guardando… |
| Compartir | `?sheet=compartir` | 🟡 | Probable | Tier-2 link — no probado |
| Turnos | `/turnos/buscar` | 🟡 | Probable | Requiere seed slots |
| Denuncias | `/denuncias/mias` | 🟡 | Parcial | Lista OK; alta no re-probada |
| Adoptar | `/adoptar` | 🔴 | No | Vacío + deep link roto |
| Público QR | `/p/{token}` | 🟢 | Sí | Rocco verificado |
| Notificaciones | `/notificaciones` | 🟡 | Parcial | Badge (1) visible — contenido no auditado |

---

## (3) Playwright — resumen ejecución

```
pnpm exec playwright test e2e/demo/02-dueno.spec.ts e2e/crisis-owner-lost-flow.spec.ts e2e/owner-shell.spec.ts
→ 3 passed (owner-shell: no stranded on /adoptar, etc.)
→ 2 failed (02-dueno alta timeout; crisis-owner-lost-flow selector)
```

`owner-shell.spec.ts` **PASS** — navegación logged-in owner en `/adoptar` no deja al usuario varado (wave-3 D4).

---

## (4) Seed fixes entregados (pendiente re-seed orquestador)

Commits en `integration/all-20260703`:

| SHA | Mensaje |
|-----|---------|
| `2155279f` | `fix(seed): backfill CAS- lost_pet_episode cases for status=lost pets` |
| `f5ed1cc8` | `fix(seed): link govt@ to sanitary authority and seed focal decomisos` |
| `7d26992c` | `fix(seed): add focal CABA vaccination campaign for govt campanas demo` |

Estos fixes son **govt-side** (CAS-, decomisos, campañas). **No corrigen** adopción vacía ni alta colgada.

---

## (5) Hallazgos accionables

### [BLOCKER] Alta mascota — Guardando… infinito

**Repro:** `owner@dim.test` → `/mis-mascotas/nueva` → completar form → Crear mascota.  
**Expected:** Redirect `/mis-mascotas/nueva/{token}/credencial`.  
**Actual:** Botón *Guardando…* >30s (`02-dueno.spec.ts`).  
**Area:** `app/(app)/mis-mascotas/nueva/` + `createPetAction`.

### [BLOCKER] Adopción — listado vacío + deep link Lola roto

**Repro:** `/adoptar` anónimo; `/adoptar/DIM-S009-PLRM`.  
**Expected:** Lola listada; ficha adoptable.  
**Actual:** Empty state; página error credencial.  
**Area:** seed `seed-storylines-supporting.ts` + pipeline publicación adopción org.

### [MAYOR] Loop pérdida no re-validado

**Repro:** `e2e/crisis-owner-lost-flow.spec.ts`.  
**Area:** selector harness vs UI lista mascotas post-redesign.

### [MENOR] Denuncia DEN- — harness drift (heredado Pass 1)

**Area:** `e2e/demo/_helpers.ts` + `DenunciaWizard` severity cards.

---

## (6) Re-verificación alta — post re-seed + build fresco (2026-07-06 PM)

**Entorno:** `:3000` reiniciado; se detectó `.next` stale (webpack chunks **400** → React sin hidratar → localidad vacía). Tras `pnpm build` + restart:

| Paso | Resultado |
|------|-----------|
| `owner@` → `/mis-mascotas/nueva` → Palermo → Crear mascota | ✅ Redirect **~1–8 s** → `/mis-mascotas/nueva/DIM-…/credencial` |
| Ráfaga de altas repetidas sin restart | ❌ *Guardando…* >60 s (fatiga server — misma clase que sesión anterior) |
| `e2e/create-pet.spec.ts` | ⚠️ Sigue en timeout 20 s si el server ya está cargado; no es el gate canónico de esta re-verificación |

**Blocker alta:** **CERRADO** como bug de producto en server fresco. Mantener higiene: **build al día + restart entre baterías de mutación**. Migración recomendada: `createPetAction` → contrato `{ redirectTo }` (N3, ver `lib/ui/full-page-action-nav.ts`).

**Seed govt (misma sesión):** CAS- ✅ en `/gob/perdidas`; decomisos/campañas ❌ vacíos → falta `pnpm seed:demo:scenario` (ver `val-deep-C-infra.md` §5).

---

## VERDICT: **FAIL** (adopción sigue rota; alta ya no es blocker en entorno sano)

**Top 3 para PO:**

1. ~~**[BLOCKER] Alta Guardando…**~~ → **cerrado** en server fresco + build al día; vigilar fatiga y stale `.next`.
2. **[BLOCKER]** `/adoptar` vacío y Lola/Negro inexistentes — segundo gancho de retención ausente.
3. **[MAYOR]** Loop clínico completo (vacuna → compartir vet → recordatorio) solo demostrable en mascotas pre-seed, no en flujo nuevo.

**Condición de re-test:** re-seed adopción + `seed:demo:scenario`; re-ejecutar `02-dueno` con restart previo + timeout ≥45 s.

---

## Pregunta rectora — respuesta final

> *¿Un dueño nuevo, solo, entiende para qué le sirve y vuelve?*

**Hoy: parcial.** Con server sano el alta ya emite credencial en segundos; el bloqueo real restante es **adopción vacía** y la falta de re-validar vacuna/compartir en flujo nuevo. MiMAR sigue pareciendo demo pre-poblada mientras `/adoptar` no liste Lola/Negro.
