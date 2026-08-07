# MiMAR — Review de QA cowork + Design critique + "bajo el capó"
**Fecha:** 2026-07-11 (ART) · **Ejecutado por:** Claude (Cowork) · **Local:** `http://localhost:3000` (Next dev)
**Método (en paralelo, como pediste):**
- **QA de browser** sobre tu local con Claude in Chrome (recorrida real por UI, sin atajos de API).
- **Review de código** con 4 agentes en paralelo leyendo el repo (`ignaciodelvalle/dim`): seguridad/authz, arquitectura/datos, corrección+mapa, y un cuarto de *re-verificación* contra la rama que realmente corre.

> **Sobre Playwright:** tenés `playwright.local3000.config.ts`, `e2e/` y `@playwright/test` + `@axe-core/playwright` en el repo. Para *esta* sesión usé **Claude in Chrome** (maneja tu Chrome real contra el local), que es el equivalente operativo. Tu suite Playwright sigue siendo el lugar correcto para automatizar esto de forma repetible (ver §6).

---

## 0. TL;DR honesto

MiMAR es **excepcional para un proyecto de facultad** — y en varias partes está por encima de producto real temprano. El **mapa/panorama de Gobierno es la joya**: coropletas MapLibre, capas componibles, mapa bivariado de riesgo, **k-anonimato server-side de verdad**, **bitemporalidad real** (valid-time vs transaction-time) y KPIs con doble denominador. El backend tiene un **ledger append-only con triggers de base**, motor de *replay* determinístico, RLS deny-all y ~18 linters de invariantes propios. No es humo: lo verifiqué en el código y en vivo.

Lo que lo frena hoy son **tres cosas concretas**: (1) un puñado de **bugs funcionales reales** (signup en loop, una rama de transferencia por disputa, denuncias sin localidad que no llegan al gobierno), (2) **un IDOR de seguridad** (fuga de adjuntos clínicos entre inquilinos) que se arregla en una línea, y (3) **fricciones de proceso y consistencia** — arrancando por un **desfasaje de versión** que hace que "revisar el código" signifique cosas distintas según qué rama mires.

**¿Sirve para un piloto de un distrito?** Sí, después de tapar el IDOR y decidir qué hacer con el signup y la visibilidad de denuncias. La base es sólida; lo que falta es cierre y prolijidad, no re-arquitectura.

---

## 1. El hallazgo estructural #1: desfasaje de versión (proceso) 🔴

Esto condiciona todo lo demás, así que va primero.

- Tu **local `:3000`** corre la rama **`integration/all-20260703`**, que está **1.414 commits ADELANTE de `origin/main`** (+ 12 archivos de panorama sin commitear).
- Un `git clone` normal cae en `main` → cualquiera (incluido yo, en la primera pasada) revisa una foto **vieja** del sistema.
- Efecto práctico: mi primer trío de agentes reportó "no existe k-anon / scrubber bitemporal / capa de mordeduras / los 20 `check-*`" — **todo eso SÍ existe** en lo que corrés; era artefacto de mirar `main`. Tuve que re-clonar la rama real para reconciliar (§5).

**Por qué importa más de lo que parece:** tus reportes de QA cowork previos corrieron contra *staging* (deploy de la working copy), y el code review "oficial" caería en `main`. Son **tres refs distintas** (local ≠ staging ≠ main). Si no fijás el SHA, "está fixeado" y "no existe" pueden ser ambos ciertos… de ramas distintas.

**Qué haría:**
1. Mergear/rebasear `integration/all-20260703` a `main` (o promover esa rama a la de trabajo) — no dejar `main` 1.4k commits atrás.
2. **Fijar el SHA/branch en cada reporte de QA** (una línea al tope: `commit abc1234 · branch · staging URL`). Barato, elimina toda esta clase de confusión.

---

## 2. Design critique (framework de 5 dimensiones)

Cubrí en vivo: landing, público (`/perdidas`, `/adoptar`, `/p/…`, `/denuncias`), y a fondo las consolas de **Gobierno** y **Admin** + el mapa. Dueño/Vet/Refugio los cubrí por código + reportes previos (no click-through esta sesión — ver §7).

