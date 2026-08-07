# Live review — public & entry surfaces (2026-07-28)

**Ground truth:** `integration/all-20260703` @ `796a583f`
**Captured:** `/`, `/login`, `/signup`, `/recuperar`, `/perdidas`, `/denuncias/nueva`, `/acerca`, `/ayuda`, `/ruta-que-no-existe` (404), `/p/DIM-PAMP-0001`, `/p/DIM-DEMO-0001` (lost), `/p/DIM-A3PS-Q5E4` (lost), `/p/<token>/encontre`, `/p/<token>/sighting`
**Viewports:** 1440×900, 390×844, and narrow sweeps at 640 / 600 / 561 / 560 / 559 / 480 / 375 / 360 / 320
**Session:** none (stranger, no cookie)

Artifacts:
`C:/Users/ignac/.claude/jobs/c64395a5/tmp/review/publico/*.{txt,png}` (harness)
`C:/Users/ignac/.claude/jobs/c64395a5/tmp/shots/*.png` (my own probes)

---

## Findings

### P1-1 — On every phone ≤560px the landing page offers exactly one action, and it is not "Iniciar sesión"

**What I saw:** at 375×800 the landing `<header>` renders, in full: `"M | miMAR | MI MASCOTA ARGENTINA | Crear mi miMAR"`. Nothing else. (screenshot: `shots/root.375.png`; also `root.320.png`, `root.480.png`, `root.560.png`)

Measured `header a[href="/login"]`:

| viewport | computed | box |
|---|---|---|
| 559px | `display: none` | 0×0 |
| 560px | `display: none` | 0×0 |
| 561px | `display: flex` | 118×42 |

There is **no hamburger and no menu button of any kind** in the landing header at any width — `document.querySelectorAll('header button, header [aria-label*="men"], header [aria-expanded]').length === 0` at 320, 375, 480, 560, 561, 600 and 640px. So below 561px the nav does not *collapse*; it simply *loses* the entry point.

The next `/login` link on the page, at 375px, sits at **y = 12 260 px** ("Ya tengo cuenta"), and the footer's "Iniciar sesión" at **y = 13 253 px**. On an 800px-tall viewport that is ~15 screenfuls of scrolling past the entire six-chapter story section.

**Why it's wrong:** the header is the one place every user looks for sign-in. A returning owner who opens miMAR on a phone — the overwhelmingly likely device — is presented with a single button that creates a *second* account. This is plan unit D.7 and it reproduces exactly as described.

**Cause:** `app/globals.css:872`

```css
/* Phones: the brand + two CTAs overflow the no-wrap nav row. Drop the secondary
   "Ingresar" ghost so the primary "Crear mi miMAR" conversion CTA never clips;
   sign-in stays reachable from the footer and the hero. */
@media (max-width: 560px) {
  .lp-nav .lp-btn--nav-secondary {
    display: none;
  }
}
```

The rendered element is `components/landing/LandingNav.tsx:50`.

**The comment's justification is false.** "Sign-in stays reachable from the footer and the hero" — it is reachable from the footer (y ≈ 13 253), but **there is no `/login` link in the hero at all**. I enumerated every `<a>`/`<button>` on the page at 320/375/480/560px; the only `/login` targets are the hidden header link and three links at y ≈ 12 260, 12 703 and 13 253. Nothing above y = 12 000. Someone wrote a mitigation into a comment and it was never built.

**Fact or opinion:** fact (measurement + CSS). The severity call — that "reachable after 12 000px of scroll" is equivalent to "blocked from entering" — is opinion, but I'd defend it.

**Note (contrast):** the *app* masthead is fine. `/perdidas`, `/denuncias/nueva`, `/ayuda` etc. all render a proper `Iniciar sesión` pill (114×44 at 375px) plus a hamburger. Only the landing page — the page every first-time and returning visitor hits — has this hole.

---

### P2-1 — The credential header collides with itself at 390px: "CREDENCIAL PÚBLICA" renders 2px wide

**What I saw:** on `/p/DIM-DEMO-0001` at 390px, the "NIVEL 0 · IDENTIDAD" pill sits *on top of* the `miMAR` wordmark, and the `CREDENCIAL PÚBLICA` caption is squeezed into a 2px column that wraps as `CR.` / `PÚBLICA` down the left edge. (screenshot: `shots/crop-cred-header.390.png`, also visible in `shots/p-DIM-DEMO-0001.390.png`)

Measured on the `<span>` carrying that text:

