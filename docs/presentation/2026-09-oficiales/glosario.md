# Glosario — vocabulario único de la presentación

> Snapshot: `c10f4ff03` (`main`) · Facts: `docs/architecture/facts.json` generated 2026-09-02
> Verified against code on 2026-09-02 by writer E (opus subagent) · Status: reviewed
> Numbers in this file are `<!-- fact:key -->` markers checked by `__tests__/architecture-facts.test.ts`.

## Cómo se usa

Toda etiqueta que aparezca en un diagrama, en un título de lámina o en un pie sale de
la columna **Etiqueta en la lámina** de estas tablas, literal. No es una sugerencia:
dos láminas que llaman distinto a la misma cosa le enseñan al funcionario que son dos
cosas, y después no hay manera de desenseñarlo.

**Si necesitás una etiqueta que no está acá, no la inventes en el dibujo.** Pedila en
el informe de handoff y se agrega a este archivo. Un glosario que se completa a mano
en cada lámina deja de ser un glosario.

**Cómo leer una etiqueta de varias líneas.** Varios nodos del pack llevan una segunda
línea explicativa: `Carga firmada` / `evidencia de la denuncia`. **La etiqueta es la
primera línea**; lo de abajo es contexto de esa lámina y se puede reescribir. Lo que
no se puede es cambiar la primera línea, porque es la que tiene que sonar igual en las
doce.

**Qué se puede componer, y qué no.** Estas cinco cosas se hacen con una etiqueta de
la tabla y no cuentan como inventar una nueva:

- **Ponerla en plural** — "Copias operativas", "Capacidades otorgadas".
- **Agregarle el dominio de la lámina** — "Carga firmada de evidencia" es la Carga
  firmada; "Caso de extravío abierto" es un Caso.
- **Prefijarla con el ordinal de la lámina** — "Carril 1 · Extravío y hallazgo",
  "Nivel 0 · Identidad".
- **Escribir la acción de una persona** — "Titular marca la mascota como perdida",
  "Vecino/a reporta un avistaje". Las acciones van sin color y usan el nombre del
  actor y el del objeto, los dos de estas tablas.
- **Unir dos etiquetas con "y" u "o"** cuando un nodo agrupa deliberadamente dos
  actores — "Titular y Vecino/a". Las dos mitades salen de la tabla; ninguna se
  reescribe.

Lo que **no** se puede es cambiar el sustantivo principal. "Techo de consultas" no se
convierte en "Límite de consultas" porque suene mejor en esa lámina.

**La columna Origen dice de dónde sale cada etiqueta**, y no es decorativa:

- **`UI`** — la palabra ya se usa en la aplicación. Se verificó buscándola en `app` y
  en `components` el 2026-09-02. Un funcionario que después entre al sistema va a
  encontrar esa misma palabra en la pantalla.
- **`acuñada`** — la palabra se creó para este mazo porque el concepto no tiene
  superficie de interfaz. Son casi todas de la mitad técnica: mecanismos internos que
  hay que nombrar en un diagrama y que nadie ve en una pantalla. **Una etiqueta
  acuñada no se puede prometer como algo que el usuario va a encontrar.**

**Regla de marca, sin excepción.** La marca es **miMAR**, con eme minúscula. El nombre
interno del código y el prefijo de los códigos de credencial **no aparecen nunca en
una lámina**: viven en la columna de identificador y en el código. Cuando una lámina
necesita mostrar un código de ejemplo, va un marcador de posición, no un código real.

**Regla de una etiqueta por mecanismo, y un mecanismo por etiqueta.** Dos controles
distintos no comparten nombre aunque se parezcan. Los tres que más se confunden están
separados a propósito y conviene tenerlos a mano antes de dibujar:

| Se confunden | Qué es cada uno |
|---|---|
| **Cerrojo de historial** | El disparador de base que bloquea editar y borrar un asiento. Protege el pasado |
| **Cerrojo de base de datos (fila por fila)** | Las políticas que deciden qué filas puede leer o escribir quien habla directo con la base. Protege el alcance |
| **Techo de consultas** / **Techo de pedidos** | Cuántas veces por minuto se puede pedir algo. No protege ningún dato: solo el caudal |

---

## A. Los cinco actores

