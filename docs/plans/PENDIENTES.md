# PENDIENTES — cola única de trabajo abierto

> **Solo lo que falta.** Lo cerrado vive en los planes del 29, 30, 31 y 01-08.
> Actualizado 2026-07-31 tras cerrar la primera tanda de la cola.
>
> **Marcador**: **~40 abiertos**. La tanda de hoy cerró 68: las 7 barreras de
> a11y (+1 octava encontrada persiguiendo el patrón), el fence de CSS, 6 flujos
> rotos de RA-2, 5 comentarios que mienten, los 4 rojos de `final-seams`, tres
> fences que no chequeaban lo que decían, y **dos vulnerabilidades alcanzables
> desde cualquier cuenta gratuita** que introdujo esta misma ola y cerró antes
> de salir.
>
> **CI: el veredicto real vive en la corrida hermana** — cada push dispara dos
> (una por `push`, otra por `pull_request`) y una cancela a la otra. Leer
> `cancelled` no es leer CI.
>
> ## ⚠️ CORREGIDO 01/08 — staging YA NO está atrasado
>
> Este documento decía que `dim-staging.vercel.app` servía el commit `aa668d54`
> del 18 de julio. **Era cierto y ya no lo es**, y mientras tanto un equipo
> externo leyó esa línea y la reportó como hallazgo vigente. Un documento que
> describe como presente un problema resuelto es la misma clase de defecto que
> esta ola viene cazando: **un registro que dice algo que ya no es verdad.**
>
> Estado real: la rama de trabajo es ahora la **rama de producción** del
> proyecto de Vercel, así que cada push despliega solo. Verificado contra el
> entorno — health `ok`, 0 chunks rotos de 21, y el commit servido == HEAD.

---

## 🚨 GATE DE DEPLOY — antes de que esto sirva en un entorno real

Cuatro acciones manuales. Ninguna es código.

1. ~~**Migraciones `0162`, `0163`, `0164`**~~ — **APLICADAS a staging 31/07**,
   junto con `0158`-`0161` y la nueva `0165`. Ledger en 164/164, `Pending: 0`.
   Verificado contra la base, no contra la salida del comando: la columna
   `jurisdiction_unverified` existe, `ownerships` tiene cero políticas de
   escritura, y **el RLS pasó de 26/53 a 53/53**. Datos intactos (66.732
   mascotas, 226.335 eventos).
2. **`0165` — el ledger mentía.** Staging reportaba 156 migraciones aplicadas y
   salud perfecta con **27 tablas sin RLS**, incluidas `profiles`, `pets`,
   `pet_identifications`, `notifications` y `audit_log`, todas legibles por
   `anon` vía PostgREST con la clave que viaja en el bundle. Causa probable:
   `drizzle-kit push` (que no lleva RLS) + `migrate.ts --baseline` (que marca
   todo aplicado **sin ejecutar SQL**). Producción estaba limpia. **Pendiente:
   un chequeo que compare el ledger contra el estado real de la base**, para que
   esto no dependa de que alguien sospeche.
3. **`DEMO_PET_TOKEN` en Vercel.** El flagship **ya está sembrado** en staging
   (`DIM-PAMP-0001`, Pampa, 22 eventos). Falta solo la variable, y **solo en el
   proyecto de staging** — en producción no va, el código exige que ese entorno
   no tenga mobiliario de demo. Requiere redeploy para tomar efecto.
4. ~~**El Gmail personal del PO viaja a Nominatim**~~ — **DECIDIDO 31/07: queda.**
   `lib/infra/geocoding.ts:62` y `SECURITY.md:12` siguen con la dirección
   personal. El razonamiento del PO: OSM exige un contacto **monitoreado**, y una
   casilla genérica que nadie lee es peor que una personal que sí se lee —
   cuando OSM avise de abuso de su API, el aviso tiene que llegarle a alguien.
   Se mueve cuando exista una casilla específica con lector. **No es bloqueante.**

### Además, ahora mismo — NINGÚN servidor de QA sirve

Medido 31/07 09:20: **`:3000` tiene 7 chunks rotos de 21; `:3100`, 3 de 21.**
Los dos dan 400 en `webpack-*.js`, así que React **nunca hidrata** y **todo
click se descarta en silencio**. Eso imita perfectamente un defecto de
producto: dos specs independientes fallaron igual y casi las reportamos como
dos defectos graves reales.

**Cómo se llegó acá, porque se va a repetir**: un agente dejó `:3100` sano;
después alguien corrió `pnpm verify`, que hace `pnpm build`, y el build
**reescribió `.next` por debajo de los dos servidores vivos**. Los hashes de
chunk cambian, el HTML servido sigue pidiendo los viejos.

**La regla**: después de cualquier build, los servidores de QA quedan muertos
aunque respondan 200 en `/`. Reiniciarlos es obligatorio, no opcional.

**Detectarlo es un `curl`**: bajar `/`, extraer `/_next/static/chunks/*.js`,
pedir cada uno. Un solo 400 invalida toda sesión de navegador. Vale la pena
meter ese chequeo dentro de `qa-up.ps1` y de cualquier brief que use navegador.

