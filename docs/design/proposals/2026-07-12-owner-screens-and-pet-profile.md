# Design proposal — Owner screens (1b/5b/2b) + pet-profile 3b

> Date: 2026-07-12 · Author: Claude (design lead) · Status: **PO review — approve/adjust before code**
> Covers tasks **#9** (owner inicio + mis mascotas, from the handoff) and **#10** (pet-profile 3b craft improvement).
> Skin: citizen (`ln-*` / `Ln*`). Stack: Next.js 15 App Router, React 19, Tailwind 4.
> Source handoff: `docs/design_handoff_owner_screens/` (README.md + `Pantallas-Dueno.html`, gitignored).

This is a **spec an engineer implements next**, not aspirational art. Every visual maps to an existing `Ln*` primitive or an existing token; net-new pieces are named and bounded. Read the "Reuse vs new" table (§5) before coding.

---

## 0. The resolved conflict (read first)

Task #9's handoff wants a **per-pet credential CAROUSEL** on the owner home. The current `/inicio` (`app/(app)/inicio/page.tsx:1-14`) explicitly **removed** any per-pet carousel/registry under task #34 ("leaned"), collapsing the per-pet surface to a single `PetHealthStatusStrip` list. That was a genuine conflict (logged in `docs/reviews/2026-07-12-staging-readiness-triage.md:56`).

**PO decision (2026-07-12): the handoff wins. The carousel is IN.** This proposal designs it as a first-class element of the owner inicio, and re-homes the removed pieces (the "leaned" reminder/health surfaces) around it rather than discarding the good work in #34. The dedup lesson from #34 is preserved: **the carousel does not re-list what the Pendientes card already shows** — carousel = per-pet *state at a glance*; Pendientes = the unified *action queue*. They are different axes, not the duplication #34 removed.

---

## 1. Owner "inicio" — mobile (1b) + desktop (5b)

### 1.1 Intent
"La mascota es la credencial." The home opens on the pets themselves — a horizontally-scrolling rail of per-pet **credential cards**, most-urgent first — then a single unified **Pendientes** queue, then (desktop only) **Casos abiertos**. Capture ("Asentar un hecho") is always one tap away: a fixed bottom bar on mobile, per-card actions on desktop.

### 1.2 The per-pet credential CAROUSEL (the centerpiece)

**What each card shows** (handoff `.cred`, `Pantallas-Dueno.html:127-144`):
- Left **4px status accent border** (`::before`), colored by pet status: ok=`--color-ln-ok`, lost=`--color-ln-err`, sick=`--color-ln-warn`, pregnant=`--color-ln-rosa`. This is the SAME status axis `LnRegRow` already paints on its left edge (`components/ui/RegRow.tsx:74-78`).
- **Header row** (`.cred-top`): 56px `LnPetPhoto` (with its shape-coded status dot, `RegRow.tsx:29-70`; the standalone dot primitive is `LnStatusDot`, `components/ui/Chip.tsx:38`) + pet **name** (serif) + `LnStatusFlag` when the pet is in a non-default situation (`components/ui/StatusFlag.tsx:64`) + the credential id (`AR-Cxx-xxxxx`, mono 9px).
- **Body, healthy pet**: the vaccination mini-summary — up to 3 `cred-vac-badge` tiles (n in serif 18px + label mono 8.5px): Vigente / Por vencer / Vencida. This is the **exact same 3-state derivation** `VacunasStatusBadges` already computes (`deriveVacunasBadgeCounts`, `components/pet-profile/VacunasStatusBadges.tsx:29-43`) and the same `ok-050 / warn-025 / err-050` token trios. On a card we render the **read-only** compact form (no drill-down accordion — that stays on the profile).
- **Body, urgent pet (lost)**: replace vaccine badges with a `.cred-next` line — one sentence of state + reassurance ("Reportado hace 2 días en Villa Crespo. Su credencial pública está activa…") and **two actions**: `LnButton warn sm "Ver reporte"` + `LnButton ghost sm "Lo encontré"`. Card gets the `cred--lost` gradient wash (`err-050 → card`).
- **Card footer, desktop only**: `LnButton ghost sm` × 2 — "Asentar" + "Ver perfil" (handoff 5b: no global capture card on desktop; capture lives per-card and on the profile).

