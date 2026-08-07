# Ronda staging — QA Cursor

Fecha: 17/07/2026  
Entorno: `https://dim-staging.vercel.app`  
Modalidad: solo lectura. No se creó, marcó, aprobó, resolvió, firmó ni finalizó nada.

## TL;DR

**No se lo mostraría a un ministro YA como recorrido integral.** La credencial pública nueva y el modo pérdida están claros, rápidos y visualmente convincentes; Transparencia también quedó bien atada al dominio real.

El bloqueo está en la cuenta de demostración: Lucas tiene alcance de **CABA · 5 localidades**, no vista nacional. Así no se pueden validar los círculos nacionales por departamento, el drill, el popup ni la exportación CSV del Panorama pedida para esta ronda. Además, el primer pintado medido tardó **14.599 ms**.

También sigue una falla de navegación visible: varios links reciben el click pero no cambian de pantalla; Enter sobre el link enfocado sí funciona.

## Tabla de números

| Pantalla | Número o valor observado |
|---|---|
| Credencial de Pampa | Primer load completo: **3.557 ms**. Repetición cacheada a 390 px: **416 ms**. |
| QR de Pampa | **No hay QR renderizado** en el hero ni en el resto de la credencial: 0 elementos QR y ningún `canvas`/imagen QR. No se puede afirmar si codifica URL completa o relativa. El `og:url`, que no es el QR, sí es `https://dim-staging.vercel.app/p/DIM-PAMP-0001`. |
| Credencial de Pampa | Banda azul; chip **“NIVEL 2 · DATOS MÉDICOS”**; credencial **Activa**; vacunación **Con registros**; Antirrábica **VIGENTE**. |
| `/perdidas` | **116** activas; **0** nuevas en 24 h; **0** nuevas en 7 días; muestra las 24 más recientes. |
| Credencial perdida abierta | Laika, `PANO-045775`, perdida hace **28 días**. Dos caminos principales: **Está conmigo** y **Vi a la mascota cerca de acá**. |
| Panorama | **14.599 ms** desde activar el link hasta mapa e indicadores listos. Alcance visible: **CABA · 5 localidades**. |
| Panorama — vista inicial | **0** registros; **0** señales de zoonosis; **<0,1** mordeduras/10k; **12** denuncias en el período; backlog **19**. |
| Panorama — Bienestar 90d | **14** denuncias en el período; backlog **19**. |
| Investigaciones | **0** investigaciones en los últimos 90 días dentro del alcance. |
| Maltrato | **23** denuncias; **19** sin asignar; **0** mías; **2** en investigación. |
| Transparencia | **10** links de datos: 5 CSV + 5 JSON. Los 10 usan `https://dim-staging.vercel.app`. |
| CSV descargado | `cobertura-antirrabica.csv`; actualización diaria; generado `2026-07-17T13:21:17.550Z`; licencia CC BY 4.0. |

## Hallazgos

### BLOQUEA

#### La cuenta de Lucas no permite ejecutar la prueba nacional de Panorama

- Pantalla: `/gob/panorama`.
- Esperaba: vista nacional con la capa de zoonosis, círculos por departamento, drill y popup de conteo.
- Vi: Lucas figura como **Gobierno · 5 localidades**. El único selector provincial es CABA y el centro de situación dice **CABA · 5 localidades**. No existe una opción nacional.
- Consecuencia: no se puede verificar si los círculos son departamentales o provinciales, si badge/caption/mapa cuentan la misma historia nacional, ni si el popup de drill dice “(conteo)” mientras el panel mantiene el porcentaje.
- Pasos: iniciar sesión como Lucas → abrir Panorama → revisar alcance y selector Provincia.

#### Panorama no ofrece CSV en el alcance disponible

- Pantalla: Panorama → Exportar.
- Esperaba: descargar CSV y recibir confirmación.
- Vi: **“No hay datos por unidad para exportar en esta vista.”** Solo quedaron disponibles PNG e informe. Probé Síntomas, Brotes activos y Bienestar sin cambiar el alcance ni mutar datos.
- Consecuencia: no se pudo ejecutar la exportación CSV ni validar su confirmación.

### ALTO

#### El QR vigilado no está renderizado

- Pantalla: `/p/DIM-PAMP-0001`, 390 px.
- Esperaba: QR en el hero, codificando una URL HTTPS completa del staging.
- Vi: banda, chip NIVEL, foto y datos, pero ningún QR visible. El DOM renderizado contiene la foto y un ícono SVG, sin `canvas`, imagen o nodo QR.
- Consecuencia: la regresión URL completa vs. relativa no se puede verificar porque falta el objeto a escanear.

#### Panorama tardó 14,6 segundos en quedar listo

