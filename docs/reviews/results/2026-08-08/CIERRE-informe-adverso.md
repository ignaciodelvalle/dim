# miMAR — Revisión adversa de UI/UX · Informe de cierre
**Build:** ≥ `18c354c8` · **Entorno:** https://dim-staging.vercel.app
**Corrida:** sábado 08/08/2026, 10:12 → 17:45 ART (parte nocturna pendiente)
**Modo:** desatendido, 8 sesiones en secuencia. Esta corrida **fue** el clickthrough: los datos se crearon por los flujos reales y se revisaron adversamente en el mismo paso.

---

## Lo primero, porque condiciona todo lo demás

**El producto no miente.** Fui a buscar dónde engaña y lo que encontré, una y otra vez, es un producto que dice la verdad con precisión incómoda: te avisa que la denuncia todavía no sale por los canales oficiales, te avisa que una vacuna cargada por vos no cuenta como oficial, te avisa qué datos tuyos va a ver el refugio antes de que escribas la primera letra, te avisa que finalizar una adopción es un evento inmutable. Cuatro de mis ocho sesiones terminaron con más renglones en "verificado y limpio" que en "hallazgos".

**Donde falla es en la coherencia entre superficies.** Casi todos los hallazgos serios de esta corrida tienen la misma forma: el producto sabe la verdad, la muestra bien en una pantalla, y en otra la muestra distinta o no la muestra. No es un producto que engañe: es un producto que **no se pone de acuerdo consigo mismo**.

Los dos ALTA son exactamente eso. Y los dos flujos que el equipo marcó como sospechosos —aceptar transferencia y finalizar adopción— **cierran de punta a punta por interfaz**, sin un solo tropiezo.

---

## Los dos ALTA

### 1 · El formulario anónimo de denuncia entrega al dueño; cuatro pantallas prometen que eso no pasa

En `/denuncias/nueva`, paso 4, sin sesión y sin nada más que el token impreso en la chapa del animal, el producto responde:

> **"Esta mascota está registrada como CW-Luna (activa). Dueño: D.D."**

Medido dos veces, en dos recorridos independientes (10:22 y 10:36 ART). "D.D." son las iniciales de *Dueño Demo CABA*, confirmadas en `/cuenta`.

Contra eso, el mismo producto dice, textualmente, en cuatro lugares distintos:

| Pantalla | Promesa |
|---|---|
| `/p` de una mascota perdida | *"Por privacidad no mostramos el teléfono del dueño: completá uno de estos avisos y le llega al instante."* |
| Alta de mascota, pantalla de credencial | *"…su nombre, especie y lo que vos decidas mostrar — **nunca tus datos sin que los actives**."* |
| Marcar como perdido, paso 3 ("Qué se muestra al público") | *"**No se comparte nada que no actives acá**, y podés cambiarlo desde su perfil en cualquier momento."* |
| Editar mi información | *"…podemos mostrarle estos contactos (**según tus preferencias de privacidad**)."* |

Y encontré el control: el toggle **"Tu nombre"** vive en el paso 3 de "Marcar como perdido", es **por caso de pérdida** y viene **apagado por defecto**. CW-Luna no tiene ningún caso de pérdida abierto — su dueño nunca activó nada. La credencial pública de esa misma mascota, visitada anónima en la misma sesión, **no muestra dueño ni iniciales**.

**Por qué ALTA:** el token no es un secreto, va colgado del cuello del animal. Cualquiera que lo lea puede preguntarle al formulario público quién es el dueño, y el producto contesta.

**Sugerencia:** que el paso 4 confirme identidad sin identificar persona — *"Esta mascota está registrada (activa)."* El denunciante necesita saber que acertó el código, no de quién es el animal.

---

### 2 · La credencial pública no distingue una vacuna declarada por el dueño de una firmada por un veterinario

Cargué una antirrábica en CW-Tero **como dueño, sin veterinario**. Puertas adentro el producto la clasifica impecablemente: el asiento queda **"DECLARADA · Antirrábica cargada por vos"**, el cumplimiento no se mueve (**"0 de 4 al día"**) y el propio producto explica por qué:

> *"Para figurar 'al día' en el registro oficial, un veterinario matriculado tiene que firmarla."*

Puertas afuera, esa distinción desaparece. Y lo probé con un experimento controlado sobre **la misma mascota**:

| Hora ART | Estado del asiento | `/p/DIM-WR9N-Y7BN` dice | ¿Aparece "Verificado por veterinario matriculado"? |
|---|---|---|---|
| 11:03 | DECLARADA (dueño) | **ANTIRRÁBICA · VIGENTE** | **no** |
| 11:40 | VERIFICADA (vet, matrícula V-12345-BA) | **ANTIRRÁBICA · VIGENTE** | **sí** |

La palabra que se lee es la misma en los dos casos. La única diferencia es **una línea que aparece cuando está verificada y falta cuando no**. Y la ausencia sólo funciona como señal si sabés cómo se ve la presencia — quien escanea un QR en la calle ve una credencial sola, nunca las dos al lado.

**Por qué ALTA:** "ANTIRRÁBICA: VIGENTE" en un documento titulado *"CREDENCIAL PÚBLICA · Registro Nacional de Mascotas · República Argentina"* es una afirmación citable por un inspector, un hotel, una guardería o un adoptante. En el caso declarado la respalda únicamente que el dueño la tipeó.

**Sugerencia:** marcar **positivamente** el estado no verificado en `/p` — "VIGENTE (declarada por el dueño)" o un ícono distinto. La distinción ya existe en los datos; falta mostrarla del lado público.

---

## Los tres patrones sistémicos

Debajo de los 48 hallazgos hay tres causas que se repiten. Arreglarlas de raíz vale más que arreglar los síntomas uno por uno.

### A · El diccionario de enums no está aplicado en todas partes

El valor interno en inglés sale a la superficie en **tres portales distintos**:

- **Ciudadano** — notificación de zona: *"CW-Tero — **dog**, Mestizo."* (3 instancias)
- **Gobierno** — pantalla de aprobación de servicio: *"Especies: **dog, cat**"*, justo arriba del botón de aprobar
- **Público** — `/turnos/buscar?service_kind=<lo-que-sea>` imprime el parámetro crudo como encabezado: **`spay_female_dog`**

Yo cargué ese servicio tildando "Perros" y "Gatos". Llega al funcionario que lo aprueba como `dog, cat`.

### B · Falta un piso de altura en los controles

No son "dos sistemas de componentes" —esa lectura ya se probó equivocada—; es más simple: **falta un mínimo**. Alturas medidas:

| Superficie | Control | Alto |
|---|---|---|
| `/turnos/buscar` | botón **Buscar** (submit) | **29 px** |
| `/perdidas`, `/adoptar` | botón Buscar | 31 px |
| `/perdidas`, `/adoptar` | selects e inputs de filtro | 35 px |
| `/org/…/intake` | inputs / selects | 38 / 37 px |
| `/denuncias/buscar` | input de código + botón | 39 px |
| `/org/…/servicios/nuevo`, `/login`, alta de mascota, filtros de `/gob/denuncias` | inputs y selects | **44 px** ✅ |
| Checkboxes y radios (varias) | | **13 y 16 px** |

El mínimo táctil accesible es 44 px. Los formularios ya migrados lo cumplen; los que quedaron afuera son, justamente, los más largos (intake individual) y los más públicos (los filtros de las tres pantallas de ciudadano). Dentro del intake conviven **dos tamaños de radio** en el mismo formulario: 13 px y 16 px.

### C · Seis formatos de fecha y un separador que se come el espacio

Seis formas de escribir la misma fecha, dos de ellas **en la misma pantalla** (`/transferencias`: "Vence 15 de agosto de 2026" arriba y "1 de ago de 2026" abajo). Detalle: `Sábado, 8 De Agosto De 2026` es `text-transform: capitalize` sobre un texto correcto — capitaliza las preposiciones, que en inglés está bien y en español no.

El punto medio separador pierde el espacio en tres componentes de tres portales: `"ATENCIÓN ·ALERTA DE MASCOTA PERDIDA"` (falta después), `"a las 11:54· Operador/a Gobierno"` (falta antes), `"Gobierno·2 localidades · 2 provincias"` (falta de los dos lados, y el segundo `·` sí está bien).

**La hora, en cambio, es impecable:** 24 h en los cuatro portales, cero `a. m.`/`p. m.`, verificado con regex estricta. La única excepción son los segundos en la tabla de reglas de agenda.

---

## Matriz consolidada — 48 hallazgos

**2 ALTA · 21 MEDIA · 25 BAJA**