**Ordering (ALWAYS):** `perdido → en tratamiento → preñada → por vencer → al día → registrada` (handoff §Interactions; README:78). This is the urgency sort — the same `LnPetStatus` ranking the profile and `/mis-mascotas` already imply. The most urgent card is foregrounded (first, full 300px; healthy cards may shrink to 220px on mobile so a sliver of the next peeks — see mockup `flex-basis:220px`, `Pantallas-Dueno.html:592`).

**Interaction:** horizontal scroll with CSS scroll-snap; **position dots** below (`.cred-dots`, one per pet, active = `--color-ln-azul`). Desktop adds **circular 34px arrow buttons** flanking the rail (`.rail-arrow`) that advance one card, plus a 70px right-edge **fade mask** (`linear-gradient(90deg, transparent, --color-ln-paper)`) signaling more cards (`Pantallas-Dueno.html:233-242`). Active index + scroll position persisted in component state (handoff §State).

**"Active pet foregrounded":** the first (most-urgent) card is the visual anchor. We do NOT add a separate "selected pet" concept on the home — tapping a card body navigates to `/mis-mascotas/{token}`; the rail is a *glance-and-go* surface, not a pet-switcher with downstream state. (Open question Q1 — should the rail drive anything below it? Recommendation: no.)

### 1.3 Mobile wireframe (1b, 390px)

```
┌──────────────────────────────────────────┐  ← gob-stripe 5px (GobStripe)
│ ▐m  miMAR                            (S)  │  ← AppShell citizen masthead
├──────────────────────────────────────────┤
│                                            │
│  Hola, Sofía                    (serif h1) │
│  VIE 11 JUL 2026                (mono date) │
│                                            │
│  ┌─ CREDENCIALES (scroll →) ─────────────┐ │
│  │▌┌───────────────┐ ┌────────────────┐  │ │  ▌ = 4px status accent
│  │▌│●foto  Atún     │ │●foto Firulais  │  │ │
│  │▌│  [PERDIDO]     │ │  AR-C15-03318  │  │ │
│  │▌│ AR-C15-08841   │ │ ┌────┐┌────┐   │  │ │
│  │▌│ 📍 Reportado…  │ │ │ 3  ││ 1  │   │  │ │  ← cred-vac-badges
│  │▌│[Ver rep.][Lo…] │ │ │VIG ││P.V.│   │  │ │
│  │▌└───────────────┘ └────────────────┘  │ │
│  └────────────────────────────────────────┘ │
│              ● ○ ○         (cred-dots)        │
│                                            │
│  ┌─ 🔔 Pendientes                  [3] ──┐ │  ← LnCard + count pill
│  │ ● Control veterinario · Michi         │ │
│  │   MAÑ 15 JUL · 10:30 · Vet San Roque  │ │
│  │                            [Posponer] │ │
│  │ ● Vacuna antirrábica · Firulais       │ │
│  │   [POR VENCER] 16 jul · Vac. Municipal│ │
│  │                            [Posponer] │ │
│  │ ● Retomar adopción de Nube            │ │
│  │   Falta libreta · 60% completo        │ │
│  │                           [Continuar] │ │
│  └────────────────────────────────────────┘ │
│                                            │
│  Ayuda · Privacidad · Términos  (footer)   │
├──────────────────────────────────────────┤
│  [ + Asentar un hecho ]        (sticky)    │  ← fixed bottom, blur bg
└──────────────────────────────────────────┘
```

