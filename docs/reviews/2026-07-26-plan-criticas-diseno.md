# Plan — Críticas de diseño en paralelo (tanda 1)

> **Encargo del PO (2026-07-26)**: correr `/design:design-critique` sobre aspectos
> específicos y acotados que valgan la pena, divididos, varios en paralelo, sobre
> funcionalidades y sistemas clave. Decisiones de la entrevista: **pixels los resuelve
> COWORK solo** (app viva en su entorno cloud), scopes = los 4 (ciudadano, dueño,
> panorama-delta, gob operativa), **viewports mixtos por audiencia**, lente =
> **persona + framework del skill**.
>
> Ejecuta: COWORK (sesión cloud). Los hallazgos vuelven como docs en
> `docs/reviews/results/`; el código lo toca Claude Code después, nunca esta sesión.

## 1. Qué NO repite este plan (mapa de lo ya revisado)

| Campaña | Fecha | Qué cubrió | Por qué no alcanza hoy |
|---|---|---|---|
| val-1..8 + deep A/B/C (con screenshots) | 07-06/07 | Todos los portales, mobile, first-impression, adversarial | **794 commits antes** del estado actual: libreta 14→11, wizard alta, perdidas público, disclosure fail-closed, polaridad, desierto %, etc. |
| ronda5 funcionario curioso + UIUX admin | 07-16 | /gob y /admin narrativo | 10 días y el delta panorama entero |
| audits 1-4 (consistencia, estados, feedback, ciclos) | 07-21 | Transversales mecánicos | Siguen vigentes como base; no eran visuales |
| adversarial gob/admin + visual review | 07-23 | Rojo-team de contenido | Otro lente |
| portal-* (operativa, panorama A/B, programa, vigilancia, administración) + 11 vistas | 07-25 | **Producto/narrativa** ruta por ruta, 93 rutas | Fue pase de CONTENIDO con sesión admin; no de jerarquía/affordances/consistencia visual, y el 26-07 cambió la semántica de panorama después |

**El hueco**: lente de diseño (jerarquía, affordances, consistencia, a11y) sobre el
estado POST-churn, con las personas correctas (no todo como admin), y mobile donde el
usuario real está en un teléfono. Eso es esta tanda.

## 2. Método

Cada crítica = **un agente en paralelo** que recibe:

1. **El framework del skill** `/design:design-critique` (primera impresión 2s →
   usabilidad → jerarquía visual → consistencia → a11y → qué funciona → 3 prioridades),
2. **encarnado en la persona del scope** (la pregunta no es "¿está bien el layout?"
   sino "¿el finder con el perro en la mano encuentra el botón?"),
3. **un bundle de screenshots frescos** (capturados en Wave 0 con estados forzados),
4. **punteros de código** (componentes/copy del scope, para que la recomendación
   aterrice en archivo y no en humo),
5. **su archivo de salida**: `docs/reviews/results/2026-07-27-critique-<slug>.md`,
   formato del skill (tabla de severidad 🔴🟡🟢 + 3 prioridades), es-AR.

Al final, **un consolidado** cruza las 8: hallazgos repetidos entre scopes = sistémicos
(van primero), prioridades unificadas, y handoff en formato backlog para Claude Code.

**Regla de honestidad ambiental**: todo lo que sea artefacto de MI entorno (catálogo
INDEC parcial, datos sintéticos finos, shim de auth) se marca `[ENTORNO]` en el brief y
NO puede convertirse en hallazgo. La lista exacta va en cada bundle.

## 3. Wave 0 — infraestructura (COWORK, secuencial, ~30-45 min)

