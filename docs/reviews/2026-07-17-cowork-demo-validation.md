# Ronda de validación pre-demo (solo-lectura) — Informe Cowork

**Entorno:** https://dim-staging.vercel.app (staging real, HTTPS) · **Fecha:** 17/07/2026, 20:10–21:10 (ART)
**Modalidad:** solo lectura — no creé, marqué, aprobé, resolví, firmé ni finalicé nada. Navegué, filtré, abrí fichas y descargué un CSV.
**Cuentas:** admin@dim.test (recorrido del funcionario) y alejo@dim.test (refugio, solo mirar). Las contraseñas las tipeó Nacho (no tipeo contraseñas, ni de test).
**Cómo medí:** Chrome real del equipo del demo (viewport ~1400×860), Navigation Timing + FCP/LCP del navegador y cronómetro sobre el estado visible. Los tiempos son los que va a ver el funcionario en esta misma máquina.

---

## ¿LISTO PARA DEMO? **NO (todavía)**

Tres cosas lo frenan hoy; ninguna es de diseño, las tres parecen destrabables antes de mañana:

1. **Programa y Población no cargan** (timeout con Reintentar sin éxito, 3 y 2 intentos). Están en el nav del admin: un click curioso del funcionario y se proyecta un "Los datos están tardando más de lo normal".
2. **La primera pantalla del demo abre con un banner rojo**: "Procesos automáticos caídos · avisá a soporte" — `cron_daily` y `cron_health` en FALLO desde las 04:51 de hoy. Es real (no un bug del banner): hay que correr/arreglar esos dos procesos o el demo arranca con cara de incidente.
3. **Los indicadores del Panorama se caen intermitentemente** justo en EL momento del demo ("No pudimos cargar los indicadores…", "No pudimos calcular esta capa a tiempo"). Se recuperan con Actualizar o esperando ~10-30s, pero el riesgo en vivo es alto.

**La base está muy bien:** el cuelgue de /admin de esta tarde quedó arreglado (2,9s en frío, 0,7-1,8s las recargas), el buscador ahora explica por qué un código DIM- no aparece, abrir un caso ya no te saca del portal, el drill del panorama cuenta una sola historia (badge + caption + popup "(conteo)" + panel en %), el CSV confirma la descarga, y el k-anonimato está explicado en pantalla. Si se destraban los 3 puntos de arriba, esto se proyecta con orgullo.

---

## Tabla de tiempos

| Pantalla / momento | Medición | Detalle |
|---|---|---|
| `/admin` — carga inicial (fría) | **~2,9 s** | TTFB 101 ms · FCP 2,56 s · LCP 2,92 s · contenido completo al load (sin fetches post-carga) |
| `/admin` — recarga 1 | **~1,8 s** | FCP 0,29 s · load 1,72 s |
| `/admin` — recarga 2 | **~0,8 s** | FCP 0,43 s · load 0,56 s |
| `/admin` — recarga 3 | **~0,7 s** | FCP 0,34 s · load 0,46 s |
| `/admin` — aviso "La carga está tardando más de lo normal" | **Nunca apareció** en 4 cargas ✅ | Tampoco cuelgues ni skeletons residuales |
| `/admin/panorama` — primer pintado (frío, sin tocar nada) | **shell 0,4 s · mapa+datos ~7-8 s** | TTFB 34 ms · FCP 0,38 s · LCP 6,64 s · load 7,45 s · último fetch de datos 8,0 s |
| Panorama — KPIs al cambiar de alcance | **~10 a >30 s o error** | AR-S (Santa Fe) >30 s (la UI se rinde antes); AR-X (Córdoba) ~10 s con error intermedio que luego se resolvió solo |
| `/admin/programa` | **No cargó** (3 intentos) | "La consulta superó el tiempo de espera" + Reintentar sin éxito |
| `/admin/poblacion` | **No cargó** (2 intentos) | Skeletons + "La carga está tardando más de lo normal." |
| `/admin/poblacion` — reintento posterior (~15 min después) | **504 crudo de Vercel** | "504: GATEWAY_TIMEOUT · FUNCTION_INVOCATION_TIMEOUT" en inglés, sin chrome de la app |
| Refugio (alejo): panel, custodia y ficha | **Fluido** (~2-3 s por pantalla) ✅ | Sin errores en todo el recorrido |
| Export CSV del panorama | **Inmediato** ✅ | Toast verde "Descarga iniciada: panorama-mapa.csv" |

