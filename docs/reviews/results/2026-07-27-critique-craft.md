# Crítica X2 — Craft y consistencia visual transversal

> **Plan**: `docs/reviews/2026-07-26-plan-criticas-diseno.md` §4b, ficha X2 · **Fecha**: 2026-07-27
> **Persona**: design lead haciendo QA de sistema sobre las 14 pantallas muestreadas de los 4 portales (ciudadano público, dueño, /gob operativa, /admin+panorama).
> **Evidencia visual**: `docs/reviews/results/2026-07-27-critique-screenshots/` — landing/desk-home, landing/mob-home, credencial/mob-normal, credencial/mob-lost-open, finder/desk-perdidas, alta/desk-vacio, alta/desk-wizard-1, libreta/desk-lista, libreta/desk-detalle, cuenta/desk-cuenta, operativa/govt-home, operativa/govt-vigilancia, operativa/admin-outbox, panorama/pan-entry.
> **Código**: `app/globals.css` (tokens @theme), `components/ui/*` (Ln\*), `components/ui/dashboard/*` (Op\*), `components/ui/REGISTRY.md`, `scripts/check-design-tokens.ts` + `scripts/design-tokens-baseline.json`.
>
> **Declaraciones de alcance**:
> - **Dark mode: NO capturado.** Todo lo afirmado sobre dark sale del código: está **desactivado por decisión** (`app/globals.css:320-326` — "El DS oficial gob.ar es light-only"; `@variant dark` apunta a una clase `.dark` que nunca se monta, las 325+ clases `dark:*` legacy son inertes y `lint:tokens` regla 2 bloquea nuevas). El único tema oscuro que existe, `[data-theme="situation-room"]` (`globals.css:368-426`, ~60 líneas), quedó **muerto**: el skin v1 del panorama fue retirado (`components/panorama/PanoramaShell.tsx:157-159`, decisión PO 2026-07-11 "LIGHT operator theme on BOTH /gob and /admin"). No hay spot-checks posibles porque no hay dark alcanzable; el foco (5) de la ficha se resuelve así.
> - **Org portal: fuera de tanda 1** (plan §5). El tier teal (`--color-ln-tl-*`) no se evalúa.
> - **`[ENTORNO]`** (no criticable): fotos de mascotas rotas/placeholder (imagen quebrada en credencial/mob-normal y el alt "Santa's Little Helper" visible en libreta/desk-detalle son artefactos del seed sin storage; el *fallback* de inicial sobre trama sí es estado real de producto y se evalúa como tal), datos sintéticos (28 perdidas, Salta×6 en outbox, 0 en KPIs), shim de auth.

---

## Impresión general (¿parece UN producto?)

**Sí — parece una familia de dos pieles cosida por una marca fuerte, con tres costuras flojas.** El sistema declarado en `components/ui/REGISTRY.md` (piel `Ln*` ciudadana cálida sobre papel `#fbfaf5` / piel `Op*` operadora fría sobre navy `#0a3556`) se cumple en pantalla: landing, credencial, alta, libreta y cuenta comparten papel, serif IBM Plex, mono para códigos y el motivo "documento" (banda guilloché, MRZ, QR); /gob, /admin y panorama comparten rail navy, Encode Sans compacta, eyebrows mono y tiles densos. El azul institucional es **el mismo hex en ambas pieles** (`#0e5a99`, `globals.css:41` y `:238`) y funciona como hilo conductor. La firma más lograda es la credencial-documento, que aparece coherente en tres lugares (mock del hero de landing, `/p/<token>`, carnet de libreta).

Las costuras flojas: **(a)** `/perdidas` es el híbrido menos resuelto — masthead navy y KPIs con rótulo mono-uppercase que hablan dialecto operador sobre una página ciudadana, más una CTA roja cruda (ver Botones); **(b)** el mismo estado de mascota cambia de palabra, género y anatomía según el portal (ver Chips); **(c)** el botón primario tiene cinco geometrías conviviendo (ver Botones). Ninguna costura rompe la sensación de "gob.ar serio"; todas se notan en cuanto se mira dos pantallas a la vez.

---

## Tipografía entre portales