| Paso | Qué | Riesgo declarado |
|---|---|---|
| 0.1 | Extender el shim GoTrue: `POST /auth/v1/token` (grant password — acepta Test1234! de los 6 usuarios seed), `GET /auth/v1/user` (Bearer → usuario), `POST /auth/v1/logout`. El middleware valida con `getUser()` server-side [verificado: `lib/supabase/middleware.ts:46`], así que esto alcanza para sesión SSR por cookies. | 🟡 Si algo verifica firma JWT localmente, fallback: JWTs HS256 reales. Si aún así no: las superficies autenticadas se critican con el fallback de §6. |
| 0.2 | `pnpm build` + `next start :3000` (build ya lanzado en background). | ⚪ |
| 0.3 | Seeds de datos: `seed:demo` (mascotas DEMO, eventos CABA, alertas) + `seed-panorama` (66k mascotas/226k eventos — PG nativo se lo banca; presupuesto 20 min, si excede: solo demo y C7 se marca) + `cube:refresh`. | 🟡 Validaciones de jurisdicción contra catálogo parcial → agrego localidades a demanda (ya probado hoy: funciona). |
| 0.4 | Harness Playwright: login por persona (owner / govt-local / admin / anónimo), navegación por scope, **estados forzados** (ver fichas), capturas 1440×900 y 390×844 según audiencia. Bundles en `docs/reviews/results/2026-07-27-critique-screenshots/<slug>/` (convención val-*: los screenshots se commitean). | ⚪ |
| 0.5 | Smoke de bundles: cada crítica arranca solo si su bundle tiene las capturas mínimas listadas en su ficha. | ⚪ |

## 4. Las 8 críticas (paralelas, tras Wave 0)

### Scope A — Ciudadano (mobile 390 + desktop)

**C1 · Landing y primera impresión** — `2026-07-27-critique-landing.md`
- Rutas: `/` (anónimo), `/login`.
- Persona: vecino que escaneó un QR en la calle ayer y hoy googlea "mimar mascotas";
  también el funcionario que recibió el link del demo y entra frío.
- Focos acotados: (1) propósito en 2 segundos — ¿"la mascota es la credencial" se
  entiende sin scrollear?; (2) jerarquía de CTAs: registrar vs "encontré una mascota"
  vs "perdí mi mascota" — ¿compiten?; (3) señales de confianza institucional (marca
  miMAR, tono .gob, legales al pie); (4) el login como puerta: ¿invita o intimida al
  no-técnico?
- Estados: anónimo puro (contexto fresco, sin cookies).

**C2 · Credencial pública `/p/<token>` y sus estados de disclosure** — `2026-07-27-critique-credencial.md`
- Rutas: `/p/<token>` en TRES estados: mascota normal · perdida con disclosure abierto ·
  perdida con defaults fail-closed (migración 0158 — nombre/teléfono/última ubicación
  apagados).
- Persona: la persona que encontró al perro y escaneó la chapita. Un solo objetivo:
  "¿y ahora qué hago?".
- Focos: (1) la acción siguiente — avisar/contactar — ¿es EL elemento dominante o hay
  que buscarla?; (2) el estado fail-closed: ¿la página sigue siendo útil cuando no
  muestra casi nada, o parece rota?; (3) qué PII se ve en cada estado y si el orden de
  jerarquía visual coincide con la sensibilidad; (4) legibilidad al rayo del sol en un
  teléfono (contraste, tamaño de fuente del token).
- Estados a forzar: los tres disclosure states + QR resuelto desde URL absoluta.

**C3 · Flujo finder + catálogo público de perdidas** — `2026-07-27-critique-finder.md`
- Rutas: `/encontre` (wizard: avistamiento, foto + EXIF viewer, contacto,
  finder-in-possession), `/perdidas` (catálogo, filtros, urgencia/KPI, cards).
- Persona: finder con el perro EN LA MANO, en la vereda, apurado y con una sola mano
  libre.
- Focos: (1) pasos del wizard — ¿cuáles sobran para el caso "solo quiero avisar"?;
  (2) affordance de subir foto y qué pasa con el EXIF (¿el viewer explica por qué
  importa la ubicación de la foto?); (3) el fork "lo tengo yo / lo vi nomás" — ¿se
  entiende antes de elegir?; (4) en `/perdidas`: ¿la urgencia ordena la vista o
  decora?, ¿las cards responden "¿es este el perro que vi?" (foto, zona, señas)?
- Estados: wizard vacío → con foto cargada → confirmación; catálogo con datos demo.

### Scope B — Dueño (mobile 390 + desktop)

**C4 · Alta y primeros pasos** — `2026-07-27-critique-alta.md`
- Rutas: wizard alta mínima → modal post-alta → `/mis-mascotas` (vacío y con 1).
- Persona: dueño nuevo no-técnico, registró porque el municipio se lo pidió.
- Focos: (1) fricción del wizard — campos pedidos vs mínimo legal, ¿cada campo dice
  para qué?; (2) el modal post-alta: ¿el siguiente paso que propone es el correcto
  (chapita/QR/libreta) y único?; (3) mis-mascotas en estado vacío → primera mascota:
  ¿celebra o burocratiza?; (4) affordance del carnet/QR: ¿el dueño entiende que ESO es
  el producto?
