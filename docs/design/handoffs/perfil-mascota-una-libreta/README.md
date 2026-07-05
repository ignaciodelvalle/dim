# Handoff: Perfil de Mascota — «Una sola libreta» (owner view)

## Overview
The **pet profile** screen for an owner in miMAR (registro nacional de mascotas). Route in the real app: `/mis-mascotas/[publicToken]`.

The core idea: the profile is **one document with two faces**, not a stack of disconnected panels.
- **Frente · Credencial** — identity + compliance stamps + a quick "Anotar" capture + primary actions.
- **Dorso · Libreta** — a single health timeline: *Próximo* (upcoming) → *hoy* → *Asientos* (immutable signed records), where **each record shows the full field set its event type carries**.

The user switches faces with a segmented **Credencial / Libreta** control (or the "Dar vuelta / Ver credencial" button on the blue band); the sheet does a short 3-D turn. Two offset "back pages" peek behind the sheet so it reads as a physical, two-sided object.

Sample pet in the mock: **Chichila** — a recently-registered dog with nothing professionally verified yet (compliance = "0 de 3 al día"), plus a handful of owner-declared events. This state is intentional: it shows the *declared vs. verified* provenance model in action.

## About the design files
`Perfil de Mascota - Una sola libreta.html` is a **design reference built in plain HTML/CSS/vanilla-JS** — a prototype of the intended look and behavior, not production code to ship as-is. The task is to **recreate it in the target codebase's environment** (React/Next, Vue, SwiftUI, etc.) using that project's existing components, tokens, and conventions. If the target app already has a design system (buttons, cards, chips, icon set), map onto it rather than porting these class names literally. If no environment exists yet, pick the most appropriate framework and implement there.

`image-slot.js` is only the prototype's drag-and-drop photo placeholder — **replace it with the app's real image-upload component**.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, radii, and interactions are all intended as shown. Recreate pixel-accurately, then swap prototype-only pieces (image-slot, faux QR) for real implementations.

---

## Screens / Views

There is **one screen** with a **global chrome** and **two faces**.

### Global chrome — Government top nav (`.gnav`)
- Sticky, full-width, height **58px**, background `--azul-900 #0A3556`, white text.
- 3px celeste "guilloché" hairline across the very top (`repeating-linear-gradient(90deg, #4E97D1 0 2px, transparent 2px 4px)`, opacity .7).
- Left: 30×30 rounded-8 logo tile (gradient celeste→azul, serif "m") + wordmark **miMAR** (700).
- Nav links (13.5px, 500): **Inicio**, **Mis mascotas** (active — bg `rgba(255,255,255,.14)`, 600), **Denuncias**. Link padding 8×14, radius 8.
- Right: 34px circular user avatar "MQ" (bg celeste, text `#06304f`).
- Page column: `.page` max-width **908px**, centered, padding `26px 24px 90px`, on backdrop `#ECEAE3` with a dotted radial-gradient (`rgba(0,0,0,.045)` dots on a 26px grid).

### Recto/verso control (`.faces` / `.facetab`)
- Centered pill group on white, border `--line`, radius 14, padding 5, gap 4.
- Two tabs, each = 30px rounded icon tile + two-line label (`b` 13.5px 600 + mono 8.5px uppercase eyebrow "FRENTE"/"DORSO"):
  - **Credencial · Frente** (icon `fa-id-card-o`)
  - **Libreta · Dorso** (icon `fa-book`)
- Active tab: bg `--azul`, white text. `role="tablist"`, `aria-selected` maintained.

### The document (`.stage` → `.doc-wrap` → `.doc` → `.face`)
- `.stage` sets `perspective:1700px`.
- `.doc-wrap::before/::after` are two stacked "back page" sheets offset `translate(7px,9px)` (bg `#F3EEE3`, border `--line-strong`) and `translate(3px,4px)` (bg `#FBF7EE`) — the peeking pages.
- Only one `.face` has class `.is-shown` (`display:block`) at a time; the other is `display:none`.
- Each `.face`: bg white, border `--line`, radius **14**, shadow `0 22px 50px -26px rgba(20,16,10,.5)`.
- `.face .frame`: an inner certificate hairline, `position:absolute; inset:7px; border:1px solid --line-2; radius:9; pointer-events:none` — the visual "one framed sheet" cue.
- Entrance: `.doc-wrap` fades/rises in (`docIn`, .6s) unless reduced-motion.

