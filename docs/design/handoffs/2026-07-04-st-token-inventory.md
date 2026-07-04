# MiMAR · Semantic status token (`st-*`) migration inventory

> **Date:** 2026-07-04 · **Scope:** Legacy status-meaning color usages in `components/`, `app/gob/`, `app/admin/`, `app/org/` that should converge on `--color-st-*` semantic tokens.
> **Ground truth:** `integration/all-20260703` @ `0a47d912` (`git rev-parse --short HEAD`).
> **Method:** Read `app/globals.css` token definitions; ripgrep inventory with classification (migrate / keep / ambiguous). No builds or tests run.

---

## 0. Executive summary

The **`st-*` semantic layer is defined and partially adopted.** `OpStatusPill` and its wrappers (`OpPill`, `OpStateBadge`, `CaseStatusBadge`) already source `var(--color-st-*)`. The `.op-surface` block in `globals.css` remaps those tokens to `ln-op-*` on operator shells — zero visual diff when migration is done correctly.

**Legacy debt is large:** **594** status-meaning token hits across **175** source files (test files excluded; **+19** hits in 6 test files noted separately). Of those, **~500 hits / ~160 files** are clear migration candidates; **~73 hits / 7 files** need a PO/design call; **~21 hits / 8 files** should stay on raw palette tokens (focus rings, chart strokes, docs).

**Suggested ratchet baseline:** freeze **500** category-(a) occurrences (or **160** files) — extend `scripts/check-design-tokens.ts` beyond the current 6-file `STATUS_COMPONENTS` set to cover operator route trees and citizen status primitives.

---

## 1. Token reference (`app/globals.css`)

### 1.1 Available `--color-st-*` tokens (12)

| Token | Citizen default (`@theme`) | Operator remap (`.op-surface`) |
|---|---|---|
| `--color-st-ok` | `--color-ln-ok` | `--color-ln-op-ok` |
| `--color-st-ok-bg` | `--color-ln-ok-bg` | `--color-ln-op-ok-bg` |
| `--color-st-ok-bd` | `--color-ln-ok-100` | `--color-ln-op-ok-bd` |
| `--color-st-warn` | `--color-ln-warn` | `--color-ln-op-warn` |
| `--color-st-warn-bg` | `--color-ln-warn-050` | `--color-ln-op-warn-bg` |
| `--color-st-warn-bd` | `--color-ln-warn-100` | `--color-ln-op-warn-bd` |
| `--color-st-err` | `--color-ln-err` | `--color-ln-op-danger` |
| `--color-st-err-bg` | `--color-ln-err-050` | `--color-ln-op-danger-bg` |
| `--color-st-err-bd` | `--color-ln-err-100` | `--color-ln-op-danger-bd` |
| `--color-st-info` | `--color-ln-violeta` | `--color-ln-op-viol` |
| `--color-st-info-bg` | `--color-ln-violeta-050` | `--color-ln-op-viol-bg` |
| `--color-st-info-bd` | `--color-ln-violeta-100` | `--color-ln-op-viol-bd` |

**Note:** Citizen `st-info` and operator `st-info` intentionally use different violet hex values (contrast calibration per skin). Names unify; values do not.

### 1.2 `.op-surface` remap

Applied on the operator shell root (`AppShell` operator variant). Cascades to all children, overriding citizen `st-*` defaults with `ln-op-*` equivalents. Citizen pages never mount `.op-surface` and keep warm-palette defaults.

**Target class pattern** (canonical, from `OpStatusPill.tsx`):

```tsx
"bg-[var(--color-st-ok-bg)] text-[var(--color-st-ok)] border-[var(--color-st-ok-bd)]"
```

Operator feature code should **not** reference `ln-op-ok` / `text-ln-op-warn` directly for status — only `var(--color-st-*)`.

### 1.3 Already migrated (reference implementations)