### 1.4 Desktop wireframe (5b, 1280px, page max-width 1120px)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ▐m miMAR      Inicio · Mis mascotas · Denuncias                    (S) Sofía │  masthead
├───────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Hola, Sofía                                        Ver las 6 mascotas →     │
│  VIERNES 11 DE JULIO DE 2026                                                 │
│                                                                             │
│  RAIL DE CREDENCIALES                                                        │
│  (◂) ┌──────────────┐┌──────────────┐┌──────────────┐┌────────────╌╌ (▸)   │
│      │▌●foto Atún    ││ ●foto Firulais││ ●foto Michi  ││ ●foto Nala  ╌(fade) │
│      │▌[PERDIDO]     ││ AR-…03318     ││ [EN TRAT.]   ││ AR-…       ╌╌       │
│      │▌📍 Reportado… ││ [3][1] vac    ││ Control 15/7 ││ [4] vig    ╌╌       │
│      │▌[Ver rep][Lo…]││[Asentar][Ver]││[Asentar][Ver]││[Asentar]…  ╌╌       │
│      └──────────────┘└──────────────┘└──────────────┘└──────────────        │
│                        ● ● ○ ○ ○ ○   (dots, 1 per pet)                       │
│                                                                             │
│  ┌── 1.4fr ────────────────────────────┐  ┌── 1fr ────────────────────────┐ │
│  │ 🔔 Pendientes                   [4] │  │ 📁 Casos abiertos          [3] │ │
│  │ ● Control veterinario · Michi       │  │ Extravío de Atún   [Abierto]   │ │
│  │   MAÑ 15 JUL · 10:30 · San Roque    │  │ VILLA CRESPO · hace 2 días     │ │
│  │                        [Posponer]   │  │ Transferencia Nube [En rev.]   │ │
│  │ ● Vacuna antirrábica · Firulais     │  │ REFUGIO PATITAS · hace 1 día   │ │
│  │   [POR VENCER] 16 jul · Municipal   │  │ Adopción Kiwi      [En espera] │ │
│  │                        [Posponer]   │  │ hace 5 días                    │ │
│  │ ● Retomar adopción de Nube 60%      │  │                                │ │
│  │ ● Esterilización sugerida · Nala    │  │                                │ │
│  └─────────────────────────────────────┘  └────────────────────────────────┘ │
│                                                                             │
│  Documento sincronizado   + Denunciar maltrato   MiMAR · Registro Nacional   │
└───────────────────────────────────────────────────────────────────────────┘
```

Desktop grid is `1.4fr 1fr` gap 18px (handoff 5b) — this reuses the current inicio's existing right-column pattern (`inicio/page.tsx:337`, currently `1fr 320px`). **Casos abiertos** on the right reuses `CasesWidget` (`inicio/page.tsx:388`) with `LnBadge` danger/warning/info per case status (handoff 5b: Abierto/En revisión/En espera).

### 1.5 Pendientes — the unified queue (replaces two current surfaces)

The handoff's Pendientes card is **one list** of reminders + turnos + adopción-en-curso, ordered by date/urgency. Today these are three separate surfaces on `/inicio`: `RemindersSection` (`inicio/page.tsx:289`), the "Próximos turnos" `LnCard` (`:362`), and the health-strip nudges. **This proposal unifies them into one Pendientes card** — which is also exactly what `owner-process-clarity.md` Lens 3 asks for (surface open cycles on the home).

Each Pendientes row (handoff `.rem-row`): mini-avatar with status dot + title (pet name in serif) + meta (mono uppercase) + a right-side action button (`Posponer` / `Continuar` / `Programar`) as `LnButton ghost sm`. The row is a lighter cousin of `PetHealthStatusStrip`'s `NudgeRow` (`inicio/_components/PetHealthStatusStrip.tsx:24-45`) — reuse that row's link/hover pattern.

> **Dedup guard (honoring #34):** a reminder appears **once** — in Pendientes. The carousel card shows vaccine *vigencia counts* (a state summary), never the actionable reminder row. This is the #34 dedup rule re-expressed for the new layout, not a regression of it.

### 1.6 First-run / empty state (fresh vs returning-0-pets)

Deferred in detail to `owner-process-clarity.md` (sequenced after this redesign), but the layout must leave a clean seam:
- **Zero pets, fresh:** no carousel, no Pendientes. A single `LnEmptyState variant="dashed"` (`components/ui/EmptyState.tsx`, already used at `inicio/page.tsx:345`) leading with "Cargá tu primera mascota" + `LnButton primary`. The sticky "Asentar un hecho" bar is **hidden** pre-first-pet (nothing to asentar against). This fixes the current bug where a 0-pet owner sees "Todo en orden" over a dead capture card.
- **Returning-0-pets** (had pets, none active): distinct copy ("Tus mascotas activas aparecerán acá") — flagged, not designed here.

---

## 2. "Mis mascotas" (2b)

### 2.1 Intent
The complete household registry — every pet, ordered by urgency — plus the two entry points the home deliberately omits: **alta** (inscribir) and **reclamo** (claim by code). This screen is the carousel's "see all" destination (the desktop "Ver las N mascotas →" link points here).

### 2.2 What changes vs today
The current `/mis-mascotas` (`app/(app)/mis-mascotas/page.tsx`) is already **90% of the 2b handoff** — it uses `LnRegistry` + `LnRegRow` (72px) ordered rows, an In-memoriam sepia section, and a "Más acciones" grid. The handoff asks for three refinements:

1. **Subtitle count** — header gains "N activas · M en memoria" (handoff 2b.1). Today the subtitle is static copy (`page.tsx:113`). Cheap: derive from `activePets.length` / `deceasedPets.length` already computed at `page.tsx:92-93`.
2. **Urgency ordering** — rows sorted `Perdido → En tratamiento → Al día` (handoff 2b.2). Today rows render in query order (`page.tsx:159`). Add a client-free sort by the same `LnPetStatus` rank the carousel uses. **Reuse, don't re-derive:** `lnPetStatusFromCompliance` is already called per row (`page.tsx:161-166`).
3. **Reclamar card promoted** — the handoff wants an inline "Reclamar una mascota" card with a mono code input (`TRF-8K2M-91`) + `LnButton primary`, plus the note "el titular actual debe confirmar" (handoff 2b.4). Today reclamar is one tile in the "Más acciones" grid linking to `/mis-mascotas/reclamar` (`page.tsx:224-229`). **Recommendation:** keep the destination page (it holds the real `ClaimWizard`), but surface a richer inline card. Q3 for the PO: inline the whole claim input on the list, or keep it a promoted card that routes to the wizard? (Recommendation: promoted card → wizard; avoids duplicating validation.)

### 2.3 Relationship to the carousel
Same data, two densities. The carousel (home) = urgent-first, glanceable, capped visual set. Mis mascotas = complete, scannable, with alta+reclamo. A pet's left-border status color and `LnStatusFlag` are identical across both so the two never disagree (the `lnPetStatusFromCompliance` single-mapper guarantees this — `page.tsx:29`).

### 2.4 Wireframe (2b, 390px)

```
┌──────────────────────────────────────────┐
│ ▐m miMAR                            (S)   │
├──────────────────────────────────────────┤
│  Mis mascotas                              │
│  3 activas · 1 en memoria   [+ Agregar]    │
│                                            │
│  ┌─ LnRegistry ─────────────────────────┐ │
│  │▌(●)foto  Atún        [PERDIDO]        │ │  ▌ err border
│  │   Mestizo · Macho              CANINA ›│ │
│  │▐(●)foto  Michi       [EN TRATAM.]     │ │  ▐ warn border
│  │   Siamés · Hembra              FELINA ›│ │
│  │ (●)foto  Firulais    [AL DÍA]         │ │
│  │   Labrador · Macho             CANINA ›│ │
│  └────────────────────────────────────────┘ │
│                                            │
│  † IN MEMORIAM · 1 recordada               │
│  ┌────────────────────────────────────────┐ │
│  │ (sepia) Rocco   2009 – 2024  Ver mem. ›│ │
│  └────────────────────────────────────────┘ │
│                                            │
│  ┌─ Reclamar una mascota ───────────────┐ │
│  │ Tu mascota ya tiene chapita o chip.    │ │
│  │ [ TRF-8K2M-91        ] [ Reclamar ]    │ │
│  │ El titular actual debe confirmar.      │ │
│  └────────────────────────────────────────┘ │
│                                            │
│  MÁS ACCIONES                              │
│  [Postulaciones ②] [Transferencias ①]      │
└──────────────────────────────────────────┘
```

The pending-cycle badges (postulaciones / transferencias) already exist (`page.tsx:235,242`); the handoff keeps them. `owner-process-clarity.md` Lens 3 will *also* surface these on the home Pendientes — this screen stays the canonical registry.

> **Seam for the deferred follow-up:** a **lost pet has no nudge kind today** — `owner-nudges.ts` `NudgeKind` (`lib/infra/owner-nudges.ts:58-62`) knows only `vaccine_overdue` / `chip_missing` / `scan_activity` (and a declared-but-unemitted `sterilization_pending`); there is no `lost`. The carousel's urgent-first lost card partly covers this on the home, but the Pendientes "lost" nudge is `owner-process-clarity.md` Lens 3 work. Leave the Pendientes row model open to a `lost` kind.

---

## 3. Pet-profile 3b (task #10 — Claude takes design lead)

### 3.1 What exists today (and it's good)
The profile is already the **"Una sola libreta" two-face document** — a genuinely strong, well-tested design. Front face `CredentialFace` (`components/pet-profile/CredentialFace.tsx`), back face `LibretaFace` (`components/pet-profile/LibretaFace.tsx`), flipped via `FlipCard` + a segmented Credencial/Libreta control (`PetDetailTabsPanel.tsx:306-322`). It carries real craft the handoff should NOT throw away:
- **Provenance gating** — a stamp only reads "al día" when a professional/institutional-verified event backs it (`CredentialFace.tsx:16-17`). This is the product's integrity spine.
- **Situation skins** (#42) — lost/observación/gestación/tránsito adopt the credential's band tint + one status line, demoting the passive "Inscripta" badge (`CredentialFace.tsx:145-191`).
- **In-Memoriam skin** (ADR-15), the append-only immutability note, tap-to-call Emergencia block, weight sparklines + the provenance stamp (`.ln-prov`: green "Verificado" vs neutral "Cargado por vos") on `AsientoCard` (`components/pet-profile/AsientoCard.tsx:84,146`). The compliance grid itself is `ComplianceObligationsPanel` (`components/pet-profile/ComplianceObligationsPanel.tsx`), re-hosted `bare` inside the front face.

**Keep the two-face system. It is the crown jewel.** Task #10 is craft refinement, not a rewrite.

### 3.2 The one real tension: the front face is heavy on mobile
Today's `CredentialFace` renders EVERYTHING inline on the front: identity → full `ComplianceObligationsPanel` grid → Avisos strip → embedded `EventCatcherSingle` textarea → icon action row (`CredentialFace.tsx:160-308`; assembled `page.tsx:659-713`). On a 390px screen that is a long scroll before the owner reaches the libreta flip.

The 3b handoff proposes a **lighter front**: credential hero + a **3-row disclosure list** (`.disc-list`, `Pantallas-Dueno.html:163-172`) that routes into depth:
- **Cumplimiento** — "3 de 4 al día · falta esterilización" + `LnVstamp due "3/4"`
- **Libreta sanitaria** — "Último asiento hace 3 días · peso"
- **Datos y dorso** — "Titular, microchip, contacto de emergencia"

### 3.3 Recommendation (the #10 design call)
**Adopt the handoff's symmetric credential hero; make the compliance panel a progressive disclosure on mobile only; keep it inline on desktop.** Concretely, my top-3 improvements:

**(A) Symmetric photo + QR flanking the band.** Today the photo overlaps the band on the left and the QR is a separate right-hand block of unequal visual weight (`CredentialFace.tsx:159-222`). The handoff's 3b makes **both** the 88px photo and the 88px QR poke out of the band by −38px, one on each side, identity centered between them (`Pantallas-Dueno.html:153,157` + README:60). This reads as a real government credential — balanced, symmetric, the QR elevated to equal identity weight (it IS the credential). **Change:** rework `.ln-idrow` to a 3-column `photo | centered identity | QR` with both side elements at `margin-top:-38px` and matching white 4px frames + shadow (`0 0 0 4px #fff, 0 10px 24px…`, already the `--shadow` token pattern). Net: CSS + markup reorder in `CredentialFace`, no new component.

