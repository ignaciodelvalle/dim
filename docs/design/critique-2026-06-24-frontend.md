# MiMAR · Frontend Design Critique — tier Operador (`/admin` + acceso a `/gob`)

> Fecha: 2026-06-24 · Alcance: perfil **admin** y su **acceso a Gobierno** (superficies operador: `/admin`, `/gob`), evaluadas contra el design system del repo (tokens `ln-op-*` + paleta/tipografía «Libreta Nacional», `app/globals.css` + `AGENTS.md`).
> Método: lectura del código de `app/admin`, `app/gob`, `components/admin`, `components/ui/dashboard` + recorrido en vivo del portal con la sesión admin logueada (`/admin`, `/admin/casos`, render `/gob/*`). Cada hallazgo cita token/clase/archivo concreto; las afirmaciones del recorrido se verificaron contra el código.
> Insumo: integra los tres hallazgos de Design (`docs/archive/Hallazgos Design System.md`, sección visual «08 · Oportunidades de mejora» del styleguide). **Honestidad sobre prolijidad:** donde la app ya resolvió algo, se dice; donde el styleguide quedó desfasado del código, se reconcilia.

---

## 0. Resumen ejecutivo

El tier operador **no es default ni templated**: tiene una familia propia de componentes (`Op*`) sobre tokens `ln-op-*`, adoptada en ~179 archivos, con aciertos de intención reales (chip de scope rojo para admin-en-gob, KPIs con tono por target, badges con icono+texto para WCAG 1.4.1). El problema no es ausencia de sistema sino **dos sistemas que crecieron en paralelo y no comparten una capa semántica**: la piel ciudadana (`ln-*`, kit `Ln*`) y la piel operador (`ln-op-*`, kit `Op*`) divergen en color de estado, en geometría de badges y en botones.

| # | Hallazgo | Dimensión | Sev | Tipo |
|---|----------|-----------|-----|------|
| F1 | Color de estado duplicado entre pieles sin capa semántica común | Uso de color / tokens | 🔴 Alta | Rediseño (con quick-wins) |
| F2 | Cuatro componentes de estado en operador con **gramática de color en conflicto** (mismo término, distinto color) | Consistencia de componentes | 🟡 Media | Quick-win (bug) + rediseño |
| F3 | Sin primitivo `OpButton`: 133 `<button>` crudos + color/​radio de "primario" inconsistente | Consistencia de componentes | 🟡 Media/Baja | Rediseño incremental |
| F4 | Ritmo y jerarquía menores en superficies admin (densidad de filas, KPIs) | Jerarquía / densidad | 🟢 Menor | Quick-win |

Orden de implementación sugerido (alineado con Design): **F1 → F2 → F3**, con F4 intercalable como quick-win.

---

## 1. Reconciliación: styleguide de Design ↔ código real

Los hallazgos de Design se escribieron contra el styleguide HTML (`.dirA-*` / `.gob-*` / `redesign-a*.css`). La app **no usa esas clases**: usa tokens Tailwind (`ln-*` / `ln-op-*`) y componentes React. El mapeo 1:1 para que Claude Code no busque clases inexistentes:

| Concepto (styleguide Design) | En el código real | Archivo |
|---|---|---|
| Piel cálida `.dirA-*` (`#FBFAF5`) | tokens `--color-ln-*`, kit `Ln*` | `components/ui/{Badge,StatusFlag,Chip,Button}.tsx` |
| Piel operador `.gob-*` (`#0A3556`) | tokens `--color-ln-op-*`, kit `Op*` | `components/ui/dashboard/*` |
| `.gob-pill[data-tone]` | `OpPill` | `components/ui/dashboard/OpPill.tsx` |
| `.gob-codebadge` (códigos) | `OpCodeBadge` | `components/ui/dashboard/OpCodeBadge.tsx` |
| `.dirA-flag` (estado) | `LnStatusFlag` / `LnVstamp` / `LnBadge` | `components/ui/StatusFlag.tsx`, `Badge.tsx` |
| `.org-statebadge` | `OpStateBadge` | `components/ui/dashboard/OpStateBadge.tsx` |
| `--st-*` (propuesta) | **no existe aún** | — (ver F1) |

Nota de honestidad: el **Hallazgo 3 de Design (6 clases de botón → `.btn`) ya está resuelto en la piel ciudadana** vía `LnButton` (5 variantes). El problema persiste **solo en operador**, que casi no consume `LnButton` (ver F3).

---

## 2. Hallazgos por dimensión

Severidad: 🔴 Alta (corregir antes de escalar) · 🟡 Media · 🟢 Menor.

### 2.1 · Uso de color / tokens — F1 (🔴 Alta) · *integra Hallazgo 1 de Design*

