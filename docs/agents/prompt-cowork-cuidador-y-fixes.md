# Prompt — verificación funcional: cuidador temporal + fixes de agosto (Cowork)

> **Cómo usar este archivo.** Copiá el bloque de abajo tal cual y reemplazá
> `{SHA}` por el commit vigente en staging (comparación por prefijo de 7,
> mismo criterio que los hermanos).
>
> **Qué es esto y qué NO es.** Este brief valida que los flujos **FUNCIONAN**:
> te dice a dónde ir y qué esperar. NO es el recorrido ciego
> (`prompt-cowork-recorridos-ciegos.md`), que valida lo contrario — si una
> persona nueva puede descubrir el camino sola. **Este va primero.** El
> circuito de cuidador temporal nunca corrió en un navegador; una corrida
> ciega sobre un flujo roto reporta "no se entiende" cuando lo que pasa es
> "no anda".
>
> **Cuándo correrlo.** Después de aplicar las migraciones 0188–0193 a staging
> y de re-seedear. Sin la 0190 viva, el camino de aceptación de cuidador no
> se puede ejercer en un entorno compartido.
>
> **Qué es el resultado.** Una lista de lo que anda y lo que no, con
> evidencia. Y algo más valioso: **dónde el producto afirma algo que no es
> cierto**. Varios de los fixes de esta tanda existen porque una pantalla
> decía una cosa y el sistema hacía otra.

---

## El bloque para pegar

Sos un agente de navegador verificando miMAR en staging. Esta es una corrida
**guionada**: te digo a dónde ir y qué debería pasar. Tu trabajo es confirmar
que pasa, y cuando no pasa, documentarlo con precisión.

**Entorno:** https://dim-staging.vercel.app
**Build a revisar:** `{SHA}`
**Prefijo de datos que crees:** `VF0820`

### 0. Build check (antes de empezar)

```
curl -s https://dim-staging.vercel.app/ | grep mimar-version
```

El meta trae 7 caracteres — compará por PREFIJO contra `{SHA}`. Si no
coincide, **PARÁ y avisá**. Releelo al cerrar cada objetivo.

### Cuentas

| Rol | Cuenta | Password |
|---|---|---|
| Dueño / titular | `owner@dim.test` | `Test1234!` |
| Segunda persona (será cuidadora) | `adoptante@dim.test` | `Test1234!` |
| Organización | `alejo@dim.test` | `Test1234!` |
| Gobierno CABA | `lucas@dim.test` | `Test1234!` |
| Veterinaria con matrícula en trámite (O10) | `carla@dim.test` | `Test1234!` |

Si una sesión no arranca, decilo y seguí con lo que puedas. No inventes
cuentas ni cambies contraseñas.

### Reglas de esta corrida

- **Documentá lo que VES, no lo que esperabas.** Si una pantalla dice algo
  distinto a lo que este brief anticipa, gana la pantalla y eso es el
  hallazgo.
- **Copiá los textos exactos** cuando verifiques copy. "Decía algo parecido"
  no sirve: varios objetivos acá son sobre la palabra precisa.
- **No borres nada que no hayas creado vos.**
- Si algo te pide confirmar una acción destructiva sobre datos que no creaste,
  **frená** y reportalo en vez de ejecutarlo.

---

## O1 — El circuito de cuidador temporal, de punta a punta

**Lo más importante de esta corrida.** Es un módulo entero que nunca se
ejerció en un navegador.

Con `owner@dim.test`: elegí una mascota tuya y buscá la opción de designar
un cuidador temporal. Designá a `adoptante@dim.test` con una fecha de fin
**dentro de los próximos 7 días** y una nota que contenga `VF0820`.

Después, con `adoptante@dim.test`: abrí la invitación que le llegó.

**Qué verificar, en orden:**

1. **Antes de aceptar**, ¿qué le muestra la página al invitado? Tiene que
   decirle qué va a poder hacer y qué no. Copiá esa lista textual. Una
   persona a la que le entregan acceso al animal de otro tiene que saber
   exactamente a qué está diciendo que sí.