**(B) Compliance as a disclosure summary on mobile.** Replace the always-expanded compliance grid on the front with a `.disc-list` row that shows the **aggregate** ("3 de 4 al día · falta esterilización") + an `LnVstamp`, tapping to expand inline (or to the existing Cumplimiento detail). Keep the full grid inline on `≥768px` (desktop has the room). This preserves the provenance-gated `ComplianceObligationsPanel` verbatim — it just gets a collapsed presentation on small screens. The disclosure summary text derives from the SAME `complianceState.summary` the panel already computes (`page.tsx:474`), so the two can never disagree. **This is the biggest craft win: the front becomes glanceable, depth stays one tap away, integrity is untouched.**

**(C) Move inline capture to the fixed "Asentar un hecho" bar.** Today `EventCatcherSingle` is an inline textarea mid-front-face (`page.tsx:701`). The handoff (1b/3b) makes capture a **fixed bottom bar** — consistent with the home. This declutters the front face and makes "asentar" muscle-memory identical everywhere. The quiet action links (Compartir · Editar datos · **Marcar como perdido** in seal red) sit just above it (handoff 3b.5; reuse `PetActionRow` restyled from icon-row to quiet-link-row, `components/pet-profile/PetActionRow.tsx`).

### 3.4 What NOT to change
- The Libreta back face (`LibretaFace`) — the handoff's "Datos y dorso" disclosure simply routes to it (flip). No redesign.
- Provenance gating, situation skins, memorial skin, immutability note — all stay verbatim.
- `VacunasStatusBadges` drill-down accordion stays on the libreta face (`LibretaFace.tsx:87`).

