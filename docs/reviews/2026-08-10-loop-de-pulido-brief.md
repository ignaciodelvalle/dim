# Loop de pulido pre-Cowork — brief de la mañana

**Corrida autónoma del 2026-08-09 (noche) al 2026-08-10.** 35 commits desde `6e9eb29b`.
Seis reviews adversarias de contexto fresco, un fence nuevo, un test nuevo, una migración.

---

> **Adenda — las cuatro decisiones se tomaron y se ejecutaron el 2026-08-10.**
> D2 (secuenciar los proyectos de vitest), D3 (`/gob/observaciones`), D4 (la
> deriva del padrón: era omisión del seed) y E-3 (el orden del hero: paga
> desktop) están cerradas, con el gate verde encima: **1227 archivos, 14792
> tests, exit 0**. Queda D1 — aplicar la migración `0171` — que es tuya, y E-2
> (el radio de chip), que sigue siendo decisión de diseño. Lo que sigue abajo es
> el registro de por qué se decidieron así.

## 1. Lo que depende de vos

### D1 — Aplicar la migración `0171_avatars_bucket.sql` · **recomendada: sí, ya**

Subir la foto de perfil desde `/cuenta/editar` **nunca funcionó, para ningún usuario**: el bucket `avatars` no existe ni en local ni en staging. La migración lo crea privado con políticas por dueño. Escribir la migración es trabajo mío; aplicarla en remoto es tuyo.

> Lo que vale releer: el docstring del use-case dice *"If bucket is missing, uploadAvatarForUser fails gracefully"*. El autor **anticipó** el bucket faltante y construyó la degradación. Nadie creó el bucket, así que el camino degradado quedó como el único, y la falla fue silenciosa por diseño.

### D2 — Los proyectos de vitest corren en paralelo contra una posta serial

El rojo del `PanoramaConsole` no era flake: el proyecto `db` **solo** pasa entero (686 archivos, 6985 tests), y falla 2 de 2 en corrida completa. El proyecto `unit` corre en paralelo y satura la máquina mientras `db` tiene la posta. Puse una mitigación de 30s y lo dejé documentado con el bisect.

| Opción | Qué gana | Qué cuesta |
|---|---|---|
| **Secuenciar los proyectos** *(recomendada)* | El rojo desaparece de raíz; `db` obtiene el aislamiento que ya declaró querer | Más tiempo total de suite |
| Dejar la mitigación | Cero trabajo | El próximo que lo vea rojo va a subir el timeout una cuarta vez |

### D3 — `/gob/acciones` manda al funcionario a una pared

El botón "Cerrar" de una observación antirrábica emite `/admin/observaciones/...`. La **página** admite rol gobierno; el **layout de `/admin`** exige admin y lo rebota a la home antes de que la página corra. No existe `/gob/observaciones`.

| Opción | |
|---|---|
| **Crear `/gob/observaciones`** *(recomendada)* | Es la superficie que falta; el trabajo real es el layout, la página ya permite govt |
| Que el worklist no emita ese href para govt | Una línea, pero le saca al funcionario una acción que sí le corresponde |

Por ahora quedó **escrito en el brief de Cowork** (hito L5b) para que lo reporte como defecto del producto y no como error suyo.

### D4 — La deriva de caché del padrón

**2.733 mascotas (8,4%) tienen `death_recorded` en la espina y `status='active'` en la caché.** Vienen del seed `panorama-hist`. Dos consecuencias:

- El test de deriva escanea sólo tokens `DIM-%` — **43 de 32.430**. La clase excluida es exactamente la que deriva.
- El coropleta de mortalidad lee la caché (**352**) y la línea de tiempo de la misma pantalla lee la espina (**3.946**). Factor 10, misma etiqueta.

Necesito tu decisión sobre si los 2.733 son **intención del seed** o **omisión**: `scripts/seed-panorama.ts` dual-escribe en un camino (`:1955`) y no en otros (`:2131`, `:2222`). Según cuál sea, el arreglo es el seed o es el detector.

### D5 — Alcance del resto

Quedan **~40 hallazgos verificados sin arreglar** (sección 3). Ninguno bloquea a Cowork. Decime si querés que siga por el loop o que pare acá y larguemos el test.

---

## 2. Lo arreglado

### Bloqueaban a Cowork

