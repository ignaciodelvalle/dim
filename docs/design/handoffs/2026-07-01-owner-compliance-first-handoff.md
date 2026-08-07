# Design handoff — Owner "compliance-first" slice

> Date: 2026-07-01 · Skin: citizen (`ln-*` / `Ln*`) · Stack: Next.js 15 App Router, React 19, Tailwind 4, Drizzle/Supabase.
> Audience: Claude Code, implementing autonomously. This doc specifies exact tokens, component props, states, and edge cases so nothing is guessed.

## Read order (do this first)

1. **Why** — [`docs/design/2026-07-01-four-actor-lean-ia-critique.md`](../2026-07-01-four-actor-lean-ia-critique.md) §2 (owner = subject, comply-first).
2. **What / where** — [`docs/superpowers/specs/2026-07-01-owner-compliance-first-slice-handoff.md`](../../superpowers/specs/2026-07-01-owner-compliance-first-slice-handoff.md) (routes, projections, WS-1/2/3, open decisions D1–D4).
3. **This doc** — exact visual + interaction spec + the verification protocol at the end.

Then confirm the four open decisions in the slice handoff §7 are still: D1 yes (turno-reservado state) · D2 hide (PPP not-applicable) · D3 only vet/official events clear an obligation · D4 default lens `Todo`. Implement to those defaults unless told otherwise.

## Non-negotiables (the guardrails that keep CI green)

- **Reuse tokens and primitives. Add zero raw values.** No raw Tailwind palette, no `bg-[#…]`, no `text-[14px]`, no `dark:` — `lint:tokens` blocks them. If you reach for a new value, you're doing it wrong; use an existing `--color-ln-*` / `--text-*` / `--radius-*`.
- **Citizen skin only.** Do not touch `ln-op-*` / `Op*` / `/admin` / `/gob` / `/org`.
- **Spanish UI (es-AR, accents), English code.** `lint:ui` blocks visible English + SCREAMING_CASE + touch targets < 44px.
- **RSC boundary.** Interactivity (sheet open/close, tab switch) in `"use client"`; server actions stay `"use server"` async-only.
- **Append-only.** No screen edits/deletes an event; corrections use the existing `event_amended` path.

---

## Design tokens used (all already in `app/globals.css`)