### First impression (2s)
- **Landing:** el ojo va al serif editorial ("Toda una vida, en una sola miMAR") y después a la credencial estilo pasaporte con MRZ + QR. Propósito claro, credibilidad institucional ("REPÚBLICA ARGENTINA · MINISTERIO DE SALUD"). Muy buen tono.
- **Consola gob:** sensación de "situation room" profesional. El "CENTRO DE SITUACIÓN NACIONAL" con el mapa oscuro comunica seriedad al instante.

### Usability
| Hallazgo | Sev | Recomendación |
|---|---|---|
| **Dos headers globales distintos** — la landing usa nav claro ("La historia/Qué hace/Empezar/Ingresar", logo cuadrado); las páginas públicas de app usan barra navy Poncho ("Adoptar/Mascotas perdidas/Refugios/Denuncias", logo circular, "Iniciar sesión") | 🟡 | Unificar a un solo sistema de header + un solo rótulo de login ("Ingresar" vs "Iniciar sesión"). |
| **El toggle bitemporal está escondido** — "Cuándo ocurrió / Según lo conocido al momento" solo aparece al entrar en "Detalle" del scrubber. Es tu feature más sofisticado y casi nadie lo va a descubrir | 🟡 | Subir su visibilidad o un tooltip/onboarding de una vez; es demasiado bueno para esconderlo. **[POCO INTUITIVO]** |
| **Vista inicial del mapa rara** — el operador seed está scopeado a 3 localidades lejanísimas (Tierra del Fuego, Santa Cruz, CABA), así que el mapa abre en Patagonia con un inset de CABA | 🟢 | Es dato de seed; aún así, considerar auto-encuadre al bounding box de las jurisdicciones asignadas con nota de "vista multi-jurisdicción". |
| **Leyenda del mapa densa** — mucha info simultánea (gradiente + meta + k-anon + símbolos graduados) | 🟢 | Está bien para un operador; para el "Informe de situación" futuro, considerar leyenda progresiva. |

### Visual hierarchy
- Jerarquía fuerte y consistente: display serif + sans limpia, tarjetas KPI legibles, el mapa se lleva el foco correctamente. El inset de comunas de CABA es un detalle fino.
- El scrollytelling "capítulo por capítulo" (Dueño→Vet→Anónimo→Refugio→miMAR) cuenta la propuesta "muchas manos, una libreta" muy bien.

### Consistency
| Elemento | Problema | Recomendación |
|---|---|---|
| Copy con género | Formas con barra "**Castrado/a**", "La tengo conmigo" no resuelven al sexo de la mascota (Pampa es Hembra → debería decir "Castrada"). Algunas tarjetas sí resuelven (Perdido/Perdida varía) | Resolver género por `sex` en todos los slots; matar las formas "/a" visibles. |
| Placeholders de foto | Inconsistentes: landing y `/perdidas` usan **letra grande** ("L", "F"), `/adoptar` usa **ícono paw/cara**, `/p` sí tiene foto real | Un solo placeholder de "sin foto" en todo el sistema. |
| Marca interna | "DIM"/"MiMAR" y el slug de ruta en inglés (`/gob/analytics`) conviven con UI en español | Consolidar a "MiMAR" de cara al usuario; los slugs no se ven pero conviene unificar. |
| Dato mock | La landing dice "Caniche"; la credencial pública dice "Mestiza" para Pampa | Alinear seed/mock. |

### Accessibility
- **Fortaleza real:** el mapa **siempre renderiza una tabla `<details>` de datos** + `aria-label`/`role="img"` — fallback accesible de libro. Tenés skip-links y `@axe-core/playwright` en el repo, y un skill `design:accessibility-review`.
- **A verificar:** contraste de texto atenuado sobre el mapa oscuro y en leyendas (no corrí axe en vivo esta sesión). Recomiendo pasar axe sobre `/gob/panorama` y la landing.

