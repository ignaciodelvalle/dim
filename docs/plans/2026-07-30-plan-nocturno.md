# Plan de ejecución nocturno — 2026-07-30

> **Este archivo es el estado, no el contexto del agente.** Todo lo necesario
> para retomar en frío está acá. Cada unidad se cierra sola: tests dirigidos
> durante, gate completo por BATCH de 3-4 unidades, un commit por unidad.
> Una unidad que falla NO bloquea las siguientes.
>
> **CERO decisiones intermedias del PO.** Toda ambigüedad se resuelve así:
> (1) si hay decisión PO previa o precedente en el repo, se aplica; (2) si las
> opciones son equivalentes, el agente decide y DOCUMENTA; (3) si es visible
> de producto, se implementa la lectura recomendada, se deja evidencia
> (captura/diff), y va a la LISTA DE RATIFICACIÓN del final. Nunca se frena.

## Decisiones PO ya tomadas (no re-preguntar NADA de esto)

| Tema | Decisión |
|---|---|
| D.3 canon | Verbo del acto en el botón, NUNCA "Confirmar". Fricción por CONSECUENCIA: irreversible/peso legal → modal con consecuencia explicitada; reversible → inline con verbo |
| Pasada 703 | UNA pasada completa: codemod a utilidades nombradas + capturas antes/después POR superficie + suite. Un commit |
| D.8 slot 0 mascotas | Reetiquetar a "Cargar mascota" → `/mis-mascotas/nueva`; con ≥1 vuelve a "Asentar". Señal de conteo SIN query nueva por página |
| Copy credencial | "Inscripto/a" → "Registrado/a" (helpers sex-correct de `StatusFlag.tsx`) |
| D.4 anatomía | El agente elige POR MEDICIÓN (la dominante de las 5) y aplica. Ratificación al final |
| Cancelar-saliente | YA EXISTE (`AcceptTransferActions.tsx:156`). NO tocar. La decisión de "construirlo" fue anulada por premisa falsa |
| D7 cutover | TODO el backlog gatea. Al cerrar la tabla, PROPONER fecha |

## Entorno (verificado 2026-07-30 — no re-diagnosticar)

- **`:3000` está tomado por un zombi inmatable** (otro contexto de seguridad,
  `taskkill` → Access denied). TODO en `:3001`.
