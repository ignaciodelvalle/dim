# Validación MiMAR — Deep Pass C: Refugio + infra/confianza del dato

**Agente:** Cursor (Playwright headless + probes dirigidos)  
**Fecha:** 2026-07-06 (sesión PM)  
**Entorno:** `http://localhost:3000` — `pnpm start` tras `pnpm build` (HEAD `7d26992c`)  
**Cuentas:** `orgadmin@dim.test`, `alejo@dim.test`, `owner2@dim.test`, `owner@dim.test`, `govt@dim.test` / `Test1234!`

**Criterio:** refugio operable (intake/tránsitos/adopciones + bulk Aprobar con confirmación); RLS cross-tenant falla-cerrado (**cualquier fuga = BLOCKER**); k-anon en Panorama; mobile 390px con mapa.

**Evidencia:** `scripts/cursor-val-deep-c.ts`, `scripts/_deep-c-probes.ts`, screenshots en `docs/reviews/results/val-deep-C-screenshots/`, JSON en `docs/reviews/results/val-deep-C-findings.json`.

---

## Veredicto ejecutivo

| Área | Resultado | Severidad |
|------|-----------|-----------|
| **Refugio orgadmin** — intake / tránsitos / adopciones | **PASS** — montan sin error boundary | OK |
| **Bulk Aprobar + diálogo confirmación** | **PASS** — ejercitado en Patitas (`alejo@`), no en Refugio Test | OK |
| **owner2 postula Lola/Negro** | **FAIL** — `/adoptar/DIM-S009-PLRM` 404 (Lola no listable) | MAYOR |
| **RLS owner cross-tenant** | **PASS** — 404 *No encontramos esta página* | OK |
| **RLS govt fuera de jurisdicción** | **PASS** — caso histórico → notFound | OK |
| **RLS govt in-scope (CABA)** | **PASS** — `CAS-NEUN-WKF2` legible (Kira, CABA) | OK |
| **RLS org cross-tenant** | **PASS** — orgadmin → mascota Patitas → 404 | OK |
| **k-anon Panorama** | **PASS** API (sin conteos &lt;5); copy UI débil | MENOR |
| **Mobile 390px** | **PASS** — overflow OK, mapa 340×558px; 1 control &lt;44px en Panorama | MENOR |

**VERDICT global: CONDITIONAL PASS** — infra/confianza del dato sana (sin BLOCKERs). Gaps en seed/flujo de adopción pública (Lola) y nota operativa sobre quién administra Patitas vs Refugio Test.

---

## (1) Refugio — `orgadmin@dim.test`

### Superficies base (Refugio Test `DIM-J5V6-SX22`)

| Superficie | Ruta | Resultado |
|------------|------|-----------|
| Token | `/cuenta/memberships` | `DIM-J5V6-SX22` — Refugio Test (Seed) |
| Intake | `/org/DIM-J5V6-SX22/intake` | ✅ Render OK — `01-intake.png` |
| Tránsitos | `/org/.../transitos` | ✅ Render OK |
| Adopciones | `/org/.../adopciones` | ✅ Render OK — `02-adopciones-queue.png` |

**Pregunta:** *¿El coordinador entra a intake/tránsitos/adopciones sin crash?* → **Sí.**

### Bulk Aprobar — alcance real del seed

**Modelo de cuentas (importante):**

| Cuenta | Org(s) | Mascotas Lola/Negro |
|--------|--------|---------------------|
| `orgadmin@dim.test` | Solo **Refugio Test** | ❌ No administra Patitas |
| `alejo@dim.test` | **Patitas del Norte** (`DIM-3XNR-Q9GM`) | ✅ Lola `DIM-S009-PLRM`, Negro `DIM-S012-RECO` |

Lola y Negro viven en **Patitas del Norte** (`seed-storylines-supporting.ts`). `orgadmin` no tiene membership Patitas — el bulk sobre Lola/Negro **debe** correr con `alejo@`, no con `orgadmin@`.