---

## Hallazgos

### 🟥 BLOQUEA

**B1 · Programa y Población no cargan (timeout persistente).**
- Pantalla: `/admin/programa` ("Salud del programa") y `/admin/poblacion`. Ambas están en el nav ANALÍTICA del admin.
- Esperaba: los KPIs con qué miden y sobre qué denominador (el objetivo de esta ronda).
- Vi: Programa → "**Los datos están tardando más de lo normal** — La consulta superó el tiempo de espera. Probá de nuevo en unos segundos." con Reintentar fallando **3 veces seguidas**. Población → skeletons + "**La carga está tardando más de lo normal.**" con Reintentar fallando (2 intentos). Nunca vi un número.
- Pasos: login admin → nav Programa → esperar → Reintentar ×2. Ídem Población.
- Peor aún: al volver a `/admin/poblacion` ~15 minutos después, la página escaló a un **504 crudo de Vercel** — "This Serverless Function has timed out … 504: GATEWAY_TIMEOUT · Code: FUNCTION_INVOCATION_TIMEOUT" (en inglés, sin nada de la app; ID `gru1::wt77l-1784331280066-066ca123aae1` para buscar en los logs). Ese 504 además se comió una redirección de login que pasó por ahí. Es la peor pantalla posible para proyectar.
- Nota: el error in-app está bien escrito y en castellano — el problema es el backend (misma familia que A1). No pude evaluar la claridad de las métricas porque nunca aparecieron.

**B2 · La primera pantalla del demo abre con un banner rojo de procesos caídos.**
- Pantalla: `/admin` (Panel) y `/admin/sistema`.
- Esperaba: banner de procesos con un estado creíble y tranquilo.
- Vi: "**Procesos automáticos caídos · avisá a soporte** — 2 procesos automáticos no están corriendo…". En Sistema: **cron_daily → FALLO** y **cron_health → FALLO** (17 jul, 04:51 a. m., 22 items cada uno); los otros ~20 procesos corrieron OK a la misma hora. El banner es honesto y está bien redactado — el problema es que el estado es REAL y se proyecta en la primera pantalla.
- Pasos: login admin → /admin (el banner está arriba de todo) → Ver detalle → tarjeta Crons.
- Extra en la misma pantalla de Sistema: "**Deriva de caché · pets.status: 463 DIVERGENTES**" (escaneo parcial de 2.000; ej.: "cache active → log lost"). Si alguien abre Sistema en vivo, eso también se ve en rojo. La reparación es manual y auditada según la propia pantalla.
- Para mañana: correr/arreglar cron_daily y cron_health (y decidir si la deriva de caché se repara o no se muestra Sistema).

### 🟧 ALTO

**A1 · Panorama: los indicadores y capas se caen intermitentemente al cambiar de alcance.**
- Pantalla: `/admin/panorama` (el momento clave del demo).
- Esperaba: drill fluido nacional → provincia → departamentos.
- Vi (secuencia real): drill a Santa Fe → panel "**No pudimos cargar los indicadores en este momento.**" + Registros 0 + capas a medias; botón Actualizar recuperó el mapa (147 registros) pero no los indicadores; recarga completa → "**No pudimos calcular esta capa a tiempo. Tocá Actualizar para reintentar.**" y mapa vacío; segundo Actualizar → mapa OK. En Córdoba, los indicadores fallaron y ~10 s después cargaron solos. En la red: `/api/panorama/kpis?province=AR-S` quedó "pending" >30 s (terminó 200); los endpoints de capas también cuelgan a veces. Mientras los KPIs están en vuelo, el minimapa de CABA queda en blanco y "Último evento en el alcance" muestra el valor del alcance anterior (después se corrige solo).
- Pasos: panorama nacional → click en una provincia → mirar panel izquierdo. Reproducido 3 veces de ~8 cambios de alcance.
- Riesgo demo: en vivo, el drill puede mostrar un cartel de error delante del funcionario. Mitigación de mañana: precalentar el panorama 5 minutos antes (nacional + las provincias que se van a mostrar) y, si aparece el cartel, tocar **Actualizar** (recupera). De fondo: mirar tiempos de `/api/panorama/kpis` (¿índice faltante / cold start?) — es la misma familia que B1 y que el cuelgue de /admin que ya arreglaron.

