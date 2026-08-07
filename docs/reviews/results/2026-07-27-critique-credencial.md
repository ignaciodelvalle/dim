# Crítica de diseño: Credencial pública /p/&lt;token&gt; (C2)

> **Plan**: `docs/reviews/2026-07-26-plan-criticas-diseno.md` §4 · ficha C2
> **Persona**: quien encontró al perro y escaneó el QR de la chapita. Un solo objetivo: "¿y ahora qué hago?"
> **Evidencia**: `docs/reviews/results/2026-07-27-critique-screenshots/credencial/` — 9 capturas (3 estados × mobile viewport/full + desktop) + `mob-console.json` / `desk-console.json`.
> **Código anclado**: `app/(public)/p/[publicToken]/page.tsx`, `components/pet-profile/PublicLostSections.tsx`, `app/(public)/p/[publicToken]/CredentialActionBar.tsx`, `components/LocationMap.tsx`, `app/(public)/p/[publicToken]/FoundPetForm.tsx`, `app/globals.css` (bloque `pc-*`), `lib/utils/format.ts`.
>
> **Evidencia faltante (declarada)**: el bundle no incluye el sub-estado perdida **con teléfono/nombre divulgados** — en ambas capturas "lost" aparece la nota "Por privacidad no mostramos el teléfono…", que solo se renderiza cuando el teléfono NO está divulgado (`PublicLostSections.tsx:202`). Los CTAs "Llamar" (verde, banner + sticky) se analizan acá **solo desde código**, sin verificación visual. Tampoco hay full-page de desktop (los `desk-*` cortan en el fold). Estados degradado / throttle / disputa / tier-2 / fallecida: fuera del alcance C2, no capturados.
>
> `[ENTORNO]` no criticable: datos sintéticos (raza/sexo/color vacíos de los PANO-, "Lanús … · Olivos" geográficamente incoherente), la foto 404 del seed y los tiles OSM bloqueados por el proxy **como disparadores** — lo que sí se critica es cómo responde el producto cuando eso pasa, porque le va a pasar en la calle.

---

### Impresión general

La arquitectura de la respuesta a "¿qué hago ahora?" está **bien resuelta en los estados perdida**: strip rojo + chip PERDIDA, banner "SE PERDIÓ" con dos CTAs de 44px en zona de pulgar, y una barra sticky que repite el verbo principal ("Está conmigo") siempre visible (`mob-lost-open.png`, `mob-lost-closed.png`). Con el perro al lado, la pregunta rectora tiene UNA respuesta dominante en pantalla. La decisión de relevar el teléfono ("completá uno de estos avisos y le llega al instante") en vez de mostrarlo es honesta y está bien explicada.

Pero la ejecución tiene dos manchas serias en el viewport primario: **el header del carnet colapsa a 390px en estado perdida** — los chips se pintan encima de "miMAR · CREDENCIAL PÚBLICA", el ancla de confianza institucional queda ilegible en las 4 capturas mobile perdida — y **el estado normal capturado muestra la credencial con la foto rota** (ícono de imagen quebrada + un vacío blanco de ~350px donde debería estar la cara del producto). "La mascota es la credencial", y en `mob-normal.png` la credencial no tiene mascota: el fallback de monograma existe pero solo cubre foto-null, no foto-que-falla.

El estado fail-closed (migración 0158) **no parece roto**: es la sorpresa positiva de la tanda. La página cerrada sigue siendo 100% accionable.

---

### Los tres estados como sistema (comparación directa)

| | Normal (`mob-normal.png`) | Perdida abierta (`mob-lost-open*.png`) | Perdida fail-closed (`mob-lost-closed*.png`) |
|---|---|---|---|
| Impresión 2s | Documento sobrio, celeste institucional | Alarma clara: strip rojo, chip PERDIDA, banner | Idéntica a la abierta |
| Acción dominante | Fila colapsada "¿Encontraste a esta mascota?" al pie (quieta, a propósito — PO 2026-07-24 anti-falsos-reportes) | "Está conmigo" ×2 (banner + sticky) | "Está conmigo" ×2 — **intacta** |
| PII visible | Ninguna | Última ubicación (texto + mapa). Teléfono/nombre del dueño: no visibles en la captura | Ninguna del dueño; nombre de la mascota sí (los toggles apagan datos del **dueño**, no de la mascota — correcto) |
| ¿Se entiende lo que falta? | n/a | — | **Sí, por omisión silenciosa**: la sección "Última vez visto/a" desaparece entera (`PublicLostSections.tsx:279` la renderiza solo con datos divulgables); no hay hueco, ni candado, ni "información oculta" que genere frustración |