2. **Aceptá.** ¿Aparece la mascota en la lista del cuidador?
3. **Volvé a la cuenta del titular.** ¿La mascota le sigue apareciendo? ¿El
   contador distingue las propias de las que tiene al cuidado? Copiá el
   texto del contador exacto.
4. **Como cuidador, cargá un evento médico** (una vacuna o una nota) con
   `VF0820` en algún campo. Tiene que dejarte.
5. **Como titular, cortá el cuidado** ("finalizar ahora" o similar). ¿Es
   inmediato? ¿Qué ve el cuidador después — copiá el texto exacto?

**El hallazgo que más me importa:** en el paso 5, el texto **no puede
afirmar que la mascota volvió**. El vencimiento del cuidado termina el
*acceso*, no la *posesión*. Si la pantalla dice o sugiere que el animal está
de vuelta con su dueño, eso es un hallazgo grave — el sistema no puede saberlo.

## O2 — Lo que un cuidador NO puede hacer

Con `adoptante@dim.test` como cuidador activo (repetí O1 hasta el paso 4 si
lo cortaste).

Sobre la mascota que tenés al cuidado, buscá estas cuatro acciones:
**transferir la mascota**, **publicarla en adopción**, **cambiarle la
localidad/jurisdicción**, y **compartir la libreta**.

**No deberías verlas.** Reportá cada una que SÍ aparezca.

Después probá lo mismo por URL directa: tomá la ruta de alguna de esas
acciones sobre una mascota **tuya propia**, y adaptala a la que tenés al
cuidado. Debería negarte con un mensaje claro.

**Qué buscamos:** un cuidador que descubre un muro de permisos apretando un
botón es una experiencia pobre. Que el botón no esté es lo correcto; que
esté y falle es un hallazgo; que esté y **funcione** es grave.

## O3 — Los gatos del catálogo

Sin sesión: `https://dim-staging.vercel.app/adoptar` → filtro **ESPECIE =
Gatos**.

Tienen que aparecer **Milanesa** (joven) y **Pochoclo** (cachorro). Abrí
las dos fichas y confirmá que los datos son coherentes: raza, edad, si está
castrado.

**Verificación específica:** en la ficha de Milanesa, la libreta o los datos
sanitarios deberían mostrar la antirrábica registrada. Si aparece como *sin
registro* mientras el texto de adopción dice que está vacunada, eso es un
hallazgo — hubo un typo en el nombre de la vacuna que se corrigió, y esto
confirma que el arreglo llegó.

## O4 — La gravedad que elegiste es la que te devuelven

Sin sesión: hacé una denuncia de maltrato anónima. En el paso de gravedad
elegí la opción más grave y **copiá su texto exacto**.

Completá y enviá. Guardá el código `DEN-`.

Entrá al seguimiento con ese código. Buscá dónde te muestra la gravedad.

**Tiene que decir la MISMA palabra que elegiste.** Si el wizard decía una
cosa y el seguimiento dice otra —sobre todo bajo un texto que dice "gravedad
que indicaste"— es exactamente el hallazgo que este arreglo cierra.

## O5 — La banda de la portada

`https://dim-staging.vercel.app/`

Tienen que estar **tres puertas**: perdí una mascota, encontré una mascota,
y una tercera para denunciar maltrato. **No** tiene que haber un campo de
texto para pegar códigos.

Abrí la tercera y confirmá que llega al formulario de denuncia.

**Copiá el subtítulo de esa tercera tarjeta.** No puede prometer que la
autoridad va a intervenir — la denuncia queda registrada con código de
seguimiento, no se despacha a ningún organismo todavía.

Después achicá la ventana del navegador progresivamente y mirá cómo se
reacomoda la banda: tres columnas, después dos, después una. No debería
aparecer scroll horizontal en ningún ancho.

## O6 — El filtro de localidad del funcionario

Con `lucas@dim.test` (Gobierno CABA): entrá a la cola de denuncias.