- Estados: cuenta owner fresca (sin mascotas) → alta completa → con 1 mascota.

**C5 · Detalle de mascota y libreta sanitaria** — `2026-07-27-critique-libreta.md`
- Rutas: `/mis-mascotas/<id>` (tabs bar), tab libreta ("Estado médico actual" +
  grupos consolidados 14→11), historial (chips por tipo + "Todos"), carga de evento.
- Persona: dueño que vuelve a los 3 meses a cargar la antirrábica, y el mismo dueño en
  la veterinaria buscando "¿cuándo fue la última desparasitación?".
- Focos: (1) el dashboard "Estado médico actual": ¿responde al-día/vencido de un
  vistazo (semáforo) o es una lista más?; (2) los 11 grupos: nombres — ¿lenguaje de
  dueño o de vete?; (3) tabs bar: ¿la tab correcta para cada tarea es obvia?;
  (4) cargar un evento: profundidad de taps hasta terminar; (5) chips del historial:
  ¿los conteos ayudan a filtrar o meten ruido?
- Estados: mascota con historial rico (DEMO seed) + mascota recién creada (libreta
  casi vacía).

**C6 · Cuenta, transferencias y turnos** — `2026-07-27-critique-cuenta.md`
- Rutas: `/cuenta` (sheets con URL state), transferencias (hub + iniciar + estado
  pendiente), cancelar turno (sheet).
- Persona: dueño que regala su mascota a un familiar (transferencia) y dueño que no
  llega al turno (cancelación).
- Focos: (1) el patrón sheet: ¿abrir/cerrar/back se comporta como el usuario espera
  (URL state incluido)?; (2) transferencia: ¿el estado "esperando al otro" comunica
  qué falta y de quién?; (3) irreversibilidad: ¿lo serio se ve serio (transferir) y lo
  liviano liviano (cancelar turno)?; (4) consistencia entre sheets (mismo cierre,
  mismos botones, mismo orden).
- Estados: transferencia en cada fase alcanzable con dos cuentas seed.

### Scope C — Gobierno analítico (desktop 1440)

**C7 · Consola Panorama: el delta 25-26/07 con ojos de diseño** — `2026-07-27-critique-panorama.md`
- Rutas: `/gob/panorama` — presets desierto-veterinario, acceso-veterinario,
  mortalidad, brotes; tabla Registros; export/caption; dock completo.
- Persona: funcionario curioso (la de ronda5) — mira 10 minutos, cree lo que ve,
  repite lo que entendió en una reunión.
- Focos acotados AL DELTA: (1) polaridad invertida (`acceso-veterinario`): con el ramp
  al revés, ¿la leyenda dice cuál punta es buena o el funcionario asume "oscuro =
  peor"?; (2) el desierto como %: ¿"X% sin atención veterinaria" se autoexplica o se
  lee como cobertura (al revés)?; (3) caption/scope post-dedup (9861b872): ¿quedó
  legible o quedó escueto?; (4) columna "Brecha vs meta" en la tabla en pantalla:
  ¿signo/dirección se entienden (el −15,6 de quién es culpa)?; (5) ranking "peores 10"
  post-polaridad: ¿el título sigue siendo cierto en las capas invertidas?; (6) frame
  temporal (asOf): ¿el aviso de frame no-live se ve ANTES de citar un número?;
  (7) densidad del dock: primera impresión 2s — ¿por dónde empiezo?
- Estados: cada preset con seed panorama completo; un frame asOf pasado; export CSV
  abierto al lado del mapa (paridad pantalla↔artefacto).
- `[ENTORNO]`: drill a localidad sparse por catálogo parcial — no criticable.

### Scope D — Gobierno operativa (desktop 1440)

**C8 · Bandejas, semáforos y honestidad de contadores** — `2026-07-27-critique-operativa.md`
- Rutas: `/gob/vigilancia` (brotes por última actividad + deadline semáforo post
  988a3cc8), `/gob/casos`, `/gob/denuncias` (+detalle con evidencia y descarga),
  `/gob/decomisos` (+la nota "el selector de período no filtra esta lista"),
  `/gob/outbox` (columna Intentos con su cero explícito).