**Veredicto del sistema**: fail-closed ≠ página vacía. La diferencia abierta/cerrada es exactamente una sección (última ubicación) y el finder cerrado nunca sabe que le falta algo — que es el comportamiento correcto para privacidad: no se puede extrañar lo que no se anunció. La nota de privacidad del teléfono además está escrita para no filtrar si el teléfono *existe* (`PublicLostSections.tsx:194-201`, comentario explícito). El costo del sistema: como el estado "abierto" capturado tampoco muestra teléfono ni nombre, **los tres estados se ven casi iguales del cuello para arriba**, y toda la diferencia de disclosure descansa en código no verificado visualmente (ver evidencia faltante).

Los JSON de consola muestran las dos costuras del sistema: `Failed to load resource: 404` (la foto del estado normal) y 8 `AJAXError` de tiles OSM (`mob-console.json:3-12`) — dos modos de fallo reales de calle (storage caído, señal pobre) para los que hoy no hay degradación diseñada (ver 🔴-2 y 🟡-6).

---

### Usabilidad (tabla)

| # | Tarea del finder | Estado | Veredicto | Evidencia + archivo |
|---|---|---|---|---|
| U1 | Entender "qué es esto" en 2s | Todos | ✅ Carnet institucional legible como documento; en perdida el rojo manda | `mob-normal.png`, `mob-lost-open.png` |
| U2 | "Tengo al perro conmigo" → avisar | Perdida | ✅ Botón primario azul en banner + sticky siempre visible, 44px, safe-area iOS | `mob-lost-open.png`; `CredentialActionBar.tsx:83-97`; `page.tsx:485` (pb-28 evita que la sticky tape el pie) |
| U3 | "Solo lo vi, no lo agarré" | Perdida | 🟡 El CTA secundario "Vi a la mascota cerca de acá" existe en el banner, pero la sticky solo lleva el primario: quien scrolleó hasta el mapa tiene que volver a subir | `mob-lost-open.png`; `CredentialActionBar.tsx:89-107` |
| U4 | Llamar al dueño | Perdida + phone divulgado | ⚠️ **Sin captura.** Por código: CTA verde "Llamar{ a Nombre}" en banner + "Llamar" secundario en sticky | `PublicLostSections.tsx:154-162`; `page.tsx:456-459` |
| U5 | Avisar sin registrarse ni instalar nada | Todos | ✅ Form inline con nombre/contacto/mensaje **opcionales** (reporte anónimo permitido) | `FoundPetForm.tsx:34-73` |
| U6 | Ver dónde se perdió | Perdida abierta | 🟡 Texto + mapa + "Abrir en Google Maps ↗" — pero con tiles caídos queda un pin flotando en un lienzo blanco sin mensaje (trigger `[ENTORNO]`, fallback ausente es producto) | `mob-lost-open-full.png`; `LocationMap.tsx:28-62` |
| U7 | Leer/dictar el token (vete, línea municipal) | Todos | ✅ En grilla "LIBRETA" a 14px mono; el del pie queda chico (9.5px) pero es redundante | `mob-normal.png`; `page.tsx:810,899-903` |
| U8 | Expandir "¿Encontraste a esta mascota?" | Normal | 🟢 El chevrón "›" apunta a la derecha como un link de navegación; es un `<details>` que expande inline — affordance ambigua | `mob-normal.png`; `page.tsx:874-890` |
| U9 | Compartir la perdida en el grupo del barrio | Perdida | 🟢 El share vive solo en metadata OG (excelente para WhatsApp) — no hay botón "Compartir" en la página para el vecino que quiere reenviar | `page.tsx:96-166` |

---

### Jerarquía visual

1. **Perdida: la pirámide es correcta** — alarma (strip + chip) → identidad (foto/monograma + nombre) → acción (CTAs) → contexto (ubicación) → datos fríos (grilla) → pie. El orden de sensibilidad de PII coincide con la jerarquía: lo más sensible (teléfono) nunca aparece como texto plano, solo como CTA de acción (`tel:`) cuando está divulgado — buena decisión: prominente para actuar, ausente para cosechar.

