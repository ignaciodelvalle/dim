# Cowork QA — Ronda 4 · "El funcionario curioso" (admin primero)

**Fecha:** 15/7/2026 · **Entorno:** `http://localhost:3000` (datos de demostración, sintéticos)
**Cuentas usadas:** `admin@dim.test` (Actos 1–4), `lucas@dim.test` (Acto 5), sin login (Acto 6)
**Tester:** funcionario municipal curioso (Claude in Chrome)

---

## 1) TL;DR

Sí, un funcionario real puede trabajar con esto: los flujos centrales (aprobar una matrícula, moderar una denuncia, drilldown BA vs Córdoba, exportar, datos abiertos, credencial pública) funcionan de punta a punta y el panel te lleva a la acción. Lo mejor: la **coherencia panel↔acción** (los contadores bajan en vivo), la **auditoría** (hasta las búsquedas y las vistas de ubicación quedan registradas) y la **privacidad/k-anonimato**, que aguanta incluso cuando intentás forzar por URL una provincia ajena. Lo que más molesta: **acciones sin feedback** (el "Reintentar" del outbox parece no hacer nada), **contadores que se contradicen** (SLA 100% con 12 en incumplimiento), **crons caídos** que nadie operativo puede accionar, y un **mapa del sitio que no es clickeable**. Nada bloquea el trabajo, pero varias cosas te hacen dudar de si el sistema hizo lo que pediste.

---

## 2) Hallazgos priorizados

### ALTO

**A1 · "Reintentar ahora" (outbox) no da ninguna señal de que funcionó**
- Pantalla: `/admin/outbox/<id>` (Bandeja de salida → Detalle).
- Esperaba: al reintentar, un toast/confirmación o que los campos cambien.
- Vi: cero feedback. "Próximo reintento" seguía mostrando la fecha vieja (9/7) hasta que recargué a mano; recién ahí actualizó a "hoy 10:33". El estado sigue "Pendiente / Intentos 0". Un usuario clickea de nuevo pensando que falló.
- Repro: Dashboard → tarjeta rosa "Vencimientos de SLA" → un item en incumplimiento → Detalle → "Reintentar ahora" → observar (nada cambia hasta recargar).

**A2 · Crons en FALLO (causa raíz del outbox trabado)**
- Pantalla: `/admin/sistema` → panel "Crons".
- Esperaba: los jobs de fondo corriendo (o, si no, un estado claro y accionable).
- Vi: varios crons en **FALLO** (15 jul 09:45): `expire_foster_proposals`, `expire_pet_transfers`, `post_adoption_checkin`, `process_eno_queue`, `vaccine_due`. El detalle de `process_eno_queue` dice `{"error":"eno processor crashed"}`. Esto explica por qué los 12 breaches del outbox nunca se entregan e Intentos=0: **el drenaje está caído**. Reintentar (A1) no sirve mientras el cron no corra.
- Repro: `/admin/sistema` → Crons → "Ver detalle del error" en `process_eno_queue`.

**A3 · "SLA ENO 100%" conviviendo con "12 en breach activo"**
- Pantalla: `/admin/sistema` (tarjeta "SLA ENO"), coherente con el dashboard ("Vencimientos de SLA 12").
- Esperaba: si hay 12 en incumplimiento, el % de cumplimiento no debería ser 100%.
- Vi: la tarjeta muestra **100%** en verde (lee "todo bien") y justo debajo "12 en breach activo". Los dos números se contradicen y el titular tranquiliza de más.
- Repro: `/admin/sistema` → tarjeta superior derecha "SLA ENO".

### MEDIO

**M1 · El "Mapa del sitio" del dashboard no es clickeable**
- Pantalla: `/admin` → sección "Mapa del sitio".
- Esperaba: cada destino ("Servicios", "Libro de eventos", etc.) me lleva a su pantalla.
- Vi: nada pasa al clickear. Verificado en el DOM: cada destino está envuelto en un `<a href>` **pero el ancla mide 0×0 px** (el texto desborda una caja de tamaño cero); el mismo link en el sidebar mide 197×44. Reproducido en panorama/censo/reglas/libro/servicios/usuarios (todos 0×0). Hay que usar el sidebar o la URL.
- Repro: `/admin` → scroll a "Mapa del sitio" → click en cualquier título → no navega.

**M2 · Las "Novedades" son 20 ítems indistinguibles (y hay un duplicado)**
- Pantalla: `/admin` → "Novedades últimos 7 días".
- Esperaba: poder diferenciar y priorizar las novedades.
- Vi: 20 ítems TODOS "Incidente reportado", TODOS Tucumán, TODOS "hace 5 días" — imposible distinguir uno de otro. "Colonia Mayo - Barrio La Milagrosa, Tucumán" aparece 2 veces. (Lo bueno: "Marcar como visto" oculta y persiste tras recargar — ver Funciona bien.)

