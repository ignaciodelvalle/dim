# Plan: del "consistente" al siguiente nivel — mejoras concretas

> Síntesis de 4 audits (2026-07-21): `audit-1-consistencia.md`, `audit-2-estados.md`,
> `audit-3-feedback.md`, `audit-4-decision-ciclos.md`. Framework: la escalera de 5
> niveles. Método invariante del proyecto: **primitivo → fence en CI → barrido**.
> Principio: subimos una dimensión de forma DURABLE definiéndola una vez, enforzándola,
> y barriendo lo existente — igual que hicimos con OpFilterBar y la honestidad de datos.

## Scorecard grounded (dónde estamos, con números reales)

| Nivel | Dimensión | Score | Estado |
|---|---|---|---|
| 1 | Gramática visual | ~5.75/10 | Fuerte donde hay fence (tokens/botones/select); flojo en lo NO fenceado: espaciado, tipo, radios, números |
| 2 | Completitud de estados | ~55-60% | `error`/`empty` con primitivo; `success` silencioso 85%, `offline`/`mantenimiento` = 0 |
| 3 | Feedback + incertidumbre | ~40-50% | Botones ok; feedback de éxito <20%; asimetrías de confirmación vivas |
| 4 | Densidad de decisión | ~35% | Ofensores sistémicos (grids sin jerarquía); sin principio |
| 5 | Ciclos + fachadas | ~45% | Varios "regalos olvidados" ya construidos sin exponer |

**Diagnóstico central:** somos fuertes exactamente donde hay `primitivo + fence`, y flojos donde el manejo quedó ad-hoc. El plan es extender la receta que ya domina el proyecto a estados, feedback y tokens.

---

## Track A — Tokens: cerrar la gramática visual (Nivel 1 → ~9/10)
*Fundacional: todo lo visual se apoya acá. Barato y 100% fence-able.*

- **A1 · Tokens de espaciado** (`--space-*`, hoy = 0). Definir la escala, corregir el off-grid HORNEADO en `Card.tsx` (`px-[18px]`/`py-[13px]`), fence de spacing arbitrario. *Alto leverage — el primitivo base está off-grid.*
- **A2 · Escala tipográfica** — promover la escala de-facto (`text-[13px]` ×790, `text-[11px]` ×317) a tokens, fence de `text-[Npx]` arbitrario. *El fence de mayor valor del audit.*
- **A3 · Radios** — snap de `rounded-[3px]` ×170 / `rounded-[5px]` ×49 a `--radius-*`, apretar el fence.
- **A4 · Iconos** — migrar los 5 archivos de nav-chrome que hornean Hamburger/Close/Chevron al registry, fence de SVG/emoji/lucide-directo. *El más barato, sin prerequisitos.*
- **A5 · Números** — un primitivo `<Num>`/convención `tabular-nums` por "renderiza un número" (no por "es dashboard operador") + decimales consistentes por tipo de métrica + fence.
- **A6 · Copy** — "Ingresar"→"Iniciar sesión" (drift de 1 archivo) + lint de terminología.

## Track B — Sistema de estados (Nivel 2: 55% → 85%+)
*El salto de mayor palanca: es donde más se siente "a medio hacer".*

- **B1 · Primitivo `StateView`/`OpState`** cubriendo los 9 estados con copy es-AR honesto+accionable por estado. "El OpFilterBar de los estados."
- **B2 · `offline` + `mantenimiento`** (hoy = 0): página offline real (el `sw.js` hoy lo niega) + modo mantenimiento.
- **B3 · `success`** — hoy silencioso en ~85% de mutaciones. Ver Track C (se cruza).
- **B4 · `partial`** — extraer el `ResultPanel` duplicado 3× (Bulk/Adoption/OrgMascotas) a UN primitivo.
- **B5 · `permisos`** — unificar los 3 patrones paralelos (`acceso-denegado` / `OpBreach` / el duplicado en org).
- **B6 · `loading`** — de 13/115 rutas con skeleton propio a sistemático (Suspense + `loading.tsx` por segmento con skeleton que matchee el layout real).
- **B7 · Fence** "ningún estado a mano" + barrido de las ~75 pantallas.