| ID | Sev | Qué |
|---|---|---|
| **S1-F01** | **ALTA** | El formulario anónimo de denuncia revela al dueño; cuatro pantallas prometen lo contrario |
| **S2-F01** | **ALTA** | `/p` muestra "ANTIRRÁBICA VIGENTE" igual para una vacuna declarada que para una firmada |
| S1-F02 | MEDIA | El aviso de que la denuncia no sale por canales oficiales llega después de enviar, en 12 px al 72 % de la página *(bajado de ALTA: se corrige solo, ver S8)* |
| S1-F03 | MEDIA | Al recargar, el borrador restaura todo menos la ubicación y devuelve al usuario un paso más adelante |
| S1-F04 | MEDIA | El botón para quitar una foto adjunta es invisible en táctil y mide 20 × 20 px |
| S1-F05 | MEDIA | El "no encontramos" de un código de denuncia habla de credenciales, QR y mascotas perdidas |
| S1-F06 | MEDIA | `/iniciar-sesion` y `/registro` dan 404: las dos rutas de auth son las únicas en inglés |
| S1-F07 | MEDIA | Cinco alturas de control en una misma barra de filtros; el submit es el más chico |
| S1-F12 | MEDIA | "No importa cuál elijas" vs. el chip "CRÍTICA" y el filtro de Severidad de la cola *(subido de BAJA)* |
| S2-F02 | MEDIA | El formulario de vacuna promete "firmado digitalmente en la libreta oficial" |
| S2-F03 | MEDIA | Notificaciones al ciudadano con la especie en inglés: "CW-Tero — dog" |
| S2-F04 / S6-F01 | MEDIA | "EN ADOPCIÓN" queda pegado en la credencial de la adoptante — **reproducido en una adopción de 2 minutos** |
| S2-F05 | MEDIA | Quien acepta una transferencia recibe menos información que quien la envía |
| S3-F01 | MEDIA | "Agregar regla" de agenda llega con Lun–Vie tildados y acepta reglas superpuestas sin avisar |
| S3-F02 | MEDIA | "Materializar ahora" informa "Turnos nuevos: 0" y sí generó turnos |
| S3-F03 | MEDIA | La pantalla de walk-in no dice que la mascota está reportada como perdida |
| S3-F04 | MEDIA | El checklist de onboarding se des-completa cuando el refugio adopta bien |
| S5-F01 | MEDIA | "Aprobaciones" dice que no hay nada pendiente mientras hay un servicio esperando |
| S5-F02 | MEDIA | La pantalla de aprobación de servicio muestra "Especies: dog, cat" |
| S6-F02 | MEDIA | La notificación de transferencia aceptada linkea a una mascota que el ex dueño ya no puede ver |
| S7-F01 | MEDIA | Las tarjetas de opción del wizard de denuncia no muestran foco de teclado |
| S8-F01 | MEDIA | Seis formatos de fecha conviviendo, dos en la misma pantalla |
| S1-F08 · S1-F09 · S1-F10 · S1-F11 · S1-F13 | BAJA | Títulos de pestaña sin criterio · tres marcas de "obligatorio" · contador sin estado al llegar al tope · autocomplete que elige solo y sin flechas · glifos médicos sin leyenda |
| S2-F06…F10 | BAJA | "POR VENCER" en una mascota sin nada registrado · género fijo en "marcar como perdida" · separador `·` sin espacio · menú duplicado en "Anotar" · dos formatos de fecha en transferencias |
| S3-F05…F09 | BAJA | Fecha capitalizada · horarios con segundos · parámetro inválido impreso como encabezado · intake fuera de la migración · rutas `/adoption` y `/adoptar` |
| S4-F01 | BAJA | La cola de denuncias no tiene dónde pegar el código del ciudadano |
| S5-F03 · S5-F04 | BAJA | "Duracion" y "Confirmar aprobacion" sin tilde · separador `·` en tres portales |
| S6-F03…F05 | BAJA | Tras aprobar una postulación no se nombra el paso siguiente · dos redacciones del 404 · el 404 global no tiene `<main>` y su skip link no lleva a nada |
| S7-F02 · S7-F03 | BAJA | Chip "Con chip" a 3,15:1 · texto auxiliar a 4,37:1 |
| S8-F02 · S8-F03 | BAJA | `/perdidas` sólo con tiempo relativo · el banner "recién registrada" depende sólo del query param |

---

## Lo que está limpio, y no es poco

Decir "esto anda" también es entregable. Lo verificado con evidencia:

- **Los dos "rojos" del e2e cierran por UI.** *Aceptar transferencia*: propuesta 11:08 → aceptada 11:11, con la libreta intacta del otro lado. *Finalizar adopción*: publicar 11:37 → postular 12:11 → aprobar 12:13 → finalizar 12:15, y la mascota sale de `/adoptar`, de la custodia y de postulaciones, y aparece en la cuenta de la adoptante.
- **La autorización no tiene fugas.** Matriz de 3 objetos × 7 roles: **404** para rutas de otra organización, **redirección al portal propio** cuando un operador entra a una ruta de ciudadano, y **`/acceso-denegado?portal=gob`** cuando un ciudadano entra a gobierno. Un token ajeno y un token inventado devuelven **exactamente la misma pantalla**: no hay fuga de existencia.
- **El aislamiento por jurisdicción es real, no cosmético.** Tres alcances, tres colas: `admin@` 5078 en triage · `govt-local@` 35 · `govt@` (CABA) 169. Y el corte funciona en los dos sentidos: `govt@` ve la denuncia de Palermo y **no** ve el servicio de La Plata.
- **El circuito de mascota perdida funciona entero.** Marcar perdido → publicación en `/perdidas` y en `/gob/perdidas` → avistaje anónimo desde `/p` → **notificación al dueño al instante**, con el mensaje y el contacto del finder → alerta de zona a vecinos.
- **La notificación del walk-in al dueño llega**, y con el copy correcto: *"Si no reconocés esta atención, abrí el registro para revisarlo o corregirlo."* Era el punto marcado ALTA-si-falla: no falla.
- **La compuerta pública de chapas está limpia** en los cuatro estados (inventada 404, virgen sin datos, activa redirige, revocada sin datos ni razón).
- **El borrador del wizard de denuncia sobrevive a la recarga** (`localStorage`, restaura tipo, gravedad, descripción y "cuándo") y al Atrás/Adelante del navegador.
- **Confirmación en dos tiempos** en todas las acciones irreversibles que toqué: enviar denuncia, aceptar transferencia, aprobar postulación, finalizar adopción, marcar revisada, aprobar servicio.
- **Los tres wizards protegen sus pasos de verdad**: `disabled` + `inert` + `aria-hidden` + fuera de viewport. Tan bien que me hicieron tropezar tres veces (ver abajo).
- **El foco de teclado se ve: 40 de 40** focusables de `/perdidas`, `outline: 3px solid`. El texto al **200 %** no produce scroll horizontal ni recortes.
- **La severidad no se comunica sólo por color**: ícono en `aria-hidden` y la palabra en texto para lector de pantalla (`"SLA ENO, Atención"`).
- **La aritmética de fechas es correcta** en los tres casos que generé (vencimiento a 7 días, próxima dosis a 12 meses, SLA por gravedad), y la fecha futura se rechaza.
- **El vocabulario canónico de estados no tiene regresión**: "Abierta / Revisada / En curso". Cero "Triagueada", cero "En seguimiento" como nombre de estado.
- **El comprobante de denuncia tiene hoja de impresión propia** y bien pensada: sólo el comprobante, texto negro, bordes claros, y `data-print-hide` para el cromo.
- **Los KPI dicen la verdad.** Conté a mano las 24 tarjetas de `/perdidas`: "NUEVAS EN 24H: 3" ↔ 59 min + 6 h + 6 h = 3. Lo di por sospechoso y estaba bien.

---

## Cinco falsas alarmas que verifiqué antes de escribirlas

El prompt pedía separar observación de causa porque la corrida anterior midió bien y diagnosticó mal. Estas son las que esta vez no llegaron al informe:

1. **"El intake individual falla en silencio."** El botón "Crear ingreso" del paso 4 está `disabled` + `inert` + `aria-hidden` + fuera del viewport (`y = 976 px`). Ningún usuario real lo alcanza; lo alcancé yo con eventos sintéticos. Repetido bien, el intake funcionó a la primera. **Lo mismo pasó con "Enviar postulación"** (`inert`, `y = 1147 px`).
2. **"Marcar revisada / Aprobar postulación no responden."** Es confirmación en dos tiempos: el primer click abre el formulario o revela el par [Confirmar] [Cancelar]. Es exactamente el error que hubo que retractar la corrida pasada; esta vez lo agarré antes.
3. **"El texto está pegado: `agostoOvariectomía perra`, `Peso estimado (kg)Ayuda a evaluar…`."** Artefacto de `innerText`, que ignora los márgenes CSS. Las capturas ampliadas mostraron el espaciado correcto en los tres casos. **En esta app, `innerText` pegado no es evidencia de texto pegado.**
4. **"Hay un texto roto: `, Atención` con coma al principio."** Es un span de 1 × 1 px: el nombre accesible de la tarjeta, que un lector de pantalla lee como *"SLA ENO, Atención"*. Es la severidad expuesta como texto y no sólo por color — justo lo que §10.0 bis dice que se arregló.
5. **"El contador se pasa de 2000 caracteres."** Lo produje yo por JS evadiendo el `maxlength` nativo. Tipeando o pegando es imposible.