### 3.5 Wireframe (3b, 390px) — proposed lighter front

```
┌──────────────────────────────────────────┐
│ ‹ Mis mascotas                      (S)    │  masthead back-link
├──────────────────────────────────────────┤
│  Firulais                     [AL DÍA]     │  serif 24 + flag
│                                            │
│  ┌─ Credencial · Frente ────────────────┐ │  segmented control
│  │ [▐ Credencial ]  [ Libreta ]          │ │  (FlipCard tabs)
│  ├────────────────────────────────────────┤ │
│  │▟▟▟ LIBRETA SANITARIA NACIONAL ▟▟▟▟▟▟▟▟│ │  blue band 52px
│  │  ┌────┐        Firulais        ┌────┐  │ │
│  │  │foto│      ✓ Inscripto       │ QR │  │ │  ← both poke out −38px
│  │  └────┘   Mestizo·Macho·Perro  └────┘  │ │     symmetric
│  │            AR-C15-03318                 │ │
│  ├────────────────────────────────────────┤ │
│  │ 🛡 Cumplimiento                         │ │  ← disc-list rows
│  │    3 de 4 al día · falta esteril. [3/4]›│ │
│  │ 📖 Libreta sanitaria                    │ │
│  │    Último asiento hace 3 días · peso  ›│ │
│  │ 👤 Datos y dorso                        │ │
│  │    Titular, microchip, emergencia     ›│ │
│  ├────────────────────────────────────────┤ │
│  │   Compartir · Editar · Marcar perdido  │ │  quiet links (seal)
│  └────────────────────────────────────────┘ │
│                                            │
├──────────────────────────────────────────┤
│  [ + Asentar un hecho ]        (sticky)    │
└──────────────────────────────────────────┘
```

