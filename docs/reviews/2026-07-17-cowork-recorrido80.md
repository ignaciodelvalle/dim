# Recorrido demo 80 — Informe Cowork

**Entorno:** `http://localhost:3000` · base reconstruida (66.729 mascotas · 3.017 denuncias · 836 casos · 12 orgs).
**Método:** click real, verificación antes de reportar, números exactos donde el acto lo pide. No tipeé contraseñas (el usuario logueó cada cuenta). Cuentas usadas: sin sesión (actos 1 y 7), `lucas` (2–3), `admin` (4), `alejo` (5), `carla` + `lilian` (6).
**Límites de test (no del producto):** (a) el viewport 390px no se puede forzar (Chrome clampea a ~1283px) → evalué contenido, que es mobile-first; (b) Chrome **congela la pestaña cuando pierde el foco** (renderer frozen) → hubo que trabajar con la ventana adelante.

---

## 1) TL;DR

- **¿Un funcionario puede trabajar con esto? Sí.** Los cuatro portales (público, gobierno, refugio, admin) están coherentes, en castellano y con base legal a la vista; el ciclo del refugio (ingreso → apto → publicar → adopción → transferencia) funciona **de punta a punta** y las regresiones vigiladas (marcar apta, publicar, caso que se sale del portal) **no reaparecen**.
- **¿Le mostrarías esta pantalla a un ministro? Casi — con una salvedad.** El panorama de gobierno es presentable, pero **en `/gob/panorama` el mismo rótulo "Cobertura antirrábica" muestra un conteo en el mapa (72) y un porcentaje en el panel (64,3%)**: no son cruzables y el doc lo marca como CRÍTICO. Arreglá eso antes de proyectarlo.
- **Lo más flojo de confianza:** cuando un veterinario firma una vacuna en la libreta oficial de una mascota, **la dueña no recibe ninguna notificación** (el registro aparece en su libreta en silencio). No bloquea, pero es una brecha de transparencia sobre un dato sanitario.

---

## 2) Tabla de números anotados (Cowork — para comparar contra Cursor)

| Acto | Pantalla | Número / valor exacto que vi |
|---|---|---|
| **1** | Estado credencial `/p/DIM-PAMP-0001` (Pampa) | **Activa** · TIER 2 · MÉDICO |
| **1** | Bloque vacunación (misma credencial) | **"VACUNACIÓN 1 · 2 faltantes"** · "Con registros" · "Verificado por veterinario matriculado" |
| **2a** | Vista inicial `/gob/panorama` (sin tocar nada) | Abrió en **"Síntomas / vigilancia sindrómica"** y **saltó solo a "Brotes activos"** (~4 s); pintó en ~6 s; el mapa **sí muestra datos** (8 provincias + círculos de zoonosis) |
| **2a** | Cobertura antirrábica, 8 provincias (estado actual, perros 12m) | **65,8 %** · señales de zoonosis **1.088** (34 activas hoy) · mordeduras **0,2**/10k |
| **2d** | Popup fijo de departamento (Olavarría) | **72** — rótulo "Cobertura antirrábica (perros, 12m)", **SIN %** (leyenda: "conteo por unidad, no porcentaje") |
| **2d** | Panel lateral (Buenos Aires) | **64,3 %** — rótulo "Cobertura antirrábica · ESTADO ACTUAL", **CON %** |
| **2d** | ¿Coinciden popup y panel? | **NO** — mismo rótulo, distinta unidad (conteo vs %). No cruzables. **(el doc lo marca CRÍTICO)** |
| **4d** | Buscador global admin, pegando `DIM-PAMP-0001` | **"Sin coincidencias — El buscador de operadores no accede al padrón de mascotas. Una mascota aparece acá solo si tiene un caso (CAS-…) o una denuncia (DEN-…) asociada: buscá por ese código."** + pie **"Las búsquedas quedan registradas."** → **sí explica el porqué** (mejora respecto de la ronda anterior, que devolvía "Sin coincidencias" pelado) |