### Lo que funciona muy bien
- El **mapa/panorama** (ver §3) — de lejos lo más fuerte.
- La **credencial pública `/p`**: tiers claros, foto real, framing de privacidad explícito ("Esta vista no expone contacto del dueño…").
- **Framing legal** honesto y presente: Ley 14.346 (maltrato), 25.326 (datos/ARCO), banners "Datos de demostración" y "integración con canales gubernamentales en desarrollo".
- **Empty states** cuidados (Cola, Moderación) y **KPIs con contexto** (doble denominador, metas).

### Recomendaciones priorizadas (design)
1. **Unificar el header/nav** (marketing vs app) — es la inconsistencia más visible.
2. **Resolver el copy de género** por `sex` — barato y sube mucho la percepción de pulido.
3. **Exponer el toggle bitemporal** (o al menos un hint) — vender el feature que ya construiste.

---

## 3. El mapa (panorama) — deep dive 🗺️

Pediste "absolutamente todas las features del mapa". Recorrí todos los presets, capas, scrubber y modos. Veredicto: **es un tablero epidemiológico serio**, no una demo.

**Lo que hay y funciona (verificado en vivo):**
- **Presets/lentes** (VISTA): Brotes activos, Síntomas/vigilancia sindrómica, Cumplimiento antirrábico, Bienestar y fiscalización, Control poblacional, Pérdidas y reunificación. Cada uno cambia capas + KPIs + caption.
- **Capas componibles** ("se suman · compatibles entre sí") con badge de conteo (p. ej. Cobertura antirrábica + Zoonosis/señales).
- **Mapa bivariado de riesgo** ("Cobertura baja × señales altas — el rincón de riesgo"), con guardia de "requiere ≥6 unidades comparables".
- **k-anonimato en la leyenda** ("Dato protegido — menos de 5 registros (k-anonimato)", "Datos insuficientes (privacidad)") — y **está enforced server-side de verdad** (§5): `suppressSmallCells` k=5 + supresión complementaria contra ataques de diferenciación.
- **Reproducción temporal (scrubber)** con ventanas (última semana/mes/trimestre), modo Simple/Detalle, y el **toggle bitemporal** "Cuándo ocurrió" (valid-time) vs "Según lo conocido al momento" (transaction-time). Se **auto-deshabilita** donde no aplica ("No disponible en esta vista" para cobertura, que es estado actual) — muy prolijo.
- **KPIs con doble denominador**: "64,6% · 2.037 perros en el padrón · el padrón cubre 0,4% de la población canina estimada · 0,2% firmado por matrícula · meta 80%". Distingue "del padrón" vs "de la población estimada" — sofisticado y honesto.
- **Inset de comunas de CABA**, toggle Provincias, zoom/pan, "Copiar vista", "Vistas guardadas", "Exportar PNG". "Informe de situación" queda marcado "(en desarrollo)" — labeling honesto.

**El mapa SÍ se actualiza al cambiar preset/período** — la vieja preocupación de "mapa stale por `useEffect([])`" que reportó el review de `main` **no reproduce** en la rama que corrés.

**Nits del mapa:**
- Toggle bitemporal escondido bajo "Detalle" (ver §2).
- **A confirmar:** el GeoJSON base en `main` tenía solo 3 de 24 provincias (stub); en vivo la coropleta pintó varias provincias patagónicas con geometría real, así que **parece expandido** en la rama — conviene confirmar la vista nacional completa (24 jurisdicciones con geometría).
- **A confirmar (del review de `main`):** en el per-cápita, el numerador es locality-scoped pero la población del denominador podría sumarse a nivel provincia → tasa subestimada para operadores de comuna/localidad. Revisar en la rama con `fetchCasesPerCapita`/`fetchCensusPopulation`.

---

## 4. Recorrida por persona (lo que probé en vivo)