Y una **corrección a mi propio hallazgo**: reporté que el aviso de la Ley 14.346 era un cartel fijo. No lo es — cuando la autoridad tomó el caso, cambió solo a *"En revisión por la autoridad."* Bajé S1-F02 de ALTA a MEDIA y dejé escrito lo que retiro.

---

## Registro de entidades CW- creadas

| Tipo | Código | Estado al cierre | Creada por |
|---|---|---|---|
| Denuncia | **DEN-RCDE-GY9P** | **En curso**, asignada a Gobierno (local), con 1 foto adjunta | anónimo → triage `govt-local@` |
| Mascota | **DIM-WR9N-Y7BN** (CW-Tero) | **Perdido**, de `owner@`, antirrábica **VERIFICADA** por vet | `owner@` |
| Caso de pérdida | **CAS-A9F2-MV8R** | Abierto, con un avistaje | `owner@` |
| Avistaje | (sobre CAS-A9F2-MV8R) | 11:06 ART, Plaza Serrano | anónimo |
| Evento sanitario | Antirrábica DECLARADA en CW-Tero | 08/08/2026 → próxima 08/08/2027 | `owner@` |
| Evento sanitario | Antirrábica **VERIFICADA** en CW-Tero | 11:40, matrícula V-12345-BA | `vet@` |
| Transferencia | **PTR-Q23V-RSC9** | **Aceptada** — CW-Luna (`DIM-CYTK-5MTD`) pasó de `owner@` a `graciela@` | `owner@` → `graciela@` |
| Servicio | **OFR-4GVG-YSR3** (CW-Consulta general — jornada QA 08/08) | **Aprobado** por `govt-local@` | `orgadmin@` |
| Regla de agenda | sobre `OFR-Z72K-C3WG` | Lun–Sáb 09:00–13:00, 08/08 → 31/08 | `orgadmin@` |
| Mascota de refugio | **DIM-8PBD-KVAF** (CW-Rescate-QA-0808b) | **Adoptada por `graciela@`** (adopción finalizada 12:15) | `orgadmin@` |
| Postulación | (sobre DIM-8PBD-KVAF) | Aprobada y finalizada | `graciela@` |
| Suscripción de alerta | CW-Alerta QA 08/08 | Activa, umbral 999999 (inalcanzable a propósito) | `admin@` |

**Cambios de titularidad provocados por esta corrida** (para poder revertirlos): `DIM-CYTK-5MTD` `owner@ → graciela@` · `DIM-8PBD-KVAF` `Refugio Test → graciela@`.

**Seed ajena: intacta.** No toqué `DIM-DEMO-*`, `DIM-PAMP-0001`, cuentas `cursor-*`, la alerta sembrada `DEMO-alert-sterilization-caba`, las 3 denuncias en moderación, ni ninguna chapa fuera del lote CW-. Limpié el borrador `localStorage.denuncia_draft_v1` que dejó mi prueba de recarga.

**Logins:** `owner@` ×3 · `graciela@` ×3 · `orgadmin@` ×2 · `vet@` ×1 · `admin@` ×1 · `govt-local@` ×1 · `govt@` ×1. Ningún bloqueo por rate limit.

---

## Lo que no pude verificar

Vale tanto como un hallazgo, y esta lista es larga a propósito.

**Imposible con la herramienta**
1. **Layout mobile real (< 640 px).** Chrome en Windows no baja de ~657 px de ventana / 642 px de viewport, y `zoom` no mueve las media queries. Verifiqué que a **642 px y con texto al 200 % no hay scroll horizontal ni texto cortado**, pero eso es tablet, no teléfono. **Es el hueco más importante que queda**: es el ancho de quien escanea un QR en la calle, y dos hallazgos de esta corrida (el botón invisible sin hover, las alturas por debajo de 44 px) son de teléfono medidos desde escritorio.
2. **Vista previa de impresión.** `window.print()` abre un modal que bloquea la automatización. Compensé leyendo la hoja `@media print`, que es la que gobierna el papel.
3. **Lector de pantalla real.** Todo lo de accesibilidad es inspección de DOM y estilos computados, no escucha con NVDA/VoiceOver.