**¿Una escala o cuatro?** Respuesta: **una escala tokenizada para el operador, y una "escala" artesanal de ~10 valores px sueltos para el ciudadano.**

| Superficie (captura) | h1 real | Familia/peso | Tamaño | Caja | Mecanismo |
|---|---|---|---|---|---|
| Landing `/` (landing/desk-home) | "Toda una vida, en una sola miMAR." | IBM Plex Serif 600, tracking −0.035em | `clamp(42→92px)` | Sentence + punto final | `.lp-h-hero` (`globals.css:667-670`) |
| Catálogo público `/perdidas` (finder/desk-perdidas) | "Mascotas perdidas" | Serif 600 | **42px** raw | Sentence, keyword en rojo | `app/(public)/perdidas/page.tsx:105` |
| Credencial `/p` (credencial/mob-normal) | nombre de la mascota | Serif 600, tracking −0.02em | **27px** raw | — | `app/(public)/p/[publicToken]/page.tsx:674` |
| Dueño hub (alta/desk-vacio, cuenta/desk-cuenta) | "Mis mascotas" / "Mi cuenta" | Serif 600, tracking −0.02em | **34px** raw | Sentence | `mis-mascotas/page.tsx:204`, `cuenta/page.tsx:180` |
| Dueño subpáginas | reclamar 28 / postulaciones 30 / devolución 24 / turnos 26-30 / LnHero 32 | Serif 600 | **24–32px** raw, por página | Sentence | p.ej. `app/(app)/turnos/buscar/page.tsx:56` |
| `/gob` y `/admin` (govt-home, govt-vigilancia, admin-outbox) | "Panel de jurisdicción", "Mapa de vigilancia", "Bandeja de salida…" | Encode Sans 600 | **`--text-title` 22px** token | Sentence, con eyebrow mono-uppercase 12px | `ScreenHeader.tsx:63-65` — un solo mecanismo |
| `/admin/panorama` (pan-entry) | sin h1 de página; eyebrow "CENTRO DE SITUACIÓN NACIONAL"; informe usa 20px bold | Encode Sans | 20px (`text-xl`) | Uppercase eyebrow | `PanoramaInformeSituacion.tsx:74` |

- 🟡 **SISTÉMICO (X2-S3) — La mitad ciudadana no tiene escala de display.** El @theme define pasos hasta `--text-2xl` 24px + `--text-title` 22px (`globals.css:155-165`) — pensados para el operador — y ningún token de display serif. Resultado: cada página ciudadana elige a mano (20, 24, 26, **27**, 28, 30, 32, 34, 42px + clamp del hero). Todos son `text-[Npx]` arbitrarios **grandfathered** en el baseline del ratchet. La familia/peso/tracking sí son consistentes (serif 600, −0.02em), o sea que la deriva es solo de tamaño: es tokenizable con 3 pasos sin re-diseñar nada.
- 🟢 PUNTUAL — El operador está resuelto: eyebrow + `--text-title` vía `ScreenHeader` es exactamente el patrón que el ciudadano no tiene. La densidad menor del h1 gob (22 vs 34) es decisión documentada, no accidente (ver Densidad).
- 🟢 PUNTUAL — Eyebrow de govt-home lee "MIMAR GOBIERNO · **GOBIERNO** · PALERMO, CABA" (redundancia de armado del eyebrow, visible en operativa/govt-home.png).

---

## Chips y badges

Censo completo de lo visible en las 14 capturas, con anatomía:

