# Prompt — cerrar todo lo abierto en Play y demás plataformas

> **Cómo usar este archivo.** Copiá el bloque de abajo tal cual en Cowork. No
> lleva SHA: este trabajo no toca el repositorio, toca consolas externas.
>
> **Qué NO es.** No es trabajo de código. El agente no escribe ni un archivo del
> proyecto. Es trabajo de consola: Play Console, EAS, Supabase, Vercel, Resend.
>
> **Por qué existe.** El estado de esas consolas no está en el repositorio y no
> se puede verificar desde acá. Varias cosas se dan por hechas sin evidencia.
> Este prompt las convierte en una lista con evidencia o sin ella.
>
> Escrito 2026-09-10, antes de cortar la build final.

---

Sos un agente de operaciones. Vas a cerrar todo lo pendiente en las plataformas
externas del proyecto miMAR, antes de que se corte la build de producción final
para Google Play.

**No escribís código. No tocás el repositorio.** Si encontrás algo que requiere
un cambio de código, lo anotás y seguís.

## La regla que gobierna todo este trabajo

**Nada se marca como hecho sin evidencia que puedas mostrar.** Una captura, un
valor leído de una consola, una respuesta de una API. "Parece que sí" es lo
mismo que "no".

Y la inversa importa igual: **si algo ya estaba hecho, decilo y no lo rehagas.**
Varias cosas de la lista de abajo pueden estar resueltas hace días.

Si en algún punto no tenés acceso a una consola, **pará y decilo**. No inventes
el estado de un sistema que no pudiste mirar.

## El contexto mínimo

miMAR es el sistema de credencial digital de mascotas de Argentina. La app
Android está en pruebas internas de Google Play con un piloto de testers
corriendo. La marca se escribe **miMAR**: m minúscula, MAR en mayúsculas.

- Proyecto EAS: `db4bebed-67f3-49a7-acf7-63c9f19ad511`, cuenta `nachi7`.
- Dominio de producción: `www.mimar.com.ar`.
- Proyecto Supabase: `agnwyifsdxxoznodutgq`.
- El paquete Android y la última build publicada los tenés que leer de la
  consola, no asumirlos.

---

## BLOQUEA LA BUILD — hacelo primero

### 1. La declaración de datos de Play está desactualizada y eso es lo más grave

El formulario de Data Safety se envió el **27 de agosto** declarando que la app
**no recolecta fotos**. Desde el **10 de septiembre** la app sube fotos: el
dueño puede ponerle imagen a la credencial de su mascota, y el asiento de
tatuaje exige una foto.

Una declaración falsa en Play no es un detalle de forma: es motivo de rechazo o
de baja de la aplicación.

**Qué hacer**, en este orden:
1. Abrí el formulario de seguridad de datos en Play Console y **leé qué dice
   hoy**. Transcribilo antes de tocar nada — quiero saber de qué partimos.
2. Actualizalo para declarar que la app recolecta **fotos**, con:
   - Propósito: funcionalidad de la aplicación.
   - **No** se comparte con terceros.
   - Es **opcional** — la persona elige si sube una foto o no.
   - Se puede pedir su eliminación (la app tiene borrado de cuenta).
3. Revisá el resto del formulario contra lo que la app hace hoy, no contra lo
   que decía en agosto. Como mínimo verificá: correo electrónico, nombre,
   teléfono, ubicación aproximada, y si declara el DNI.
4. Guardá y confirmá que quedó enviado, no en borrador.

**Decime exactamente qué cambió entre lo que decía y lo que dejaste.**

### 2. La copia de seguridad de la llave de firma

Cuando se hizo la primera build, EAS generó el almacén de claves de Android y lo
guarda él. **No hay registro de que se haya hecho una copia.**

Si esa llave se pierde, **no se puede volver a publicar nunca esa aplicación**:
Google la identifica por su firma. Se publica de cero, con otro identificador, y
se pierden todos los usuarios instalados.