| Superficie | Estado | Notas |
|---|---|---|
| **Público** (landing, `/perdidas` 116 activas, `/adoptar`, `/p/DIM-PAMP-0001`, `/denuncias`) | ✅ | Sólido. Credencial pública con tiers + privacidad. Placeholders de foto + copy de género (§2). |
| **Gobierno** (`/gob/panorama` + Vigilancia/Analítica/Maltrato/Casos + omnibox) | ✅ | El mapa (§3). `/gob/maltrato`: cola de triage Ley 14.346, filtrada por jurisdicción, 83 sin asignar. `/gob/casos`: scoping correcto (solo Ushuaia/El Calafate). Omnibox agrupa Casos/Denuncias y **no** expone búsqueda libre de personas a gobierno (buena decisión de privacidad). |
| **Admin** (`/admin` + Moderación/Inteligencia/Cola) | ✅ | Panel universal bien explicado (admin universal vs gob acotado). Moderación: heurística de duplicado retiene una denuncia para revisión. **Inteligencia carga bien** (el timeout que viste antes NO reprodujo). Cola con empty-state limpio; incluye RUPGA (perros de asistencia). |
| **Dueño / Vet / Refugio** | ⚠️ no live | Cubierto por code review + tus reportes previos. Recomiendo un pase live corto (§7). |

> **Nota:** en esta sesión **no** creé datos de prueba (no envié formularios). No hay side-effects que revertir. El pase de flujos con efecto (alta, denuncia, adopción, transferencia) quedó para una segunda vuelta con login por persona.

---

## 5. Bajo el capó (code review) — reconciliado contra la rama que corre

Todos los veredictos de abajo están **re-verificados contra `integration/all-20260703`** (la rama real), no contra `main`.

### Fortalezas (genuinas — esto es de nivel poco común para un capstone)
- **Append-only de verdad:** `db/triggers.sql` bloquea UPDATE **y** DELETE en `pet_events` a nivel base; el escape está *gateado por accountability* (GUC de actor + fila de `audit_log`). No es solo RLS.
- **Motor de replay/proyecciones excelente:** reproduce el ledger ordenado por `(occurred_at, recorded_at, id)`, reducers puros, `pg_advisory_xact_lock` por mascota. Las proyecciones son re-derivables.
- **RLS deny-all real**, con test que rompe CI si una tabla pública queda sin clasificar. Authz **server-side** con test de cobertura que exige que toda action llame un guard o declare `@no-auth-required`.
- **k-anonimato bien hecho:** `lib/metrics/anonymity.ts` — `suppressSmallCells` (k=5) + supresión **complementaria** (contra diferenciación) + un tipo *branded* `SuppressedCells` que hace imposible devolver filas crudas al cliente. Consumido por ~8 fetchers.
- **Bitemporalidad usada en query real** (no cosmética): el repo de panorama elige `occurred_at` vs `recorded_at` por request y aplica `asOf` como WHERE; hay `knowledgeGapLabel` en exports PDF.
- **~18 linters de invariantes propios** (`check-rls-coverage`, `check-authz-*`, `check-timezone-dates`, `check-event-payload-parity`, `check-locality-integrity`, …) **cableados en `verify`**. **334 archivos de test** (~3.800 casos). Disciplina de índices/FKs de nivel profesional.

