# UX Acceptance Gate — Cowork / Ciudadano addendum

**Agent:** Cowork (Ciudadano) · **Cohort A** · **Flows:** W1 alta · W2 reclamar · W3 peso→curva · W4 perdido→encontrado · W16 auth · W17 privacidad · W18 datos personales · + Público (landing/perdidas/adoptar/código/QR/denuncia) + Dueño screens
**Server:** http://localhost:3000 (built, pristine seed) · **Accounts:** `owner@dim.test` (Lucía, 10 pets) + public/anon
**Run window:** 2026-07-05 → 2026-07-06 (date rolled over mid-run) · Real Chrome (MCP)
**Rubric per key screen:** ¿Sobra? · ¿Falta? · ¿Autocontenido? · ¿De un vistazo? · **Severity:** Blocker / Mayor / Menor · **PASS = 0 Blockers AND Majors ≤ 5**

---

## VERDICT (this cohort): ❌ NO — NOT zero blockers

**1 Blocker · 5 Mayor · ~21 Menor.** The gate **fails** for cohort A: the **edit-profile flow is broken** (blank/stuck), and there is a **systemic React #418 hydration-mismatch** condition that degrades the account area and causes intermittent blank/frozen paints app-wide.

That said, the *substance* of the citizen product is strong: the **denuncia wizard, lost→found loop, alta, peso→curva (incl. natural-language routing), the Ley 25.326 data-rights screen, and the Tier-0 privacy model** are all excellent and self-contained. The failures cluster in (a) the account/`/cuenta` area and (b) public-facing data hygiene (seed text leaking, cross-screen status contradictions, pre-filled login).

### Severity tally
| Sev | Count | Items |
|---|---|---|
| **Blocker** | 1 | Editar perfil renders blank / stuck "Cargando…" (form never mounts) |
| **Mayor** | 5 | React #418 hydration → blank-flash/frozen paints · `/perdidas` leaks internal seed text on public cards · login ships pre-filled email+password · `/inicio` alert for a non-owned pet ("Firulais") · Credencial↔Libreta status contradictions |
| **Menor** | ~21 | see findings table |

---

## Matrix — (flow × screen) × 4 axes

Legend: ✅ pass · ⚠ issue · ❌ fail. Each cell = ¿Sobra? / ¿Falta? / ¿Autocontenido? / ¿De un vistazo?

| Flow / Screen | ¿Sobra? | ¿Falta? | ¿Autocontenido? | ¿De un vistazo? |
|---|---|---|---|---|
| **Público — Landing `/`** | ⚠ long 6-chapter scrollytelling; CTA repeated 3× | ✅ primary actions above fold | ✅ concept + entry points + legal footer | ⚠ blank viewport mid-scroll transition |
| **Público — `/perdidas`** | ❌ "(seed)"/"hotspot AMBA" jargon; 24h/7d=0 dead stats | ⚠ no photos (recognition); count "24" not "24 de 106" | ✅ filters+list+"reportar pérdida"+empty CTA | ⚠ 106 vs 24 mismatch; "visto AMBA" on non-AMBA pets |
| **Público — `/adoptar`** | ⚠ full filter panel over 0 results | ✅ empty state explains | ✅ strong empty-state copy | ✅ |
| **Público — código/QR + credencial** | ✅ Tier-0 minimal, no PII | ⚠ finder CTA on a *Fallecida* pet | ✅ valid + invalid both self-contained | ⚠ broken photo; "102 años" |
| **Público — código inválido** | ✅ | ✅ | ✅ excellent recovery CTAs | ✅ |
| **Público — Denuncia wizard (5 pasos)** | ⚠ code shown 2× on status; arbitrary emoji | ✅ every step self-explains | ✅ **excellent** — anónimo, code-return, no login | ⚠ big empty left column; tiny step counter |
| **Dueño — Login `/login`** | ⚠ pre-filled creds | ✅ | ✅ | ⚠ pre-filled operator email |
| **Dueño — `/inicio`** | ⚠ | ⚠ alert for non-owned pet, can't act | ✅ | ⚠ "Todo en orden" but alert shown; 4 pend vs SIN PEND |
| **Dueño — `/mis-mascotas`** | ⚠ "Canina ›"/REGISTRADA repeated | ⚠ no per-pet health at a glance; no photos | ✅ list+inscribir+reclamar+postulaciones | ⚠ identity yes, health state no |
| **Dueño — Perfil Rocco (credencial↔libreta)** | ✅ | ⚠ "SIN REGISTRO" vs libreta asiento | ✅ credencial/libreta/state-skin/QR | ⚠ future dates labeled "hoy"; 0/4 vs SIN PEND |
| **Dueño — W1 alta** | ✅ genuinely minimal (4 fields) | ✅ localidad autocompletes | ✅ **strong** — create→QR→ver perfil | ✅ |
| **Dueño — W3 peso→curva + NL** | ⚠ sheet title 2×; overflows right edge | ✅ helpful notes | ✅ **strong** — NL routing works | ✅ sparkline + tendencia legible |
| **Dueño — W4 perdido→encontrado** | ⚠ dup notif actions; sheet title 2× | ✅ poster/WhatsApp/geolocation | ✅ **excellent** cross-POV loop | ✅ emergency skin legible |
| **Dueño — W17 privacidad → credencial** | ✅ | ✅ model explicit | ✅ | ⚠ Compartir sheet overflows right edge |
| **Dueño — W18 datos personales (Ley 25.326)** | ✅ | ⚠ Eliminar vs Desactivar not differentiated | ✅ **excellent** — legally complete | ✅ clear sections + citations |
| **Dueño — W2 reclamar** | ✅ | ✅ dispute + DNI paths | ✅ good not-found state | ✅ |
| **Dueño — Mis postulaciones** | ✅ | ✅ | ✅ clean empty state + CTA | ✅ |
| **Dueño — Editar perfil** | — | — | ❌ **BLANK / stuck** | ❌ **nothing renders** |
| **Dueño — W16 reset `/recuperar`** | ✅ | ✅ | ✅ | ✅ |