> **Note on scope tension:** the current front face is heavily invested (avisos strip, situation skins, embedded capture). Moving to a disclosure list is a real change to a shipped, tested surface. If the PO prefers minimal churn, improvement (A) alone (symmetric photo+QR) already lifts the craft substantially and is low-risk. (A) is the safe floor; (B)+(C) are the fuller vision. See Q4.

---

## 4. Design tokens + brand voice (applies to all screens)

All values below already exist in `app/globals.css` — **add zero raw values** (`lint:tokens` blocks `bg-[#…]`, `text-[14px]`, `dark:`):
- Color: `--color-ln-azul` (globals.css:41), `--color-ln-celeste` (:44), `--color-ln-ink` (:48), `--color-ln-ok` (:61), plus `-warn` / `-err` / `-rosa` / `-seal` families. Operator tokens `--color-ln-op-*` (:210+) are **off-limits** (citizen skin only).
- Type: `--font-ln-serif` (IBM Plex Serif, :33) for names/h1, `--font-ln-mono` (IBM Plex Mono, :35) for IDs/dates/eyebrows, Encode Sans (`--font-sans`, :29) for body, Caveat (`--font-ln-caveat`, :36) for handwritten libreta notes only.
- Radius: `--radius-card` 16px (:125), `--radius-pill` (:126). Note the handoff's `.cred` carousel cards use **12px** and disc rows 8px (`--radius-lg`) — these smaller radii already exist as `--radius-md/-lg`; use them, don't invent.
- Size: `--text-sm` 12px (:156), `--text-md` 14px (:157).