**M3 · La evidencia de la denuncia no se puede ver**
- Pantalla: `/admin/moderacion/<id>` (denuncia de negligencia).
- Esperaba: abrir la foto para evaluar la gravedad.
- Vi: "Evidencia (1): bolt.jpg **(no disponible)**". La única prueba (foto del perro) no se abre; un funcionario no puede juzgar la gravedad sin verla.

**M4 · El mismo export CSV vive en dos lugares (regla "un solo lugar")**
- Pantalla: `/admin/panorama` → hub "Exportar" y panel "Registros".
- Esperaba: todo export desde un único lugar.
- Vi: el CSV está en el hub de exportación Y como botón "Descargar CSV" en el panel Registros. El propio hub lo admite: "Descarga la tabla de datos por unidad (la misma de Registros)". PNG e Informe sí están solo en el hub.

**M5 · No se nombran las jurisdicciones del funcionario**
- Pantalla: `/gob` (cuenta Lucas, "5 LOCALIDADES").
- Esperaba: ver claramente CUÁLES son mis 5 localidades.
- Vi: solo el CONTEO ("GOB · 5 LOCALIDADES"); el badge no despliega la lista y el filtro Localidad muestra "Todas". Tuve que INFERIR mis localidades del feed de novedades (Palermo, San Nicolás, Puerto Madero, Recoleta, Retiro). Debería haber un "Tus jurisdicciones: …" explícito.

**M6 · La ayuda del cron es jerga de dev**
- Pantalla: `/admin/sistema` → detalle de error de cron.
- Vi: "revisá los logs del servidor en el dashboard de Vercel y ejecutá el cron manualmente … vía curl con el CRON_SECRET". Un operador no entiende ni puede accionar esto.

### BAJO

- **B1 · Doble conteo de pendientes (`/admin`):** "Cola pendiente 1 / más vieja 3d" (Métricas) repite "Aprobaciones · 1 pendientes / más antigua 3d" (Colas). Dudé si eran cosas distintas.
- **B2 · "Decisiones 7d 0, −100%" en rojo (`/admin`):** con flecha ↓ lee como "se rompió algo", cuando es demo sin decisiones.
- **B3 · "Sin coincidencias en tu jurisdicción" para un admin UNIVERSAL:** la búsqueda global (matchea PERSONAS por nombre) da ese mensaje para "veterinaria"/"La Plata"; sugiere un límite territorial que el admin universal no tiene.
- **B4 · Texto interno/inglés en vista pública:** el "Motivo de apertura" del caso de mascota perdida muestra "Pet PANO-045777 marked as lost — seed-panorama" (inglés + tag de seed).
- **B5 · Recencia vs total en `/perdidas`:** "Activas ahora 116" con "Últimas 24h 0 / Últimos 7 días 0" (todos los seeds son de ~3 semanas) confunde.
- **B6 · Inset "CABA" fijo en Panorama:** el recuadro derecho dice siempre "CABA · valor provincial/por barrio" aunque la provincia elegida sea Buenos Aires o Córdoba.
- **B7 · Flash blanco ~2s al cargar el mapa** de Panorama.
- **B8 · Al forzar una provincia ajena (Lucas), el shell "finge" Córdoba** (selector + caption + "Volver a Nacional") aunque no haya acceso y todo esté en "—"; mejor un "No tenés acceso a esta jurisdicción" y volver a CABA.
- **B9 · Home vs credencial (6b):** el carrusel del home muestra a DIM-PAMP-0001 "Pampa" como PERDIDA con "Llamar al dueño", pero la credencial real figura "Activa".

### IDEA

- **I1 · Diferenciar "protegido" de "sin dato":** en Panorama, las unidades suprimidas por k<5 se pintan en BLANCO igual que "sin dato". Un patrón/hatch "protegido" evitaría leer ausencia de datos donde en realidad hay supresión.
- **I2 · Rótulo de ventana en datos abiertos:** aclarar que el open-data de cobertura es "ventana 12m" para que no choque con el 90d de Panorama (ver C4).

---

## 3) Consistencia (sección fija)

Momentos donde dos partes de la pantalla contaron historias distintas:

- **C1 (ALTO) · SLA ENO 100% vs "12 en breach activo"** en `/admin/sistema` (mismo choque con "Vencimientos de SLA 12" del dashboard). Ver A3.
- **C2 (BAJO) · "Cola pendiente 1" (Métricas) vs "Aprobaciones · 1 pendientes" (Colas)** en `/admin`: dos contadores para lo mismo. Ver B1.
- **C3 (BAJO) · Home vs credencial:** DIM-PAMP-0001 "PERDIDA" en el home, "Activa" en `/p/DIM-PAMP-0001`. Ver B9.
- **C4 (BAJO) · Cobertura Córdoba 74,7% (Panorama, 90d) vs 74,8% (datos abiertos, 12m):** diferencia por período/redondeo, no bug; conviene rotular la ventana. BA 63,5% coincide en ambos.
- **NO fue incoherencia (verificado):** en el drilldown de Córdoba, el mapa aparece en blanco y "Registros 0" — PARECÍA bug, pero el panel aclara "0 en 0 unidades (+14 protegidas por k-anonimato)" y "el porcentaje se calcula solo a nivel provincia". Es supresión correcta, no incoherencia. El rótulo↔caption↔pie del Panorama fueron coherentes al cambiar de provincia.