| File | `st-*` hits | Notes |
|---|---:|---|
| `components/ui/dashboard/OpStatusPill.tsx` | 4 | Canonical primitive |
| `components/ui/dashboard/OpPill.tsx` | 12 | Delegates to OpStatusPill |
| `components/ui/dashboard/CaseStatusBadge.tsx` | 8 | Case grammar |
| `components/ui/dashboard/OpStateBadge.tsx` | 3 | Event/state grammar |
| `components/ui/dashboard/OpKpi.tsx` | 8 | KPI tone chips use `st-*`; caveat tooltip + sparkline hex still legacy |
| `components/CaseBadge.tsx` | 5 | Cross-surface case badge |
| `components/ui/primitives/Text.tsx` | 3 | Semantic text tones |

**Partial regression in migrated files:** `OpKpi.tsx` line 161 still uses `text-ln-op-warn` for caveat copy; sparkline uses hardcoded hex (separate from `st-*` scope).

---

## 2. Search methodology

**Pattern** (status-meaning legacy tokens):

```
ln-op-(ok|warn|danger|viol|err)(-bg|-bd)?
ln-(ok|warn|err|violeta)(-050|-025|-100|-bg|-bd)?
var(--color-ln-(ok|warn|err|violeta|seal|op-(ok|warn|danger|viol)))
```

**Command:**

```bash
rg -n --no-heading -o '<pattern>' components/ app/gob/ app/admin/ app/org/ \
  | rg -v '\.(test|spec)\.(tsx?|jsx?)' | wc -l
# → 594
```

```bash
rg -l '<pattern>' components/ app/gob/ app/admin/ app/org/ \
  | rg -v '\.(test|spec)\.' | wc -l
# → 175 files
```

**Out of scope for this inventory:** `app/(app)/`, `app/(public)/`, `app/p/` — still contain legacy hits (prior `codemod-status-tints.cjs` pass) but excluded per task scope.

**Classification key:**

| Cat | Label | Rule |
|---|---|---|
| **a** | migrate | Clear ok/warn/err/info status semantics (badges, alerts, validation, success/error copy, severity, compliance stamps) |
| **b** | keep | Decorative, brand, interaction chrome (focus rings, chart strokes, nav accents, documentation) |
| **c** | ambiguous | Mixed brand + status tone APIs, or action-fill vs read-only status distinction |

---

## 3. Totals by category

| Category | Files | Occurrences | Share |
|---|---:|---:|---:|
| **(a) migrate** | ~160 | **~500** | 84% |
| **(b) keep** | 8 | **~21** | 4% |
| **(c) ambiguous** | 7 | **~73** | 12% |
| **Total** | **175** | **594** | 100% |

Test files (update when migrating): 6 files, 19 occurrences — `StatusFlag.test.tsx`, `ConfidenceBadge.test.tsx`, `Badge.test.tsx`, `Alert.test.tsx`, `Field.checkbox.test.tsx`, `NumericWindowRuleForm.test.tsx`.

---

## 4. Summary table (file · count · category)

Dominant category per file. Full migration-ready list in §5.