| # | Qué estaba roto | Evidencia |
|---|---|---|
| 1 | **Ningún decomiso podía ejecutarse jamás.** `ATTACHMENT_BUCKET` apuntaba a `pet-attachments`, bucket inexistente en local **y** staging. La evidencia se sube antes de la transacción y es requisito duro server-side | El string aparecía en **un** lugar de todo el repo: la constante. Las 408 filas del seed las escribió un script, salteando la acción |
| 2 | **Los cuatro drivers de navegador no podían ni loguearse.** El botón "Mostrar contraseña" comparte el `aria-label` con el campo → strict-mode violation | `qa-vis`, `qa-panorama-vis`, `qa-panorama-chaos`, `report-panorama-a11y`. Nadie los había corrido desde que el toggle aterrizó |
| 3 | **V1 no lo podía ejecutar nadie.** Mi corrección de ayer (prohibirle a Alejo atender) chocó con que `appointment.manage` no está en las capacidades implícitas del vet | Se convirtió en dos hitos nuevos (V0/A-0) sobre el flujo de permisos, que no tenía ninguno |
| 4 | **La cuenta del funcionario estaba mal.** El brief decía `govt-local@`, que no cubre Recoleta. Lucas real es `lucas@` con cinco localidades de CABA | Verificado contra la base de staging |

### El fence nuevo, y los seis gemelos que encontró

`scripts/check-degraded-chrome.ts` — el blind spot que el repo confesaba por escrito. Diez pantallas se habían arreglado **a mano** el 9/8; el detector encontró **seis más** que ese barrido se salteó, todas la misma forma: un `OpFilterBar` que no depende de nada, tirado al degradar.

`/gob` · `/gob/analytics` · `/gob/vigilancia` · `/admin/censo` · `/admin/poblacion` · `/admin/programa` — más una séptima que el prototipo no vio: `/cuenta` perdía su `<h1>`.

Ancla en el binding del wrapper de presupuesto (no en el fallback), análisis de taint para distinguir ausencia legítima de bug, baseline de triples `(archivo, componente, chrome)` en vez de conteo, y piso duro de 25 ramas. **El piso atrapó un bug mío en la primera corrida.**

### Los fences que declaraban menos de lo que prometían

Seis más, sobre los cinco de ayer:

- **`check-ui-invariants`, regla de acentos** — el peor. `isCodeOnlyLine` descartaba la **línea entera** al ver `className=`. En un codebase Tailwind eso es **32,4% de las líneas .tsx**, sesgado exactamente hacia las que llevan copy. Había una instancia viva en `/gob/disputas` mientras el fence imprimía "accents OK". Con la red más ancha entran 37 sustantivos y adjetivos nuevos.
- **`check-authz-guards`** — el de mayor blast radius, probaba `fn.body` **crudo**: un guard nombrado en un comentario contaba como llamada.
- **`check-atender-owner-alerts`** — promete atrapar al writer de walk-in "se llame como se llame"; matcheaba una sola forma de declaración.
- **`check-db-budget`** — `stripNonCode` no tokenizaba literales regex (10 archivos rotos → 0), y el discovery ignoraba `Promise.allSettled`, que es lo que la convención del propio repo prescribe.
- **`check-view-scope`** — podía pasar en verde habiendo escaneado cero archivos.
- **`RAW_BUTTON_BASELINE`** decía 47 y la cuenta real era 25: **22 botones crudos de margen**, y el test era lo que protegía el hueco.

### Defectos de producto

- **El diputado confundido que el fence no podía ver.** `requestCapabilityAction` resolvía la organización por la membresía por defecto de la sesión, ignorando la URL. Un miembro de dos orgs, parado en `/org/{A}`, solicitaba contra `{B}` sin señal visible. Lo interesante es **por qué el fence no lo veía**: decide si una acción es org-scoped buscando un token en la firma, y esta no lo tenía — abandonar el contexto por completo la hacía **más** invisible que hilvanarlo mal. Y no era hipotético: el admin del elenco pertenece a **cuatro** organizaciones, y el hito A-0 que escribí anoche le pide aprobar un permiso justo desde ahí.
- **El bug de género más público del producto.** `generateMetadata` de `/p/[publicToken]` decía *"está perdida. Si la viste"* para **toda** mascota extraviada — el query ni siquiera seleccionaba `sex`. Es la tarjeta que publican WhatsApp y Google: el cartel de "se busca" de un perro macho salía en femenino en el único lugar donde más gente lo ve.