### Issues (ranked, branch-accurate)
| # | Sev | Qué | Estado en la rama | Fix |
|---|---|---|---|---|
| 1 | 🔴 **Alta (seguridad)** | **IDOR de adjuntos** en `signTimelineAttachments`: la query filtra solo por `eventIds` del cliente, no por `pet.id` (que se destructura pero no se usa). Un usuario autenticado puede firmar URLs de adjuntos clínicos de **otra** mascota si adivina/filtra UUIDs de eventos | **STILL PRESENT** — `src/modules/pets/application/timeline-attachments/sign-timeline-attachments.ts:73-79` | **Una línea:** agregar `eq(attachments.petId, pet.id)` al WHERE. La columna `pet_id` existe. Sumar un test cross-tenant. |
| 2 | 🔴 **Alta (funcional)** | **Signup en loop**: el paso 2 exige una sesión que `signUp` no entrega si las confirmaciones de email están ON. El usuario se crea pero la UI vuelve al paso 1 | **STILL PRESENT** — `src/modules/auth/application/signup.ts:65-70`, `complete-identity.ts:74-77`. Mitigado solo operativamente (confirmaciones OFF) | Persistir el nombre vía `signUp` `options.data`/`handle_new_user`, o continuar el paso 2 tras el callback de email. |
| 3 | 🔴 **Alta (funcional)** | **Denuncia sin localidad invisible al gobierno**: `jurisdiction_locality` es nullable y el scope gob matchea `(provincia AND localidad)` → una denuncia anónima sin localidad no le llega a **ningún** operador scopeado por localidad (sí la ve el admin nacional) | **PARCIAL** — nullable en `db/schema.ts:1564`; scope en `lib/metrics/scope.ts`. Hay nueva subsunción provincia-entera (CABA) que ayuda solo a ese caso | Requerir localidad canónica en el wizard, **o** que el scope gob tolere reportes provincia-sola/NULL-localidad. |
| 4 | 🟠 **Alta (funcional)** | **Resolución de disputa por "ownership_transferred"** arma un `custody_transferred` con `from_user_id` **y** `from_organization_id` en null → falla el refine "≥1 from" → rollback + error crudo | **STILL PRESENT** — `resolve-dispute.ts:186-187` + refine `event-schemas.ts:1211-1221` | Setear el "from" correcto. (La rama **P2P owner→owner ya está FIXEADA** con un arm de schema nuevo — bien.) |
| 5 | 🟡 Media | **Errores zod crudos**: ya no se vuelca el `ZodError.message` completo, pero **no hay boundary central** de mapeo; schemas sin mensajes custom aún pueden filtrar texto zod por defecto (a veces en inglés en UI en español) | **PARCIAL** | Un mapeador central de errores de validación → mensaje localizado por campo. |
| 6 | 🟡 Media | **Decomiso** con scope solo-provincia + `!petProvince ||` (mascota sin provincia decomisable por cualquier gob en scope) — más grueso que el resto del sistema | Presente (revisar en rama) | Hacerlo decisión explícita; si va por localidad, espejar el tuple check. |
| 7 | 🟡 Media | **Arquitectura "split-brain"**: la extracción DDD quedó a mitad de camino — ~18k LOC de lógica en `app/actions/*`, y varios dominios con 2–3 hogares (`lib/` ↔ `src/modules/` ↔ `app/actions`) que se importan mutuamente | Presente | Declarar **un** hogar por dominio y terminar (o abandonar) el strangler. Es el mayor riesgo de mantenibilidad, no el ledger. |
| 8 | 🟡 Media | **Modelado débil de dominio**: `species` es texto libre (vs `sex` que es enum), país de chip sin fuente canónica (comentario invertido 858/032; `iso_compliant` seteado sin checksum), `locality` sin FK a `ar_localities(indec_id)` | Presente | Tablas `ref`/enums con FK para especie, país de chip y localidad; corregir el comentario 858 y el flag `iso_compliant`. |
| — | ✅ **FIXED** | **Timezone off-by-one** (14/15-oct): formatters ahora **fijados a `America/Argentina/Buenos_Aires`**; `check-timezone-dates` cableado en CI | Resuelto en la rama | — |

### Nota sobre `#418`/hidratación
El review de `main` encontró patrones de render no-determinístico (`new Date().toLocaleString` en client components, ids con `Math.random`). Con el timezone ya fijado en la rama, la causa principal de mismatch server/cliente **debería** haber bajado mucho. No lo confirmé por stack de componentes en vivo esta sesión; si volvés a ver formularios que "se comen" lo tipeado, ese es el sospechoso (revisar `ConfirmDialog` `useRef(Math.random)` → `useId()`).

---

## 6. Review honesto de la metodología de QA cowork

Leí `MiMAR-plan-test-UX-chrome.md`, los reportes `20260707/08…` y la matriz de workflows. **Impresión: es de las metodologías de QA más rigurosas que vi en un proyecto de una persona.**

**Lo que está muy bien:**
- **Matriz de workflows × POV** con estados (`☐/✅/⚠/—`) — cobertura explícita y auditable.
- **Veredictos accionables** (CIERRA/PASA/BLOCKER) con "Antes → Ahora", **tracking de regresión** y **log de side-effects para revertir**.
- **Reglas de seguridad claras**: solo datos de test, frenar antes de irreversibles/pagos/permisos, cuentas y contraseñas fijas.
- **Anclado a lo legal** (rabia positiva, ARCO, matrícula, Ley 14.346, Decreto 4669/1973) — testeás lo que un ente firma con nombre y apellido.