```
client: 2x24    scroll: 58x24    → 96.5% of the label is clipped
class:  block font-[var(--font-ln-mono)] text-[8px] uppercase tracki…
```

**Why it's wrong:** this is the masthead of the emergency artifact — the first thing rendered when a stranger scans a QR off a collar. The overlap makes the brand look broken at the exact moment the page has to earn trust. It is width-specific: clean at 320px and 360px, broken at 390px (iPhone 12/13/14/15 — the single most common width in Argentina).

**Fact or opinion:** fact.

---

### P2-2 — The fixed bottom action bar covers the in-card CTAs on first paint

**What I saw:** `nav.fixed.inset-x-0.bottom-0` at `0,775 390×69` overlaps the in-card "Lo vi cerca de acá" button at `33,800 162×44`.

| viewport | occluded button | overlap |
|---|---|---|
| 320px | "Lo tengo conmigo" (in-card) | 161 × 36 px |
| 360px | "Lo vi cerca de acá" | 162 × 35 px |
| 390px | "Lo vi cerca de acá" | 162 × 32 px |

At 390px that is 73% of the button's height hidden behind the bar at scroll position 0 — i.e. in the default view, before the user touches anything. See `shots/p-lost.320.png`: "Llamar" is visibly sliced in half by the bar.

**Why it's wrong:** "Lo vi cerca de acá" (report a sighting) is one of the two actions the whole public credential exists to enable, and it is the one the sticky bar does *not* duplicate. The user can scroll to free it, but on first paint the page presents a half-eaten button. It also means the page shows "Lo tengo conmigo" twice and "Llamar" twice within one screenful.

**Fact or opinion:** fact (geometry). Severity is opinion — not blocking, because scrolling recovers it.

---

### P2-3 — "CUSTODIA OFICIAL" and "ESTÁ PERDIDO — Llamar [al dueño]" are shown together, with no way to contact the authority

**What I saw:** `/p/DIM-DEMO-0001` opens with a warning panel:

> **CUSTODIA OFICIAL**
> Autoridad a cargo: Mascotas BA Centro
> Comunicate con la autoridad sanitaria competente para más información.

and immediately below, the credential says **"ESTÁ PERDIDO · hace 10 h"**, **"¡Hola! Soy Rocco — Estoy perdido"**, with `Llamar → tel:+5491155551001`, `Lo tengo conmigo` and `Lo vi cerca de acá`. (screenshot: `shots/p-DIM-DEMO-0001.390.png`)

**Why it's wrong:** three mutually exclusive instructions on one screen. Is the animal in the state's custody, or lost and being searched for by its owner? Am I meant to call the owner or the authority? And the panel that tells me to "comunicate con la autoridad" gives me **no phone, no email, no link** — just a name. The one instruction the page cannot help me follow is the one it puts at the top.

Note this is *not* the `inCustodyDispute` path — that path correctly nulls the phone and both CTAs (`app/(public)/p/[publicToken]/page.tsx:707-729`). This is a different state that composes badly with `lost`.

**Fact or opinion:** fact that both render together; opinion that it is confusing (I think strongly so).

---

### P2-4 — Two different, unequal "I found this animal" forms on the same credential

**What I saw:** the public credential offers, for the same intent:

1. A `<details>` at the bottom — `"¿Encontraste a esta mascota? / Tocá acá para avisarle al dueño."` — which expands into an inline form: `Tu nombre (opcional)`, `Cómo te contactamos (opcional)`, `Mensaje (opcional)`, `Avisar al dueño`. **Zero required fields.**
2. The `Lo tengo conmigo` button → `/p/DIM-DEMO-0001/encontre` — a 1720px-tall form with **three required fields**: `¿Dónde la tenés ahora?*` (a map pin), `¿Cómo está la mascota?*`, `¿Hasta cuándo podés cuidarla?*`.

(screenshots: `shots/p-lost-disclosure.390.png`, `shots/encontre.390.png`)

**Why it's wrong:** same page, same goal, two forms, one of which demands ~10× the effort. Whichever the stranger picks is arbitrary, and the owner receives structurally different information depending on which button happened to catch the eye. The cheap one is buried at the bottom in a collapsed accordion; the expensive one gets the primary button and the sticky bar.

**The sidewalk test, for the `/encontre` path** — you are holding a dog with one hand:

1. Tap "Lo tengo conmigo".
2. Scroll past two optional identity fields.
3. **Required:** place a pin on a map — tap the map, or drag the pin, or grant a geolocation permission prompt. Two-handed, or a permission dialog, either way.
4. **Required:** pick the animal's condition from four radios.
5. **Required:** answer "¿Hasta cuándo podés cuidarla?" — commit to a custody window, with a date-and-time picker if not "indefinidamente".
6. Optionally take a photo.
7. Submit.