Son los cinco de la lámina 4 y los cinco que necesitan ícono propio.

| Identificador (código) | Etiqueta en la lámina | Nota | Origen |
|---|---|---|---|
| `owner` | Titular | La persona responsable del animal. No es "dueño" en las láminas: titularidad es lo que el sistema registra y transfiere | UI |
| `vet` | Veterinario/a | Rol de aplicación. La matrícula la aprueba una revisión humana, nunca una validación automática | UI |
| `shelter` | Refugio | Cubre refugio y red de rescate cuando la distinción no importa; cuando importa, se usan las etiquetas de la sección E | UI |
| `govt` | Autoridad local (municipio) | La cuenta de gobierno con territorio asignado. **Acuñada**: la aplicación dice "Gobierno" y "Jurisdicción", nunca "Municipio" | acuñada |
| `admin` | Administración de la plataforma | Alcance universal, por definición del rol. Se nombra en la lámina 5 para que no se descubra después. **Es el rol, no el portal**: el portal es "Portal de administración" | acuñada |
| — (sin sesión) | Vecino/a | Quien escanea o encuentra un animal sin tener cuenta. En la aplicación aparece como recorrido público, no como rol | UI |
| `caretaker` | Cuidador/a | Persona de confianza que cuida un animal ajeno por un tiempo acotado. **No es titularidad**, y esa diferencia es una lámina entera | UI |
| adoptante | Adoptante | | UI |

Los roles de aplicación están declarados en `db/schema.ts` (`userRoleEnum`), y son
cuatro: titular, veterinario, gobierno y administración. El vecino y el cuidador no
son roles de cuenta.

## B. Los portales y los tipos de cuenta

| Identificador (código) | Etiqueta en la lámina | Nota | Origen |
|---|---|---|---|
| `app/(app)` | Portal del titular | Libreta, eventos, extravío, compartir | acuñada |
| `app/org` | Portal de la organización | Clínica, refugio, red de rescate, autoridad sanitaria | acuñada |
| `app/gob` | Portal de la autoridad local | Territorio, indicadores, bandejas de trabajo. **Nunca "Portal de gobierno" ni "Portal del organismo"**: eran dos nombres distintos para esta misma caja | acuñada |
| `app/admin` | Portal de administración | Moderación, reglas, organizaciones, usuarios. Es la puerta; quien la usa es la Administración de la plataforma | acuñada |
| `app/(public)` | Portal público | Todo lo que se ve sin cuenta: credencial, adopciones, mascotas perdidas, denuncias, transparencia | acuñada |
| `app/(auth)` | Ingreso | Registro e inicio de sesión | acuñada |
| `personal` | Cuenta de persona | Puede ser titular de un animal | acuñada |
| `institutional` | Cuenta institucional | **No puede** ser titular de un animal: lo impide una restricción de base de datos, no una regla de pantalla | acuñada |

Las cinco etiquetas de portal son acuñadas porque en la aplicación los portales no se
nombran: se entra en ellos. En la lámina hay que llamarlos de alguna manera.

## C. El animal y su credencial

