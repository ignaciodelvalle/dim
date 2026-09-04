# Guion — presentación técnica a funcionarios municipales, {{FECHA_PRESENTACION}}

> Snapshot: `c10f4ff03` (`main`) · Facts: `docs/architecture/facts.json` generated 2026-09-02
> Verified against code on 2026-09-02 by writer E (opus subagent) · Status: draft
> Numbers in this file are `<!-- fact:key -->` markers checked by `__tests__/architecture-facts.test.ts`.

## Para qué sirve este archivo

Quince láminas, en orden, con el diagrama que entra en cada una y el mensaje que
tiene que quedarle al funcionario. No es el mazo: es la narrativa de la que sale el
mazo. Quien dibuja lee esto primero (`docs/presentation/2026-09-oficiales/README.md`
es su instructivo); quien expone lo usa como libreto.

**La fecha de la presentación es `{{FECHA_PRESENTACION}}`.** Va en la portada y en el
pie de cada lámina. Se reemplaza antes de armar el mazo, no después.

### Cómo se lee cada entrada

| Campo | Qué contiene |
|---|---|
| **Diagrama** | Cuál de los doce specs se dibuja, y en qué nivel: ejecutivo (reducción de hasta cinco nodos) o técnico (el diagrama completo) |
| **Mensaje clave** | Una sola oración: lo que el funcionario tiene que poder repetir al salir |
| **Hechos** | Los números que la lámina puede decir. Cada uno viaja como marcador verificado contra `docs/architecture/facts.json`. **Ningún número llega a una lámina sin marcador** |
| **Respaldo** | Dónde vive la afirmación en el código. Es lo que se contesta si alguien en la sala pregunta "¿y eso cómo lo sé?" |
| **Lo que NO se dice** | Lo que esta lámina específica no puede afirmar. No es una advertencia general: es el error que se cometería en esta lámina y no en otra |

### La regla de las láminas once y quince

**Las láminas 11 (privacidad y sus límites) y 15 (estado del piloto) van en el flujo
principal.** No son anexo, no son apéndice, no son "si queda tiempo". Un mazo que las
mueve al final o las saca se rechaza entero y se rehace.

El motivo no es moral, es de eficacia: la lista de límites de este proyecto salió de
una auditoría adversarial que encontró un problema crítico y lo cerró en un día. Un
mazo que muestra una auditoría y no muestra ningún hallazgo no es creíble. Decir
"encontramos uno crítico, lo confirmaron cinco revisores independientes y se cerró y
se desplegó el mismo día" es lo más fuerte que hay para decir en esa sala, y solo
funciona si las dos láminas incómodas están donde se ven.

### Dos notas de alcance

- **El spec `05-modelo-datos.md` no entra en las quince láminas.** Es material de
  anexo técnico, para la pregunta de un informático en la sala, no para el flujo.
- **Estado del piloto Android — confirmado por el PO (2026-09-02).** Se dice así, con
  estas palabras: **aplicación Android en prueba interna con un grupo de testers.** Ni
  una cifra: no digas cuántos testers son, ni en la lámina ni de palabra. Un número
  invita a la pregunta que sigue ("¿y cuántos de esos la usaron esta semana?"), y esa
  no la podés contestar desde el escenario. Lo que se puede leer en el repo es que la
  aplicación tiene tres perfiles de compilación (`apps/mobile/eas.json`: desarrollo,
  previa y producción, esta última con distribución a tienda). El número de
  compilación **no** se dice: no se puede verificar desde el código. La lámina 15 es
  donde va.

---

## Lámina 1 — El problema: mascotas sin identidad, datos sin territorio

- **Diagrama.** D1 — `01-contexto-sistema.md`, reducción ejecutiva (la mitad "hoy").
- **Mensaje clave.** Un municipio no puede hoy responder cuántos animales hay en su
  territorio, ni qué se les hizo, ni a quién avisarle cuando aparece uno — y la
  normativa le pide cosas concretas sin darle el instrumento para cumplirlas.
- **Hechos.** Ninguno numérico. Esta lámina describe un vacío, y un vacío no se
  cuantifica con los números de este repositorio.
