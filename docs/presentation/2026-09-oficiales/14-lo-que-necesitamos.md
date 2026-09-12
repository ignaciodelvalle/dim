# Lo que necesitamos del Estado

> Este documento no pide colaboración en general. Pide **siete cosas concretas**,
> y por cada una dice qué está ya construido esperándola.
>
> La columna que importa es la última: **qué queda sin funcionar hasta que llegue**.
> Eso convierte cada pedido en una consecuencia medible en vez de un deseo.

Todo lo que sigue sale del código, no de una lista de deseos. Cada punto nombra
el archivo donde está el hueco esperando a ser llenado.

---

## 1. Mi Argentina — el convenio y las credenciales

**Es el que más destraba, por lejos.**

**Qué necesitamos.** Autorización para ser parte confiante de Mi Argentina, las
credenciales de cliente que emite su portal de desarrolladores, el documento de
configuración del proveedor de identidad, y el registro de nuestra dirección de
retorno. La autorización depende de un convenio: es una firma, no un desarrollo.

**Qué está construido esperándolo.** Todo. El lector de configuración, el tipo de
dato de los atributos que devuelve, la ruta de retorno, y las columnas en la base
que guardan la identidad federada — todas ya existen y están inertes. El sistema
entero está detrás de una compuerta que se abre sola el día que existan cuatro
variables de entorno. No hace falta ninguna migración.

**Qué queda sin funcionar hasta que llegue.** El DNI lo escribe la persona y
**nadie lo verifica contra ningún registro del Estado**. Hoy guardamos ese número
cifrado, sin poder confirmarlo. Y eso no es un detalle aislado: la habilitación de
un veterinario, la creación de una organización, un hogar de tránsito y el cierre
de una adopción **hoy confían en un número que alguien tipeó**.

Este es el único pedido del que dependen los demás. Sin identidad verificada, todo
lo que el sistema afirma sobre una persona es una declaración jurada sin contraste.

---

## 2. La dirección donde recibir las notificaciones obligatorias

**Qué necesitamos.** Tres cosas, y son técnicas: una dirección a la que enviar,
cómo autenticarnos contra ella, y qué forma tiene que tener lo que mandamos.

**Qué está construido esperándolo.** Una cola de salida durable. Cuando se
registra un evento sanitario que la ley obliga a notificar, la anotación de salida
se escribe **en la misma transacción** que el hecho clínico: no hay forma de que
uno exista sin la otra. Cada anotación lleva su plazo legal calculado según la
enfermedad. Hay una pantalla de gobierno que muestra esa cola, con filtro por
notificación obligatoria, y un rol nacional de sólo lectura que la ve para todo el
país.

**Qué queda sin funcionar hasta que llegue.** **Ninguna notificación sale del
sistema.** Todo queda registrado, fechado y en cola — y ahí se queda. El producto
lo dice en sus propias pantallas, con estas palabras: *"La notificación obligatoria
a SNVS/SENASA/zoonosis no está integrada en esta versión. Realizala a través de
los canales habituales de tu jurisdicción."*

Queremos ser explícitos en un punto: **no vamos a construir el emisor antes de
tener la especificación.** Adivinar el formato de una integración oficial garantiza
tener que rehacerla. El lugar exacto donde entra esa llamada ya está reservado en
el código y comentado.

---

## 3. Quién recibe, jurisdicción por jurisdicción

**Este no cuesta nada y es el que más rápido cambia algo.**

**Qué necesitamos.** Una lista: por cada jurisdicción que quieran incorporar, el
correo institucional del área y las localidades que cubre. Nada más.

**Qué está construido esperándolo.** El sistema de asignaciones por provincia y
localidad, revocable y auditado, con su panel de administración. Funciona hoy.

**Qué queda sin funcionar hasta que llegue.** El aviso interno sólo alcanza a
personas **ya registradas y asignadas** a esa jurisdicción. En un municipio sin
nadie cargado, la notificación no tiene destinatario: se genera correctamente y no
la lee nadie.

Dicho de otra forma: aunque mañana nos dieran la dirección del punto 2, **el mejor
sistema de notificación le escribe a nadie si no sabe a quién**.

---

## 4. SENASA — el formato real del lote de la Libreta Sanitaria

