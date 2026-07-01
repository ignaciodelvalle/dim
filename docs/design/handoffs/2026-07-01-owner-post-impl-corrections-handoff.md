# Design handoff — Owner slice, post-implementation corrections

> Date: 2026-07-01 · Skin: citizen (`ln-*` / `Ln*`) · Applies **on top of** commits `6a362ec5` (compliance-first pet profile) and `840aaf02` (owner nav re-rank). Additive — do not revert those.
> Source: read-only design critique of the shipped code (2026-07-01). Four items, all decided by the product owner. No architecture changes, no new color tokens, no migration.

## Read order

1. This doc. 2. The original slice handoff [`docs/superpowers/specs/2026-07-01-owner-compliance-first-slice-handoff.md`](../../superpowers/specs/2026-07-01-owner-compliance-first-slice-handoff.md) for context. 3. The design handoff [`2026-07-01-owner-compliance-first-handoff.md`](./2026-07-01-owner-compliance-first-handoff.md) for tokens/props.

Decisions already made (build to these, don't re-ask): **H1** self-reported events do NOT clear a legal obligation · **H2** nav item label = "Mis mascotas" → `/inicio`, no new screens · **H3** curated es-AR event detail (no raw JSON) · **H4** compliance panel becomes credential-style cards.

Guardrails unchanged: reuse tokens/primitives (no raw hex/px, no `dark:`), citizen skin only, es-AR copy with accents, RSC boundary, append-only. Run `pnpm verify` every iteration.

---

## H1 · Provenance must gate compliance (🔴 the important one)

**Problem.** `deriveComplianceState` clears an obligation on mere event *presence* — `hasEvent(events, "sterilization_performed")`, `microchipCode` present, rabies currency from a reminder — regardless of who authored the event. A self-reported sterilization/vaccine shows "Registrada / Vigente / al día". The panel makes a *legal* claim, so it must be at least as honest as the historial beside it (which already shows provenance).

**Rule (decided).** An obligation counts as met (`tone: "ok"`) **only** when the event that satisfies it clears confidence tier `professional_verified` or `institutional_verified` (`lib/event-confidence.ts` → `computeConfidence`). A satisfying event that is `self_reported` / `corroborated` / `unverified` shows a distinct state **"Declarada · sin verificar"** (`tone: "neutral"`), does **not** count toward "N de M al día", and carries a hint to get it verified. Absent event → "Sin registro" as today.

**Files & changes.**

- `lib/projections/pet-compliance.ts`
  - Extend `ComplianceEvent` to carry provenance: `authorRole?: string; authorVerified?: boolean; authorOrganizationId?: string | null;` (the exact `ConfidenceInput` fields).
  - Add a pure helper: `clearsObligation(e: ComplianceEvent): boolean` = `["professional_verified","institutional_verified"].includes(computeConfidence({ authorRole: e.authorRole ?? "", authorVerified: e.authorVerified ?? false, authorOrganizationId: e.authorOrganizationId ?? null, payload: (e.payload ?? {}) as Record<string, unknown> }))`.
  - Add `ObligationCard.hint?: string | null` for the es-AR verify nudge.
  - `deriveSterilization`: find the `sterilization_performed` event. Present + clears → `ok` "Registrada". Present but not cleared → `neutral` state "Declarada · sin verificar", `hint: "Pedile a tu veterinario que la registre para que cuente."`. Absent → `neutral` "Sin registro".
  - `deriveMicrochip`: prefer the `microchip_implanted` event's tier. Cleared → `ok` "Sí" (+ code detail). Code present but no cleared implant event → `neutral` "Declarada · sin verificar" + hint. None → "Sin registro".
  - `deriveRabies`: keep the reserved-turno and due/over branches unchanged. But the **"Vigente" (ok)** branch must be backed by a cleared establishing dose — if currency rests only on a non-cleared dose, return `neutral` "Declarada · sin verificar" (not "Vigente"), keeping the `dueAt` detail. Reminder-driven `due_soon`/`overdue` stay as-is (they signal "not met" already).
  - Summary already counts `tone === "ok"`; since "Declarada" is `neutral`, it correctly drops out of the count. No tone added.
- `app/(app)/mis-mascotas/[publicToken]/page.tsx` (~line 1052, the `deriveComplianceState({…})` call): thread `authorRole` / `authorVerified` / `authorOrganizationId` from the pet's typed event rows into each `ComplianceEvent` passed in (the rows already carry these — the historial uses them). Without this wiring H1 can't compute tier.

**Tests (`lib/projections/pet-compliance.test.ts` — add, table-driven).**

- self_reported `sterilization_performed` → state "Declarada · sin verificar", `tone: "neutral"`, NOT counted in `summary.ok`.
- vet-verified (`authorRole:"vet", authorVerified:true`) `sterilization_performed` → `ok` "Registrada", counted.
- rabies currency from a self_reported dose within date → NOT "Vigente" (neutral "Declarada · sin verificar").
- rabies currency from a professional_verified dose → "Vigente" `ok`.
- microchip code present but implant event self_reported → "Declarada · sin verificar".

---

## H2 · Nav label "Mis mascotas", minimal routing (🟡)

**Decision.** The first owner nav item reads "Mis mascotas" and points to `/inicio` (the home-registro that already lists pets + capture + vencimientos + compliance). Do **not** add `/mis-mascotas` as a nav peer — it stays only as the "ver todas (N)" overflow reached from `/inicio`. Net screens: unchanged.

**Files & changes.**

- `components/layout/nav-presets.ts` → `OWNER_NAV`: item 1 `label: "Cumplir"` → `label: "Mis mascotas"`; keep `href: "/inicio"`. Update the block comment (the "two duties" note) to reflect the concrete label. `Denunciar` unchanged.
- Active-state on pet pages: `NavItem` currently supports a single `matchPrefix` (`components/layout/HeaderNav.tsx` line ~32, `currentPath.startsWith`). Add optional `matchPrefixes?: string[]` to `NavItem` and make the active check return true if `matchPrefix` OR any `matchPrefixes` prefixes the path. Set the item's `matchPrefixes: ["/inicio", "/mis-mascotas"]` so "Mis mascotas" stays highlighted while viewing a pet at `/mis-mascotas/[token]`. Keep the change minimal and covered by `nav-presets.test.ts` / the link-integrity test.

**Note for the demo story.** Label is now a noun ("Mis mascotas") next to a verb ("Denunciar"). That's an accepted asymmetry — recognition beats elegance for first-run. Don't "fix" it back to a verb.

---

## H3 · Curated es-AR event detail, no raw JSON (🟡)

**Problem.** `EventTimeline.tsx` renders `<details>Ver detalle técnico → <pre>{JSON.stringify(payload)}</pre>`. On a citizen "DNI del perro" surface this exposes internal field names / hashes (touches June finding S3).

**Decision.** Replace with a curated, whitelisted es-AR key→value view.

**Files & changes.**

- `lib/events.ts`: add `eventPayloadDetails(eventType: string, payload: unknown): Array<{ label: string; value: string }>` — a per-event-type **whitelist** of safe, human fields with es-AR labels (e.g. vacuna → `Vacuna`, `Marca`, `Próxima dosis`; peso → `Peso`; microchip → `Número`). Never emit unknown keys; never emit internal fields (`firma_hash`, `evidence_hash`, any `*_id`, `matched_chip_number`, raw enums). Mirror the field selection `eventPayloadSummary` already trusts.
- `app/(app)/mis-mascotas/[publicToken]/EventTimeline.tsx`: replace the `<pre>` JSON block. If `eventPayloadDetails(...)` returns rows, render them as a small `<dl>` inside the `<details>` (summary label "Ver detalle", drop "técnico"). If it returns none, render no details section. Keep the collapsible pattern and existing tokens.

**Test:** `lib/events` unit — `eventPayloadDetails` omits blacklisted keys and returns es-AR labels for the common event types; unknown event type → `[]`.

---

## H4 · Compliance panel: list → credential cards (🟢, included)

**Decision.** Give each obligation more visual weight so the panel reads like a credential, not a checklist.

**Files & changes (`components/pet-profile/ComplianceObligationsPanel.tsx`, still a server component).**

- Replace the `<ul>` of `<li>` rows with a responsive grid: `grid grid-cols-1 sm:grid-cols-2 gap-3`. 2×2 at ≥640px, single column below; verify 320px has no h-scroll and badges wrap.
- Each obligation → a bordered card (`border border-[var(--color-ln-line)] rounded-[var(--radius-card)] p-4`) containing: a leading `Icon` (use existing `components/Icon.tsx` names — check `ICON_MAP`; e.g. `vacuna` for rabies; pick existing names for sterilization/microchip/ppp, fallback is safe but avoid it) + label (`text-md`, weight 600) on one row with the status badge top-right; then the detail line; then the 11px legal footnote; then (rabies only) the CTA and, when `hint` is set (H1), the muted verify hint.
- Rabies badge: use `LnVstamp` (`ok`/`due`/`over`) where tone maps; `reserved`/`neutral`/others use `LnBadge` as today. Keep the CTA `min-h-11` (44px).
- **Preserve the e2e/selector hooks:** keep `data-section="compliance"` on the section and `data-obligation={card.key}` on each card (the shipped code has these — don't drop them or `owner-shell`/`create-pet` specs break).
- Header (panel title + aggregate badge) unchanged.

---

## Verification (CC self-runs before done)

- `pnpm verify` green every iteration (incl. `lint:tokens` / `lint:ui`). A failure = a raw value or <44px target slipped in.
- New/updated unit tests pass: `pet-compliance.test.ts` (H1 cases above), `owner-confidence-display.test.ts` (unchanged), `eventPayloadDetails` (H3), `nav-presets.test.ts` (H2 active match).
- `pnpm exec playwright test e2e/owner-shell.spec.ts e2e/create-pet.spec.ts` — update selectors only if DOM changed; keep `data-section`/`data-obligation` stable so changes are minimal. Re-run `cross-tenant-isolation.spec.ts` + `auth.spec.ts`.
- Visual QA screenshots at 320 / 768 / 1280: compliance cards 2×2 → 1 col; every status shows icon **and** text; "Declarada · sin verificar" is visually distinct from "al día" (neutral vs green); AA contrast holds.
- Verification subagent (high-stakes): confirm no self-reported event flips a legal badge to "al día" in a live render, and that `eventPayloadDetails` never emits a blacklisted key for any event type.

**Definition of done:** verify green · H1 provenance gate live + tested · H2 label/route + active-match · H3 curated detail (no JSON leak) · H4 credential cards with stable data hooks · all copy es-AR · zero new tokens/migrations.

## Out of scope

Vet/org surfaces (their commits stand); any new event type, appointment status, or color token; the `/mis-mascotas` overflow list redesign; the RLS-backstop security work (separate Wave-A handoff).