Steps 3 and 5 are the ones a person on a sidewalk cannot reasonably do. Step 5 in particular asks a stranger to make a commitment before they have been told anything about who they're committing to.

**Fact or opinion:** the two-forms fact is fact; the burden analysis is opinion.

---

### P2-5 — E2E test fixtures are the top two entries on the public lost-pets list

**What I saw:** `/perdidas` — "4 mascotas perdidas en las últimas 24 horas". The two most recent, above Rocco:

> `PERDIDO · HACE 9 H` — **ProbeAlta-1785241484517** — Palermo, CABA — *Mascota*
> `PERDIDO · HACE 9 H` — **E2EPet-1785241569076** — Palermo, CABA — *Mascota*

(harness: `review/publico/perdidas.txt:99-120`)

Their credentials are live: `/p/DIM-A3PS-Q5E4` returns 200 and reads `"¡Hola! Soy ProbeAlta-1785241484517 — Estoy perdido"` with a working `tel:` link.

**Why it's wrong:** this is the demo instance shown to funcionarios. The lead item on the public "lost animals" page is a Unix timestamp with a robot name. It also breaks the species display — the listing card says the species is `Mascota` while the credential says `Perro · Macho`, so the fixtures expose a fallback path real records never hit.

**Fact or opinion:** fact.

---

### P2-6 — Primary actions on the found-animal forms are under the 44px touch minimum

Measured at 390×844. Full table below; the ones that matter:

- `Avisar al dueño/a` — the **submit button of the found-animal report** — 326 × **41.1**
- `Usar mi ubicación actual` — the one-tap alternative to the map, i.e. the affordance built for exactly the one-handed case — 326 × **41.1**
- `Puedo tenerla indefinidamente` — checkbox label wrapper — 326 × **17**
- Photo upload `<input type=file>` — 292 × **23**
- Story-chapter dots on the landing (`.lp-hdot`) — **12 × 12** (`app/globals.css:1231`), six of them, 9px apart

**Why it's wrong:** 41.1px on a submit is a near-miss and arguable. 17px on a checkbox and 12×12 on a nav control are not — the landing dots in particular are one third of the minimum in each dimension and are the only way to navigate the story section on a phone, where the section is the page's main content.

**Fact or opinion:** measurements are fact; the 41.1px items are a judgment call (WCAG 2.5.8 AA sets 24px, 2.5.5 AAA sets 44px — these pass AA, fail AAA).

---

### P3-1 — The map chunk is refused by CSP, then silently refetched, on all three finder-facing routes

**What I saw:** on `/denuncias/nueva`, `/p/<token>/encontre` and `/p/<token>/sighting`:

```
Loading the script 'http://localhost:3000/_next/static/chunks/57851.611a85d7fa2222df.js'
violates the following Content Security Policy directive:
"script-src 'self' 'nonce-…' 'strict-dynamic'"
[REQFAIL] /_next/static/chunks/57851.611a85d7fa2222df.js — csp
[RESP]    57851 → 200
```

Chunk 57851 is the map (`tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"]`, `aria-label:"Mapa. Tocá para marcar una ubicación."`).

**I pressed on this and it held:** the map *does* render — 1 canvas, OSM attribution, tiles painted, pin draggable (`shots/denuncia-step3.390.png`). The blocked load is a nonce-less preload; webpack's own dynamic import then fetches the same URL successfully. So this is **not** the dead-prerender class of bug, and I am downgrading it accordingly.

**Why it still matters:** the chunk is fetched twice on the three routes most likely to be opened on cellular data by someone standing in the street, and it plants a red CSP error in the console of the abuse-reporting flow — which is exactly the signature the team has twice had to chase for real.

**Fact or opinion:** fact that it fires and self-recovers; opinion that it's worth fixing.

---

### P3-2 — `/ayuda` prints a raw route, and points it at the wrong page

**What I saw:** `/ayuda`, under "¿Cómo registro a mi mascota?":

> "Creá tu cuenta en **/login** o desde el botón "Crear cuenta"."

**Why it's wrong:** two errors in nine words. `/login` is where you sign *in*; account creation is `/signup`. And a help page written for citizens should not be exposing URL paths as instructions — there is nothing to click, it is not a link, and "andá a barra login" is not a sentence a person follows. The button it names ("Crear cuenta") also does not match the landing page's label for the same action ("Crear mi miMAR").