| Chip (captura) | Caja | Radio | Tipografía | Mayúsculas | Icono | Fuente de verdad |
|---|---|---|---|---|---|---|
| `AL DÍA` / `PERDIDA` — mock hero landing (landing/mob-home, desk-home) | tinte + borde | **pill** | mono 10px, track .1em | UPPER | no | `.lp-hcard-badge` (`globals.css:1027-1041`) |
| `AL DÍA` / `REGISTRADA` / `PERDIDO` — lista dueño (libreta/desk-lista) | tinte + borde (REGISTRADA: blanca outline) | **rect 2px** (`--radius-xs`) | mono 9px, track .12em | UPPER | sí (check/sirena) | `LnStatusFlag` (`StatusFlag.tsx:74-88`) |
| `NIVEL 0 · IDENTIDAD` — credencial (credencial/mob-normal) | tinte celeste + borde | **pill** | mono 9px, track .08em | UPPER | no | `p/[publicToken]/page.tsx:614-618` |
| `PERDIDA · hace 1 mes` — credencial (mob-lost-open) | sólido rojo, texto blanco | **pill** | mono | UPPER + recency lower | sí (sirena) | `.pc-sit-chip`, label **con género** (`page.tsx:630`) |
| `PERDIDO/A` — pennant card /perdidas (finder/desk-perdidas) | **sólido rojo, esquina viva (radio 0)** | 0 | sans 12px bold, track wider | UPPER | no | `perdidas/page.tsx:350-352`, **con género** vía `lostLabel` (`lib/utils/format.ts:381`) |
| `HACE 1 MES` — card /perdidas | sólido (mute/warn/err según urgencia) | pill | sans 12px semibold | UPPER | no | `perdidas/page.tsx:354-358` |
| `VIGENTE` / `REGISTRADA` / `SÍ` — carnet (libreta/desk-detalle) | tinte verde + borde | rect 2px | mono 10-12px | UPPER | no | `LnVstamp` (`StatusFlag.tsx:133-151`) / `LnBadge` (`Badge.tsx:32-46`) |
| `Microchip verificado` / `📍 Recoleta` — carnet | outline blanca | pill | sans, sentence | Sentence | sí | metadata pills del carnet |
| `EN TRATAMIENTO` — flotante sobre action bar (desk-detalle) | sólido oscuro | pill | mono | UPPER | sí | tab dorso del carnet |
| `DUEÑO/A` + `PERSONAL` — cuenta (desk-cuenta) | tinte celeste / outline blanca, lado a lado | rect 2px | mono | UPPER | no | LnBadge info/neutral |
| `GOB · PALERMO, CABA` — topbar /gob (govt-home) | **sólido navy**, texto blanco | rect | mono | UPPER | no | topbar operador |
| `SUPERADMIN · UNIVERSAL` — topbar /admin (admin-outbox) | **outline blanca** | rect | mono | UPPER | no | mismo slot, fill opuesto |
| `ENTREGADO` / `INCUMPLIMIENTO` — outbox (admin-outbox) | tinte st-ok / st-err + borde | rect | mono | UPPER | no | `OpStatusPill` + remap `st-*` — **disciplinado** |
| `Datos de demostración` — panorama (pan-entry) | tinte ámbar | pill | sans | Sentence | no | strip del panorama |
| `⊘ k<5 protegido` — leyenda panorama | gris | pill | sans | lower | sí | leyenda de capa |
| Filtros rápidos `/perdidas` y segmented `Período` /gob | outline / activo sólido azul | pill | sans | Sentence | no | familia interactiva (LnChip-like) — coherente |

Lecturas:

- 🔴 **SISTÉMICO (X2-S1) — El género del estado depende del portal.** El repo YA tiene la solución compartida (`lostLabel(sex)` — comentado "*Shared so all four surfaces agree*", `format.ts:376-387` — y `situationLabelForSex` en la credencial), pero `LnStatusFlag` hardcodea labels con género fijo **mezclado dentro del mismo mapa**: `PERDIDO` masculino, `REGISTRADA`/`PREÑADA` femeninas (`StatusFlag.tsx:16-57`). Resultado visible: **Luna (Mestiza pequeña · Hembra) lleva chip "PERDIDO"** en libreta/desk-lista.png, la misma mascota sería "PERDIDA" en su credencial y "PERDIDO/A" en el catálogo. La superficie del dueño — el único usuario que con seguridad conoce el sexo — es la única que lo ignora. Hay hasta test de sex-correctness para el cartel (`PosterPreview.test.tsx:45-59`); el chip de la lista quedó fuera de esa ola.
- 🟡 **SISTÉMICO (X2-S4) — Zoo de anatomías en la piel ciudadana.** El mismo tipo de objeto ("estado, solo lectura") aparece como rect 2px (lista), pill (credencial y landing), pennant a sangre sin radio (/perdidas) y pill sólida flotante (carnet). Peor: el mismo literal **"REGISTRADA" es outline blanca en la lista y tinte verde en el carnet** — dos pantallas adyacentes del mismo flujo. La regla interna buena que sí existe (interactivo = pill sentence-case; solo-lectura = mono uppercase) sobrevive; la geometría y el fill de solo-lectura no tienen regla. El lado operador, en contraste, es disciplinado: `OpStatusPill` + tokens `st-*` en todas las bandejas.
- 🟢 PUNTUAL — `GOB` sólido navy vs `SUPERADMIN` outline en el mismo slot del topbar (¿codifica alcance local vs universal? no hay leyenda que lo diga); `DUEÑO/A` tinte + `PERSONAL` outline lado a lado en cuenta sin regla aparente de cuándo un rol va tinted.
- 🟢 PUNTUAL — El pill "EN TRATAMIENTO" del dorso pisa la action bar del carnet (libreta/desk-detalle.png): colisión visual con "Editar datos"/"Marcar como perdida".

