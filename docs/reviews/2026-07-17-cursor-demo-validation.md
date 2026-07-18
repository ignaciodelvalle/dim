# Validación pre-demo — Cursor

**LISTO PARA DEMO: SÍ**

Fecha: 17/07/2026  
Entorno: `https://dim-staging.vercel.app`  
Territorio: frente público + gobierno (CABA) con `lucas@dim.test`  
Modalidad: solo lectura. No se creó, marcó, aprobó, resolvió, firmó ni finalizó nada.

## Veredicto

Las pantallas del recorrido público y del portal gob con alcance CABA **se pueden proyectar mañana**. No apareció ningún BLOQUEA.

Hay dos ALTOs a tener en el guion: el primer pintado de Panorama (~11 s) y el nombre seed `PANO-Seed-Owner` si alguien abre “Está conmigo”. El resto son MEDIO/BAJO (inglés suelto en breadcrumbs, “backlog”, “Oversight”).

## Tabla de tiempos

| Pantalla | Medición |
|---|---|
| `/p/DIM-PAMP-0001` (móvil 390 px) | Primer load ~**2.160 ms** (FCP ~1.668 ms). Reload cacheado ~**704 ms** (FCP ~280 ms). |
| `/perdidas` | Lista lista: **116** activas; muestra las 24 más recientes. |
| `/` landing — QR hero | QR presente; path SVG idéntico al generado para `https://dim-staging.vercel.app/p/DIM-PAMP-0001`. `NEXT_PUBLIC_SITE_URL` en Vercel apunta a staging. |
| `/transparencia` CSV | `cobertura-antirrabica.csv` 200; origen `dim-staging.vercel.app`; generado `2026-07-17T19:37:59.410Z`; licencia CC BY 4.0. |
| `/gob/panorama` (lucas) | Primer pintado útil ~**11.255 ms**. Título: **CENTRO DE SITUACIÓN · CABA · 5 LOCALIDADES**. |
| `/gob/maltrato` | Cola con URLs `DEN-…` (ej. `DEN-TQSX-2U2F`). |
| `/gob/analytics/export` | Botón **Generar exportación**; breadcrumb mezcla inglés. |
| `/gob/vigilancia/investigaciones` | **0** investigaciones en 90 días; vacío honesto. |
| `/gob/programa` | KPIs CABA con metas; 1.149 registradas. |

## Checklist por pantalla

### 1. Credencial pública `/p/DIM-PAMP-0001` — proyectable

| Ítem | Resultado |
|---|---|
| Banda superior | Sí (`bg-ln-stripe` / chrome MiMAR) |
| Chip `NIVEL 2 · DATOS MÉDICOS` | Sí |
| `ANTIRRÁBICA` · `VIGENTE` | Sí |
| Foto real | Sí (Supabase Storage, 460×460) |

### 2. `/perdidas` — dos credenciales

| Mascota | Token | Banda roja | Cuerpo pérdida | Avisos | Línea privacidad |
|---|---|---|---|---|---|
| Laika | `PANO-045775` | Sí (`pc-strip` rgb 192,57,43) | Sí (“SE PERDIÓ · hace 28 días”) | Está conmigo / Vi a la mascota cerca de acá | Sí |
| Firulais | `PANO-036478` | Sí | Sí (“ESTÁ PERDIDO · hace 28 días”) | Lo tengo conmigo / Lo vi cerca de acá (género) | Sí |

- Sin botón `tel:` en ninguno → la línea de privacidad aparece donde corresponde.
- **¿Se contradicen los mensajes de contacto?** No. Ambos dicen que hay que completar un aviso; el formulario inferior (“Avisar al dueño”) es un tercer camino, no una contradicción sobre el teléfono.
- Teclado (Tab/focus + Enter): la navegación a `/encontre` y `/sighting` **llega**, pero con demora del soft-router de Next (a veces varios segundos). No bloquea la demo si se hace click y se espera.

### 3. Landing + Transparencia

- Hero QR: presente y codifica URL absoluta de staging (ver tabla).
- CSV: hrefs y `X-Methodology-Url` en `dim-staging.vercel.app`.