**Fact or opinion:** fact.

---

### P3-3 — Every card on `/perdidas` says the same thing about location, and it is a negative

**What I saw:** all 24 rendered cards carry the line `"Sin ubicación de avistaje registrada"` — 24 out of 24 (`review/publico/perdidas.txt`).

**Why it's wrong:** a field that is always empty is not a field, it is 24 repetitions of "we have nothing". It pushes the useful signal (the locality line, e.g. "Quilmes, Buenos Aires") into visual competition with a constant. Either seed sightings so the field earns its place, or drop the row when empty.

Secondary: the status badge reads `PERDIDO`, `PERDIDA` or `PERDIDO/A` depending on the record's sex field, so the list shows all three within one screen — including `PERDIDA` on cards named Bruno and Thor. It reads as a bug even where it is faithfully rendering the data.

**Fact or opinion:** fact on the 24/24; opinion on the fix.

---

### P3-4 — The first screenful at 390px sells the product; it does not offer the emergency

**What I saw:** everything above the fold at 390×844 on `/`:

```
A:  M miMAR MI MASCOTA ARGENTINA
A:  Crear mi miMAR
P:  REPÚBLICA ARGENTINA · MINISTERIO DE SALUD
H1: Toda una vida, en una sola miMAR.
P:  miMAR es el registro nacional de mascotas: una identidad pública y un…
A:  Cómo funciona
BUTTON: ↻
P:  Escanealo para ver más sobre Pampa
```

First heading: **"Toda una vida, en una sola miMAR."** First call to action: **"Crear mi miMAR"** (nav) / **"Cómo funciona"** (in-hero, an anchor scroll). (screenshot: `shots/root-firstscreen.390.png`, `shots/root.375.png`)

**Why it's questionable:** the two cards the site itself frames as its urgent jobs — "Perdí una mascota" and "Encontré una mascota — Escaneá su QR o buscala por señas. Sin cuenta." — are below the fold. The first screenful is a rotating demo credential for a fictional dog plus a slogan. It is clear *what this is*; it is not clear *what to do first* if the reason you opened it is that an animal is missing right now.

To its credit the headline is good and the ministry line lands. This is a priority call, not a defect.

**Fact or opinion:** opinion.

---

## Hit-area measurements

All at 390×844 unless noted. Threshold: 44×44 CSS px.

| Element | Route | Viewport | Size (px) | Verdict |
|---|---|---|---|---|
| `.lp-hdot` × 6 (story chapter dots) | `/` | 320–560 | 12 × 12 | **fail** — 27% of minimum |
| `.lp-hdot[data-on]` (active) | `/` | 320–560 | 15 × 15 | **fail** |
| `.lp-hcard-flip` (↻ flip card) | `/` | 320–560 | 26 × 26 | **fail** |
| `.lp-brand` (home link) | `/` | 480–560 | 191 × 38 | fail (height) |
| `.lp-btn--nav` "Crear mi miMAR" | `/` | 480–560 | 140 × 42.4 | marginal |
| `header a[href="/login"]` | `/` | ≤560 | **0 × 0** | **absent** (see P1-1) |
| `header a[href="/login"]` | `/` | 561+ | 118 × 42 | marginal |
| `header a[href="/login"]` | `/perdidas` | 320 | 93 × 44 | pass |
| `header a[href="/login"]` | `/perdidas` | 375–560 | 114 × 44 | pass |
| Brand link | `/perdidas` | 320–560 | 115 × 38 | fail (height) |
| Filter `<select>` × 3 | `/perdidas` | 375 | 140.5 × 40 | marginal |
| Filter `<select>` / `<input>` | `/perdidas` | 480–560 | 193–233 × 40–40.8 | marginal |
| `Avisar al dueño/a` (submit) | `/p/…/encontre` | 390 | 326 × **41.1** | marginal — primary action |
| `Usar mi ubicación actual` | `/p/…/encontre` | 390 | 326 × **41.1** | marginal — the one-handed affordance |
| `input[type=radio]` × 5 (raw box) | `/p/…/encontre` | 390 | 13 × 13 | mitigated — `<label>` wrapper is 326 × 39 |
| `label` for `petCondition` radios | `/p/…/encontre` | 390 | 326 × 39 | marginal |
| `label` "Puedo tenerla indefinidamente" | `/p/…/encontre` | 390 | 326 × **17** | **fail** |
| `input[type=file]` (photo) | `/p/…/encontre` | 390 | 292 × **23** | **fail** |
| Text inputs (nombre / tel / email) | `/p/…/encontre` | 390 | 326 × 40.8 | marginal |
| `← Volver al perfil` | `/p/…/encontre` | 390 | 90.9 × **15** | **fail** |
| `Avisar al dueño` (inline `<details>` form) | `/p/DIM-DEMO-0001` | 390 | 324 × **33.1** | **fail** — primary action |
| Inline form inputs | `/p/DIM-DEMO-0001` | 390 | 324 × 40.8 | marginal |
| In-card CTAs (Llamar / Lo tengo / Lo vi) | `/p/DIM-DEMO-0001` | 320–390 | 102–164 × 44 | pass size, **occluded** (P2-2) |
| Sticky bar CTAs | `/p/DIM-DEMO-0001` | 320–390 | 102–248 × 44 | pass |