- **La vacuna se firmaba como profesional sin matrícula.** `attendance.ts` derivaba la procedencia del rol de membresía y del flag `verified` de la **organización**. Un voluntario en un refugio verificado producía `institutional_verified` — el tier más alto — sin matrícula en ninguna parte. Limpiaba el gate oficial de "al día", cuya propia copy promete lo contrario.
- **Retirar una disputa no tomaba el `FOR UPDATE`** que su gemelo sí toma. Lost update sobre titularidad: el expediente terminaba diciendo "Retirada — sin resolución" sobre un animal que cambió de dueño.
- **La notificación urgente al ex-dueño de un decomiso apuntaba a un 404.** `canReadCase` exige una ownership viva y el paso anterior acababa de cerrarla.
- **Tres degradados** dejaban al usuario sin salida (`/gob/reglas` sin título, `/mis-mascotas` sin buscador ni CTA, `/org/.../mascotas` sin filtros).
- **Cuatro acentos** en superficie de gobierno, tres invisibles para el fence hasta ensancharlo.
- **El censo de organización** escribía "Otros" con el diccionario diciendo "Otras".

### El plan de pruebas

Seis hitos que el producto **no podía satisfacer** (atender-es-firmar, documento de viaje inexistente, devolver-adopción del lado equivocado, decomiso sin rol, métrica de alerta que no existe, observación sin botón de inicio), más una precondición que bloqueaba una línea entera (nadie tiene DNI verificado). Y el contrato de reporte: URL, hora, y separación OBSERVACIÓN/HIPÓTESIS/SUGERENCIA — la corrida anterior emitió cuatro hallazgos con buena observación y causa equivocada.

---

## 3. Detectado y **sin** arreglar

Ordenado por severidad. Nada de esto bloquea a Cowork.

### ALTA

| Dónde | Qué |
|---|---|
| `cron-dispatcher` | Los jobs #2 y #3 declaran 45s cada uno contra un presupuesto de 55s y un lambda de 60s. Un kill por timeout no es excepción de JS: la fila queda en `running` para siempre. Los jobs 3-22 nunca corren ni se marcan como salteados — incluidos la purga de retención (#20) y el propio monitor de la flota (#22), que se starvea a sí mismo |
| Notificaciones | **98,4%** son best-effort post-transacción con `catch` que sólo loguea. No hay ningún job que compare hechos contra notificaciones: "el hecho existe y el aviso no" no lo descubre nadie |
| `check-authz-guards` | No puede ver los **33 `route.ts`** (descubre por `"use server"`). Instancia viva: `libreta-export/route.ts` no chequea `deletedAt`, así que un titular que ejerció supresión ARCO sigue pudiendo bajar el PDF completo |
| Decomiso | Reasignar a otro refugio **inutiliza permanentemente** la aceptación: inserta una segunda propuesta sobre el mismo caso, y el validador trata esa forma como corrupción. El cron modela la misma forma como estado normal |
| Turnos | Atender **no notifica al dueño**. El gemelo walk-in sí lo hace desde el 16/7 |
| Panorama | El sello de frescura del cubo llega a **un** componente, dentro de un panel que hay que abrir. El PNG y el informe imprimen "Datos al {hoy}" sobre un cubo de ayer |
| Panorama | La defensa contra diferenciación temporal (`suppressDelta`) existe y tiene **un solo consumidor**. Pedir ene–dic y jul–dic recupera ene–jun, un número que k=5 nunca mostró |
| Geo | **Almirante Brown (BA)** tiene polígono y cero localidades: el cuarto partido del GBA se pinta permanentemente como "Sin datos" |
| `decideCapabilityAction` | El gemelo del diputado que sí arreglé: mismo patrón de sesión-default. Sin escalada (el use-case falla cerrado) pero un admin multi-org que abra permisos de una org que no es su default **no puede decidir nada**, y auditoría y notificaciones quedan atadas a la org equivocada |
| 3 pantallas de operador | `admin/casos`, `admin/historial/ActividadScreen` y `gob/historial` **no tienen wrapper de presupuesto**, así que tampoco tienen rama degradada. No pierden la barra de filtros: pierden la página entera, con el skeleton colgado. Es peor que el defecto para el que construí el fence — y el fence sale verde porque una página sin wrapper no tiene nada que juzgar |
| Exports | 7 rutas de export, **2 acotadas**. Las cinco restantes corren los mismos agregados desde el mismo botón |
| Portal `/org` | 47 puntos de entrada, **3 acotados**. El peor: el detalle de mascota con 11 awaits pesados |
| `generatePppExportAction` | Capacidad completa y **cero entrada**: genera el PDF RUPPPA CABA (Ley 5470), lo firma y lo audita. Ningún componente la invoca. `AGENTS.md` la describe como placeholder — la descripción es falsa en la dirección peligrosa |
| `SuccessScreen` | Falta en 4 trámites de peso: aceptar transferencia de custodia, decidir postulación de adopción, aceptar devolución y crear un decomiso (que tiene el `publicCode` y lo tira a la URL) |
| CTAs desnudos | «Aceptar» y «Rechazar» solos en 7 pares de decisión — «Aceptar» es literalmente el ejemplo prohibido en `AGENTS.md` |
| Género | 5 lugares más: el share de WhatsApp del wizard de perdida, "Marcar como encontrada" ×4 en la sheet, los dos gemelos de match de intake, y el `alt` de Pampa en la landing |