- **Respaldo.**
  - `AGENTS.md#legal-framework` — el cuadro de normas que el sistema toma en cuenta:
    Ley Nacional 14.346, Ley Nacional 25.326, Ley CABA 4078, Ley Provincial 14.107,
    Ley CABA 5470, Ordenanza CABA 41.831 y las resoluciones de SENASA.
  - `docs/onboarding/guia-funcionario.md` — el mismo problema contado para la persona
    que va a estar en la sala.
  - `lib/metrics/metric-legal-basis.ts` — dónde se declara qué indicador tiene
    respaldo normativo y cuál no.
- **Lo que NO se dice en esta lámina.**
  - No se dice que exista un mandato argentino de microchip. No existe: la ley
    provincial admite chip **o** tatuaje y solo para perros potencialmente
    peligrosos, la norma de CABA exige collar con chapa y no menciona chip, y SENASA
    declara que no hay regulación nacional de identificación electrónica.
  - No se presenta ninguna de esas normas como jurídicamente verificada. La auditoría
    las confirmó **como anclas en el código**, no como citas legales correctas y
    vigentes. Eso lo tiene que mirar un abogado.
  - No se dice que miMAR sea un registro nacional adoptado. Es un piloto.

## Lámina 2 — La mascota es la credencial

- **Diagrama.** D3 — `03-ciclo-credencial.md`, nivel ejecutivo (la mitad de emisión).
- **Mensaje clave.** El animal tiene un código público único que resuelve a una
  página verificable con el celular: no hace falta que el vecino tenga cuenta, ni la
  aplicación, ni saber qué es miMAR.
- **Hechos.**
  - Prefijos de código de credencial reconocidos por el sistema:
    <!-- fact:token_prefixes -->12<!-- /fact -->.
- **Respaldo.**
  - `lib/infra/publicToken.ts` — la generación y el formato del código público.
  - `lib/observability/redact.ts` — la lista de prefijos, usada para que un código
    nunca quede escrito en un registro de diagnóstico.
  - `app/(public)/p/[publicToken]/page.tsx` — la página a la que resuelve.
- **Lo que NO se dice en esta lámina.**
  - No se dice que la credencial digital tenga hoy equivalencia legal con la libreta
    de papel. Eso depende de homologación por jurisdicción, y la recomendación al
    dueño sigue siendo conservar el papel.
  - No se muestra el nombre interno del sistema en la lámina, ni siquiera dentro de
    un código de ejemplo: para el ejemplo va un marcador de posición.

## Lámina 3 — Qué ve un vecino al escanear

- **Diagrama.** D3 — `03-ciclo-credencial.md`, nivel técnico (la mitad de lectura,
  con los niveles de divulgación).
- **Mensaje clave.** Escanear muestra identidad, no historia clínica: quién es el
  animal y cómo avisar, y nada más, salvo que el titular haya decidido otra cosa.
- **Hechos.**
  - Techo de lectura pública por dirección de origen:
    <!-- fact:throttle_per_min -->600<!-- /fact --> por minuto y
    <!-- fact:throttle_per_hour -->6000<!-- /fact --> por hora.
- **Respaldo.**
  - `src/modules/pets/application/read/load-public-credential.ts` — la consulta que
    arma la credencial pública; el teléfono del titular ni siquiera se pide a la base
    cuando no corresponde mostrarlo.
  - `lib/infra/public-token-throttle.ts` — el techo de lecturas.
  - `app/api/v1/pets/[publicToken]/credential/route.ts` — la misma credencial servida
    a la aplicación del celular, con la misma regla.
- **Lo que NO se dice en esta lámina.**
  - **No se dice que escanear el código muestre el historial.** Ése es el error de
    lectura más caro del sistema y ya apareció escrito en una página pública del
    propio producto. El historial requiere que el titular lo comparta.
  - El teléfono del titular aparece solo si el titular lo habilitó campo por campo
    **y** el animal está reportado como perdido. No es un dato público por defecto.
  - No se dibuja al cuidador temporal como contacto de la credencial: la fila de
    titularidad está fijada al rol de titular justamente para que el consentimiento
    del titular no publique el teléfono de un tercero.