### Blue band (`.band`) — top of each face
- Height **120px**, radius `13px 13px 0 0`, `overflow:hidden`.
- Background = diagonal white pinstripe over blue gradient:
  `repeating-linear-gradient(135deg, rgba(255,255,255,.5) 0 1px, transparent 1px 11px), linear-gradient(118deg, #0A3556, #0E5A99 58%, #4E97D1)`.
- **`.band-title`** bottom-right, mono 10px uppercase, `.24em` tracking, white .9; a `<small>` line under it reads "Credencial · frente" or "Libreta · dorso".
- **`.turn`** button top-right: pill, translucent white (`rgba(255,255,255,.14)` bg, `.34` border), backdrop-blur 3px, 12.5px 600; label "Dar vuelta" (front) / "Ver credencial" (back); the `fa-refresh` icon rotates 180° on hover. Clicking flips.

---

## FRONT · Credencial

Order within the framed sheet, separated by **labeled hairline dividers** (`.divider` + `.dlabel` mono eyebrow sitting on the rule):

1. **Identity row** (`.idrow`, `.sec` padding `22px 28px`)
   - **Photo** `.photo`: 132×132, radius 12, `margin-top:-64px` (overlaps the band), ring `0 0 0 4px #fff` + drop shadow. In the prototype it hosts `<image-slot>` → replace with real upload.
   - **Name** `.idname`: serif **32px** 600, `-.02em`, + **"Registrada" badge** (`.badge-reg`: mono 9.5px uppercase, azul text, bg `--celeste-050`, border `--celeste-100`, radius 5, leading `fa-check`).
   - **Subtitle** `.idsub`: "Macho · Perro" (mute, 14px).
   - **Chips** `.chip`: pill, bg `--stripe`, border `--line`, 12.5px. Shown: "📍 Palermo, CABA".
   - **QR block** `.qr` (right, 118px wide): 104×104 `<canvas>` (white, border, 6px padding, radius 8) + mono caption "**Credencial pública** / mimar.gob.ar/p/chichila". The QR is a **decorative faux-QR** drawn in JS — replace with a real QR of the public credential URL.

2. **Cumplimiento** (divider label "Cumplimiento", `fa-shield`)
   - Header: serif **19px** "Estado de cumplimiento" (with a mono "Estado" super-eyebrow) + right **summary stamp** "0 de 3 al día" (warn tone).
   - `.grid2` two-column grid of **obligation cards** `.obl` (border `--line`, radius 11, padding 14×15). Each: icon tile (`.obl-ic` 34px, celeste tint) + label (14.5px 600) + a **stamp** (top-right) + a mono `.obl-detail` and/or a faint `.obl-law` line; the vaccine card adds an amber **hint** box (`.obl-hint`, bg `#fdf6ea`, border `#f0dcb4`).
   - The three obligations (current order):
     1. **Microchip** — stamp "Sin registro" (neutral); law "Identificación · Ord. CABA 41.831 art. 4°". icon `fa-microchip`.
     2. **Esterilización** — stamp "Sin registro" (neutral); "Evento verificado en la libreta." icon `fa-scissors`.
     3. **Vacuna antirrábica** — stamp "Declarada · sin verificar" (warn); detail "Próxima 4/7"; law "Obligación del propietario · Ord. CABA 41.831 · Ley 22.953"; hint "La cargaste vos; pedí que un veterinario la registre para que cuente como al día." icon `fa-medkit`.

3. **Anotar** (divider label "Anotar", `fa-pencil-square-o`)
   - `.anotar-row`: a `<textarea>` (flex:1, min-height 56, bg `--paper`, border `--line-strong`, radius 11, focus ring `--celeste-050`) placeholder "Chichila — ¿qué pasó? Ej.: «Le pusieron la antirrábica hoy en la Vet. Palermo»" + primary **Anotar** button (`.btn-anotar`, bg `--azul`, `fa-arrow-right`). This is the fast free-text capture that routes to the correct event form.

4. **Action bar** (plain divider)
   - `.actionbar` of **labeled** buttons `.act` (border `--line-strong`, radius 10, 13px 600, icon + text; hover → azul):
     **Compartir** (`fa-qrcode`) · **Editar datos** (`fa-pencil`) · **Marcar como perdida** (`fa-exclamation-triangle`, `--danger` = seal red) · spacer · **Más** (`fa-ellipsis-h`, overflow menu).

---

## BACK · Libreta

Single `.sec`. This is one continuous health ledger.

1. **`.lib-head`**: "Chichila" serif 22px + code "LIB-AR-2026-1180" (mono, mute) + right-aligned "Titular · Martín Quiroga" (faint 12px).

