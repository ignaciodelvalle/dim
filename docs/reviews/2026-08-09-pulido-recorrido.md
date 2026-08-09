# Día de pulido — hallazgos del recorrido

**Fecha:** 2026-08-09 · **Base:** `c678f0a4` · **Rama:** `integration/all-20260703`
**Método:** recorrido por UI real contra el build local (:3000), por los pasos que haría una persona. Plan: `docs/plans/2026-08-09-dia-de-pulido-plan-maestro.md`.

**Severidad:** ALTA = un funcionario citaría algo falso, o un flujo core no cierra · MEDIA = fricción real · BAJA = pulido.

---

## R1 — El bootstrap de QA no corre como está documentado, y su smoke grita lobo · ALTA

**Dónde:** `scripts/qa-up.ps1:4` (uso), `:145-158` (smoke) · CLAUDE.md § "Working norms"

Dos fallas encadenadas, encontradas al intentar levantar el ambiente:

1. **`pwsh` no existe en esta máquina.** PowerShell 7 no está instalado, así que el comando documentado en CLAUDE.md — `pwsh scripts/qa-up.ps1` — muere con exit 127. El único intérprete disponible es Windows PowerShell 5.1 (`powershell.exe`).

2. **Al caer a 5.1, el smoke falla sobre una app sana.** `/login` responde **308** hacia `/iniciar-sesion` (verificado: `curl -i` devuelve `location: /iniciar-sesion`). Windows PowerShell 5.1 **no sigue redirects 308** — su `HttpWebRequest` sólo auto-sigue 301/302/303/307 — así que `Invoke-WebRequest` lanza, el `catch` se lo tragaba, y el bucle reintentaba 30 veces antes de declarar *"smoke FAILED: /login never responded on port 3000"*. El servidor estaba respondiendo perfectamente todo el tiempo.

**Por qué es ALTA y no BAJA:** es la tercera vez en el día que aparece la misma clase de defecto — un gate que reporta una propiedad que no está midiendo. Un smoke que grita lobo sobre una app sana entrena a todo el mundo a ignorarlo, y entonces la única vez que tiene razón también se ignora. Es exactamente el costo que ya pagamos con el `includes()` del fence de presupuesto y con el `;` de `test:verified`.

**Arreglado:** el smoke ahora sigue los redirects a mano (`-MaximumRedirection 0` para que los dos shells se comporten igual) y clasifica: sin status = falla de conexión; 4xx/5xx = falla real y ruidosa; 2xx/3xx = respondió. El encabezado del script documenta que debe seguir siendo compatible con 5.1.