## Lámina 4 — Titular, veterinario, refugio

- **Diagrama.** D2 — `02-topologia-portales.md`, nivel ejecutivo.
- **Mensaje clave.** Cinco portales distintos al mismo sistema — público, persona,
  institución, autoridad local y administración de plataforma — y cada uno ve el
  mundo desde su lugar, no una versión recortada del mismo tablero.
- **Hechos.** Ninguno numérico: la lámina es de forma, no de tamaño.
- **Respaldo.**
  - `app/(app)/layout.tsx` — el portal de la persona titular.
  - `app/org` — el portal de la organización (clínica, refugio, red de rescate,
    autoridad sanitaria).
  - `app/gob` — el portal de la autoridad local.
  - `app/admin` — la administración de la plataforma.
  - `db/schema.ts` — los roles, los tipos de cuenta y los roles de pertenencia a una
    organización, todos declarados ahí.
  - `docs/onboarding/guia-veterinario.md` y `docs/onboarding/guia-refugio.md` — lo
    que cada uno puede y no puede hacer, escrito para esa persona.
- **Lo que NO se dice en esta lámina.**
  - No se dice que el veterinario tenga acceso de lectura al historial "por portal".
    No existe: el mecanismo real es que el titular comparta, con enlace temporal
    revocable o con nivel médico público por tiempo acotado.
  - La matrícula profesional **no** se valida automáticamente contra el colegio: la
    aprueba una revisión humana en la Cola de aprobaciones de la autoridad local
    — otra pantalla que la Bandeja de denuncias.
  - No hay nada de pagos, aranceles ni facturación en el sistema. Una clínica lo va a
    preguntar; la respuesta es "no existe".

## Lámina 5 — Qué ve el municipio: su territorio, nada más

- **Diagrama.** D9 — `09-vistas-gobierno.md`, nivel técnico (el cerco de
  jurisdicción).
- **Mensaje clave.** Una cuenta de gobierno ve exactamente su territorio asignado: el
  recorte no es un filtro de pantalla que se pueda sacar, es una condición que se
  suma dentro de cada consulta a la base.
- **Hechos.** Ninguno numérico en la lámina; el conteo de indicadores va en la
  siguiente.
- **Respaldo.**
  - `lib/infra/gov-scope.ts` — la resolución del alcance del operador.
  - `lib/infra/gob-pet-subview.ts` — la vista de un animal desde gobierno: los casos
    de un barrio vecino o de otra provincia no entran en la respuesta.
  - `app/gob/panorama` — el tablero territorial.
  - `docs/architecture/government-views.md` — el mecanismo completo, con las guardas.
- **Lo que NO se dice en esta lámina.**
  - La administración de plataforma **sí** es universal. Eso es la definición de ese
    rol, no una fuga, y conviene decirlo en la misma lámina en vez de que lo
    descubran.
  - No se dice que todas las pantallas agreguen a nivel barrio. La lista de
    vacunación vencida agrega **por localidad**; decir el nivel de agregación en voz
    alta evita una expectativa que después se rompe.
  - No se dice que el operador pueda ampliar su alcance pidiendo una unidad mayor: lo
    puede pedir, y las filas vuelven igual recortadas a sus asignaciones.

## Lámina 6 — Un número canónico: el contrato de indicadores

- **Diagrama.** D9 — `09-vistas-gobierno.md`, recuadro del catálogo de indicadores.
- **Mensaje clave.** Cada indicador declara qué cuenta, sobre qué población y en qué
  ventana, antes de mostrarse — y cuando el denominador es demasiado chico para ser
  honesto, la pantalla lo dice en vez de dibujar un porcentaje.
- **Hechos.**
  - Descriptores en el catálogo de indicadores:
    <!-- fact:kpi_descriptors -->86<!-- /fact -->.
