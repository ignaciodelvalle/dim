# MiMAR — Live Click-Through Critique (addendum to the static UX audit)

> Companion to [`ux-usability-audit.md`](./ux-usability-audit.md). This pass drove the **deployed** app
> (`dim-git-fix-…vercel.app`) in a real browser, logged in as a **SUPERADMIN / Universal** account.
> Goal: confirm or refute the static findings against running behavior, and catch anything only a live
> session reveals.
>
> **Coverage:** public/hero surfaces (anonymous) + Admin portal + Govt dashboards (driven with universal
> scope) were exercised live. **Owner and Org portals could not be driven** — self-signup/admin is an
> *institutional* account with no personal pet ownership, so owner routes (`/mis-mascotas/…`) bounce back
> to the dashboard. Those two remain covered by the static audit until a personal login is available.

---

## Headline: the public credential crashes in LOST mode (root cause isolated)

**🔴 The public pet credential page crashes whenever a pet is in `lost` status.** Confirmed by a clean
controlled test in the second live pass:

1. Registered a fresh pet (`/p/DIM-4AZ2-4GN6`). Its **active** public credential rendered **perfectly**
   (gov-grade card, TIER 0 chip, working found-pet form).
2. Marked that *same* pet lost via the owner flow.
3. Re-opened the *same* URL → **"Algo salió mal"**, error code `752082971`. "Reintentar" does not recover.

So the earlier "seed-data-specific" hypothesis was **wrong** — the crash is the **lost-mode render path**
(`app/(public)/p/[publicToken]/` → the `LostPublicCredential` branch / disclosure resolution), not bad
seed data. It reproduces on a brand-new, valid pet. The console shows repeated *"error in the Server
Components render"* scoped to the `p/[publicToken]/error` boundary, plus a React #418 hydration error.

This is the most severe finding in either audit, because **the lost credential is the entire hero
moment**: a stranger scanning a lost pet's QR is exactly when the page must work, and on this deployment
**every lost pet — seed or real — returns a server error** instead of the contact + sighting UI. The
owner-side lost view and the active public credential both work; only the **public lost credential**
crashes. Trace digest `752082971` in the Vercel logs and add a defensive guard on the lost render path.

> Note: the well-designed error boundary (branded, Spanish, retry + home + support code) is firing
> correctly — the defect is what it's catching.

---

## Static findings — confirmed live