2. **Próximo** (`.ledlbl` mono eyebrow) — `#ledger-future`, compact reminder rows `.lrow` (icon tile + title 13.5px 600 + meta 12px + right **action pill** `.lrow-act` azul). Rows:
   - Vacuna antirrábica · refuerzo — "Declarada · pedí verificación · vence 4 jul 2026" → **Programar**. (`ic-warn`, `fa-medkit`)
   - Antiparasitario · próxima dosis — "Endogard · en ~3 meses · 2 oct 2026" → **Recordar**. (`ic-verde`, `fa-bug`)
   - Primer control veterinario — "Sugerido para registrar chip y esterilización" → **Buscar turno**. (`ic-azul`, `fa-stethoscope`)

3. **`.hoy`** divider (mono "hoy" centered on a hairline).

4. **Asientos · 5 registros** — `#ledger-past`, rich record cards `.asiento`. Each has three parts:
   - **`.asiento-head`**: icon tile (`.asiento-ic` 36px, tinted per type) + `.asiento-kind` (mono eyebrow, e.g. "VACUNA · OBLIGATORIA") + `.asiento-title` (serif 16px) + `.asiento-when` (mono, "hace 2 días / 2 jul 2026").
   - **`.asiento-facts`**: `grid-template-columns:1fr 1fr`, gap `13px 22px`, top hairline. Each `.fact` = mono key eyebrow (`.k`) + value (`.v`, 13px 500). Modifiers: `.v.mono` (codes), `.v.miss` (faint — for missing data like "Sin dato"/"No adjunto"), `.fact--full` (spans both columns — used for the sparkline and the note).
   - **`.asiento-foot`**: dashed top border; a **provenance stamp** (see below), optional amber `.warnnote`, spacer, and a `.btnlink.sm` action.
   
   The five records and their **full field sets** (this is the point of the design — show what each event type carries):
   | Record | Kind | Fields shown | Provenance |
   |---|---|---|---|
   | **9,4 kg** | Peso | Método · Contexto · **Tendencia** (inline SVG sparkline + "9,4 kg · +0,6 kg en 2 meses") | self |
   | **Endogard** | Antiparasitario · interno | Vía · Dosis · Aplicada · Próxima dosis | self |
   | **Antirrábica** | Vacuna · obligatoria | Aplicada · Vence · Vía · Aplicó · Laboratorio *(Sin dato)* · Lote *(No adjunto)* + warn "Falta verificación profesional" → **Pedir verificación** | self |
   | **Primeras semanas en casa** | Nota | full-width handwritten note (`.note-hand`, Caveat) | self |
   | **Alta en miMAR** | Inscripción · alta de libreta | Libreta *(mono)* · Titular · Especie · Estado | **verified** |

5. **`.immut`** note: 🔒 "Los asientos no se editan ni se borran. Una corrección es un asiento nuevo." (records are append-only/immutable — enforce this in the data layer).

6. **`.libfoot`**: `fa-download` **Exportar (PDF)** · `fa-share-alt` **Compartir libreta** (`.btnlink`, azul).

### Provenance model (important)
Every event carries a provenance shown as a `.prov` stamp:
- `data-k="verified"` → green (`#e8f3ec`/`--ok`) — verified by a professional or the registry ("Verificado · Registro miMAR", "Verificado · {vet}").
- `data-k="self"` → neutral (`--stripe`/`--ink-2`) — "Cargado por vos" (owner-declared).

**Rule to preserve:** an obligation only counts as "al día" when backed by a **verified** event. Owner-declared events show as "Declarada · sin verificar" and do not satisfy compliance. This drives the front-face stamps and the "Pedir verificación" affordance.

---

## Interactions & Behavior
- **Flip** (`flip('front'|'back'|'toggle')`): toggles `.is-shown` between faces. With motion: `.doc` transitions `rotateY(0 → 87deg)` (.2s ease-in), swaps the visible face at edge-on, jumps to `-87deg` (no transition), then `→ 0deg` (.26s ease-out). A `turning` flag guards against re-entrancy (~485ms total). **Reduced-motion**: instant swap, no rotation. Triggered by the segmented tabs *and* the band turn buttons; both keep `aria-selected` in sync.
- **Photo**: prototype uses `<image-slot>` (drag/drop or click; persists to a sidecar). Replace with the app's uploader; target crop is a 132px rounded square overlapping the band.
- **QR**: `#qr` canvas is deterministically drawn (finder patterns + seeded modules). Not scannable — swap for a real QR of the public credential URL.
- **Hover states**: nav links lighten; `.act` buttons → azul border/tint (danger → seal tint); `.turn` brightens and spins its icon; `.btnlink` underlines; obligation `.obl-add` (unused now) would tint azul.
- **Responsive** (`max-width:720px`): `.grid2` collapses to 1 column; `.idrow` wraps; the QR block reorders last.