Voice: es-AR **voseo**, warm but institutional. "Libreta Nacional" / "Registro Nacional de Mascotas" identity. `lint:ui` blocks visible English + sub-44px touch targets — every carousel action button and disc row is ≥44px.

---

## 5. Reuse vs. new component

| Piece | Verdict | Source / where |
|---|---|---|
| AppShell citizen (gob-stripe + masthead) | **Reuse** | `components/layout/AppShell.tsx` (`variant="citizen"`, `tabBar`, `maxWidth` props) + `GobStripe` |
| `LnButton` (primary/ghost/warn/seal, sm/md/lg, block) | **Reuse** | `components/ui/Button.tsx:69` |
| `LnCard` / `LnCardHead` / `LnCardBody` (Pendientes, Casos) | **Reuse** | `components/ui/Card.tsx` (used `inicio/page.tsx:298,363`) |
| `LnPetPhoto` (56px card / 48px memorial, status dot) | **Reuse** | `components/ui/RegRow.tsx:29` |
| `LnRegRow` / `LnRegistry` (mis mascotas rows) | **Reuse** | `components/ui/RegRow.tsx:93,178` |
| `LnStatusFlag` (PERDIDO/AL DÍA/…, shape+icon+label) | **Reuse** | `components/ui/StatusFlag.tsx:64` |
| `LnVstamp` (Vigente/Por vencer/Vencida; the 3/4 stamp) | **Reuse** | `components/ui/StatusFlag.tsx:124` |
| `LnBadge` (Casos: Abierto/En revisión/En espera) | **Reuse** | `components/ui/Badge.tsx` |
| `LnEmptyState` (first-run, no-pets) | **Reuse** | `components/ui/EmptyState.tsx` |
| `VacunasStatusBadges` derivation (card vac counts) | **Reuse logic** | `deriveVacunasBadgeCounts`, `VacunasStatusBadges.tsx:29` — render a compact read-only variant on the card |
| `CasesWidget` (desktop Casos abiertos column) | **Reuse** | `components/CasesWidget.tsx` (used `inicio/page.tsx:388`) |
| `lnPetStatusFromCompliance` (single status mapper) | **Reuse** | `lib/projections/pet-compliance` — the cross-surface truth guarantee |
| `CredentialFace` / `LibretaFace` / `FlipCard` / `PetDetailTabsPanel` (3b two-face) | **Reuse + refine** | `components/pet-profile/*` — 3b improvements (A/B/C) edit these, no rewrite |
| `PetActionRow` (quiet action links on 3b) | **Reuse + restyle** | `components/pet-profile/PetActionRow.tsx` (icon-row → quiet-link-row) |
| **Credential carousel card (`CredCard`)** | **NEW** | net-new; composes `LnPetPhoto` + `LnStatusFlag` + vac-badge tiles + `LnButton`s |
| **Carousel rail (`CredentialRail`)** | **NEW** | net-new; scroll-snap container + dots + (desktop) arrows/fade mask; `"use client"` for scroll state |
| **Pendientes unified list (`PendientesCard`)** | **NEW (thin)** | net-new but composes existing `NudgeRow`-style rows inside an `LnCard`; merges 3 current surfaces |
| **Disclosure list + row (`DiscList` / `DiscRow`)** for 3b | **NEW (thin)** | net-new small primitive; icon tile + title + summary + chevron |
| Sticky capture bar (`CaptureBar`) | **NEW (thin)** or reuse `AppShell.tabBar` slot | prefer wiring through the existing `tabBar` slot on `AppShell` citizen |