---

## Botones y CTAs

**¿Misma familia?** Dos familias declaradas (Ln/Op — decisión documentada en REGISTRY.md, correcta), pero **cinco geometrías reales** para el botón primario:

| Superficie (captura) | Primario | Radio | Texto | Código |
|---|---|---|---|---|
| Landing (desk-home: "Crear mi miMAR", "Cómo funciona") | azul sólido / ghost outline | **8px** (`--radius-lg`) | 15px/600 | `.lp-btn` (`globals.css:689-735`) |
| App dueño (alta/desk-vacio: "+ Inscribir mascota", "Cargar una mascota"; wizard "Continuar") | azul sólido | **3px** (raw `rounded-[3px]`) | **12.5px** md / 13px lg (raw) | `LnButton` (`Button.tsx:53-66`) |
| Credencial pública (mob-lost-open: "Está conmigo", "Vi a la mascota…") | azul/ok sólido, pill | **9999px** | 12px/600, min-h 44px | `CredentialActionBar.tsx:91-101`, `LnLinkButton` shape pill |
| Catálogo /perdidas ("Buscar") | **rojo `ln-err` sólido** | **4px** | 12px | **raw `<button>`** `LostFiltersBar.tsx:178-183` |
| Operador (govt-home "Copiar vista"; formularios gob/admin) | azul-op sólido / ghost | **6px** (`--radius-op-btn`) | **14px** (`--text-md`) | `OpButton.tsx:40-70` |

