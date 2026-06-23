# Plan: Ciclo de población/custodia — affordance de nav *deferred* (admin)

> **Para Claude Code — ejecución 100% autónoma.** Hace **visible** en la IA del perfil **admin** (scope universal)
> el hueco de la North Star — el *ciclo de población/custodia* casi sin proyectar (ver
> [`specs/2026-06-23-dashboards-vnext-roadmap.md`](../specs/2026-06-23-dashboards-vnext-roadmap.md) §1) — **sin construir
> los dashboards todavía**. Se agrega un estado `deferred` al modelo de nav y dos entradas no-interactivas, estilo
> "Próximamente", al riel admin. Las consolas reales (Paquetes F/G del roadmap) quedan **diferidas**.
> Severidad de los ítems: 🔴 correctitud/seguridad · 🟡 fricción/UX · 🟢 polish. **SDD test-first** (AGENTS.md), docs en el mismo PR.
>
> **Antes de tocar código, leer:** (1) el slim index de [`AGENTS.md`](../../../AGENTS.md) (~1.5k tokens) y la
> sección [§ Design rules → 5. `AppShell`](../../../AGENTS.md#5-appshell-is-the-single-role-variant-application-chrome-item-7--complete)
> (el chrome operador y la regla "nav source = `nav-presets.ts`, sin literales por componente"); (2) la spec del roadmap
> vNext linkeada arriba (§1 estados faltantes, §2 paquetes E/F/G/H); (3) este plan entero antes de abrir el PR.

## Por qué (contexto del critique)
La crítica del perfil admin (2026-06-23) concluyó que las proyecciones cubren bien **vigilancia sanitaria** y
**bienestar/fiscalización**, pero el **ciclo de población/custodia — la North Star del producto — está casi sin
representar**: `petStatusEnum` solo tiene `active|lost|deceased`; custodia-refugio, foster/tránsito, pipeline de
adopción y, sobre todo, **control poblacional (esterilización vs natalidad)** son *schema-ready, UI deferred*
(comentario literal en `db/schema.ts:315`). La decisión de producto es **no** construir esos dashboards ahora pero
**sí** dejar el hueco legible en la navegación, para que el operador (y el pitch a Mi Argentina) vea que el ciclo
existe en la hoja de ruta. El mecanismo: botones *deferred* (greyed, no-clickeables, "Próximamente").

## Decisiones tomadas (no relitigar)
1. **No se construyen las consolas reales** (Paquetes F/G). Este plan entrega **solo** el affordance de nav + el modelo
   `deferred`. La implementación de los dashboards se hace después, cross-ref a `specs/2026-06-23-dashboards-vnext-roadmap.md`.
2. **Dos entradas, no cuatro.** `Censo` y `Población` ya viven como páginas (`/admin/censo`, `/admin/poblacion`) y
   `Adopciones` existe como KPI de tasa. Las **dos** entradas nuevas representan lo genuinamente ausente:
   **Control poblacional** (⭐ Paquete G) y **Custodia & tránsito** (Paquete F: shelter-custody + foster, distinto de la
   tasa de adopción ya viva). Si más adelante se quiere más granularidad (foster aparte, devoluciones), se agrega ahí.
3. **Solo admin en este plan.** El roadmap dice admin **y** gob (jurisdiction-scoped). La paridad en `GOB_NAV_SECTIONS`
   se difiere hasta que aterricen las consolas reales — se anota como follow-up, no se ejecuta acá.
4. **El `deferred` es un estado de presentación del nav, no una ruta.** Las entradas deferred **no** tienen ruta real,
   **no** se registran en el middleware, **no** aparecen en breadcrumbs/omnibox, y **nunca** matchean como "activas".
5. **Cross-ref — no rehacer acá:** la consolidación de las tres puertas analíticas (`/admin/panorama` ·
   `/gob/analytics` · sección Analítica) y el "vista universal desde Gobierno" badge del cruce de portal son hallazgos
   **separados**, ya trackeados (consolidación: [`2026-06-22-gob-analytics-retirement.md`](./2026-06-22-gob-analytics-retirement.md)).
   No tocarlos en este PR.

## Cómo verificar las ubicaciones
Anclar por **símbolo + quote**, no por número de línea (los `:NN` son pistas; el código se mueve). Confirmar con
`grep`/`Read` antes de editar. Para ver el riel admin con datos reales correr `pnpm seed:panorama`
([`2026-06-21-panorama-demo-dataset.md`](./2026-06-21-panorama-demo-dataset.md)).

---

## Alcance — un solo PR

Rama sugerida: `feat/nav-deferred-population-cycle`. SDD test-first. `pnpm verify` (tsc + Biome + lint:tokens +
lint:ui + next build) + `pnpm test` verdes, cero regresiones sobre el baseline. Snapshots de nav actualizados en el
mismo commit.

### Hallazgos / cambios

| # | Cambio | Sev | Ubicación / evidencia | Detalle |
|---|---|---|---|---|
| **D1** | Extender el modelo de nav con `deferred` | 🟡 | `components/layout/HeaderNav.tsx` (`export type NavItem`) | Campo opcional `deferred?: boolean`. Sin él, los renderers se comportan idéntico (back-compat total). |
| **D2** | Render no-interactivo en el riel | 🟡 | `components/ui/dashboard/OpRailNav.tsx` (`NavLink`) | Si `item.deferred` → `<span>` (no `<Link>`), `aria-disabled="true"`, fuera del tab order, color mute + `cursor-not-allowed`, pill "Próximamente" (texto, no solo color). |
| **D3** | Paridad en el drawer mobile | 🟡 | `components/ui/dashboard/OpMobileDrawer.tsx` (map de items) | Mismo tratamiento que D2 — el drawer espeja el riel (regla AppShell). |
| **D4** | `isActive` nunca matchea deferred | 🟡 | `OpRailNav.tsx` (`isActive`) + drawer (`isActive`) | Guard: `if (item.deferred) return false;`. Los sentinels `#…` no pueden quedar resaltados. |
| **D5** | Dos entradas deferred en el riel admin | 🟡 | `components/layout/nav-presets.ts` (`ADMIN_NAV_SECTIONS`, sección "Analítica") | Al final de la sección, tras los ítems vivos: **Control poblacional** y **Custodia & tránsito**. |
| **D6** | Invariantes + snapshots de nav | 🔴 | `components/layout/nav-presets.test.ts`, `lib/shell-nav-phase-b.test.ts`, `lib/shell-nav.test.ts` | Tests de que deferred no rompe los invariantes existentes (ningún href vivo perdido; deferred excluido del set "live route"). Actualizar snapshots. |
| **D7** | Test del render deferred | 🔴 | `components/ui/dashboard/OpRailNav.test.tsx` (nuevo o extendido) | Deferred → `<span>` sin `href`, `aria-disabled`, no focuseable, con "Próximamente"; vivo → `<Link>` con `href`. |

---

## Detalle técnico

### D1 — `NavItem.deferred`
`components/layout/HeaderNav.tsx`:

```ts
export type NavItem = {
  href: string;
  label: string;
  matchPrefix?: string;
  /** Optional numeric badge overlaid on the nav item (e.g. breach count). */
  badge?: number;
  /**
   * Deferred (not-yet-built) destination. Rendered as a non-interactive, muted
   * "Próximamente" affordance — visible in the IA so the population/custody
   * roadmap gap (vNext §1) is legible, but carries NO live route: no <Link>, no
   * middleware entry, no breadcrumb/omnibox resolution, never "active".
   * See plan 2026-06-23-population-cycle-deferred-nav-handoff.md.
   */
  deferred?: boolean;
};
```

`href` sigue siendo requerido (es la React-key y el identificador del item). Para entradas deferred usar un **sentinel
de anchor** que jamás matchee una ruta real ni una regla 308: prefijo `#defer-…` (ver D5). Nunca llega al server.

### D2 — riel (`OpRailNav.tsx` → `NavLink`)
Branch al principio de `NavLink`:

```tsx
if (item.deferred) {
  return (
    <span
      aria-disabled="true"
      className={[
        "flex min-h-11 items-center gap-2.5 rounded-[5px] px-[9px] py-[8px]",
        "text-[12.5px] -ml-0.5 border-l-2 border-transparent",
        "text-ln-op-rail-mute cursor-not-allowed select-none",
      ].join(" ")}
    >
      <span className="flex-1 truncate">{item.label}</span>
      <span className="inline-flex items-center rounded-[3px] border border-[rgba(255,255,255,0.18)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-ln-op-rail-mute">
        Próximamente
      </span>
    </span>
  );
}
```

Notas:
- **`<span>`, no `<Link>` ni `<button>`** → no navega y no es focuseable por defecto (no agregar `tabIndex`). Cumple
  "no es un dead-end clickeable" mejor que un `<a aria-disabled>` (que algunos lectores igual anuncian como link).
- **`aria-disabled="true"`** anuncia el estado. El texto "Próximamente" da la señal sin depender de color (Ley 26.653;
  regla "estado no-solo-color" del Wave 2 Item 11).
- Usar el **token** `text-ln-op-rail-mute` (no un hex nuevo) — `lint:tokens` lo exige. No inventar color.
- **No** renderizar `badge` en items deferred.

### D3 — drawer (`OpMobileDrawer.tsx`)
El map de `section.items` hoy devuelve siempre un `<Link>`. Agregar el mismo branch `if (item.deferred)` que en D2
(mismo markup, mismos tokens) antes de construir el `<Link>`. El drawer debe espejar el riel exactamente.

### D4 — `isActive`
En `OpRailNav.tsx` y en el `isActive` del drawer, primera línea:

```ts
if (item.deferred) return false;
```

Garantiza que un sentinel `#defer-…` nunca quede con `aria-current="page"` ni con la clase activa.

### D5 — entradas en `ADMIN_NAV_SECTIONS`
En `components/layout/nav-presets.ts`, sección `label: "Analítica"`, **al final** de `items` (tras `Población`), para
que la sección lea: analítica viva primero, luego el ciclo de población *próximamente*:

```ts
// Ciclo de población/custodia — North Star, UI deferred (vNext §1).
// Botones visibles-pero-diferidos: la consola real (Paquetes F/G) se construye
// después. href sentinel `#defer-…` → nunca es ruta, nunca matchea 308.
{ href: "#defer-control-poblacional", label: "Control poblacional", deferred: true }, // ⭐ Paquete G
{ href: "#defer-custodia-transito", label: "Custodia & tránsito", deferred: true },   // Paquete F
```

`ADMIN_NAV_FLAT` deriva de `ADMIN_NAV_SECTIONS` con `flatMap`, así que las entradas fluyen solas. **No** agregar
literales en ningún componente (regla AppShell: nav source única = `nav-presets.ts`).

### D6 — invariantes y snapshots
1. **`components/layout/nav-presets.test.ts`** — agregar un `describe("ADMIN_NAV_SECTIONS deferred")`:
   - La sección "Analítica" contiene exactamente 2 items con `deferred === true`, labels `Control poblacional` y
     `Custodia & tránsito`.
   - Todo item con `deferred` tiene `href` que empieza con `#` (sentinel) y **ningún** item vivo (`!deferred`) usa un
     href `#`.
   - Si existe el invariante "ningún href de `ADMIN_NAV_SECTIONS` matchea una regla 308" (introducido en AC3): **filtrar
     los deferred** antes de chequearlo (un `#…` no es ruta). Ajustar el helper para excluir `item.deferred`.
   - Conteos por sección: si hay un test de "N items en Analítica", subirlo a N+2.
2. **`lib/shell-nav-phase-b.test.ts` + `lib/shell-nav.test.ts`** — `resolveShellNav` no debe cambiar de comportamiento
   (las deferred no son role-home ni afectan la resolución de variante/nav). Re-generar los snapshots que serialicen
   `ADMIN_NAV*`. Verificar a mano el diff: solo deben aparecer las 2 entradas nuevas con `deferred: true`.

### D7 — test de render (`OpRailNav.test.tsx`)
Nuevo archivo (o extender si ya existe uno para el riel):
- **Item deferred** renderiza un `<span>` **sin** atributo `href`, con `aria-disabled="true"`, **no** focuseable
  (`element.tabIndex === -1` o ausencia de rol interactivo), y contiene el texto `Próximamente`.
- **Item vivo** sigue renderizando un `<a href="…">` (Next `<Link>`).
- **`isActive`**: con `pathname` igual al sentinel, el item deferred **no** lleva la clase activa ni `aria-current`.
- A11y: la señal de estado es textual (`Próximamente`), no solo color — assert de que el texto está presente.

> renderToStaticMarkup de recharts no aplica acá; el riel es markup plano, render con `@testing-library/react` directo.

---

## Edge cases / qué NO romper
- **Middleware / 308:** los sentinels `#defer-…` son anchors de cliente; nunca golpean el server, así que no entran en
  conflicto con las reglas 308 de `/admin/{cola,usuarios,organizaciones}`. El único punto a tocar es el **test** de
  invariante (D6.1), no el middleware.
- **Breadcrumbs / omnibox:** como no hay navegación, `OperatorBreadcrumbs` y `OpOmnibox` nunca reciben un sentinel.
  No requieren cambios. (Confirmar que ningún test de breadcrumbs itera `ADMIN_NAV_FLAT` esperando rutas resolvibles;
  si lo hace, filtrar `deferred`.)
- **Back-compat:** sin `deferred`, ambos renderers son byte-idénticos al actual (el branch es aditivo). Los items vivos
  no cambian de markup → no debería moverse ningún otro snapshot.
- **Tokens:** prohibido hex nuevo. Usar `text-ln-op-rail-mute` y los `rgba(255,255,255,…)` ya presentes en el archivo.

## Follow-ups diferidos (no en este PR, anotar en el roadmap)
1. **Paridad GOB:** replicar las entradas en `GOB_NAV_SECTIONS` cuando aterricen las consolas (jurisdiction-scoped).
2. **Construir las consolas reales:** ⭐ Paquete G (control poblacional) y Paquete F (custodia/adopción) — cross-ref
   `specs/2026-06-23-dashboards-vnext-roadmap.md` §2. Al construir cada una: cambiar `deferred: true` → `href`/`matchPrefix`
   reales, agregar la ruta, el breadcrumb y (gob) el scope. Es un cambio aditivo de una línea por entrada.
3. **Consolidación analítica** (tres puertas) — `2026-06-22-gob-analytics-retirement.md`.

## Definition of done
- [ ] `NavItem.deferred` agregado y documentado (D1).
- [ ] Riel + drawer renderizan deferred como `<span>` mute, `aria-disabled`, "Próximamente", no-focuseable (D2/D3).
- [ ] `isActive` excluye deferred en ambos renderers (D4).
- [ ] Dos entradas en la sección Analítica de `ADMIN_NAV_SECTIONS` (D5).
- [ ] Invariantes + snapshots actualizados; el invariante 308 excluye deferred (D6).
- [ ] Test de render deferred verde (D7).
- [ ] `pnpm verify` + `pnpm test` verdes; diff de snapshots = solo las 2 entradas nuevas.
- [ ] Este plan referenciado desde `docs/superpowers/README.md` (fila nueva en la tabla de plans).