---

## Findings

### 🔴 Blocker
| # | Screen | Finding | Evidence |
|---|---|---|---|
| B1 | `/cuenta?sheet=editar-perfil` | **Edit-profile renders blank / stuck on "Cargando…"** — the edit sheet never mounts, via direct URL *and* via clicking "Editar mi información". The owner **cannot edit name / phone / photo**. Reproduces §7 regression ("editar-perfil sin montar" + "/cuenta Cargando") on the clean built server. **[POCO INTUITIVO]** — had to open the console to understand it was a crash, not a slow load. | ss_6558sd1sx, ss_26798wbh2; console: React #418 |

### 🟠 Mayor
| # | Screen | Finding | Evidence |
|---|---|---|---|
| M1 | app-wide (worst on `/cuenta`) | **17× React error #418 (hydration mismatch, `args[]=HTML`)** across the session (chunk `e14262c0`). Root-cause candidate for the `/cuenta` blank-flash, the editar-perfil Blocker, and the intermittent blank/frozen paints seen throughout. Very plausibly from server/client date/relative-time rendering (app is full of "hace X", "ahora", "desde 6/7/2026"). | console log (17 exceptions) |
| M2 | `/perdidas` cards | **Internal seed text leaks to the public board**: cards render literal `VISTO POR ÚLTIMA VEZ: … — hotspot AMBA (seed)` — the string `(seed)` + internal "hotspot AMBA" jargon are visible to citizens. Makes the official board look broken/untrustworthy and gives a wrong "last seen" for pets located in other provinces. | ss_0954osgga |
| M3 | `/login` | **Login form ships PRE-FILLED** with an email (`govt@dim.test` — an *operator* account) + a populated password on a built/prod-like server. Reproduces §7 ("re-fill que pisa el email + contraseña que persiste"). A prod-like build should render empty credentials. | ss_5130801bv |
| M4 | `/inicio` | **Primary home alert references "Firulais" — a pet NOT in the owner's 10-pet roster** (confirmed on `/mis-mascotas`), so the owner can't act on it. It's also a vaccine due in **365 days** surfaced as *the* top alert while the header says "Todo en orden". Relates to §7 Firulais mismatch. **[POCO INTUITIVO]** — had to open the pet list to realize the alert isn't actionable. | ss_5440aj6nf |
| M5 | Credencial ↔ Libreta / Home ↔ Profile | **Cross-screen status contradictions** erode trust in the core value prop: (a) Credencial cumplimiento says "Vacuna antirrábica **SIN REGISTRO**" while the Libreta shows a real antirrábica asiento (declared, unverified) — should read "sin verificar", not "sin registro"; (b) `/inicio` lists Rocco "**SIN PENDIENTES**" while his profile says "**0 DE 4 AL DÍA**". A citizen can't tell if their pet is compliant. **[POCO INTUITIVO]** | ss_0868pprga, ss_5440aj6nf |