| Token | Value | Usage in this slice |
|---|---|---|
| `--color-ln-ok` / `-ok-050` / `-ok-100` | `#2e7d4f` / `#eef6f0` / `#c8e2d2` | "Al día" badge text / fill / border |
| `--color-ln-warn` / `-warn-050` / `-warn-100` | `#96600e` / `#fdf2e0` / `#f0dcb4` | "Vence pronto" badge (AA-safe: 5.28:1) |
| `--color-ln-err` / `-err-050` / `-err-100` | `#c0392b` / `#fbe9e6` / `#f1c6bf` | "Vencida" badge |
| `--color-ln-celeste` / `-celeste-050` / `-celeste-100` | `#4e97d1` / `#eff6fc` / `#dcebf7` | "Turno reservado" (info) badge |
| `--color-ln-azul` / `-azul-700` | `#0e5a99` / `#0a4576` | Primary CTA (Programar turno), links |
| `--font-ln-serif` | IBM Plex Serif | Screen title (pet name / section h1) |
| `--font-ln-mono` | IBM Plex Mono | DIM token, microchip number, dates-meta |
| `--text-sm` / `-md` / `-base` / `-lg` | 12 / 14 / 16 / 18px | Meta / body / labels / card titles |
| `--radius-card` / `--radius-pill` | 16px / 9999px | Cards / badges + pills |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.06)` | Card lift (only if existing cards use it) |

Do not hardcode any hex above — reference the token. The values are listed only so you can verify contrast/intent.

---

## Components — reuse these exactly (no new primitives)

| Component | File | Variant / props to use | Where |
|---|---|---|---|
| `LnButton` | `components/ui/Button.tsx` | `variant: "primary"\|"ghost"\|"ok"\|"warn"\|"seal"`, `size: "sm"\|"md"\|"lg"`, `block` | CTAs. "Programar turno" = `primary` (azul), size `md`, `block` on card |
| `LnVstamp` | `components/ui/StatusFlag.tsx` | `variant: "ok"\|"due"\|"over"` → Vigente/Por vencer/Vencida | Antirrábica status stamp |
| `LnBadge` | `components/ui/Badge.tsx` | `variant: "success"\|"warning"\|"danger"\|"info"\|"neutral"` | Esterilización/Microchip/PPP + turno-reservado |
| `LnCard` / `LnCardHead` / `LnCardBody` | `components/ui/Card.tsx` | `LnCardHead{title,label,icon,actions}` | Panel container + per-obligation cards |
| `LnSheet` | `components/ui/Card.tsx` | `{tone:"azul", title, subtitle?, icon?, onClose, footer?, children}` | WS-2 intent fork (bottom sheet) |
| `ConfidenceBadge` | `components/event/ConfidenceBadge.tsx` | `{tier: ConfidenceTier}` — renders `confidenceLabel(tier)` | WS-3 provenance on each event row |
| `PetDetailTabs*` | `components/pet-profile/` | `TabKey: "resumen"\|"libreta"\|"vacunas"\|"historial"` | Tab host (see WS-1 label note) |

Data/projection helpers (call, don't reimplement): `getReminderVariant` + `deriveVaccineStatus` (vaccine state) · `resolveBusinessRule("ppp_breed_list", jurisdiction)` (PPP gate) · `computeConfidence`/`confidenceLabel` (provenance) · `isAmendableEventType`/`canAmendEvent` (correction affordance) · `LIBRETA_SANITARIA_EVENT_TYPES` (libreta lens) · `bookSlotAction(slotId, petId)` / `createVaccineReminderAction` (WS-2 targets). Add exactly one new helper: `lib/pet-compliance.ts` → `fetchComplianceState(pet)`.

---

## WS-1 · Compliance panel (leads the Resumen tab)

**Overview.** When an owner opens `/mis-mascotas/[publicToken]` (default `?tab=resumen`), the first thing they see is "Estado de cumplimiento": the pet's legal obligations as status badges. The libreta/full history moves below and into its own tab.

**Layout.**

- Container: existing pet page width; the panel is a single `LnCard` with `LnCardHead title="Estado de cumplimiento"` and a right-aligned `label` showing the aggregate (`3 de 4 al día`).
- Obligation grid inside `LnCardBody`: `grid` with `grid-template-columns: repeat(auto-fit, minmax(230px, 1fr))`, gap `12px`. Renders 2×2 on ≥768px, single column below.
- Card order: worst-status first (vencida → vence pronto → turno reservado → al día). Sort in `fetchComplianceState`.
- Tab label: keep `TabKey="resumen"` (no type change) but change the visible label from "Resumen" to "Cumplimiento" in `PetDetailTabs` (one-line copy change — the only tab churn).

**Per-obligation card content.**

| Obligation | Icon (Tabler-equivalent already in repo `Icon`) | Status source | Badge |
|---|---|---|---|
| Vacuna antirrábica | vaccine | `getReminderVariant(daysUntilDue,isReportable)` / `deriveVaccineStatus` | `LnVstamp` ok/due/over |
| Esterilización | shield-check | presence of `sterilization_performed` | `LnBadge success` "Registrada" / `neutral` "Sin registro" |
| Microchip | microchip | `microchip_implanted` / `pet_identifications` | `LnBadge success` "Registrado" + mono number |
| Atestación PPP | certificate | `dangerous_breed_attested` gated by `resolveBusinessRule("ppp_breed_list")` | `LnBadge success` "Firmada" / `warning` "Atestación requerida" |

Each card: title (`--text-md`, weight 500) + status badge (top-right) + one detail line (`--text-sm`, muted) + one 11px muted legal footnote (see slice handoff §5). Antirrábica card additionally shows the CTA (WS-2).

**States (per card).**

| State | Trigger | Visual |
|---|---|---|
| Al día | vaccine current / obligation met | `success` / `LnVstamp ok`, no CTA |
| Vence pronto | `due_soon` | `warning` / `LnVstamp due`, CTA "Programar turno" |
| Vencida | `overdue`/`overdue_critical` | `danger` / `LnVstamp over`, CTA "Programar turno" |
| Turno reservado | confirmed future vaccination appt (WS-2) | `info` (celeste), no CTA, microcopy about auto-clear |
| Sin datos | `unknown` | `neutral` "Sin datos", CTA "Registrar" → existing event form |
| No aplica (PPP only) | breed not on jurisdiction list | **card hidden** (D2 default) |

**Edge cases.**

- **No pets:** the panel doesn't render; use existing `LnEmptyState` from the pets registry (out of this card's scope).
- **Long provider/pet names:** truncate with ellipsis at one line; full value in `title` attribute.
- **Loading:** reuse the existing pet-page skeleton (`aria-busy`); the panel shows 4 skeleton cards.
- **Jurisdiction unknown:** if `resolveBusinessRule` can't resolve a jurisdiction, hide PPP (treat as not-applicable) and log — never block the panel.

**Accessibility.** Panel is a `section` with `aria-labelledby` the "Estado de cumplimiento" heading. Each badge conveys status with icon **and** text (never color alone — WCAG 1.4.1). Card CTA is a real `<button>`/`LnButton`, ≥44px. Focus order: heading → card 1 (badge is static, CTA focusable) → card 2 … left-to-right, top-to-bottom.

---

## WS-2 · Turno flow (off the antirrábica card)

**Overview.** The antirrábica CTA forks the owner's intent, then hands off to existing routes. Result: the card enters "Turno reservado".

**Interaction sequence.**

1. `LnButton primary "Programar turno"` (on due/over card) opens `LnSheet` (`tone="azul"`, `title="¿Cómo querés ponerte al día?"`, `subtitle="La antirrábica es obligación del propietario · Ord. CABA 41.831"`, `onClose` restores focus to the CTA).
2. Sheet body: two option rows (reuse the row style from other `LnSheet` usages).
   - **"Reservar turno con un veterinario"** (recommended, `--color-ln-azul` accent) → navigate to `/turnos/buscar?service_kind=vaccination_rabies` with pet context (`&pet=<publicToken>`); the existing booking flow ends at `bookSlotAction(slotId, petId)` with `petId` pre-selected.
   - **"Solo recordármelo"** → `/mis-mascotas/[publicToken]/vacunas/programar` (`createVaccineReminderAction`). Does not clear the obligation.
3. On successful booking, returning to the pet page shows the antirrábica card in **Turno reservado** state: `LnBadge info` "Turno reservado", detail `mié 09/07 · 10:30 · <proveedor>`, microcopy (`--text-xs`, muted): *"Cuando el veterinario la aplique, se registra como evento y el estado pasa a Al día solo."*

**Derived-state rule (no migration).** In `fetchComplianceState`, left-join the pet's `appointments` where `status='confirmed'` and the offering `service_kind='vaccination_rabies'` and the slot is in the future → sets the antirrábica sub-state to `turno_reservado`, which takes precedence over `due`/`over` for display but not for compliance (still "not met" until the event fires).

**States & edge cases.**

| State | Behavior |
|---|---|
| Sheet open | `role="dialog"`, focus trapped, `Esc`/overlay-click closes via `onClose`, focus returns to CTA |
| Booking fails | existing `BookSlotResult` error surfaces on the booking page (unchanged) — do not swallow |
| Appointment cancelled | card reverts to prior due/over state on next load (derivation handles it) |
| Two obligations reserved | each card derives independently |
| Reminder-only chosen | card stays amber; a small "Recordatorio activo" note may appear (optional, `neutral`) |

**Motion.** `LnSheet` uses its built-in slide-up; respect `prefers-reduced-motion` (the primitive already does). Add no new animation.

**Accessibility.** Sheet: labelled by its `title`, focus-trapped, `Esc` closes. Option rows are `<button>`s, ≥44px, each with a clear accessible name ("Reservar turno con un veterinario"). Recommended option marked with text ("Recomendado"), not color alone.

---

## WS-3 · Historial provenance + immutability

**Overview.** The history tab (`?tab=historial`; `/historial` 308-redirects here) shows every event with its provenance and makes the append-only model legible.

**Layout & content.**

- Segment control at top: `Todo` (default, D4) vs `Libreta sanitaria` (`LIBRETA_SANITARIA_EVENT_TYPES`). Reuse existing pill/segment styling.
- Category filter chips row: Todos · Vacunas · Clínico · Identificación · Peso · Notas (client-side filter; `LnChip`).
- Immutability note (once, above the list, `--text-xs`, muted, lock icon): *"Los eventos no se editan ni se borran. Una corrección es un evento nuevo."*
- Event rows grouped by year (reverse-chronological). Each row: type icon + title + meta (`fecha · autor`) + **`ConfidenceBadge tier={computeConfidence(...)}`** on the right.
- Amended event: show `Corregido · ver original` (link opens the original event, which is preserved). Gate any "Corregir" affordance with `canAmendEvent`.
- Footer: "Descargar libreta sanitaria (PDF)" — the official export (`LnButton ghost`).

**States & edge cases.**

| Case | Behavior |
|---|---|
| Empty history | `LnEmptyState` "Todavía no hay eventos" |
| Loading | existing skeleton rows, `aria-busy` |
| Very long history | keep it simple: render all (owner pets rarely exceed dozens); do not add nested scroll |
| Provenance tiers | reuse `confidenceLabel` for all 5 tiers — verify it returns es-AR for each; if a tier lacks a label, add it in `lib/event-confidence.ts` (no new component) |
| Filter yields nothing | inline "Sin eventos de este tipo" |

**Accessibility.** Timeline is a `<ul>`/list; each row a `<li>`. Segment control uses `role="tablist"`/buttons with `aria-pressed`/`aria-selected`. `ConfidenceBadge` already carries text. Filter chips are toggle buttons with `aria-pressed`.

---

## Responsive behaviour (all three screens)

| Breakpoint | Changes |
|---|---|
| Desktop (≥1024px) | Compliance grid 2×2; sheet centered/anchored per `LnSheet` default |
| Tablet (768–1024px) | Compliance grid still 2 columns via `auto-fit minmax(230px)` |
| Mobile (<768px) | Compliance cards stack to 1 column; sheet is full-width bottom sheet; **test 320px** (per critique U3): no horizontal scroll, CTAs ≥44px, badges wrap not truncate |

---

## Verification protocol — CC must self-run before declaring done

**Gate 0 — full verify, every iteration (not at the end):**

```
pnpm verify   # typecheck + lint + lint:tokens + lint:ui + lint:authz + lint:deps + lint:rls + lint:actions + lint:lib-root + build
```

A `lint:tokens`/`lint:ui` failure means the approach used a raw value or sub-44px target — fix the approach, not the lint.

**Gate 1 — new unit tests (pure, table-driven, mirror `lib/libreta-sanitaria.test.ts`):**

- `lib/pet-compliance.test.ts`: each obligation's state incl. the `turno_reservado` derivation; PPP hidden when breed not on jurisdiction list; **D3 — a `self_reported` rabies event does NOT flip the badge to "al día"; only `professional_verified`/`institutional_verified` do.**
- confidence display: `confidenceLabel` returns an es-AR string for all 5 tiers.

**Gate 2 — e2e updated, not weakened:**

```
pnpm exec playwright test e2e/owner-shell.spec.ts e2e/create-pet.spec.ts
```

Re-point selectors to the compliance panel; keep assertion strength. Re-run `cross-tenant-isolation.spec.ts` and `auth.spec.ts` (should stay green).

**Gate 3 — visual QA (attach screenshots):** each screen at 320 / 768 / 1280px. Confirm every interactive target ≥44px, every status shows icon+text (color-independent), new text passes AA contrast (the tokens above are pre-audited; new combinations are not).

**Gate 4 — high-stakes checks via a separate verification subagent:** spawn a fresh agent to (a) run the cross-tenant e2e and RLS coverage (`__tests__/rls/coverage.test.ts`), (b) diff rendered output against the "Acceptance" clauses in the slice handoff, (c) confirm no PII in any new `payload->>` read. Don't let the authoring session be the sole certifier.

**Definition of done (CC self-checklist):** `pnpm verify` green · new unit tests added & passing · e2e updated & green · screenshots at 3 widths attached · zero new token/hex/px/`dark:` · all copy es-AR with accents · D1–D4 implemented to defaults · libreta export still produces the official subset.

## Out of scope (do not do here)

Vet/org/govt surfaces · the owner nav re-rank (7→3+bell, separate change) · any new event type, appointment status, or color token · the free-municipal-campaign offering · the RLS-backstop security work (separate Wave-A handoff).
