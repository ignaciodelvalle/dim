# UI Professionalism Pass — inventory (phase 1 + 5)

> Generated 2026-07-14 by the read-only inventory agent (PO directive: no emojis in
> the UI, standardized icons, gov-grade sobriety — reference set argob/iconos /
> Poncho). This document is the INPUT for the replace phase. Two decisions are
> PO-gated before mass-applying: the icon standard confirmation and the
> AlertInboxTable escalation-glyph design.

## Summary stats

Total classified: ~245 characters across app/ + components/ + lib/.

| Class | Count | Action |
|---|---|---|
| (a) EMOJI-IN-COPY | ~38 | Remove or replace with plain es-AR text |
| (b) SYMBOL-AS-ICON | ~110 | Swap for `<Icon name="..."/>` (registry exists — see Key Finding) |
| (c) SANCTIONED-TYPOGRAPHY | ~75 | `×` (dimensions/formulas), `→`/`·`, stamp-caps — keep + baseline |
| (d) NON-UI | ~22 | Comments, test assertions, JSDoc — out of scope |

By surface (a+b+d): PUBLIC 54 · OPERATOR 31 · OWNER 34 · SHARED components/ 58 · LIB 7.

Baselines for the future lint fence: `→` 834 instances / 272 files; `·` 630 / 220 — both
structural, sanctioned.

## KEY FINDING — the icon standard already exists in the repo

`components/Icon.tsx` is a mature lucide-react registry (`ICON_MAP`, ~90 semantic
names: `close→X`, `editar→Pencil`, `vacuna→Syringe`, `medicacion→Pill`,
`huella→PawPrint`, `alerta→AlertTriangle`, `disputa→Scale`, ...). Most (b) hits are
call sites that never adopted it — pure substitutions, zero new dependencies.

Two structural sub-patterns for the replacer:

1. **Shared primitives hand-roll close glyphs** despite `close: X` existing:
   `components/ui/VaulSheet.tsx:123-125`, `components/ui/Sheet.tsx:252`,
   `components/ui/Card.tsx:206` render bare `×`. Fixing these 3 cascades to every
   consumer. 5 more one-off call sites duplicate the pattern locally.
2. **Icon-as-string prop contracts**: `components/ui/dashboard/OpStatusPill.tsx`
   (`icon?: string`), consumed by `OpStateBadge.tsx` (`●⏸○★`) and `OpKpi.tsx`
   (`⚠●`) — need `icon?: ReactNode` type change, not character swaps.
   `components/admin/AlertInboxTable.tsx` `STATUS_ICON` (`▲◔◑◕●○`) is a deliberate
   quarter/half/three-quarter-fill escalation metaphor with NO lucide equivalent —
   PO/design decision: custom SVGs vs accepted exception.
   By contrast `OpCallout`/`OpBreach` already take `ReactNode` — their `icon="⚠"`
   call sites (4× in app/gob/vigilancia) are trivial swaps.

## 10 worst offenders (public-facing, ranked)

1. `app/(public)/denuncias/nueva/_components/Step1Kind.tsx:13-21` — the animal-cruelty
   category picker is ALL emoji: 🚪🍃🩹⛓️🌧️🏚️⚡📦❓ for abandonment/neglect/physical
   abuse/chained/no-shelter/hoarding/dog-fighting/trafficking. Worst tonal mismatch
   in the repo — the most serious flow in the product.
