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

## 🔴 P1 — rompe algo para un usuario, sin cola

| # | Qué | Dónde |
|---|---|---|
| **RA-2 F4** | Firmar un chip distinto al canónico **deja el canónico intacto en silencio**: la espina guarda el chip B verificado, la ficha sigue mostrando el A, sin aviso | `microchip-use-case.ts:124`, `events-repository.ts:197` |
| **RA-2 F5** | `replaceMicrochipVetAction` sigue usando el `redirect()` dentro de la acción que el resto migró, con comentario explicando por qué | `microchip/reemplazar/action.ts:118` |
| **RA-2 F9** | Un `org.transfer.propose` concedido es **inerte**: la página chequea rol de membresía, nunca capacidades — y el mensaje "Solo roles admin o coordinator" es **falso** | `transferencias/nueva/page.tsx:52-53` |
| **RA-2 F10** | "Enviar documentación" apunta a una página sin nada que enviar; `done: input.isVerified` **nunca puede darse vuelta desde adentro de la org** | `org-setup-checklist.ts:120-127` |
| **RA-7 F4** | Un cambio de nivel fallido **vacía el canvas, pone los contadores en cero y no marca `degraded`** → la pantalla dice "sin datos" donde su propio docblock **prohíbe** ese texto y exige "no pudimos calcular esta capa a tiempo" | `PanoramaConsole.tsx:1967-1978`, `:2013-2023` |

---

## 🟠 P2 — el gate miente

### Los fences más angostos que su propia doctrina
| # | Qué |
|---|---|
| **RA-8 estructural** | **10 archivos `"use server"` invisibles a los tres linters de authz** (el glob es plano). Incluye 8 acciones de escritura médica en atender y tres exports sin guard |
| **RA-8 estructural** | `check-authz-scoping` **se derrota con un comentario** — la palabra "jurisdiction" en cualquier parte del cuerpo cuenta como prueba. Baseline: 41 acciones tenant-guarded pero sin scopear |
| **RA-8 estructural** | `check-rls-coverage` solo verifica que **exista** una política, nunca su contenido, roles, cláusula `TO` ni GRANTs. Por eso R1 pasó limpio con tres políticas |
| **RA-8 estructural** | **8 políticas sin cláusula `TO`** → caen a `PUBLIC` (incluye anon). Hoy son seguras por accidente, vía predicados `auth.uid()`, no por diseño |
| **RA-8 estructural** | `middleware.ts` **no hace autorización**. Cada ruta se auto-gatea, sin red de seguridad |
| **RA-2 F16** | `lint:nav` prohíbe **solo `router.refresh(`** mientras su docblock nombra push/replace. **20 sitios vivos** |
| **RA-2 F15** | El fence N3 reporta **cero deuda falsamente** — 8 `redirect()` en módulos de caso de uso, fuera de sus dos globs |
| **NUEVO 31/07** | **Cuatro fences `.ts` cargan su propia copia byte-idéntica de `stripComments`.** Ya existe el módulo compartido (`scripts/lib/strip-comments.mjs`) y `tsx` resuelve `.mjs` desde `.ts` sin ceremonia. Migrarlos |

