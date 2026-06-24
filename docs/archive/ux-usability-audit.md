# MiMAR — UX & Usability Audit (all roles, all workflows)

> Codebase design critique. Scope: every portal surface (owner, org, govt, admin, public).
> Method: read the shared design system + navigation, then audited ~70 representative
> pages/components across the five surfaces against usability, IA, visual hierarchy,
> consistency, and WCAG 2.1 AA. Findings are evidence-based with file references so they
> can be picked up directly as handoff tasks.

---

## Overall impression

MiMAR is built on an unusually disciplined design system with two coherent visual languages — **Libreta Nacional** (`ln-*` tokens) for citizen/credential surfaces and an **operational "Op" kit** (`OpKpi`, `OpRail`, `CaseQueue`, `OpOmnibox`) for the authority dashboards. Accessibility intent is baked into tokens (WCAG contrast ratios are annotated inline) and into primitives (`Field.tsx` enforces 44px targets, `aria-describedby`, `role="alert"`). Sensitive flows — lost pet, pet death, anonymous abuse reporting, DNI "declared not verified" honesty — are handled with genuine care.

The single recurring problem is **inconsistent adoption of that strong foundation**. The best components exist but aren't mounted everywhere (org portal has no global search; the richest chart/KPI components are dead code), the 44px touch-target rule the system documents is violated by its own dashboard nav, and high-stakes forms bypass the accessible `Field` primitive. The biggest opportunity is not new design — it is **making the whole app live up to the system it already has**, plus closing a handful of true dead-ends.

---

## Cross-cutting themes (the synthesis)

These patterns repeat across multiple roles and are where fixes have the most leverage.

### 1. A strong design system, unevenly applied
The same capability exists in a polished form and a hand-rolled form side by side:
- **Global search** (`OpOmnibox`, a textbook ARIA combobox with `/` and ⌘K) is mounted in gob and admin but **absent from the org portal** — the densest operational surface has no jump-to-record.
- **Two KPI systems**: `OpKpi` (live) vs `MetricCard` (used only in a design demo). **Two chart families**: dashboards reinvent CSS bars / `TimeSeriesChart` while the feature-rich `DashboardChart` (empty states, method notes, CSV export) is used by *zero* app pages.
- **Queue primitives** (`CaseQueue`, `OpBulkBar`, `BulkApprovalQueueList`) power the capability-request queue but the **adoption review** and **org cases** lists are plain `<ul>`s with no bulk, filters, or SLA.
- **Forms**: `Field.tsx`/`LnField` correctly wire labels, required markers, and inline errors — but the vet-upgrade, bite, and several org wizards roll their own and lose required `*` markers and per-field errors.

**Fix posture:** pick one of each duplicated component, migrate, delete the twin. This *raises* quality (the unused components are the better ones) while cutting maintenance.

### 2. Touch targets below the system's own 44px standard
`Field.tsx` documents and enforces 44px (WCAG 2.5.5), yet `PetQuickActions` pills, the `WizardShell` back button, and `OpRailNav` rows all ship at 36px (`min-h-9`). A mechanical, app-wide fix.

### 3. Color-only status signaling
Recurring across roles: `OpKpi` conveys ok/warn/danger by color alone (no icon/label); danger `ActionRow`s in `cuenta` and `PetActionsMenu` are red text with no icon; choropleths have no on-screen legend. The badge components (`OpStateBadge`, `CaseStatusBadge`) get this right with glyphs — extend that pattern.

### 4. Wayfinding gaps
- **Govt/Admin breadcrumb is a hardcoded `[{label:"Panel"}]` stub** on every route — there is no global "where am I / go back." Detail pages hand-roll `OpCrumbs` inconsistently.
- **Org capability-gated nav items vanish silently** — a member without `intake.create` simply never sees Ingresos/Censo, with no "request access" affordance at the point of absence.
- **Duplicate IA in admin**: two system-wide audit pages (`/admin/auditoria` + `/admin/historial`); gob's "Histórico" is actually self-only ("Mi historial") but labeled generically.