2. `Step2Severity.tsx:39,49,59` — severity picker: 🚨⚠️🔍. Same clash.
3. `components/pet-profile/LostCaseBlock.tsx:146-147` — 🚨 prefixes the generated
   WhatsApp/social share text for a lost-pet alert (goes out under the citizen's name).
4. `app/(public)/p/[publicToken]/encontre/action.ts:330-331` — 🚨 in generated
   contact-owner message ("🚨 URGENTE: ...").
5. `components/pet-profile/LostScanFeed.tsx:96` — "🏠 ¡Alguien tiene a tu mascota!" —
   emoji + exclamation stacked, owner-facing critical notification.
6. `app/(public)/adoptar/[petToken]/page.tsx:730` — 🎉 rendered at 56px, most
   visually prominent emoji in the codebase.
7. `app/(public)/refugios/[orgToken]/HelpPanel.tsx:42-70` — ❤🏠🎁🎁👥 on a
   donation/money-ask panel — unserious exactly where trust matters most.
8. `lib/domain/ppp-public-badge.ts:8` — `buildPppHeadline()` returns
   "⚠ Animal Potencialmente Peligroso (PPP)" — raw ⚠ baked into a legally-grounded
   public badge (Ley CABA 4078 / Ley Prov 14.107) on the public credential.
9. `app/(public)/p/[publicToken]/page.tsx:608` — ♥ on the flagship public credential.
10. `app/admin/acerca/integracion-miarg/page.tsx:39,64,65` — 🇦🇷🐕🐈 on the Mi
    Argentina explainer. Flag emoji have a REAL cross-platform rendering bug risk
    (Windows renders many as literal "AR" text) on the most strategically sensitive page.

## Replace effort model

- **(a)-removal only** (~14 files): HelpPanel, AdoptionShareRow, PosterPreview
  (printed poster — emoji in the print/PDF pipeline is font-dependent, extra risk),
  encontre/action.ts, integracion-miarg, MergedShareSheet, share-text generators,
  denuncias Step copy lines.
- **(b) pure drop-in, ICON_MAP entry exists** (~30 files): LibretaSanitariaView
  `getIcon()` (all 9 branches map 1:1), ServicesPanel (all 5), standalone
  ✓/✗/⚠/✎/📍/📞/🐾 hits, AmendedBadge, Tabs/Sheet "✓ completo" badges,
  ErrorBoundary ⚠ (what users see on crash — prioritize), LostScanFeed/
  LostPublicCredential decoratives, panorama close buttons (DetailDrawer:792,
  PanoramaRail:199, SavedViewsPopover:143, PanoramaConsole:4688), PeriodPanel ✓,
  CapabilityMatrix ✓/✕ (9 hits — dense table, confirm density visually first).
- **(b) needs NEW lucide import in ICON_MAP first** (~10 files): Microscope, Star,
  unlock, Mail, printer, hospital (or reuse BriefcaseMedical), Paperclip, gift,
  Step1Kind's door/chain/rain/dilapidated-house.
- **(b) structural/type-level** (3 shared components): OpStatusPill+OpStateBadge+OpKpi
  icon-as-string contract; VaulSheet/Sheet/Card close-button dedup (consider one
  shared CloseButton).
- **Design decision needed first**: AlertInboxTable ▲◔◑◕●○ pie-fill glyphs.

Total distinct files: ~58.

## Phase 5 sweep (report-only)

1. **Exclamations**: ~30 genuine `¡...!` uses; nearly all are toast/confirmation
   copy ("¡Copiado!", "¡Listo!") — legitimate es-AR register. Two deliberate-decision
   spots: `LostCaseBlock.tsx:224` "¡Apareció!" is a PRIMARY CTA label (different
   register than a toast); `LostScanFeed.tsx:96` stacks emoji + exclamation.
   DRY note: "¡Copiado!" is hand-duplicated in ~7 files despite
   `components/ui/CopyButton.tsx` defaulting to that exact string.
2. **ALL-CAPS**: no genuine shouting found. `URGENTE` (PetCard) renders through
   `LnBadge variant="danger"` — the sanctioned stamp idiom. `StatusFlag` caps
   (REGISTRADA/PERDIDO/VIGENTE...), "LIBRETA SANITARIA NACIONAL" watermark, scope
   chips = deliberate official-document seal motif; PRESERVE, don't flatten.
3. **Placeholder/lorem/TODO in UI**: clean. `DIM-XXXX-XXXX` hits are intentional
   token-format examples.
4. **Label capitalization**: consistently sentence-case; no drift found in sample.

## Sanctioned-typography whitelist (for the lint fence)

- `→` in link/CTA affordances and legend reading-direction copy.
- `·` as separator (kickers, metadata rows).
- `×` (U+00D7) in dimensions ("44×44px"), formulas ("cobertura × señal"), "×N"
  repeat badges. EXCLUDE the standalone-× close-button pattern (that's (b)).
- Tracked uppercase via LnBadge/OpScopeChip/StatusFlag-style components — match the
  fence on component usage / .uppercase className, not literal-caps strings.
- Do NOT whitelist: bare emoji, standalone ✓✗✕⚠★☆✎●○⏸▶◔◑◕ JSX text nodes
  (route through `<Icon>`), flag emoji (cross-platform rendering risk).