- Persona: operador de bandeja con 10 minutos entre reuniones — "¿qué expediente
  necesita MI próxima acción?" (la pregunta del pase 07-25, ahora en lente visual).
- Focos: (1) semáforo de deadline legal: ¿rojo=vencido se distingue de rojo=urgente?,
  ¿un cumplimiento 7,1% puede volver a parecer verde en alguna vista?; (2) orden por
  última actividad en brotes: ¿la UI DICE el criterio de orden o el operador lo
  adivina?; (3) la nota del período en decomisos: ¿aclaración honesta o parche que
  grita deuda?; (4) el cero de Intentos: ¿la solución (decir "0") escala al resto de
  las columnas que "parecen vacías"?; (5) consistencia entre bandejas: mismos
  patrones de chip/estado/acción en casos/denuncias/decomisos — donde difieren, ¿hay
  motivo?
- Estados: bandejas con datos demo; un caso con deadline vencido forzado si el seed
  no trae (si no se puede forzar, se marca).

## 4b. Ampliación (encargo 2 del PO, mismo día): batería Panorama + transversales

> *"una batería bastante amplia sobre panorama, la joya del admin. Y fluidez, calidad
> de diseño front end y pulido de lo existente."* — C7 se expande a **cinco críticas
> P1-P5** y se agregan **dos transversales X1-X2**. Total tanda 1: **14 críticas.**

**P1 · Semántica del delta** — la C7 original, sin cambios (funcionario curioso sobre
polaridad, desierto %, captions, brecha, ranking, frame temporal, densidad del dock).
→ `2026-07-27-critique-panorama-semantica.md`

**P2 · Fluidez e interacción** — `2026-07-27-critique-panorama-fluidez.md`
- Persona: el mismo funcionario, pero la pregunta es táctil: ¿la consola se siente
  sólida o frágil?
- Focos: (1) drill provincia→departamento→back — continuidad de cámara (hubo fixes de
  cámara el 07-10: ¿quedó fluido o salta?); (2) cambio de preset: ¿transición o
  parpadeo blanco?; (3) tabs del dock preservando el frame temporal (a3070f1a) — ¿se
  NOTA que se preservó?; (4) hover ranking ↔ highlight en mapa: sincronía y latencia
  percibida; (5) back del navegador y URL compartible: ¿restaura la vista exacta?;
  (6) skeletons/loading: ¿qué se ve entre click y dato?
- Evidencia: secuencias de capturas (antes/durante/después de cada interacción) + los
  timings de P5.

**P3 · Calidad visual y cartografía** — `2026-07-27-critique-panorama-visual.md`
- Persona: diseñador senior externo que ve la consola por primera vez (lente craft).
- Focos: (1) los ramps como piezas perceptuales: ¿los 4-5 cortes se distinguen en el
  mapa real (no en la leyenda)?, ¿el hatching de no-data se lee como "sin dato" o como
  textura?; (2) tipografía del dock/caption/tabla: escala, jerarquía, alineaciones
  numéricas (tabular nums en columnas); (3) la leyenda como componente: orden, tamaño
  de swatches, el "≥"-censored eliminado — ¿quedó coherente?; (4) espaciado y ritmo
  del dock (5.064 líneas de componente: ¿se nota?); (5) dark mode del panorama
  específicamente (post audit-codemods); (6) cartografía: labels, bordes provinciales,
  jerarquía figura-fondo mapa vs UI.

**P4 · Pulido y micro-estados** — `2026-07-27-critique-panorama-pulido.md`
- Persona: QA de diseño obsesivo (el lente "pulido de lo existente").
- Focos: (1) chip k-anon "protegido" y celda suprimida: ¿explican o solo aparecen?;
  (2) "censurado — cota, no valor" (61649555): ¿cómo se VE?; (3) ResultCount "N de M"
  y truncamientos de capa (51c74c2a): visibilidad real; (4) stale-frame notice
  (`<output>` role): ¿se ve antes de citar un número?; (5) formatos es-AR en TODA
  celda (miles, decimales, %); (6) overflow: nombres largos (Santiago del Estero,
  Tierra del Fuego AIAS) en tabla/ranking/leyenda; (7) tooltips: contenido, delay,
  posición; (8) focus visible y navegación por teclado en dock/tabla; (9) export CSV:
  feedback al click, nombre del archivo, ¿y el caption del scope viaja (e1c0d396)?