### 5. True dead-ends in core flows
- **No password reset** on login — a locked-out owner cannot recover.
- **Invalid/worn QR token → bare English Next.js 404** (no `not-found.tsx` anywhere) — fails the product's hero moment for the exact stranger it's built to convert.
- **Outbound transfers are invisible** — the owner who *initiates* a transfer has no status surface ("Transferencias" shows received only).
- **Denuncia reference code** (an anonymous reporter's only key) is shown as a non-copyable static string.

### 6. Sensitive-flow tone — a genuine strength
Lost-pet wizard collapses steps when chip/tattoo exist, is reversible, and centers owner control over disclosure; death recording avoids overclaiming; DNI says "declarado" not "verificado"; denuncia is anonymous-first ("no se requiere certeza, solo buena fe"). Keep this bar; the main gap is adding a compassionate framing line to the long single-sheet death form and an emergency off-ramp on the "peligro inmediato" denuncia path.

### 7. Data-viz interpretability on public-health dashboards
These are decision surfaces for authorities, yet choropleths render with no visible color-scale legend, KPI definitions/formulas (`OpKpi info=`) go unused on the flagship dashboards, and hand-rolled mortality bars lack scale/value/aria. Operators can misread compliance and epi metrics.

---

## Findings by role

Severity: 🔴 Critical · 🟡 Moderate · 🟢 Minor

### Owner portal (`/(app)`)

| Finding | Sev | Location | Recommendation |
|---|---|---|---|
| No "forgot password" — locked-out owners cannot recover | 🟡 | `(auth)/login/LoginForm.tsx` | Ship password reset (hard stop today) |
| Outbound (initiated) transfers have no status surface | 🟡 | `transferencias/page.tsx` ("recibidas" only) | Add an "enviadas" tab with pending/accepted state |
| Three verbs for "add a pet" (Inscribir / Cargar / Registrar) | 🟡 | `mis-mascotas/page.tsx`, `inicio`, `EventCatcher.tsx` | Standardize on one verb everywhere |
| Vet-upgrade & bite forms: no required `*`, all errors collapse to one page-level message | 🟡 | `cuenta/upgrade/VetUpgradeForm.tsx`, `eventos/nuevo/mordedura/BiteForm.tsx` | Route through `LnField` with per-field `error` |
| Bite victim-kind radio group has no `fieldset/legend`/`aria-required` | 🟡 | `mordedura/BiteForm.tsx` | Wrap in fieldset/legend, add aria-required |
| Touch targets at 36px (PetQuickActions pills, WizardShell back) | 🟡 | `pet-profile/PetQuickActions.tsx`, `ui/WizardShell.tsx` | Bump to `min-h-11` |
| Death form is one long sheet, no compassionate intro, no confirm before terminal status | 🟡 | `eventos/nuevo/fallecimiento/DeathRecordForm.tsx` | Add empathetic framing + progressive disclosure + light confirm |
| Vet-upgrade "Solicitud enviada" rendered in warning colors | 🟢 | `cuenta/upgrade/page.tsx` | Use success/ok tone |
| `no_show` appointments bucketed under "Cancelados" | 🟢 | `mis-turnos/page.tsx` | Separate or relabel |
| Danger rows color-only (no icon); disabled "Llamar vet" explanation unreachable by SR | 🟢 | `cuenta/page.tsx`, `PetActionsMenu.tsx`, `PetQuickActions.tsx` | Add icons; make explanation focusable |
| `SuccessScreen` clipboard copy fails silently | 🟢 | `ui/SuccessScreen.tsx` | Surface fallback on failure |
| WizardShell progress never reaches 100% on final step | 🟢 | `ui/WizardShell.tsx` | Fix `currentStep/totalSteps` |

**What works:** `Field.tsx` (labels via `useId`, 16px no-iOS-zoom, 44px, `role="alert"`); minimal one-step pet registration → credential "aha"; the reversible lost-pet wizard; natural-language `/anotar` capture; honest "declarado" DNI tone.

### Org portal (`/org/[orgToken]`)

| Finding | Sev | Location | Recommendation |
|---|---|---|---|
| **No global search** (OpOmnibox absent from the densest portal) | 🔴 | `org/[orgToken]/layout.tsx` | Mount `OpOmnibox`, jurisdiction-scoped |
| **Adoption review has no bulk/filters/aging-SLA** — one drill-in per decision | 🔴 | `org/[orgToken]/adopciones/page.tsx` | Reuse `OpBulkBar`/`CaseQueue` + `OpBreach` age badges |
| Capability-gated nav items disappear silently, no "request access" cue | 🟡 | `nav-presets.ts` `buildOrgNav` | Show locked/requestable entry or panel hint |
| `casos` is a plain `<ul>`, not `CaseQueue`; no bulk | 🟡 | `org/[orgToken]/casos/page.tsx` | Render `CaseQueue` with bulk config |
| Generated public tokens shown as bare `<code>`, no copy button | 🟡 | `org/[orgToken]/mascotas/page.tsx` | Add copy-to-clipboard (match `InviteForm`) |
| No multi-org context switcher — must exit to owner portal | 🟡 | `org/[orgToken]/layout.tsx` | Mount `ContextSwitcher` / org picker |
| No pagination on member/case/pet lists (relies on `LIMIT 200`) | 🟡 | `adopciones/page.tsx`, `CaseQueue`, `miembros` | Cursor pagination or "showing N of M" |
| Non-shelter org types get a near-empty panel (KPIs shelter-gated) | 🟡 | `org/[orgToken]/page.tsx` | Org-type-appropriate panel modules |
| `OpField` doesn't auto-wire `aria-describedby` for hint/error | 🟡 | `ui/dashboard/OpField.tsx` | Thread id linkage automatically |
| Wizard step-gating via disabled buttons with no "what's missing" hint | 🟡 | `intake/IntakeForm.tsx`, `OrgBiteForm.tsx`, `ServiceOfferingForm.tsx` | Pair disabled CTA with inline hint |
| Intake is one-animal-at-a-time (litters/seizures re-walk wizard) | 🟡 | `intake/IntakeForm.tsx` | "Guardar y cargar otro" preserving shared fields |
| Reject ("No avanzar") softer than its notified effect; reason optional | 🟢 | `adopciones/[appEventId]/ReviewButtons.tsx` | Confirm step or encourage a reason |

**What works:** `OpOmnibox` (full APG combobox); consistent badge grammar with glyphs; `BulkApprovalQueueList` partial-failure reporting + `bulkActionId` audit ref; `OrgSetupChecklist` keyboard-resume onboarding; reassuring "—" KPI empty states.

### Govt portal (`/gob`) & Admin portal (`/admin`)

| Finding | Sev | Portal | Location | Recommendation |
|---|---|---|---|---|
| Topbar breadcrumb hardcoded to "Panel" — no global wayfinding | 🔴 | Both | `gob/layout.tsx`, `admin/layout.tsx` | Drive `OpCrumbs` from the route |
| Two KPI systems + two chart families; the richer ones are dead code | 🟡 | Both | `MetricCard`, `charts/DashboardChart.tsx` | Consolidate to one each, delete twin |
| `OpKpi` definition/formula/sparkline affordances unused on flagship dashboards | 🟡 | Both | `gob/page`, `mortalidad`, `vigilancia`, `admin/page` | Add `info={{definition,formula,caveat}}` to epi/compliance KPIs |
| KPI semantic state is color-only (no icon/label) | 🟡 | Both | `ui/dashboard/OpKpi.tsx` | Add non-color status cue |
| `admin/cola` loads all pending unbounded (gob/cola paginates) | 🟡 | Admin | `admin/cola/page.tsx` | Apply keyset pagination |
| Two near-duplicate system-wide audit pages | 🟡 | Admin | `admin/auditoria`, `admin/historial` | Merge or differentiate |
| gob "Histórico" is self-only but generically labeled | 🟡 | Govt | `gob/historial/page.tsx` | Rename "Mi actividad" or add jurisdiction-wide audit |
| Two different jurisdiction-filter components across sibling dashboards | 🟡 | Govt | `JurisdictionFilterBar` vs `JurisdictionSwitcher`+`PeriodPicker` | Standardize one filter bar |
| Choropleths render with no visible color-scale legend | 🟡 | Govt | `charts/MapChoropleth.tsx`, `perdidas`, `vigilancia` | Add gradient legend + suppressed/no-data swatches |
| Hand-rolled mortality bars lack scale/value labels/aria | 🟡 | Govt | `gob/mortalidad/page.tsx` | Use a labeled, aria'd bar component |
| PII-logging disclosed in `usuarios` but not in the omnibox (which also logs) | 🟡 | Both | `ui/dashboard/OpOmnibox.tsx` | Add "las búsquedas quedan registradas" hint |
| Rail nav rows 36px (below 44px) | 🟢 | Both | `ui/dashboard/OpRailNav.tsx` | Raise to 44px |
| Outbox province filter is free-text (typo → silent empty) | 🟢 | Admin | `admin/outbox/page.tsx` | Replace with `<select>` |
| `RuleImpactBanner` fails silently on preview error | 🟢 | Admin | `admin/RuleImpactBanner.tsx` | Show "no se pudo calcular el impacto" |
| Mixed accents in admin copy ("Auditoria", "Jurisdiccion") vs accented gob | 🟢 | Admin | `admin/*`, nav-presets | Normalize es-AR accents |
| `admin/page` duplicates `sistema` KPIs without cross-linking | 🟢 | Admin | `admin/page.tsx`, `admin/sistema` | Differentiate + link |

**What works:** jurisdiction-scope intersection guards (no scope-widening via crafted params); PII-query logging at the right boundary + disclosed in-page; chart `<details>`/`<table>` data fallbacks with `scope` headers + reduced-motion; bulk-approval partial-failure handling; `RuleImpactBanner` live "~N mascotas afectadas" preview; consistent SLA-breach surfacing (outbox/mortality).

**Portal parity note:** gob is the more polished sibling (fully accented, paginated, scope-disclosing). Admin diverges by lacking cola pagination, carrying duplicate audit/KPI surfaces, a free-text province filter, and rougher copy — despite serving the same operator class.

### Public surfaces (no auth)

| Finding | Sev | Location | Recommendation |
|---|---|---|---|
| **Invalid/worn QR token → bare English Next.js 404** (no `not-found.tsx`) | 🔴 | `app/` (missing); `p/[publicToken]/page.tsx` `notFound()` | Add Spanish `not-found.tsx` pointing to `/perdidas` + landing |
| **Active (non-lost) credential buries owner-contact inside a `<details>`** | 🔴 | `p/[publicToken]/page.tsx` | Default-open / render the FoundPetForm CTA expanded |
| Denuncia reference code (reporter's only key) not copyable; success screen is dead code (redirect) | 🟡 | `DenunciaWizard.tsx`, `denuncias/codigo/[code]/page.tsx` | Copy-to-clipboard + "descargar comprobante" on every visit |
| 5 footer-linked info pages are "en preparación" stubs | 🟡 | `acerca`, `ayuda`, `accesibilidad`, `cookies`, `sugerencias` | Build at least Acerca/Ayuda/cookie notice or hide dead links |
| `/accesibilidad` claims WCAG 2.1 conformance but is an empty stub | 🟡 | `accesibilidad/page.tsx` | Ship a real statement or soften the claim |
| `AdoptionListingCard` nests `<a>` inside `<a>` (invalid HTML, breaks a11y) | 🟡 | `AdoptionListingCard.tsx` | Link image/name only; publisher link as sibling |
| No emergency off-ramp on "peligro inmediato" denuncia path | 🟡 | `denuncias/nueva/_components/Step2Severity.tsx` | Surface hotline callout when severity = grave/urgente |
| Adoption privacy modal is non-modal `<dialog open>` (no focus trap/Esc) | 🟡 | `adoptar/[petToken]/postular/ApplicationForm.tsx` | Use `showModal()` / focus-trapped modal |
| Adoption fields lack `<label htmlFor>` / `fieldset+legend` | 🟡 | `ApplicationForm.tsx` | Real labels + fieldset/legend |
| `<main id="main-content">` inconsistent → skip-link breaks on key pages | 🟢 | credential, `adoptar/*`, `perdidas` | Standardize `<main id="main-content">` |
| Active credential uses raw emoji (♥, 🔓) vs SVG icons on landing | 🟢 | `p/[publicToken]/page.tsx` | Use the inline-SVG icon system |
| Found/sighting contact is one free-text field, no `inputMode` | 🟢 | `FoundPetForm.tsx` | Add `inputMode`/split tel+email |
| Denuncia steps 1–2 auto-advance on tap (mis-tap risk); no autosave | 🟢 | `DenunciaWizard.tsx` | Confirm pattern + `beforeunload` guard |

**What works:** the credential reads genuinely gov-grade (guilloché bands, serif crest, mono `LIB-AR-…`, tier chip); **lost-mode is a purpose-built emergency layout** (red `role="alert"`, first-person headline, "hace X horas" recency, ranked one-tap actions, 44px targets); tier disclosure enforced server-side before PII loads; differentiated empty states; graceful login-gating that works without JS.

**Found-pet hero moment:** The lost path *succeeds* — a stranger learns whose pet it is, that it's lost, how to call, and how to report a sighting in ~5 seconds with zero login. But two structural cracks undercut it: the **active credential hides its only contact path in a `<details>`** (many found pets aren't yet flagged lost), and a **mistyped QR yields an English 404**. Both are cheap fixes at the highest-stakes moment.

---

## Accessibility summary (WCAG 2.1 AA)

Strong intent, uneven execution. **Wins:** token-level contrast annotations, `Field.tsx` exemplary form a11y, chart data-table fallbacks, badge glyphs, omnibox APG combobox, reduced-motion support. **Recurring gaps to fix app-wide:** (1) 36px touch targets in three nav/action components vs the documented 44px rule; (2) color-only status on `OpKpi` and danger rows; (3) hand-rolled radio groups missing `fieldset/legend/aria-required`; (4) inconsistent `<main id>` breaking skip links; (5) invalid nested anchors in `AdoptionListingCard`; (6) a public `/accesibilidad` page that claims conformance it doesn't yet demonstrate.

## Consistency summary

The system *exists*; enforcement is the gap. Standardize: one KPI component, one chart family, one jurisdiction filter, one drill pattern, one empty-state component (`LnEmptyState`, not emoji callouts), one "add a pet" verb, one audit page in admin, and route all forms through `LnField`/`OpField` with auto-wired errors. Normalize es-AR accents in admin. Each is mechanical and removes a maintenance twin.

---

## Prioritized roadmap

**P0 — fix the dead-ends (highest trust-impact, low effort)**
1. Spanish `not-found.tsx` for bad QR tokens — the hero moment's worst failure.
2. Default-expand owner-contact on the active public credential.
3. Password reset on login.
4. Make the denuncia reference code copyable/savable on every visit.

**P1 — make the design system universal**
5. Mount `OpOmnibox` in the org portal; turn adoption review + org cases into real bulk/filter/SLA queues (`CaseQueue`/`OpBulkBar`).
6. Fix govt/admin breadcrumbs to be route-driven; consolidate the duplicate KPI/chart/audit/filter systems (delete the dead twins).
7. Route all forms through the accessible field primitives (required `*`, per-field inline errors, auto `aria-describedby`).

**P2 — accessibility & interpretability polish**
8. App-wide 44px touch targets; add non-color status cues to `OpKpi` and danger rows.
9. Add visible legends to choropleths and scale/value/aria to mortality bars; populate `OpKpi info=` definitions on epi/compliance dashboards.
10. Build the stub info pages (or hide dead footer links); fix nested anchors, `<main id>`, fieldset/legend; surface PII-logging in the omnibox.
11. Compassionate framing on the death form; emergency off-ramp on urgent denuncias; non-shelter org panels.

---

*Generated from a read-only codebase audit. Every finding cites a file so it can be converted directly into a Claude Code handoff task.*