**A2 · Leyenda con etiqueta cruzada: el gradiente de cobertura figura como "Zoonosis / señales".**
- Pantalla: `/admin/panorama`, alcance provincial (visto en Santa Fe y Córdoba), capas Zoonosis + Decomisos + **Cobertura antirrábica** (cobertura como base coroplética).
- Esperaba: la leyenda del gradiente azul titulada "Cobertura antirrábica (perros, 12m) (conteo)".
- Vi: la leyenda dice "**Zoonosis / señales · 16 ▓▓ 676**" (Santa Fe; en Córdoba "6 ▓▓ 693") sobre el gradiente azul que en realidad es la cobertura por departamento — el popup del mismo departamento dice "Cobertura antirrábica (perros, 12m) (conteo) · 116". Al lado, la escala de puntos "1 – 5" sí es zoonosis. Dos números contradictorios bajo un mismo rótulo: un funcionario lee "zoonosis 676" donde hay perros vacunados.
- Pasos: drill a una provincia → Capas → activar "Cobertura antirrábica (perros, 12m)" con zoonosis activa → mirar la barra de leyenda inferior.

**A3 · "Ver mascota →" desde un caso rebota al Panel (regresión A4 de ronda 5, sigue viva).**
- Pantalla: `/admin/casos/CAS-C3TK-DQCB` (Toby, Mascota perdida).
- Esperaba: la ficha de la mascota (o al menos un aviso de por qué no).
- Vi: el botón azul apunta a `/mis-mascotas/PANO-045778` (vista de dueño) y al clickearlo te devuelve **en silencio** a `/admin` (Panel). En demo parece un botón roto.
- Pasos: /admin/casos → abrir un caso "Mascota perdida" → "Ver mascota →".

### 🟨 MEDIO

**M1 · Casos "Mascota perdida" con motivo en inglés y jerga de semilla.**
- `/admin/casos/CAS-C3TK-DQCB`: "MOTIVO DE APERTURA — **Pet PANO-045778 marked as lost — seed-panorama**" y "PARTES — Abrió: **PANO-Seed-Owner**". Las denuncias de bienestar sí tienen motivo en castellano (CAS-FRFY-29YW ✅). Si el demo abre un caso, que sea una denuncia, no una mascota perdida. (M2/M6 de ronda 5, siguen en staging.)

**M2 · Los procesos automáticos se muestran con codenames en inglés.**
- En el banner rojo de `/admin`, "Detalle técnico" lista "**cron_daily**" crudo junto a "Chequeo de salud de procesos" (traducido — la traducción existe pero cubre un solo proceso). En `/admin/sistema`, la tarjeta Crons lista los ~23 procesos como `auto_expire_approvals`, `reconcile_pet_status`, etc. Al expandir sí hay explicación en castellano ("Qué hace este proceso: …" ✅). El checklist pedía nombres en castellano: hoy no están (salvo uno).

**M3 · Deriva de caché visible: 463 mascotas con estado divergente.**
- `/admin/sistema`: "Deriva de caché · pets.status — **463 DIVERGENTES**" sobre 2.000 escaneadas (parcial), con muestra "status: cache active → log lost". Además de verse en rojo en Sistema, es el tipo de dato que puede hacer que una ficha diga una cosa y una lista otra en cualquier pantalla del demo. Revisar si se repara antes de mañana.

**M4 · La lista de Casos dice "50 casos" pero el panel dice 534 abiertos.**
- `/admin/casos` muestra "50 casos" (tope de la lista) sin aclarar "mostrando 50 de 534". El Panel y el mapa del sitio dicen 534. Dos números distintos para lo mismo a un click de distancia.

