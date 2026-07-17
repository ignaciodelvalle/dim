# Ronda staging (solo-lectura) — Informe Cowork

**Entorno:** https://dim-staging.vercel.app (staging real, HTTPS). **Solo lectura: no muté nada** — no creé, marqué, aprobé, resolví, firmé ni finalicé. Solo navegué, filtré y descargué.
**Cuentas:** admin@dim.test, alejo@dim.test / Test1234! (carla/lilian no existen en staging). Actos 1, 2 y 5 sin sesión. No tipeo contraseñas (el usuario logueó).
**Caveats de entorno (no del producto):** (a) el viewport no bajó de **innerWidth 660px** (Chrome clampea; pedí 390/340). (b) La pestaña de Chrome **se congela cuando pasa a segundo plano** (screenshots y JS con timeouts) — obligó a trabajar con la ventana adelante y complicó el Acto 3/4.

---

## 1) TL;DR — ¿se lo mostrás a un ministro YA?

**El frente público, sí; el tablero del funcionario, todavía no.** La credencial pública, `/perdidas` y `/transparencia` están prolijos, rápidos (~1,5 s) y con arreglos visibles (NIVEL en castellano, antirrábica "VIGENTE", foto real, banda roja de pérdida clara). **Pero el panel de `/admin` NO carga**: se queda >25 s en "Cargando…" con skeletons mientras el resto del sitio abre en ~1,5 s. Justo la pantalla que vería un funcionario nacional está colgada, así que **hoy no**: hay que destrabar la carga del panel primero. Es un bloqueante puntual, no un problema general — el resto se ve muy presentable.

---

## 2) Tabla de números

| Qué | Valor observado |
|---|---|
| Carga `/p/DIM-PAMP-0001` | **~1,65 s** (load) · DOMContentLoaded 0,9 s · TTFB 133 ms (Navigation Timing) |
| Carga `/perdidas` | **~1,53 s** · **116 activas ahora** (0 nuevas 24h / 0 nuevas 7d) |
| Carga panel `/admin` | **>25 s — no cargó** (29 skeletons, "Cargando…") · el resto del sitio ~1,5 s |
| Carga `/transparencia` + CSV | rápida · CSV `cobertura-antirrabica` **generado 2026-07-17T19:37Z** (fresco) |
| **URL del QR (regresión)** | **No hallé QR renderizado** en la credencial pública (a innerWidth 660). `og:url`/canonical = **`https://dim-staging.vercel.app/p/DIM-PAMP-0001`** (ABSOLUTA; **sin `/p/` relativo** en ningún href/src) |
| Chip NIVEL (Acto 1) | **"NIVEL 2 · DATOS MÉDICOS"** (castellano; era "TIER 2 · MÉDICO" en local) |
| Antirrábica (Acto 1) | **"ANTIRRÁBICA · VIGENTE"** (chip verde explícito) |
| Menú admin (Acto 3) | nav dice **"Panel"** ✅ · breadcrumb/título todavía dice **"Dashboard"** (inglés) |
| Origen descargas (Acto 5) | **dim-staging.vercel.app** en todos los links (CSV/JSON) y también en los links embebidos del CSV |
| Datasets transparencia | **5**: antirrábica, esterilización, microchip, cumplimiento PPP, fallecimientos/mortalidad |

---

## 3) Hallazgos

### BLOQUEA

**BL1 · El panel de `/admin` no carga (queda en "Cargando…")**
- **Pantalla:** `/admin` (Panel), logueado como admin (SUPERADMIN · UNIVERSAL).
- **Qué esperaba:** que el tablero pinte sus tarjetas de colas (aprobaciones, SLA, casos, etc.) como en local (~3 s).
- **Qué vi:** **>25 s en "Cargando…" con 29 skeletons**, sin pintar. Recargué y probé en dos navegadores distintos; no cargó. El resto del sitio (`/`, `/perdidas`, `/p/`, `/transparencia`) responde en **~1,5 s**, así que **es específico de `/admin`**.
- **Pasos:** login admin → `/admin` → esperar.
- **Info para diagnóstico (dev/CC):** el síntoma es que `<main>` se queda en "Cargando…" con nodos `animate-pulse`; **no capturé errores en consola** (el tracking arrancó tarde) ni el **request colgado exacto** (la pestaña se congeló al pasar Chrome a segundo plano antes de poder leer la red con tracking activo). Hipótesis: la **agregación de colas/estadísticas del dashboard** (server action / route handler que cuenta aprobaciones, SLA outbox, casos abiertos, observaciones, etc.) está colgada o lentísima en staging. Sugerencias de dónde mirar: timeout/lentitud de esa query, índice faltante en la DB de staging, o función serverless que no resuelve. Contrasta con local, donde el mismo panel cargaba en ~3 s.

### MEDIO

**M1 · Credencial de mascota perdida: ubicación de "última vez vista" inconsistente**
- **Pantalla:** `/p/PANO-045775` (Laika, perdida).
- **Qué vi:** "ÚLTIMA VEZ VISTA: **Lanús, zona sur del conurbano bonaerense · Carhué**". Lanús (conurbano sur) y **Carhué** (oeste de la provincia, ~600 km) no cuadran; el mapa muestra un barrio puntual. Para el vecino que la busca, la referencia de **dónde** buscar se contradice — y es LA info clave del caso de uso.
- **Pasos:** `/perdidas` → abrir Laika → bloque "Última vez vista". (Probable dato de semilla, pero conviene validar que zona y localidad se compongan coherentes.)