**Queda para el PO:** instalar PowerShell 7 restauraría el comando documentado tal cual está en CLAUDE.md. Mientras tanto, la invocación que funciona es
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/qa-up.ps1`.

---

## R3 — Publicar un servicio desde una clínica lo escribía en OTRA organización · ALTA

**Dónde:** `app/actions/service-offerings.ts:74` (antes), `app/actions/schedule-rules.ts:50,90`, `app/org/[orgToken]/servicios/nuevo/ServiceOfferingForm.tsx:50`

**Cómo se encontró:** haciendo el paso 1 del recorrido del veterinario. Creé el servicio "Antirrábica — consultorio Recoleta" parado en `/org/DIM-JB7N-7EMY/servicios/nuevo` (Clínica Veterinaria Recoleta) y el submit me dejó en `/org/DIM-CMSZ-WFX2/servicios` — **Mascotas BA Centro**, una autoridad sanitaria. Verificado en la base: el servicio quedó bajo `Mascotas BA Centro`, no bajo la clínica.

**Causa raíz.** `createServiceOfferingAction` usaba `requireCapability("service_offering.create")` **sin token de organización**. Esa forma resuelve la membresía *default de sesión* — literalmente `memberships[memberships.length - 1]`, la más recientemente unida — e ignora la organización de la URL. `alejo@dim.test` pertenece a cuatro organizaciones; la última es la autoridad sanitaria.

El formulario **tenía** el `orgToken` (lo usaba para el link "Cancelar") pero nunca lo mandaba en el `FormData`, así que la action no tenía de dónde leerlo.

**Lo que hace esto interesante:** tres funciones más abajo, en el mismo archivo, hay un comentario que dice *"FROM the URL orgToken, not the session-default (most-recently-joined) membership"*. `requireCapabilityForOrgToken` existe exactamente para este bug, las funciones hermanas fueron migradas — y la de **crear** quedó atrás. Cuarta recurrencia del patrón "lo que se escapa es el gemelo" en la misma jornada.

**Alcance real:** no es escalada de privilegios — la capability se chequea contra la organización donde efectivamente escribe, y el usuario la tiene ahí. Es integridad de tenant: el servicio de una clínica aparece en el catálogo de un organismo de gobierno. Para un producto cuyo modelo entero de autorización es org-scoped, alcanza.

**Barrido:** el mismo patrón estaba vivo en `createScheduleRuleAction` y `updateScheduleRuleAction` — **las dos acciones del paso siguiente del recorrido**, la regla de agenda. Las dos leían `orgToken` del `FormData` sólo para revalidar una ruta. Arregladas también.

**El fence lo tenía documentado como agujero conocido.** `scripts/check-confused-deputy.ts` nombraba las tres acciones en su encabezado, bajo *"KNOWN BLIND SPOT ... UX-latent ... Converting them is tracked separately"*. La evaluación de severidad era correcta; la de consecuencia, no. Se cerró el agujero: la heurística ahora dispara también cuando el token llega por `FormData`, no sólo por la firma tipada.

**Arreglado y verificado:** `pnpm lint:authz-orgtoken` → 87 archivos, cero ofensores, 1 excepción documentada (`reportBiteFromOrgAction`, fuera de esta línea por razones que el propio allowlist explica).

---

## R4 — "Confirmar aprobacion", sin tilde · BAJA

**Dónde:** `app/gob/servicios/[offeringToken]/OfferingReviewActions.tsx:60`

El botón de confirmación decía `"Confirmar aprobacion"`. `components/BulkApprovalQueueList.tsx:365` escribe la misma confirmación bien (`"Confirmar aprobación"`) — mismo concepto, dos ortografías, una mal. Arreglado, y de paso los `...` pasaron a `…`.

**Barrido:** busqué el patrón en todo `app/` y `components/` sobre cadenas visibles. Es un caso **aislado**, no sistémico: el resto de los aciertos del grep eran usos correctos ("esta página", rutas `/iniciar-sesion`). No hace falta un fence.

---

## ✅ Cadena del veterinario — COMPLETA, por pasos reales

Todo por UI, sin SQL, con `alejo@dim.test` (admin de Clínica Veterinaria Recoleta) y `lucas@dim.test` (govt, CABA):

1. **Publicar** `/org/DIM-JB7N-7EMY/servicios/nuevo` → "Antirrábica — consultorio Recoleta" (`OFR-UK82-P73K`), queda `pending_approval`
2. **Aprobar** — la autoridad la ve: `/gob/directorio?registro=servicios` dice *"1 servicio pendiente en tu cobertura"* y la fila muestra "Recoleta, CABA". **La subsunción de jurisdicción funciona**: un operador de CABA ve una clínica de Recoleta, aunque `govt-local@` (sólo Palermo) no la vería. Confirmación en dos pasos antes de aprobar
3. **Regla de agenda** — defaults sensatos: Lun-Vie, 08:00-12:00, válido desde hoy
4. **Materializar ahora** → **688 turnos futuros** donde había 0
5. **Reservable** — `/turnos/buscar?service_kind=vaccination_rabies` muestra *"Antirrábica — consultorio Recoleta · Clínica Veterinaria Recoleta · Gratuito · 15 min · 80 turnos disponibles en 7 días"*

**El hueco #2 del plan maestro (`time_slots` futuros = 0) está cerrado**, y cerrado del modo que valía la pena: por los pasos que va a dar el veterinario real, no por un script.

`materializeOfferingNow` quedó verificada como correcta de paso: resuelve la oferta, fija la capability contra `offering.organizationId` (forma de dos argumentos) y además revalida que coincidan. No es hallazgo — se anota porque es el contraejemplo de R3 y muestra cuál es la forma buena.

---

## R7 — El conurbano no existe por nombre en el catálogo · RESUELTO POR DECISIÓN DEL PO

> **DECISIÓN (PO, 2026-08-09):** *"Localidad La Matanza, olvidate de San Justo como tal, es parte de su localidad nada más."*
>
> **La granularidad del catálogo es la correcta para el producto.** La unidad jurisdiccional es el **partido**, no el barrio: San Justo, Ramos Mejía o Isidro Casanova son partes de La Matanza, y La Matanza es lo que se elige. No se agrega nada a `ar_localities`, no se crea tabla de alias, y no se toca `searchLocalities`.
>
> Consecuencia operativa: **el piloto se carga en `AR / Buenos Aires / La Matanza`**, y al veterinario se le dice que busque "La Matanza".
>
> Lo que sigue abajo se conserva como el análisis que llevó a la decisión, no como deuda abierta.

**Dónde:** tabla `ar_localities` (datos), `lib/infra/ar-localidades.ts:209` `searchLocalities` (búsqueda)

**Encontrado al preparar el piloto en San Justo, La Matanza.**

Un veterinario de San Justo que escribe su propia ciudad en el buscador de localidades obtiene esto:

```
AR-E | Uruguay    | San Justo             | localidad
AR-S | San Justo  | San Justo             | localidad
AR-V | Río Grande | Country Club San Justo| localidad
```

Entre Ríos, Santa Fe, y un country en Tierra del Fuego. **Ninguno es el suyo.** La opción correcta es "La Matanza", que hay que saber tipear — es el partido, no la ciudad.

Y el buscador no lo rescata: `searchLocalities` puntúa **únicamente** contra `locality_slug` (deliberadamente, para que el matcheo sea insensible a acentos vía slug normalizado); nunca mira `department_name`. Aunque lo mirara tampoco alcanzaría, porque el departamento se llama "La Matanza", no "San Justo".

**La magnitud.** La Matanza —el partido más poblado del país, ~1,8 millones— tiene **una sola fila**, categoría `componente`, llamada "La Matanza". Mientras tanto Brandsen, con ~26 mil habitantes, tiene **14 localidades**. Buscadas por nombre en AR-B:

| | |
|---|---|
| Ramos Mejía, González Catán, Isidro Casanova, Laferrere, Lomas del Mirador, Villa Luzuriaga, Tapiales, Ciudad Evita, Rafael Castillo, Virrey del Pino | **0 cada una** |
| Banfield, Temperley | **0 cada una** |
| Morón, Lanús, Quilmes, Avellaneda | **1 cada una** — sólo el nombre del partido |

El AMBA está modelado a nivel PARTIDO. Son ~10 millones de personas representadas por unas pocas decenas de filas.

**Esto no es necesariamente un bug de ingesta:** INDEC agrega el Gran Buenos Aires como componentes de un aglomerado, así que el catálogo probablemente es fiel a la fuente. Pero la consecuencia de producto es dura y es exactamente la del piloto: **ningún habitante del conurbano encuentra su localidad por nombre.**

**No lo toco por mi cuenta.** Es el catálogo canónico, con FK de atribución estructural colgando de él (ver el encabezado de `lib/infra/ar-localidades.ts`), y cambiarlo es una decisión de modelo de datos, no de pulido. Va como decisión del PO con opciones.

---

## R5 — Copy de desarrollador servido a un operador, y la única flecha ASCII de la app · MEDIA

**Dónde:** `app/gob/reglas/[country]/[province]/[locality]/nueva/page.tsx:54,62` (compartido por el gemelo `/admin/reglas/…` vía re-export)

Entrando a `/admin/reglas/AR/CABA/Recoleta/nueva` sin parámetros, la pantalla dice:

> **"Falta ?ruleType= en la URL."**

Un nombre de query-string mostrado a quien aterrizó ahí, que es un administrador. El estado vacío es legítimo —la página se alcanza sin tipo de regla, a mano o desde un link viejo— pero lo que dice sobre sí mismo no lo era. Ahora dice *"No elegiste qué tipo de regla crear"* con un detalle que indica la salida.

El link de vuelta decía `"<- Volver"` con guion ASCII.

**Y acá también me quedé corto al principio.** Dije que era la única ocurrencia; el barrido completo encontró **seis** flechas ASCII en copy visible, contra 70 archivos que escriben `←`/`→`:

| Archivo | Texto |
|---|---|
| `…/reglas/…/nueva/page.tsx:62` | `"<- Volver"` |
| `app/gob/moderacion/[id]/page.tsx:285` | `"Abrir ->"` |
| `app/admin/moderacion/[id]/page.tsx:251` | `"Abrir ->"` (el gemelo, otra vez) |
| `app/gob/reglas/AdminReglasLens.tsx:189` | `"Ver ->"` |
| `app/gob/reglas/AdminReglasLens.tsx:211` | `"Configurala acá ->"` |
| `app/gob/reglas/AdminReglasLens.tsx:269` | `"Ver detalle ->"` |

Las seis unificadas. Cuatro de las seis están en la familia de pantallas de **reglas** — el mismo cluster que R6, lo que refuerza que esas pantallas se escribieron sin la pasada de estilo que recibió el resto.

Verificado después: `rg '"[^"]*->"' app components --glob '*.tsx'` (excluyendo `=>`) no devuelve nada.

---

## R8 — "Crear regla" clickeable que no hace nada · BAJA

**Dónde:** asistente de nueva regla, paso 4

Al elegir `microchip_required` para La Matanza, el paso final muestra —correctamente— *"Esta configuración es idéntica al default — no se requiere override."* El sistema **se niega a crear una regla redundante**, que es la decisión correcta: evita llenar la tabla de overrides que no cambian nada.

El problema es la affordance: el botón "Crear regla" queda **habilitado**, se puede clickear, y no pasa nada. Un operador no sabe si falló, si se guardó, o si el click no registró. Debería deshabilitarse (con el motivo ya visible al lado, que ya está) o confirmar explícitamente.

No lo arreglé: es un cambio de comportamiento en un asistente que no recorrí entero, y prefiero que lo mire alguien con el flujo completo en la cabeza.

---

## R6 — Las formas de reglas nunca pasaron por revisión de es-AR · MEDIA

**Dónde:** `…/nueva/PppWeightThresholdForm.tsx:92-93,119-120` y `…/nueva/PppAttestationRegistriesForm.tsx:83-84,91`

> "Define un umbral de peso por sobre el cual el animal se considera PPP por **tamano**. **Deja** kg **vacio** para no aplicar threshold…"
> "Si **esta** desactivado, el threshold solo agrega una segunda **condicion**…"

`tamano` sin ñ, `vacio` y `condicion` sin tilde, `esta` por `está`, y `Deja` rompiendo el voseo que usa el resto del producto. Lo lee un funcionario **antes de fijar la regla que define qué animal es PPP en su jurisdicción**. De paso, `threshold` pasó a `umbral` en el texto visible (el identificador técnico se mantiene).

Y en la forma de registros de atestación, tres más:

> "Lista de registros oficiales en los que el **dueno** debe registrar…"
> "**Marca** **required** en los obligatorios."
> "**Aun** no agregaste registros."

`dueno` sin ñ, tuteo otra vez, el identificador inglés `required` suelto en una frase en castellano, y `Aun` sin tilde.

**Me corregí dos veces, y las dos veces por quedarme corto.**

1. Al encontrar R4 dije que las tildes eran un caso **aislado**. Falso: la pantalla siguiente tenía cinco defectos en dos frases.
2. Después del primer barrido dije **"3 archivos, 6 cadenas, no sistémico"**. También corto: mi lista de palabras para el barrido de ñ **no incluía `dueno`**, que es probablemente el sustantivo más frecuente del dominio. Al agregarlo apareció el cuarto archivo.

**Veredicto final, ya con el barrido completo: 4 archivos, 9 cadenas, todas en las formas de reglas.**

- **ñ:** `dueno` en copy visible existe en **un solo** lugar (el resto de los aciertos son slugs de URL como `devolver-al-dueno`, correctamente en ASCII). `tamano`, ídem.
- **familia `-ción`:** limpio. Los aciertos son palabras inglesas (`decision`, `version`), rutas `/iniciar-sesion` y plurales bien escritos.
- **voseo:** consistente. Cero tuteo tras los arreglos, contra 115 archivos con voseo.
- **`(default AR)`** en `PppBreedListForm:130` se deja: "default" es vocabulario propio del producto (el chip dice "Default nacional"), no un anglicismo suelto.

**No es sistémico en el producto — es sistémico en UNA familia de pantallas.** Las formas de reglas se escribieron en una pasada que nunca pasó por revisión de es-AR, mientras el resto del producto sí. Esa es la conclusión útil, y explica por qué mis dos primeras estimaciones fallaron: buscaba un patrón disperso donde había un cluster.

---

## Funcionario — parcial

- **`/gob/reglas` es de sólo lectura por diseño.** La pantalla lo dice: *"Vista de solo lectura, pre-filtrada a tus localidades asignadas. La administración de reglas la hace el admin nacional."* Un funcionario **no puede** cargar sus propias reglas. No es defecto, es decisión de producto — pero si el funcionario del piloto espera fijar sus reglas, esa expectativa hay que manejarla antes de la reunión. **Decisión del PO.**
- **`/admin/reglas/AR/CABA/Recoleta` está bien resuelta:** dice *"Esta jurisdicción no tiene excepciones. Toda regla cae a la cascada superior"* y muestra, por tipo, el default vigente con su "Configurar →". Honesta e informativa.
- **Primera regla real cargada por UI:** `ppp_weight_threshold` en CABA/Recoleta, `{kg: 25, appliesIfBreedNotPPP: false}`. `govt_business_rules` pasó de **0 a 1**.
- **Jurisdicción del piloto definida por el PO: `AR / Buenos Aires / La Matanza`.** Regla real cargada ahí por el asistente de 4 pasos (`ppp_weight_threshold`, 25 kg). `govt_business_rules` = **2**.
- El asistente de 4 pasos está bien hecho: typeahead de localidad con confirmación explícita (*"Localidad confirmada: La Matanza, Buenos Aires"*), y en el paso final avisa la consecuencia —*"afecta el panel de cumplimiento ('N de M al día') de cada mascota registrada ahí"*— antes de que apretes.
- **Pendiente:** el resto de los tipos de regla en La Matanza. El hueco #1 del plan maestro está **parcialmente cerrado**: hay procedencia real donde antes había diez "Default nacional", pero falta poblarlo.

---

## ✅ Barrido de carga — 121 cargas de ruta, cero errores

`scripts/list-static-routes.ts` (nuevo) enumera las **130 rutas estáticas** del App Router (las dinámicas quedan afuera: necesitan un sujeto real). El barrido se corrió con `fetch` desde la sesión viva del navegador, así que las cookies viajan solas y no hay que extraer nada.

| Rol | Rutas | Resultado |
|---|---|---|
| `admin@` | 73 (todo `/admin` + `/gob`) | **200 todas.** Cero redirecciones inesperadas, ninguna sobre 2,5 s |
| `owner@` | 48 (ciudadano + público) | **45 en su lugar**, 3 redirigen y las tres bien: `/` e `/inicio` → perfil de la mascota (role landing), `/adopciones` → `/adoptar` (canónica) |

**Por rol, no en general.** La primera pasada la corrí sólo como admin y las 37 rutas de ciudadano **rebotaron a `/admin`** — separación de roles deliberada, pero significa que no se habían cargado. Contarlas como verdes habría sido contar un rebote como una carga. Por eso la segunda pasada como `owner@`.

**Lo que este barrido NO cubre**, dicho explícitamente:

- Las rutas **dinámicas** (`[publicToken]`, `[id]`, `[orgToken]`…), que son la mayoría de las 246 `page.tsx` del repo. Necesitan sujetos reales y son el siguiente escalón.
- El rol **`govt`** y el portal **`/org`** más allá de su índice.
- Que la página **diga la verdad**: esto verifica que devuelve 200 y a tiempo, no que su contenido sea correcto. Un dashboard mostrando ceros falsos devuelve 200 igual.

### Un error mío, que vale más que el barrido

En la primera tanda tipeé la lista de rutas **a mano** desde un `head -20`, e inventé `/admin/mordeduras`. Dio 404 y estuve a punto de reportarlo como hallazgo. **Esa ruta no existe en el producto ni en la lista generada** — la fabriqué.

Lo detecté al verificar contra el archivo generado. Y el chequeo que casi me confirma el error fue otra trampa: `rg '^/admin' archivo` devolvió **cero** por el mangling de paths de Git Bash con patrones que empiezan en `/` — algo que está anotado en mi propia memoria. Dos fallas encadenadas que casi producen un hallazgo falso.

**Regla que queda:** la lista de rutas se genera, no se tipea. Por eso `list-static-routes.ts` existe como script y no como comando de una vez.

---

## R9 — `capitalize` de CSS sobre texto ya correcto · MEDIA (P3)

**Dónde:** 8 sitios. Fechas: `turnos/buscar/[offeringToken]/page.tsx:148`, `…/reservar/[slotId]/page.tsx:121`, `mis-turnos/[appointmentToken]/page.tsx:130`, `org/[orgToken]/agenda/turnos/[appointmentToken]/page.tsx:106`, `SoloVetAgendaLanding.tsx:63`, `AppointmentCard.tsx:87`. Nombres propios: `DecomisoForm.tsx:684,728`, `buscar-hogar/page.tsx:147`.

`text-transform: capitalize` sube la inicial de **cada palabra**, no la de la frase. De ahí `Sábado, 8 De Agosto`.

**La convención correcta ya existía y estaba testeada**: `components/panorama/__tests__/context-bar-model.test.ts:88` dice literalmente *"capitalizes the período in CSS, never by forking the string"* y afirma `first-letter:uppercase`. El context-bar de panorama lo hace bien; estos ocho quedaron con el viejo.

**Dos eran peores de lo que P3 decía.** En `DecomisoForm` y `buscar-hogar` el contenido es `"Red de rescate"` más una localidad — strings **ya correctos**. Ahí `capitalize` no era inútil, era **dañino**: renderizaba **"Red De Rescate"**. En esos dos la clase se elimina, no se reemplaza.

**Uno tenía dos transformaciones peleándose:** `turnos/buscar/[offeringToken]/page.tsx:148` llevaba `uppercase` **y** `capitalize` en la misma clase, con el resultado dependiendo del orden del CSS generado. Gana `uppercase` (es un encabezado en versalitas) y `capitalize` se va.

**Detalle de CSS que importa, y que medí en el navegador en vez de razonarlo.** Sonda: `::first-letter { font-size: 60px }` sobre texto de 12px, y se mide la altura de la caja — sólo crece donde el pseudo-elemento aplica.

| Contexto | `display` computado | Altura | ¿Aplica? |
|---|---|---|---|
| `<span>` suelto | `inline` | 15px | **NO** |
| `<span style="inline-block">` | `inline-block` | 60px | sí |
| `<p>` | `block` | 60px | sí |
| `<span>` hijo de un flex / inline-flex | `block` (blockificado) | 60px | sí |

Por eso los tres `<span>` llevan además `inline-block`: un reemplazo mecánico de `capitalize` por `first-letter:uppercase` en ellos **no habría hecho nada**, y habría quedado verde.

**Y por eso NO reporté a panorama.** `ContextBar.tsx:166` aplica `first-letter:uppercase` a un `<span>` que, leído aislado, parece inline — pero su padre es un `<button className="inline-flex …">`, así que el hijo se blockifica y el pseudo-elemento sí aplica. Estuve a punto de anotarlo como "test que afirma que la clase está, no que renderice". La medición lo desmintió.

Verificado: `rg '\bcapitalize\b'` sobre `app/` y `components/` no devuelve ninguna clase viva.

---

## R10 — `pnpm test:verified` con filtro de archivo mentía · BAJA (bug mío, del mismo día)

Al cablear el comando en CI probé `pnpm test:verified -- <un archivo>` y el veredicto imprimió **1224 archivos** bajo *"a worker died and took them with it"*. Falso y aterrador.

No es un bug de `check-suite-coverage`: compara **reportados contra DESCUBIERTOS**, y una corrida filtrada descubre 1225 reportando uno. Es un bug del passthrough que yo mismo agregué esta mañana.

Ahora un **flag** (`--coverage`, `--reporter=…`) conserva el veredicto y un **filtro posicional** lo omite, ruidosamente, diciendo cómo obtener el veredicto real.

Y explicó un cuelgue que me había costado 10 minutos: pnpm pasa `"--" "--help"` al script — **verificado, no razonado** — así que antes de filtrar el `--` suelto, éste llegaba a vitest y le rompía el filtro de archivos, que entonces corría la suite entera en modo serie.

---

## REFUTADO — el `·` que "pierde el espacio en tres componentes"

El handoff de resiliencia listaba, dentro de P3, que *"el `·` pierde el espacio en tres componentes"*. **No reproduce.**

Los tres únicos `<span>·</span>` sin margen propio del producto están los tres dentro de un contenedor que sí espacia:

| Componente | Contenedor |
|---|---|
| `org/[orgToken]/voluntarios/VolunteerRow.tsx:82,86,96` | `<p className="… space-x-2">` |
| `gob/cola/[publicToken]/page.tsx:150,154` | `<p className="… flex flex-wrap gap-x-2 …">` |
| `(public)/perdidas/page.tsx:119` | `<div className="… flex items-center gap-3 …">` |

El resto de los aciertos del barrido son `<span className="mx-1">·</span>` (margen propio) o `· {valor}` (espacio en el texto).

**No inventé un arreglo para algo que no está roto.** Si el síntoma existió, fue en un estado anterior o en un componente que ya no está. Queda registrado como refutado para que nadie lo persiga de nuevo.

---

## R11 — Correr la suite BORRABA los datos del piloto · ALTA

**Dónde:** `__tests__/business-rules-resolver.test.ts:37` y `__tests__/physical-credential-channels.test.ts:69`

Cargué por UI la primera regla real de `AR / Buenos Aires / La Matanza` —la jurisdicción del piloto—, corrí el gate, y **la regla había desaparecido**. Sin error, sin aviso, sin nada en los logs.

No fue un wipe de la base: el servicio publicado y los 688 turnos sobrevivieron intactos. Se borró **exactamente esa fila**, y las reglas de CABA quedaron. Ese contraste fue lo que delató el predicado:

```sql
-- afterEach de business-rules-resolver.test.ts, ANTES
delete from govt_business_rules
where jurisdiction_country = 'AR'
  and (jurisdiction_province = 'Buenos Aires' or jurisdiction_province is null)