| Identificador (código) | Etiqueta en la lámina | Nota | Origen |
|---|---|---|---|
| `pets` | Mascota | El animal. En el modelo es la credencial misma, no algo que tenga una credencial | UI |
| alta | Alta de la mascota | El momento en que se emite la credencial | acuñada |
| `public_token` | Credencial (código público) | Código único que resuelve a la página pública. El sistema reconoce <!-- fact:token_prefixes -->12<!-- /fact --> prefijos distintos (`lib/observability/redact.ts`); **ninguno se muestra en una lámina** | UI |
| QR | Código QR | Lo dibuja el navegador como función pura de la dirección; no se inyecta desde el servidor (`components/ui/CredentialQr.tsx`) | UI |
| `pet_tags` | Chapita | La chapa física con el código. **Nunca "chapa física"**: la aplicación dice "chapita" y la ruta también | UI |
| cartel | Cartel | La hoja imprimible para pegar en la calle | UI |
| `pet_identifications` | Identificación (chip o tatuaje) | Polimórfica. **No hay mandato nacional de microchip**: es adopción de una práctica, no cumplimiento legal | UI |
| `pet_status` | Estado de la mascota | Activa, perdida o fallecida | UI |
| `lookup-public-credential.ts` | Puerta única de resolución | Todo escaneo entra por acá, y el techo de consultas corre antes de tocar un solo dato | acuñada |
| frontera de divulgación | Frontera de divulgación | Lo que el titular decide mostrar, campo por campo (`src/modules/pets/application/read/load-public-credential.ts`) | acuñada |
| chip "NIVEL n" | Nivel 0 / Nivel 1 / Nivel 2 | Cuánto muestra la credencial pública. Escanear es el nivel más bajo: identidad, sin historia clínica. **La pantalla dice literalmente "NIVEL"** (`app/(public)/p/[publicToken]/page.tsx`), así que la etiqueta no es una invención del mazo | UI |
| `libreta` | Libreta | La historia del animal tal como la ve su titular | UI |
| `libreta_share_tokens` | Enlace revocable de la libreta | El mecanismo real por el que un veterinario ve la historia: el titular comparte, con vencimiento y revocación | acuñada |
| `scan_events` | Registro de escaneo | No es parte permanente del historial ni una tabla aparte: son asientos que se purgan. No dibujarlo dentro de la columna vertebral | acuñada |
| `lib/infra/scan-retention.ts` | Purga automática del escaneo | La única cota de retención de toda ubicación del producto | acuñada |

## D. La columna vertebral y sus copias

Esta sección es casi toda acuñada. Son mecanismos internos: no hay pantalla que los
nombre, y hay que nombrarlos igual en las cuatro láminas que los tocan.

| Identificador (código) | Etiqueta en la lámina | Nota | Origen |
|---|---|---|---|
| `pet_events` | Historial de la mascota | Solo se agrega | acuñada |
| `case_events` | Historial del caso | Misma regla que el anterior, para los casos | acuñada |
| `EVENT_TYPES` | Catálogo de tipos de evento | <!-- fact:event_types -->55<!-- /fact --> tipos, en `packages/contract/src/events/event-types.ts`, compartidos por la web y el celular | acuñada |
| `lib/infra/amendment.ts` | Asiento de corrección | Una corrección es un asiento nuevo que tapa al anterior sin destruirlo. **Nunca decir "imposible de modificar"**: existe un permiso auditado y acotado a la transacción | acuñada |
| `db/migrations/0127_pet_events_append_only.sql` | Cerrojo de historial | El disparador de base que bloquea editar y borrar. **No es el cerrojo de base de datos de la sección H**: aquél decide alcance, éste protege el pasado | acuñada |
| `app.allow_event_mutation` | Excepción auditada | La única puerta para tocar un asiento existente. Exige un actor identificado y escribe una fila de auditoría | acuñada |
| `audit_log` | Registro de auditoría | Quién hizo qué, del lado operativo | UI |
| `lib/projections` | Vista derivada | Cálculo puro sobre el historial. Hay <!-- fact:projections -->13<!-- /fact --> | acuñada |
| columnas `pets.*` | Copia operativa | Se escribe en paralelo **a propósito**. Nunca le gana al historial | acuñada |
| `lib/infra/rederive-pet-cache.ts` | Re-derivación desde el historial | Vuelve a calcular la copia desde los asientos, plegando las correcciones | acuñada |
| deriva copia ↔ historial | Detección de deriva · Detector de deriva | **Nunca "desvío"**: era el segundo nombre del mismo mecanismo. El detector completo (`scripts/detect-pet-cache-drift.ts`) **solo lee, nunca repara**, y hoy no está agendado | acuñada |

## E. Custodia, titularidad y organizaciones