---

## 3) Hallazgos

### BLOQUEA
- *(ninguno)* — no encontré nada que impida completar los flujos del recorrido.

### ALTO

**A1 · `/gob/panorama` — "Cobertura antirrábica" significa dos cosas distintas (conteo vs %)**
- **Pantalla:** `/gob/panorama`, drill a departamentos de Buenos Aires (acto 2d).
- **Qué esperaba:** que el número del popup fijo y el del panel lateral hablen la misma unidad, para poder cruzarlos.
- **Qué vi:** el popup fijo de Olavarría muestra **"72"** (conteo por unidad, sin %), y el panel lateral de Buenos Aires muestra **"64,3 %"**, ambos rotulados "Cobertura antirrábica". La leyenda del mapa lo confirma ("conteo por unidad, no porcentaje"), pero el ministro no puede cruzar 72 con 64,3 %.
- **Pasos:** `/gob/panorama` → activar drill a departamentos → clic en un partido (popup fijo) → mirar el panel lateral. El doc dice: "Si difieren, es CRÍTICO".
- **Sugerencia:** o el mapa pasa a % (coroplético por porcentaje), o el popup y el panel dicen explícitamente "conteo" vs "cobertura %", con rótulos diferentes.

**A2 · La dueña no se entera cuando un vet escribe en la libreta oficial de su mascota**
- **Pantalla:** notificaciones de `carla` + ficha `/mis-mascotas/DIM-GV4A-EMFJ` (acto 6c).
- **Qué esperaba:** que al firmar un veterinario matriculado una vacuna en la libreta oficial, la dueña reciba un aviso (como recibe el de perdida/encontrada).
- **Qué vi:** tras cargar `lilian` la antirrábica, las notificaciones de `carla` (3 en total) **no incluyen nada de la vacuna**; el registro aparece en su libreta **en silencio** (ahora dice "Vacuna antirrábica · VIGENTE · Próxima 17/7" y el cumplimiento subió 0 → 1 de 4). El sistema de notificaciones funciona (avisó perdida/encontrada al instante) — simplemente no dispara para eventos clínicos de terceros.
- **Pasos:** `lilian` firma vacuna en `/org/.../atender/DIM-GV4A-EMFJ` → entrar como `carla` → `/notificaciones`.
- **Sugerencia:** notificar al titular cada vez que un tercero firma un evento en su libreta ("Dra. Lilian Marrone registró una antirrábica en QA7-Estrella").

### MEDIO

**M1 · La credencial pública no muestra cuál vacuna ni su vigencia (solo "Con registros")**
- **Pantalla:** `/p/DIM-GV4A-EMFJ` tras cargar la antirrábica (acto 6d).
- **Qué esperaba:** que para una **antirrábica** (interés de salud pública) la credencial pública muestre al menos vigente/vencida.
- **Qué vi:** solo **"VACUNACIÓN: Con registros"** + "Verificado por veterinario matriculado". No dice cuál vacuna ni la vigencia; sigue en TIER 0 · IDENTIDAD. (El detalle sí está en la libreta privada de la dueña.)
- **Sugerencia:** semáforo público de antirrábica (vigente/vencida) sin exponer todo el historial.

**M2 · `/gob/panorama` — la vista de riesgo bivariado no diferencia visualmente**
- **Pantalla:** `/gob/panorama?preset=brotes-activos` → "Riesgo (bivariado)" (acto 2c).
- **Qué esperaba:** que el preset abra directo en riesgo bivariado y que la peor zona salte a la vista.
- **Qué vi:** abrió en modo "Capas" (no en bivariado); al activar bivariado, el coroplético provincial se ve **casi todo gris** (no aparece el rincón rosa de "cobertura baja · señales altas") → no pude señalar la peor zona por color, solo por el tamaño de los círculos de zoonosis. La leyenda que sí explica bien está **escondida tras un clic** (la colapsada es un mini-grid 3×3 no autoexplicativo).
- **Sugerencia:** abrir el preset en bivariado, dejar la leyenda explicada por defecto, y revisar la escala de color (con casi todo gris no comunica).

