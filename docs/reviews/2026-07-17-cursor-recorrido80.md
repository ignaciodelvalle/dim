# Recorrido demo 80 — QA Cursor

Fecha: 17/07/2026  
Entorno: `http://localhost:3001`  
Guion: `docs/reviews/recorrido-demo-80.md`

## 1. TL;DR

Un funcionario puede trabajar con varias de las superficies: las colas son legibles, el alcance de Gobierno se respeta y las exportaciones funcionan. No mostraría todavía el recorrido completo a un ministro: el panorama abre en una vista distinta de la prometida y, al bajar a departamentos, el popup y el panel cuentan cosas incompatibles.

El ciclo más importante de la demo queda bloqueado al final: el animal puede ingresar, quedar apto y publicarse, pero “Finalizar adopción” queda cargando y después la ficha devuelve “No encontramos esta página”.

La experiencia ciudadana es entendible y la vacuna llega a la libreta, aunque la ubicación declarada al reportar una pérdida no llegó a la credencial pública.

## 2. Tabla de números anotados

| Acto | Pantalla | Valor exacto observado |
|---|---|---|
| 1 | `/p/DIM-PAMP-0001` | Credencial: **Activa**. Vacunación: **Con registros**. |
| 2a | `/gob/panorama`, sin tocar controles | Abrió en **Brotes activos**, modo **Capas**, no en Síntomas. Carga revalidada al cierre: **4.297 ms**. El mapa pintó datos: **553 registros**, **65,8%** de cobertura y **56** señales. |
| 2d | Popup fijo a nivel departamento | **Federal — Cobertura antirrábica (perros, 12m): 21**. No tiene `%`. El panel lateral siguió en el total de Entre Ríos: **68,5%**. |
| 4d | Buscador global con `DIM-PAMP-0001` | **“Sin coincidencias. El buscador de operadores no accede al padrón de mascotas. Una mascota aparece acá solo si tiene un caso (CAS-…) o una denuncia (DEN-…) asociada: buscá por ese código. Las búsquedas quedan registradas.”** |

Dato de alcance adicional: la interfaz de Lucas mostró **8 provincias** y **1774 localidades**; el guion declaraba 1775.

## 3. Hallazgos

### BLOQUEA

#### La adopción no se puede finalizar

- Pantalla: ficha de `QA7-Mora` → finalizar adopción.
- Esperaba: confirmación del cambio de responsable, estado entendible para ambas partes y credencial con el nuevo dueño.
- Vi: el botón quedó deshabilitado en **“Finalizando adopción…”** durante más de 30 segundos. Al volver a la ficha, apareció **“No encontramos esta página”**. No pude verificar el nuevo dueño en la credencial.
- Pasos: ingresar `QA7-Mora` → marcar apta → publicar → abrir finalización → completar adoptante `QA7-Adoptante Demo` → “Finalizar adopción”.

### ALTO

#### Popup y panel del panorama no representan el mismo valor

- Pantalla: `/gob/panorama?preset=brotes-activos`, nivel departamentos/partidos.
- Esperaba: que el popup y el panel lateral mostraran la misma unidad y métrica.
- Vi: popup de Federal **21** sin `%`; panel lateral de Entre Ríos **68,5%**. La leyenda aclara que el mapa usa conteo, pero el panel mantiene el porcentaje provincial. Es la divergencia que el guion marcaba como crítica.
- Pasos: abrir preset → acercar hasta `level=locality` → seleccionar Entre Ríos → seleccionar Federal.

#### La ubicación de una mascota perdida no llega a la credencial pública

- Pantalla: reporte de pérdida de `QA7-Luna` y `/p/DIM-YUJN-PWT9`.
- Esperaba: ver la ubicación declarada, “Plaza Almagro, CABA”, en la vista pública.
- Vi: la credencial sí mostró **“ESTÁ PERDIDA”**, pero dijo **“Sin ubicación de avistaje registrada”** incluso después de cerrar y volver a abrir sesión.
- Pasos: Carla → marcar perdida → cargar ubicación y detalle `QA7-` → abrir credencial sin sesión.

### MEDIO

#### El panorama no abre en la vista indicada por el recorrido

- Pantalla: `/gob/panorama`.
- Esperaba: **Síntomas / vigilancia sindrómica**.
- Vi: redirección a `preset=brotes-activos`, con **Brotes activos** y capas de zoonosis/cobertura.
- Pasos: iniciar sesión como Lucas → abrir Panorama sin tocar controles.

#### El alcance discrepa por una localidad

- Pantalla: cabecera del portal Gobierno.
- Esperaba: **1775 localidades**, según el guion.
- Vi: **1774 LOCALIDADES**. Las **8 provincias** sí coinciden.

#### La credencial resume la vacuna, pero no comunica claramente su vigencia