```

Un cleanup por **jurisdicción**, no por **autoría**. El proyecto `db` de vitest corre contra el Postgres local REAL y compartido, así que ese `afterEach` se llevaba puesta toda regla de Buenos Aires que existiera en la base — la hubiera creado el test o una persona. `physical-credential-channels.test.ts` tenía la misma forma, borrando todas las reglas de canales de AR.

**Por qué es ALTA:** la estrategia entera del día es *cargar datos por los pasos reales del producto*. Un test que se come esos datos, en silencio, la invalida. Y apuntaba justo a Buenos Aires, que es donde vive el piloto.

**Arreglado por autoría.** Cada fixture de esos archivos se inserta con `createdByUserId: ACTOR_ID`, así que ese filtro es a la vez **exacto** (no toca nada ajeno) y **completo** (no deja nada atrás):

```sql
delete from govt_business_rules where created_by_user_id = ${ACTOR_ID}::uuid
```

**Verificado por comportamiento, no por aserción:** con las reglas de La Matanza en la base, corrí los dos archivos de test (25 pasan, 3 skip) y volví a consultar. Siguen ahí.

**El tercero se deja como está.** `business-rules-flow.test.ts:100` también filtra por provincia, pero lleva `and notes = 'test rule'` — un marcador deliberado y documentado, y es un self-heal que corre ANTES del test para limpiar restos de una corrida muerta, donde no hay ids que rastrear.

---

## R2 — El build en disco estaba viejo respecto de HEAD · informativo

`qa-up.ps1` lo detectó y lo dijo bien: *"Build is OLDER than HEAD (c678f0a4)"*, y siguió sirviendo el build viejo en vez de mentir. Ese chequeo funciona como debe — se anota como contraste con R1, no como defecto.
