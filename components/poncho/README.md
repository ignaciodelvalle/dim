# Poncho — DIM design system

> `components/poncho/*` is the in-repo design system for DIM / MiMAR. The
> name "Poncho" is internal — the UI itself doesn't surface it. This README
> exists so a future contributor (or AI agent) can recognize the
> conventions and pick the right primitive instead of inventing a new one.

The trilogy-unification work (`docs/superpowers/plans/2026-05-27-trilogy-unification-handoff.md`)
codified four cross-cutting UI rules; this README documents them alongside
the primitives that enforce them. The rules also live in
[`AGENTS.md` → Design rules (UI conventions)](../../AGENTS.md#design-rules-ui-conventions)
and the design critiques [`docs/design/08`](../../docs/design/08-design-critique-flow-unification-2026-05-27.md),
[`09`](../../docs/design/09-design-critique-owner-flows-2026-05-27.md),
[`10`](../../docs/design/10-design-critique-public-tiers-org-portal-2026-05-27.md).

If you are about to add a primitive, a flow, or a CTA: read the four
**Cross-cutting rules** first. They are non-negotiable.

---

## Cross-cutting rules

### 1. Two levels of location capture (L1 / L2)

| Mode | Captures | Used when | Component |
| --- | --- | --- | --- |
| **L1** | Jurisdiction only — province derived from a single locality autocomplete against `ar_localities` | Downstream queries are jurisdiction-bounded but the exact point doesn't matter — owner upgrade, clinical/vet events, foster availability. | `<LocationFields mode="l1">` |
| **L2** | Nominatim address autocomplete + map confirmation + derived jurisdiction (province, locality, lat/lng filled in one pick) | "Where" matters as a coordinate — denuncia, MarkLost last-seen, org-side incident reports. | `<LocationFields mode="l2">` |

L3 (delivery-grade postal address) is **collapsed into L2** — no separate
mode. Critique-direcciones-2026-05-27 §Opción B closed the L3 fantasma:
L2 already carries address text plus coordinates. Never invent a third
mode; if a flow seems to need one, raise it in design rather than
forking a variant.

### 2. Four verbs for primary buttons

CTAs MUST use one of these verb shapes, in priority order:

1. **`Continuar`** — intermediate step inside a wizard (no commit yet).
2. **`Confirmar X`** — definitive, hard-to-reverse action ("Confirmar cierre de medicación", "Confirmar reemplazo de chip").
3. **`Crear X`** — creation that produces a new persistent object the user controls ("Crear consultorio", "Crear servicio").
4. **Domain verb + object** when 1–3 don't fit ("Registrar vacuna", "Publicar adopción", "Reportar mordedura", "Marcar como perdida"). Never bare ("Aceptar", "Guardar", "Publicar" alone).

`Registrar X` is reserved for logging an observable event. `Confirmar X`
is reserved for definitive actions. Closing a treatment is
`Confirmar cierre`, not `Registrar fin`.

### 3. `WizardShell` is the only multi-step chrome

Multi-step flows (≥3 sections, or ≥1 destructive step) MUST use
[`Wizard/WizardShell`](./Wizard/WizardShell.tsx). The shell owns the back
arrow, the step counter, the progress bar's a11y label, and the optional
cancel link. Step labels and submit-button copy are caller-supplied;
consumers don't re-implement the chrome.

Two-screen flows (form + confirm) do **not** get a wizard. Use a single
page with a confirm dialog or [`SuccessScreen`](./SuccessScreen.tsx).

### 4. `SuccessScreen` closes "trámite" flows

Denuncia, adoption application, intake, devolución, mordedura, and
similar bureaucratic flows MUST end on [`SuccessScreen`](./SuccessScreen.tsx).
The screen surfaces the confirmation code, a short description of what
happens next, and 2–3 contextual actions. Silent redirects after the
final submit are forbidden for these flows — the user must see the
receipt.

Lightweight inline edits (toggle, save profile field) keep an inline
[`toast`](./Toast.tsx) confirmation; `SuccessScreen` is for full
trámites only.

---

## Primitives

### Chrome

- [`Layout/AppHeader`](./Layout/AppHeader.tsx),
  [`Layout/AppFooter`](./Layout/AppFooter.tsx),
  [`Layout/Sidebar`](./Layout/Sidebar.tsx),
  [`Layout/Topbar`](./Layout/Topbar.tsx),
  [`Layout/HeaderNav`](./Layout/HeaderNav.tsx),
  [`Layout/MobileDrawer`](./Layout/MobileDrawer.tsx),
  [`Layout/MobileMenu`](./Layout/MobileMenu.tsx),
  [`Layout/GobStripe`](./Layout/GobStripe.tsx) —
  app shell pieces. Nav structure is data-driven via
  [`Layout/nav-presets`](./Layout/nav-presets.ts).
- [`Crumbs`](./Crumbs.tsx) — breadcrumbs.

### Forms & flows

- [`Field`](./Field.tsx) — label + control + help/error wrapper. Use the
  render-prop API so the inner control receives `id`, `aria-describedby`,
  and `invalid` already wired. Replaces the boilerplate `<label htmlFor>`
  + `<input>` + manual `aria-describedby` pattern in every form.
- [`Input`](./Input.tsx) — 44px height, 10px radius, Poncho `_forms.scss`
  spec. Pass `invalid={invalid}` from the Field render-prop to get the
  danger border + `aria-invalid="true"`.
- [`Textarea`](./Textarea.tsx) — same border/padding pattern, `min-h-24` +
  `resize-y` so users can expand for long inputs.
- [`Select`](./Select.tsx) — native `<select>` with consistent chevron
  (inline SVG bg-image) cross-browser.
- [`Fieldset`](./Fieldset.tsx) — `<fieldset><legend>` wrapper for grouped
  controls (radios, checkbox groups). Same help/error/required surface as
  `<Field>`, but with the canonical HTML grouping element so screen
  readers announce the group label on each child.
- [`Checkbox`](./Checkbox.tsx),
  [`Radio`](./Radio.tsx) — native checkbox/radio with Poncho identity
  (`accent-gob-primary`). Self-contained: the label is `children` and
  the component renders the `<label>` wrapper. Use inside `<Fieldset>`
  for grouped controls, or standalone for single toggles (e.g. "Acepto
  los términos").
- [`Wizard/WizardShell`](./Wizard/WizardShell.tsx) — multi-step chrome (rule §3).
- [`SuccessScreen`](./SuccessScreen.tsx) — trámite closer (rule §4).
- [`Button`](./Button.tsx) — primary button. Use the four verbs from rule §2.
- [`Sheet`](./Sheet.tsx) — bottom-sheet / side-sheet for non-trámite confirmations.
- [`Photo`](./Photo.tsx) — placeholder + image with status badge.

#### Form primitive — usage

```tsx
<Field label="Email" help="Te lo pedimos para enviarte el código" required>
  {({ id, describedBy, invalid }) => (
    <Input
      id={id}
      type="email"
      aria-describedby={describedBy}
      invalid={invalid}
      value={email}
      onChange={(e) => setEmail(e.target.value)}
    />
  )}
</Field>
```

When `error` is set on `<Field>`, the help text is hidden, the error
renders with `role="alert"`, and `invalid` flips to `true` (which the
control passes to `aria-invalid` + the danger border). No manual ARIA
wiring needed in the consumer.

For grouped controls use `<Fieldset>` instead — same surface, but a
`<fieldset><legend>` underneath:

```tsx
<Fieldset legend="Procedimiento" required error={state.procedureError ?? undefined}>
  <Radio name="procedure" value="castration" required>Castración</Radio>
  <Radio name="procedure" value="spay">Ovariectomía</Radio>
</Fieldset>

<Fieldset legend="Vacunas aplicadas" help="Marcá las que correspondan">
  <Checkbox name="vaccines" value="rabies">Antirrábica</Checkbox>
  <Checkbox name="vaccines" value="parvo">Parvovirus</Checkbox>
</Fieldset>
```

A standalone terms checkbox doesn't need a Fieldset:

```tsx
<Checkbox name="terms" required>Acepto los términos y condiciones</Checkbox>
```

### Feedback & state

- [`Toast`](./Toast.tsx) — sonner-backed toast. Mount `<Toaster />` once
  in `app/layout.tsx`; use `toast.success(...)` / `toast.error(...)` /
  `toast.info(...)` everywhere. Default 4s, errors 7s.
- [`Alert`](./Alert.tsx) — inline banner (info, warning, danger, success).
- [`EmptyState`](./EmptyState.tsx) — first-load empty surfaces.
- [`ErrorBoundary`](./ErrorBoundary.tsx) — used by every route-group
  `error.tsx` (`app/error.tsx`, `app/(app)/error.tsx`, `app/org/[orgToken]/error.tsx`,
  `app/gob/error.tsx`, `app/p/[publicToken]/error.tsx`). Renders a friendly
  fallback with **Reintentar** and **Volver al inicio**; surfaces
  `error.digest` in prod and the full stack in dev.

### Surfaces & data

- [`Panel`](./Panel.tsx) — bordered surface with optional header.
- [`Tabs`](./Tabs.tsx) — accessible tab list.
- [`Badge`](./Badge.tsx) — status chip.
- [`ReminderCard`](./ReminderCard.tsx) — pet-health reminder row.
- [`MetricCard`](./MetricCard.tsx) — dashboard KPI tile.

### Charts & analytics

- [`TimeSeriesChart`](./TimeSeriesChart.tsx) — line / area chart.
- [`MapChoropleth`](./MapChoropleth.tsx) — region-shaded map.
- [`JurisdictionSwitcher`](./JurisdictionSwitcher.tsx) — province / locality scope.
- [`PeriodPicker`](./PeriodPicker.tsx) +
  [`DateRangePicker`](./DateRangePicker.tsx) — time-range controls.

Everything is re-exported from [`index.ts`](./index.ts). Prefer
`import { … } from "@/components/poncho"` over deep paths.

---

## The Tier system (public surfaces)

The public-facing credential has **five tiers** of visibility, each with
its own page or page-state. Internal components/refs reference these
tiers verbatim — get the labels right.

| Tier | What you see | Where |
| --- | --- | --- |
| **Tier 0** | Public credential, minimal — name, species, photo, "Reportar avistaje" CTA. | `app/p/[publicToken]/page.tsx` |
| **Tier 0+** | Tier 0 + sticky emergency banner while pet is marked lost (mobile-only). | Same page when status is `lost`. |
| **Tier 1** | Anonymous sighting form — `app/p/[publicToken]/sighting/page.tsx`. |  |
| **Tier 2** | Owner-issued share-link — full libreta with redacted personal info — `app/libreta/compartir/[shareToken]/page.tsx`. Terminal states (revoked / expired / deceased) reuse `TerminalShell` with pet context. |  |
| **Tier 3** | Authenticated owner libreta (`app/(app)/mis-mascotas/[publicToken]`). |  |
| **Tier 4** | Org-context full record — for the org currently holding custody. |  |

Tier-0/0+/1 surfaces are unauthenticated and follow a stricter "less is
more" copy posture. Tier-2 expects pet context (name, photo) on its
terminal states so the visitor knows whose link they were given.

---

## Adding a new primitive

1. Read this README and `AGENTS.md` → "Design rules" before designing the API.
2. Match an existing pattern: client component, named export, full type
   exports from `index.ts`.
3. Use Poncho tokens (`gob-primary`, `gob-text`, `gob-text-muted`,
   `gob-surface-alt`, `gob-border`, `gob-success`, `gob-danger`, …) —
   never raw `text-zinc-*` or `bg-emerald-*` on new code.
4. Comments document the **why** and where the primitive is used — not
   what each prop does (TypeScript types already say that).
5. If the new primitive enables a new rule, update this README and
   `AGENTS.md` in the same PR. Mute exceptions are the path to drift.