- Estados: forzar celdas suprimidas, censored, capa vacía, frame stale.

**P5 · Performance percibida, medida** — `2026-07-27-critique-panorama-perf.md`
- No es crítica de agente: es un script Playwright+CDP que produce NÚMEROS, y un
  agente que los interpreta contra umbrales (LCP<2.5s, CLS<0.1, interacción<200ms).
- Métricas: time-to-canvas del mapa (frío/caliente), LCP/CLS de la consola, latencia
  click→repintado en cambio de preset y drill, long tasks durante hidratación (el
  console de 5k líneas), peso de la página (JS transferido).
- `[ENTORNO]`: hardware cloud ≠ notebook del funcionario — los números son
  RELATIVOS (entre interacciones) más que absolutos; el doc lo declara.

**X1 · Fluidez transversal (app entera)** — `2026-07-27-critique-fluidez-app.md`
- Persona: usuario impaciente en las 3 superficies (ciudadano mobile, dueño mobile,
  funcionario desktop).
- Focos: (1) navegación por full-document (la norma anti-router.refresh): ¿costo
  percibido?, ¿flash de contenido?; (2) sheets del owner: apertura/cierre/back;
  (3) loading states entre portales: ¿consistentes o cada ruta inventa el suyo?;
  (4) formularios: feedback al submit (denuncia wizard, alta, login);
  (5) los webm de demo del repo como referencia de lo que el PO ya mostró.

**X2 · Craft y consistencia visual transversal** — `2026-07-27-critique-craft.md`
- Persona: design lead haciendo QA de sistema sobre ~15 pantallas muestreadas de los
  4 portales.
- Focos: (1) tokens Poncho aplicados de verdad (¿algún hardcode visual sobrevive a
  lint:tokens?); (2) jerarquías tipográficas h1/h2/body consistentes entre portales;
  (3) iconografía: familia única, tamaños, alineación con texto; (4) densidad por
  portal: ¿gob más denso que owner a propósito?; (5) dark mode spot-checks (3 por
  portal); (6) botones/CTAs: el primitivo Operator Button vs el resto — ¿un solo
  sistema?; (7) empty states: ¿misma voz y anatomía en los 4 portales?

## 5. Tanda 2 — backlog (no corre ahora, queda planificada)

| Crítica | Cuándo vale la pena |
|---|---|
| Org portal (refugio/clínica: sheets de detalle, coverage editor, fosters, handshake decomiso) | Antes de sumar orgs reales al demo |
| Admin ops (institucionales, "sin localidades" resuelto, approvals) | Tras cerrar hallazgos H-serie de hoy |
| `/design:accessibility-review` transversal (skill dedicado) | Sobre las superficies que la tanda 1 declare estables |
| Dark mode + estados vacíos/error transversales | Post-fixes de tanda 1, como verificación |
| Mobile de /gob (¿existe el funcionario en el teléfono?) | Decisión de producto previa del PO |

## 6. Riesgos y fallbacks

1. **Login del shim no alcanza** → las superficies autenticadas de ese rol se critican
   con: código (JSX/copy/tokens) + screenshots val-* del 07-07 marcados STALE + los
   PNGs de `gob-*.png` del repo. El doc lo declara en el header. Las públicas (C1-C3
   parcial) no dependen de esto.
2. **seed-panorama excede presupuesto** → C7 corre con `seed:demo` solo y marca
   sparsity; el consolidado lo lista como re-run pendiente.
3. **Un agente devuelve crítica genérica** (el riesgo real del paralelismo) → el brief
   exige: cada hallazgo cita screenshot + componente, y las 3 prioridades proponen fix
   concreto. Consolidado descarta lo que no cumple.
4. **Sesgo de datos sintéticos** → regla `[ENTORNO]` de §2.

## 7. Definición de terminado

- 8 docs de crítica + 1 consolidado en `docs/reviews/results/`, bundles de screenshots
  commiteables, todo en el working tree de `C:\dev\dim` para que Claude Code lo
  commitee con su flujo normal.
- El consolidado termina en: top-10 cruzado con severidad, hallazgos sistémicos vs
  puntuales, y qué NO tocar (lo que funciona y por qué).
- Esta sesión no toca código de la app: los fixes son de Claude Code con specs de los
  docs.