- **Respaldo.**
  - `lib/metrics/kpi-catalog.ts` — el catálogo: cada entrada con su definición, su
    fuente y su meta.
  - `lib/metrics/presentation-guards.ts` — las guardas de presentación: denominador
    cero, población chica, variación implausible, cobertura de censo baja.
  - `lib/metrics/metric-legal-basis.ts` — qué indicador cita una norma.
- **Lo que NO se dice en esta lámina.**
  - **No se dice que todos los indicadores estén anclados en una norma.** Solo dos
    entradas citan una norma real, y las dos están acotadas a CABA y a la provincia
    de Buenos Aires. Un funcionario de otra jurisdicción ve una referencia genérica.
    Lo honesto: los dos indicadores con norma la citan resuelta a la jurisdicción del
    operador, el resto declara fuente y meta, y uno declara explícitamente que no
    existe mandato legal.
  - La penetración de microchip **no** es un indicador de cumplimiento legal: mide
    adopción de una práctica, porque no hay norma nacional que la exija.

## Lámina 7 — Extravío y hallazgo: el flujo de crisis

- **Diagrama.** D8 — `08-crisis-perdida-y-denuncias.md`, carril de extravío, nivel
  técnico.
- **Mensaje clave.** Cuando un animal se pierde, el titular decide qué se publica; el
  vecino que lo encuentra puede avisar sin tener cuenta; y todo lo que pasa en el
  medio queda escrito.
- **Hechos.** Ninguno numérico.
- **Respaldo.**
  - `src/modules/events/application/lifecycle/set-pet-lost-use-case.ts` — la marca de
    extravío y lo que habilita.
  - `app/(public)/p/[publicToken]/encontre/page.tsx` — el aviso del vecino, sin
    sesión.
  - `src/modules/lost/infrastructure/lost-listing-read.ts` — el listado público de
    perdidas.
  - `app/(public)/perdidas/page.tsx` — la pantalla.
- **Lo que NO se dice en esta lámina.**
  - **El listado público de mascotas perdidas no es un mapa.** Es una lista con
    filtros por provincia.
    La página de ayuda del propio producto llegó a prometer un mapa y se corrigió el
    texto, no se construyó el mapa.
  - Las coordenadas del último avistaje **no salen** de la base en el listado
    público: la consulta pide un sí/no para dibujar "punto marcado en el mapa" dentro
    de la credencial individual, nunca la latitud ni la longitud.
  - El servicio de notificaciones tiene un solo canal externo, el aviso al navegador,
    y va cifrado de punta a punta. No hay mensajes de texto. El sistema sí manda
    correo transaccional en dos lugares —el enlace de acceso a una denuncia y la
    entrega de una exportación— y eso no es el canal de aviso.

## Lámina 8 — Denuncias de bienestar animal

- **Diagrama.** D8 — `08-crisis-perdida-y-denuncias.md`, carril de denuncia.
- **Mensaje clave.** Cualquier persona puede denunciar sin identificarse y se lleva un
  código; la denuncia entra en la bandeja de la autoridad local que corresponde por
  territorio, con la identidad del denunciante separada del contenido.
- **Hechos.**
  - Tipos de denuncia que ofrece el formulario público:
    <!-- fact:denuncia_kinds -->9<!-- /fact -->.
- **Respaldo.**
  - `src/modules/welfare/domain/types.ts` — los tipos, tal como se renderizan.
  - `app/(public)/denuncias/nueva/page.tsx` — el formulario.
  - `app/(public)/denuncias/codigo/[code]/page.tsx` — el comprobante público.
  - `app/gob/denuncias` — la bandeja de la autoridad local.
- **Lo que NO se dice en esta lámina.**
  - **No hay derivación automática a canales estatales externos.** La propia página
    de denuncias lo aclara: la integración está en desarrollo y el reporte queda
    guardado. Una lámina que dibuje una flecha hacia un organismo externo va a ser
    contradicha en la sala.
  - **"Mordedura" no es un tipo de denuncia.** Ninguno de los tipos del formulario lo
    es; la mordedura viaja por el circuito clínico y organizacional, y arranca la
    observación antirrábica.
  - El denunciante anónimo **no recibe novedades**: no hay canal de vuelta, por
    diseño. Y con el código solo se confirma que la denuncia existe y cuándo se
    presentó — ver el estado requiere sesión propia o un enlace enviado por correo.
  - miMAR **no** es un canal de urgencias. En una emergencia se llama al 911.