| File | Count | Cat |
|---|---:|---|
| `components/ui/Sheet.tsx` | 25 | c |
| `app/gob/decomisos/nuevo/_components/DecomisoForm.tsx` | 24 | a |
| `components/admin/AlertInboxTable.tsx` | 20 | a |
| `components/ui/StatusFlag.tsx` | 18 | a |
| `app/org/[orgToken]/mascotas/OrgMascotasBulkList.tsx` | 17 | a |
| `app/org/[orgToken]/agenda/turnos/[appointmentToken]/AttendanceFormDispatcher.tsx` | 17 | a |
| `components/ui/Card.tsx` | 16 | c |
| `app/org/[orgToken]/mascotas/[publicToken]/adoptar/AdoptionListingForm.tsx` | 16 | a |
| `app/org/[orgToken]/mascotas/OrgMascotasPipelineBoard.tsx` | 15 | a |
| `components/pet-profile/LostPublicCredential.tsx` | 13 | a |
| `app/org/[orgToken]/admin/permisos/CapabilityMatrix.tsx` | 13 | a |
| `components/ui/dashboard/OpCodeBadge.tsx` | 12 | a |
| `components/pet-profile/LostScanFeed.tsx` | 12 | a |
| `components/BulkApprovalQueueList.tsx` | 11 | a |
| `components/BulkRevokeList.tsx` | 10 | a |
| `components/ui/dashboard/OpField.tsx` | 9 | b |
| `components/ui/Chip.tsx` | 9 | c |
| `components/ui/Badge.tsx` | 9 | a |
| `components/ui/Alert.tsx` | 9 | c |
| `components/pet-profile/VacunasStatusBadges.tsx` | 9 | a |
| `components/NotificationCard.tsx` | 9 | a |
| `app/org/[orgToken]/mascotas/[publicToken]/devolver-al-dueno/ProposeReturnForm.tsx` | 9 | a |
| `app/admin/moderacion/[id]/ModerationActions.tsx` | 9 | a |
| `components/PregnancyInProgressCard.tsx` | 8 | a |
| `app/org/[orgToken]/servicios/nuevo/ServiceOfferingForm.tsx` | 8 | a |
| `app/org/[orgToken]/mordedura/nuevo/OrgBiteForm.tsx` | 8 | a |
| `app/org/[orgToken]/mascotas/[publicToken]/OwnerReturnProposalCard.tsx` | 8 | a |
| `app/gob/usuarios/RevokeUserActions.tsx` | 8 | a |
| `app/gob/organizaciones/RevokeOrgActions.tsx` | 8 | a |
| `app/admin/govts/_components/DeactivateGovtForm.tsx` | 8 | a |
| `app/admin/alertas/AlertRowActions.tsx` | 8 | a |
| `app/admin/admins/_components/DeactivateAdminForm.tsx` | 8 | a |
| *(+143 files with ≤7 hits each — all category **a** except **b** rows below)* | | |
| `components/README.md` | 4 | b |
| `components/pet-profile/WeightSparkline.tsx` | 3 | b |
| `components/ui/IconCircleButton.tsx` | 4 | c |
| `components/ui/Photo.tsx` | 4 | c |
| `components/ui/Button.tsx` | 6 | c |
| `components/ui/Toggle.tsx` | 1 | b |
| `components/ui/Tabs.tsx` | 1 | b |
| `components/ui/UrlTabs.tsx` | 1 | b |
| `components/ui/dashboard/OpScopeChip.tsx` | 1 | b |
| `components/pet-profile/LostLastSeenCard.tsx` | 1 | b |

---

## 5. Migration-ready list (category a) — by count descending

Priority order for batched PRs. Start with shared primitives (high fan-out), then operator dashboards, then org/gob feature pages.

