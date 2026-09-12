# Guía para testers de miMAR

> **UNA SOLA COSA POR CONFIRMAR ANTES DE ENVIAR — y después este bloque se borra.**
>
> **El enlace de aceptación de la prueba cerrada.** Abajo figura
> `https://play.google.com/apps/testing/ar.mimar.app`, que es el formato que Play
> Console emite para una pista cerrada. Verificalo contra el valor exacto que muestra
> Play Console en **Pruebas → Prueba cerrada → Testers → Cómo se unen los testers**, y
> pegá ese. El enlace del listado de la tienda NO sirve para darse de alta: mientras la
> persona no haya aceptado, la ficha le responde *"no se encontró el elemento"*.
>
> Ventana del piloto: la prueba cerrada arranca el **sábado 13 de septiembre de 2026**.
> Google exige 12 testers aceptados sostenidos durante 14 días corridos, así que el
> plazo se cumple el **sábado 27 de septiembre** — siempre que los 12 acepten el día 1
> y ninguno se dé de baja en el medio.

miMAR es la app donde vas a tener la libreta sanitaria de tu mascota, su credencial digital y el modo perdida, todo desde el celular. Estás probando una versión previa al lanzamiento, para encontrar qué funciona y qué no antes de abrirla a todo el mundo.

Si algo no anda, no es que lo hiciste mal — es exactamente lo que estamos buscando. Cuanto más nos cuentes, mejor.

## Instalar

Son dos pasos, en este orden. El orden importa: si hacés el segundo antes que el primero, la tienda te va a decir que la app no existe.

**Paso 1 — aceptá ser tester.** Abrí este link **desde tu celular Android** (no desde la computadora):

https://play.google.com/apps/testing/ar.mimar.app

Vas a ver una pantalla que te explica de qué se trata y un botón para aceptar. Cuando lo tocás, aparece un mensaje confirmando que ya sos tester.

**Paso 2 — instalá la app.** Recién ahora, abrí este otro link, también desde el celular:

https://play.google.com/store/apps/details?id=ar.mimar.app

Se te va a abrir la app Play Store del teléfono en la ficha de miMAR, con el botón **Instalar**.

Si en el paso 2 te dice *"no se encontró el elemento"*, es que el paso 1 no quedó hecho. No está roto: la tienda no muestra una app en prueba a quien todavía no aceptó. Volvé al primer link.

**La cuenta tiene que ser la misma.** El link se abre con la cuenta de Google del navegador y la descarga la hace la cuenta de la Play Store. Si tu teléfono tiene dos cuentas de Google, revisá que sea la misma que nos pasaste: abrí Play Store y tocá tu foto arriba a la derecha, ahí dice cuál está usando. Si te dice *"la descarga no está disponible en este momento"*, casi siempre es eso.

Por ahora la app es solo para Android — todavía no hay versión para iPhone.

### Cómo te llegan las actualizaciones

Hay dos vías distintas, y conviene que sepas cuál es cuál porque la mayoría de los arreglos del piloto viajan por la segunda.

**Por la Play Store**, como cualquier otra app, cuando cambia algo del programa en sí: permisos nuevos, la cámara, el ícono. No son instantáneas y las vas a ver en la lista de actualizaciones de Play.

**Adentro de la app**, sin pasar por Play, cuando cambia solo la parte que se dibuja en pantalla — que es la mayoría de lo que corregimos durante el piloto. Estas se bajan solas al volver a abrir la app y se aplican en la siguiente apertura, así que a veces vas a tener que salir y entrar una vez más para verlas.

Si querés forzarla, andá a **Ajustes → Acerca de miMAR → Buscar actualización**. Ahí mismo, la fila **Actualización** te dice cuál tenés puesta: si nos reportás algo, copiala, porque nos dice exactamente qué versión estabas viendo.

## Crear tu cuenta

En la pantalla de ingreso, tocá **Crear cuenta**. Completá:

- Correo electrónico
- Contraseña (mínimo 8 caracteres) y repetila
- Aceptá los Términos y condiciones

Tocá **Continuar**. No te va a llegar ningún mail para confirmar la cuenta — entrás directo a la app.

¿Se te olvidó la contraseña? Desde "Iniciar sesión" tocá **¿Olvidaste tu contraseña?** y te mandamos un código de 6 dígitos por mail (si no lo ves, revisá spam).

## Tu identidad — un paso más

Después de crear la cuenta vas a ver una pantalla que dice "Completá tu registro". Es normal — es un segundo paso que se hace una sola vez, y ahora se hace acá mismo, en la app:

1. Escribí tu **nombre** y tu **apellido**.
2. Tocá **Guardar**.
3. Listo, entrás directo a "Mis mascotas". No hay que salir de la app ni volver a ingresar.

Eso es todo lo que te pedimos. No hace falta DNI ni ningún otro documento.

## Registrar a tu mascota

Desde "Mis mascotas" tocá **Registrar una mascota**. Son 6 pasos cortos:

1. Nombre
2. Especie y sexo
3. Raza (opcional)
4. Localidad — escribí tu barrio real de La Matanza (San Justo, Ramos Mejía, Isidro Casanova, Laferrere, González Catán, Villa Luzuriaga, Ciudad Evita, o el que corresponda). Es el dato con el que arranca la búsqueda de turnos, así que conviene que sea el de verdad.
5. Detalles como edad, color o peso — opcional, se puede completar después
6. Revisá y tocá **Registrar**