---

## 4) Lo que funciona muy bien (no romper)

- **Coherencia panel→acción→contador (Acto 1b/2a):** aprobar la matrícula de Dra. Carla Pérez fue impecable: paso de confirmación con nota opcional, el estado pasó a APROBADA, el rol del aplicante cambió solo de Dueño/a → Veterinario/a, y el dashboard bajó **en vivo** (Aprobaciones 1→0, "Sin pendientes", Decisiones 7d 0→1 verde). La tarjeta rosa de SLA me llevó derecho a la cola correcta.
- **Auditoría (Acto 4):** `/admin/auditoria` registró TODO con actor + timestamp + sujeto + req id: "Solicitud aprobada"/"vista" (Dra. Carla Pérez), "Denuncia desflagged", "Ubicación de caso consultada" (¡las vistas de ubicación exacta se auditan!) e incluso "Búsqueda de información personal" para búsquedas sin resultado. Gobernanza fuerte.
- **Privacidad y k-anonimato (Actos 2b/3e/5b/6):** ubicación exacta rotulada "USO OFICIAL (LEY 14.346)"; denunciante anónimo; unidades chicas "Protegido (k<5)"; la credencial pública dice explícito "no expone contacto del dueño, dirección ni notas privadas"; y el aislamiento por jurisdicción **aguanta** el intento de espiar otra provincia por dropdown, por URL (`province=AR-X` → todo "—") y por `/admin/*` (redirige a `/gob`).
- **Guardrails de decisión:** "Pasar a triage" exige justificación (mín. 10 chars); aprobar/rechazar tienen paso de confirmación.
- **Moderación → triage:** encontrar y resolver la denuncia fue directo; la cola quedó vacía y el contador del dashboard bajó a 0.
- **Transparencia (Acto 6a):** `/transparencia` cita Ley 27.275, aclara que son datos agregados por provincia, y cada dataset trae metadatos completos y en castellano llano — licencia CC BY 4.0 con atribución, cadencia diaria (ventana 12m), diccionario de columnas, metodología y **regla de supresión k=5** que explica por qué faltan filas.
- **Libro de eventos:** append-only, solo lectura, con replay "Ver situación a esta fecha" — coincide con lo que promete el mapa del sitio.

---

## 5) Anexo

**Actos cubiertos:** 1 (a,b,c,d), 2 (a,b,c), 3 (a,b,c,d,e), 4, 5 (a,b), 6 (a,b). Cobertura completa de los 6 actos.

**Cobertura parcial / con salvedad:**
- **6b (celular 390px):** no pude forzar el viewport a 390px (Chrome desktop clampea el ancho mínimo; quedó ~657px innerWidth). Evalué el layout responsive de una columna, que sí se activa; para un test 390 exacto conviene DevTools device mode.
- **2a (La Plata):** el escenario menciona una veterinaria de La Plata, pero la única matrícula pendiente era de Recoleta/CABA (Dra. Carla Pérez). Resolví esa (la real) y dejé constancia de que no hay solicitud pendiente de La Plata.
- **2b ("mascota identificada"):** la única denuncia en moderación era de un "animal sin dueño identificado", no de una mascota registrada.
- **Login de Lucas (Acto 5):** lo hizo el usuario; no puedo tipear contraseñas para autenticar. El logout de Lucas (para Acto 6) sí lo hice yo.
- **Descarga CSV:** el usuario autorizó las descargas; disparé el CSV de cobertura-antirrábica desde el hub y verifiqué la metadata vía el endpoint JSON.

**Datos mutados (entorno demo, descartable):**
1. `/admin` → "Marcar como visto" en Novedades (marcó las 20 como vistas; persistió).
2. Outbox item `be47e84a…` → "Reintentar ahora" (reseteó next_retry_at a hoy 10:33).
3. `APR-M5KB-7834` (Dra. Carla Pérez, matrícula veterinaria CABA) → **APROBADA** con nota "QA test - ronda 4"; su rol pasó a Veterinario/a.
4. `DEN-CE4F-ZNJH` (denuncia de negligencia) → **"Pasar a triage"** con justificación; salió de la cola de moderación.
5. Descarga del CSV `cobertura-antirrabica` (a la carpeta de descargas del navegador).