**Qué mejoraría (proceso):**
1. **Fijar el commit/branch/staging URL al tope de cada reporte** — resuelve el problema de §1 (local ≠ staging ≠ main) que hoy es la mayor fuente de confusión.
2. **Screenshots que no persisten:** tus reportes ya lo notan ("la herramienta no persiste capturas"). En esta sesión `save_to_disk` tampoco cayó en un lugar recuperable del contenedor. Solución: guardar capturas por flujo en un artefacto versionado, o depender de Playwright + `toHaveScreenshot()` (snapshots que quedan en `playwright-report/`).
3. **Verificaciones "no automatizables" (PDF/canvas):** el visor PDF de Chrome y WebFetch bloqueado dejaron cosas "a ojo" (encabezado MPF, fila ENO). Muévelas a **aserciones de código/e2e** (extraer texto del PDF con `pdf-lib`/`pdf-parse` en un test; consultar el outbox por API en el test).
4. **Convertir hallazgos recurrentes en linters/e2e:** ya tenés `check-*` y Playwright. Cada bug de esta clase (timezone, zod crudo, cache público, género de copy) debería terminar como un **check o un e2e** que rompe CI — así no vuelve. (El timezone ya siguió ese camino: bug → `check-timezone-dates`. Es el modelo a repetir.)
5. **Reproducibilidad por seed:** referenciar el script de seed y el escenario (`seed:demo:scenario`, `seed:flagship`) en cada corrida para que "116 perdidas" y compañía sean determinísticos.
6. **Cuidado con la falsa confianza de los tests:** el IDOR (#1) y el `custody_transferred` pasaban CI porque los tests usan **repos fake** que saltean la validación real. Regla: **al menos un test de integración por event-writer que pase por `validateEventPayload` real.**

**¿Sirve el QA cowork?** Mucho. Es tu mejor herramienta para el "seam" cross-POV que los unit tests no tocan (ciudadano denuncia → Estado lo ve). Lo llevaría de "recorrida manual narrada" a "recorrida manual + red de e2e/linters que fija cada hallazgo".

---

## 7. Qué mejoraría — priorizado (todo junto)

**Ahora (bloqueantes de piloto):**
1. 🔴 Tapar el **IDOR de adjuntos** (#1, una línea + test).
2. 🔴 Arreglar el **signup** (#2) — sin alta de cuenta no hay piloto ciudadano.
3. 🔴 Decidir la **visibilidad de denuncias sin localidad** (#3).

**Siguiente (cierre funcional + confianza):**
4. Rama de **disputa→transferencia** (#4) y **boundary central de errores** (#5).
5. **Fijar SHA en reportes de QA** + convertir 2–3 hallazgos recurrentes en e2e/linters (§6).
6. Pase **live de Dueño/Vet/Refugio** (los flujos con más efecto: alta, libreta+curva de peso, modo perdido, firma vet, intake, adopción, transferencia).

**Después (pulido + salud a largo plazo):**
7. **Design:** unificar header, resolver copy de género, exponer el toggle bitemporal, placeholder único de foto.
8. **Arquitectura:** frenar el split-brain `app/actions ↔ lib ↔ src/modules` (#7); canonizar especie/país/localidad (#8).
9. **A11y:** pasar axe sobre panorama + landing; confirmar contraste en el mapa oscuro.

---

## Anexo — cobertura de esta sesión
- **Live (Claude in Chrome):** landing + secciones, `/perdidas`, `/adoptar`, `/p/DIM-PAMP-0001`, `/denuncias`, `/gob/panorama` (todos los presets + capas + scrubber + bitemporal), `/gob/maltrato`, `/gob/casos`, omnibox, `/admin`, `/admin/moderacion`, `/admin/inteligencia`, `/admin/cola`.
- **Código:** repo completo en `main` (4 dimensiones) + re-verificación de 6 findings + features de mapa contra `integration/all-20260703`.
- **No cubierto live:** flujos con login de Dueño/Vet/Refugio y ejecución de workflows con side-effects (quedó para 2ª vuelta).
- **Datos de prueba creados:** ninguno (sesión de solo-lectura en UI).