**M5 · Popup fijo y tooltip de hover se superponen duplicados en el mapa.**
- Panorama, nivel departamentos: al clickear una burbuja quedan el popup fijo y el tooltip de hover encimados mostrando la misma info (uno tapa al otro) hasta que movés el mouse. Cosmético pero muy visible proyectado.

### 🟦 BAJO

- **"APROBACIONES · 1 PENDIENTES"** (`/admin`): concordancia — "1 pendiente".
- **"VENCIMIENTOS DE SLA (OUTBOX)"** (`/admin`): "outbox" en inglés; el nav lo llama "Bandeja de salida".
- **Severidades en inglés en el detalle de capa** (panorama → popup → Ver detalle): "Denuncia (**medium/low/high/critical**)" en Eventos recientes. Al lado, TIPO/GRAVEDAD/INGRESO muestran "—" pelados en la vista agregada.
- **Tarjetas KPI truncadas** (panorama): "Cobertura antirrábica …", "Señales de zoonosis (…", "activas hoy: 83 (rabia + mordedura…" — los nombres no entran en la tarjeta.
- **Decomisos fuera del límite** (panorama, alcance Córdoba): se ven 2 puntos teal del lado santafesino del límite con "Registros 0" en la pestaña — coherencia alcance/puntos/contador a revisar.
- **KPI vs Registros por 3**: en la vista nacional de bienestar, la tarjeta dice "1.962 denuncias en el período" y la pestaña Registros dice "1.959". Probablemente sea la supresión k<5, pero son dos números distintos a 5 cm de distancia y nada lo aclara.
- **Consola:** React error #418 (hydration mismatch) al cargar el panorama. No lo vi romper nada, pero ensucia el diagnóstico.

### Lo que anda muy bien (no tocarlo)

- **/admin volvió a la vida**: 2,9 s en frío, sub-segundo recargado, título "Panel" en nav y breadcrumb (el "Dashboard" de esta tarde ya no está), colas con "Más antigua pendiente: 9d", mapa del sitio con verbos rioplatenses impecables ("Aprobás o rechazás…", "Vigilás usuarios…").
- **El buscador ahora explica** (el B1 de ronda 5 quedó bien resuelto): con DIM-PAMP-0001 → "**Sin coincidencias — El buscador de operadores no accede al padrón de mascotas. Una mascota aparece acá solo si tiene un caso (CAS-…) o una denuncia (DEN-…) asociada: buscá por ese código.**" + "Las búsquedas quedan registradas". Exactamente lo que pedía la ronda anterior.
- **Abrir un caso te deja en el portal** (B2 de ronda 5 arreglado): `/admin/casos/CAS-FRFY-29YW`, sidebar y breadcrumb de Administración intactos. La denuncia muestra Ley 14.346 + MPF CABA con la aclaración "referencia operativa, no marco legal".
- **El drill del panorama cuenta una sola historia**: badge "Provincias · Zoonosis: departamentos" → "Departamentos/partidos"; caption "Vista personalizada — Córdoba, últimos 90 días. Capas: …"; panel "Indicadores: total del alcance (Córdoba). El mapa muestra el detalle por departamentos/partidos."; popup "**Cobertura antirrábica (perros, 12m) (conteo) · 116**" mientras el panel mantiene "**75,7% · ESTADO ACTUAL · +19 pts**" (nacional 64,8%). El lío %-vs-conteo de rondas anteriores quedó ordenado.
- **Zoonosis nacional es por departamento de verdad**: puntos chicos distribuidos + clusters medianos en centros urbanos (NOA, Corrientes, Neuquén), nada de un globo por provincia. Con "215 celdas con menos de 5 casos ocultas por privacidad (k-anonimato)" y "Datos insuficientes (privacidad)" en gris — la privacidad explicada en pantalla.
- **Export prolijo**: panel con eco de la vista, "Copiar vista", "Vistas guardadas", y CSV con toast de confirmación "Descarga iniciada: panorama-mapa.csv".
- **Los estados de error están bien escritos** ("No pudimos calcular esta capa a tiempo. Tocá Actualizar para reintentar.") — el I2 de la ronda de hoy a la tarde ya está implementado; falta que el backend no los haga aparecer.
- **Estado de sesión de alerta claro**: alerta CABA esterilización "RECONOCIDA" con chip de color + texto y acciones de flujo completas (no toqué ninguna).