### 🟡 Menor (polish / calibrated)
| # | Screen | Finding |
|---|---|---|
| m1 | Landing + subpages | **Header/brand + footer inconsistency**: landing = square "M" logo, nav "La historia/Qué hace/Empezar", "Ingresar", footer CIUDADANÍA/OPERADORES/INSTITUCIONAL + "registro nacional de identidad y salud"; public subpages = round "m" logo, nav "Adoptar/Mascotas perdidas/Refugios/Denuncias", "Iniciar sesión", footer Producto/Información/Legales + "credencial digital sanitaria". At least 3 distinct footers/taglines observed. |
| m2 | `/perdidas`, `/adoptar` | **LOCALIDAD field placeholder mislabeled "Elegí una provincia"** (systemic shared component — appears on both). **[POCO INTUITIVO]** |
| m3 | `/perdidas` | Count mismatch: stat "ACTIVAS AHORA 106" vs list "24 mascotas" — should read "24 de 106". **[POCO INTUITIVO]** |
| m4 | `/perdidas`, credencial | No photos → letter-monogram / silhouette fallbacks (two inconsistent styles); homónimos (2×Mia/Pipo/Simba/Bruno). Weakens recognition — the whole point of a lost board. |
| m5 | Public credential | **Broken `<img>`** on the Tier-0 credential (alt shows, no image) — inconsistent with `/perdidas` monogram fallback; the flagship QR destination looks broken. |
| m6 | Public credential | "**102 años**" nonsensical age (Hachikō b.1923 easter egg) shown next to CREDENCIAL "Fallecida". |
| m7 | Landing hero | Hero card labels `DIM-HACH-0016` as "**Pampa**"; the real credential is "**Hachikō**" (demo name ≠ seed name for a resolvable code). |
| m8 | Libreta asientos | **Future-dated events labeled "hoy"**: Esterilización 10-jul-2026 & Microchip 6-jul-2026 shown "hoy" when today is 5-jul (§7 fechas futuras). |
| m9 | Denuncia status page | Código + "Copiar código" + "Descargar comprobante" rendered **twice** (green hero + status card). |
| m10 | Denuncia P5 | Send-method choice buttons (anónima / sumar contacto) expose **empty accessible names** (a11y) — screen readers won't announce them. |
| m11 | Denuncia P1 | Category emoji icons semantically mismatched (pill = maltrato físico, leaf = negligencia, box = abandono). |
| m12 | Denuncia wizard, alta | Content right-shifted with a **large empty left column** on desktop; step counter small/disconnected. |
| m13 | W3 / peso | Decimal separator inconsistent: values "28.50 kg" (dot) vs tendencia "28,5 kg" (comma). es-AR should be comma throughout. |
| m14 | W3 / peso | Stale per-event trend: older 30.00 kg card still says "Cargá otro peso para ver la curva." after a newer weight exists. |
| m15 | `/inicio` fact picker | Only 8 of 10 pets selectable — **Rocco & Greta missing** from the "Asentar un hecho" picker. |
| m16 | Sheets (peso, marcar-perdida/encontrada, compartir) | **Drawer overflows the right viewport edge on desktop (~1400–1549px)** — submit / "Habilitar Tier 2" / confirm can sit off-screen. |
| m17 | Native date/datetime inputs | Render MM/DD/YYYY (browser en-US locale), ambiguous for AR users. App's *own* spelled dates ("5 de jul de 2026") are correct — consider a custom DD/MM picker. |
| m18 | W4 | **Gender agreement inconsistent** for a male pet: owner UI "Marcar como **perdida**/encontrada/marcarla" (fem) vs public "Estoy **perdido**"/"Marcar como **encontrado**" (masc). |
| m19 | Notifications | Sighting notification header "URGENTE · REPORTE DE MASCOTA **ENCONTRADA**" overstates an *avistaje* (body clarifies "alguien reportó haber visto"); duplicate actions "Ver mascota" + "Ver Rocco". |
| m20 | Marcar-perdida sheet | Paso-2 heading "Qué se muestra al público" but body still shows Paso-1 location copy (stale description). |
| m21 | `/cuenta/privacidad` + Zona de riesgo | Two account-ending actions ("Eliminar mi cuenta" Ley 25.326 vs "Desactivar mi cuenta") not differentiated side-by-side; redundant "Ciudad Autónoma de Buenos Aires, CABA" jurisdiction (§7) still present on `/perdidas`. |

---