**M3 · La denuncia de maltrato no narra el hecho (placeholder de semilla)**
- **Pantalla:** `/gob/maltrato` → DEN-A5GS-PU4Y (acto 3b).
- **Qué vi:** el campo "¿Qué pasó?" muestra **"PANO-welfare-00239 — denuncia sintética de demostración"** en vez de describir el hecho. (Sí figuran tipo, lugar con coordenadas "USO OFICIAL (Ley 14.346)" y ley aplicable — eso está muy bien.) Probable dato de semilla, pero el campo que debe narrar no narra.

**M4 · La foto de la mascota sale como placeholder (inicial) en la credencial y en `/perdidas`**
- **Pantalla:** `/p/DIM-PAMP-0001` y tarjetas de `/perdidas` (acto 1).
- **Qué vi:** foto en blanco con inicial en la credencial hero de la demo y en las tarjetas de perdidas. Probable límite de semilla, pero en la pantalla estrella se nota.

**M5 · Inglés en el subtítulo del portal de Programa (gobierno)**
- **Pantalla:** `/gob/programa` (acto 3c).
- **Qué vi:** "KPIs **North-Star**, **outliers**, calidad de datos y **oversight** de PII…" — 3 palabras en inglés en una pantalla que se le muestra a un funcionario. (Regla del doc: inglés en pantalla = hallazgo.)

### BAJO
- **B1 ·** "TIER 2 · MÉDICO" / "TIER 0 · IDENTIDAD" en la credencial pública: un vecino no sabe qué es un "Tier" (acto 1 / 6d).
- **B2 ·** "HACE 0 MESES" en tarjetas recientes de `/perdidas` (mejor "hace X días") (acto 1).
- **B3 ·** Inglés suelto en gobierno: botón de mapa "**Enter fullscreen**", y rutas `/gob/analytics` y `/gob/outreach` (los labels están en español) (acto 2/3).
- **B4 ·** Inglés en tipo de denuncia: "Acumulación (**hoarding**)" (acto 3b).
- **B5 ·** La URL de la denuncia expone un UUID crudo (`?caso=f8ef0881-…`) (acto 3b).
- **B6 ·** En `/gob/programa`, clicar el ⓘ de un KPI **navega** a `/gob/poblacion` en vez de abrir un tooltip (acto 3c).
- **B7 ·** El menú Exportar de `/gob/panorama` no da toast de "descarga iniciada": el CSV se baja en silencio (acto 2f).
- **B8 ·** Tarjeta de `/adoptar` de una mascota recién publicada sin localidad ni foto (mi intake no cargó jurisdicción) → la galería pierde fuerza ("¿da ganas?") (acto 5d).
- **B9 ·** El autocomplete de **localidad** al inscribir mascota valida tarde: si tipeás "Palermo" sin elegir la sugerencia, el paso 1 avanza igual y recién el paso 2 tira "Elegí la localidad de la lista" (acto 6a).
- **B10 ·** El campo **Vacuna** (registrar evento clínico) es un combobox "Empezá a tipear o elegí…" que no me desplegó la lista de sugerencias; aceptó texto libre "Antirrábica". Conviene confirmar que la lista canónica se despliega para un humano (si queda texto libre, ensucia reportes) (acto 6c).
- **B11 ·** Menor de dato: el alcance de `lucas` dice **1774 localidades** y el guion dice **1.775** (acto 2b).