## Lámina 9 — La historia se escribe una sola vez

- **Diagrama.** D4 — `04-espina-eventos-y-caches.md`, nivel técnico.
- **Mensaje clave.** Los hechos sanitarios y de custodia se agregan, nunca se editan
  ni se borran: una corrección es un asiento nuevo que tapa al anterior sin
  destruirlo, y lo que ve la pantalla se deriva de esa columna vertebral.
- **Hechos.**
  - Tipos de evento en el catálogo: <!-- fact:event_types -->55<!-- /fact -->.
  - Vistas derivadas: <!-- fact:projections -->13<!-- /fact -->.
- **Respaldo.**
  - `db/migrations/0127_pet_events_append_only.sql` — los disparadores de base que
    rechazan una modificación o un borrado sobre el historial.
  - `packages/contract/src/events/event-types.ts` — el catálogo de tipos, compartido
    por la web y el celular.
  - `lib/infra/rederive-pet-cache.ts` — el detector de deriva entre las copias
    operativas y la columna vertebral.
  - `lib/projections` — las vistas derivadas.
- **Lo que NO se dice en esta lámina.**
  - **No se dice "imposible de modificar".** Existe un permiso de corrección
    auditado, acotado a la transacción y atribuido a quien lo usa — es lo que hace
    posible una supresión del artículo 16 sin borrar la fila. Decir "imposible" es
    una afirmación que la sala puede refutar leyendo la migración.
  - Las copias operativas se escriben en paralelo **a propósito**, y no todas se
    reconstruyen. Eso es una decisión declarada, no un descuido: lo que nunca pasa es
    que una copia le gane a la columna vertebral.
  - No se dibujan los eventos de escaneo como parte permanente del historial: no lo
    son.

## Lámina 10 — Quién puede hacer qué: dos carriles y un cerrojo de fondo

- **Diagrama.** D6 — `06-autorizacion.md`, nivel técnico.
- **Mensaje clave.** El permiso se resuelve dos veces: en la aplicación, que sabe
  quién sos y qué territorio te toca, y en la base de datos, que aplica reglas fila
  por fila aunque la aplicación se equivoque.
- **Hechos.**
  - Tablas con reglas de acceso fila por fila declaradas:
    <!-- fact:rls_enabled_tables -->55<!-- /fact -->.
  - Este número no se compara con el de tablas de la lámina 15: cuenta toda
    tabla que alguna migración declaró con seguridad fila por fila a lo largo
    de toda la historia SQL del repo, tablas internas incluidas (por ejemplo,
    la que lleva el registro de las propias migraciones); la lámina 15 cuenta
    en cambio las tablas vivas del esquema de hoy. Son dos conjuntos
    distintos, no una resta pendiente.
  - Capacidades otorgables dentro de una organización:
    <!-- fact:org_capabilities -->16<!-- /fact -->.
  - Duración del turno de un operador institucional antes de exigir reingreso:
    <!-- fact:operator_shift_hours -->8<!-- /fact --> horas.
- **Respaldo.**
  - `lib/infra/auth-guards.ts` — la cadena que resuelve identidad viva, rol, tipo de
    cuenta, turno y territorio.
  - `scripts/check-authz-guards.ts` — la guarda automatizada que falla la compilación
    si una ruta institucional pierde su control.
  - `db/schema.ts` — roles, tipos de cuenta y capacidades.
  - `lib/infra/operator-shift.ts` — el vencimiento de turno.
  - `docs/architecture/rls-coverage.md` — qué cubre y qué no cubre el cerrojo de base.
