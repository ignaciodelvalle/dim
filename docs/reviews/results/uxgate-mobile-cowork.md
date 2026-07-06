# UX Acceptance Gate — Cowork / Ciudadano · **Mobile** addendum

**Agent:** Cowork (Ciudadano) · **Viewport target:** 390×844 · **Viewport achieved:** **657×693** (see Environment) · Real Chrome (MCP)
**Server:** http://localhost:3000 (built) · **Accounts:** `owner@dim.test` (Lucía, 10 pets) + logged-out/anon
**Run:** 2026-07-06
**Screens (per brief):** landing · /perdidas · /adoptar · buscar por código · credencial/libreta (flip + QR) · alta de mascota · wizard de denuncia · /cuenta
**Rubric per screen:** ¿Sobra? · ¿Falta? · ¿Autocontenido? · ¿De un vistazo? — **+ mobile axes:** sin overflow horizontal · áreas táctiles ≥44px · drawer/hamburguesa · forms a una mano · ¿se ve el QR?
**PASS = 0 Blockers AND Majors ≤ 5.**

---

## VERDICT (mobile, this cohort): ❌ NO — 1 Blocker

**1 Blocker · 1 Mayor · 9 Menor.**

The mobile gate **fails on one Blocker**: the **credencial/libreta (el buque insignia) does not render on mobile** — both the owner view (`/mis-mascotas/[token]`) and the public QR-scan destination (`/p/[code]`) hang indefinitely on **"Cargando…"**. The public credential is the endpoint a citizen reaches after scanning a lost pet's QR, so the core citizen loop (**scan QR → ver contacto del dueño**) is broken in this run.