- Pantalla: `/gob/panorama`.
- Medición: **14.599 ms** desde la activación del link hasta encontrar mapa e indicadores sin estado de carga.
- Vi: terminó con 0 registros para la capa inicial y el mensaje “Sin datos para esta capa en este alcance”.
- Riesgo demo: durante ese tiempo no hay una respuesta suficientemente rápida para una presentación ejecutiva.

#### Links principales reciben el click pero no navegan

- Pantallas: `/perdidas`, credencial perdida, navegación Gobierno.
- Vi: el click real enfocó el link pero dejó la URL igual. Enter sobre ese mismo link sí navegó.
- Reproducido en: primera mascota de `/perdidas`, “Está conmigo”, “Vi a la mascota cerca de acá”, Panorama, Vigilancia, Investigaciones y Maltrato.
- Riesgo: un usuario de mouse puede quedar varado aunque el destino sea válido.

### MEDIO

#### La tarjeta de pérdida es clara, pero no hay llamada directa

- Pantalla: `/p/PANO-045775`.
- Bien: banda roja superior, bloque rojo en el cuerpo, última ubicación, mapa y dos CTAs inequívocos.
- Vi: “Está conmigo” abre un formulario completo y “Vi a la mascota cerca de acá” abre el formulario de avistaje. Ambos explican que el dueño recibe el aviso al instante.
- Falta: no aparece un camino de llamada directa ni una explicación breve de que el teléfono se oculta por privacidad. Como vecino, entiendo cómo avisar, pero puedo seguir buscando dónde llamar.

#### No hay investigaciones para evaluar el texto del motivo

- Pantalla: `/gob/vigilancia/investigaciones`.
- Vi: **0 investigaciones** y “Sin investigaciones en este periodo”.
- Consecuencia: no se pudo comprobar si el motivo de una fila real está en castellano llano.

#### Los datos del cubo parecen parciales para el alcance

- Pantalla: Panorama.
- Vi: el panel de Bienestar contó 14 denuncias en 90 días, mientras algunas cargas del mapa dijeron “Sin datos para esta capa en este alcance”; después apareció una leyenda de 1 a 14.
- Nota: el entorno declara actualización diaria. Lo registro como posible desfasaje/partialidad y no como contradicción confirmada.

### BAJO

#### Queda una palabra en inglés en el detalle de denuncia

- Pantalla: `/gob/maltrato?caso=DEN-TQSX-2U2F`.
- Vi: pestañas “Resumen”, “Línea de tiempo”, “Acciones” y **“Export”**.
- Esperaba: “Exportar”.

#### Controles accesibles del mapa aparecen en inglés

- Pantalla: credencial perdida y mapas.
- Vi en nombres accesibles: **“Map marker”** y **“Toggle attribution”**.
- Impacto: lectores de pantalla reciben una interfaz mezclada.

### IDEA

#### Explicar por qué no se muestra el teléfono del dueño

Junto a los dos CTAs de pérdida, una línea como “Por privacidad no mostramos el teléfono: completá uno de estos avisos y el dueño te contacta” resolvería la expectativa de “llamar”.

#### Mostrar estado y antigüedad del cubo dentro de Panorama

Además de “Último evento en el alcance”, mostrar “Cubo actualizado: fecha/hora” permitiría distinguir enseguida entre falta real de datos y retraso de la actualización diaria.

## Comprobaciones que pasaron

- La credencial nueva tiene banda superior coherente y el chip **NIVEL 2 · DATOS MÉDICOS** se entiende.
- La antirrábica de Pampa se comunica explícitamente como **VIGENTE**.
- La credencial perdida lleva banda roja y repite la información de pérdida en el cuerpo.
- Los dos caminos de aviso abren formularios distintos y comprensibles sin enviar nada.
- El detalle de maltrato usa el código público en la URL: `?caso=DEN-TQSX-2U2F`, no un UUID interno.
- Los 10 links de Transparencia, con y sin sesión, apuntan al origen correcto `https://dim-staging.vercel.app`.
- El CSV se descargó y trae descripción, periodicidad diaria, fecha de generación, metodología y licencia.

## Qué no pude terminar

1. **QR:** no pude leer el payload porque no hay QR renderizado.
2. **Panorama nacional:** la cuenta de Lucas está limitada a CABA y 5 localidades.
3. **Círculos nacionales:** sin alcance nacional no pude decidir si son por departamento o un globo por provincia.
4. **Drill y popup:** no pude llegar al flujo nacional → departamentos ni verificar el rótulo “(conteo)”.
5. **CSV de Panorama:** el panel informó que no había datos por unidad para exportar.
6. **Motivo de investigación:** la lista tiene 0 investigaciones.

No se ejecutó ninguna acción mutante en staging.