**Qué pasa.** El mismo estado semántico tiene hex distinto por piel, y los componentes **no comparten una capa semántica**: el kit `Ln*` consume los verdes/ámbar/rojo cálidos; el kit `Op*` consume los `ln-op-*`. Verificado en `app/globals.css`:

| Estado | Cálida (`--color-ln-*`) | Operador (`--color-ln-op-*`) |
|---|---|---|
| OK | `ln-ok` `#2e7d4f` | `ln-op-ok` `#1e7a3e` |
| Atención | `ln-warn` `#96600e` ✱ | `ln-op-warn` `#9c6700` |
| Error | `ln-err` `#c0392b` | `ln-op-danger` `#b71c1c` |
| Especial | `ln-rosa` `#b5497e` · `ln-violeta` `#6b4ea8` | `ln-op-viol` `#6a4c93` |

✱ Matiz importante que el styleguide no refleja: `ln-warn` **ya fue oscurecido a `#96600e`** (5.28:1 sobre papel) por WCAG AA — el `#b0771a` que lista Design es el valor viejo (sobrevive solo como `--color-ln-memorial-note`). `ln-op-warn #9c6700` **no tiene auditoría de contraste registrada** sobre `ln-op-warn-bg #fff4da`.

**Por qué importa.** Una mascota «al día» debe verse igual para el dueño y para el veterinario/operador; hoy son dos verdes distintos mantenidos a mano. Además hay **tres violetas** (`ln-rosa`, `ln-violeta`, `ln-op-viol`) para conceptos vecinos.

**Propuesta (refinada).** Crear la capa semántica `--st-*` que pide Design, **pero como indirección por piel, no como un único hex compartido** — un solo hex regresaría el contraste que ya se ganó en papel. Es decir: el *nombre* se unifica, el *valor* sigue calibrado por piel:

```css
/* globals.css @theme — capa semántica (nombres únicos, valores por piel) */
--color-st-ok:   var(--color-ln-ok);     /* piel cálida */
--color-st-warn: var(--color-ln-warn);
--color-st-err:  var(--color-ln-err);
--color-st-info: var(--color-ln-violeta);
/* en contexto operador (.op-surface o el layout /gob,/admin): */
--color-st-ok:   var(--color-ln-op-ok);
--color-st-warn: var(--color-ln-op-warn);
--color-st-err:  var(--color-ln-op-danger);
--color-st-info: var(--color-ln-op-viol);
```

Los componentes pasan a consumir `--color-st-*`; cada piel sólo re-mapea. Ver handoff PR-1.

---

### 2.2 · Consistencia de componentes — badges de estado — F2 (🟡 Media) · *integra Hallazgo 2 de Design*

**Qué pasa.** En el tier operador conviven **cuatro** componentes para "estado", con geometría y, peor, **semántica de color en conflicto**:

| Componente | Forma | Tipografía | `open`/abierto | `closed`/cerrado | Archivo |
|---|---|---|---|---|---|
| `OpPill` | `rounded-full` | sans 9.5px | **ámbar** (`open`→warn) | **verde** (`closed`→ok) | `OpPill.tsx` |
| `CaseStatusBadge` | `rounded-[3px]` | mono 9px | **verde** (`open`→ok-bg) | **neutro** (`closed`→stripe) | `CaseStatusBadge.tsx` |
| `OpStateBadge` | `rounded-[3px]` | mono 9px (+icono) | — | — | `OpStateBadge.tsx` |
| `OpCodeBadge` | `rounded-[3px]` | mono | *(solo códigos — correcto)* | — | `OpCodeBadge.tsx` |

**El bug, no sólo la estética.** El mismo vocablo recibe colores opuestos según el componente:

- **"Abierto"**: verde en `CaseStatusBadge` (visto en vivo en `/admin/casos`, pill verde) pero **ámbar** vía `OpPill tone="open"`.
- **"Cerrado"**: neutro en `CaseStatusBadge` pero **verde** vía `OpPill tone="closed"`.

Eso obliga al ojo a recalibrar entre pantallas y rompe el aprendizaje de color (verde = ¿bueno? ¿abierto? ¿cerrado?). Es lo que Design describe como "tres formas para una misma idea", agravado por significado divergente.

**Propuesta.** (a) *Primero* alinear la semántica de tono entre `OpPill` y `CaseStatusBadge` (corrección barata, alto impacto). (b) Unificar la geometría operador en **un primitivo de estado** (punto de color + label, `rounded-[3px]`, mono, tono por `data-tone`), del que `CaseStatusBadge`/`OpStateBadge`/`OpPill` sean wrappers semánticos. (c) Reservar `OpCodeBadge` para códigos (`PANO-CASE-*`, `req_…`) — ya es correcto. Ver PR-2.