2. 🔴 **La cima de la pirámide colapsa a 390px** — en las 4 capturas mobile perdida, el chip "NIVEL 0 · IDENTIDAD" se pinta ENCIMA de "miMAR / CREDENCIAL PÚBLICA" y recorta "miMAR" (`mob-lost-open.png`, `mob-lost-closed.png`, y ambas `-full`). Causa: en `page.tsx:597-612` el bloque de marca es `min-w-0 flex-1` sin truncamiento; los chips no pueden encogerse (min-width auto), el `flex-wrap` nunca se dispara porque la marca puede colapsar a 0, y su texto desborda por debajo de los chips, que tienen fondo opaco y se dibujan después. En desktop no pasa (`desk-lost-open.png`: todo entra en una línea).

3. 🔴 **En normal, el elemento dominante es un rectángulo blanco roto** — `mob-normal.png` / `desk-normal.png`: ícono de imagen quebrada arriba a la izquierda + área 4:3 vacía. `page.tsx:647-668` solo tiene fallback (monograma sobre rayado) para `photoUrl === null`; si la URL existe y el objeto no (404 en `mob-console.json:3` — trigger `[ENTORNO]`, seed sin storage), `next/image` muestra el broken-image nativo. En producción esto ocurre con un objeto borrado, bucket mal migrado o red intermitente: la credencial pierde la cara justo donde "la mascota es la credencial".

4. 🟡 **"NIVEL 0 · IDENTIDAD" compite sin aportar** — jerga interna de tiers de privacidad con peso visual de chip, al lado del chip PERDIDA en el momento de máxima urgencia (`mob-lost-open.png`). Para el finder es ruido criptográfico; además es el chip que provoca la colisión del punto 2. En perdida debería ceder (esconderse o bajar de fila); en normal, decir algo humano ("Solo identidad" / tooltip). `page.tsx:614-618`.

5. 🟢 **La sticky duplica un botón ya visible** — en `mob-lost-open.png` hay dos "Está conmigo" idénticos en el mismo viewport (banner y sticky). El patrón sticky es correcto; el costo es preguntarse si son dos cosas distintas. Aceptable, pero ver U3: esa ranura sticky podría alojar al secundario cuando el primario está en pantalla.

---

### Consistencia

| # | Sev | Hallazgo | Evidencia + archivo |
|---|---|---|---|
| C-1 | 🟡 | **Dos flujos de "encontré" distintos en la misma página perdida**: el banner/sticky llevan al wizard `/p/<token>/encontre` (con foto, EXIF, ubicación), pero al pie sobrevive la fila colapsable del estado normal con `FoundPetForm` inline (3 campos). Mismo verbo, dos profundidades: el finder que scrollea usa el form débil y el dueño recibe menos señal | `mob-lost-open-full.png`, `mob-lost-closed-full.png` (fila "¿Encontraste a esta mascota?" al pie); `page.tsx:869-896` (el bloque no está condicionado por `isLost`) |
| C-2 | 🟡 | **El mini-mapa está recortado y con marco doble**: el wrapper lo limita a `h-40` (160px) con `overflow-hidden`, pero `LocationMap` mide `h-64` (256px) — se pierden 96px de abajo, incluida la **atribución © OpenStreetMap que la licencia ODbL exige visible**; además borde+radio del wrapper y del mapa se superponen | `mob-lost-open-full.png` (pin sobre lienzo sin créditos); `PublicLostSections.tsx:290-292` vs `LocationMap.tsx:64-70` |
| C-3 | 🟢 | El form inline usa tokens **warn** (labels ámbar, bordes ámbar en reposo) mientras el banner perdida usa **err** y los CTAs **azul/ok**: tres familias de acento en un carnet; campos ámbar en reposo se leen como campos con error | `FoundPetForm.tsx:26-27,38,53` |
| C-4 | 🟢 | "Vacunación: **Con registros**" vs "Antirrábica: **Con registro**" — semánticamente defendible (histórico vs dosis única) pero a un vistazo parece typo; y "Perro · **No especificado**" imprime el sexo desconocido como si faltara la raza (dato sparse `[ENTORNO]`, decisión de render criticable: sexo desconocido debería omitirse de la línea) | `mob-normal.png`, `mob-lost-open.png`; `page.tsx:417-419,784`; `lib/utils/format.ts:339-350` |
| C-5 | 🟢 | El esqueleto de carga no tiene la anatomía de la página: avatar circular 112px centrado + dos cards genéricas vs. carnet con foto 4:3 full-width y nombre a la izquierda → salto de layout perceptible en el path más caliente del producto | `loading.tsx:22-32` vs `page.tsx:647-689` |