## Regression re-check (§7 on the clean build)
| §7 item | Status on clean server |
|---|---|
| `/cuenta` blank "Cargando…" + editar-perfil sheet not mounting | **REPRODUCES** — editar-perfil = Blocker; `/cuenta` blank-flashes ~2-3s then renders |
| Login re-fill / password persists | **REPRODUCES** — login pre-filled with `govt@dim.test` + password |
| Fechas futuras ("último evento 15/10/26") | **REPRODUCES (partial)** — esterilización/microchip future-dated but labeled "hoy" |
| "Firulais" notification mismatch / non-owned pet | **REPRODUCES** — `/inicio` alert for Firulais (not owned) |
| Jurisdicción "Ciudad Autónoma de Buenos Aires, CABA" redundant | **REPRODUCES** — on `/perdidas` cards (Kira, Zeus) |
| Placeholders "FOTO" en landing / tarjetas sin foto | **REPRODUCES** — "FOTO" placeholders + monogram fallbacks throughout |
| Error "Localidad" que dice "provincia" | **REPRODUCES** — LOCALIDAD placeholder "Elegí una provincia" on /perdidas & /adoptar |
| Notificaciones que no matchean estado | **PARTIAL** — W4 avistaje notification *did* match Rocco correctly (improved), but header label overstates it |

---

## Side-effect log (for revert — all clearly test-marked)
| # | Side-effect | Revert |
|---|---|---|
| 1 | Denuncia anónima **DEN-7HQY-RYGP** (Abandono / Moderado·MEDIA / desc "[PRUEBA UX-GATE / COWORK…]" / anónima, sin ubicación). Estado ABIERTA. | Admin/Gob descarta la denuncia de test |
| 2 | Peso **30.00 kg @ 2026-05-05** en Pipa (DIM-DEMO-0010) — evento inmutable | reseed DB |
| 3 | Peso **28.50 kg @ 2026-07-05** en Pipa (DIM-DEMO-0010) — evento inmutable | reseed DB |
| 4 | Mascota creada **"ZZ UXGate Test" — DIM-TVKM-4CP6** (Perro/Macho/La Plata), dueño owner@dim.test | eliminar/desactivar la mascota de test (o reseed) |
| 5 | Rocco (DIM-DEMO-0001) **PERDIDO→ENCONTRADO** — estado neto restaurado (Tier 0). Eventos perdido/avistaje/encontrado quedan en el ledger inmutable | reseed para limpiar el historial |
| 6 | Avistaje en Rocco (Plaza de Mayo, msg "[PRUEBA UX-GATE]…") → notificación al dueño | reseed |
| — | Reclamar: búsqueda de chip falso 999888777666555 (no encontrado) | sin efecto — no revert |

**NOT executed (per instructions / safety):** account deletion (stopped at confirmation + cancelled) · "Descargar JSON" data export (download-permission) · Tier-2 live flip (avoid exposing medical data) · account "Desactivar" · any wrong-password / real reclamar-dispute (cross-account).

---

## What's excellent (keep)
- **Denuncia wizard (W12 public):** plain-language categories, reassuring per-step microcopy, **privacy-first** (anónima default, no DNI), honest gov-integration disclosure, strong código-return UX, clean invalid-code recovery.
- **Lost→found (W4):** privacy-preserving defaults, state-skin emergency banner, first-person public "SE BUSCA", WhatsApp / A4-poster share, geolocated sighting, real-time owner notification, clear Tier-0 revert. The single best flow.
- **W1 alta:** genuinely minimal ("empezamos con lo mínimo") → immediate QR/credential handoff.
- **W3 peso→curva:** structured entry + **natural-language routing works** ("Le apliqué la vacuna antirrábica hoy" → pre-filled vacuna form); auto next-dose suggestion; provenance tags; "Asiento certificable".
- **W18 Ley 25.326 screen:** legally precise (art.14 acceso / art.16 supresión), soft-delete + PII-hash explanation, transparent sanitary-preservation nota, audit-log note, deletion gated behind a required Motivo.
- **W17 privacy model:** Tier-0-by-default (no PII), granular revocable control (temporary Tier-2 medical-only *without* contact, time-boxed revocable links, per-field emergency toggles default OFF). Strong data minimization.

---

## Consolidated call (this cohort)
**Fix before ship:** (1) the **editar-perfil Blocker** and the underlying **React #418 hydration** condition — this is the biggest risk and likely explains several blank/frozen symptoms; (2) stop leaking **"(seed)" / internal text** to the public board; (3) remove **pre-filled login credentials** from the built server; (4) reconcile the **"Firulais" / non-owned-pet alert** and the **credencial↔libreta status contradictions**. The rest are Menor polish. Sufficiency (does each screen say the *right amount*) is generally very good — the citizen flows are legible and self-contained; the failures are concentrated in the account area and in data hygiene, not in the information architecture.

> Note: national/aggregate KPIs were **not** asserted (per brief). Cross-POV org/gov closure of W4/W12 is Cursor's cohort; this addendum covers the citizen/owner side only. Final PASS/FAIL is holistic — to be merged with the Cursor addendum in a single synthesis pass.