## State Management
- `showing`: `'front' | 'back'` — which face is visible.
- `turning`: boolean re-entrancy guard during the flip animation.
- (A lens filter "Todo / Vacunas / Oficial" existed earlier and was removed; `setLens` remains as a no-op. If you reintroduce filtering, records already carry `data-lens="todo vacunas oficial"` hints.)
- Real app will additionally need: pet data, obligations/compliance state, event/asiento list (append-only), and derived "al día" status per obligation.

## Design Tokens
**Color**
```
--azul        #0E5A99   --azul-700 #0A4576   --azul-900 #0A3556
--celeste     #4E97D1   --celeste-100 #DCEBF7   --celeste-050 #EFF6FC
--ink         #1B2A33   --ink-2 #3C4B55   --mute #6E7B84   --faint #9AA4AB
--paper       #FBFAF5   --card #FFFFFF   --stripe #F6F4ED
--line        #E4DFD3   --line-2 #EEEAE0   --line-strong #CFC8B8
--seal(red)   #A23A2C   --ok(green) #2E7D4F   --warn(amber) #B0771A   --err #C0392B
page backdrop #ECEAE3 (dotted, 26px grid)
```
**Semantic stamp tones** — ok `#e8f3ec`/`#c8e2d2` · warn `#fdf3e3`/`#f0dcb4` · err `#fbe9e6`/`#f1c6bf` · neutral `--stripe`/`--line-strong`.
**Event icon tints** — warn `#fdf3e3`/`#B0771A` · azul `#EFF6FC`/`#0E5A99` · verde `#e8f3ec`/`#2E7D4F` · rosa `#fbeef4`/`#B5497E` · amarillo `#fbf3dc`/`#9a7b12` · gris `--stripe`/`--ink-2`.

**Typography** (Google Fonts)
- **IBM Plex Sans** 400/500/600/700 — UI & body.
- **IBM Plex Serif** 500/600 — names & section titles (idname 32, comply h3 19, lib-head 22, asiento-title 16).
- **IBM Plex Mono** 400/500/600 — data, codes, dates, all uppercase eyebrows/stamps (tracking .1–.24em).
- **Caveat** 600 — owner handwritten notes only (color `#5a4a1f`).

**Radius** cards 11–14 · pills 999 · icon tiles 8–9 · small badges 4–5.
**Shadow** doc `0 22px 50px -26px rgba(20,16,10,.5)` · photo `0 0 0 4px #fff, 0 10px 24px -12px rgba(20,16,10,.5)`.
**Spacing** section `22px 28px` · page column 908px max, padding `26px 24px 90px` · grid gaps 12–22.

## Assets
- **Fonts**: Google Fonts — IBM Plex Sans/Serif/Mono + Caveat. Self-host in production.
- **Icons**: Font Awesome **4.7.0** (CDN in the prototype). Used: `fa-id-card-o, fa-book, fa-refresh, fa-check, fa-map-marker, fa-shield, fa-microchip, fa-scissors, fa-medkit, fa-minus-circle, fa-clock-o, fa-exclamation-circle, fa-info-circle, fa-pencil-square-o, fa-arrow-right, fa-qrcode, fa-pencil, fa-exclamation-triangle, fa-ellipsis-h, fa-bug, fa-stethoscope, fa-balance-scale, fa-sticky-note-o, fa-certificate, fa-user-o, fa-check-circle, fa-lock, fa-download, fa-share-alt`. Map to the app's icon set (Lucide/FA6/etc.) — glyph names differ.
- **Pet photo**: user-supplied; `image-slot.js` is a prototype stand-in → use the real uploader.
- **QR**: decorative canvas → real QR of the public credential URL.

## Files
- `Perfil de Mascota - Una sola libreta.html` — the full design (self-contained: styles in `<head>`, markup + flip/QR JS inline). This is the source of truth.
- `image-slot.js` — prototype photo placeholder (do not port; replace with real upload).

### Note on vestigial CSS
These classes still exist in `<style>` but were removed from the markup during iteration and are **unused** — ignore or delete: `.crumb`, `.band-gov`, `.turn-cap`, `.lenses`/`.lens`, `.anotar-lbl`, `.atajos`/`.atajo`, `.obl-add`, `.sealrow`/`.seal`, `.foothint`.