### 4. Panorama CABA (lucas)

- Alcance honesto: **CABA · 5 localidades** (badge GOB · 5 LOCALIDADES).
- Controles del mapa en castellano: **Pantalla completa**, **Acercar**, **Alejar**, **Marcador del mapa**. Sin restos “Fullscreen / Zoom in”.
- KPI visible: 14 denuncias en el período; backlog 19; mordeduras &lt;0,1 / 10k.

### 5. Maltrato + analytics/export

- Detalle con URL `…/gob/maltrato/DEN-TQSX-2U2F`.
- UI en castellano; sección **Exportación fiscal** + botón **Generar PDF MPF** (no hay pestaña literal “Exportar”, pero no hay “Export” suelto en botones de la denuncia).
- `/gob/analytics/export`: CTA **Generar exportación** OK; breadcrumb **Export** y chip **Analytics** en inglés.

### 6. Investigaciones + Programa

- Investigaciones: castellano; vacío con período (90 días) y cobertura explícitos.
- Programa: porcentajes con meta (denominador programático); total 1.149 explicado; completitud con fórmula. Inglés: título **Oversight de PII**.

## Hallazgos

### BLOQUEA

Ninguno.

### ALTO

#### Panorama tarda ~11 s en el primer pintado

- Pantalla: `/gob/panorama`
- Pasos: login lucas → Panorama
- Vi: ~11.255 ms hasta mapa + indicadores listos (mejor que la ronda previa de ~14,6 s, sigue lento para proyección en vivo).
- Guion: abrir Panorama **antes** de hablar de esa pantalla, o tener otra pestaña ya cargada.

#### Nombre seed `PANO-Seed-Owner` en “Está conmigo”

- Pantalla: `/p/PANO-045775/encontre`
- Pasos: credencial perdida → Está conmigo (solo navegar; no enviar)
- Vi: “PANO-Seed-Owner está esperando reencontrarse con Laika.”
- Riesgo: se ve dato de prueba en una pantalla que un funcionario podría pedir abrir.

### MEDIO

#### Soft-router demora clicks/Enter en CTAs de pérdida

- Pantallas: credenciales perdidas
- Pasos: focus + Enter o click en CTAs
- Vi: la URL no cambia al instante; llega después de 2–4+ s
- Impacto: no es un dead-end, pero en demo parece “no anda” si no se espera

#### “backlog” en castellano del Panorama

- Pantalla: Panorama → chip de denuncias
- Vi: “backlog: 19 activas en total”
- Preferible: “pendientes” / “sin asignar”

#### Breadcrumb inglés en analytics/export

- Pantalla: `/gob/analytics/export`
- Vi: `Panel > Analítica > Export` y “Analytics / Exportar datos”
- Los botones sí dicen “exportación”

#### “Oversight de PII” en Programa

- Pantalla: `/gob/programa`
- Vi: heading en inglés; el resto del bloque está en castellano

### BAJO

#### Acentos faltantes en export

- `proteccion`, `Jurisdiccion`, `proximamente` sin tilde

#### Conteos de calidad sin “de N” al lado

- Programa → Calidad: “Sexo desconocido 363”, “Sin microchip activo 739” — la fórmula de completitud está abajo, pero el card no repite el denominador 1.149 en cada fila

#### Atribución CC del CSV

- Metadato `# atribucion: … datos.mimar.gob.ar` (marca de producto; el origen HTTP del archivo es staging)

## Guion sugerido (evitar los ALTOs)

1. Credencial de Pampa (móvil) → checklist NIVEL 2 / antirrábica / foto.
2. `/perdidas` → Laika o Firulais; mostrar banda roja + línea de privacidad; **no hace falta** entrar a “Está conmigo”.
3. Landing QR + un CSV de Transparencia.
4. Panorama **ya abierto** → CABA honesto + controles en castellano.
5. Una denuncia `DEN-…` + pantalla de exportación (botón “Generar exportación”).
6. Investigaciones (vacío honesto) + Programa (metas CABA).