- **Lo que NO se dice en esta lámina.**
  - **No se dice que el cerrojo de base sea universal.** Hay
    <!-- fact:service_role_call_sites -->34<!-- /fact --> lugares donde el servidor
    usa una llave que lo saltea, y es por diseño: el servidor ya resolvió el permiso.
    Decirlo en la misma lámina donde se muestra el cerrojo es lo que hace creíble al
    cerrojo.
  - **Se dice que la auditoría encontró un agujero crítico ahí y que se cerró.** Un
    usuario con sesión podía reescribir su propia fila de perfil, incluida la columna
    que dice si es administrador. Lo encontró el paso que ataca las conclusiones de
    la propia auditoría, lo confirmaron cinco revisores independientes, y se cerró y
    se aplicó al entorno vivo el mismo día. Lo que **no** se dice es que la clase
    esté cerrada: falta la segunda puerta, ya identificada y en cola.
  - No se dice que la autorización esté enteramente en la capa de la aplicación:
    para al menos un camino de carga de archivo directa desde el navegador, la regla
    de base es lo único que la protege.

## Lámina 11 — Privacidad por diseño y sus límites declarados

> **Lámina de honestidad. Va acá, en el medio. No se mueve al anexo.**

- **Diagrama.** D7 — `07-privacidad.md`, nivel técnico.
- **Mensaje clave.** El documento de identidad nunca se guarda en claro, los datos
  agregados se publican con umbral, los archivos viven detrás de enlaces que vencen —
  y los límites que quedan están escritos con nombre, motivo y condición de
  reapertura, no maquillados.
- **Hechos.**
  - Umbral de anonimato de las celdas agregadas:
    <!-- fact:k_anonymity_k -->5<!-- /fact -->.
  - Vigencia de un enlace firmado a un archivo adjunto:
    <!-- fact:signed_url_ttl_seconds -->3600<!-- /fact --> segundos.
- **Respaldo.**
  - `lib/utils/dni-hash.ts` — el documento se guarda como resumen criptográfico y
    últimos cuatro dígitos. No hay columna con el número en claro.
  - `lib/metrics/anonymity.ts` — el umbral y la supresión de celdas chicas.
  - `lib/infra/storage.ts` — la vigencia de los enlaces firmados.
  - `app/api/v1/me/privacy/route.ts` — acceso y supresión de los artículos 14 y 16 de
    la Ley 25.326, también desde el celular.
  - `docs/architecture/privacy-known-limitations.md` — el registro de límites
    aceptados, con quién los aceptó y qué los reabre.
- **Lo que NO se dice en esta lámina.**
  - **El documento de identidad es declarado por la persona, no validado contra
    ningún registro estatal.** No hay verificación contra RENAPER y no hay proveedor
    elegido. Decirlo acá evita que un funcionario planifique sobre una identidad
    verificada que no existe.
  - **La exportación de padrón para el organismo no aplica supresión de celdas.** Es
    fila por fila, por decisión registrada del PO: un padrón con agujeros no es un
    padrón. Está acotada al propio territorio, sin identificadores directos, con
    enlace firmado y con registro de auditoría — y la re-identificación por
    agrupamiento queda abierta y declarada. No se presenta como "anonimizada".
  - **La web no tiene reporte de fallas; el celular sí.** Si el mazo muestra
    observabilidad, la muestra del lado del teléfono.
  - No hay tarea de limpieza de archivos ni política de retención automática para
    fotos y adjuntos. Existe borrado por evento, no recolección periódica.

## Lámina 12 — Datos abiertos y gobernanza

- **Diagrama.** D9 — `09-vistas-gobierno.md`, carril de exportación.
- **Mensaje clave.** Hay dos salidas de datos y no son la misma cosa: el dato abierto
  público, agregado y con umbral, y la exportación de padrón para el organismo, fila
  por fila y acotada a su territorio.
- **Hechos.**
  - Umbral aplicado al dato abierto público:
    <!-- fact:k_anonymity_k -->5<!-- /fact -->.
- **Respaldo.**
  - `docs/datos-abiertos/diccionario.md` — qué campos se publican.
  - `docs/datos-abiertos/metodologia.md` — cómo se calculan.
  - `lib/open-data/province-suppression.ts` — el umbral, más la supresión
    complementaria que impide recuperar una celda tapada restando contra el total.
  - `app/(public)/transparencia/datos/[dataset]/route.ts` — la descarga pública.
  - `lib/analytics/govt-exports.ts` — la exportación para el organismo, con lista
    blanca de campos: lo que no está declarado se descarta por construcción.