| Identificador (código) | Etiqueta en la lámina | Nota | Origen |
|---|---|---|---|
| `ownerships` | Tenencia | La fila que dice quién tiene qué relación con el animal, y desde cuándo. **Nunca "vínculo de custodia"**: la aplicación ya dice "tenencia" | UI |
| `ownership_role = owner` | Titularidad | El vínculo que manda. Cinco roles de tenencia conviven en el modelo; solo éste es titularidad | UI |
| `ownership_role = co_owner` | Co-dueño | Titularidad compartida y permanente. Convive con una titularidad activa; no la reemplaza y no se vigila contra el historial | UI |
| `shelter_custody` | Custodia de refugio | También la usa un vecino que levanta un animal de la calle | UI |
| `foster` | Tránsito | Cuidado temporal bajo el paraguas de una organización | UI |
| `pet_caretaker_grants` | Cuidado temporal | Una sola habilitación activa por animal. No transfiere titularidad | UI |
| `organizations` | Organización | Par de la persona en el modelo, no una carpeta que la contenga | UI |
| `org_type = clinic` | Clínica | | UI |
| `org_type = shelter` | Refugio | | UI |
| `org_type = rescue_network` | Red de rescate | | UI |
| `org_type = sanitary_authority` | Autoridad sanitaria | Es un tipo de organización, distinto de la cuenta de gobierno | UI |
| `organization_memberships` | Pertenencia | Una persona puede pertenecer a varias organizaciones a la vez | acuñada |
| `ORGANIZATION_CAPABILITIES` | Capacidad otorgada | <!-- fact:org_capabilities -->16<!-- /fact --> capacidades otorgables dentro de una organización (`db/schema.ts`). En plural, en un nodo: "Capacidades otorgadas" | acuñada |
| `pet_transfers` | Transferencia | Cambio de titularidad entre personas, o de custodia entre organizaciones | UI |
| `custody_disputes` | Disputa de custodia | | UI |
| `report-dispute-tip.ts` | Aviso neutral | Lo que reemplaza al aviso al titular cuando la titularidad está en revisión: va a la autoridad revisora, no a las partes | acuñada |
| acompañamiento | Acompañamiento de adopción | Una organización publica y evalúa, y el animal **sigue viviendo con su familia**. Es la etiqueta que evita el malentendido más caro del sistema | UI |
| `adoption` | Adopción | | UI |

## F. Crisis: extravío, hallazgo, denuncia

| Identificador (código) | Etiqueta en la lámina | Nota | Origen |
|---|---|---|---|
| `lost` | Extravío | | UI |
| `found` | Hallazgo | | UI |
| `/perdidas` | Listado público de mascotas perdidas | **Listado con filtros, no mapa.** La etiqueta lo dice para que el dibujo no invente un mapa | UI |
| `/encontre` | Aviso del vecino | La pantalla sin cuenta desde la que un vecino avisa. El teléfono del titular aparece solo si el titular lo habilitó y el animal está perdido | acuñada |
| `notify-owner-of-found-pet.ts` | Aviso al titular | El aviso que sale de esa pantalla. **Nunca "Vecino/a avisa que la encontró"**: era el mismo mecanismo con otro nombre. No escribe evento ni abre caso | acuñada |
| `report-pet-sighting.ts` | Avistaje | Lo vio, no lo tiene | UI |
| `lib/infra/lost-pet-broadcast.ts` | Difusión a organizaciones verificadas | Acotada a la jurisdicción y sin datos personales. **No es una alerta pública** | acuñada |
| `lib/infra/notification-service.ts` | Notificación en la aplicación | La campanita. El único canal externo es el aviso al navegador, apagado por defecto | UI |
| `propose-return-as-vecino.ts` | Devolución acordada | Entre personas, con aceptación del titular | UI |
| `welfare_reports` | Denuncia de bienestar animal | <!-- fact:denuncia_kinds -->9<!-- /fact --> tipos en el formulario público (`src/modules/welfare/domain/types.ts`) | UI |
| `app/(public)/denuncias/nueva/page.tsx` | Formulario público de denuncia | Sin cuenta. Los nueve tipos salen del catálogo, no de la pantalla | UI |
| `reference-code.ts` (código `DEN`) | Código de seguimiento | El código que se lleva quien denuncia. **Nunca "constancia"**: la constancia es la pantalla, no el código | UI |
| `app/(public)/denuncias/codigo/[code]/page.tsx` | Comprobante público | Confirma que la denuncia existe y cuándo se presentó. **No** muestra su estado | UI |
| `lib/infra/welfare-uploads.ts` | Carga firmada | El ticket de subida de la evidencia. Es lo contrario del enlace firmado de la sección H: uno sube, el otro sirve | acuñada |
| `app/gob/denuncias/page.tsx` | Bandeja de la autoridad local | Moderación y triaje en una sola pantalla, acotada por jurisdicción | UI |
| `bite_reported` | Mordedura | **No es un tipo de denuncia.** Va por el circuito clínico y arranca la observación antirrábica | UI |
| observación antirrábica | Observación antirrábica | Diez días, según la ordenanza de CABA | UI |
| `cases` / código `CAS` | Caso | El expediente que agrupa el trabajo. Las denuncias conservan su propia referencia, y las disputas la suya. **No confundir con "Caso de uso"** (sección H), que es una pieza de software | UI |
| 911 | Emergencias 911 (fuera del sistema) | Un número que una persona marca. **No hay integración**, y dibujarla con línea llena haría creer que miMAR avisa | UI |