Anotá el total que muestra. Después **filtrá por una localidad** y anotá el
total de nuevo.

**El número tiene que cambiar, y la lista tiene que mostrar solo esa
localidad.** Si el chip del filtro figura activo pero el conteo no se mueve
y siguen apareciendo otros barrios, el arreglo no llegó — y ese era
justamente el problema.

## O7 — La próxima dosis

Con `owner@dim.test`: registrá una vacuna en alguna mascota tuya y **cambiá
la fecha de aplicación a una fecha pasada** (por ejemplo, hace un mes).

Mirá el campo de próxima dosis.

**Tiene que contar desde la fecha que pusiste, no desde hoy.** Si pusiste
una fecha de hace un mes y la próxima dosis sale a doce meses de hoy en vez
de doce meses de esa fecha, el arreglo no llegó.

## O8 — Rutas nuevas que nadie abrió

Visitá `https://dim-staging.vercel.app/mantenimiento` directamente.

Es una ruta nueva. Tiene que renderizar algo coherente y en castellano, sin
error, sin pantalla en blanco, y sin quedar atrapada en un bucle de
redirección.

## O9 — Lo que el titular NO debería ver

Con `owner@dim.test`: abrí una mascota tuya y desplegá el menú **Más**.

**No tiene que aparecer "Buscar hogar".** Esa opción es del tránsito, y la
página detrás exige ese rol: un titular que la tocaba aterrizaba en un 404.

Si la ves, copiá el texto exacto de la fila y decime desde qué pantalla la
abriste.

## O10 — Le piden un dato al veterinario y ahora la pantalla lo dice

Dos sesiones. Es el objetivo más largo de la corrida y el que más me importa
después de O1.

**Primero, con `lucas@dim.test`** (Gobierno CABA): entrá a `/gob/cola` y buscá
la solicitud de **upgrade a veterinario/a de Carla** (está pendiente en CABA).
Abrila y usá **"Pedir más información"**. Escribí un mensaje que contenga
`VF0820`, por ejemplo: `Falta el número de matrícula, VF0820`.

**Después, con `carla@dim.test`** (misma contraseña que el resto):

1. Abrí su campana de notificaciones. Tiene que haber un aviso del pedido.
   **Tocá su botón de acción** y anotá **en qué página aterrizás**. Tiene que
   ser `/cuenta/solicitudes`. Si te deja en `/cuenta/upgrade` con un cartel que
   dice "Solicitud enviada — pendiente de revisión" y nada más, eso es el
   fallo: el arreglo no llegó por el camino que el producto usa.
2. En esa página, la solicitud pendiente tiene que mostrar **"Información
   pedida"** con la fecha y **el mensaje que escribió Lucas**. Copialo textual.
3. Debajo tiene que decirle **qué hacer**: que para responder hay que retirar la
   solicitud y enviar una nueva. Copiá esa frase.

**El hallazgo que busco acá:** que el mensaje aparezca **una sola vez**, sin
preámbulos apilados. Si leés algo como *"Información pedida el 20/08: Necesitamos
más información para avanzar con tu solicitud: falta el número"* —dos veces dos
puntos, dos introducciones— eso es un fallo, aunque se entienda.

**No retires la solicitud.** Quiero el estado intacto para poder mirarlo después.

---

# Qué reportar

Por cada objetivo: **LOGRADO / PARCIAL / FALLÓ**, el camino que recorriste,
y los textos exactos donde el brief los pide.

Y aparte, tres listas:

**Afirmaciones falsas.** Cualquier lugar donde una pantalla diga algo que no
es cierto — un contador que no coincide, un estado que afirma más de lo que
el sistema sabe, un botón que promete algo que no hace. Esta es la lista más
valiosa.

**Callejones sin salida.** Estados donde llegaste y no había salida obvia, o
donde una acción te dejó sin saber si funcionó.

**Lo que no pudiste verificar**, y por qué. Un hueco declarado sirve; uno
escondido no.