| # | Finding (static) | Live result | Evidence |
|---|---|---|---|
| 1 | Bad/worn QR token → bare English Next.js 404 | **Confirmed** — black screen, "404 · This page could not be found", no brand/Spanish/back-link | `/p/INVALID-TOKEN-TEST` |
| 2 | Active credential hides owner-contact in `<details>` | Could not retest (credential crashes before reaching the active layout) | — |
| 3 | `/accesibilidad` claims WCAG 2.1 conformance but is a stub | **Confirmed** — "Sección en preparación. MiMAR está construido siguiendo las pautas WCAG 2.1…" | `/accesibilidad` |
| 4 | `/acerca` (and other info pages) are stubs | **Confirmed** — "Sección en preparación." | `/acerca` |
| 5 | No "forgot password" link on login | **Confirmed** — login has email + password + "Mi Argentina (próximamente)" + "Crear cuenta" only | `/login` |
| 6 | Denuncia steps auto-advance on a single tap | **Confirmed** — selecting a category jumps 1→2, selecting severity jumps 2→3, no confirm | `/denuncias/nueva` |
| 7 | No emergency off-ramp on "grave / urgente" denuncia | **Confirmed** — choosing *Grave / urgente* proceeds to a normal async report; no hotline callout | `/denuncias/nueva` step 2→3 |
| 8 | Govt/Admin topbar breadcrumb is a hardcoded "Panel" stub | **Confirmed** — every admin & gob page shows just "Panel" in the topbar; detail pages hand-roll a body crumb inconsistently (rule editor has one, queues don't) | all `/admin/*`, `/gob/*` |
| 9 | KPIs lack ⓘ definition tooltips | **Confirmed** — admin KPIs are bare numbers; gob KPIs add useful subs (meta, deltas, legal cites) but still no formula/definition affordance | `/admin`, `/gob` |
| 10 | KPI semantic state is color-only | **Confirmed** — gob rabies coverage **9% vs an 80% meta** renders in neutral ink, not danger, while zoonosis gets a red card; no icon/label cue | `/gob` panel |
| 11 | Admin Outbox province filter is free-text | **Confirmed** — "Provincia (exacta)" text input; a typo silently returns nothing | `/admin/outbox` |
| 12 | Admin copy missing es-AR accents | **Confirmed** — "Ultimas… notificacion", "pais", and even the rule-create warning: "evaluan… duenos… notificacion" | `/admin/outbox`, `/admin/jurisdicciones/*` |
| 13 | Inconsistent jurisdiction/period filters across gob dashboards | **Confirmed** — gob panel uses Hoy/Esta semana/Este mes; mortalidad uses 7/30/90 días/Año en curso | `/gob` vs `/gob/mortalidad` |
| 14 | Hand-rolled bars lack scale/axis/value-context | **Confirmed** — "Disposición" and "Distribución por localidad" bars show a count at the end, no axis, scale, or % | `/gob/mortalidad` |
| 15 | Omnibox global search present in gob/admin and solid | **Confirmed** — `/`-focus, grouped "MASCOTAS" results with token + species, fast debounced search | `/admin`, `/gob` |

---

## New findings from the live pass

| # | Finding | Sev | Evidence | Recommendation |
|---|---|---|---|---|
| L1 | **Public credential page crashes** (Server Components render error) on the lost pets reachable from the live directory | 🔴 | `/p/PERF-000199` → error 582153755; console "Server Components render" error; Reintentar fails | Trace the digest in Vercel logs; add a defensive guard so a single bad field can't crash the whole credential; backfill/repair the seed data |
| L2 | **Admin dashboard KPI disagrees with the queue it links to.** Dashboard shows "Solicitudes pendientes: 1 (más vieja 4d)"; clicking through to the cola shows "No hay solicitudes pendientes en tu scope" | 🟡 | `/admin` vs `/admin/cola` (→ `/gob/cola`) | The admin (no jurisdiction assignments) sees an empty *own-scope* queue while the KPI counts universally. Make the delegated cola honor universal scope for admins, or make the KPI scope-consistent |
| L3 | **Omnibox pet results link to the owner-only route.** As admin, clicking a pet result navigates to `/mis-mascotas/{token}`, which an operator can't access, so it silently bounces back to the dashboard | 🟡 | omnibox "luna" → `/mis-mascotas/PERF-000076` → `/admin` | Link operators to an operator-visible pet view (`/admin/observaciones/{token}` or a gob pet view), not the owner route |
| L4 | **Rule creation shows no impact preview before a notifying action.** The PPP breed-list create form has no live "~N mascotas afectadas" banner; toggling breeds shows nothing, yet saving auto-evaluates pets and notifies affected owners province-wide | 🟡 | `/admin/jurisdicciones/AR/Buenos Aires/_/reglas/nueva?ruleType=ppp_breed_list` | Wire the impact preview on this create path (the static review noted the banner can render null on error — surface a fallback, never nothing) before a consequential, owner-notifying commit |
| L5 | **English enum values in govt dashboards.** Death causes display as "Euthanasia / Accident / Natural / Disease" inside an otherwise fully-Spanish public-health dashboard | 🟢 | `/gob/mortalidad` → "Causas por semana" | Localize the cause enum to es-AR (Eutanasia / Accidente / Natural / Enfermedad) |
| L6 | **`/adoptar` empty-state copy assumes filters.** With no filters applied it still says "No encontramos mascotas con esos filtros" | 🟢 | `/adoptar` (empty) | Use a true-empty message when no filters are active ("Aún no hay mascotas en adopción") vs the filtered-empty variant |
| L7 | **Signup fields lack the required `*` markers that login uses.** Login marks Correo/Contraseña with red `*`; signup's Correo/Contraseña/Repetir have none | 🟢 | `/signup` vs `/login` | Mark required fields consistently across both auth forms |

---

## Positives observed live (worth preserving)

- **The error boundary is genuinely good** — branded, Spanish, with Reintentar + Volver al inicio + a support code. The problem is what's triggering it, not the boundary.
- **The landing reads gov-grade** and the three role doors ("Soy dueño / refugio o vet / gobierno") make the entry choice obvious in two seconds.
- **The lost directory** has clear KPIs (202 activas / 0 últimas 24h / 200 últimos 7 días), quick-filter chips, and honest copy.
- **The denuncia flow** is approachable and well-paced (icon'd category cards, "Es tu mejor estimación. El equipo prioriza y verifica.", char-counted required description).
- **Govt KPIs carry real context** — meta targets, period-over-period deltas, and legal citations (Ley 14.107, Ley 4078) in the sub-line.
- **The omnibox** is fast, grouped, and keyboard-friendly.
- **k-anonymity suppression is disclosed** on the mortality dashboard ("3 localidades ocultas (privacidad)").
- **Rule authoring is clear** — scope label, "(default AR)" breed annotations, non-standard-breed entry, and internal notes explicitly marked "visible solo a admin/govt".

---

## Owner portal — second live pass (logged in as a real owner)

Drove the full owner lifecycle on a real account ("Lucía", a heavy seed account with ~2025 pets):
dashboard → register a new pet → active public credential → found-pet form → pet profile → log a vaccine →
mark lost (full wizard) → lost public credential → revert → notifications → appointments → transfers.

### Owner — what works (live)
- **Registration → credential "aha" is excellent.** Minimal form (name, species chips, sex defaulted to
  "No sé", locality typeahead with province disambiguation) → "Prueba UX ya tiene su credencial" with a QR
  and "Guardalo en el collar o compartilo con el veterinario." Real `DIM-XXXX-XXXX` token issued.
- **Vaccine event form is strong.** Required markers, date defaulted to today, and selecting "Antirrábica"
  **auto-filled Próxima dosis → +1 year** ("Sugerencia automática según catálogo"). "Asiento certificable"
  callout clearly explains the digital-signature/certification meaning; photo upload has size limit +
  examples. After submit, the profile vitals updated live (ÚLTIMA VISITA, VACUNAS 1/1 al día).
- **The lost-pet flow is genuinely excellent.** 3-step sheet (location w/ map + geolocation → enriched
  details w/ great placeholders → **granular per-field disclosure toggles** explaining exactly what each
  reveals publicly), ending on a reassuring success screen with **Compartir por WhatsApp** + **Imprimir
  cartel A4**. Revert ("Marcar encontrada/o") works and fires a warm notification.
- **Empty states are first-class** (profile "Registrá el peso o el microchip…" with CTAs; vitals show "—").
- **Notifications loop works end-to-end** (the revert produced "¡Nos alegra el reencuentro!").

### Owner — live findings
| # | Finding | Sev | Evidence | Recommendation |
|---|---|---|---|---|
| O1 | **`/cuenta` ("Tu cuenta") crashes** with a Server Components error | 🔴 | `/cuenta` → "Algo salió mal", code `3058248096`; other owner pages render fine | Trace the digest; likely an unbounded aggregation that doesn't scale for a high-pet/high-membership account — guard + paginate |
| O2 | **Owner dashboard frames operator-scale counts as personal burden.** "Buen día, Lucía. **264 casos abiertos que requieren atención.**" and Estado sanitario "**1459 PENDIENTES**" | 🟡 | `/inicio` | Summarize/cap for high-volume owners ("X mascotas necesitan atención") and soften the burden framing; this is also a scale-handling gap (no cap) |
| O3 | **Registration assumes first pet for an existing owner.** Header "Registrar tu primera mascota" / "Paso 1 de 1" shown to an owner with thousands of pets | 🟡 | `/mis-mascotas/nueva` | Use first-pet copy only when the owner has zero pets |
| O4 | **Notifications display raw event-type enum codes** next to the human text | 🟡 | `/notificaciones` — "LOST_EPISODE_RESOLVED_OWNER", "PPP_BREED_LIST_UPDATED_NOW_APPLIES" | Hide the internal constant or map to a human label/category chip |
| O5 | **Transferencias shows received only** ("Transferencias recibidas"); no sent/initiated view | 🟡 | `/transferencias` — "No tenés transferencias pendientes." | Add an "enviadas" tab so senders can track status (matches static finding) |
| O6 | **Localidad field renders its label twice** ("LOCALIDAD *" eyebrow + "Localidad" heading) | 🟢 | `/mis-mascotas/nueva` | Remove the duplicate label |
| O7 | **Hero title overlaps the patterned banner** and is hard to read on the pet profile | 🟢 | `/mis-mascotas/[token]` — "Prueba UX" over the diagonal blue band | Move the title clear of the pattern or add a scrim |
| O8 | **Seed/debug text leaks into UI**: appointment subtitle "PERF-STATE status (active)"; pet list/capture lead with the `PERF-XXXX` token before the name | 🟢 | `/mis-turnos`, `/inicio` | Data-quality (seed) — ensure display leads with the pet name, not the token/status string |
| O9 | **Found-pet contact is a single combined "Teléfono o email" free-text field**; active-credential contact sits behind a one-tap `<details>` | 🟢 | `/p/[token]` (active) | Split or `inputMode`-optimize the contact field; consider default-expanding the contact disclosure |
| O10 | **Revert from lost has no confirmation** ("Marcar encontrada/o" is instant) | 🟢 | pet profile (lost) | Fine given reversibility, but a light confirm avoids accidental taps |

## Org portal — third live pass (logged in as an org member "Refugio")

### 🔴 The entire org portal is down for this account (likely the org layout)
Logged in as an org/shelter member ("Refugio", org "Refugio Test" = `DIM-A26F-574G`). **Every org page
crashes** with a Server Components render error:

| Page | Error code |
|---|---|
| `/org/DIM-A26F-574G` (panel) | `513381940` |
| `/org/DIM-A26F-574G/mascotas` | `2283491539` |
| `/org/DIM-A26F-574G/miembros` | `2283491539` |

Two different sub-pages share **one digest (`2283491539`)**, which points at the **shared org layout**
(`app/org/[orgToken]/layout.tsx`) — the thing that loads org context, the viewer's membership + granted
capabilities, and builds the capability-scoped nav. If that data load throws (e.g. a malformed/again-null
membership), the whole portal is inaccessible. **This blocked the entire live org review** (intake,
adoption queue, members/invites, services, capability nav) — none of it is reachable on this account.

### Connected: the org login anomaly (user-reported)
The user reported the org login "didn't work right." Observed behavior that's consistent with a
membership/provisioning problem:
- After login, the org account **landed on the personal owner home** (`/inicio`): "Buen día, Refugio —
  **No tenés mascotas registradas**", 0 pets. A shelter operator is dropped into an empty *personal* pet
  experience rather than their org workspace. (A "Portales ▾" switcher exists to reach the org manually.)
- Switching via "Portales → Refugio Test" lands on the **crashing** org portal (above).

**Hypothesis to investigate:** the org membership/capability row for this account is in a bad state
(possibly created oddly during the irregular login/provisioning), which both (a) leaves the account
defaulting to the owner home and (b) throws in the org layout's capability/nav load. Trace digests
`2283491539` (org layout) and `513381940` (panel) in the Vercel logs; check the `org_memberships` /
capability grant rows for this user+org. Until fixed, the org portal is unusable for this member.

> Because the portal is fully down live, the **org UX critique falls back to the static review** in
> [`ux-usability-audit.md`](./ux-usability-audit.md) (Org portal section: no global search, adoption
> review lacks bulk/SLA, silent capability-gated nav, etc.). Those still stand; they just couldn't be
> re-verified live behind the crash.

---

## Live crash summary (most urgent — all found in-browser)

Five distinct production crashes were observed live, all the same class (Server Components render error,
caught by the otherwise-excellent error boundary). Ranked by user impact:

| Surface | Trigger | Code | Why it matters |
|---|---|---|---|
| **Public credential (lost mode)** | any pet with `lost` status | `752082971` | The hero moment — a stranger scanning a lost pet's QR — is 100% broken |
| **Org portal (all pages)** | org member opens their portal | `2283491539` / `513381940` | Shelters/clinics/etc. cannot use the product at all; tied to the login anomaly |
| **`/cuenta` (owner account)** | high-volume owner opens account | `3058248096` | Account management unreachable for this account |
| **Bad/worn QR token** | mistyped `/p/{token}` | (bare 404) | Stranger hits an English black-screen 404 |

The active credential, owner home, pet profile, event logging, lost flow (owner side), notifications,
appointments, transfers, admin, and gob dashboards all render fine — so these are targeted failures in
specific render paths (lost credential, org layout, `/cuenta` aggregation), not a broad outage. **Each
should be traced via its digest in the Vercel logs and given a defensive fallback in its render path.**

## Still pending (blocked)

- **Org workflows** (intake, adoption review, members/invites, services, capability nav): blocked by the
  org-portal crash above. Re-run once the org layout / membership issue is fixed.
- **Owner→vet upgrade** (`/cuenta/upgrade`): blocked by the `/cuenta` crash (O1).

---

*Live pass driven in-browser against the deployed preview. Screenshots of the credential crash and the bare
404 were captured and can be attached on request.*