| Priority | File | Hits |
|---:|---|---:|
| 1 | `app/gob/decomisos/nuevo/_components/DecomisoForm.tsx` | 24 |
| 2 | `components/admin/AlertInboxTable.tsx` | 20 |
| 3 | `components/ui/StatusFlag.tsx` | 18 |
| 4 | `app/org/[orgToken]/mascotas/OrgMascotasBulkList.tsx` | 17 |
| 5 | `app/org/[orgToken]/agenda/turnos/[appointmentToken]/AttendanceFormDispatcher.tsx` | 17 |
| 6 | `app/org/[orgToken]/mascotas/[publicToken]/adoptar/AdoptionListingForm.tsx` | 16 |
| 7 | `app/org/[orgToken]/mascotas/OrgMascotasPipelineBoard.tsx` | 15 |
| 8 | `components/pet-profile/LostPublicCredential.tsx` | 13 |
| 9 | `app/org/[orgToken]/admin/permisos/CapabilityMatrix.tsx` | 13 |
| 10 | `components/ui/dashboard/OpCodeBadge.tsx` | 12 |
| 11 | `components/pet-profile/LostScanFeed.tsx` | 12 |
| 12 | `components/BulkApprovalQueueList.tsx` | 11 |
| 13 | `components/BulkRevokeList.tsx` | 10 |
| 14 | `components/ui/Badge.tsx` | 9 |
| 15 | `components/pet-profile/VacunasStatusBadges.tsx` | 9 |
| 16 | `components/NotificationCard.tsx` | 9 |
| 17 | `app/org/[orgToken]/mascotas/[publicToken]/devolver-al-dueno/ProposeReturnForm.tsx` | 9 |
| 18 | `app/admin/moderacion/[id]/ModerationActions.tsx` | 9 |
| 19 | `components/PregnancyInProgressCard.tsx` | 8 |
| 20 | `app/org/[orgToken]/servicios/nuevo/ServiceOfferingForm.tsx` | 8 |
| 21 | `app/org/[orgToken]/mordedura/nuevo/OrgBiteForm.tsx` | 8 |
| 22 | `app/org/[orgToken]/mascotas/[publicToken]/OwnerReturnProposalCard.tsx` | 8 |
| 23 | `app/gob/usuarios/RevokeUserActions.tsx` | 8 |
| 24 | `app/gob/organizaciones/RevokeOrgActions.tsx` | 8 |
| 25 | `app/admin/govts/_components/DeactivateGovtForm.tsx` | 8 |
| 26 | `app/admin/alertas/AlertRowActions.tsx` | 8 |
| 27 | `app/admin/admins/_components/DeactivateAdminForm.tsx` | 8 |
| 28 | `components/ui/dashboard/OpBreach.tsx` | 7 |
| 29 | `components/pet-profile/LostCaseBlock.tsx` | 7 |
| 30 | `app/org/[orgToken]/transferencias/recibidas/IncomingTransferActions.tsx` | 7 |
| 31 | `app/org/[orgToken]/servicios/[offeringToken]/agenda/AgendaRuleForm.tsx` | 7 |
| 32 | `app/org/[orgToken]/page.tsx` | 7 |
| 33 | `app/org/[orgToken]/mascotas/[publicToken]/adoption/FinalizeAdoptionForm.tsx` | 7 |
| 34 | `app/org/[orgToken]/intake/IntakeForm.tsx` | 7 |
| 35 | `app/gob/programa/page.tsx` | 7 |
| 36 | `app/gob/disputas/[disputeToken]/page.tsx` | 7 |
| 37 | `app/admin/programa/page.tsx` | 7 |
| 38 | `app/admin/govts/_components/RevokeLocalityRowActions.tsx` | 7 |
| 39 | `components/ui/dashboard/OpButton.tsx` | 6 |
| 40 | `components/CasesWidget.tsx` | 6 |
| 41–160 | *Remaining 120 files with 1–6 hits each* — full paths available via inventory command in §2 | 1–6 |

**Batch suggestion:**

1. **Primitives batch** — `StatusFlag`, `Badge`, `NotificationCard`, `VacunasStatusBadges`, `OpCodeBadge`, `OpBreach`, `OpButton` (operator CTA ok/danger only where status-toned).
2. **Operator alerts batch** — `AlertInboxTable`, `RuleImpactBanner`, `DemoModeBanner`, gob/admin warning banners.
3. **Org pipeline batch** — `OrgMascotasBulkList`, `OrgMascotasPipelineBoard`, `AttendanceFormDispatcher`, adoption/transfer forms.
4. **Long-tail sweep** — remaining gob/admin/org pages with inline `text-ln-op-ok` success lines.

---

## 6. Keep list (category b)

| File | Hits | Rationale |
|---|---:|---|
| `components/README.md` | 4 | Documentation prose referencing token names — not rendered UI |
| `components/ui/dashboard/OpField.tsx` | 9 | `focus-visible:ring-ln-op-ok` is focus affordance on inputs, not a status badge |
| `components/pet-profile/WeightSparkline.tsx` | 3 | SVG chart stroke/fill — data-viz accent; file comment flags separate design decision |
| `components/ui/Toggle.tsx` | 1 | Checked-state UI chrome |
| `components/ui/Tabs.tsx` | 1 | Accordion open chevron uses ok green as nav affordance |
| `components/ui/UrlTabs.tsx` | 1 | Tab active indicator — navigation chrome |
| `components/ui/dashboard/OpScopeChip.tsx` | 1 | Jurisdiction scope label — not ok/warn/err grammar |
| `components/pet-profile/LostLastSeenCard.tsx` | 1 | Map placeholder gradient (`ok-050` + `celeste`) — decorative, not a status pill |

