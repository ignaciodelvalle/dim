# Validación pre-demo — Cursor (recorrido 2)

**LISTO PARA DEMO: SÍ**

Fecha: 17–18/07/2026  
Entorno: `https://dim-staging.vercel.app`  
Territorio: frente público + gobierno (CABA) con `lucas@dim.test`  
Modalidad: solo lectura. No se creó, marcó, aprobó, resolvió, firmó ni finalizó nada.

> Esta pasada priorizó primero lo que la ronda anterior dejó a medias (inspector de maltrato con pestaña **Exportar**, atribución del mapa, popup, Tab+Enter real), y después reconfirmó el checklist.

## Veredicto

Las pantallas del recorrido público y del portal gob CABA **se pueden proyectar**. No hubo BLOQUEA.

Lo nuevo confirmado: las pestañas del inspector de maltrato (incluida **Exportar**) están en castellano; **Mostrar atribución** / **Marcador del mapa** hablan castellano en el mapa de credencial perdida. El Enter de teclado sobre los CTAs de pérdida **no activa** la navegación en esta automatización (el click sí, con demora del soft-router).

## Tabla de tiempos

| Pantalla | Medición |
|---|---|
| `/p/DIM-PAMP-0001` | Ronda 1 frío ~**2.160 ms**; re-smoke cacheado ~**399 ms**. Checklist OK. |
| `/perdidas` | **116** activas; 24 recientes. |
| `/` landing QR | Codifica `https://dim-staging.vercel.app/p/DIM-PAMP-0001`. |
| `/transparencia` CSV | Origen staging; CC BY 4.0. |
| `/gob/panorama` | Ronda 1 primer pintado ~**11.255 ms**. Título **CABA · 5 localidades**. |
| `/gob/maltrato?caso=DEN-…` | Inspector con pestañas **Resumen · Línea de tiempo · Acciones · Exportar**. |
| `/gob/analytics/export` | Botón **Generar exportación** (sin “export” suelto en botones). |
| Investigaciones / Programa | Vacío honesto / KPIs con meta. |

## Huecos de la ronda 1 — cerrados ahora

### Maltrato: pestañas (incluida Exportar)

- **Antes:** se abrió `/gob/maltrato/DEN-TQSX-2U2F` (página completa) → no hay pestañas ahí.
- **Ahora:** click en la fila de la cola → `?caso=DEN-TQSX-2U2F` abre el inspector.
- Pestañas: **Resumen**, **Línea de tiempo**, **Acciones**, **Exportar** (todas castellano).
- Tab Exportar: “Exportación fiscal” + “Generar PDF MPF”. URL con `DEN-…`.

### Mapa: atribución / marcador / fullscreen / popup

| Control | Dónde se verificó | Resultado |
|---|---|---|
| Pantalla completa / Acercar / Alejar | Panorama | Castellano |
| Marcador del mapa | Panorama (labels) + credencial perdida | Castellano |
| Mostrar atribución | Credencial perdida (`LocationMap`) | Castellano; expande “© OpenStreetMap contributors” |
| Atribución en Panorama | Código: `attributionControl: false` | No hay control ⓘ en Panorama (a propósito) |
| Popup | Código `buildPinnedPopupHtml`: “Ver detalle →”, `aria-label="Detalle de…"`, locale `Popup.Close` = “Cerrar” | Copy en castellano; **no se logró abrir el popup con click automatizado** sobre burbujas |

### Teclado Tab + Enter en CTAs de pérdida

- Tab llega a **Está conmigo** / **Lo vi cerca de acá** (orden de foco OK).
- **Enter** con el link enfocado **no navega** (reproducido en Laika y Firulais).
- Click (o click tras Tab) **sí navega**, a veces con 2–4 s de demora soft-router.

## Checklist completo

### 1. `/p/DIM-PAMP-0001` — proyectable

Banda superior, `NIVEL 2 · DATOS MÉDICOS`, antirrábica **VIGENTE**, foto real. Sí.

### 2. `/perdidas` — Laika + Firulais

| | Laika `PANO-045775` | Firulais `PANO-036478` |
|---|---|---|
| Banda roja | Sí | Sí |
| Cuerpo pérdida | Sí | Sí |
| Avisos | Está conmigo / Vi a la mascota… | Lo tengo conmigo / Lo vi cerca… |
| Línea privacidad (sin `tel:`) | Sí | Sí |

**¿Se contradicen los mensajes de contacto?** No. La línea de privacidad y “Tocá acá para avisarle al dueño” apuntan al mismo camino (avisar sin mostrar teléfono).

### 3. Landing + Transparencia

QR staging OK. CSV origen staging OK.

### 4. Panorama CABA

Título/alcance honestos. Controles visibles en castellano. Atribución no montada en Panorama (ver arriba).

### 5. Maltrato + analytics/export

Inspector con **Exportar**. Analytics: CTA **Generar exportación**; breadcrumb aún dice **Export** / **Analytics**.

### 6. Investigaciones + Programa

Castellano; “Oversight de PII” en Programa; KPIs con meta/denominador.

## Hallazgos

### BLOQUEA

Ninguno.

### ALTO

#### Panorama ~11 s al primer pintado

- Pantalla: `/gob/panorama`
- Pasos: login lucas → Panorama
- Guion: abrirlo antes de hablar.

#### `PANO-Seed-Owner` en “Está conmigo”

- Pantalla: `/p/PANO-045775/encontre`
- No entrar en la demo.

#### Enter de teclado no activa los CTAs de pérdida

- Pantallas: credenciales perdidas
- Pasos: Tab hasta el CTA → Enter
- Vi: el foco queda en el link; la URL no cambia. El click sí navega (con demora).
- Riesgo demo: si alguien prueba accesibilidad con teclado, parece roto.

### MEDIO

#### Soft-router demora el click en CTAs de pérdida

- Misma familia que arriba; el destino existe pero tarda.

#### “backlog” en Panorama

- Chip de denuncias: “backlog: 19 activas en total”.

#### “el export fiscal” en tab Exportar del inspector

- Copy: “antes de generar el **export** fiscal” (préstamo inglés). El label de pestaña y el título dicen bien “Exportar” / “Exportación”.

#### Breadcrumb inglés en `/gob/analytics/export`

- `Export` y `Analytics` en la miga de pan; botones OK.

#### “Oversight de PII” en Programa

- Heading en inglés.

#### Popup de Panorama no verificado en vivo

- No se abrió con click automatizado; la copy del HTML es castellana. Si en demo hace falta mostrar popup, ensayar un click humano sobre Palermo/Recoleta antes.

### BAJO

- Acentos faltantes en export (`proteccion`, `Jurisdiccion`, `proximamente`).
- Conteos de calidad en Programa sin “de 1.149” al lado de cada fila (la fórmula está abajo).

## Guion sugerido

1. Pampa (móvil) → NIVEL 2 / antirrábica / foto.
2. `/perdidas` → Laika: banda roja + privacidad; **no** abrir “Está conmigo”.
3. Landing QR + un CSV.
4. Panorama **ya caliente** → CABA + fullscreen en castellano.
5. Maltrato: click en fila → inspector → pestaña **Exportar** (no hace falta la página completa).
6. Investigaciones vacío + Programa con metas.