- Bootstrap: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/qa-up.ps1 -Port 3001`
  — el guard ahora verifica servido==disco DESPUÉS de arrancar y falla con PID.
- **Orden sagrado**: matar servidor → `pnpm build` → `qa-up` → guard verde → recién ahí medir.
- Antes de CUALQUIER medición en navegador: chequear que el chunk `webpack-*`
  servido coincida con `.next/static/chunks/`. Si no coincide, NO medir.
- DB scripts: `node --conditions=react-server --import tsx scripts/<x>.ts`.
- cursor-agent: `C:\Users\ignac\AppData\Local\cursor-agent\cursor-agent.cmd -p --output-format text`,
  capturar salida completa (nunca `| tail`).

## Reglas de la corrida (todas ya pagadas con sangre)

1. `pnpm biome check --write` SIEMPRE antes de verify. Gate por batch de 3-4.
2. Fallo de e2e → **abrir la captura de Playwright ANTES de hipotetizar**.
3. Mutación para probar dientes → `grep`/Edit para VERIFICAR que aplicó, sobre
   el elemento correcto (no contar prosa/comentarios).
4. **Un grep que dice "no existe" sobre algo que una pantalla afirma → desconfiar
   del grep** (3 casos: case-insensitive, glob, `cancelPetTransferAction`).
5. Fence de tamaño de archivo → SIEMPRE partir, nunca re-baselinear.
6. Tailwind: `text-[var(--text-*)]` es un font-size MUERTO (compila a color).
   Utilidades nombradas siempre. La regla 9 lo cerca.
7. Código de privacidad a medias es peor que ninguno: si una unidad de
   privacidad no cierra entera (datos+render+leyenda+tests), se revierte y se
   documenta.
8. Cambios visuales: verificar en PÍXELES computados (el gate es ciego a CSS
   que no aplica).
9. Suite en background sin `| tail`; el exit code MIENTE (crash intermitente) —
   leer conteos. `cube-parity` nunca concurrente.
10. Hijos en background: pollear dentro del propio turno, siempre.
11. Actualizar la tabla de estado de ESTE archivo al cerrar cada unidad.

## BLOQUE A — sin servidor (barato, primero)

### A1. Exit-1 / CI rojo — TIMEBOX 60 min duro
Identidad conocida: `ReferenceError: window is not defined`, react-dom
scheduler (`performWorkUntilDeadline`, un Immediate) post-teardown de jsdom.
Local mata al worker; en CI sale como uncaught. Cazar el test que renderiza y
termina sin drenar: instrumentar `process.on('uncaughtException')` en setup con
dump del archivo actual, correr el proyecto db (donde crashea). Si a los 60 min
no está identificado: documentar lo descartado y SEGUIR. Es gate de cutover
pero no de esta noche.

### A2. #40 k-anon provincia — handover completo en el plan del 29 (§#40)
Mapa exacto ahí: 9 sitios, denominadores por loader, las 5 trampas. Resumen:
- Helper `provinceCell(code, label, value, denominator)` — denominador
  OBLIGATORIO en la firma; k=5 de `suppressSmallCells` (`lib/metrics/anonymity.ts`).
- `value: number | null` en cell y props; suprimida publica `value: null`.
- Tendencia (L886): hoy DESAPARECE la celda → pasa a suprimida-rayada.
- Índice territorial (L1099): SIN denominador real → se excluye con comentario
  que declara la brecha. NO adivinar.
- `lib/open-data/datasets.ts:354`: verificar su supresión propia y ALINEAR
  (misma k, mismo criterio de denominador). El dataset público no publica
  celdas suprimidas.
- Render: hachurado para provincia suprimida (precedente:
  `applyProvinceBivariateSuppression`, SituationalMap). **Excluir suprimidas
  del complemento del puntillado de D.5(b)** (`provinceNoDataFilter` debe
  tratar suppressed como "conocida"). Leyenda: `MapLegends` gana la fila
  k-anon en provincias (hoy la omite con comentario que dejará de ser cierto).
- `get-panorama-kpis.ts:628` null-guard. 21 errores de tipo esperados = la
  lista de sitios. Tests con mutación verificada.
- La verificación VISUAL del hachurado va al Bloque C (una sola reconstrucción).

### A3. D.3 — gramática de confirmación (canon decidido)
1. Inventariar: `ConfirmDialog` + botones inline "Confirmar" en gob/admin/org
   (las 6 gramáticas de la review + los 2 caminos sin confirmación).
2. Clasificar cada acto: irreversible/legal (cerrar denuncia 14.346, decomisos,
   custodia, reasignaciones) → modal con consecuencia; reversible → inline verbo.
3. Aplicar. La tabla acto→clase→gramática queda EN ESTE ARCHIVO como registro.
4. Tests existentes de esas pantallas + mutación en al menos 2.

### A4. Copy "Registrado/a" (chico)
`rg -n 'Inscripto'` — cambiar con los helpers sex-correct. Verificar contra
`situationLabelForSex`/`StatusFlag`. Tests que pinneen el literal: actualizar.

### A5. D.4 — anatomía de chips POR MEDICIÓN
Inventariar las 5 anatomías en las 6 colas (ubicación de conteo, formato de
fecha, tratamiento de estado, código). La dominante por frecuencia GANA.
Aplicar a las otras. Tabla de medición en este archivo. Ratificación al final.

## A1 — cerrada: el exit-1 era `use-asof-frame.test.tsx` (commit `e730e4e2`)

**La lección de método, antes que el bug**: no hizo falta instrumentar nada.
`gh run view 30456376263 --log-failed` **nombra el archivo** en la sección
"Unhandled Errors". Solo esa corrida lo trae (30511306621, 30453540123 y
30451219894 no). Próxima caza de un uncaught en CI: leer el log fallado PRIMERO.

**Mecanismo** (leído de react-dom, no adivinado): `react-dom-client.development.js:17920`
es literalmente `schedulerEvent = window.event;`, la primera sentencia del
callback que React encola para flushear **passive effects** tras un commit. El
test montaba con `renderHook` y nunca desmontaba; dos tests afirmaban sobre
observables INTERMEDIOS y volvían con el fan-out en vuelo. El `.then()` corría
post-test sobre un root vivo → commit → flush encolado en `setImmediate`. Con
`fileParallelism:false` ese Immediate cae después del teardown de jsdom del
archivo. Local mata el worker ("Worker exited unexpectedly"); en CI sale como
"1 error", exit 1 y **cero tests fallando** — por eso costaba tanto verlo.

### La causa sistémica — MÁS GRANDE que este archivo, NO arreglada

`vitest.config.ts` **no setea `globals: true`**, y RTL instala su auto-cleanup
solo si existe un `afterEach` global. Por lo tanto **ningún test con RTL en este
repo limpia automáticamente**. Medido: 114 archivos usan RTL; en el proyecto
`db` son 45, de los cuales 33 llaman `cleanup()` a mano y **12 no**.
`use-asof-frame` era el único `renderHook` ASÍNCRONO del proyecto db — por eso
fue el único que detonó. Los otros 11 son síncronos y hoy no muerden.

Los 12 sin cleanup: `login-form-field-state`, `signup-form-field-state`,
`MergedShareSheet`, `ContactarSheet`, `SerVoluntarioSheet`, `CasesPerCapitaTable`,
`RegionRankingTable`, `WelfareDenunciaRow`, `OutbreakSignalRow`, `KpiChips`,
`panorama-metrics-column`.

**Arreglo estructural pendiente**: `afterEach(cleanup)` guardado por
`typeof document !== "undefined"` en `__tests__/setup-env.ts`, o `globals: true`.
Cierra la clase entera de bug. NO se aplicó en caliente por riesgo cruzado con
los otros agentes: hay que correrlo en árbol limpio, porque puede destapar
tests que hoy dependen de DOM filtrado.

## A3 — tabla acto → clase → gramática (registro, decidida 2026-07-30)

Canon aplicado: **el botón lleva el VERBO DEL ACTO, nunca "Confirmar"** (ni
pelado ni como verbo líder de "Confirmar + sustantivo"). Fricción por
CONSECUENCIA: irreversible o con peso legal → modal que EXPLICITA la
consecuencia; reversible → inline con el verbo. El tier 2 existente
(motivo + evidencia + checkbox) es MÁS fricción que un modal: donde ya existe se
conserva y solo se revisa el label.

**Fence estructural**: `confirmLabel` deja de tener default `"Confirmar"` en
`ConfirmDialog` y pasa a ser OBLIGATORIO — el compilador enumera la superficie y
ningún call site futuro puede caer en el label genérico por omisión.

### Clase 1 — irreversible/legal SIN ninguna confirmación → agregar modal

| Acto | Trigger | Consecuencia a explicitar | Label nuevo |
|---|---|---|---|
| Resolver disputa de custodia | `app/gob/disputas/[disputeToken]/ResolveDisputeForm.tsx:240` | Cierra TODAS las ownerships activas y abre una nueva al destino | `Resolver disputa` |
| Cerrar tránsito (foster) | `.../foster-fin/EndFosterForm.tsx:68` | Queda como evento inmutable en el historial | `Cerrar tránsito` |
| Aceptar handoff de decomiso (14.346) | `.../recibidas/DecomisoHandoffActions.tsx:78` | Asume la custodia estatal; no se puede deshacer | `Aceptar custodia` |
| Rechazar handoff de decomiso (14.346) | `.../recibidas/DecomisoHandoffActions.tsx:115` | Devuelve el decomiso al organismo derivante | `Rechazar custodia` |

### Clase 2 — "Confirmar" pelado → verbo del acto (fricción actual correcta)

| Sitio | Label viejo | Label nuevo |
|---|---|---|
| `app/gob/moderacion/[id]/GovtModerationActions.tsx` | `Confirmar` | `Rechazar como abuso` |
| `app/admin/moderacion/[id]/ModerationActions.tsx` | `Confirmar` | por modo: `Marcar como spam` / `Marcar como válida` |
| `app/gob/maltrato/[id]/TriageActions.tsx` | `Confirmar` (5 modos) | verbo por modo (`Cerrar con resolución`, `Cerrar sin sustento`, …) |
| `.../vigilancia/investigaciones/[caseCode]/InvestigationActions.tsx` | `Confirmar` | por modo (`Agregar nota`, `Escalar`, `Cerrar investigación`) |
| `app/gob/suscripciones/DeleteAlertSubscriptionButton.tsx` | `Confirmar` | `Eliminar suscripción` |
| `.../adopciones/[appEventId]/ReviewButtons.tsx` | `Confirmar` (rechazo) | `Rechazar postulación` |
| `components/ui/dashboard/OpBulkBar.tsx` | `Confirmar` (fijo) | `confirmLabel` por acción, obligatorio |
| `.../admin/permisos/DecideForm.tsx` | `Confirmar aprobar/denegar/revocar` | `Aprobar` / `Denegar` / `Revocar` |
| `.../admin/permisos/CapabilityMatrix.tsx` | aria-label `Confirmar revocación` | `Revocar permiso` |

### Clase 3 — "Confirmar + sustantivo" → verbo del acto (fricción ya correcta)

| Sitio | Label viejo | Label nuevo |
|---|---|---|
| `ReasignarButton.tsx` | `Confirmar reasignación` | `Reasignar` |
| `DevolverAlDuenoButton.tsx` | `Confirmar devolución` | `Devolver al dueño` |
| `CancelTransferAction.tsx` | `Confirmar cancelación` | `Cancelar transferencia` |
| `ReverseAdoptionAction.tsx` | `Confirmar reversión` | `Revertir adopción` |
| `OwnerReturnProposalCard.tsx` | `Confirmar aceptación` / `Confirmar rechazo` | `Aceptar devolución` / `Rechazar devolución` |
| `WithdrawDisputeButton.tsx` | `Confirmar retiro` | `Retirar disputa` |
| `DerivationPanel.tsx` | `Confirmar derivación` | `Derivar` |
| `BulkRevokeList.tsx` (modal bespoke) | `Confirmar revocación` | `Revocar seleccionados` |
| `AttendanceFormDispatcher.tsx` | `Confirmar cancelación` | `Cancelar turno` |
| `app/gob/cola/[publicToken]/ReviewActions.tsx` | `Confirmar aprobación` / `Confirmar rechazo` | `Aprobar solicitud` / `Rechazar solicitud` |

### Clase 4 — ya conformes (no tocar)

`Revocar`, `Desactivar`, `Quitar`, `Salir`, `Eliminar`, `Devolver`,
`Generar PDF`, `Cerrar observación`, `Aceptar transferencia`,
`Rechazar transferencia`. Todos verbo + fricción proporcional.

## A5 — medición de anatomías de chips (2026-07-30)

Gana **la anatomía de `components/ui/dashboard/CaseQueue.tsx`** por frecuencia:
2 de las 6 colas de la muestra (Casos, Disputas) más `admin/casos` y
`org/[orgToken]/casos` = **4 superficies operativas**, contra 1 cada una para las
otras cuatro anatomías. Es además la única que ya vive en componente compartido.

| Cola | Conteo | Fecha | Estado | Código | Anatomía |
|---|---|---|---|---|---|
| Denuncias·Triage (`WelfareDenunciaRow.tsx`) | card-head `(N en total)` | `timeAgo()` relativo | `OpPill` esquina sup. der. | mono plano | A |
| Casos (`CaseQueue.tsx`) | línea sobre la tabla | `formatDate()` mes completo | `CaseStatusBadge` col. propia | `OpCodeBadge` 1ª col. | **B** |
| Disputas (`CaseQueue.tsx`) | ídem | ídem | ídem | ídem | **B** |
| Decomisos (`decomisos/page.tsx`) | sin conteo | `formatDate()` en prosa + días | `OpPill` de fase | `<Link>` mono | C |
| Pérdidas (`LostPetRow.tsx`) | card-head `(N)` | `lostTimeLabel()` relativo | 2 `OpPill` a la izq. | `<Link>` mono | D |
| Aprobaciones (`BulkApprovalQueueList.tsx`) | prosa en header | `formatDateShort()` abreviado | **ninguno** | mono plano, trailing | E |

**Aplicación decidida**: adoptar los ÁTOMOS de B (`OpCodeBadge`, `OpStatusPill`,
`formatDate`) dentro de cada card existente — NO forzar cada cola a `<table>`
(Denuncias/Pérdidas/Aprobaciones son cards con acciones inline y bulk, la tabla
las rompería). Fecha: absoluta con `formatDate()` en todas, y donde la urgencia
es el dato (Pérdidas) se agrega la píldora de tiempo transcurrido — el mismo
patrón que `CaseQueue` ya usa con su píldora de ≥14 días y que Decomisos usa con
su contador de días. Así no se pierde información de urgencia al unificar.

## B1 — spec del codemod (análisis 2026-07-30, compilado contra el CSS real)

Inventario exacto, sin drift contra el baseline: **703 usos / 207 archivos**,
idéntico a `scripts/design-tokens-baseline.json` (`deadTextVar`, cortado
2026-07-05). Reparto: `--text-sm` 234, `--text-md` 199, `--text-xs` 147,
`--text-title` 95, `--text-xl` 9, `--text-2xl` 8, `--text-base` 7, `--text-lg` 4.

**Población que NO se toca**: `text-[var(--color-*)]` — **1.881 usos / 265
archivos**, casi 3× la población muerta, y funciona bien (el nombre de la var
lleva `color-`, que es justo lo que deja a Tailwind inferir el tipo). El regex
debe matchear `--text-[a-z0-9-]+` y JAMÁS `--color-`.

### El hallazgo que cambia cómo se leen las capturas

Compilando el CSS real: todas las utilidades `text-[...]` caen en UN bloque
ordenado alfabéticamente, y **`"color"` ordena antes que `"text"`**. Con igual
especificidad gana la última regla del archivo — o sea, **la regla muerta le
gana hoy a la regla de color correcta**, sin importar el orden en el `className`.
Y como `color: var(--text-sm)` es un `<color>` inválido, el elemento cae a
color HEREDADO.

Medido parseando cada `className`: de los 703, **85 elementos comparten elemento
con un `text-[var(--color-X)]`** y por lo tanto **hoy están mostrando un color
que su autor nunca eligió**. Al sacar la clase muerta, esos 85 van a cambiar de
color — **es una corrección, no una regresión**, y hay representantes en las 5
superficies a capturar. Quien lea las capturas tiene que saber esto de antemano
o va a reportar un bug donde hay un arreglo.

Los otros: 568 conviven con una utilidad de color NOMBRADA (que ya gana el
cascade hoy → solo suman font-size, bajo riesgo), 36 están solos, ~14 viven
fuera de un `className=` literal.

### Consecuencias para la implementación

- **Substitución literal por texto crudo, NO walk de AST sobre `className`**:
  ~14 usos viven en mapas de variantes (`OpButton.tsx:65-66`), constantes de
  módulo (`AlcanceScreen.tsx:234`) y defaults de parámetro (`ResultCount.tsx:50`).
  Un codemod que solo recorra atributos JSX los saltea en silencio.
- **Efecto secundario del rename**: `text-xs`/`text-sm`/`text-base`/`text-lg`/
  `text-xl`/`text-2xl` traen line-height de Tailwind que hoy no se aplica.
  `text-md` y `text-title` no tienen companion de line-height → limpios.
- `--text-xs` (10px) y `--text-sm` (12px) **overridean** la escala de Tailwind
  (12/14). No es un problema, pero explica por qué se ven más chicos que en
  cualquier otro proyecto.
- `text-title` no existe hoy como literal en ningún lado: este codemod es lo
  primero que va a hacer que Tailwind lo emita.
- **Nada pinnea el string roto**: cero matches en tests, specs y e2e. Ningún
  test va a fallar por el rename.
- `@apply`: cero usos. Sin riesgo.

**Riesgo: medio.** Mecánicamente es trivial; la carga real está en la revisión
visual de los 85.

## SC-7 (NUEVA) — el gemelo del bug 703: `font-[var(--font-ln-*)]`

Descubierto compilando el CSS de B1, **fuera del alcance de la decisión del PO**
(que nombra solo `text-`). No se folda en B1 en silencio.

`font-` es igual de ambiguo que `text-` (familia vs peso vs estilo) y con una
var pelada Tailwind elige **font-weight**. Verificado en el build:

```
.font-\[var\(--font-ln-mono\)\]{--tw-font-weight:var(--font-ln-mono);font-weight:var(--font-ln-mono)}
```

Como `--font-ln-mono` resuelve a un stack de fuentes, no a un `<font-weight>`,
la declaración es inválida y cae a heredado: **font-family muerta**, mismo bug.

**521 usos / 144 archivos**: mono 349, serif 135, sans 37. El arreglo ya existe
y compila bien: `font-ln-mono` / `font-ln-serif` / `font-ln-sans`.

**El guard de la regla 9 NO lo cubre** — `DEAD_TEXT_VAR`
(`scripts/check-design-tokens.ts:191`) matchea solo el prefijo `text-`. Esta
población no tiene fence ni baseline.

**Por qué NO va adentro de B1**: el delta visual es de otra naturaleza. B1 suma
tamaños de fuente (sutil). SC-7 haría que 349 elementos que hoy se ven en la
sans heredada pasen a **monoespaciada** de golpe — es el diseño original, pero
es un cambio dramático que necesita sus propias capturas y su propia ratificación.
Meterlo en el mismo commit haría ilegible la revisión de los dos.

**Acción**: unidad propia, con guard nuevo + baseline, capturas propias. A la
lista de ratificación como hallazgo.

## BLOQUE B — servidor UNA vez (reconstruir al entrar al bloque)

Secuencia de entrada: matar `:3001` → build → qa-up → guard verde.

### B1. Pasada de los 703 (decidida)
1. Codemod: `text-[var(--text-X)]` → utilidad nombrada `text-X`, consciente de
   que TODO token del theme genera utilidad (`text-title`, `text-md` incluidos).
2. Capturas ANTES/DESPUÉS por superficie: credencial pública, panorama, una
   cola gob, /cuenta, landing → `docs/reviews/results/2026-07-30-703-pass/`.
3. Regla 9 a baseline 0. Suite completo. UN commit.
4. Si alguna superficie queda visiblemente rota (jerarquía invertida, texto
   ilegible): arreglar el caso puntual con la utilidad correcta, NUNCA volver
   al patrón muerto. Documentar cada excepción.

### B2. D.8 completo
- **Slot**: señal `ownedPetsCount` vía `request-cache` (React cache() — se
  comparte con las páginas que ya cuentan; costo nuevo solo donde no se
  contaba: UN count indexado por request). Si existe algo ya consultado que
  sirva, usarlo; si no, este es el compromiso documentado. Con 0 →
  "Cargar mascota" → `/mis-mascotas/nueva`.
- **Vacío que vende la credencial**: el empty state de /mis-mascotas explica
  QUÉ ES la credencial (QR, verificable, viaja con la mascota) antes del CTA.
  Copy es-AR sobria; capturar para ratificación.
- **Éxito con QR**: la pantalla post-alta (`PetCreatedAha.tsx`) ofrece
  descargar/imprimir el QR. Reusar el generador de QR existente de la
  credencial. Capturar.

#### B2 — hallazgos de la investigación (2026-07-30), corrigen el plan

1. **No hay ninguna carga gratis en el layout.** `app/(app)/layout.tsx` no toca
   `ownerships`/`pets` (solo perfil, no-leídos, membresías). El único candidato
   con `count()` indexado listo — `fetchPetsForOwner` (`lib/analytics/owner-dashboard.ts:114`)
   — está **muerto en producción** desde el fold P5 de `/inicio`: solo lo llaman
   sus propios tests. Así que se paga el compromiso documentado: UN
   `getOwnedPetsCountCached` nuevo en `lib/infra/request-cache.ts`, mismo patrón
   `cache()` que los otros cinco helpers, sobre `ownerships_owner_user_id_idx`.
2. **El slot con 0 mascotas no es solo un label malo: es un no-op silencioso.**
   `CitizenTabBar.tsx:168` dice "Asentar" y apunta a `/inicio?sheet=anotar`
   (`:128-131`); con 0 mascotas `/inicio` redirige a `/mis-mascotas`, donde
   `?sheet=anotar` es INERTE (`app/(app)/inicio/page.tsx:82-90`). El botón no
   hace nada. Eso sube la prioridad del arreglo.
3. **El QR de la pantalla post-alta YA EXISTE** — `PetCreatedAha.tsx:110-120`,
   SVG 240×240 server-side. Lo que falta es el afford: sus 3 CTAs son
   Compartir / Ver perfil / Ver credencial pública. Y **ya existe la superficie
   de impresión**: `/mis-mascotas/[publicToken]/chapita` (`ChapitaSheet.tsx`,
   tres layouts imprimibles + `window.print()`).
   **Decisión (corrige el plan)**: la pantalla post-alta LINKEA a `/chapita`, no
   reimplementa impresión. Razón dura: `/chapita` está gateada por
   `resolvePhysicalCredentialChannels` (`chapita/page.tsx:28-38`) y el canal
   `printable_qr` puede estar deshabilitado por jurisdicción — un botón de
   imprimir embebido en la post-alta SALTEARÍA ese gate.
4. **Tests que pinnean literales y van a romper**: `owner-process-clarity-19.test.ts:33-34`
   y `e2e/owner-ia-p6.spec.ts:353-354` (copy del vacío);
   `CitizenTabBar.test.tsx`, `CitizenTabBar.interaction.test.tsx` y
   `a11y-touch-targets.test.tsx:127-151` (este último keyea el target de 44px
   sobre el literal "Asentar").
5. **Deuda anotada, no arreglada acá**: la URL del QR se concatena a mano en 3
   lugares (`credencial/page.tsx:36-37`, `cartel/page.tsx:96-97`,
   `chapita/page.tsx:58-59`) en vez de llamar a `credentialQrUrl()`
   (`lib/infra/site-url.ts:58-60`). El guard contra `NEXT_PUBLIC_SITE_URL` vacío
   está intacto en los tres hoy — es riesgo de drift, no bug vivo.

### B3. C.1 — libreta del dueño — **REVERTIDA POR LA INTENCIÓN DOCUMENTADA**

La lectura recomendada del plan era diferenciar las 3 rutas. **Se descarta**: se
activó el escape hatch que el propio plan dejó escrito ("si la intención
original documentada contradice esta lectura, seguir la intención documentada y
anotarlo"). La evidencia (2026-07-30):

1. **Las 3 rutas no son vistas duplicadas: son stubs de redirect 308** a la
   MISMA página (`?tab=libreta|vacunas|historial`), y `resolvePetFace`
   (`lib/domain/pet-face-nav.ts:35-52`) colapsa los tres a `face:"libreta"` a
   propósito. Existen solo para no romper bookmarks viejos.
2. **La consolidación es una decisión de producto vigente, no una migración a
   medias**: ADR-10 (2026-07-02, commit `febf1ae7`) sacó los lens-chips
   Todo/Vacunas/Oficial, y el handoff más nuevo y más explícito se llama
   literalmente "Una sola libreta"
   (`docs/design/handoffs/perfil-mascota-una-libreta/README.md:138`). Hay una
   matriz de tests defendiendo el colapso (`pet-face-nav.test.ts:42-123`).
   Diferenciarlas sería deshacer una decisión ratificada.
3. **Los "2 tiles deshabilitados" no son la feature frenada.** Son los botones
   de drill-down de `VacunasStatusBadges.tsx:189`, deshabilitados con
   `count === 0` — comportamiento correcto (no hay nada que desplegar), y
   decisión del PO de 2026-07-05. Convertirlos en chips de filtro rompería un
   acordeón que funciona.
4. **La brecha REAL sí existe, y es otra**: el dueño no puede contestar "¿cuándo
   fue la última X?" en un feed único de hasta 250 eventos mezclados
   (`critique-libreta.md` hallazgos #3/#8). Y existe el artefacto huérfano para
   arreglarla: `LIBRETA_FILTER_CHIPS` (`lib/infra/libreta-sanitaria.ts:132-147`),
   14 chips por tipo de evento, exportado y **sin ningún consumidor** salvo su
   propio test. `EventTimeline.tsx:96` ya acepta un subconjunto de chips por prop.

**B3 redefinida**: reintroducir `LIBRETA_FILTER_CHIPS` como chips de filtro
DENTRO del timeline consolidado de `LibretaFace` — sin tocar las rutas, sin
tocar `VacunasStatusBadges`. Los datos ya están en `past` (cada fila trae
`eventType`): **no hace falta ninguna query nueva**. Va a la lista de
ratificación como corrección de alcance, no como decisión pendiente.

### B4. Verificación visual pendiente del Bloque A
- #40: hachurado de provincia suprimida + leyenda, en vivo (preset cumplimiento).
- D.3: al menos un modal nuevo y un inline nuevo, en vivo.

## STRETCH (solo si el reloj sobra — en este orden)
- SC-6 (cursor keyset por urgencia — rework contenido, sin decisión).
- #41 detalle de caso (SOLO si D.3 quedó verde y hay >2h de margen; si no,
  dejar el diseño de la gramática aplicada como handover).
- D.5(b) en CabaInset/MapChoropleth (calcar `no-data-overlay.ts`).
- Crisis-seams (b): reproducir Rocco@Recoleta A MANO primero (es producto).

## Protocolo de cierre (obligatorio, pase lo que pase)

1. Gate final del último batch + suite completo (leer CONTEOS, no exit code).
2. Review adversarial pre-push con cursor-agent sobre el rango completo.
   Fix bar: los CONFIRMED se arreglan como `fix(...)` citando la review.
3. Push SOLO si el PO lo autorizó para esta corrida (ver autorización abajo).
4. Actualizar este archivo: tabla de estado + LISTA DE RATIFICACIÓN.
5. `mem_session_summary` con el estado exacto para retomar en frío.

### Autorización de push para esta corrida
**CONCEDIDA (PO, 2026-07-30)**: al cierre, review adversarial de cursor sobre el
rango completo → fixes de los CONFIRMED como commits propios → push a
`origin/integration/all-20260703`. Si la review da DO NOT SHIP y el fix no es
claro: NO pushear, dejar el veredicto arriba de todo en este archivo. La
autorización es para ESTA corrida, no permanente.

## LISTA DE RATIFICACIÓN (se llena durante la noche, el PO la lee a la mañana)

| # | Qué | Evidencia | Riesgo si se revierte |
|---|---|---|---|
| R1 | **Copy de la credencial: "Inscripto/a" → "Registrado/a"** | Commit `ac2af21f`; 48 tests verdes; mutación verificada (4 fallos con el lexema viejo) | Ninguno técnico. Es la palabra que el ciudadano ve al lado del nombre de su mascota — si al PO no le cierra, se revierte con un solo cambio en `registeredAdjective()` |
| R2 | **A5: gana la anatomía de `CaseQueue`**, y se adoptan sus ÁTOMOS en las otras 4 colas en vez de forzarlas a `<table>` | Medición en este archivo (§A5): 4 superficies vs 1 de cada una de las otras | Las colas quedan como están hoy: 5 gramáticas visuales distintas para el mismo trabajo |
| R2b | **A5 · Aprobaciones era la única cola SIN indicador de estado; se le dio uno que NO es "Pendiente" a secas** | La cola trae sólo `status='pending'` (`fetchVisiblePendingRequests`), así que una píldora "Pendiente" en cada fila sería una constante. Lo que varía por fila es el CAMINO DE DECISIÓN: las matrículas veterinarias están excluidas del aprobar-en-lote (`VET_MATRICULA_BULK_APPROVE_BLOCKED`, espejado en el servidor) y hoy el operador se entera recién al seleccionar y ver "Aprobar" deshabilitado. La fila ahora lo declara: `Pendiente` (ámbar) vs `Verificación individual` (azul) | Vuelve a ser la única cola sin estado — y el operador vuelve a descubrir el bloqueo por fracaso |
| R2c | **A5 · Pérdidas cambia de fecha relativa a fecha absoluta + píldora de tiempo transcurrido** | El dato de registro (cuándo se denunció la pérdida) no existía en la fila: dos casos de la misma tarde eran indistinguibles. `lostTimeLabel` no se perdió — subió a `OpPill` neutral, el mismo par que `CaseQueue` usa con su píldora de ≥14 días. Denuncias·Triage convirtió a absoluta sin píldora nueva porque severidad + `SlaBadge` (que ya dice "vencido hace N días") ya eran su voz de urgencia | Si el PO prefiere el "hace X" como dato principal, se invierte el par sin tocar nada más |
| R3 | **B3 redefinida: NO se diferencian las 3 rutas de la libreta** | §B3 de este archivo: ADR-10, handoff "Una sola libreta", matriz de tests `pet-face-nav.test.ts:42-123` | Si el PO igual quiere 3 destinos distintos, hay que revertir ADR-10 — decisión de producto, no de implementación |
| R4 | **B2: la post-alta LINKEA a `/chapita` en vez de imprimir el QR ahí mismo** | §B2 punto 3: `/chapita` está gateada por `printable_qr`, que puede estar deshabilitado por jurisdicción | Un botón de imprimir embebido saltearía el gate de canal de la jurisdicción |
| R7 | **HALLAZGO NUEVO — hay un segundo bug idéntico al de los 703, sin fence: `font-[var(--font-ln-*)]`, 521 usos / 144 archivos, font-family MUERTA** | §SC-7: verificado en el CSS compilado, `font-weight:var(--font-ln-mono)` es inválido y cae a heredado | Hoy 349 elementos que el diseño quiere monoespaciados se ven en la sans heredada. Arreglarlo es un cambio visual grande — por eso va como unidad propia con capturas propias, NO adentro de B1 |
| R8 | **Al arreglar los 703, 85 elementos van a CAMBIAR DE COLOR** | §B1: el cascade alfabético (`color` < `text`) hace que hoy la regla muerta le gane a la regla de color correcta | Es una corrección, no una regresión. Se anota para que nadie lea las capturas al revés |
| R5 | **A3: dos desvíos de la tabla acto→clase→gramática** — (a) `ReviewButtons`/rechazo dice **"No avanzar"**, no "Rechazar postulación" (la pantalla ya eligió el verbo suave y renombrarlo a mitad de flujo lo vuelve otro acto); (b) `CancelTransferAction` gana `cancelLabel="Volver"` (único diálogo donde "Cancelar" es homógrafo del acto) | Commits `f50e2064` / `acd08f43`; 182 tests verdes en 25 archivos dirigidos | Sólo copy: se vuelve al label de la tabla con un string |
| R6 | **A3: la tabla tenía 3 sitios incompletos y 5 fuera de inventario.** `InvestigationActions` son 5 modos (no 3), `GovtModerationActions` 3 (no 1), `TriageActions` 5 — todos pasan a mapa label-por-modo. Fuera de tabla, mismo defecto: `EndFosterButton`, `LeaveMembershipButton`, `WithdrawButton`, `BlockSlotButton`, `SheetMounter`, y el default de `CaptureConfidenceCard` | `__tests__/confirm-label-grammar.guard.test.ts` en cero; mutación verificada (label revuelto → el guard lo nombra con archivo:línea) | Sin los 5 fuera de tabla el guard de regresión no puede quedar en cero, así que revertirlos implica borrar el fence |

## Estado (actualizar al cerrar cada unidad)

| Unidad | Estado | Commit |
|---|---|---|
| A1 exit-1 (timebox 60') | **CERRADA** (causa sistémica anotada, no arreglada) | `e730e4e2` |
| A2 #40 k-anon provincia | **CERRADA** (falta verif. visual → B4) | `4b8284f2` |
| A3 D.3 gramática | **CERRADA** | `f50e2064` (clases 2-3) + `acd08f43` (fence + clase 1) |
| A4 copy Registrado/a | **CERRADA** | `ac2af21f` |
| A5 D.4 chips | **CERRADA** (4 colas alineadas a los átomos de `CaseQueue`) | `PENDING_SHA` |
| B1 pasada 703 | pendiente | |
| B2 D.8 completo | investigada, implementación pendiente | |
| B3 C.1 libreta | **redefinida** (ver §B3), implementación pendiente | |
| B4 verificación visual A | pendiente | |
| S1 SC-6 | stretch | |
| S2 #41 | stretch | |
| S3 D.5(b) inset | stretch | |
| S4 crisis-seams (b) | stretch | |

**Presupuesto honesto**: A2, A3 y B1 son las caras (1.5-3h c/u). Expectativa
realista: Bloque A entero + B1-B2; B3/B4 probables; stretch improbable. Mejor
9 unidades cerradas con evidencia que 13 a medias.
