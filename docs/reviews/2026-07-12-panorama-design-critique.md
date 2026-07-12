# Panorama — holistic frontend-design critique (2026-07-12, task #53)

> READ-ONLY craft critique. No code edits. Branch `integration/all-20260703`.
> This is the layer BELOW the functional QA (`docs/reviews/2026-07-12-panorama-qa-rootcause.md`)
> and the C1–C10 canon audit: the console now *works* and is *coherent* — this asks
> whether it is **crafted**. Dimensions the PO named: HIERARCHY, SPACING/rhythm,
> COMPONENT STATES, MOTION/fluidity, SYSTEM CONSISTENCY.
>
> Scope read: every floating chrome surface in `components/panorama/**` +
> `src/modules/panorama/**` + the token layer (`app/globals.css`) + the composition
> in `PanoramaConsole.tsx:4231-4490`. Findings are ranked by **visual impact**:
> **P1** = jarring / hurts usability, **P2** = polish, **P3** = nice-to-have.
>
> **What this is NOT.** It does not re-report anything already fixed or already
> ticketed by the QA rounds (radio-dot cards, disabled+tooltip rate chips, icon
> disambiguation, legend endpoints, period reload, ghosting, nav-input model, inset
> drill, the 3-bespoke-tables *structural* duplication under #33). Where a craft
> issue is the visible *face* of a known structural item, it says so and stays on the
> craft angle.

---

## Verdict up front

**How crafted is it, honestly: 7 / 10.**

The *foundations* are genuinely strong — well above typical internal-tool quality.
The token system is disciplined (radii/type/color all named, `app/globals.css`),
the contrast work is meticulous (mute/faint/warn were each darkened to pass WCAG AA
with the ratios annotated inline, `globals.css:228,229,239`), the a11y state model is
excellent (roving-tabindex radiogroups, `aria-disabled`+tooltip, live regions,
reduced-motion handled globally at `globals.css:453`), and the loading model is
disciplined (QA round 3 item 4 confirmed HEALTHY).

Where it falls short of "crafted" is two places, both traceable to the iterative
QA history (many hands, many rounds):

1. **Motion is almost entirely absent at the structural level.** Colors transition;
   *surfaces* do not. The dock, the rail panels, and every overlay popover simply
   *appear* — no entrance, no height ease. On a console whose defining gesture is
   "float a panel over a live map," the missing choreography is the single biggest
   craft gap, and the PO named motion explicitly.
2. **Consistency has drifted across the panels.** One job — "which of these is
   selected?" — is answered five different ways. Uppercase eyebrow labels use four
   un-tokenized letter-spacings. The two dock tables read as two different apps.
   None of these is broken; together they are the fingerprint of a surface built in
   layers rather than composed.

Fix the motion layer and unify the selection/eyebrow idioms and this is a 9.

---

## Dimension 1 — MOTION / fluidity

The weakest dimension, and the one the PO flagged. Good news first: **reduced-motion
is respected globally** (`globals.css:453-460` collapses all transitions/animations)
and `transition-colors` is applied consistently to every hover/active button. The gap
is entirely at the **surface / structural** level.

### P1 — The dock opens and closes with no transition (`PanoramaDock.tsx:114-119`)
The dock is the console's primary expand gesture ("MÁS MAPA, la lista es opcional").
It grows to `height: 42%` over the map via an inline `style={open ? { height: "42%" } : undefined}`
with **no CSS transition on height** — so a large surface *snaps* open and shut over
the live map. This is the most-felt motion gap on the screen.
- **Recommendation.** Height-to-intrinsic is the classic un-animatable case, so don't
  fight it with `height`: animate a `transform: translateY` on the panel body (slide
  up from the bar) or a `grid-template-rows: 0fr → 1fr` wrapper, ~180–220ms
  `cubic-bezier(0.4,0,0.2,1)` (the curve already used at `globals.css:932`). The
  collapsed bar stays put; only the expanding body eases. Respect the existing global
  reduced-motion rule (it already will).

### P2 — Rail panels and overlay popovers pop in with no entrance
`PanoramaRail` mounts its panel conditionally (`{activeItem && <RailPanel …/>}`,
`:147`) — it appears instantly with no fade/scale. `OverlayDisclosure` (the scope-pill
menu, the legend expansion) toggles a native `<details open>` (`OverlayDisclosure.tsx:88-107`)
whose panel likewise appears with zero transition. Five different floating panels, one
shared "just appears" behavior.
- **Recommendation.** Give the floating-panel family ONE entrance: a 120–160ms
  `opacity 0→1` + `translateY(-4px)→0` (panels opening down) / `+4px→0` (opening up).
  Because the panel is anchored, a tiny slide+fade reads as "it came from the trigger."
  Do it once in `OverlayDisclosure` and in `RailPanel` and every popover inherits it.

### P2 — The KPI active-card elevation change is un-transitioned (`KpiChips.tsx:265-269, 311`)
Selecting a metric flips the card from `shadow-md` to `shadow-lg ring-2 border-l-4`,
but the button only carries `transition-colors` (`:311`) — so the shadow, ring, and
border-width **snap** while the border-*color* eases. The selection "clunks" instead of
settling.
- **Recommendation.** Widen the transition to `transition-[colors,box-shadow]` (or add
  `transition-shadow`) so the elevation lands smoothly. (Pair with the P1 layout-shift
  fix in the STATES section.)

### P3 — No shared micro-interaction on scope drill / layer toggle
Scope drill and layer toggle commit shallowly and the map repaints, but the *chrome*
gives no acknowledgement (no brief highlight pulse on the newly-active card, no settle
on the scope pill). Not required, but a 1-frame confirm would make the "one system"
feel land. Optional.

---

## Dimension 2 — SYSTEM CONSISTENCY

The most *findings* live here. Individually minor; collectively they are why the screen
reads as "assembled" rather than "designed as one." All are cheap.

### P2 — "Selected" is signalled five different ways across sibling panels
One job (mark the chosen item in a single-select list) has five idioms:

| Surface | Selected signal | a11y role |
|---|---|---|
| KPI cards (`KpiChips.tsx:265-267,350`) | radio dot ◉ + azul border-l + ring | `role="radio"` ✅ |
| Preset strip/list (`PresetPanel.tsx:139-143`) | azul **fill**, no glyph | `role="radio"` ✅ |
| Período list (`PeriodPanel.tsx:89-99`) | **`✓` checkmark** + azul fill | **`aria-pressed`** ❌ |
| Dock tabs (`PanoramaDock.tsx:165-169`) | azul **underline** (border-b-2) | `role="tab"` ✅ |
| Simple/Detalle (`SimpleDetalleToggle.tsx:28-32`) | azul fill | `aria-pressed` |

Two of these are *the same control type* — Período and the Preset "list" layout are both
single-choice vertical menus in sibling rail panels — yet one uses a checkmark +
`aria-pressed` and the other uses fill + `role="radio"`. **Período never received the
radiogroup upgrade the KPI cards got in round 2.** A screen-reader user hears "toggle
button, pressed" on a period that is semantically a radio.
- **Recommendation.** Adopt ONE single-select idiom: `role="radio"` + roving tabindex +
  azul fill (the `PresetPanel` pattern, already the house style). Promote `PeriodPanel`
  to a real radiogroup and drop the `✓` column (the fill *is* the selected cue). Keep
  the dock underline (tabs are a distinct, legitimately different pattern) and the
  KPI radio-dot (it doubles as the read-only-vs-tappable signal). This is the same
  round-2 fix, applied to the one panel that was missed.

### P2 — Uppercase "eyebrow" labels use four un-tokenized letter-spacings
The uppercase micro-label role appears everywhere with no single tracking value:
`tracking-[0.06em]` (`KpiChips.tsx:416`), `0.08em` (`MapDataTable.tsx:161`,
`RankedUnitsPanel.tsx:93`), `0.1em` (`FiltroPanel.tsx:74`, masthead `PanoramaConsole.tsx:4240`),
`0.12em` (`PresetPanel.tsx:203`, scope pill `:4398`, `RankedUnitsPanel.tsx:80`). The
*color* also varies for the same role: `text-ln-op-mute` (most), `text-ln-op-ink-2`
(MapDataTable th, masthead), `text-ln-op-faint` (RankedUnitsPanel caption).
- **Recommendation.** Define ONE eyebrow treatment — pick a single tracking (0.1em is
  the median) and a single color (`ln-op-mute`) — and apply it everywhere, ideally as a
  small utility class (`.op-eyebrow`) so it can't drift again. This is exactly the
  token-ratchet discipline the project already applies to radii/type; extend it to the
  eyebrow.

### P2 — The two dock tables read as two different visual systems
Sibling tabs, two languages (this is the craft face of the known-structural 3b / #33
`<DockTable>` primitive — reported here only for the *look*, not to re-litigate the
architecture):

| | Registros (`MapDataTable.tsx:157-191`) | Estadísticas (`RankedUnitsPanel.tsx:114-160`) |
|---|---|---|
| Container | bordered `max-h-80` scroll box, `--radius-md` | bare `<ol>`, no frame |
| Rows | `<tr>` `border-b line/50`, **no hover, no interaction** | `<button>` `--radius-sm`, hover + highlight + click |
| Hover tint | — | `bg-ln-op-line/50` (grey) — everywhere else hovers `ln-op-stripe` |
| Header | `tracking-0.08em text-ln-op-ink-2` | `tracking-0.12em text-ln-op-mute` |

The odd one out is the Estadísticas row hover (`bg-ln-op-line/50`, `RankedUnitsPanel.tsx:135`):
every *other* list on the screen hovers to `ln-op-stripe`. And Registros rows are inert
while Estadísticas rows are interactive, so the same "per-unit row" reads as clickable in
one tab and dead in the other.
- **Recommendation.** Even before the `<DockTable>` primitive lands (#33), do a cheap
  consistency pass NOW: unify the hover tint to `ln-op-stripe`, the header tracking/color
  to the eyebrow token above, and decide one row-interaction story (both hover-sync to
  the map, or neither). The QA doc already sanctions starting the #53 consistency pass
  before the full primitive.

### P3 — Raw text glyphs used instead of the `Icon` system
`✕` close (`PanoramaRail.tsx:199`), `≡` drag handle (`PanoramaDock.tsx:122`), `▾/▴`
expand (`PanoramaDock.tsx:192`, `LegendPill.tsx:192`), `◉ ▾` scope pill
(`PanoramaConsole.tsx:4388,4392`), `✓` period (`PeriodPanel.tsx:98`). These render at the
font's glyph weight/baseline, not the Lucide grid the rest of the rail uses (`Icon`,
`PanoramaRail.tsx:137`) — so they sit slightly off-size and off-baseline next to real
icons. Decorative arrows in deltas (`▲▼＝`) are fine to keep.
- **Recommendation.** Route structural glyphs (close, expand, drag, caret) through the
  `Icon` component for consistent optical size/weight. Low priority, high tidiness.

### P3 — Selected-fill opacity is `azul/10` almost everywhere but `azul/15` once
`azul/10` is the house "selected tint" (rail trigger `:133`, preset list `:142`,
Simple/Detalle `:30`, Período `:93`, dock badge `:173`). The Preset **strip** uses
`azul/15` (`PresetPanel.tsx:140`). One-off.
- **Recommendation.** Pick one (`/10`) or promote the tint to a token
  (`--color-ln-op-azul-sel`) so it's a decision, not a literal.

---

## Dimension 3 — COMPONENT STATES

Genuinely the strongest dimension after foundations — the round-2/3 work paid off. Rest,
hover, active, disabled, focus, loading, empty, and error states are almost all present
and mostly honest. Remaining craft issues:

### P1 — Selecting a KPI card shifts its content 3px (`KpiChips.tsx:265-267`)
The idle card is `border` (1px all sides); the active card adds `border-l-4`, overriding
the left border to 4px. Because border sits inside the box, the +3px left border **pushes
the card's content 3px to the right** the instant you select it — a visible jump on the
primary map control, and it moves *under* the pointer.
- **Recommendation.** Reserve the accent-bar width in the rest state so selection doesn't
  reflow: keep a permanent `border-l-4 border-l-transparent` and only swap the *color* on
  active (color transitions are already covered by `transition-colors`). Zero layout
  shift, and the elevation now eases (see the MOTION P2). This is a two-token change.

### P2 — Two different opacities encode two different "unavailable" meanings, near-identically
In `FiltroPanel.tsx:90-94` a compatibility-blocked row is `opacity-40` while a
not-reproducible-under-scrub row is `opacity-50`. Two distinct semantics (can't-combine
vs won't-replay) at 40% vs 50% are visually almost the same grey, so the distinction is
lost, and neither carries a *positive* disabled affordance beyond dimming.
- **Recommendation.** If the two states must differ, differ them legibly (e.g. blocked =
  dimmed + a small lock/strike glyph; not-reproducible = dimmed + a "no reproducible"
  chip, which the row already hints at). If they needn't differ, use one opacity. Today's
  40-vs-50 split reads as inconsistency, not information.

### P3 — Checkbox/slider accent is grey (`accent-current`), not the brand azul
`FiltroPanel.tsx:99,168` set `accent-current` on the layer checkboxes and opacity slider,
so the checkmark/thumb inherit `ln-op-ink-2` (grey) while every other "on/selected" signal
on the screen is azul. The layer *color dot* sits right beside it, so the control has two
competing accents (grey check + colored dot).
- **Recommendation.** `accent-ln-op-azul` on the checkboxes/sliders to join the selection
  language — or keep grey deliberately and document why (the color dot owns the layer's
  identity). Either is fine; the current default-`current` reads as unconsidered.

### P3 — Some controls double the focus ring, most rely on the global one
`globals.css:445` gives every `:focus-visible` a real outline, so keyboard focus is
covered everywhere (good). But a few controls *also* add a local
`focus-visible:ring-2 ring-ln-op-azul` (rail close `PanoramaRail.tsx:197`, CabaInset
`CabaInset.tsx:292`) — so those show outline **and** ring, while the KPI cards, preset
buttons, dock tabs and period rows show the global outline only. Inconsistent focus
weight across peers.
- **Recommendation.** Decide one focus treatment (the global outline is enough) and remove
  the local `ring-2` overrides, or promote the ring to all interactive chrome. Don't mix.

**Credit:** the disabled-rate-chip (`aria-disabled` + tooltip, keeps it discoverable to
AT, `KpiChips.tsx:271-288`), the read-only-vs-tappable card distinction (dot present/absent),
the loading affordances (`:155-163`), the degraded/empty honesty states, and the
scrub-frozen "estado actual" pill (`:414-425`) are all well done.

---

## Dimension 4 — SPACING / rhythm

Mostly healthy — a real system is visible — with a few off-scale values and one coupling.

**What's good:** the floating chrome shares a consistent **edge inset of `3.5` (14px)** —
rail `right-3.5 top-3.5` (`PanoramaRail.tsx:103`), dock `inset-x-3.5 bottom-3.5`
(`PanoramaDock.tsx:114`), top-left cluster `left-3.5 top-3.5` (`PanoramaConsole.tsx:4372`),
legend `left-3.5` (`:4460`). The radii tier is coherent: floating panels `--radius-lg`
(8px), cards/buttons `--radius-md` (6px), pills `rounded-full`, inner ramps `--radius-xs`.
Gaps inside panels are tight and consistent (`space-y-0.5/1/2`).

### P2 — Off-scale paddings break the rhythm in a few spots
The dock body is `px-5 py-3` (`PanoramaDock.tsx:205`) — `px-5` (20px) is off the
otherwise-consistent 3/3.5 (12/14px) horizontal rhythm every other panel uses (rail panel
`p-3`, overlay `p-3`). The CabaInset uses a bespoke `right-[4.9rem]` and `w-[168px]` /
`h-[150px]` (`CabaInset.tsx:269,278`) — arbitrary px outside the token grid (the code
comments acknowledge the ratchet bans arbitrary values elsewhere, so these stand out).
- **Recommendation.** Bring the dock body to `px-4` and the CabaInset dims onto the spacing
  scale (or document them as deliberate map-geometry constants). Minor.

### P3 — The legend's vertical position is magic-number-coupled to the dock bar
`LegendPill` is pinned at `bottom-16` (`PanoramaConsole.tsx:4460`) to clear the collapsed
dock bar (`bottom-3.5` + `h-10` ≈ 54px). The 64px is hand-tuned to the current bar height;
if the dock bar height changes, the legend overlaps it. Not visible today.
- **Recommendation.** Derive the offset from the dock bar height (a shared token/var) so
  the two can't collide. Low priority.

---

## Dimension 5 — HIERARCHY

Largely correct, with one density concern.

**What's good:** the masthead is deliberately *quiet* — `text-xs uppercase` identity line
with only honesty chips on the right (`PanoramaConsole.tsx:4238-4282`) — so the **map is
unambiguously the hero**, exactly the "MÁS MAPA" ruling. Reading order in the top-left
column is right: **scope pill (azul, bordered, loudest) → vista → metric cards**. The
scope pill's solid azul border makes "where am I looking" land first, which is correct for
a situational console.

### P2 — Shadow density: a lot of separately-floating, separately-shadowed boxes
Count the shadowed floating surfaces over the map at once: scope pill (`shadow-md`), vista
pill (`shadow-md`), up to 4 KPI cards (`shadow-md` each), legend pill (`shadow-md`), rail
(`shadow-lg`), rail panel (`shadow-lg`), CabaInset (`shadow-lg`), dock (`shadow-lg`). That
is a dozen-plus independent drop-shadowed rectangles competing for figure/ground over a
busy basemap. Each is individually fine; together they read as "clutter of cards," which
works *against* the map-dominant hierarchy the masthead sets up.
- **Recommendation.** Consider consolidating the top-left stack: the scope pill, vista
  pill and KPI cards are three separately-bordered/shadowed boxes that could share one
  subtle container (one shadow, internal dividers) — fewer figure/ground edges, calmer
  map. Alternatively, lighten the KPI card shadow to `shadow-sm` and reserve `shadow-md+`
  for the truly-floating panels (rail/dock), creating a real two-tier elevation system
  instead of everything at md/lg. This is the "remove one accessory" pass.

### P3 — The vista name is stated in three places
"Vista · {name}" appears as its own pill top-left (`PanoramaConsole.tsx:4420-4423`), again
inside FiltroPanel (`FiltroPanel.tsx:62-67`), and drives the KPI de-dup labels. On a
map-dominant screen the standalone vista pill is the weakest-earning of the top-left boxes.
- **Recommendation.** Consider folding the vista label into the scope pill or the KPI
  cluster header rather than a standalone shadowed pill — one fewer floating box (feeds the
  P2 above). Product call, not a defect.

---

## Prioritised backlog (for a future polish pass — not to fix now)

**P1 (jarring / hurts usability)**
1. Dock opens/closes with no transition — animate the expand (`PanoramaDock.tsx:114-119`).
2. KPI card content shifts 3px on selection — reserve the accent-bar width (`KpiChips.tsx:265-267`).

**P2 (polish)**
3. Rail panels + overlay popovers have no entrance animation (`OverlayDisclosure`, `RailPanel`).
4. KPI active elevation is un-transitioned — widen to `transition-shadow` (`KpiChips.tsx:311`).
5. Unify the single-select "selected" idiom; promote `PeriodPanel` to a real radiogroup, drop `✓`.
6. Tokenize the uppercase-eyebrow tracking (4 values today) + color (3 today).
7. Align the two dock tables (hover tint, header, row interaction) ahead of the #33 primitive.
8. Two near-identical opacities for two disabled meanings in `FiltroPanel` (40 vs 50).
9. Off-scale dock body padding (`px-5`) + CabaInset arbitrary dims.
10. Shadow density — consolidate the top-left card stack / build a two-tier elevation system.

**P3 (nice-to-have)**
11. Route structural glyphs (✕ ≡ ▾ ▴ ✓) through the `Icon` system.
12. `azul/15` one-off vs the `azul/10` selected tint — pick one / tokenize.
13. Grey `accent-current` checkboxes/sliders vs the azul selection language.
14. Double focus-ring on a few controls vs the global outline on the rest.
15. Legend `bottom-16` magic-number coupling to the dock bar height.
16. Vista name stated three times; fold the standalone pill.

---

## What's already well-crafted (credit)

- **Token discipline** — radii/type/color fully named and tiered (`globals.css:124-254`);
  the arbitrary-value ratchet is real and mostly held.
- **Contrast rigour** — mute/faint/warn/rail-mute each darkened or lightened to pass WCAG
  AA with the exact ratios annotated inline (`globals.css:228,229,233,239`). This is
  unusually careful.
- **State a11y** — roving-tabindex radiogroups (`KpiChips`, `PresetPanel`, `PanoramaDock`),
  `aria-disabled`+discoverable-tooltip for inapplicable controls, live regions for scope
  and stale-data, `sr-only` labels throughout.
- **Reduced-motion** handled once, globally (`globals.css:453`).
- **Loading model** disciplined and gated (`showMapSkeleton = !mapIsPainting && …`) — no
  spurious spinners; confirmed HEALTHY in QA round 3.
- **No-layout-shift tabs** — dock tabs reserve the underline with `border-b-2 border-transparent`.
- **Legend collapsed-state richness** — endpoints, size hints, and the k-anon pill are
  always visible without expanding (`LegendPill.tsx`), satisfying canon C6 by construction.
- **Opaque fills over busy basemaps** — the #49 decision to drop translucent card tints is
  the right call for legibility over the map, and it's applied consistently.