La búsqueda de turnos **arranca** en la localidad de la primera mascota que registres, y desde ahí la podés cambiar: en la pantalla de búsqueda tocá **Cambiar** y elegí otra localidad. Si querés que arranque sola en el barrio correcto, registrá primero la mascota de La Matanza (o movela después desde **Más** → **Editar datos** → **Registrar mudanza**).

## Qué probar esta semana

Con tu mascota ya registrada, probá estas 8 cosas y contanos cómo te fue:

1. **Ver la credencial y darla vuelta.** Abrí tu mascota y mirá la Credencial. Arriba a la derecha, en la franja azul, hay un ícono para girarla — tocalo y vas a ver la Libreta del otro lado.
2. **Mostrar tu QR.** Tocá el código QR de la credencial. Se abre la página pública de tu mascota: la misma que ve cualquiera que escanee el código.
3. **Anotar algo en la libreta.** Desde la Libreta, tocá **Asentar**, elegí un tipo (por ejemplo "Peso" o "Nota"), completá y tocá **Guardar**.
4. **Activar y desactivar Modo perdida.** En la Credencial, tocá **Modo perdida** y después **Marcar como perdida** (puede decir "perdido", según el sexo de tu mascota). Podés completar los datos o dejarlos vacíos. Después volvé a entrar, tocá **Marcar como encontrada** y confirmá con **Sí, la encontré**.
5. **Buscar y reservar un turno.** Desde "Mis mascotas" tocá **Mis turnos** → **Buscar un turno** → elegí un servicio → tocá un resultado → elegí un horario y tu mascota → **Reservar**. Arriba de los resultados dice en qué localidad está buscando: si querés mirar en otra, tocá **Cambiar** y elegila. (La campaña de vacunación antirrábica en La Matanza corre de lunes a sábado de 11 a 14, hasta el 4 de octubre.)
6. **Contactos de emergencia.** En la Credencial, tocá **Más** → **Contactos de emergencia**, cargá un veterinario o un contacto, y tocá **Guardar contactos**.
7. **Cambiar un dato de tu mascota.** Tocá **Más** → **Editar datos**, cambiá el color o la raza, y tocá **Guardar datos**.
8. **Exportar tus datos.** Andá a **Ajustes** → **Ver mis datos o eliminar mi cuenta** → **Pedir mis datos** → **Compartir el archivo**.

## Lo que la app ya resuelve entera

Todo esto se hace desde el celular, sin pasar por la web:

- **La credencial y la libreta**, de los dos lados de la misma tarjeta.
- **Asentar en la libreta**: peso, vacunas, desparasitaciones, notas, tatuaje, mordedura
  y el resto de los tipos de asiento.
- **Modo perdida**, con los datos de contacto que vos elegís mostrar.
- **Turnos**: buscar, reservar y ver los tuyos.
- **Los contactos de emergencia** y la edición de datos de la mascota.
- **Transferir la titularidad** y **cuidador temporal**.
- **La foto de la mascota** — se carga desde **Más** → **Foto de la mascota**, no durante
  el alta.

Y las tres cosas de cumplimiento, que son las que más nos importa que pruebes porque
son la razón por la que el proyecto existe:

- **Reportar un fallecimiento.** Está al final de **Más**, separada del resto, porque
  cierra el registro del animal. Si tenés una mascota de prueba que ya no vas a usar,
  probala ahí y contanos si el camino se entiende.
- **Perro potencialmente peligroso.** Si tu mascota está marcada como tal, en la tarjeta
  de Cumplimiento aparece **Registrar atestación**.
- **Reemplazo de microchip.** Cuando un chip falla o migra, el reemplazo se asienta con
  el número viejo y el nuevo. Hasta esta versión el formulario existía y no había forma
  de llegar a él.

## Lo que todavía no está

Para que no pienses que es un error tuyo:

- **No hay aviso en la pantalla del teléfono.** Adentro de la app sí hay una bandeja de
  notificaciones, en el ícono de la campana: si alguien te transfiere una mascota o te
  responde algo, te enterás cuando abrís la app.
- **El cartel para imprimir** de una mascota perdida se arma desde la web, no desde la app.
- **No se puede escanear el código de barras** de la etiqueta del microchip: el número se
  escribe a mano.
- **Cuatro cosas abren el navegador** en lugar de resolverse adentro: la chapa física,
  buscar hogar, el acompañamiento de adopción, y viaje y movilidad. Hasta esta versión
  dos de ellas no hacían absolutamente nada al tocarlas; ahora al menos te llevan al
  lugar correcto. Si alguna te manda a una página que no corresponde, contanos.
- **Por ahora es solo Android** — todavía no hay versión para iPhone.

## Contanos qué pasó

Dentro de los primeros 3 días, respondé este mensaje con una frase:

> ¿Pudiste registrar a tu mascota sin ayuda? Si algo se trabó, ¿en qué pantalla fue?

Si podés, mandá también una captura de pantalla de lo que viste.

Si nos escribís por un problema, agregá la versión que figura al final de Ajustes.

¿Dónde nos escribís? Respondé por el mismo WhatsApp por el que te escribí.

## Privacidad

La credencial pública —la que ve cualquiera que escanea tu QR— muestra el estado de salud de tu mascota y el contacto que vos elijas mostrar. Nunca muestra tu DNI. El resto de tus datos lo ves solo vos, y podés pedirlo o borrarlo cuando quieras desde Ajustes.