Net-new count: **2 substantial** (`CredCard`, `CredentialRail`) + **3 thin composites** (`PendientesCard`, `DiscList/DiscRow`, `CaptureBar`). Everything else is reuse. No new tokens, no new status axis.

---

## 6. Open questions for the PO

1. **Does the home carousel drive anything below it?** Recommendation: **no** — the rail is glance-and-go (tap card → profile). Adding a "selected pet filters Pendientes" concept re-introduces the coupling #34 removed. Confirm.
2. **Carousel card cap on the home.** For a high-volume owner (rescue with 50 pets), do we cap the rail (e.g. first 8 urgent + "Ver las N →") or scroll all? Recommendation: **cap at ~8, urgent-first**, link to `/mis-mascotas` for the rest (mirrors the existing `DASHBOARD_PETS_LIMIT` guard, `inicio/page.tsx:90`).
3. **Reclamar on mis mascotas:** inline the full code-input+submit on the list, or a promoted card that routes to the existing `ClaimWizard`? Recommendation: **promoted card → wizard** (avoids duplicating claim validation).
4. **Pet-profile 3b depth:** full vision (A symmetric hero + B compliance-as-disclosure + C capture-to-bottom-bar), or the safe floor (A only)? (B) changes a shipped, tested front face. Recommendation: **A+C now, B behind a mobile breakpoint** — keeps desktop's inline compliance untouched, wins the mobile scroll.
5. **Sticky capture bar vs. AppShell tabBar.** The citizen `AppShell` already has a `tabBar` fixed-bottom slot (native-mobile audit). Should "Asentar un hecho" live IN that slot, or as its own bar above the tab bar? (Two fixed bars stacked is a mobile anti-pattern.) Needs a decision before build.

---

## 7. Verification seam (for the implementing engineer, next)
Per the handoff's own protocol + project DoD: `pnpm verify` + `pnpm test` green; zero raw token/hex/px/`dark:`; all copy es-AR with accents; every interactive target ≥44px; screenshots at **390 / 768 / 1280px** (owner is mobile-heavy — 390 is the primary width); status conveyed by icon+shape+text, never color alone (`LnStatusFlag`/`LnVstamp` already satisfy this). Cross-surface truth: the carousel card, the mis-mascotas row, and the profile header must all read the same status via `lnPetStatusFromCompliance`.