- **Lo que NO se dice en esta lámina.**
  - **No se mezclan las dos salidas en un solo dibujo.** Confundirlas es prometer
    umbral donde no lo hay, y es exactamente la inconsistencia que la auditoría
    encontró entre la documentación y el archivo real.
  - No se dice que el dato abierto ofrezca formato PDF: emite datos, no informes.
  - No se dice que la exportación para el organismo se ofrezca fuera del Estado. Si
    alguna vez se ofrece a un tercero, la política de umbral rige sin excepción y
    esta lámina cambia.

## Lámina 13 — Cómo sabemos que funciona: calidad y CI

- **Diagrama.** D12 — `12-calidad-y-auditoria.md`, nivel ejecutivo.
- **Mensaje clave.** Nada se da por bueno porque alguien lo diga: cada regla que
  importa tiene un verificador automático que rompe la compilación cuando se deja de
  cumplir, y el propio verificador de la suite desconfía del resultado de la suite.
- **Hechos.**
  - Guardas automatizadas en la cadena de verificación:
    <!-- fact:verify_fences -->68<!-- /fact -->.
  - Archivos de prueba de la web: <!-- fact:vitest_files -->1496<!-- /fact -->.
  - Recorridos de navegador: <!-- fact:e2e_specs -->45<!-- /fact -->.
  - Archivos de prueba de la aplicación de celular:
    <!-- fact:mobile_jest_files -->84<!-- /fact -->.
  - Flujos de integración continua: <!-- fact:ci_workflows -->7<!-- /fact -->.
  - Reglas del canon de convenciones que algo hace cumplir:
    <!-- fact:canon_enforced -->176<!-- /fact --> de
    <!-- fact:canon_rows -->514<!-- /fact -->.
- **Respaldo.**
  - `scripts/run-verified-suite.ts` — el verificador que ignora a propósito el código
    de salida de la suite y lo vuelve a plegar, para que una corrida que se cayó no
    pueda pasar por verde.
  - `scripts/check-ci-lint-parity.ts` — la guarda que falla si una regla entra en la
    verificación local y no en la de integración continua.
  - `.github/workflows` — los flujos.
  - `e2e/README.md` — las convenciones de los recorridos de navegador.
  - `CLAUDE.md` — la definición de "terminado" del proyecto, con las cuatro firmas de
    rojo que hay que saber distinguir.
- **Lo que NO se dice en esta lámina.**
  - **No se dice que verde signifique correcto.** Una suite en verde prueba que el
    código hace lo que su autor creía; no prueba que la creencia fuera cierta. Por
    eso hay además revisión adversarial con contexto fresco.
  - No se dice que la integración continua sea determinista: el trabajo de recorridos
    de navegador no lo es, y está registrado como tal.
  - No se presenta el número de reglas del canon como cobertura. "Se hace cumplir"
    significa que algo del árbol falla si la regla se rompe — no que la regla sea
    buena, ni actual, ni que cubra más que su enunciado literal. El resto no está
    roto: simplemente nadie se daría cuenta.

## Lámina 14 — Dónde corre y cómo se despliega, celular incluido

- **Diagrama.** D11 — `11-despliegue-runtime.md`, con el recuadro de D10 —
  `10-contrato-movil-web.md`.
- **Mensaje clave.** La web y el celular hablan el mismo idioma porque comparten el
  mismo paquete de contrato, y el trabajo programado del sistema sale de un solo
  repartidor de tareas.
- **Hechos.**
  - Tareas programadas declaradas en el proveedor:
    <!-- fact:vercel_crons_declared -->2<!-- /fact -->.
  - Trabajos diarios hacia los que reparte:
    <!-- fact:cron_jobs -->23<!-- /fact -->.
  - Puntos de entrada de la interfaz de programación:
    <!-- fact:route_handlers -->82<!-- /fact -->.