Lo consistente que vale destacar: la sticky y el banner usan **la misma función de copy** (`foundPossessivePhrase` / `sightingPhrase`, `page.tsx:453-455`) así que nunca disienten; y el sistema de género es-AR (Lo/La tengo conmigo, "Está conmigo" neutro para sexo desconocido, `format.ts:502-528`) está bien diseñado — las capturas muestran el fallback neutro correcto para los PANO- sin sexo.

---

### Accesibilidad

| # | Sev | Hallazgo | Evidencia + archivo |
|---|---|---|---|
| A-1 | 🔴* | La colisión de chips (Jerarquía #2) es también un problema de a11y: texto institucional ilegible por superposición a 390px. (*mismo hallazgo, no se cuenta dos veces) | `mob-lost-closed.png`; `page.tsx:597-612` |
| A-2 | 🟡 | **Micro-tipografía bajo el sol**: "CREDENCIAL PÚBLICA" a **8px** (`page.tsx:609`), chips a 9px (`page.tsx:615`, `globals.css:3191`), labels de grilla a 9px (`page.tsx:1246`), pie con token a 9.5px (`page.tsx:899`). Los tokens de color ya fueron corregidos a AA (`globals.css:50-51`: ln-mute 5.02:1, ln-faint 4.60:1 — bien documentado) pero 4.6:1 **a 8-9px uppercase con tracking .14em** en un teléfono a pleno rayo del sol es ilegible en la práctica. Piso razonable: 10px | `mob-normal.png` pie y header |
| A-3 | 🟡 | **El nombre del dueño divulgado no tiene camino de render sin teléfono**: `ownerFirstName` solo se muestra dentro del botón "Llamar a {Nombre}" (`PublicLostSections.tsx:154-161`). Si el dueño divulga nombre pero no teléfono (combinación legítima de la migración 0158), el nombre se busca en DB y no se muestra nunca — el doc del propio componente promete "2) The owner is real. (first name if disclosed)" y la implementación no lo cumple. Señal de confianza perdida + toggle que miente | Sin captura posible (falta el sub-estado); código |
| A-4 | 🟢 | El mapa expone `aria-label` sobre un `<div>` sin `role`, con lat/lng crudas ("Mapa con marcador en latitud -34.7…") — sin rol es probable que no se anuncie; con rol, dictar 6 decimales no ayuda | `LocationMap.tsx:64-69` |
| A-5 | ✅ | Lo que está bien: `role="alert"` solo en el chip perdida sin doble anuncio del strip (documentado, `page.tsx:620-627` + `PublicLostSections.tsx:131-133`); punto de estado `aria-hidden` con el estado siempre en texto (chip + grilla); `h1` real con el nombre; targets ≥44px (`min-h-11`); `<details>` nativos operables por teclado; safe-area para el home indicator; navegación dura `<a>` en el path de crisis (anti-stall documentado, `PublicLostSections.tsx:171-175`) | `page.tsx:674-684`; `CredentialActionBar.tsx:83-87` |

---

### Lo que funciona bien

1. **El fail-closed es una página útil, no una página rota** — la comparación directa closed/open (`mob-lost-closed.png` vs `mob-lost-open.png`) muestra CTAs idénticos y omisión silenciosa de lo no divulgado. Es el mejor resultado posible para la migración 0158 desde el lado del finder.
2. **La respuesta dominante existe**: sticky bar de un solo verbo, pre-resuelta server-side por estado (perdida/disputa/tier-2/nada), con la decisión explícita de NO poner sticky en normal para no invitar falsos reportes (`CredentialActionBar.tsx:20-23`). Madurez de producto rara.
3. **Privacidad estructural, no cosmética**: lo no divulgado no se fetchea (proyección SQL NULL, `page.tsx:1063-1104`), el cliente nunca decide PII, la nota del teléfono no filtra existencia, y `no-store` garantiza que un reencuentro no siga mostrando "SE BUSCA" cacheado (`page.tsx:87-94`).
4. **El sistema de resiliencia está diseñado**: throttle suave, degraded card con CTAs vivos, presupuestos de DB por lectura (`page.tsx:180-187`) — aunque esta crítica no pudo verlos renderizados, la arquitectura del "nunca 500 en la vereda" es la correcta.
5. **Copy es-AR con género resuelto** y fallbacks neutros reales ("Está conmigo", "Vi a la mascota cerca de acá") — visible funcionando en las capturas con sexo desconocido.

---

### 3 Prioridades con fix + archivo

**P1 🔴 — Reparar el header del carnet a 390px (estado perdida).**
La marca institucional ilegible en el viewport primario del estado más urgente, en 4 de 6 capturas mobile. Fix en `app/(public)/p/[publicToken]/page.tsx:605`: darle al bloque de marca un mínimo real (`min-w-[132px]` en vez de solo `min-w-0`) para que el `flex-wrap` existente mande los chips a una segunda fila; alternativa equivalente: envolver los dos chips en un contenedor `ml-auto flex flex-wrap justify-end gap-2` con `basis-full` en `<sm` cuando `publicSituation` existe. Criterio de aceptación: a 390px con chip de situación presente, "miMAR / CREDENCIAL PÚBLICA" legible completo y chips debajo, sin superposición (regresión visual sobre `mob-lost-closed.png`).

**P2 🔴 — Fallback de foto ante error de carga, no solo ante null.**
Hoy la credencial normal con storage caído muestra el broken-image nativo + 350px de vacío (`mob-normal.png`, 404 en `mob-console.json` — trigger `[ENTORNO]`, modo de fallo real). Fix: extraer el bloque de `page.tsx:647-668` a un client component `CredentialPhoto` que envuelva `next/image` con `onError` → mismo monograma rayado que ya existe para `photoUrl === null` (el placeholder ya está diseñado y probado en `mob-lost-open.png`; solo falta engancharlo al segundo modo de fallo). Bonus del mismo patrón para `tattooPhotoUrl` en `PublicLostSections.tsx:326-342`.

**P3 🟡 — Cumplir el toggle de nombre del dueño sin depender del teléfono.**
`disclose_first_name_when_lost` activado sin teléfono = nombre fetcheado y jamás renderizado (`components/pet-profile/PublicLostSections.tsx:154-161`). Fix: cuando `ownerFirstName && !ownerPhoneE164`, incorporar el nombre a la línea humana del banner — p. ej. la nota de privacidad pasa a "Por privacidad no mostramos el teléfono de **{Nombre}**: completá uno de estos avisos y le llega al instante" — o una línea "Su familia ({Nombre}) ya está avisada de los reportes". Refuerza la señal "el dueño es real" que el propio componente declara como objetivo #2, y hace que el panel de disclosure del dueño no mienta. Agregar el sub-estado a la matriz de capturas de la próxima tanda (evidencia hoy inexistente).

*(Siguientes en cola: C-1 unificar los dos flujos de "encontré" en la página perdida — condicionar el bloque de `page.tsx:869-896` a `!isLost` o apuntarlo a `/encontre`; C-2 destapar la atribución OSM igualando alturas del mapa.)*

---

**Resumen**: La credencial pública responde bien la pregunta rectora — en perdida hay UNA acción dominante y el fail-closed de la migración 0158 degrada con elegancia (misma página accionable, omisión silenciosa de lo no divulgado). Las dos fallas serias son de ejecución, no de arquitectura: el header del carnet colapsa a 390px en estado perdida (chips sobre la marca) y la foto sin fallback de error deja la credencial "sin cara" en su estado más común. Tercer frente: el toggle de nombre del dueño no tiene camino de render sin teléfono, y falta la captura del estado con teléfono divulgado para cerrar el circuito de evidencia.

**Conteo por severidad**: 🔴 2 (colisión de chips, fallback de foto) · 🟡 7 (U3 sticky sin secundario, U6 tiles sin fallback, jerarquía #4 chip NIVEL 0, A-2 micro-tipografía, A-3 nombre del dueño, C-1 flujos duplicados, C-2 mapa recortado/atribución) · 🟢 7 (U8, U9, jerarquía #5, C-3, C-4, C-5, A-4) — 16 hallazgos, todos con captura y/o archivo:línea.