---

### 2.3 · Consistencia de componentes — botones — F3 (🟡 Media/Baja) · *integra Hallazgo 3 de Design*

**Qué pasa.** La piel ciudadana ya consolidó botones en `LnButton` (variantes `primary/seal/ghost/ok/warn`, `rounded-[3px]`). El tier operador **no tiene primitivo equivalente**:

- `LnButton` se importa en **1** archivo de `app/admin`+`app/gob`.
- Hay **133 `<button>` crudos** (61 en `app/admin`, 72 en `app/gob`) con clases inline propias.
- Los pocos botones "de sistema" tampoco coinciden: `OpSubmitButton` usa `bg-ln-op-ok` (**verde**) `rounded-md`; el botón de acción de `OpBulkBar` usa `bg-ln-op-azul` (**azul**) `rounded-md`. → El "primario/enviar" es **verde en un lado y azul en otro**, con radio (`rounded-md` ≈ 6px) distinto al de `LnButton` (`rounded-[3px]`).

**Por qué importa.** Es exactamente la deriva que describe Design (botones casi iguales, costo extra por pantalla), pero localizada en operador. Sin un primitivo, cada formulario nuevo reinventa el botón.

**Propuesta.** Crear `OpButton` espejando `LnButton` pero con acento heredado de la piel (`--accent` = `ln-op-azul`): variantes `primary / ghost / danger / ok / sm / block`, un único radio (`--radius-op-btn`). Fijar **azul** como primario de acción y verde sólo para confirmación positiva explícita. Migrar `OpSubmitButton` + `OpBulkBar` + los 133 crudos por módulo. Ver PR-3.

---

### 2.4 · Jerarquía / densidad / intencionalidad — F4 (🟢 Menor) — *hallazgos del recorrido*

Del recorrido en vivo (`/admin`, `/admin/casos`):

- **Filtros**: la barra de filtros de Casos (`Estado / Tipo / Provincia`) usa `<select>` nativos junto a un botón azul "Filtrar". Funciona, pero los `<select>` nativos rompen con el resto del tier operador (que ya tiene `OpSelect` en `OpField.tsx`). Quick-win: migrar a `OpSelect` para densidad y foco coherentes.
- **Filas de casos**: cada expediente ocupa mucho alto vertical para un código + tipo + un badge + fecha. La densidad es baja para una "cola" que el admin escanea en volumen — considerar una variante compacta (altura de fila ~40px) sin perder el target táctil en mobile.
- **Intencionalidad (aciertos, ver §2.5)**: el chip de scope y los KPIs sí se ven *diseñados*, no default.

---

### 2.5 · Lo que está bien — no tocar

- **Chip de scope con color por rol** (`OpScopeChip`, `components/ui/dashboard/OpScopeChip.tsx`): navy por defecto, **rojo `superadmin`** cuando el admin opera en superficie de gobierno (verificado: render `/gob/*` muestra `SUPERADMIN · UNIVERSAL` en rojo), teal para org, `neutral` como chrome secundario que no compite con el H1. Señal de seguridad intencional y correcta para "admin con acceso a gobierno".
- **KPIs con tono por target** (`OpKpi` + `toneForTarget`, `lib/metrics`): la tarjeta verde "Decisiones 7d" es semántica (target), no decorativa. `AdminKpiStrip` es fuente única para evitar que `/admin` y `/admin/sistema` deriven.
- **A11y de estado por icono+texto** (`OpStateBadge`): el significado no depende solo del color (WCAG 1.4.1).
- **Guardas ya existentes**: `lint:tokens` (`scripts/check-design-tokens.ts`) y `lint:ui` — el lugar natural para hacer cumplir la nueva capa `--st-*` / `OpButton`.

---

## 3. Technical handoff (para Claude Code)

Tres PRs scopeados, en convención del repo (cada uno: archivos · cambio concreto · guardas · tests). Independientes salvo el orden semántico F1→F2→F3.

### PR-1 — Capa semántica de estado `--st-*` (cubre F1)
**Archivos:** `app/globals.css` (definir tokens + override por contexto operador) · kit `Op*` y `Ln*` que hoy referencian `ln-(op-)ok/warn/err/viol`.
**Cambio:**
1. Añadir en `@theme` los nombres `--color-st-ok/warn/err/info` mapeados a la piel cálida (valores actuales).
2. Re-mapear los mismos nombres a `ln-op-*` bajo el contexto operador (wrapper `.op-surface` o el layout de `/admin` y `/gob`).
3. Reapuntar componentes de estado a `st-*` (no cambia el render; sólo la indirección).
4. **Quick-wins dentro de PR-1:** verificar contraste de `ln-op-warn #9c6700` y `ln-op-danger #b71c1c` sobre sus `*-bg`, registrar en `docs/a11y/contrast-audit.md`; colapsar `ln-violeta`/`ln-op-viol` si conviven sin razón.
**Guardas:** extender `scripts/check-design-tokens.ts` para preferir `st-*` en componentes de estado. **Tests:** snapshot de `LnBadge`/`OpPill`/`CaseStatusBadge` antes/después (sin diff visual en cálida).

