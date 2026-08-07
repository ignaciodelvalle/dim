# Component inventory critique (Cursor) + verified disposition

Cursor design-system audit of components/ui/ (citizen `Ln*` + operator `Op*` skins), 2026-07-04. Diagnosis: not missing components — **inventory inflated + duplicated state layers + half-done strangler migration** (~79 files in components/ui/, ~25 real primitives; rest are semantic wrappers, domain composites, or dead code).

## Verified against HEAD
- **Dead code CONFIRMED (0 imports):** `components/ui/Shell.tsx` (LnShell — replaced by AppShell), `components/ui/primitives/*` (Box/Stack/Text experiment). `LnTabs` in Tabs.tsx ~1 import (verify + prune; keep LnAccordion only if used). → repo-hygiene #21 + bundle #22.
- **🔴 deriveHeroPetStatus — architectural smell, NOT emergency:** CredentialFace receives `heroProps.status` + `complianceState` as SEPARATE props and doesn't fuse them; LnHero defaults `status="ok"`. BUT CredentialFace.test already asserts "Declarada · sin verificar" (neutral), not "AL DÍA" — the credential surface is likely already mitigated (distinct from /inicio's PetHealthStatusStrip which was fixed to "Sin pendientes"). Fix `deriveHeroPetStatus(complianceState, petStatus)` feeding LnStatusFlag as a wave-B cleanup that enforces the coupling. Do NOT create another badge.
- **Skin mixing REAL:** gob/reglas (~6 forms) + org (~8 forms) use LnField/LnButton/LnAlert inside the operator rail (four-actor §1.2 violation). Mechanical LnField→OpField (identical render-prop API).
- **OpButton burn-down incomplete:** ~25 raw `<button>` left in admin/gob (down from 133), + OrgMascotasBulkList (~15), alert actions. Deprecate OpSubmitButton → OpButton block loading.
- **CaseBadge** keeps its own STATUS_STYLES instead of delegating the status pill to CaseStatusBadge/a shared primitive — one color grammar for open/closed/escalated/merged.
- **/gob home arms ~12 OpKpi inline** — wants a `GovtHomeKpiStrip` composite (like AdminKpiStrip/PanoramaKpiStrip) for layout + a single freshness footer.

## Already good (do NOT regress)
st-* operator layer with OpStatusPill primitive (F2 resolved); Field render-prop ergonomics shared Ln/Op; CaseQueue+OpBulkBar; VaulSheet+SheetMounter deep-link sheets (no router.push); the token ratchet (components consume semantic tokens, change globals.css to propagate).

## Domain composites — exempt from "should it be a Button?" (rule: imports lib/projections or db/schema → domain, not primitive)
CredentialFace/LibretaFace/FlipCard, ComplianceObligationsPanel, EventCatcher, PanoramaConsole+maps, CaseQueue/CaseDetailShell, PetForm/LocationFields, AppShell+nav-presets, charts/*.

## Disposition (folded into the marathon)
- Dead-code prune → **repo-hygiene #21** (Shell.tsx + primitives/ verified safe).
- deriveHeroPetStatus coupling + CaseBadge status delegation + GovtHomeKpiStrip → **wave B (component consolidation)**.
- Skin purity (LnField→OpField) + OpButton burn-down → fold into **st-tokens #41** (same lane).
- 3 suggested PR slices (Cursor): status unification · skin migration · dead-code prune.