**Bloqueado por la regla de no descargar sin confirmación**
4. Descargar comprobante · PDF MPF de un caso de maltrato · "Imprimir expediente" · export PNG del mapa de Panorama · emisión de un lote de chapas con su CSV de un solo uso.

**No llegué**
5. **Reportar mordedura → observación antirrábica.** Es de las áreas sin spec e2e detrás, así que es donde más valdría el tiempo. **La priorizaría para la próxima corrida.**
6. Turnos: reservar como ciudadano y atender el turno como vet (la agenda quedó armada y con turnos disponibles).
7. Límites del adjunto de denuncia (>25 MB, 6º archivo, tipo no permitido); "Sumar mi contacto" en el paso 5; "Usar mi ubicación actual" (no disparé el permiso de geolocalización).
8. Ficha de origen de un KPI en `/admin/sistema`; moderación de denuncias flaggeadas (no son mías); armar un operativo (no quise crear uno real sobre seed ajena).
9. Microchip / peso / régimen PPP en CW-Tero; meses de seguimiento post-adopción.
10. Auditar contraste con el barrido automático en los portales de operador (los valores que reporto ahí son puntuales); orden de tabulación dentro del panel lateral de la cola de denuncias.
11. **Contrato de adopción imprimible: sigue sin existir.** La pantalla de finalizar sólo ofrece **subir** uno ya firmado. Coincide con el N6 de la corrida anterior; no lo cuento como hallazgo nuevo, pero **sigue abierto**.

**Programado, no perdido**
12. **Ventana de divergencia ART/UTC (21:00–00:00 ART).** Es la parte 2 de S8: entre esas horas UTC ya está en el día siguiente y es la única ventana donde se distingue una fecha calculada en ART de una calculada en UTC. Plan escrito en `S8-documentos-y-fechas.md`.

---

## Observación de ambiente, no de producto

El primer lugar del listado público de mascotas perdidas lo ocupa **`E2EDeg-1786192617515`** (PERDIDO, Palermo CABA), residuo de una corrida e2e. En staging es esperable y no lo cuento como hallazgo; lo anoto sólo porque es lo primero que vería alguien a quien se le muestre esa pantalla.

---

## Los cinco arreglos que yo haría primero

1. **Sacar las iniciales del dueño del formulario anónimo de denuncia** (S1-F01). Una línea de copy, cierra un ALTA.
2. **Marcar positivamente "declarada" en `/p`** (S2-F01). El dato ya existe; falta mostrarlo.
3. **Pasar el diccionario de especies por las tres superficies donde sale `dog`** (S2-F03, S5-F02, S3-F07).
4. **`min-height: 44px` en el control base** (S1-F07, S3-F08). Un token, arregla cinco pantallas.
5. **Sumar "Servicios" a la cola de Aprobaciones de gobierno** (S5-F01), o al menos que su vacío deje de ser categórico. Hoy una pantalla que se llama "Aprobaciones" le dice al funcionario que no tiene nada que aprobar mientras hay un servicio esperando.

---

## Detalle por sesión

| Archivo | Sesión | Hallazgos | Estado |
|---|---|---|---|
| `S1-publico-anonimo-denuncia.md` | Público, anónimo y denuncia | 13 | PARCIAL |
| `S2-duenio-ciclo-mascota.md` | Dueño: ciclo completo | 10 | PARCIAL |
| `S3-veterinario-y-organizacion.md` | Veterinario y organización | 9 | PARCIAL |
| `S4-admin-y-plataforma.md` | Admin y plataforma | 1 | PARCIAL |
| `S5-gobierno.md` | Gobierno, dos jurisdicciones | 4 | PARCIAL |
| `S6-cross-perfil.md` | Cross-perfil, 3 objetos × 7 roles | 5 | PARCIAL |
| `S7-teclado-color-zoom.md` | Teclado, color y zoom | 3 | PARCIAL |
| `S8-documentos-y-fechas.md` | Documentos y fechas | 3 | **PARTE 1** (parte 2: ventana nocturna) |

Ocho handoffs PARCIAL honestos. Ninguna sesión se declaró completa, y ninguna quedó sin correr.