**Qué necesitamos.** La especificación de homologación. En concreto: si el archivo
es de ancho fijo, XML contra un esquema, un CSV con códigos y orden propios de
SENASA, o un envío a una interfaz. Y cuatro respuestas más: si el RENSPA del
establecimiento es obligatorio en cada fila, si se rechazan filas sin matrícula del
veterinario, si el lote se arma por campaña, por localidad o por período, y si el
archivo homologado necesita firma digital.

**Qué está construido esperándolo.** Toda la cadena menos el último paso: la
consulta, el filtrado por privacidad, la transformación a una fila neutral, y una
interfaz de formateador enchufable diseñada para que **el formateador real entre
sin tocar nada más**. La base de datos está alineada con los campos de la libreta
desde hace meses.

Desde el 2026-09-11 esa cadena además **tiene puerta**: `app/gob/senasa/export/route.ts`
(commit `629052357`). Hasta ese día no tenía ningún llamador — estaba construida y
dormida, un funcionario no podía bajar nada. Hoy sí puede: descarga el lote acotado a
su jurisdicción y a su período, con la misma guarda que el resto de las exportaciones
del portal y con registro de auditoría propio. Es decir que lo que falta ya no es "casi
todo el camino de salida", es **el formato y el envío**: cuando llegue la especificación
homologada, el formateador nuevo se registra y **esta ruta no cambia**. Lo otro que falta
es el punto de entrada en la interfaz, y eso es una decisión de producto nuestra, no un
pedido a SENASA.

**Qué queda sin funcionar hasta que llegue.** Hoy un funcionario exporta una
planilla, la abre en Excel y **vuelve a tipear los datos** en el formulario
heredado. El documento de diseño dice literalmente sobre el formato real: *"no lo
inventes"*.

---

## 5. Las otras dos resoluciones de SENASA

**Certificado antirrábico para traslado (Res. 580/2014).** Necesitamos los campos
del formulario oficial y el procedimiento de refrendo del certificado veterinario
internacional, para que lo que emitimos sirva de verdad.

**Receta electrónica veterinaria (Res. 80/2025).** El tipo de evento existe en el
sistema; la carga con principio activo y posología no está construida. Necesitamos
acceso o especificación del sistema de receta electrónica.

**Una que ya está resuelta y no hace falta pedir:** el estándar de identificación
electrónica (Res. 284/2024, ISO 11784/11785) ya está implementado. Los microchips
se registran con sus campos desglosados y el formato se valida.

---

## 6. El registro de perros potencialmente peligrosos de Provincia

**Qué necesitamos.** Cómo se presenta una inscripción en el registro bonaerense, y
si existe alguna vía que no sea la carga manual.

**Qué está construido esperándolo.** La generación del documento de inscripción
para Ciudad de Buenos Aires, con su descarga firmada y acotada al titular.

**Qué queda sin funcionar hasta que llegue.** Provincia de Buenos Aires no está
implementada. La ley provincial 14.107 exige identificar a un perro potencialmente
peligroso por chip o tatuaje, y el sistema lo registra — pero la inscripción en el
registro provincial hoy no tiene salida.

---

## 7. Un dominio `.gob.ar`

**Qué necesitamos.** La delegación, si quieren que el sistema viva bajo un dominio
del Estado.

**Qué está construido esperándolo.** El sistema corre hoy en un dominio propio y
funciona. Esto no bloquea nada; es una decisión de a quién pertenece la dirección.

---

## Lo que ya tenemos y no hace falta pedir

- **El catálogo de localidades del INDEC**, importado y con controles de
  integridad.
- **Los barrios de la Ciudad de Buenos Aires.**
- **El estándar ISO de identificación electrónica**, ya implementado.
- **El marco normativo citado**: alrededor de quince normas nacionales, de Ciudad
  y de Provincia, leídas y referenciadas dentro del producto. Es texto legal
  público; no requiere permiso de nadie.

---

## Lo que NO estamos pidiendo

Para que quede claro qué no es este documento:

- No pedimos acceso a RENAPER. La verificación de identidad la esperamos como
  consecuencia del punto 1, no como integración aparte.
- No pedimos datos de personas. Todo lo que necesitamos son especificaciones,
  autorizaciones y direcciones.
- No pedimos financiamiento.

---

## Si tuvieran que elegir uno

**El punto 3.** Es el único que se puede responder en la reunión misma, no cuesta
presupuesto ni desarrollo, y convierte un sistema que registra en un sistema que
avisa — aunque sea puertas adentro, mientras llega el punto 2.