No horizontal page overflow anywhere: `documentElement.scrollWidth === window.innerWidth` at 320, 360 and 390 on `/p/DIM-DEMO-0001` and `/p/…/encontre`.

---

## What I pressed and it held

I went looking for the known failure classes and several of them are genuinely fixed. Reporting these because "no finding" is only credible if you can see where I pushed.

- **CSP × prerendering on `/ruta-que-no-existe` — fixed.** 404 status, page renders, **zero** `Refused to execute` / CSP console errors, `window.__next_f` present, React root live. Only console entry is the expected `Failed to load resource: 404`. The "Volver al inicio" link resolves to `/`.
- **CSP × prerendering on `/recuperar` — fixed, and the page actually works.** Zero console errors, zero failed requests. I typed `stranger@example.com`, pressed "Enviar enlace de recuperación", and the form replaced itself with:
  > *"Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. Revisá también tu carpeta de spam."*

  Correct enumeration-safe wording, too — it does not reveal whether the account exists.
- **Owner privacy on the public lost credential — held.** I scanned rendered text *and* raw `outerHTML` of two lost credentials for phone, email, DNI-shaped digits, lat/lng JSON and street-address patterns. Only hit: `tel:+5491155551001` in an `href`, never as visible text. No email, no DNI, no coordinates, no address, no owner surname. The gating is explicit and correct at `app/(public)/p/[publicToken]/page.tsx:708-729` — `disclosePhoneWhenLost`, `discloseEmailWhenLost`, `discloseFirstNameWhenLost`, `discloseLastLocationWhenLost` all AND-ed with `!inCustodyDispute`, and `allowFinderFormWhenLost` gates the finder CTA. `/p/DIM-PAMP-0001` (not lost) exposes nothing and says so: *"Esta vista no expone contacto del dueño, dirección ni notas privadas."*
- **The custody-dispute red-team hardening — held.** Comment at `page.tsx:700-707` says the finder and sighting CTAs go null during a dispute so the platform doesn't take sides. The code matches the comment (unlike the CSS comment in P1-1).
- **`/denuncias/nueva` is usable end to end despite the CSP error.** Step 1 → 2 → 3 all advance; the map paints tiles and accepts a pin. The anonymous abuse report is not dead.
- **The inline `<details>` "found it" form is not broken.** My first pass measured its `<label>`s and submit button as having empty text and flagged it as a P1. That was my instrumentation reading a closed `<details>` — on expansion the labels read "Tu nombre (opcional)", "Cómo te contactamos (opcional)", "Mensaje (opcional)", "Avisar al dueño". Retracted.
- **Blank submit on `/p/…/encontre` does not silently no-op.** Nothing new appears in the DOM, but the browser scrolls to `y=876` and focuses the first invalid input — native `required` validation firing. It works; it is just invisible to a screenshot and offers no in-page error summary.
- **No horizontal overflow** on any public route I measured, down to 320px.
- **The app masthead** (`/perdidas`, `/denuncias/nueva`, `/ayuda`, `/acerca`) keeps `Iniciar sesión` at a full 44px tall and adds a hamburger at every width down to 320px. The P1-1 hole is specific to `LandingNav`.
- **`/login` and `/signup` are clean** — zero console errors, correct cross-links in both directions, "¿Olvidaste tu contraseña?" present, T&C and privacy links on signup.

---

## Excluded as noise (per contract)

- All `?_rsc=…` `net::ERR_ABORTED` entries (26 across the capture) — Next.js prefetch cancellation.
- The yellow `ENTORNO DE DEMOSTRACIÓN — DATOS SINTÉTICOS` banner.
- `Failed to load resource: 404` on `/ruta-que-no-existe` — that is the 404 being a 404.