**Qué hacer:** corré `eas credentials` para el proyecto Android, descargá el
almacén de claves y su contraseña, y guardalos donde el dueño del producto los
pueda recuperar. **Decile dónde quedaron.** Esta es la tarea más barata y más
cara de no hacer de toda la lista.

---

## VERIFICAR — cosas que se dan por hechas sin evidencia

### 3. ¿Qué build está realmente publicada?

El repositorio anota builds hasta la número 10 del 5 de septiembre, "entregada
al dueño del producto para la subida manual". La guía de testers describe un
piloto activo desde el 7 de septiembre. **Nadie confirmó que esa build esté
efectivamente en Play.**

**Qué hacer:** en Play Console, andá a la pista de prueba interna y decime:
- Qué número de versión está publicado y desde cuándo.
- Cuántos testers hay invitados y cuántos aceptaron.
- Si hay alguna build en revisión o rechazada.

En EAS, corré `eas build:list` y decime las últimas cinco builds con su perfil,
su estado y su fecha.

### 4. La ficha de la tienda

Revisá qué falta para que la ficha esté completa: ícono, gráfico destacado,
capturas de pantalla en los tamaños que Play exige, descripción corta, descripción
larga, categoría, y los enlaces de política de privacidad y de eliminación de
cuenta.

Los dos enlaces que la app ya declara son `www.mimar.com.ar/terminos` y
`www.mimar.com.ar/cuenta/privacidad`. **Verificá que los dos abran** y que el
segundo explique cómo borrar la cuenta, porque Play lo exige explícitamente.

Decime qué falta con precisión. Si falta un gráfico, decime la medida.

### 5. El correo saliente

El repositorio anota como pendiente la configuración de Resend, que es lo que
entrega los códigos de recuperación de contraseña. Hoy eso está mitigado porque
las cuentas se confirman automáticamente, pero una persona que olvide su
contraseña durante el piloto no la puede recuperar.

**Qué hacer:** verificá en Resend si el dominio está verificado y si hay una
clave activa configurada en el proyecto. Decime si un correo saliente sale hoy
o no, y probalo si podés.

### 6. Los límites del proyecto Supabase

El repositorio anota una alerta de cuota sin resolver. Entrá al panel del
proyecto `agnwyifsdxxoznodutgq` y decime: el plan actual, el uso de base de
datos, de almacenamiento y de ancho de banda contra sus límites, y si hay alguna
alerta activa.

**Importa por una razón concreta:** staging y producción comparten el mismo
proyecto Supabase. Eso está decidido a propósito, pero significa que una cuota
agotada apaga las dos cosas a la vez.

### 7. El dominio

Verificá que `www.mimar.com.ar` y el dominio sin `www` resuelvan los dos, que el
certificado esté vigente, y que el proyecto de Vercel al que apuntan sea el que
está vivo. El proyecto vivo se llama `dim-staging`; hay otro llamado `dim` que
quedó sin uso en junio y que no hay que tocar.

---

## NO HACER

- **No subas ninguna build.** El corte del artefacto y la subida los decide el
  dueño del producto.
- **No promuevas nada** de prueba interna a producción.
- **No cambies precios, países ni disponibilidad.**
- **No borres ni revoques credenciales** de ningún sistema.
- **No toques la base de datos.** Ni una consulta de escritura.

---

## Cómo reportar

Una tabla, una fila por punto del 1 al 7, con tres columnas: **estado**
(hecho / ya estaba / bloqueado / no pude acceder), **evidencia** (qué viste
exactamente), y **qué queda**.

Después de la tabla, tres cosas:

1. **Lo que encontraste y no estaba en esta lista.** Cualquier cosa abierta en
   una consola que nadie anotó. Es lo más valioso que podés traer.
2. **Lo que necesita la mano del dueño del producto**, con el paso exacto.
3. **Lo que no pudiste verificar y por qué.** Prefiero esa lista a una
   suposición.

Si algo de lo que encontrás contradice lo que dice este prompt, **decilo**. Este
documento se escribió desde el repositorio, y el repositorio no puede ver esas
consolas.