## Track C — Convención de feedback + confirmación (Nivel 3: 40% → 80%)

- **C1 · Feedback de mutación** — cablear el Toaster (montado, 3 call sites) a UNA convención: toda mutación → confirmación explícita ("se guardó"). Decidir estilo: toast vs banner vs el reload implícito actual.
- **C2 · Regla ConfirmDialog vs inline** — una sola regla para acciones irreversibles + fence. Corregir asimetrías vivas (`IncomingTransferActions` liviano, `RevokeOrg` recarga / `RevokeUser` no).
- **C3 · Confirmaciones que dicen QUÉ VA A PASAR** (consecuencia), no "¿seguro?".
- **C4 · `pressed`/active:scale en OpButton** (paridad con LnButton).
- **C5 · Quién/cuándo en superficie ciudadana** — el timeline del perfil de mascota muestra solo un badge de confianza, no el actor (el dato ya existe).

## Track D — Densidad de decisión (Nivel 4: 35% → 70%)
*Más juicio, menos mecánico.*

- **D1 · Primitivo de jerarquía KPI** — resolver el patrón sistémico "2 grids separados solo por label SR-only" (vigilancia + gob/admin): primario grande, secundarios chicos, visualmente claro.
- **D2 · Demote/disclose** los ofensores: `OrgMascotasBulkList` (6 CTAs de igual peso), `admin/inteligencia` (tabla 9 columnas), sacar `admin/sistema/crons` del nav de producto (es ops), filtros duplicados en `/perdidas`, filas de foster incondicionales en `/cuenta`.
- **D3 · Lente "¿qué decide esta pantalla?"** — un doc de una línea por pantalla; lo que no sirve a esa decisión se corta o se esconde tras disclosure.

## Track E — Cosechar las fachadas (Nivel 5: ROI altísimo)
*Features YA construidas y testeadas — solo falta exponerlas. Regalos ya pagados.*

- **E1 · `fetchCasesPerCapita`** — métrica epi per-cápita construida/testeada, **cero callers**. Cablear a una pantalla. *La más grande.*
- **E2 · `/gob/analytics/export`** — fetchers cableados, sin links de nav. Agregar links.
- **E3 · `owner-nudges.ts`** — motor de nudges completo, huérfano desde que se borró su host. Re-montar o borrar (+ corregir docs).
- **E4 · Cancel de transferencia + `adoption_reversed`** — modelados end-to-end, sin UI.
- **E5 · `/admin/reglas`** — form de `microchip_required` faltante + indicador de regla enmascarada por override heredado (la lente govt read-only sí lo sabe, la admin no).
- **E6 · Check-ins post-adopción de org** — hoy view-only, sin acción posible.
- **E7 · Pase de doc-corrección de AGENTS.md** (6 lugares stale, incl. viaje que se overclaimea).

---

## Secuencia recomendada (olas)

1. **Ola 1 — Fundación + cosecha barata.** Track A (tokens: A4 iconos, A2 tipo, A1 espaciado, A3 radios) + E2/E3/E7 (los regalos de un clic). *Desbloquea todo lo visual; cierra Nivel 1; cosecha gratis.*
2. **Ola 2 — El gap que más se siente.** Track B (sistema de estados completo). *Mayor palanca percibida.*
3. **Ola 3 — La conversación.** Track C (feedback + confirmación). *Se apoya en el Toaster + la decisión de estilo.*
4. **Ola 4 — Atención + cosecha grande.** Track D (densidad) + E1/E4/E5/E6 (fachadas que necesitan UI real).

**Conexión con lo existente:** esto es el hermano de **capa-de-interacción** del Roadmap-10 (honesto por construcción) — misma filosofía, de la honestidad de los DATOS a la de la INTERACCIÓN. Y la Fase B/C de filtros (rumbo elegido) encaja en Track E (regalos olvidados de filtros) + Track D.

## Follow-up del proceso
- El fence `lint:authz-subsumption` tiene un blind spot (no cazó el bug de subsunción del hardening) — revisar.
- Los 4 audits usaron el mismo `topic_key` de engram (upsert) → el markdown es el registro durable, no engram.
