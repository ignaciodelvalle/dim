# Fotos para la demo — 27 mascotas

Generado 2026-08-01 contra staging, **después** de la reunificación y las pérdidas
recientes. Estas son las que de verdad se ven: el orden es el que aplica el fix de
`/perdidas` ya desplegado (`ad522b61`), no el que mostraba la ventana accidental.

Subida: entrás a cada mascota y usás el campo de foto del formulario de edición.
Con el avatar vacío ahora también podés tocar directamente la foto placeholder en
`/mis-mascotas/{token}` — te abre la hoja de edición en el campo correcto.

---

## `/perdidas` — primera pantalla (24 tarjetas)

Ordenadas como las va a ver el funcionario. Solo `kaia` tiene foto hoy.

| # | Token | Nombre | Especie | Provincia | Perdida |
|---|---|---|---|---|---|
| 1 | `DIM-K3X3-7A3F` | **CursorPet-001** ⚠️ | perro | CABA | 01/08 |
| 2 | `PANO-HIST-015757` | Bruno | perro | San Juan | 30/07 |
| 3 | `PANO-HIST-008244` | Luca | perro | Corrientes | 30/07 |
| 4 | `PANO-029850` | Canela | gato | Formosa | 30/07 |
| 5 | `PANO-HIST-004119` | Zeus | gato | Catamarca | 29/07 |
| 6 | `PANO-006889` | Canela | perro | Buenos Aires | 27/07 |
| 7 | `PANO-030847` | Canela | gato | La Pampa | 25/07 |
| 8 | `PANO-030003` | Nala | perro | Formosa | 24/07 |
| 9 | `PANO-036222` | Mora | perro | Río Negro | 24/07 |
| 10 | `PANO-038870` | Zeus | perro | San Luis | 24/07 |
| 11 | `PANO-021388` | Duna | perro | Chaco | 24/07 |
| 12 | `PANO-040365` | Max | perro | Tierra del Fuego | 22/07 |
| 13 | `PANO-025416` | Max | gato | Córdoba | 22/07 |
| 14 | `PANO-038425` | Zeus | perro | San Juan | 22/07 |
| 15 | `PANO-021563` | Fido | gato | Chaco | 22/07 |
| 16 | `PANO-034915` | Milo | perro | Neuquén | 22/07 |
| 17 | `PANO-041080` | Luna | perro | Tucumán | 21/07 |
| 18 | `PANO-HIST-011470` | Pancho | gato | La Rioja | 20/07 |
| 19 | `PANO-022767` | Milo | gato | Chubut | 20/07 |
| 20 | `PANO-HIST-016362` | Mia | gato | Santa Cruz | 19/07 |
| 21 | `DIM-Y883-Y45X` | kaia | perro | Tierra del Fuego | 19/07 | ✅ ya tiene |
| 22 | `PANO-016695` | Rex | perro | Buenos Aires | 18/07 |
| 23 | `PANO-040359` | Rocky | gato | Tierra del Fuego | 17/07 |
| 24 | `PANO-032863` | Atún | perro | Mendoza | 17/07 |

## `/adoptar` — las tres, todas sin foto

Esta página es la que más se beneficia: son tres tarjetas y ninguna tiene cara.

| Token | Nombre | Especie | Raza | Refugio |
|---|---|---|---|---|
| `DIM-S009-PLRM` | Lola | perra | Mestiza | Asociación Civil Patitas del Norte |
| `DIM-S012-RECO` | Negro | perro | Mestizo | Red de Rescate Puerto Madero |
| `DIM-S013-PLRM` | Bichita | cobaya | Cobayo americano | Asociación Civil Patitas del Norte |

---

## Dos cosas que la lista dejó a la vista

### 1. `CursorPet-001` es la tarjeta número UNO de `/perdidas` ⚠️

Un nombre de artefacto de prueba encabezando la página pública de la demo. Es la
primera cosa que se ve. Arreglo de una línea:

```sql
UPDATE pets SET name = 'Frida', updated_at = now()
WHERE public_token = 'DIM-K3X3-7A3F';
```

(El nombre da igual; `Frida` no se repite con ninguno de los otros 23.)

### 2. Veintidós de veinticuatro muestran token de semilla

`PANO-HIST-0xxxxx` y `PANO-0xxxxx` al pie de la credencial, mientras el producto
publicita el formato `DIM-XXXX-XXXX`. En la primera pantalla de `/perdidas` eso es
22 de 24 tarjetas delatando el sembrado.

No lo toco por mi cuenta: cambiar `public_token` reescribe la URL pública de cada
credencial y **invalida cualquier QR ya generado contra ese token**. En staging eso
probablemente no importa, pero es tu llamada, no la mía. Si querés, el remplazo es
directo — generar tokens con el formato real y actualizarlos en un solo statement.

### Nota sobre repeticiones

Tres "Canela", tres "Zeus", dos "Max", dos "Milo". El pool de nombres del seed es
chico. No es un defecto y no lo tocaría a un día de la demo, pero si el ojo se te va
ahí, se cambia con el mismo tipo de UPDATE que el punto 1.
