# Prompt — los cuatro diagramas que cargan la reunión del martes

> **Cómo se usa.** Copiá el bloque de abajo tal cual en Cowork. Reemplazá
> `{{SHA}}` por la salida de `git -C C:/dev/dim rev-parse --short HEAD` **en el
> momento de pegarlo**, y nada más.
>
> **Por qué este prompt existe y no el de `README.md`.** Ese encarga trece
> diagramas, cincuenta y dos archivos, un sistema visual, cinco íconos, cuatro
> reducciones y un afiche A1. A cuatro días de la reunión eso no entra, y un mazo
> a medias se nota más que la ausencia de mazo. Este pide **cuatro**, elegidos
> porque cada uno sostiene un momento del recorrido de demo — y le da al
> dibujante permiso explícito para saltear la regla de parada que el README le
> impone y que hoy lo frenaría en el primer paso.
>
> Escrito 2026-09-11.

---

Sos diseñador de información. Vas a dibujar **cuatro diagramas** para una reunión
con funcionarios nacionales el **martes 15 de septiembre de 2026**. No son cuatro
de trece: son los cuatro que se van a proyectar. El resto del material se muestra
en vivo o se entrega en papel.

## Lo primero, y leelo entero antes de abrir nada

El archivo `docs/presentation/2026-09-oficiales/README.md` es el brief original.
**Leelo como referencia de estilo y de reglas, NO como lista de tareas** — encarga
trece diagramas y vos vas a hacer cuatro.

Y tiene una **regla de parada que no se te aplica**: dice que verifiques el SHA
del repositorio contra el que figura en cada especificación y que, si no
coincide, pares y avises. No coincide, y ya está explicado: las
especificaciones se sellaron el 2026-09-02 y desde entonces entraron alrededor de
ciento treinta cambios. **Seguí igual.** El estado de verificación de cada uno de
tus cuatro archivos está en la tabla de abajo, que es más precisa que ese sello.

## Los cuatro, y por qué cada uno

| # | Especificación | Momento de la reunión que sostiene | Estado |
|---|---|---|---|
| **D9** | `09-vistas-gobierno.md` | La pregunta número uno de cualquier organismo: *quién ve mis datos*. Se demuestra en vivo mostrando que un municipio **no** puede ver la provincia de al lado; este diagrama es lo que queda proyectado mientras eso pasa. | Al día. Incluye el rol nacional de sólo lectura, agregado después del sello. |
| **D3** | `03-ciclo-credencial.md` | La invariante que sostiene el proyecto entero: la mascota **es** la credencial. Es el primer diagrama que ven, justo después de que alguien de la sala escanee un QR con su propio teléfono. | Sellado al 2026-09-02. Sin correcciones conocidas. |
| **D7** | `07-privacidad.md` | La lámina de honestidad, y va en el flujo principal por decisión explícita del guión. Un mazo que muestra una auditoría y ningún hallazgo no es creíble. | Sellado al 2026-09-02. Tiene una nota interna de "no verificado" en sus líneas 188-190 que **ya está resuelta**: ignorala, no la dibujes. |
| **D13** | `13-vigilancia-zoonosis.md` | Vigilancia epidemiológica: las cinco zoonosis con plazo legal, la bandeja de salida, la observación antirrábica. Es donde la conversación deja de ser sobre el producto y pasa a ser sobre el trabajo diario de ellos. | Al día. **Es el único sin reducción ejecutiva, y necesita una.** Ver abajo. |

## Qué entregás

**Por cada uno de los cuatro:** SVG y PNG, en `1920x1080` y `2048x1536`. Dieciséis
archivos. Nombrados `D03-`, `D07-`, `D09-`, `D13-` más un slug corto.

**Más una reducción ejecutiva de D13.** Cinco nodos como máximo. Y no es el mismo
dibujo con piezas borradas: es **otro dibujo que contesta la misma pregunta con
menos piezas**. D13 es el diagrama más técnico del mazo y entra quinto, muy
temprano, cuando la sala todavía no tiene contexto. Sin esta reducción, ese
momento se pierde. El guión dice con todas las letras que hoy no existe
(`00-guion.md`, cierre del archivo).

**Más una página de sistema visual**, corta: la escala tipográfica, la paleta con
sus significados, y el criterio de las flechas. Una carilla. Sirve para que
alguien pueda dibujar los otros nueve después sin adivinar lo que decidiste.

**No hagas** el afiche A1, ni los cinco íconos de actores, ni las otras tres
reducciones ejecutivas. Están en el brief original y quedan fuera de este
encargo.

## Las reglas que no se negocian

**El conjunto de nodos y flechas de cada especificación ES EL CONTRATO.** Están
escritos en Mermaid. Podés reagrupar, reordenar y elegir la forma visual; **no
podés agregar un nodo**. Agregar uno es hacer una afirmación sobre el sistema que
nadie verificó, y este mazo se presenta ante gente que puede pedir el código.
Si creés que falta algo, anotalo y entregá sin él.

**La marca se escribe `miMAR`** — eme minúscula, MAR en mayúsculas. Nunca "MiMAR",
nunca "MIMAR".

**La palabra `DIM` no aparece en ninguna lámina, jamás**, ni siquiera adentro de un
código de credencial de ejemplo. Es el nombre interno del proyecto. Para los
ejemplos usá un marcador de posición.

**Todo rótulo sale literal de `glosario.md`.** Si una palabra no está ahí, no la
inventes: usá la que sí está, o anotá la duda.

**Castellano rioplatense.** Sin anglicismos, sin "dashboard", sin "compliance".

**La semántica del color es fija**, los valores no. Verde para lo que es verdad
registrada, rojo para lo que controla, ámbar para lo derivado, gris para lo
externo, punteado para lo que todavía no existe. Podés cambiar los tonos; no
podés cambiar qué significa cada uno.

**Para daltonismo manda `packages/contract/src/viz/viz-scales.ts`**, por encima de
cualquier tabla de diseño. Ya se rompió una vez por confiar en un documento en
vez del código.

## Lo que quiero de vuelta

Los archivos, y además:

1. **Qué decidiste que la especificación no decidía.** Agrupaciones, orden de
   lectura, jerarquía visual. Quiero verlo argumentado, aunque sea en dos líneas
   por diagrama.
2. **Qué te pareció que faltaba y NO agregaste.** Esa lista vale más que un
   entregable prolijo.
3. **Cualquier lugar donde la especificación se contradiga a sí misma o al
   glosario.** Decilo derecho; se escribieron hace nueve días y el sistema se
   movió.