**M2 · Foto placeholder en una mascota PERDIDA**
- **Pantalla:** `/p/PANO-045775` (Laika).
- **Qué vi:** foto con inicial "L", sin imagen real. En una mascota perdida la foto es lo más importante para que un vecino la reconozca; su ausencia debilita el aviso. (Depende de semilla — esta mascota no tiene foto; Pampa sí tiene foto real en staging.)

**M3 · No pude confirmar el QR en la credencial pública (regresión vigilada abierta)**
- **Pantalla:** `/p/DIM-PAMP-0001`.
- **Qué esperaba:** ver el QR del hero y confirmar que codifica la URL https **absoluta**.
- **Qué vi:** recorrí toda la credencial y **no se renderiza ningún QR** (ni SVG cuadrado con módulos, ni canvas, ni img de QR) a innerWidth 660 — el único SVG es un ícono de candado. La URL absoluta correcta está en `og:url`/canonical y **no hay `/p/` relativo** en hrefs/srcs (buena señal). Parece que el QR es owner-facing (no aparece en la vista pública), y no pude bajar el viewport a 390 (Chrome clampea) ni entrar como el dueño de Pampa (no está entre admin/alejo). → **El URL-handling se ve correcto (absoluto), pero el QR en sí quedó sin verificar.** Ver "qué no pude terminar".

### BAJO

- **B1 · Nav "Panel" vs breadcrumb "Dashboard":** el menú lateral ya dice **"Panel"** (arreglo ✅), pero el título/breadcrumb arriba a la izquierda sigue diciendo **"Dashboard"** (inglés). Unificar. *(`/admin`, visible aun con el panel colgado.)*
- **B2 · "NIVEL 0/2" sin contexto:** el chip de nivel ("NIVEL 2 · DATOS MÉDICOS", "NIVEL 0 · IDENTIDAD") puede no decirle nada a un vecino. *(credencial pública.)*
- **B3 · A11y — CTA no semántico:** "¿Encontraste a esta mascota? Tocá acá para avisarle al dueño ›" no aparece como link/botón semántico (`read_page` interactive no devolvió elementos). Puede no ser accesible por teclado/lector. *(credencial pública, `/p/`.)*

### IDEA

- **I1 · Contacto directo en mascota perdida:** en la credencial de una perdida hay "Está conmigo" y "Vi a la mascota cerca de acá" (avistaje), pero **no hay opción de llamar** al dueño — el aviso va por la app. Es coherente con la privacidad (no se expone el teléfono), pero algunos vecinos esperarían un contacto directo; evaluar un "el dueño te llama" más explícito.
- **I2 · Loading del panel:** mientras se destraba BL1, un **estado de carga con timeout + reintento** (en vez de skeletons infinitos) evitaría que un funcionario quede mirando "Cargando…" sin saber si se rompió.

### Lo que anda bien (vale registrarlo)
- **Arreglos confirmados en la credencial pública:** chip **"NIVEL 2 · DATOS MÉDICOS"** en castellano (era "TIER 2 · MÉDICO"); **"ANTIRRÁBICA · VIGENTE"** explícito (en local solo decía "Con registros"); **foto real** de Pampa (no placeholder); nav admin **"Panel"** en castellano.
- **Credencial de perdida (cambio de hoy):** banda roja clara ("🚨 PERDIDA · hace 28 días", "SE PERDIÓ", "¡Hola! Soy Laika — Me perdí"), dos caminos de aviso ("Está conmigo" / "Vi a la mascota cerca de acá") y mapa con pin + "Abrir en Google Maps". Como vecino, se entiende qué hacer.
- **Transparencia:** links de descarga al **origen correcto** (dim-staging.vercel.app), CSV **autodocumentado** (CC BY 4.0, atribución, metodología/diccionario, supresión k=5) y **fresco** (generado hoy). Accesible sin sesión.
- **Performance del frente público:** ~1,5 s en todas las rutas públicas.

---

## 4) Qué NO pude terminar

- **Acto 1 — el QR en sí:** no se renderiza QR en la credencial pública a los anchos que pude probar (Chrome no baja de innerWidth 660; no pude forzar 390). El dueño de Pampa no está entre las cuentas dadas, así que no llegué a la vista donde el QR sí aparecería. Confirmado en cambio que la URL canónica/og es **absoluta y correcta**.
- **Acto 3 — el resto del panel:** por el bloqueante BL1 (panel no carga) quedaron sin probar: **nombres de los procesos automáticos** (¿siguen tipo `expire_foster_proposals` o están en castellano?), si el **banner de procesos** refleja el estado real, el **buscador global** con `DIM-PAMP-0001` (¿explica por qué no aparece?), y **abrir un caso desde `/admin/casos`** (¿seguís dentro del portal operador?). Todo eso vive en el panel colgado.
- **Acto 4 — refugio (alejo), solo mirar:** no ejecutado. Requiere login de alejo (no tipeo contraseñas) y el navegador venía inestable (freeze al pasar Chrome a segundo plano); se cortó por pedido de cerrar el informe ante el bloqueante del admin. Pendiente para una próxima corrida (Chrome adelante + sesión alejo): lista de custodia + ficha de una mascota, confirmar si el **ESTADO** se muestra con **color + texto** (no texto plano). Solo lectura.

---

*Ronda corrida por Cowork sobre https://dim-staging.vercel.app, 17-jul-2026, en modo solo-lectura (no se mutó nada). El bloqueante BL1 (panel /admin) impidió cubrir los Actos 3–4 completos; Actos 1, 2 y 5 quedaron cubiertos (con la salvedad del QR en el Acto 1).*