### Bulk ejecutado (Patitas, `alejo@dim.test`)

| Paso | Evidencia |
|------|-----------|
| Cola pending con 2 postulaciones (Coco + Negro) | Log probe + `08-patitas-pending.png` (run anterior) |
| **Seleccionar todo (2)** → barra bulk visible | `OpBulkBar` con *Aprobar seleccionadas* |
| Diálogo **"Aprobar postulaciones seleccionadas"** | `confirm dialog visible: true` |
| Confirmar → cola vacía | `09-bulk-confirm-patitas.png` — *Sin postulaciones* |

**Pregunta:** *¿Bulk Aprobar con diálogo de confirmación funciona?* → **Sí** (Patitas / `alejo@`).

### owner2 postula Lola/Negro — FAIL

| Intento | Resultado |
|---------|-----------|
| `alejo@` publicar Lola en `/org/.../mascotas/DIM-S009-PLRM/adoptar` | Botón Publicar no materializó listing público verificable |
| `owner2@` → `/adoptar/DIM-S009-PLRM` | **404** — *No encontramos esa credencial* (`12-adoptar-lola.png`) |

**Causa probable:** seed tiene `adoption_eligibility_set` en eventos pero **no** `adoptionListedAt` en columna `pets` para Lola; `/adoptar` exige `adoptionListedAt IS NOT NULL` + `adoptionEligible=true` + org verificada (`queryAdoptionListing` / ficha pública).

**Severidad:** **MAYOR** (flujo demo roto para el storyline Lola; no es fuga de datos).

**Workaround validación:** Negro ya tenía `adoption_application_submitted` pending en seed (aplicante `external_user_512`) — suficiente para ejercitar bulk sin owner2.

---

## (2) Infra/confianza — RLS cross-tenant

> Cualquier fuga cross-tenant = **BLOCKER**. Ninguna detectada.

### Dueño → mascota ajena

| Paso | Resultado |
|------|-----------|
| `owner2@` → token propio | Resuelto |
| `owner@` → `/mis-mascotas/{token ajeno}` | **404** — *No encontramos esta página* |

### Govt CABA (`govt@`) — fuera de jurisdicción

| Deep URL | Resultado |
|----------|-----------|
| `/gob/casos/PANO-CASE-HIST-DEC-000001` | **Fail-closed** — *No encontramos esta página* (sin filtrar partes/normativa) |
| `/gob/casos/PANO-CASE-HIST-DIS-000023` | Idem (probe automatizado) |

### Govt CABA — in-scope

| Deep URL | Resultado |
|----------|-----------|
| `/gob/casos/CAS-NEUN-WKF2` | **PASS** — caso ABIERTO, Kira, jurisdicción CABA (`11-govt-cas-inscope.png`) |

### Org → mascota de otra org

| Paso | Resultado |
|------|-----------|
| `orgadmin@` → `/org/DIM-3XNR-Q9GM/mascotas/DIM-S009-PLRM` (Patitas / Lola) | **404** — *No encontramos esta página* (`10-org-cross-tenant.png`) |

**Pregunta clave:** *¿RLS falla-cerrado en los tres vectores?* → **Sí. Sin BLOCKER.**

**Recomendación CI:** correr `e2e/cross-tenant-isolation.spec.ts` con `playwright.local3000.config.ts` en gate permanente.

---

## (3) k-anon — `/gob/panorama`

| Probe | Resultado | Severidad |
|-------|-----------|-----------|
| Copy explícito en `main` (cobertura 90d, locality) | No visible | MENOR |
| API `/api/panorama/cobertura?period=90d&level=locality` | `suppressedCount=0`, **ningún** `properties.value < 5` en features | OK |
| Click mapa (desktop) | Sin popup con conteo 1–4 | OK |
| Referencia cruzada | `/gob/perdidas` sí muestra *Datos insuficientes (privacidad)* en leyenda mapa | OK (otra superficie) |