## G. Gobierno: territorio, indicadores, exportaciones

| Identificador (código) | Etiqueta en la lámina | Nota | Origen |
|---|---|---|---|
| `jurisdiction` | Jurisdicción (territorio) | Provincia, localidad y, para algunas superficies, barrio | UI |
| `govt_assignments` | Asignaciones de jurisdicción | El territorio que tiene asignado una cuenta de gobierno. Todo el alcance sale de acá | acuñada |
| `lib/analytics/jurisdiction-scope.ts` | Selector de provincia y localidad | Lo que el operador elige en pantalla, siempre dentro de sus asignaciones | acuñada |
| `lib/domain/jurisdiction-canonical.ts` | Estrechar el alcance | Nunca ampliarlo. Un parámetro en la dirección no agrega territorio | acuñada |
| `lib/metrics/scope.ts` | Cláusula de alcance en la consulta | El recorte viaja dentro de cada consulta, no como filtro de pantalla | acuñada |
| `gov-scope` | Alcance del operador | Lo que la cuenta de gobierno tiene asignado, ya resuelto | UI |
| sesión de gobierno | Sesión del operador | Quién pide. De acá sale el alcance, y de ningún otro lado | acuñada |
| `lib/metrics/types.ts` | Agregado por localidad | La fila de un tablero antes de pasar por el umbral | acuñada |
| `panorama` | Panorama | El tablero territorial. **Nunca "tablero de la autoridad local"**: la aplicación lo llama Panorama y el funcionario lo va a encontrar así | UI |
| `app/gob/cola` | Cola de aprobaciones | Matrículas veterinarias, verificación de organizaciones y credenciales RUPGA. La pantalla dice "Aprobaciones". **No es la Bandeja de la autoridad local** (sección F), que es de denuncias | UI |
| `padron` | Padrón | La sección del portal. **No es la exportación**, que tiene su propia fila | UI |
| `censo` | Censo | | UI |
| `vigilancia` | Vigilancia | | UI |
| `mortalidad` | Mortalidad | | UI |
| `KPI_CATALOG_LIST` | Indicador · Catálogo de indicadores | <!-- fact:kpi_descriptors -->86<!-- /fact --> descriptores en `lib/metrics/kpi-catalog.ts`. Cada uno declara qué cuenta, sobre qué población y en qué ventana | UI |
| `presentation-guards` | Guarda de presentación | Cuando el denominador es demasiado chico, la pantalla lo dice en vez de dibujar un porcentaje. Son cuatro, así que en un nodo va en plural: "Guardas de presentación" | acuñada |
| `metric-legal-basis` | Respaldo normativo | **Solo dos indicadores citan una norma**, y las dos son de CABA y provincia de Buenos Aires | acuñada |
| datos abiertos | Datos abiertos | Agregado y público, con umbral. `docs/datos-abiertos` | UI |
| `app/gob/analytics/export/actions.ts` | Exportación para el organismo | Fila por fila, acotada al propio territorio, **sin supresión de celdas**, por decisión registrada. No se la llama "anonimizada" ni "padrón del territorio": lo segundo se confundía con la sección Padrón | acuñada |

## H. Autorización, seguridad y privacidad