**Important nuance — the mobile *design* itself is strong.** Every screen that rendered had **zero horizontal overflow**, 16px inputs (no iOS zoom-on-focus), 44–46px primary targets, full-width CTAs, bottom-sheets with drag handles, and a bottom tab bar for authenticated nav. The **denuncia wizard, alta, /cuenta, and the editar-perfil sheet are excellent on mobile**. The Blocker is a **client-render/hydration freeze** (all JS chunks load 200; no hanging network request; no captured console error) that is **intermittent** — the credential rendered once early in the run, then froze on every subsequent load across pets, tabs, owner+public, and reloads. This is the **same frozen-paint class of failure the desktop Cowork addendum flagged** (React #418 / "/cuenta Cargando…"), here landing squarely on the credential component. So: the layout/ergonomics pass; the gate fails on a **rendering-reliability defect**, not a mobile-layout defect.

### Severity tally
| Sev | Count | Items |
|---|---|---|
| **Blocker** | 1 | Credencial/Libreta hangs on "Cargando…" (owner `/mis-mascotas/[token]` **and** public `/p/[code]`) — flagship + QR→contacto loop don't render on mobile |
| **Mayor** | 1 | `/adoptar` hangs on "Cargando…" (same client-render freeze family) — public screen unusable |
| **Menor** | 9 | LOCALIDAD placeholder mislabel · 106-vs-24 count · landing sin hamburguesa · tap targets 30–40px · sin fotos (monogramas) · iconos de categoría de denuncia · dos acciones de cierre de cuenta · rate-limit con exceso de espacio · filtros 3-en-fila a 657 |

> ⚠️ **Coverage caveat (see Environment):** the true phone width of **390px could not be emulated** (extension pins the render viewport; narrowest achievable = 657px). 657 is below the 768 breakpoint, so the **mobile treatment did engage** (bottom tab bar, stacked layout, hidden desktop nav). But **sub-640 phone-specific layouts** (1-column grids, 390px overflow, true one-hand reach) are **unverified**. Findings hold for ≤657px; a real-device / DevTools-device-mode pass at 390 is recommended to close the gate cleanly.

---

## Matrix — (screen × 4 rubric axes) + mobile

Legend: ✅ pass · ⚠ issue · ❌ fail · — n/a. QR column = "¿se ve el QR?"

| Screen | ¿Sobra? | ¿Falta? | ¿Autocont.? | ¿De un vistazo? | Overflow-X | Tap ≥44 | QR |
|---|---|---|---|---|---|---|---|
| **Landing `/`** (anon) | ⚠ scrollytelling largo | ⚠ nav oculta sin hamburguesa | ✅ hero + CTAs + código | ✅ | ✅ ninguno | ✅ CTAs grandes | — |
| **`/perdidas`** | ⚠ stats 24h/7d = 0 | ⚠ sin fotos; 106≠24 | ✅ filtros+lista+CTA | ⚠ 106 vs 24 | ✅ ninguno | ⚠ selects 40px | — |
| **`/adoptar`** | — | — | ❌ **no renderiza** ("Cargando…") | ❌ | — | — | — |
| **Buscar por código** | ✅ | ✅ | ✅ input + Buscar + ayuda | ✅ | ✅ ninguno | ✅ 46px | — |
| **Credencial/Libreta (flip+QR)** | ✅ (Tier-0) | — | ❌ **hangs "Cargando…"** (owner+público) | ❌ | ✅ ninguno* | — | ❌ **no se ve** (tarjeta no monta)** |
| **Alta de mascota** | ✅ mínimo (4 campos) | ✅ | ✅ | ✅ | ✅ ninguno | ✅ 46px | — |
| **Wizard de denuncia** | ✅ | ✅ | ✅ **excelente** | ✅ | ✅ ninguno | ✅ tarjetas grandes | — |
| **`/cuenta`** | ✅ | ✅ | ✅ secciones 01–04 | ✅ | ✅ ninguno | ⚠ "Menú de cuenta" 30px | — |

\* medido cuando el shell montó (con `Dar vuelta` + toggle Credencial/Libreta presentes); el *contenido* de la tarjeta no monta.
\** en la única carga exitosa (temprano en la corrida) el QR era un **SVG 104×104 a opacidad 1** (tamaño escaneable, DOM-confirmado). En todas las cargas posteriores la tarjeta quedó en "Cargando…", así que en la práctica **el QR no se ve**.

---

## Findings

### 🔴 Blocker

| # | Screen | Finding | Evidence |
|---|---|---|---|
| **B1** | `/mis-mascotas/[token]` (owner) **y** `/p/[code]` (público) | **La credencial/libreta no renderiza en mobile — se cuelga en "Cargando…".** Header y footer montan; el **contenido de la tarjeta (nombre, datos, QR) nunca aparece**. Reproducido en **DEMO-PET-001 (Rocco) y DEMO-PET-002 (Greta)**, en pestañas nuevas, tras recargas, y en la **credencial pública** (`/p/DIM-HACH-0016` → "Hachikō", tras pasar el rate-limit). **La red no ayuda**: todos los chunks JS responden **200**, **no hay request colgado** (sólo un `injection-topics.js` de extensión), y no se capturó error de consola → es un **freeze de render/hidratación del cliente**, no una caída de backend. Es **intermitente**: la credencial de Rocco montó **una** vez al inicio de la corrida (con toggle Credencial/Libreta, botón **Dar vuelta** y **QR SVG 104×104**), y a partir de ahí se congeló siempre. **Impacto:** la pantalla insignia y el destino del escaneo de QR (perdido→contacto) **no funcionan** en el flujo ciudadano móvil. **Misma familia** que el frozen-paint / React #418 del addendum desktop. **[POCO INTUITIVO]** — "Cargando…" perpetuo sin mensaje de error ni reintento. | ss_5456q8i43 (única carga OK, owner); DOM: `hasRocco:false, loading:true` tras ~20s en Rocco, Greta y público; network: 22 requests, todos 200 |

### 🟠 Mayor

| # | Screen | Finding | Evidence |
|---|---|---|---|
| **M1** | `/adoptar` | **`/adoptar` se cuelga en "Cargando…"** (>8s, múltiples recargas). Mismo freeze de render del cliente que B1: header+footer montan, la lista no. Pantalla pública de adopción **inusable** en la corrida. (En desktop `/adoptar` sí cargaba con empty-state; acá el componente de lista quedó congelado — consistente con la intermitencia de B1.) | DOM `loading:true` tras 8s; network todos 200 |

### 🟡 Menor

| # | Screen | Finding |
|---|---|---|
| m1 | `/perdidas` (+ `/adoptar` cuando carga) | **LOCALIDAD con placeholder "Elegí una provincia"** (campo compartido mal etiquetado). Reproduce desktop m2 — también en mobile. |
| m2 | `/perdidas` | Contradicción de conteo: stat **"ACTIVAS AHORA 106"** vs lista **"24 mascotas"**. Debería leerse "24 de 106". Reproduce desktop m3. |
| m3 | Landing `/` (anon) | **Header sin hamburguesa/menú en mobile:** los links de nav (La historia / Qué hace / Empezar) están **ocultos y sin affordance** para abrirlos; sólo queda "Ingresar". Son anclas del scrollytelling (se llega scrolleando), por eso es Menor — pero no hay forma de saltar a las secciones. (Nota: usuarios logueados sí tienen **bottom tab bar** Inicio/Mis mascotas/Denuncias.) |
| m4 | Global | **Áreas táctiles < 44px:** selects de filtro `/perdidas` **40px**, botón **"Menú de cuenta" 30px**, "Continuar →" del wizard **43px** (1px corto), checkboxes ~16px (el label extiende el hit-area), pills de "filtros rápidos" bajitas. Ninguno rompe el uso; ajustar a 44px. |
| m5 | `/mis-mascotas`, `/perdidas`, credencial | **Sin fotos reales → placeholders "FOTO" y monogramas de letra** (T, B…). Debilita el reconocimiento, sobre todo en el tablero de perdidas (que existe justamente para reconocer). Reproduce desktop m4. |
| m6 | Denuncia · Paso 1 | Íconos de categoría **semánticamente cruzados** (píldora = maltrato físico, hoja = negligencia). Reproduce desktop m11 — en mobile los íconos se ven pero confunden. |
| m7 | `/cuenta` | **Dos acciones de cierre de cuenta**: "Eliminar cuenta" (Ley 25.326, bajo *Privacidad y datos* 03) y **"Desactivar mi cuenta"** (bajo *Zona de riesgo* 04). Separadas por sección (mejor que desktop) pero siguen siendo dos caminos que un usuario puede confundir. Relaciona desktop m21. |
| m8 | `/p/[code]` rate-limit | La pantalla **"Demasiadas consultas"** centra el mensaje con **mucho espacio vertical vacío** en mobile (flota a media pantalla); sin botón de reintento (sólo "esperá unos minutos"). Cosmético. |
| m9 | `/perdidas` filtros | A 657px los filtros se muestran **3-en-fila** (ESPECIE / PROVINCIA / LOCALIDAD). A 390px reales deberían apilarse; **sin verificar** (ver Environment) — riesgo de apretujado en teléfono angosto. |

---

## Notas mobile por pantalla (lo que sí se probó)

- **Landing (anon, 657px)** — Sin overflow. Header sticky (logo cuadrado "M" + "Ingresar"); nav oculta sin hamburguesa (m3). Sección **"¿Tenés un código?"** con input 16px/46px + botón "Buscar" en línea, ayuda clara ("Credencial pública o seguimiento de denuncia — sin login"). Cards "Perdí/Encontré una mascota" grandes y táctiles. `ss_90387pa6j`, `ss_1786dofsn`.
- **/perdidas** — Sin overflow (sw 642). Stats + filtros + lista. Cards en 2 columnas a 657 (monogramas, sin fotos). "24 mascotas" vs "106 ACTIVAS" (m2). LOCALIDAD mal etiquetada (m1). `ss_9413k6lqm`.
- **Buscar por código** — Input acepta el código y **rutea correctamente** (`DIM-HACH-0016` → `/p/DIM-HACH-0016` → título "Hachikō | Credencial MiMAR"). UX del buscador: buena en mobile. El destino quedó rate-limited y luego "Cargando…" (B1). `ss_1786dofsn`.
- **Credencial/Libreta (flip+QR)** — En la única carga OK: toggle segmentado **Credencial(Frente) / Libreta(Dorso)** + botón **"Dar vuelta"** (patrón de flip), QR SVG **104×104**, código "DIM-PET-001", sin overflow. **No se pudo probar el flip en vivo** ni ver el QR nítido: la tarjeta se congeló en "Cargando…" en todas las cargas posteriores (B1). `ss_5456q8i43`.
- **Alta de mascota** — Sin overflow. Form **mínimo**: NOMBRE, ESPECIE (Perro/Gato/Otra, cards), SEXO (radios), Localidad. Inputs **16px** (sin zoom iOS) y **46px** de alto. Excelente en mobile. **No se envió** (sin side-effect). `ss_5008bwgf7`.
- **Wizard de denuncia (pasos 1–3)** — **Sobresaliente en mobile.** Paso 1 "¿Qué pasó?" (cards de categoría full-width con radio). Paso 2 "¿Qué tan grave?" (cards color-coded 🚨/⚠️/🔍, barra de progreso, flecha atrás, copy tranquilizador). Paso 3 "¿Dónde y cuándo?" (**textarea 142px + contador 0/2000**, radios temporales, autocomplete de dirección — **todo a 16px**). Sin overflow. **Guard de cambios sin guardar** al salir. **No se envió** (frené antes del submit; descarté el borrador). `ss_2931jpu2g`, `ss_0137yuxuf`, `ss_63174i756`.
- **/cuenta** — Sin overflow. IA con **secciones numeradas 01–04**: Datos de cuenta (Lucía Tester, badges DUEÑO/PERSONAL/10 MASCOTAS), Verificaciones (DNI no declarado → "Declarar ahora"), Privacidad (toggle "Mostrar mi nombre en la credencial pública"), **Zona de riesgo** (card roja "Desactivar mi cuenta"), "Cerrar sesión". **La hoja "Editar mi información" (`?sheet=editar-perfil`) SÍ monta en mobile** — bottom-sheet con drag handle, foto, nombre, teléfono, contactos de emergencia, todo prellenado: **el Blocker B1 del addendum desktop (editar-perfil en blanco) NO se reproduce en mobile.** `ss_8468yqydq`, `ss_4248y4pf3`, `ss_6189qn1o2`.

---

## Lo que está excelente (mantener)
- **Cero overflow horizontal** en todas las pantallas que renderizaron (sw ≤ 642 vs viewport 657). Sólido en el eje móvil clave.
- **Wizard de denuncia:** el mejor patrón mobile del producto — cards táctiles, severidad color-coded, textarea cómoda con contador, progreso + volver, copy tranquilizador, guard de "salir sin guardar".
- **Forms a una mano:** inputs a **16px** (evita el auto-zoom de iOS), targets 46px, CTAs full-width, bottom-sheets con drag handle.
- **Navegación autenticada:** **bottom tab bar** (Inicio / Mis mascotas / Denuncias) — patrón mobile correcto.
- **Alta:** genuinamente mínima ("empezamos con lo mínimo").
- **editar-perfil** monta bien en mobile (no reproduce el Blocker desktop).
- **Buscar por código:** claro, con ayuda, y **rutea bien**.
- **UX protectora:** rate-limit público ("Demasiadas consultas") y guard de cambios sin guardar del wizard.

---

## Environment / limitaciones de la corrida (leer antes del veredicto)

1. **Viewport: 390×844 solicitado → 657×693 logrado.** La extensión de Chrome **fija el viewport de render** (1549×944 en la pestaña original; **657×693** en pestañas nuevas) **desacoplado de la ventana del SO**. Intenté y **descarté**: `resize_window` (mueve la ventana, no el viewport; piso ~657), reset de zoom y `F12`/`Ctrl+Shift+M` (los atajos de navegador no llegan vía teclas sintéticas), y **iframe a 390px** (bloqueado por `X-Frame-Options` de la app). 657 está **por debajo del breakpoint 768**, así que el **tratamiento mobile sí se activó** (bottom tab bar, layout apilado, nav desktop oculta). **No verificable a 657:** apilado real a <640 (grids de 1 columna), overflow a 390px exacto, y ergonomía real de una mano en teléfono. **Recomendación:** pasada final en dispositivo real o Device Mode a 390.
2. **Captura de pantalla intermitente:** `Page.captureScreenshot` dio timeout con frecuencia (renderer hitching); varias tomas necesitaron reintento. Los IDs `ss_*` son capturas de sesión.
3. **Rate-limit:** el hammering de la revisión disparó "Demasiadas consultas" en la credencial pública (auto-resetea en minutos) — esperado por el diseño de protección de superficie pública.

---

## Side-effect log (para revertir — sin efectos irreversibles)

| # | Acción | Efecto / Revert |
|---|---|---|
| 1 | Login `owner@dim.test` → navegación → **"Cerrar sesión"** | Sólo sesión; sin mutación de datos |
| 2 | Wizard de denuncia: completé **pasos 1–3** (Abandono / Moderado / textarea vacía) | **NO se envió** — descartado por el guard "salir sin guardar". **No se creó denuncia.** |
| 3 | Alta de mascota: **sólo vista** | **NO se envió.** No se creó mascota. |
| 4 | `?sheet=editar-perfil`: **sólo vista** | **NO se guardó.** Sin cambio de perfil. |
| 5 | Consultas públicas de código (`DEMO-PET-001`, `DEMO-PET-002`, `DIM-HACH-0016`) | Lecturas; dispararon rate-limit (auto-reset). Sin efecto persistente. |

**NO ejecutado (por seguridad):** eliminar/desactivar cuenta (frené antes de confirmar) · descargar datos (permiso de descarga) · Tier-2/exponer datos médicos · cualquier envío/submit.

---

## Llamado consolidado (mobile)

**Arreglar antes de ship:** (1) el **freeze de render de la credencial/libreta** (B1) — es el bloqueante: la pantalla insignia y el destino del QR (perdido→contacto) no montan en mobile; misma familia que el frozen-paint / React #418 del addendum desktop, muy probablemente hidratación server/cliente sobre contenido con fechas ("hace X", asientos fechados). (2) El mismo freeze tira **`/adoptar`** (M1). Ambos son **de render/confiabilidad, no de layout**.

**El diseño mobile en sí pasaría el eje de layout/ergonomía:** cero overflow, forms a una mano, wizard y alta excelentes, bottom-nav correcta, y varias reglas de trust/privacidad intactas. Una vez estabilizada la hidratación de la credencial, y con una pasada a 390px real (Environment #1), este cohort queda muy cerca del PASS. Los Menores son pulido: LOCALIDAD mal etiquetada, 106≠24, hamburguesa en landing, targets a 40/30px, y fotos ausentes.

> Nota: veredicto acotado al POV ciudadano/dueño en **mobile ≤657px**. El cierre cross-POV (org/gob) y la verificación a 390px real quedan para una pasada complementaria; el PASS/FAIL final es holístico y debe fusionarse con las demás síntesis.