**Pregunta:** *¿Celdas k&lt;5 suprimidas?* → **Sí a nivel API** — envelope GeoJSON sin valores pequeños expuestos. En demo actual `suppressedCount=0` (pocos features / todas las celdas visibles ≥5 o agregación provincial).

**Nota:** `features` en API es `FeatureCollection` anidado — el parser del script inicial falló (`features.some is not a function`); corregido en `cursor-val-deep-c.ts`.

---

## (4) Mobile 390px

Viewport Playwright: **390×844**.

| Ruta | Overflow | Tap targets | Mapa |
|------|----------|-------------|------|
| `/p/DIM-DEMO-0001` (anónimo) | 390/390 ✅ | Muestra ≥44px ✅ | — |
| `/gob/panorama?period=90d&layers=cobertura` (`govt@`) | 390/390 ✅ | 1 control &lt;44px (chip capas) — **MENOR** | **340×558px** ✅, provincias AR visibles, zoom +/- usable (`07-mobile-panorama.png`) |

**Pregunta:** *¿Mobile deep con mapa, no solo smoke?* → **Sí** — mapa renderiza y ocupa ancho útil; 1 chip operador ligeramente bajo 44px.

---

## Hallazgos accionables

### BLOCKER

*Ninguno.*

### MAYOR

1. **Lola no listable en `/adoptar`** — seed no setea `adoptionListedAt` pese a `adoption_eligibility_set`; bloquea storyline owner2→Lola. Fix: en `seed-storylines-supporting.ts` o `seed:demo:scenario`, publicar Lola (y opcionalmente Negro) con columnas listing + story mínima.
2. **Fatiga de login en batería larga** — tras ~6–8 contextos Playwright seguidos, `/login` deja de renderizar `input[name=email]` (timeout). Mitigación validación: `clearCookies()` entre cuentas, reiniciar `:3000` entre sub-flujos, o scripts separados.

### MENOR

1. **k-anon copy en Panorama** — supresión silenciosa; Pérdidas ya comunica mejor. Considerar badge cuando `suppressedCount > 0`.
2. **Tap target Panorama mobile** — 1 chip &lt;44px; alinear con WCAG 2.5.5 en controles de capa.
3. **Refugio Test cola adopciones vacía** — bulk no ejercitable ahí; esperado en seed actual.

### OK

1. Intake / tránsitos / adopciones Refugio Test montan.
2. Bulk Aprobar + confirmación en Patitas (`alejo@`).
3. RLS owner, govt (in/out scope), org cross-tenant — todos fail-closed.
4. k-anon API sin conteos &lt;5.
5. Mobile credential + Panorama mapa @ 390px.

---

## Screenshots (índice)

| Archivo | Contenido |
|---------|-----------|
| `01-intake.png` | Intake Refugio Test |
| `02-adopciones-queue.png` | Cola adopciones orgadmin |
| `08-patitas-pending.png` | 2 pending (Coco, Negro) — Patitas |
| `09-bulk-confirm-patitas.png` | Post-bulk: cola vacía |
| `10-org-cross-tenant.png` | orgadmin → Patitas Lola → 404 |
| `11-govt-cas-inscope.png` | CAS-NEUN-WKF2 legible |
| `12-adoptar-lola.png` | owner2 → Lola 404 |
| `05-panorama-kanon.png` | Panorama desktop |
| `07-mobile-panorama.png` | Panorama 390px + mapa |

---

## VERDICT: **CONDITIONAL PASS**

**Infra/confianza del dato lista para demo** — RLS sano, k-anon sin fugas numéricas, mobile Panorama usable. **Condiciones:** (1) documentar que bulk Lola/Negro corre con `alejo@` Patitas, no `orgadmin`; (2) arreglar seed listing Lola para cerrar storyline owner2; (3) mantener build freshness + restart entre baterías Playwright intensivas.