| Identificador (código) | Etiqueta en la lámina | Nota | Origen |
|---|---|---|---|
| `lib/supabase/middleware.ts` | Paso previo | Refresca la sesión y sella cabeceras. **No autoriza y no pone techo de pedidos**, y por eso no se pinta de rojo. Nunca "borde de la aplicación": ese nombre lo hacía parecer un control | acuñada |
| `lib/infra/auth-guards.ts` | Guardia de portal | Rol y alcance, en la capa de entrada de cada portal. Nunca "guardia de frontera": chocaba con la frontera de divulgación | acuñada |
| `lib/infra/live-user.ts` (`requireLiveUser`) | Guardia de sesión viva | Mantenimiento, sesión, cuenta borrada, cuenta desactivada, turno vencido, rol y tipo de cuenta, en ese orden. Nunca "compuerta de vigencia" ni "cadena de permiso" | acuñada |
| `profiles` (`lib/infra/request-cache.ts`) | Perfil | La fila que decide: rol, tipo de cuenta, bajas. La autoridad se lee de la base, nunca del token | acuñada |
| `src/modules` | Caso de uso | La pieza de software que escribe. **No es un "Caso"** de la sección F | acuñada |
| `db/index.ts` | Conexión de la aplicación | Salta el cerrojo de base de datos **por diseño**: para la aplicación, la cadena de guardias *es* la autorización | acuñada |
| PostgREST | Puerta pública de datos | La superficie que habla directo con la base. El celular **no** la usa | acuñada |
| cliente PostgREST | Cliente que habla directo con la base | Quien entra por esa puerta. Lo único que lo frena es el cerrojo de base de datos | acuñada |
| RLS (`db/rls.sql`) | Cerrojo de base de datos (fila por fila) | <!-- fact:rls_enabled_tables -->55<!-- /fact --> tablas lo declaran (`docs/architecture/rls-coverage.md`). **Fija la fila, no la columna** | acuñada |
| `lib/supabase/admin.ts` | Llave de servicio (salta el cerrojo) | <!-- fact:service_role_call_sites -->34<!-- /fact --> lugares la usan **por diseño**. Va en la misma lámina que el cerrojo | acuñada |
| `scripts/check-authz-guards.ts` | Control automático de cobertura de guardias | Falla la compilación si una ruta institucional pierde su guardia | acuñada |
| `OPERATOR_SHIFT_MS` | Turno del operador | <!-- fact:operator_shift_hours -->8<!-- /fact --> horas antes de exigir reingreso | acuñada |
| documento autodeclarado | Documento que declara la persona | **El documento es declarado, no validado contra ningún registro estatal** | acuñada |
| `hashDni` | Huella criptográfica del documento | Con pimienta. No hay columna con el número en claro. Prueba que la misma persona escribió el mismo número dos veces, no de quién es | acuñada |
| `dniLast4` | Últimos cuatro dígitos | Para desambiguación humana | acuñada |
| `lib/media/validate.ts` | Adjunto o foto | Lo que una persona sube | UI |
| `db/migrations/0206_uploads_staging_bucket.sql` | Depósito privado | Sin política pública: la autorización vive en quien firma | acuñada |
| `lib/infra/storage.ts` | Enlace firmado de vida corta | Los archivos viven detrás de enlaces que vencen a los <!-- fact:signed_url_ttl_seconds -->3600<!-- /fact --> segundos. **Sirve** un archivo; el que lo **sube** es la carga firmada (sección F) | acuñada |
| `ANONYMITY_K` | Umbral de anonimato | K = <!-- fact:k_anonymity_k -->5<!-- /fact --> (`lib/metrics/anonymity.ts`), más supresión complementaria contra la resta | acuñada |
| art. 14 / art. 16 | Derecho de acceso (art. 14) · Derecho de supresión (art. 16) | Ley 25.326. La supresión no borra la fila del historial: la redacta dentro de una ventana auditada | acuñada |
| `lib/observability/redact.ts` | Redacción antes de reportar un error | Solo del lado del servidor | acuñada |
| `PUBLIC_TOKEN_READ_LIMIT` | Techo de consultas | <!-- fact:throttle_per_min -->600<!-- /fact --> por minuto y <!-- fact:throttle_per_hour -->6000<!-- /fact --> por hora sobre la lectura pública, por conexión. **Falla abierto**, y no protege ningún dato | acuñada |
| `lib/infra/rate-limit.ts` | Techo de pedidos | El limitador compartido: consultas y envíos. Es una cubeta distinta de la anterior, y una lámina que las junta lo tiene que decir | acuñada |