PIDs actuales: `:3000` → 36372, `:3100` → 33356. Matarlos con
`taskkill //PID <pid> //F`. El árbol está limpio, así que rebuild + restart es
seguro. **`pwsh` no está instalado acá** — la invocación es
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/qa-up.ps1`, y
ojo que su rama "port already listening → reusing running server" **reusa el
servidor podrido** y sus smoke tests pasan igual (el HTML da 200). Matar primero.

---

## 🔴 P1 — **VACÍA** (verificada el 2026-08-04)

> Los cuatro ítems que vivían acá (RA-2 F4, F5, F9, F10) **ya están
> arreglados**, verificados uno por uno contra el árbol:
>
> | Ítem | Evidencia del arreglo |
> |---|---|
> | F4 chip distinto al canónico | `checkChipMatchesCanonical` rechaza el conflicto ANTES de la transacción (`lib/domain/microchip-validation.ts:78-115`) |
> | F5 `redirect()` en la acción | `microchip/reemplazar/action.ts:117-122` devuelve `{ redirectTo }` (N3) |
> | F9 `org.transfer.propose` inerte | la página llama `requireCapability(...)` (`transferencias/nueva/page.tsx:37-47`) |
> | F10 "Enviar documentación" a la nada | verificación como estado de espera declarado (`waitingOn: "mimar"`) |
>
> **Aviso de método**: las citas viejas de F4 (`microchip-use-case.ts:124`,
> `events-repository.ts:197`) apuntaban al ARREGLO, no al defecto. Quien las
> siguiera de buena fe "re-arreglaba" código que funciona. Fue la tercera vez
> que este documento cayó en ese modo de falla — de ahí la regla de evidencia
> fechada de arriba.

## 🟠 P2 — el gate miente

### Los fences más angostos que su propia doctrina
| # | Qué |
|---|---|
| **RA-8 estructural** | **10 archivos `"use server"` invisibles a los tres linters de authz** (el glob es plano). Incluye 8 acciones de escritura médica en atender y tres exports sin guard |
| **RA-8 estructural** | `check-authz-scoping` **se derrota con un comentario** — la palabra "jurisdiction" en cualquier parte del cuerpo cuenta como prueba. Baseline: 41 acciones tenant-guarded pero sin scopear |
| **RA-8 estructural** | `check-rls-coverage` solo verifica que **exista** una política, nunca su contenido, roles, cláusula `TO` ni GRANTs. Por eso R1 pasó limpio con tres políticas |
| **RA-8 estructural** | **10 políticas sin cláusula `TO`** (en 8 tablas; `achievement_views` aporta 3 — recontado 04/08) → caen a `PUBLIC` (incluye anon). Hoy son seguras por accidente, vía predicados `auth.uid()`, no por diseño |
| **RA-8 estructural** | `middleware.ts` **no hace autorización**. Cada ruta se auto-gatea, sin red de seguridad |
| **RA-2 F16** | `lint:nav` prohíbe **solo `router.refresh(`** mientras su docblock nombra push/replace. **~25 líneas vivas en 22 archivos** (recontado 04/08) |
| **RA-2 F15** | El fence N3 reporta **cero deuda falsamente**. Recontado 04/08: ya tiene **cuatro** globs (el agujero de `action.ts` se cerró); lo que queda fuera son los **módulos de caso de uso** — ~12 `redirect()` en 10 archivos bajo `src/modules/*/application/**` |
| **NUEVO 31/07** | **Dos fences cargan su propia copia de `stripComments`** (`check-confused-deputy.ts`, `check-router-refresh.ts`) — recontado 04/08: los otros dos ya re-exportan del módulo compartido. Ya existe el módulo compartido (`scripts/lib/strip-comments.mjs`) y `tsx` resuelve `.mjs` desde `.ts` sin ceremonia. Migrarlos |

### Tests que no guardan nada

> **El bloque e2e cerró el 2026-08-04.** El rojo permanente (33 ubicaciones) se
> retiró en seis pasadas; CI verde entero por primera vez desde el 30/07. Las
> causas raíz están catalogadas en `e2e/README.md` y en engram
> (`ci/e2e-standing-red`). Lo tachado abajo ya no es trabajo.
| # | Qué |
|---|---|
| ~~**E2E no es un gate — 33 ubicaciones rojas**~~ | **CERRADO 2026-08-04** — CI run `30873868074` verde entero (6/6 jobs, e2e incluido), commits `c3deb663`..`c259d029`. Medido 31/07 comparando dos corridas: **antes de esta ola ya había 30**, incluidas las dos de `cross-tenant-is… |
| ~~**El presupuesto de login POR EMAIL**~~ | **CERRADO 2026-08-04** — CI run `30873868074` verde entero (6/6 jobs, e2e incluido), commits `c3deb663`..`c259d029`. La causa de 9 de las rojas nuevas (`synthetic-monitor`): `login refused for owner@dim.test`. El workaround de … |
| ~~**E2E `a11y-operator-auth`**~~ | **CERRADO 2026-08-04** — CI run `30873868074` verde entero (6/6 jobs, e2e incluido), commits `c3deb663`..`c259d029`. Dos tests describen una **IA retirada**, mismo patrón que `owner-shell`: esperan que un operador sin permisos … |
| ~~**E2E `crisis-seams` (d)**~~ | **CERRADO 2026-08-04** — CI run `30873868074` verde entero (6/6 jobs, e2e incluido), commits `c3deb663`..`c259d029`. La adopción no transfiere fuera de la custodia del refugio, o el test no lo ve. Rojo en CI desde antes de esta… |
| **`PanoramaConsole` "finding 1"** | `waitFor` con el presupuesto por defecto de 1s; en CI tardó 1541 ms y se pasó. **59 `waitFor` sin timeout explícito en ese archivo** (recontado 04/08: eran 47 cuando se escribió esto). No subir uno suelto: o se decide un presupuesto para el archivo, o se acepta el flake declarado |
| **RA-4 F8** | Un test de scope de gobierno que **nunca ejecutó una aserción** desde que se escribió: el primer test del archivo deja al usuario en un estado que hace fallar su `submit`, y el `if (!submit.ok) return` se traga todo |
| **RA-4 F9** | Un guard cross-org que **nunca llama a la acción que guarda** — la aserción de cierre es tautológica por construcción |
| ~~**RA-4 F5-F7**~~ | **CERRADO/RECLASIFICADO 04/08.** F5 (`pet-carousel-dots` muerto) arreglado en `f6bb0f20`. F7 (warn-and-skip en tests de constraint) arreglado: `attachments-xor-parent.test.ts` ahora TIRA con tabla vacía. **F6 se cierra por INVERIFICABLE**: no cita archivo ni símbolo, y todos los tests de supresión-vs-cero encontrados sí inspeccionan valores. Si el defecto existe, se reabre con evidencia.
| **RA-9 EI-4/5/6** | **Tres** self-skips dependientes de datos en `public-smoke.spec.ts` (recontado 04/08), dos de ellos gates de axe que se auto-jubilan con `test.skip` sobre data vacía (uno es el "momento héroe", Ley 26.653) · `qa-panorama-a11y.ts` es un generador de reportes vendido como gate (no lo cita nadie) · dos aserciones de touch-target que matchean el documento entero |
| **RA-7 F8** | `cube-parity` es **vacuo en su mitad nacional**: el loop de valores saltea toda celda suprimida (`if (!cp) continue`). Corregido 04/08: la cláusula de grano provincia era falsa — `normFeatures` compara dos sets calculados de forma independiente, es una comparación real |
| ~~**P2.8**~~ | **CERRADO 2026-08-04** — CI run `30873868074` verde entero (6/6 jobs, e2e incluido), commits `c3deb663`..`c259d029`. `rls/matrix` tiene guards por celda que lanzan, pero el patrón hermano sigue vivo en **13 tests de aislamiento… |
| ~~**P2.5**~~ | **CERRADO 2026-08-04** — CI run `30873868074` verde entero (6/6 jobs, e2e incluido), commits `c3deb663`..`c259d029`. `owner-ia-p6` 1/2/10 y `synthetic` (c)/(d) trabados en skeletons de Suspense pasado el presupuesto de 8s… |

---
## 🟡 P3 — el panorama contándose distinto a sí mismo

| # | Qué |
|---|---|
| ~~**RA-7 F5**~~ | **YA ESTABA CERRADO** (verificado 2026-08-01): `rankingAllInScope` corre sin tope (`limit: Infinity`, con test) — este doc estaba desactualizado, el modo de falla que la nota de arriba advierte |
| ~~**RA-7 F6**~~ | **YA ESTABA CERRADO** (verificado 2026-08-01): `activeSuppressedCells` es la derivación única para píldora y pie del PNG; caption y ranking declaran su alcance propio (universos distintos, a propósito) |
| ~~**RA-7 F7**~~ | **YA ESTABA CERRADO** (verificado 2026-08-01): `panoramaFreshnessCaption` agrega el aviso de tope en ambas ramas (cubo y vivo), cubierto por `cube-freshness.test.ts` |
| **RA-7 F9/F10** | Dos claves de leyenda más que describen estados que el frame puede no contener; y el estado "falta un eje" del bivariado se **pinta pero nunca se declara** |
| **RA-3 C8** | Diferenciación cruzada por **denominadores anidados** en datos abiertos: `perros_registrados` es subconjunto de `mascotas_activas`, la resta da las no-perro. Ambas celdas pasan su propio k-check; la regla conjunta compara **nombres** de columna |
| **C1 5ª instancia** | El resto de la tira de KPIs (`microchip`, `ppp`, `reunificacion`, el pie de `coverageDenominator`) publica sobre un alcance retenido. **No se ensanchó a propósito** — mordeduras/zoonosis/denuncias tienen otros denominadores y meterlos bajo un veredicto calculado sobre mascotas registradas sería la sobre-corrección de RA-1 |
| **RA-1 C3** | El triage de maltrato **perdió la edad** de una denuncia no vencida: `SlaBadge` solo la muestra en la rama vencida, así que una de hoy y una de hace 13 días se ven idénticas |

---

## ⚪ P4 — deuda declarada

| # | Qué |
|---|---|
| **RA-1 C5 / RA-10 D4** | **21 pesos inertes**, no 6: Mono carga 400/600 y Serif 500/600, así que `font-bold` da 600 y `font-medium` da **400**. Incluye los tres primitivos del tier operador, con comentarios que dicen "9px bold". **Y en CSS son 4, no 1** — `.lp-ch-num`, `.lp-lib-y`, `.ln-band-title` piden 500 y `.ln-ledlbl` pide 700. El arreglo es genuinamente ambiguo: 400 es honesto pero consagra un peso no buscado; 600 respeta la intención pero cambia visiblemente la credencial insignia; sumar 500 a `layout.tsx` es una decisión de performance |
| **CSS ratchet** | **19 tamaños por debajo del piso**, ya itemizados en su propia categoría `fontBelowFloor` para que se retiren de a uno. No son one-liners: subir `.ln-qr-cap` de 8px a 10px cambia el layout de la credencial |
| **`lint:buttons` a CSS** | El botón de 8px de la landing era un **token equivocado**, no un valor crudo — ninguna regla del ratchet de CSS lo habría cazado. Esa clase se cierra extendiendo `lint:buttons` a hojas de estilo |
| **RA-10** | ~20 hallazgos de estética. Los que se ven: la **libreta de vacunas clipea a 390px** (sin `overflow-x-auto` en toda la cadena) · **"Luna · Hembra · PERDIDO"** en la home del dueño · la micro-tipografía de la credencial pública a **8px** · el botón "Crear cuenta" es un rectángulo de 8px a un click de píldoras · `CaseStatus.open` se dice de **cinco maneras** · **22 diccionarios de estado** hechos a mano · 5 radios de chip conviviendo |
| **18 lecturas de `petIdentifications.code`** | `omnibox-search`, `gob-pet-subview`, `lookup-for-claim` y 15 más seleccionan el chip canónico. Tienen pinta de estar gateadas por rol, pero **nadie lo verificó**. Es la misma pregunta que destapó el oráculo del vecino: ¿qué actor puede llegar a cada una? |
| **`role="img"` tragándose subárboles** | Quedan `<figure role="img"><ul>` en `gob/mortalidad` (×2), `gob/adopciones`, `admin/adopciones`, `gob/censo`, `admin/censo`. Todos preexistentes. El de `StaticFirstMap` ya se cerró; estos hay que mirarlos de a uno |
| **`searchParams` repetido → 500** | `?chip=a&chip=b` hace que Next pase `string[]` y revienta en `.trim()`. Falla cerrado, sin fuga. Mismo patrón en `nueva/page.tsx` |
| **Logo — después de la demo** | **El concepto está decidido y es bueno**: huella dactilar con un perro y un gato adentro. La huella es la identidad (invariante #1: la mascota ES la credencial), las dos siluetas son el alcance de especie. Lo que falta es el formato. Restricciones que deciden si funciona, no preferencias: **(a)** tiene que leerse a **16px** en la pestaña y en la **chapita física** al lado de un QR de dos centímetros — las crestas finas se vuelven gris sucio ahí; **(b)** reproducible **a un solo color**, porque va a convivir con escudos municipales que se bordan, se graban y se sellan; **(c)** invierte limpio para modo oscuro; **(d)** vector, no escaneo — al lado de un escudo vectorial, una imagen con bordes dentados se lee como menos oficial; **(e)** las dos siluetas tienen que distinguirse **de un vistazo**, no superponerse. Nota de implementación: **hoy la marca es tipográfica** — `logo-mimar.svg` está en `public/` y ningún componente lo consume, así que adoptar un logo es introducir una marca donde hay tipografía, no reemplazar una |
| **P2.6** | El worker de Windows (`0xC0000409`). **No bloquea** — no reproduce en Linux |
| **P2.7** | El limpiador de huérfanos cubre 4 de ~20 prefijos. Propuesta escrita, **sin implementar a propósito**: cambia un script que BORRA |
| ~~**P3.2**~~ | ~~`jurisdictionProvince` sin `z.enum`~~ — **YA ESTABA ARREGLADO**, commit `3f56326d`, y el test que certificaba el defecto viejo ya estaba reescrito. Este documento lo listó como abierto durante días y un agente fue a arreglarlo de nuevo. **Segunda vez hoy que la cola describe como pendiente algo resuelto**: antes fue "staging atrasado". Un ítem que nadie re-verifica se pudre |
| **P3.3** | El aviso de capa desconocida enterrado en un dock colapsado. `PanoramaConsole.tsx` está en su fence |

---

## 🔴 P1 (nuevo) — hallazgo de cumplimiento, 2026-08-04

| # | Qué | Evidencia | Por qué es P1 |
|---|---|---|---|
| **PRIV-1** | **`push_subscriptions` sobrevive al borrado de sujeto.** El endpoint de push y las claves `p256dh`/`auth` del cliente quedan vivos después de un borrado completo bajo Ley 25.326 art. 16. La cascada `user_id → profiles.id ON DELETE CASCADE` existe (`db/schema.ts:1567`) pero **es inalcanzable**: nada borra filas de `profiles` — `erase_subject_data` hace soft-delete (`migrations/0059`) y la acción de cuenta borra sólo `auth.users`, que no tiene FK a `profiles` (`db/schema.ts:401`). Ninguna de las migraciones de borrado (0106/0129/0130/0131/0159) toca la tabla. | verificado 04/08 en el barrido T10 | Es un dato personal identificador (endpoint de dispositivo) que persiste después de que el titular ejerció su derecho de supresión. **Fix**: agregar la revocación/borrado de `push_subscriptions` a `erase_subject_data` |
| **ROUTE-1** | El form "¿Encontraste esta mascota?" busca al dueño **sin filtrar `role='owner'` y sin ORDER BY** con `.limit(1)`: en una mascota con tránsito activo el aviso del hallador puede ir al foster en lugar del titular. | `app/(public)/p/[publicToken]/encontre/action.ts:152-158` | Es el camino de recuperación de una mascota perdida — justo donde el mis-ruteo duele |

---

## 🔵 Features no construidas — migradas de la cola del 24/06

> Verificadas contra el árbol el **2026-08-04**. Son las DOS únicas filas que
> sobrevivieron de `2026-06-24-CONSOLIDATED-pending-backlog.md` (8,5 de sus 11
> ítems ya estaban hechos). Se migran ANTES de archivar esa cola porque no
> figuraban acá: la cola nueva no la duplicaba, la ignoraba.

| # | Qué | Evidencia (04/08) | Bloquea |
|---|---|---|---|
| **A1** | **Chapa física `/t/[serial]` no construida.** No existe tabla `pet_tags`, ni la ruta `app/t/[serial]`, ni eventos `tag_activated`/`tag_revoked`. La spec `specs/2026-05-18-physical-tag-design.md` está "🟢 Ready for CC" desde mayo y **su plan nunca se escribió**. | `ls app/t` → no existe; `rg "pet_tags" db/schema.ts` → 0 | Decisiones D4 (fabricante) y D5 (distribución) de la propia spec: son placeholders explícitos, no trabajo de ingeniería. El hub de credencial física YA funciona con el canal `printable_qr` (`/mis-mascotas/[token]/chapita`) |
| **A5** | **Found-pet form sin dual-routing al refugio de origen.** El componente sólo recibe `publicToken`, sin `orgId` ni opt-in. | `FoundPetForm.tsx`: `rg "organization|refugio|origin"` → 0 | Decisión de producto: ¿el hallazgo de una mascota con refugio de origen le avisa también al refugio? AGENTS ya se corrigió para no afirmar que lo hace |

**Residual de ops (no es código)**: el toggle de leaked-password protection en el
dashboard de Supabase (A9 de la cola vieja).

---

## 🟡 Pulido de interfaz — auditoría de propiedades CSS, 2026-08-04

> Origen: `docs/reviews/2026-08-04-css-properties-audit.md` (100 propiedades
> clasificadas: 44 en uso, 41 fuera de alcance, 7 resueltas de otra forma,
> 8 oportunidades). Criterio del PO para aceptar: **¿hace la interfaz más
> pulida, seria y consistente?** Lo que no pasa ese filtro se rechaza abajo con
> su razón, para que nadie lo vuelva a proponer sin argumento nuevo.

| # | Qué | Por qué entra | Tamaño |
|---|---|---|---|
| ~~**CSS-1**~~ | ~~`print-color-adjust: exact` en el cartel de búsqueda~~ | ~~"PERDIDO" se imprimía blanco sobre blanco~~ — **HECHO**, commit `77d49aca` | ~~S~~ |
| **CSS-2** | **Transición de apertura/cierre del dock de panorama.** `PanoramaDock.tsx:148-161` necesita una altura explícita en la rama colapsada + una clase `.op-dock` en `globals.css` (NO un valor arbitrario de Tailwind: lo prohíbe la nota en `PanoramaDock.tsx:133-135`) | Es el ítem #1 de `2026-07-12-panorama-design-critique.md:301`, el valor ya está especificado en el handoff v2C (`README.md:157`), y es el control que el operador toca más veces por turno: un panel que teletransporta sobre un mapa vivo le cuesta reorientarse cada vez. `prefers-reduced-motion` sale gratis — `globals.css:522-530` ya colapsa toda duración. **Riesgo**: el panel de línea de tiempo usa `height:auto`+`maxHeight`, que no anima; transicionar `max-height` ahí o aceptar que esa rama no anime. NO usar `interpolate-size` | S |
| **CSS-3** | **Tres anillos de foco faltantes**: `PosterPreview.tsx:235` (textarea editable), `SharesManager.tsx:213` (input de URL para compartir), `OrgHero.tsx:97` (link "Verificado") | WCAG 2.4.7 Focus Visible, nivel AA, en un producto atado a la Ley 26.653. En los tres el arreglo correcto es **borrar** `focus:outline-none` y dejar actuar al anillo global (`globals.css:514-517`) — se resuelve quitando líneas, no agregando | S |
| **CSS-4** | **`ScrollToSignal.tsx:22` hace `scrollIntoView({behavior:"smooth"})` sin guardar** | El CSS global de movimiento reducido no alcanza a un scroll imperativo de JS — el repo lo sabe y lo documenta en `globals.css:533-538`; este archivo es el único que se olvidó. El patrón correcto ya existe en `Field.tsx:340-342` | S |
| **CSS-5** | **`table-layout: fixed`** en `MapDataTable.tsx:278` y `PanoramaDataTable.tsx:403` (+ anchos de columna explícitos) | Con layout `auto` los anchos se recalculan del contenido en cada cambio de datos, así que las columnas **saltan** mientras el funcionario mueve el período. Interfaz que se mueve sola sin que nadie la toque | S |
| **CSS-6** | **`scroll-snap-stop: always`** en el tablist del dock (`PanoramaDock.tsx:176,224`) | Ya usa `snap-x`/`snap-start`; sin `always` un swipe rápido en móvil se pasa de largo varias pestañas. Viaja con CSS-5 | XS |
| **CSS-7** | **Unificar los 6 stagger hardcodeados** de `globals.css:899-920` en una regla con `calc(var(--d) * 80ms)` | Consistencia interna, ~20 líneas menos. **Expectativa honesta: el usuario no ve ninguna diferencia.** Entra por "consistente", no por "pulido" | XS |
| **CSS-8** | `content-visibility: auto` en las 5 listas de `<li>` topeadas alto (`admin/observaciones` 500, `gob/vigilancia/brotes` 500, `gob/perdidas` 500, `org/mascotas` 200, `gob/cola` 200) | **CONFIRMADA por el PO (04/08)**: `/gob/perdidas` con el filtro "todas" lista efectivamente las 500. No es un techo teórico — son 500 tarjetas multi-elemento maquetadas y pintadas de una, y no hay librería de virtualización en el repo. **Restricción crítica**: containment NO se aplica de forma confiable a `<tr>`/`<tbody>`, así que las tablas quedan fuera; sólo filas de bloque. Regresión obligatoria: Ctrl+F y el deep-link `?signalId=` (`OutbreakSignalRow.tsx:60`) tienen que seguir llegando al contenido salteado | M |

**Rechazados con razón** (no reabrir sin evidencia nueva):

- **`hyphens`** — `lang="es-AR"` haría que funcione y las celdas de 390px son un
  caso plausible, pero **no se vio ninguna palabra rompiendo**. Se verifica en
  la revisión de viewports; si rompe, entra con caso.
- **`orphans` / `widows`** — Firefox no las soporta en 2026 y `break-inside:
  avoid` ya cubre lo importante (`expediente-print.css:56`,
  `libreta-print.css:8`). Una propiedad que la mitad de los navegadores ignora
  **produce inconsistencia, no la resuelve**.
- **`counter-increment`** — borraría el numerado en JS del landing
  (`StorySection.tsx:160,179,193`), pero la salida vive en `content` generado:
  no se selecciona, no se copia y los lectores de pantalla la anuncian dispar.
  En un producto atado a la Ley 26.653 es un retroceso disfrazado de limpieza.

### Copy y voz es-AR — barrido del 2026-08-04

> `docs/reviews/2026-08-04-copy-voice-audit.md`. 4 🔴 · 31 🟠 · 26 🟡 · 12 🟢.
> **10 clases sistémicas, ~145 instancias.** Las seis instancias que se pasaron
> como semilla estaban todas presentes; una era peor de lo reportado.

| # | Qué | Por qué | Tamaño |
|---|---|---|---|
| ~~**COPY-1**~~ | ~~Reloj híbrido "05:39 p. m."~~ | ~~`formatDateTime()` canónico sin `hourCycle`~~ — **HECHO**, `d649d744`. Quedan 2 sitios en panorama | ~~S~~ |
| **COPY-2** | 🔴 **Adopciones promete un email que el refugio no tiene.** Cinco strings le dicen al postulante que el refugio le va a escribir; la pantalla de revisión (`app/org/[orgToken]/adopciones/[appEventId]/page.tsx:164-173`) muestra **sólo Nombre y Teléfono** — verificado hoy | Es EXACTAMENTE el bug del formulario de contacto que arreglamos hoy, en otro flujo y sin arreglar. `submit-org-contact.ts:19-25` ya tiene el post-mortem escrito con fecha de hoy | M |
| **COPY-3** | 🔴 **El outbox promete reintento en "máximo 5 minutos" y el drenaje corre `0 4 * * *`** — 288× de diferencia. `vercel.json`, `cron-registry.ts:69` y `drain-outbox/route.ts:10` coinciden; el comentario del despachador explica que el plan Hobby no permite sub-diario | El código lo sabe, la copy no. **Y falta lo otro**: el no-op v1 alcanza a los CUATRO tipos, pero la honestidad G7 se aplicó sólo a `eno_authority` mientras su comentario afirma que los otros tres "resuelven a un destino real ya construido" — falso, `outbox-drainer.ts:59-104` los manda a la misma rama con `v1_noop: true` | M |
| **COPY-4** | **Ensanchar `check-ui-invariants.ts` Rule 3**: hoy sólo barre `app/**` y `components/**` (nunca `src/**`) y conoce 13 palabras | ~30 líneas de config cierran las **30** faltas de ortografía —incluida la 🔴 `"proximamente"` en superficie de gobierno— y hacen imposible que entre la número 31. Mejor relación de todo el reporte | S |
| **COPY-5** | **23 diccionarios de estado a mano; `open` se dice de 5 maneras.** `MaltratoQueueScreen.tsx:455-460` tiene escrita la regla ("ONE status vocabulary… Never an inline synonym here") y la pantalla de org para las MISMAS filas hardcodea `"En seguimiento"`/`"Triagueada"` contra las canónicas `"En curso"`/`"Revisada"` | Un import en `app/org/[orgToken]/maltrato/recibidos/page.tsx` (~8 líneas) cierra dos contradicciones entre superficies y deja el ejemplo trabajado para los otros 22 | M |
| **COPY-6** | **29 sitios sin concordancia de plural** ("1 celdas… ocultas") | Ensanchar `check-pluralize-es.ts`, que ya existe | M |
| **COPY-7** | **89 de 101 estados vacíos sin llamada a la acción** | Un estado vacío es una invitación, no una lápida. Se cierra agregando `emptyAction` a los primitivos de tabla | M |
| **COPY-8** | **~35 archivos con formateo de fecha a mano, 9 formas distintas**; `panorama-informe.ts:219` **perdió la zona horaria** | Fence. Mismo patrón que MOT-1: no hay sistema, hay 9 | M |
| **COPY-9** | **16 sitios en tuteo + 2 en usted** (15 de 18 en la feature de decomiso) · 6 decimales con punto · `"Error desconocido"` en 5 archivos | Deriva de registro concentrada en una feature: se arregla de una | S |
| **COPY-10** | **Dos tests defienden el defecto**: `event-payload-details.test.ts:58` y `libreta-export-route.test.ts:149,192` afirman el decimal con punto `"12.50 kg"` — que llega al PDF de la libreta sanitaria | Tercera vez hoy que un test protege un bug en vez de cazarlo | S |

**Verificado limpio** (no asumido): cero disculpas, cero `window.confirm`, cero
"¿estás seguro?" pelado —los 24 diálogos nombran la consecuencia—, cero locales
`es-AR` faltantes, cero `¿`/`¡` ausentes, cero aria-labels en inglés, cero tuteo
en superficies de ciudadano.

### Movimiento e impresión — barridos del 2026-08-04

> `docs/reviews/2026-08-04-motion-audit.md` y `.../print-surfaces-audit.md`.

| # | Qué | Por qué | Tamaño |
|---|---|---|---|
| **PRN-1** | **Test que emule medios de impresión.** `emulateMedia` da **cero** en todo el repo | Es la causa de que estos defectos sobrevivieran. Sin esto, el cartel que arreglamos hoy se rompe de nuevo mañana y nadie se entera. **Va antes que los arreglos**, no después | M |
| **PRN-2** | **`/p/[publicToken]` sin hoja de impresión.** El chip `perdida` es `background: var(--color-ln-err); color:#fff` (`globals.css:3553-3557`) y es **el único portador textual de la situación** (`:3590-3596`) | Al imprimir la credencial de una mascota perdida, el fondo se cae y la página no dice en ningún lado que está perdida. Es la página que más se escanea e imprime. Mismo mecanismo que CSS-1 | S |
| **PRN-3** | **Expediente de maltrato e informe de panorama se truncan a una página** (PREDICHO). Los dos escapan del shell con `position:absolute`, pero su ancestro posicionado es el `AppShell` con `fixed inset-0 overflow-hidden` | El informe promete en su encabezado que ranking, notas de método y k-anonimato "nunca se descartan". **Requiere papel para confirmar** — imprimir `/gob/maltrato/<id>` con timeline largo y buscar el pie que sólo existe al imprimir | M |
| **PRN-4** | **QR de la chapita con `margin: 0`** (`chapita/page.tsx:59-63`) — sin zona de silencio | Un QR sin margen blanco alrededor falla al escanear. (La tinta del QR **sí** está a salvo: `qrcode` pinta con `fill`/`stroke` de SVG, que `print-color-adjust` no toca) | S |
| **MOT-1** | **Tokens de movimiento: hoy hay 18 duraciones distintas y 8 curvas, y CERO tokens** (verificado: `--duration-*`/`--ease-*` no existen). La curva más usada, `cubic-bezier(0.4,0,0.2,1)`, monta **~433 utilidades de Tailwind y nadie la eligió ni la escribió** | Un sistema de diseño con 18 duraciones no tiene ninguna. Set propuesto: 150/180/300/600/1500ms + 2 curvas, eligiendo en cada rol **el valor que ya tiene más instancias**. La adopción es mayormente borrado, sin valores arbitrarios nuevos | M |
| **MOT-2** | **165 `loading.tsx` cortan de golpe.** `.op-fade-in` existe, funciona y se usa 19 veces en 3 archivos | Sistémico y ya resuelto en el repo: es cablear lo construido, no construir | M |
| **MOT-3** | **`prefers-reduced-motion`: 19 sitios bien guardados, 3 sin guardar.** El nuevo es `p/[publicToken]/CredentialActionBar.tsx:75` — scroll suave sin guardar en la **página pública de mascota perdida** | Verificado hoy. Es la superficie que abre un desconocido con una mano, tenso, en el celular. Peor radio de impacto de los tres. Los otros dos: `ScrollToSignal.tsx:22` (= CSS-4) y `PetDetailTabsPanel.tsx:190` | S |
| **MOT-4** | `ConfirmDialog.tsx:190-206` aparece de golpe en ~20 llamados de acción irreversible · nueve disclosures donde **el chevron anima y el panel teletransporta** · `KpiChips` salta mientras `OpKpi` interpola | El estado a medias es peor que cualquiera de los dos extremos. `AnimatedNumber`/`useCountUp` está construido, guardado y testeado, cableado a **un** consumidor — no a la superficie donde ver cambiar el número es todo el punto | M |

**No animar** (tan valioso como la lista de arriba): salida de filas en colas de
operador · flujos de emergencia (perdida, mordedura, maltrato — ahí el arreglo
es **quitar** movimiento, no suavizarlo) · celdas de tabla durante un cambio de
valor (se arregla con `table-layout`, no easeando el salto) · **salida** de
diálogo mientras el usuario espera un resultado · filas de la espina de eventos
· el fade de divisiones durante un scrub.

**Dos "no" con razón**: **View Transitions** no es viable todavía — con 165
`loading.tsx`, el modelo RSC haría que la transición anime **hacia el esqueleto**,
la mitad equivocada del problema. Y la prohibición de `interpolate-size`
**generaliza más allá del dock**: es un opt-in a nivel `:root` que cambia la
interpolación de `auto` en todo el documento, así que habilitarlo para un panel
cambia en silencio las nueve disclosures. Para esas, `grid-template-rows: 0fr →
1fr` ya lo resuelve sin opt-in global.

**Nota sobre el método**: los tres ítems de mayor valor (CSS-2, CSS-3, CSS-4)
**no salieron de la lista de 100 propiedades** — salieron de leer el código con
la lista al lado. Y el hallazgo grande (CSS-1) fue una propiedad que no estaba
usada en ninguna parte del repositorio. Vale para la próxima: el rendimiento de
una lista de propiedades está en lo que te obliga a mirar, no en la lista.

---

## Decisiones del PO ya tomadas sobre esta cola
- **`/gob/perdidas`**: la supresión **queda**. Des-suprimir después es una línea; shipear el tier desnudo no es reversible.
- **Primer admin**: al backlog. No bloquea hasta provisionar un municipio real.
- **Deuda estética**: **el fence primero**, después el codemod. (Fence hecho.)
- **Las 7 barreras de a11y**: todas ahora. (Hechas.)
- **`final-seams`**: investigar los 4 antes de decidir. (Hecho: ninguno era defecto de producto, spec jubilada, y la única cobertura que se pierde quedó escrita en el header de `crisis-seams`.)

## TODO/FIXME en código — clasificados 2026-08-04 (no hay deuda oculta)

Barrido de los 37 marcadores en código productivo. **Resultado: están sanos.**
Casi todos llevan dueño explícito y ninguno esconde trabajo sin registrar:

| Etiqueta | Cuántos | Qué los bloquea |
|---|---|---|
| `TODO(25b)` / `TODO(mi-argentina)` | ~6 | Credenciales de Mi Argentina (OIDC). **Externo** — el stub devuelve 404 con la puerta cerrada |
| `TODO(PO)` | 3 | Decisiones tuyas: sink de observabilidad (Sentry/Vercel/otro), citas por corredor de viaje |
| `TODO(E5-followup)` | 3 | Esperan que exista un tipo de evento `pet_acquired` |
| `TODO(F2-prov-ba-v2)` | 3 | Export PPP de Prov. BA diferido hasta reglamentación municipal de Ley 14.107 |
| `TODO(eno)` / `TODO(authority-integration)` | 2 | Integración con canales oficiales — mismo bloqueo que el outbox |
| `operator-vocabulary.ts` | 3 | No son deuda: son instrucciones de cómo agregar una entrada nueva |
| Falso positivo | 1 | `event-capture-matcher.ts:446` dice "el cuerpo de la nota es TODO el texto" — el "todo" español, no un marcador |

**Conclusión**: no hay TODO huérfano ni sin dueño. La deuda real de este
proyecto no vive en los comentarios del código — vive en los documentos, que es
lo que este barrido terminó de confirmar.

## Decisiones del PO — 2026-08-04

- **Walk-in de Atender**: el evento entra, marcado con provenance de walk-in no
  verificado, y el dueño recibe aviso inmediato. La irreversibilidad se acepta;
  la irreversibilidad **silenciosa** no.
- **Migración 0156 (comentario de rollback falso)**: se corrige **fuera del
  archivo**. El ledger guarda sha256 de los bytes y `migrate.ts --strict` falla
  con deriva: no se edita una migración aplicada, ni sus comentarios.
- **`/gob` "métricas dentro de rango"**: estado honesto "sin medición
  suficiente". Calcular metas reales por jurisdicción es trabajo aparte y no
  bloquea sacar la afirmación falsa.
- **PRs**: cerradas las 30 ya absorbidas en `integration/all-20260703`
  (verificadas con `merge-base --is-ancestor` una por una). Quedan #760 (la
  rama viva), #762 (review slice, "do not merge") y #707 (docs, sin absorber).
- Y las doce decisiones de alcance de la corrida nocturna: ver
  `docs/plans/2026-08-04-plan-nocturno-TAREAS.md`.

### Ronda de decisiones de los barridos (2026-08-04, tarde)

- **D1 — origen de la transferencia al resolver disputa**: los titulares que el
  propio caso de uso cierra. **EJECUTADO**, commit `34f0fd60`.
- **D2 — contacto del denunciante**: lo ve **cualquier operador con alcance**
  (como hoy), y se **documenta**. Restringirlo al asignado rompe la derivación
  entre turnos y guardias, que es una necesidad operativa real. Lo que faltaba
  no era el candado sino que estuviera escrito.
- **D3 — provincia entera fuera de CABA: SE CONSTRUYE AHORA.** Extender el
  centinela `WHOLE_PROVINCE_LOCALITY` a cualquier provincia, no sólo CABA. (El
  default propuesto era postergarlo; el PO decidió adelantarlo.)
- **D4 — HEIC: SE TRANSCODIFICA EN EL SERVIDOR**, no se rechaza. (El default
  propuesto era rechazar; el PO eligió la solución de fondo.) **Consecuencia
  que queda registrada a propósito**: transcodificar necesita una librería de
  imágenes del lado servidor y pega contra el tamaño y el tiempo de ejecución
  de la función en Vercel, así que **no es un arreglo del día**. Hasta que
  salga, el GPS del domicilio de un denunciante anónimo **sigue viajando** en
  cada foto tomada con iPhone. La ventana de exposición está abierta y es
  conocida — no implícita.
- **D10 — nexo de bienestar cerrado**: el acceso de lectura a la mascota
  **expira con el caso**. El fundamento era el caso; cerrado el caso,
  desaparece el fundamento (principio de finalidad, Ley 25.326).
- **Email de adopciones (COPY-2)**: **se le muestra el email del postulante al
  refugio**. El dato ya existe en el perfil; es cablear lo construido y deja la
  copy verdadera sin tocarla.
- **CSS-8 deja de estar gateada**: el PO verificó que `/gob/perdidas` con el
  filtro "todas" **lista efectivamente las 500 filas**. Ya no es un techo
  teórico: son 500 tarjetas multi-elemento maquetadas y pintadas de una, sin
  virtualización en el repo. Se saca el "medir primero".

Las seis decisiones restantes (D5 a D9, D11) se ejecutan con el default
propuesto salvo aviso: reconfirmar KA1/KA2 como riesgo aceptado, sumar KA4 al
documento de limitaciones, ocultar Parquet, mantener el "Sin datos suficientes"
honesto, mantener la ventana fija de 30 días ya rotulada, y dejar de recolectar
`share_telemetry` si no aparece un lector con sentido de producto.

## Pendiente de decisión del PO
- **El walk-in de Atender usa conocer el token del QR como prueba de consentimiento.** Cualquier organización con `event.write` puede escribir eventos permanentes e irreversibles sobre **cualquier mascota del país** desde una foto de la chapita. Es diseño, no bug.
- **`db/migrations/0156` tiene un comentario de rollback falso** sobre qué contenía la 0150 (dice "antes de travel_corridor_requirements"; la 0150 ya lo incluía, y los conteos dicen 11/12 donde son 10/11). Las migraciones son inmutables **incluidos sus comentarios**: migración nueva que lo aclare, aceptarlo como inexactitud histórica, o excepción puntual.
- **`/gob` dice "las métricas con meta están dentro de rango"** cuando no se midió nada.
- Ratificación acumulada: R1-R10, N1-N4, y las de esta corrida.