## Refugio (alejo) — solo mirar ✅

Recorrido completo sin errores y sin tocar nada. Es la parte más redonda del sistema hoy.

- **Selector de organización**: alejo pertenece a 4 organizaciones; elegí **Refugio Patitas del Norte** (Palermo). Pantalla clara.
- **Panel del refugio**: "Ocupación 4 · en custodia · sin capacidad declarada", "Disponibles 2 · para adopción" (verde), "Adopciones en curso 1" (amarillo con "Atención"), "Requieren acción — Todo en orden". "Primeros pasos 3/5" con pendientes accionables (Cargar servicios / Declarar capacidad). Todo en castellano, todo se entiende.
- **Lista de custodia** (`/org/...(refugio)/mascotas`): 4 animales (Bichita, Coco, Lola, Toby). **El estado se ve con color + texto** ✅: chip dorado "EN CUSTODIA" en los cuatro, chip verde "PUBLICADO" en los publicados, y las acciones reflejan el estado ("Apta ✓ · Publicada ✓" vs "Elegibilidad · Publicar"). No clickeé ninguna acción.
- **Ficha de Toby** (`DIM-S008-PLRM`): banner de contexto excelente — "**Estás viendo Toby como miembro de Refugio Patitas del Norte. Cualquier evento que registres queda atribuido a la organización.**" — con vuelta "← Animales en custodia". Credencial con chip "✓ INSCRIPTO", "Estado de cumplimiento — 2 DE 3 AL DÍA", antirrábica "**DECLARADA**" con la cadena de verificación explicada ("Antirrábica cargada por vos" + "Para figurar 'al día' en el registro oficial, un veterinario matriculado tiene que firmarla" + Ord. CABA 41.831 · Ley 22.953 + "Pedir verificación →"), esterilización "**REGISTRADA**" verde. Estados con color + texto en toda la ficha ✅.
- **Mascota perdida: no hay** en el alcance de alejo (los 4 de custodia están EN CUSTODIA y "Mis mascotas" personal de alejo tiene 0 activas), así que ese punto no se pudo evaluar acá. La credencial pública de una perdida (Laika) quedó validada esta tarde en la ronda de staging: banda roja clara y caminos de aviso.
- Nits BAJO: chip "PUBLICADO" vs botón "Publicada ✓" (concordancia de género en la misma tarjeta); en la bandeja personal de alejo aparece "Caso CAS-JPCT-KVJE · QA Chip Test Puerto Madero" (nombre de QA visible, aunque fuera del camino del demo).

## Qué no pude verificar

- **Los denominadores de Programa y Población** — las páginas nunca cargaron (B1).
- **El popup de zoonosis a nivel nacional** — a ese nivel el click drillea a la provincia (por diseño); el popup multi-capa sí lo verifiqué a nivel departamento (Castellanos: "Denuncias de bienestar 21 · Zoonosis / señales 5 · últimos 90 días").
- **El contenido del CSV exportado** — quedó en la carpeta Descargas de la máquina (panorama-mapa.csv); solo validé la confirmación en pantalla.

## Anexo — entorno y notas de método

- Sesión de admin ya iniciada por el equipo; la cerré al terminar mi parte. Al final cerré también la de alejo y **dejé `/login` precargado con `admin@dim.test`** — mañana solo falta la contraseña. El primer intento de login de alejo se perdió en el 504 de Población (B1); el segundo entró normal.
- El CSV exportado quedó como `panorama-mapa.csv` en la carpeta Descargas de esta máquina.
- El tooling de automatización tuvo dos artefactos que NO son del producto: (a) la pestaña se congela si Chrome pasa a segundo plano (ya conocido), (b) la navegación por URL del tooling a veces no mueve la SPA — el click real en el nav siempre funcionó (no confirmo el "links no navegan" de la ronda Cursor: con click real no lo reproduje).
- Mutaciones: **ninguna**. Acciones con efecto: solo el download del CSV y los cambios de vista/capas del panorama (estado de URL, no de datos).