### Tests que no guardan nada
| # | Qué |
|---|---|
| **E2E no es un gate — 33 ubicaciones rojas** | Medido 31/07 comparando dos corridas: **antes de esta ola ya había 30**, incluidas las dos de `cross-tenant-isolation`. No es una regresión nuestra: es que **el gate de e2e hace meses que no dice nada**. Mientras siga así, "CI verde" significa "CI menos e2e" |
| **El presupuesto de login POR EMAIL** | La causa de 9 de las rojas nuevas (`synthetic-monitor`): `login refused for owner@dim.test`. El workaround de `x-real-ip` en `demo/_helpers.ts:166` cubre el presupuesto **por IP** y su propio comentario aclara que el **por email** (5/min, 20/hora, indexado por la dirección) queda afuera. ~20 specs comparten las mismas cuentas semilla. Jubilar `final-seams` corrió el scheduling y varios cayeron en la misma ventana. Opciones: cuenta por spec, subir el tope en entorno de test, o serializar |
| **E2E `a11y-operator-auth`** | Dos tests describen una **IA retirada**, mismo patrón que `owner-shell`: esperan que un operador sin permisos caiga en `/` y en `/mis-mascotas`, y cae en `/mis-mascotas/DIM-…` y en `/acceso-denegado`. **Rojos en CI desde antes de esta ola** — hay que decidir cuál es el destino correcto y después arreglar el test |
| **E2E `crisis-seams` (d)** | La adopción no transfiere fuera de la custodia del refugio, o el test no lo ve. Rojo en CI desde antes de esta ola |
| **`PanoramaConsole` "finding 1"** | `waitFor` con el presupuesto por defecto de 1s; en CI tardó 1541 ms y se pasó. **47 `waitFor` sin timeout explícito en ese archivo.** No subir uno suelto: o se decide un presupuesto para el archivo, o se acepta el flake declarado |
| **RA-4 F8** | Un test de scope de gobierno que **nunca ejecutó una aserción** desde que se escribió: el primer test del archivo deja al usuario en un estado que hace fallar su `submit`, y el `if (!submit.ok) return` se traga todo |
| **RA-4 F9** | Un guard cross-org que **nunca llama a la acción que guarda** — la aserción de cierre es tautológica por construcción |
| **RA-4 F5-F7** | El `pet-carousel-dots` muerto, el chequeo de "cero disfrazado de supresión" que nunca inspecciona un numérico, y warn-and-skip en tests de constraint |
| **RA-9 EI-4/5/6** | Dos gates de axe que se auto-jubilan con `test.skip` sobre data vacía (uno es el "momento héroe", Ley 26.653) · `qa-panorama-a11y.ts` es un generador de reportes vendido como gate (no lo cita nadie) · dos aserciones de touch-target que matchean el documento entero |
| **RA-7 F8** | `cube-parity` es **vacuo justo donde importa**: a grano provincia compara literales contra literales; a grano nacional el loop de valores saltea toda celda suprimida |
| **P2.8** | `rls/matrix` tiene guards por celda que lanzan, pero el patrón hermano sigue vivo en **13 tests de aislamiento cross-tenant** |
| **P2.5** | `owner-ia-p6` 1/2/10 y `synthetic` (c)/(d) trabados en skeletons de Suspense pasado el presupuesto de 8s |

---

## 🟡 P3 — el panorama contándose distinto a sí mismo

| # | Qué |
|---|---|
| **RA-7 F5** | Dice **"se midieron 10 jurisdicciones"** cuando midió 24 — un tope de display reportado como conteo de medición |
| **RA-7 F6** | **Cuatro respuestas distintas** a "cuántas celdas están protegidas", todas pudiendo estar en pantalla a la vez (píldora, pie del PNG, caption de Registros, línea del ranking) |
| **RA-7 F7** | Un sello de cubo en **cualquier** capa se traga el aviso de tope de **todas** las otras |
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
| **P2.6** | El worker de Windows (`0xC0000409`). **No bloquea** — no reproduce en Linux |
| **P2.7** | El limpiador de huérfanos cubre 4 de ~20 prefijos. Propuesta escrita, **sin implementar a propósito**: cambia un script que BORRA |
| **P3.2** | `jurisdictionProvince` sin `z.enum` → error crudo de Postgres al usuario |
| **P3.3** | El aviso de capa desconocida enterrado en un dock colapsado. `PanoramaConsole.tsx` está en su fence |

---

## Decisiones del PO ya tomadas sobre esta cola
- **`/gob/perdidas`**: la supresión **queda**. Des-suprimir después es una línea; shipear el tier desnudo no es reversible.
- **Primer admin**: al backlog. No bloquea hasta provisionar un municipio real.
- **Deuda estética**: **el fence primero**, después el codemod. (Fence hecho.)
- **Las 7 barreras de a11y**: todas ahora. (Hechas.)
- **`final-seams`**: investigar los 4 antes de decidir. (Hecho: ninguno era defecto de producto, spec jubilada, y la única cobertura que se pierde quedó escrita en el header de `crisis-seams`.)

## Pendiente de decisión del PO
- **El walk-in de Atender usa conocer el token del QR como prueba de consentimiento.** Cualquier organización con `event.write` puede escribir eventos permanentes e irreversibles sobre **cualquier mascota del país** desde una foto de la chapita. Es diseño, no bug.
- **`db/migrations/0156` tiene un comentario de rollback falso** sobre qué contenía la 0150 (dice "antes de travel_corridor_requirements"; la 0150 ya lo incluía, y los conteos dicen 11/12 donde son 10/11). Las migraciones son inmutables **incluidos sus comentarios**: migración nueva que lo aclare, aceptarlo como inexactitud histórica, o excepción puntual.
- **`/gob` dice "las métricas con meta están dentro de rango"** cuando no se midió nada.
- Ratificación acumulada: R1-R10, N1-N4, y las de esta corrida.