### PR-2 — Unificar gramática y geometría de badges (cubre F2)
**Archivos:** `components/ui/dashboard/{OpPill,CaseStatusBadge,OpStateBadge}.tsx`.
**Cambio:**
1. **Primero (bug):** alinear el mapa de tonos entre `OpPill` y `CaseStatusBadge` para `open`/`closed` (decidir la convención canónica — sugerido: `open`→ámbar/atención, `closed`→neutro/ok según el dominio — y aplicarla a ambos).
2. Extraer un primitivo `OpStatusPill` (geometría `rounded-[3px]`, `font-ln-mono`, tono por `data-tone` desde `st-*`); `CaseStatusBadge`/`OpStateBadge` pasan a ser wrappers semánticos.
3. Confirmar que `OpCodeBadge` se usa **solo** para códigos.
**Guardas:** test que afirme "mismo término → mismo tono" cross-componente. **Tests:** unit de cada wrapper (label + tono correcto).

### PR-3 — Primitivo `OpButton` + migración (cubre F3)
**Archivos:** nuevo `components/ui/dashboard/OpButton.tsx` · migrar `OpSubmitButton` (`OpField.tsx`), `OpBulkBar.tsx`, y los `<button>` crudos de `app/admin` + `app/gob` por módulo.
**Cambio:** `OpButton` espejo de `LnButton` con acento `ln-op-azul`, variantes `primary/ghost/danger/ok` + `sm/block`, radio único (`--radius-op-btn`). Fijar azul como primario; verde solo confirmación.
**Guardas:** regla `lint:ui` que marque `<button className=...>` nuevos en `app/admin`/`app/gob`. **Tests:** `OpButton` (variantes/estados/`disabled`/`loading`), migración incremental verificada por módulo.

---

## 4. Plan priorizado — quick-wins vs rediseños

**Quick-wins** (bajo riesgo, alto retorno; cabe en una sesión):

1. **Bug de semántica de color** `OpPill` vs `CaseStatusBadge` para `open`/`closed` (PR-2 paso 1). *Corrección, no rediseño.*
2. **Auditar contraste** `ln-op-warn` / `ln-op-danger` y registrar en `docs/a11y` (PR-1 paso 4).
3. **Colapsar violetas** duplicados (`ln-violeta` vs `ln-op-viol`).
4. **Migrar filtros de Casos** a `OpSelect` (F4).
5. **Nombres `--st-*` como alias** (sin cambiar valores) — habilita el resto sin diff visual.

**Rediseños** (multi-sesión, planificar):

1. **Rollout `--st-*` por piel** + reapuntar todo el kit de estado + guarda en `lint:tokens` (PR-1 completo).
2. **Primitivo de badge operador único** + wrappers semánticos (PR-2 completo).
3. **`OpButton` + migración de 133 botones** crudos por módulo (PR-3).

---

## 5. Verificación

- Tokens (`ln-ok/warn/err/rosa/violeta`, `ln-op-ok/warn/danger/viol` + `-bg/-bd`) leídos de `app/globals.css` (líneas 60–231).
- Componentes y formas verificados en `components/ui/{Badge,StatusFlag,Chip,Button}.tsx` y `components/ui/dashboard/{OpPill,OpStateBadge,CaseStatusBadge,OpCodeBadge,OpKpi,OpScopeChip,OpField,OpBulkBar}.tsx`.
- Conteos: `LnButton` en operador = 1 import; `<button>` crudos = 61 (`app/admin`) + 72 (`app/gob`) = 133; ~179 archivos consumen `ln-op-*`.
- Recorrido en vivo (sesión admin): `/admin` (KPIs), `/admin/casos` (badge "Abierto" verde), render `/gob/casos`→`/admin/casos` (scope universal compartido), chip de scope rojo en superficie `/gob`.
- Pendiente de ejecutar por quien implemente: `pnpm lint:tokens && pnpm lint:ui` tras cada PR; snapshot visual de la piel cálida para confirmar cero regresión.

---

*Referencia viva (actual vs propuesta): sección «08 · Oportunidades de mejora» del styleguide «Design System - Libreta Nacional». Insumo de Design: `docs/archive/Hallazgos Design System.md`.*