## I. Integraciones externas — todas con trama punteada

Ninguna de estas siete existe hoy. La trama punteada es obligatoria y no se
reemplaza por gris, y **ninguna se ablanda con un "en desarrollo" simpático**.

| Identificador (código) | Etiqueta en la lámina | Nota | Origen |
|---|---|---|---|
| `miarg-oidc` | Mi Argentina (integración prevista, hoy no existe) | Andamiaje apagado por configuración. Ninguna cuenta tiene identidad federada | acuñada |
| RENAPER | RENAPER (no existe) | No hay verificación de identidad contra registros estatales, ni proveedor elegido | acuñada |
| SENASA | SENASA (exportación, sin notificación) | El motor de exportación existe; la pantalla y el envío, no | acuñada |
| registro PPP | Registro provincial (exportación pendiente) | La declaración jurada existe; el archivo de intercambio con la provincia, no | acuñada |
| canal estatal de denuncias | Canal estatal externo (integración prevista, hoy no existe) | La propia página pública lo aclara. No dibujar la flecha llena | acuñada |
| App Links | Apertura directa desde el código QR (no existe hoy) | El código abre el navegador, no la aplicación | acuñada |
| reporte de errores del navegador | Reporte de errores del navegador (no existe) | El error muere en la pestaña. La decisión de proveedor está abierta y es primero legal | acuñada |

## J. El celular y la web

| Identificador (código) | Etiqueta en la lámina | Nota | Origen |
|---|---|---|---|
| `apps/mobile/app.config.ts` | Aplicación Android | | UI |
| `app/layout.tsx` | Plataforma web miMAR | | UI |
| Supabase | Base de datos, autenticación y archivos | Las tres cosas en un solo proveedor, y por eso en un solo nodo. En una lámina que sólo necesita la base, la forma corta es "Base de datos" | acuñada |
| pedido entrante | Pedido del navegador o del teléfono | Lo que origina la cadena de guardias. Va sin color: no es una pieza del sistema | acuñada |
| `apps/mobile/src/api/client.ts` | Plano de datos | El pedido con credencial de sesión (portador) | acuñada |
| `apps/mobile/src/auth/supabase-auth.ts` | Plano de autenticación | Renovación directa del token, y nada más | acuñada |
| `apps/mobile/src/auth/secure-store-auth-storage.ts` | Llavero del dispositivo | El único lugar donde vive el token de renovación | acuñada |
| `app/api/v1/me/route.ts` | Puerta de datos controlada | Por acá pasa todo lo que el celular pide. **No** es la puerta pública de datos | acuñada |
| `lib/infra/api-v1.ts` | Sobre de respuesta | Forma obligatoria de toda respuesta, con sus techos de pedidos | acuñada |
| `packages/contract/src/index.ts` | Paquete de contrato | El vocabulario compartido: si la web y el celular discrepan, discrepan acá primero | acuñada |
| `apps/mobile/src/credential/credential-cache.ts` | Copia local de la credencial | Solo para mostrar, siempre fechada con la hora del servidor | acuñada |
| `apps/mobile/src/observability/sentry.ts` | Reporte de fallas del teléfono | Existe **solo** en el celular, y hoy sin filtro propio | acuñada |

## K. Despliegue y ejecución

| Identificador (código) | Etiqueta en la lámina | Nota | Origen |
|---|---|---|---|
| Vercel | Nube de aplicación | São Paulo. El código se publica solo al enviar un cambio a la rama principal | acuñada |
| dominio propio | Dominio propio (www.mimar.com.ar) | Alias de producción activo del mismo despliegue. **Ya no es un nodo rayado** | acuñada |
| base de producción | Base de datos de producción (no existe hoy) | Hay una sola base viva, la de ensayo. Este sí es un nodo rayado | acuñada |
| `scripts/migrate.ts` | Migraciones | Solo hacia adelante, nunca editadas. **Paso manual y aparte**: el despliegue automático no las aplica | acuñada |
| `lib/infra/cron-dispatcher.ts` | Repartidor de tareas | La tarea diaria reparte <!-- fact:cron_jobs -->23<!-- /fact --> trabajos aislando la falla de cada uno | acuñada |
| `app/api/cron` | Tarea programada | El nombre genérico. Cada nodo le agrega cuál: "Tarea programada diaria", "Tarea programada: cubo de indicadores", "Tarea programada de reconciliación" | acuñada |
| `app/api/cron/daily/route.ts` | Tarea programada diaria | Reparte el resto de los trabajos | acuñada |
| `app/api/cron/refresh-cube/route.ts` | Tarea programada: cubo de indicadores | | acuñada |
| `apps/mobile/eas.json` | Compilación de la aplicación Android | | acuñada |
| Google Play | Tienda: canal de prueba interna | No es la pista de producción y no la baja el público | acuñada |