### IDEA
- **I1 ·** El banner rojo "**Procesos automáticos caídos · avisá a soporte**" (5 procesos) es muy alarmante para una demo en vivo frente a un ministro, aunque arriba aclare "datos de demostración". Darle contexto o silenciarlo en modo demo (acto 4a).
- **I2 ·** La landing de `/gob/panorama` no es estable: abre en "Síntomas / vigilancia sindrómica" y a los ~4 s salta solo a "Brotes activos" (autocompleta la URL). Definir si recuerda el último preset o si debe quedarse en la vista pedida (acto 2a).
- **I3 ·** Vigencia de la antirrábica como semáforo público (vigente/vencida) — cerraría M1 sin exponer el historial (acto 6d).

### Lo que anda bien (vale registrarlo)
- **Authz sólido (acto 3d):** intentar espiar Mendoza por URL (`province=AR-M` fuera de la cobertura de `lucas`) devuelve **"No tenés acceso a esta jurisdicción"**, resetea al alcance propio y descarta el parámetro. Sin fuga de datos, con mensaje claro (no un 500).
- **Regresiones vigiladas, todas OK:** el caso abierto desde `/admin/casos` **queda dentro del portal operador** (no aparecen "Adoptar / Refugios / Volver a mi app") (4b); marcar **apta** (5b) y **publicar** (5c) funcionan sin el error de custodia; el buscador admin ahora **explica** por qué no encuentra un DIM- (4d).
- **Ciclo del refugio completo (acto 5):** ingreso → apta → publicar → aparece en `/adoptar` → finalizar adopción → la credencial pública refleja la transferencia (sin exponer al nuevo dueño, que es lo correcto).
- **Perdida/encontrada reversible (acto 6b):** la credencial pública pasa a "SE BUSCA / ESTÁ PERDIDA" y vuelve a la normalidad al marcarla encontrada (verificado sin sesión).
- **Transparencia (acto 7):** excelente — datos abiertos por provincia, CSV/JSON autodocumentados, licencia **CC BY 4.0**, supresión por **k-anonimato (k=5)**, y hasta un disclaimer honesto sobre reidentificación al comparar fotografías diarias. Accesible **sin sesión** (verificado).
- **Arreglos confirmados de rondas previas:** "Castrada" (antes "Castrado/a"); decimales con coma (39,6 %); "PREÑECES ACTIVAS · preñez registrada y aún no cerrada"; el denominador aparece en Población ("14.545 de 36.715"); "Administración MiMAR".

---

## 4) Consistencia (donde dos partes contaron historias distintas)

- **Popup vs panel — CRÍTICO (2d):** en `/gob/panorama`, "Cobertura antirrábica" es **conteo** en el mapa/popup (**72**, sin %) y **porcentaje** en el panel lateral (**64,3 %**). Mismo rótulo, unidades distintas, no cruzables. → ver **A1**.
- **Pie vs métrica (2e):** el pie de la vista declara "Buenos Aires · últimos 1095 días (3 años)" pero la métrica de cobertura es "perros, **12 m** / ESTADO ACTUAL". El período del pie no coincide con el de la cobertura (las señales de zoonosis sí son a 3 años).
- **Público vs privado (6c/6d):** la libreta **privada** de la dueña muestra "Vacuna antirrábica · VIGENTE · Próxima 17/7" (cumplimiento 1 de 4), la credencial **pública** solo "Con registros". Es tiering deliberado (el dato existe y es correcto), pero conviene tenerlo explícito.
- **Contador vs aviso (6c):** el contador de cumplimiento de la mascota sube 0 → 1 de 4 al cargar la vacuna, pero **la dueña no recibe ninguna notificación** de ese cambio. → ver **A2**.
- **Lista vs detalle en `/perdidas` (1):** la misma mascota (Mora) dice **"HACE 3 SEMANAS"** en la tarjeta de lista y **"hace 27 días"** en el detalle.
- **Badge de estado en `/perdidas` (1):** conviven "PERDIDO/A" (con barra) y "PERDIDO"/"PERDIDA" (con género) entre tarjetas.
- **Dato de alcance (2b):** UI "1774 localidades" vs guion "1.775".