- 🔴 **SISTÉMICO (X2-S2) — El canon declarado y el canon ejecutado se contradicen.** `globals.css:119-126` declara el pill 9999px como "the canonical pill … for buttons and badges" alineado con Poncho `_buttons.scss`; pero el primitivo ciudadano central (`LnButton`) es 3px, el operador 6px (tokenizado, deliberado), la landing 8px y solo la credencial cumple el canon. Cuatro de cinco superficies contradicen el comentario del token. O el canon es pill y `LnButton` migra, o el canon real es "rect chico por piel" y el comentario del token debe reescribirse — hoy cualquier dev nuevo lee una regla y ve otra.
- 🟡 PUNTUAL (X2-P2) — **"Buscar" en /perdidas es triple infractor**: raw `<button>` (la fence `lint:buttons` solo cubre gob/admin/org, así que es legal), radio 4px propio, y usa `--color-ln-err` — el token de ESTADO "perdida" — como fill de una acción que ni siquiera es peligrosa (buscar). El sistema reserva `seal` (#a23a2c) para CTAs de peligro (`Button.tsx:72`); err-como-CTA rompe la semántica de los tres rojos (ver Paleta). Visible en finder/desk-perdidas.png junto a chips y pennants que sí usan err correctamente como estado.
- 🟡 PUNTUAL — **Inversión de densidad tipográfica**: el botón md del dueño (12.5px) es más chico que el del operador (14px), al revés que todo el resto del sistema (dueño espacioso, gob denso). `Button.tsx:64` vs `OpButton.tsx:55`. Además ambos docstrings dicen "Safe in components/ui/ (excluded from lint:tokens)" — **stale**: la exclusión se eliminó (Wave-3 §6.5, `check-design-tokens.ts:41-43`); hoy sobreviven por baseline, no por exención.
- 🟢 Lo bueno: dentro de cada familia la disciplina es real — variantes tipadas (patrón CVA casero, REGISTRY.md:179-227), pressed feedback `active:scale-[0.98]` espejado en ambas pieles, focus ring tokenizado, decisión verde-solo-confirmación documentada en `OpButton.tsx:21-24`.

---

## Densidad e iconografía

- 🟢 **Densidad: gob más denso A PROPÓSITO — verificado, no accidente.** Está escrito ("Denser, cooler operator chrome", REGISTRY.md:16) y ejecutado con coherencia: h1 22px vs 34px, labels 9-12px mono, tiles compactos con sparklines, tabla outbox con filas ~40px, sidebar con grupos mono-uppercase. La credencial y la landing respiran (padding generoso, min-h 44px en CTAs táctiles). Las dos excepciones que sí parecen accidente: la inversión de texto de botón (arriba) y los KPI de `/perdidas` (finder/desk-perdidas: "ACTIVAS AHORA / NUEVAS EN 24H" mono-uppercase con números gigantes) que replican el dialecto denso del operador en una página para vecinos apurados.
- 🟢 **Iconografía: UNA familia, resuelta.** Todo es lucide-react vía `ICON_MAP` curado (`components/Icon.tsx`) — la webfont icono-arg muerta se eliminó (`globals.css:14-21`), no hay imports directos permitidos ("Don't `import { Foo } from lucide-react`", REGISTRY.md:174), tamaños tokenizados sm 16 / md 20 / lg 24, `currentColor`. En las 14 capturas no aparece ningún icono fuera de familia; la alineación con texto se maneja con `size="0.9em"` en badges (`Badge.tsx:64`) y `gap` fijos. Único apunte 🟢: los "iconos" de marca (crest "m" serif del credencial, letra-inicial sobre trama) son ilustración de marca, no UI icons — correcto que no estén en ICON_MAP.
- 🟢 PUNTUAL — Trama "sin foto": el mismo motivo (rayas 135°) está hardcodeado dos veces con hex casi iguales — `#e7e2d6/#f2efe6` (`Chip.tsx:160`) vs `#e7e2d6/#f1eee5` (`p/[publicToken]/page.tsx:661`) — un candidato perfecto a token `--pattern-no-photo` que además ilustra qué clase de deuda esconde el baseline (ver Paleta).

---

## Empty states

| Vacío (captura) | Anatomía | Voz |
|---|---|---|
| "No tenés mascotas registradas." + "Cargá una mascota…" + CTA (alta/desk-vacio) | LnEmptyState dashed: título bold + descripción + acción | Voseo directo, 2ª persona |
| "Sin casos abiertos. Cualquier denuncia… va a aparecer acá." (alta/desk-vacio, widget Bandeja) | Caja dashed con UNA línea muted — sin título, sin icono, sin CTA | Impersonal + voseo mezclados en la misma frase |
| Tiles /gob con `0`, `—`, "Sin entregas en el período", "NO VARÍA CON EL PERÍODO" (govt-vigilancia) | Vacío embebido en KPI, distingue 0 real de sin-dato | Impersonal "Sin X" |
| Outbox admin "Sin intentos" por celda (admin-outbox) | Cero explícito en celda | Impersonal |

- 🟢 **SISTÉMICO (X2-S7) — Dos voces por diseño, con contrabando en ambas direcciones.** El operador es casi uniforme: 40+ empty states "Sin …" en /gob (`title="Sin "` en analytics, adopciones, vigilancia, outbox, etc.) con **un** slip de voseo ciudadano: `app/gob/casos/CasosScreen.tsx:256` `title="No tenés…"`. El ciudadano mezcla cuatro aperturas — "No tenés" (mis-mascotas, cuenta), "Todavía no" (postulaciones, libreta), "Aún" (denuncias/mias), "Sin" (devolución, MarkLostWizard) — sin regla. La anatomía sí está unificada donde se usa el primitivo (`LnEmptyState`, ~90 call sites, con el sistema epistemic `measured-zero`/`no-signal` — excelente); el widget "Casos abiertos" muestra la variante degradada sin título que convive con la completa en la misma pantalla.
- 🟢 PUNTUAL (X2-P7) — En alta/desk-vacio conviven **dos verbos para la misma acción**: "+ Inscribir mascota" (header) y "Cargar una mascota" (empty state), a 300px de distancia. Uno de los dos miente sobre el modelo mental (¿inscribir en un registro o cargar un archivo?).

---

## Paleta funcional

- 🟢 **El azul institucional es UNO**: `#0e5a99` exacto en ambas pieles (`--color-ln-azul` / `--color-ln-op-azul`), links, primarios, focus ring (`--color-ring`). Poncho de verdad.
- 🟢 **Los verdes/ámbares divergen POR calibración, no por descuido**: cada piel tiene su valor con ratio WCAG documentado en el propio token (p.ej. `ln-op-faint` "darkened … 4.53:1 on the #eef1f4 canvas", `globals.css:255`; la decisión violeta-dual está razonada en `:293-298`). La capa de indirección `st-*` (`:283-349`) remapea ok/warn/err/info por superficie con cero forks — arquitectura de paleta funcional ejemplar.
- 🟡 **SISTÉMICO (X2-S5) — Tres gramáticas de acento para "atención"**: alertas priorizadas /gob = **borde superior ámbar** (govt-home), banner SLA /admin = **borde izquierdo rojo** (admin-outbox), zona de riesgo dueño = **borde completo + fondo rojo** (desk-cuenta), fila perdida de la lista = **borde izquierdo rojo fino** (desk-lista). Cada portal es internamente consistente, pero el operador que también es dueño aprende tres códigos para el mismo mensaje ("esto pide tu atención"). Falta una regla declarada (p.ej. top=aviso de dato, left=item en falta, full=zona destructiva) o unificación.
- 🟡 **Tres rojos con roles distintos, bien pensados y mal defendidos**: `ln-err #c0392b` (estado perdida/error), `ln-seal #a23a2c` (CTA peligrosa + sello de marca), `ln-op-danger #b71c1c` (operador). El sistema aguanta hasta que `/perdidas` usa err como CTA (X2-P2) y hasta que los números de KPI del mismo catálogo tiñen "28" de err y "0" de ámbar sin semántica clara (¿28 es malo? ¿0 es advertencia?) — finder/desk-perdidas.png.
- 🟡 **SISTÉMICO (X2-S6) — Lo que `lint:tokens` no ve, cuantificado**: el guard es fuerte (paleta cruda, `dark:`, hex, px arbitrarios — reglas 1-8) pero las reglas 4-8 son ratchet con **1.980 violaciones grandfathered en 373 archivos** (`design-tokens-baseline.json`, _meta 2026-07-05). Ahí viven exactamente las inconsistencias de este doc: los 10 h1 serif (X2-S3), el `rounded-[3px]`/`text-[12.5px]` de LnButton (X2-S2), los 35 valores del propio `/p` y 26 de `/cuenta`, las dos tramas gemelas, y `--lp-seal-bg: #fbf1e6` "no ln-* token yet" (`globals.css:616`). Nada de esto es *nuevo* hardcode — es deriva congelada que el lint, por diseño, ya no señala.
- 🟢 PUNTUAL — `--color-warning: #e0a93e` (ámbar genérico, `:105`) no coincide con ningún `ln-warn`/`ln-op-warn` (#96600e): candidato a huérfano o a documentar su rol (¿solo superficies?).

---

## Lo que funciona bien (no tocar)

1. **La arquitectura de dos pieles + `st-*`** — nombres unificados, valores calibrados por superficie, `.op-surface` remapea sin forks de componente. Es la razón por la que el lado operador se ve disciplinado en las 4 capturas gob/admin.
2. **REGISTRY.md como contrato** — inventario completo, anti-patrones explícitos, patrón CVA casero exigido, y tres fences reales (`lint:tokens`, `lint:buttons`, `lint:ui`) que mantienen la dirección correcta.
3. **Honestidad de datos como lenguaje visual transversal** — `—` ≠ `0`, "Sin intentos", "NO VARÍA CON EL PERÍODO", `k<5 protegido`, "Datos de demostración" no descartable, `LnVstamp` "SIN DATO" que nunca lee como vigente, `nature="no-signal"`. Es la identidad más distintiva del producto y aparece igual en gob, admin y panorama.
4. **El motivo documento** (guilloché, MRZ mono, sello, QR, banda de estado que tiñe el canto de la credencial) — repetido con fidelidad en landing-mock, `/p` y carnet; hasta los dots del carrusel del hero heredan el color del estado (mob-home vs desk-home).
5. **Iconografía de familia única** con registry curado y tamaños tokenizados.
6. **Contraste auditado token por token** — los comentarios con ratios en `globals.css` son rastro de un proceso real (docs/a11y/contrast-audit.md).
7. **Formatos es-AR consistentes en el operador** — coma decimal ("69,0%"), fechas d/m/aa, tabular-mono para IDs/tokens.

---

## 3 Prioridades

1. 🔴 **Un solo género de estado por mascota, en todos los portales.** `LnStatusFlag` deja de hardcodear labels y recibe `sex` para resolver vía los helpers compartidos que ya existen (`lostLabel`/`situationLabelForSex`, con forma "/a" para sexo desconocido, mismo criterio que el pennant de `/perdidas`). **Fix**: `components/ui/StatusFlag.tsx:16-57` (mapa → función `(status, sex)`), call sites en `RegRow.tsx`/lista de mis-mascotas; agregar el test espejo de `PosterPreview.test.tsx:45-59`. Evidencia: libreta/desk-lista.png (Luna hembra "PERDIDO") vs credencial/mob-lost-open.png ("PERDIDA").
2. 🔴 **Resolver la contradicción radio-de-botón: un canon por piel, escrito y aplicado.** Decisión propuesta: ciudadano = pill (lo que ya declara `globals.css:119-126` y ya cumple la credencial), operador = 6px (queda como está). **Fix**: (a) `components/ui/Button.tsx:55` `rounded-[3px]` → `rounded-[var(--radius-pill)]` (o re-escribir el comentario del token si el PO prefiere el rect); (b) matar el raw "Buscar" — `app/(public)/perdidas/LostFiltersBar.tsx:178-183` → `LnButton variant="primary"` (azul: buscar no es peligroso; err queda para estados); (c) subir texto md 12.5px → `--text-md` 14px para des-invertir la densidad; (d) actualizar los docstrings stale "excluded from lint:tokens" en `Button.tsx:28` y `OpButton.tsx:26`.
3. 🟡 **Tokenizar la escala display serif ciudadana (3 pasos) y achicar el baseline.** Agregar a `@theme`: `--text-display-sm: 27px` (nombre de credencial/subpáginas), `--text-display-md: 34px` (h1 de hub), `--text-display-lg: 42px` (héroes públicos) + un `LnPageTitle` o clase compartida (serif 600, tracking −0.02em) espejo de `ScreenHeader`. Codemod sobre los ~10 valores en `app/(app)/**` y `app/(public)/**` (los archivos ya están enumerados en `design-tokens-baseline.json` — cada migración baja su contador, el ratchet hace el resto). Colar en la misma pasada: trama sin-foto → token único (`Chip.tsx:160` vs `p/[publicToken]/page.tsx:661`).

**Backlog menor** (no prioridad, queda anotado): colisión de chips del header `/p` a 390px (credencial/mob-lost-open.png; `page.tsx:597-637`), labels mixtos en el paso 1 del wizard (mono-uppercase de `LnField` vs sentence del picker de jurisdicción — alta/desk-wizard-1.png; `MinimalNewPetForm.tsx` + `Field.tsx:112-115`), pill "EN TRATAMIENTO" sobre la action bar del carnet, "No tenés" en `gob/casos/CasosScreen.tsx:256`, verbos duplicados inscribir/cargar, eyebrow "GOBIERNO · GOBIERNO", chip GOB sólido vs SUPERADMIN outline, borrar el bloque muerto `[data-theme="situation-room"]` (`globals.css:368-426`).

---

*Conteo: 14 hallazgos — 2 🔴 (sistémicos), 7 🟡 (4 sistémicos, 3 puntuales), 5 🟢. Sistémicos X2-S1…S7, puntuales X2-P1…P7. Nada de lo marcado `[ENTORNO]` se convirtió en hallazgo.*