### MEDIA

Import CSV: si una tanda lanza, el wizard queda colgado para siempre y se pierde el reporte de lo ya escrito · `validateIntakeCsvAction` emite hasta 400 consultas secuenciales sin presupuesto · Borrar una regla de agenda no toca los cupos ya materializados: 60 días siguen reservables · El QR de check-in codifica un esquema que nadie registra y el código de respaldo no lo acepta ninguna pantalla · `app/org/[orgToken]/layout.tsx` tiene tres `await` sin deadline antes del bloque acotado · Doble submit del decomiso "animal sin registrar" crea dos animales · Enums crudos en inglés en el expediente de disputa, y la notificación al ciudadano dice "Resolución: case_dismissed" · Retirar una disputa no notifica a nadie · 14 etiquetas de departamento caen fuera de su polígono (La Plata, 15,5 km) teniendo el arreglo ya en el repo · `k=5` está tipeado tres veces sin fence · ARCO no borra Storage ni redacta `audit_log` · `/org/**` no tiene ningún mecanismo de frescura.

### BAJA

El reporte de import miente "Importada" en una re-corrida · La ruta de vet independiente es inalcanzable pero cinco superficies la renderizan · `MapDataTable` no es alcanzable por teclado — y es el equivalente accesible del mapa · `db:doctor` no corre en ningún gate · La forma del token público sólo la sostiene la convención.

### Lo que el test de Cowork seguiría sin probar

`/libreta/compartir/[shareToken]` (share revocable, cero hitos — si el revoke no revoca es fuga de PII con link vivo) · publicar un servicio y definir agenda (declarado "ya hecho" porque los **datos** se sembraron, no porque la pantalla se haya usado) · `/gob/disputas` · el flujo de permisos de organización · `/mudanza` · imprimir el cartel de perdido · moderación · **accesibilidad completa** (teclado, contraste, PDF) · **viewport móvil, que el brief no menciona ni una vez**.

---

## 4. Estado del gate y del entorno

**Gate verde de punta a punta**, corrida final:

```
Test Files  1226 passed | 1 skipped (1227)
     Tests  14791 passed | 15 skipped | 5 todo (14811)
reported 1227 file(s); 1227 discovered; 0 failing test(s)
every test file ran, nothing failed.
GATE_EXIT=0
```

El conteo de archivos importa tanto como el de tests: el runner arreglado el 09/08 es lo que hace verificable que **corrieron los 1227** y no una fracción.

**Árbol limpio**, sin archivos sueltos. **19 commits sin pushear** — el push quedó bloqueado por el clasificador de permisos, hay que correrlo a mano.

**Staging** (deploy anterior, sin los 19 commits): raíz, credencial de Pampa, `/perdidas` y `/adoptar` en 200; los chunks de la home resuelven 200 (no es un build podrido); **1752 turnos reservables futuros**. El elenco de siete cuentas verificado: existen, confirmadas, sin bloqueos, `Test1234!` entra en todas.

**Lo que falta para que staging refleje esta noche**: `git push` y el deploy. Ojo con `deploy:staging` — ahora corre `pnpm verify` entero (antes corría 1 de 49 fences), así que tarda más y es a propósito.

---

## 5. Lo que NO se ejecutó, y por qué

- **#41 y Lote E** quedaron **diseñados y refutados**, con sus números medidos, en `docs/plans/PENDIENTES.md`. Los dos volvieron de la refutación con el trabajo *cambiado*, no confirmado: #41 resultó ser una sola acción (la nota) en vez de tres, porque el kind al que iban escalar y cerrar tiene cero filas; y Lote E cambió de instrumento, porque INP no es reproducible entre corridas y una reja que oscila entrena a todos a ignorarla. Ejecutar cualquiera de los dos a las 6 de la mañana, desde un diseño que su propio escéptico marcó como bloqueante, habría sido exactamente el error que este loop existe para no cometer.
- **El HEIC (D4)** sigue diferido por decisión previa. Es el único ítem abierto con consecuencia de privacidad viva.
- **Cuatro reviews quedaron sin triage completo** de sus hallazgos MEDIA y BAJA: están enumerados en la sección 3 y en la cola, pero no los verifiqué uno por uno. Todo lo de la sección 2 sí lo verifiqué o lo refuté antes de tocarlo.