---

## 5) Callejones sin salida (qué no pude terminar y dónde me quedé)

- **3a · Investigaciones de brote:** `/gob/vigilancia/investigaciones` muestra **0 investigaciones** ("No hay investigaciones… en los últimos 90 días") → no había "motivo de la primera" para leer. Empty state bueno; parece límite de semilla en la cobertura Este.
- **4c · Alertas admin:** `/admin/alertas` tiene **0 alertas abiertas** (con "Todas", 1 sola y ya RESUELTA) → no pude reconocer/resolver una ni ver si la fila cambia sola o hay que recargar. Las alertas se disparan por umbral, no se crean a mano. Consistente con el dashboard (Alertas: 0).
- **4e · Observaciones antirrábicas:** las **22 observaciones están todas "CERRADA NEGATIVA"** y las tarjetas no son clickeables → no pude "cerrar una profesionalmente" ni ver el "¿te confirma?". No hay ninguna activa (dashboard: Observaciones: 0). Límite de semilla (se abren por período de 10 días).
- **2c · Peor zona por color:** en el mapa bivariado no pude señalar la peor jurisdicción por color (casi todo gris); solo por tamaño de círculos de zoonosis. → ver **M2**.
- **Nota de entorno (no del producto):** el viewport 390px no se pudo forzar (Chrome clampea), y la pestaña se congela cuando Chrome pasa a segundo plano; ambos son límites del harness de test, no del sistema.

---

## 6) Anexo — qué muté (con tokens)

**Creado por mí (prefijo QA7-):**
- **QA7-Nube = `DIM-RT4M-PR8E`** — ingreso en Refugio Patitas del Norte (`DIM-4H5R-4P4S`): perra mestiza, ~2 años, 8 kg, rescate, custodia temporal (5a) → marcada **apta** (5b) → **publicada** en adopción con historia/atributos (5c) → **adopción finalizada** (5e). Estado final: adoptada, fuera del listado de custodia.
- **QA7-Estrella = `DIM-GV4A-EMFJ`** — mascota registrada por `carla` (perra, CABA/Palermo) (6a) → **reportada perdida** y luego **marcada encontrada** (6b) → **antirrábica** cargada por `lilian` (6c). Estado final: encontrada, con antirrábica vigente.
- **QA7 Adoptante de Prueba** — persona ficticia creada al finalizar la adopción de QA7-Nube (DNI sintético `40000007`); el sistema le crea un "perfil preliminar reclamable" (5e).

**Eventos escritos:**
- Vacuna **antirrábica** en QA7-Estrella: aplicada 17/07/2026, próxima dosis 17/07/2027, "Nobivac Rabia", firmada como matrícula **V-99001-CABA** (verificada) (6c).
- **Búsqueda registrada:** pegué `DIM-PAMP-0001` en el buscador global admin — queda logueada por diseño ("Las búsquedas quedan registradas") (4d).

**Descargas / exportaciones:**
- Export CSV de `/gob/panorama` (Buenos Aires, brotes activos, 3 años) — disparado en 2f (no pude confirmar el archivo; va a Descargas de la máquina).
- CSV `cobertura-antirrabica` de `/transparencia` — traído por `fetch` para inspeccionar contenido (no volqué archivo en la máquina) (7).

**Pre-existentes (NO creados en esta corrida, encontrados en el entorno):**
- **QA7-Mora = `DIM-66WR-99SA`** (ingreso 17-jul con caso `CAS-Y5ND-3QB3` "Publicación en adopción").
- **QA7-Luna** (perra REGISTRADA en la cuenta de `carla`).

---

*Recorrido corrido por Cowork sobre `http://localhost:3000`, 17-jul-2026. Los datos son sintéticos (el propio entorno lo declara). Aviso del guion confirmado: `/adoptar` arrancó con 3 mascotas (límite de semilla); tras publicar QA7-Nube quedaron 4.*