- **Respaldo.**
  - `vercel.json` — las tareas programadas declaradas.
  - `lib/infra/cron-dispatcher.ts` — el repartidor de tareas: cada trabajo corre aislado y el
    resultado se guarda después de cada uno, así una caída no se lleva la tanda.
  - `packages/contract` — el paquete compartido entre la web y el celular.
  - `apps/mobile/src/api/client.ts` — el cliente del celular: identidad por credencial
    de portador, un solo reintento, nunca un bucle.
  - `apps/mobile/eas.json` — los perfiles de compilación de la aplicación.
  - `docs/architecture/mobile-contract.md` — el contrato completo.
- **Lo que NO se dice en esta lámina.**
  - **No se dibuja una flecha de "prueba" a "producción".** Hay un solo entorno vivo.
    Se puede decir "piloto corriendo en un entorno vivo"; no se puede dibujar una
    promoción entre dos extremos que no existen los dos.
  - No se dibuja ninguna tarea programada que limpie almacenamiento: no hay ninguna.
  - No se dice que la aplicación de celular esté publicada al público general. Es una
    aplicación Android en prueba interna con un grupo de testers — ver la nota de
    alcance del preámbulo, y no agregues una cifra.

## Lámina 15 — Estado del piloto y hoja de ruta

> **Lámina de honestidad. Cierra la presentación. No se mueve al anexo.**

- **Diagrama.** D1 — `01-contexto-sistema.md`, la banda "hoy / próximo", nivel
  ejecutivo.
- **Mensaje clave.** Lo que está construido está construido y se puede probar hoy; lo
  que falta está nombrado con su motivo, y la federación con Mi Argentina es la
  premisa del diseño, no una función entregada.
- **Hechos.**
  - Pantallas: <!-- fact:pages -->262<!-- /fact -->.
  - Migraciones de base de datos aplicadas en orden:
    <!-- fact:migrations -->211<!-- /fact -->.
  - Tablas: <!-- fact:tables -->53<!-- /fact -->.
  - Este conteo son las tablas vivas del esquema de hoy, distinto del conteo
    de tablas con seguridad fila por fila declarada de la lámina 10 (que
    incluye también tablas internas y toda la historia de migraciones). Son
    dos conjuntos distintos, no una resta pendiente.
  - Celular: **aplicación Android en prueba interna con un grupo de testers.**
    Confirmado por el PO el 2026-09-02, y esa es la frase entera. Sin cifra de
    testers, sin número de compilación, sin fecha de publicación.
- **Respaldo.**
  - `docs/presentation/2026-09-oficiales/limites-honestos.md` — la lista completa de
    lo que no existe, con su fuente.
  - `docs/onboarding/README.md` — qué se sacó de cada guía de usuario externo por no
    existir todavía. Leído al revés, es la lista de pendientes vista desde la persona.
  - `docs/architecture/integrations.md` — el estado de cada integración externa.
  - `lib/infra/miarg-oidc.ts` — el andamiaje de Mi Argentina, apagado por
    configuración: la devolución de identidad no está implementada y lanza error en
    vez de escribir medio perfil.
- **Lo que NO se dice en esta lámina.**
  - **No se anuncia fecha para Mi Argentina.** Hoy no hay ninguna cuenta con
    identidad federada, y el camino de ida y vuelta no está implementado. Se dibuja
    con trama punteada o no se dibuja.
  - **No se dice "registro nacional".** Es un piloto sobre un entorno vivo.
  - No se promete notificación automática a SENASA: existe el motor de exportación,
    no existe la pantalla ni el envío.
  - No se promete importación de padrones municipales preexistentes: no hay
    importador, y los datos del territorio arrancan de cero.
  - **No se dice cuántos testers son.** La frase es "en prueba interna con un grupo de
    testers" y termina ahí. Una cifra en esta lámina se lee como una medida de
    adopción, que es justo lo que no es, y abre la repregunta que no se puede contestar
    desde el escenario. Tampoco se menciona número de compilación ni fecha de
    publicación en la tienda: ninguno de los dos se verifica desde el código.