- Pantalla: credencial pública de `QA7-Luna` después de la carga veterinaria.
- Esperaba: vacuna concreta y vigencia fácilmente comprobables.
- Vi: el bloque principal dice **“Vacunación · Con registros”**. El resumen médico menciona **Antirrábica**, pero no deja una vigencia inequívoca en el bloque de estado.

#### Los enlaces de descarga de Transparencia apuntan al otro puerto de prueba

- Pantalla: `/transparencia` en `localhost:3001`.
- Esperaba: descargas servidas por el mismo origen.
- Vi: enlaces a `localhost:3000`. La descarga funcionó porque ese entorno también estaba disponible, pero Cursor puede terminar validando el servidor de Cowork.

#### Hay texto técnico en inglés en el portal de administración

- Pantalla: `/admin`.
- Vi: **“Dashboard”** y nombres crudos de procesos como `expire_foster_proposals`, `expire_pet_transfers`, `post_adoption_checkin`, `process_eno_queue` y `vaccine_due`. Los controles del mapa también exponen nombres accesibles **“Enter fullscreen”** y **“Close popup”**.
- Esperaba: castellano rioplatense también para rótulos operativos y lectores de pantalla.

### BAJO

#### Algunos enlaces necesitaron Enter para navegar

- Pantallas: éxito de alta de mascota (**“Ver perfil”**) y acceso veterinario (**“Registrar / firmar evento clínico”**).
- Esperaba: navegación con click.
- Vi: el click dejó la pantalla igual; con foco y Enter sí navegó.
- Nota: por esta anomalía no conservé un conteo de clicks confiable para 6c; la carga veterinaria sí se completó.

### IDEA

#### Explicar el QR con una frase de acción

En el alta ciudadana se entiende que se creó una credencial, pero ayudaría cerrar con una instrucción concreta: “Imprimí o compartí este QR: cualquiera que lo escanee verá la credencial pública, nunca tus datos privados”.

#### Convertir el modo bivariado en una lectura ejecutiva

La leyenda explica cobertura × zoonosis, pero falta una conclusión lista para decir en voz alta: “prioridad alta = cobertura baja y señales altas”, seguida por la jurisdicción más comprometida.

## 4. Consistencia

- **Panorama, unidad territorial:** popup de Federal = **21**; panel lateral = Entre Ríos **68,5%**. No son comparables y la selección no actualiza el panel a la unidad elegida.
- **Panorama, apertura:** el guion y la expectativa hablan de Síntomas; la ruta abrió Brotes activos.
- **Panorama, alcance:** la interfaz muestra 8 provincias de forma consistente, pero cuenta 1774 localidades frente a las 1775 del guion.
- **Pérdida pública:** el estado cambió a perdida, pero la ubicación escrita por la dueña se perdió entre el formulario y la credencial.
- **Vacunación:** la libreta de Carla muestra la Antirrábica cargada por Lilian; la credencial pública confirma que hay registros y menciona la vacuna, pero el sello principal no expresa vigencia.
- **Adopción:** la publicación apareció en `/adoptar`, pero la finalización dejó de ofrecer una historia verificable; ficha y credencial no permitieron confirmar el responsable nuevo.
- **Transparencia:** la página explica columnas, actualización diaria, licencia CC BY 4.0 y supresión de celdas con menos de 5 casos. El CSV descargó y tuvo contenido, pero el enlace cambió de puerto.
- **Permisos:** Lucas no pudo ampliar su alcance a Mendoza o Neuquén desde los controles disponibles. Los casos abiertos desde Admin conservaron el portal de operador.

## 5. Callejones sin salida

1. **Actos 5e y 5f:** la finalización de la adopción quedó en “Finalizando adopción…” y luego la ficha dio “No encontramos esta página”. No fue posible verificar el estado para ambas partes ni el nuevo dueño público.
2. **Acto 6c, métrica de clicks:** el flujo terminó y la vacuna quedó registrada, pero un enlace que no respondió al click obligó a usar Enter. No informo un número de clicks inventado.

## 6. Anexo de mutaciones

- Organización: Refugio Patitas del Norte (`DIM-4H5R-4P4S`).
- Animal creado: `QA7-Mora` — token `DIM-66WR-99SA`.
- `QA7-Mora`: ingreso sin dueño, marcada apta y publicada en adopción.
- Adoptante sintético cargado: `QA7-Adoptante Demo`. La finalización no pudo confirmarse.
- Animal creado por Carla: `QA7-Luna` — token `DIM-YUJN-PWT9`.
- `QA7-Luna`: marcada perdida con detalle `QA7-`, luego marcada encontrada.
- `QA7-Luna`: Antirrábica registrada por Lilian; visible en la libreta de Carla y en el resumen público.
- Acto 4: se reconoció/resolvió una alerta y se cerró una observación antirrábica durante el recorrido. Esas pantallas no expusieron un token estable en el resultado que pudiera conservar en este anexo.