---

## 7. Ambiguous list (category c) — human call required

| File | Hits | One-line context |
|---|---:|---|
| `components/ui/Sheet.tsx` | 25 | `LnSheetTone` mixes brand slots (`azul`, `rosa`, `violeta`) with status-adjacent slots (`verde`→ok, `warn`, `seal`→brand red); need tone→token mapping table before bulk replace |
| `components/ui/Card.tsx` | 16 | Same multi-tone API as Sheet; `seal` uses `--color-ln-seal` (credential brand) not `--color-st-err` |
| `components/ui/Alert.tsx` | 9 | `success`/`warning`/`danger` are status; `info` uses celeste/azul informative brand — not `st-info`/violeta |
| `components/ui/Button.tsx` | 6 | `ok`/`warn` variants are solid action fills — PO must decide if CTAs use `st-*` or stay as brand action colors |
| `components/ui/Chip.tsx` | 9 | Pet registry dots encode domain states (`sick`, `lost`, `rojo`, `amber`) — may need a domain map, not generic `st-*` |
| `components/ui/IconCircleButton.tsx` | 4 | `danger`/`success` are destructive/confirm **actions**, not read-only status pills |
| `components/ui/Photo.tsx` | 4 | Upload `success` overlay tint — status feedback vs decorative photo chrome |

**PO decisions needed:**

1. Does **`info`** in citizen alerts map to **`st-info`** (violeta) or stay on celeste/azul brand blues?
2. Does **`seal`** tone in Sheet/Card map to **`st-err`** or remain a separate credential-brand token?
3. Do **solid ok/warn buttons** (`LnButton` ok/warn, `OpButton` ok) migrate to `st-*` fills or keep as action palette?

---

## 8. Suggested ratchet baseline

Extend `scripts/check-design-tokens.ts` (today: hard-error only inside 6 `STATUS_COMPONENTS` files):

| Ratchet | Baseline value | Enforcement |
|---|---:|---|
| **Category-(a) occurrences** | **500** | New `RAW_STATUS_ANYWHERE` rule on `components/`, `app/gob/`, `app/admin/`, `app/org/` — fail on count increase |
| **Category-(a) files** | **160** | Optional secondary gate |
| **Ambiguous files** | **7** (frozen) | Manual review before any change in §7 files |
| **Keep files** | **8** (exempt) | Explicit allowlist in linter |

**Mechanical replacement cheatsheet:**

| Legacy | Replace with |
|---|---|
| `text-ln-op-ok` / `text-ln-ok` | `text-[var(--color-st-ok)]` |
| `bg-ln-op-ok-bg` / `bg-[var(--color-ln-ok-050)]` | `bg-[var(--color-st-ok-bg)]` |
| `border-ln-op-warn-bd` | `border-[var(--color-st-warn-bd)]` |
| `text-ln-op-danger` / `text-ln-err` | `text-[var(--color-st-err)]` |
| `text-ln-op-viol` / `text-[var(--color-ln-violeta)]` | `text-[var(--color-st-info)]` |

Existing codemod `scripts/codemod-status-tints.cjs` targets hex→`ln-*` (prior pass); a follow-up codemod should map `ln-*`/`ln-op-*` status→`var(--color-st-*)` for category-(a) files only.

---

## 9. Related docs

- `components/README.md` § `st-*` semantic tones (authoritative contributor rule)
- `app/globals.css` lines 258–323 — token definitions + `.op-surface` block
- `scripts/check-design-tokens.ts` — `STATUS_COMPONENTS`, `RAW_OP_STATUS`, `RAW_CITIZEN_STATUS`
- `components/ui/dashboard/OpStatusPill.tsx` — canonical target API