## L. Calidad y auditoría

| Identificador (código) | Etiqueta en la lámina | Nota | Origen |
|---|---|---|---|
| `pnpm verify` | Cadena de verificación | <!-- fact:verify_fences -->68<!-- /fact --> guardas automatizadas. **Nunca "compuerta de calidad" ni "reglas automáticas"**: eran tres nombres para la misma cosa | acuñada |
| `pnpm test:verified` | Suite verificada | Desconfía del código de salida de la suite en las dos direcciones (`scripts/run-verified-suite.ts`) | acuñada |
| `.github/workflows` | Integración continua | <!-- fact:ci_workflows -->7<!-- /fact --> flujos | acuñada |
| `e2e` | Recorrido de navegador | <!-- fact:e2e_specs -->45<!-- /fact --> recorridos. Compuerta **aparte**, nocturna, hoy en rojo | acuñada |
| `docs/reviews/2026-09-fresh/README.md` | Auditoría 2026-09 · Lentes ejecutados · Lentes diferidos | Los lentes diferidos van rayados: no dibujarlos como cobertura | acuñada |
| refutación adversarial | Refutadores independientes · Revisión con contexto fresco | Quien revisa no escribió el código. Es lo que encontró el hallazgo crítico de la auditoría | acuñada |
| `docs/reviews/2026-09-fresh/BACKLOG.md` | Hallazgos abiertos | **Nunca "backlog"**: es una lámina en castellano | acuñada |
| canon de convenciones | Regla del canon | <!-- fact:canon_enforced -->176<!-- /fact --> de <!-- fact:canon_rows -->514<!-- /fact --> reglas tienen quién las haga cumplir. El resto no está roto: nadie se daría cuenta | acuñada |

---

## Cómo se verificó la columna Origen

Se buscó cada etiqueta candidata dentro de `app` y de `components` el 2026-09-02
sobre `c10f4ff03`. Una etiqueta marcada `UI` apareció al menos una vez como texto de
interfaz; una marcada `acuñada` no apareció ninguna. Cuatro hallazgos de ese barrido
que conviene conocer antes de discutir una etiqueta:

- **"Municipio" no aparece en ninguna parte de la interfaz.** La aplicación dice
  "Gobierno" y "Jurisdicción". "Autoridad local (municipio)" es una etiqueta del
  mazo, elegida porque en la sala hay municipios, no jurisdicciones.
- **Toda la sección D es acuñada.** No hay pantalla que hable de historial de solo
  agregado, de vista derivada ni de copia operativa. Es la sección donde más fácil
  se promete de más: una etiqueta acuñada describe un mecanismo, no una promesa de
  que el usuario la vaya a ver.
- **Las etiquetas de portal son acuñadas.** En la aplicación no se nombra el portal:
  se entra en él.
- **"Tenencia", "chapita", "Panorama" y el chip "NIVEL" sí están en la pantalla**, y
  por eso le ganaron a las alternativas acuñadas que proponían otras láminas. Cuando
  una palabra existe en la aplicación, gana: es la que el funcionario va a encontrar
  cuando entre.

## Qué NO se etiqueta

- El nombre interno del sistema y el prefijo de los códigos de credencial: viven en
  la columna de identificador, nunca en una lámina.
- Cualquier identificador técnico que se escape a la cara del usuario. Ya pasó en
  este producto —una pantalla mostró el nombre de una columna de base de datos— y es
  la misma clase de fuga que un código de error crudo.
- Números sin marcador. Si un número no está en una fila de estas tablas ni en
  `docs/presentation/2026-09-oficiales/00-guion.md`, no va en una lámina.
