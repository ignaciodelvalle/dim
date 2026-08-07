# Ronda de validación pre-demo · PASADA 2 (solo-lectura) — Informe Cowork

**Entorno:** https://dim-staging.vercel.app · **Cuándo:** madrugada del 18/07/2026, 01:55–03:00 (ART) — el demo es HOY.
**Modalidad:** solo lectura — no creé, marcé, aprobé, resolví, firmé ni finalicé nada. Navegué, filtré, abrí fichas, exporté un CSV y generé un informe imprimible.
**Cuentas:** admin@dim.test (recorrido del funcionario) y alejo@dim.test (refugio). Las contraseñas las tipeó Nacho.
**Contexto clave:** entre la pasada 1 (anoche ~20-21h) y esta hubo **deploy nuevo** — varios arreglos verificados abajo. Además Nacho estuvo usando el mismo Chrome en paralelo con otra cuenta ("wawin"), lo que pisó la sesión de admin dos veces; todo hallazgo sospechoso de esa ventana fue re-verificado con sesión limpia antes de reportarse.

---

## ¿LISTO PARA DEMO? **SÍ, CON DOS CUIDADOS**

Los tres bloqueantes de anoche quedaron así: **Programa/Población ARREGLADO** (cargan completos, con metas y denominadores — verificado esta madrugada), **"Ver mascota" ARREGLADO**, y la **leyenda cruzada del panorama ARREGLADA**. Todo el nav admin carga, el refugio está sano, la privacidad (k<5) es consistente en mapa, popup, tabla e informe, y el relato "todo es un evento" se sostiene en cada pantalla.

Los dos cuidados para mañana:

1. **El banner rojo "Procesos automáticos caídos" sigue en la primera pantalla** (cron_daily y cron_health en FALLO desde el 17/7 04:51). Es lo primero que ve el ministro. Si no llegan a arreglar los crons, al menos ensayar la línea ("el monitoreo avisa solo — por eso confiamos en los números") o abrir directo en Panorama.
2. **Precalentar el panorama** antes de entrar a la sala: la primera carga fría tarda 8-15 s (después vuela). Y dejar la última vista usada en la de apertura (el panorama la recuerda por usuario). Si el mapa quedara gris tras mucho uso: pestaña nueva (F5 no alcanza).

Y un hallazgo nuevo a decidir si les importa hoy: el **"Informe de situación" de una provincia rankea unidades de otras provincias** (A1-v2) — si el demo genera el informe de Salta en vivo, que el presentador lo sepa.

---

## Qué cambió desde la pasada 1 (todo re-verificado con click real)

1. **"Ver mascota →" quedó ARREGLADO.** Ahora apunta a la credencial pública (`/p/DIM-E4WC-QKH8` para Churro; `/p/PANO-045778` para Toby) y navega bien — ya no rebota al Panel. El "← Volver a mi app" de la credencial, abierto desde admin, vuelve a `/admin` (correcto; el rótulo "mi app" es genérico pero el destino está bien).
2. **La leyenda cruzada del panorama quedó ARREGLADA.** Con Cobertura antirrábica + Zoonosis en Salta a nivel departamentos, la leyenda ahora dice "**Cobertura antirrábica (perros, 12m) (conteo) · 5→196**" y zoonosis tiene su escala aparte ("1–13"). El error de anoche ("Zoonosis / señales 16→676" sobre el gradiente de cobertura) no se reproduce.
3. **Cambio de diseño en Capas:** las bases son "una a la vez" en serio — con una base activa, las demás aparecen deshabilitadas con el texto "Ya hay una capa base activa (…). Elegí una sola base; las señales y referencias van encima." Para cambiar de base hay que destildar la actual primero (dos pasos). Correcto aunque menos directo que antes.
4. **La pestaña Registros explica los números** (esto responde varias dudas de coherencia de anoche): "Eventos en el período: 77 en 11 unidades (+215 protegidas por k-anonimato)", "Decomisos se muestra solo en el mapa (capa de referencia); no se tabula en Registros", "**La cobertura por unidad se muestra como conteo; el porcentaje se calcula solo a nivel provincia**". Tabla "Valor por unidad" (CAPA · UNIDAD · VALOR) con "Protegido (k<5)" y botón Descargar CSV.
5. **El popup respeta k-anonimato**: en General José de San Martín (Salta), "Denuncias de bienestar — *Dato protegido por privacidad (k-anonimato)*" + "Zoonosis / señales **13**". Nunca un número menor a 5.
6. **"(conteo)" + % confirmados de vuelta**: popup "Cobertura antirrábica (perros, 12m) (conteo) — 92 — últimos 90 días" mientras el panel sostiene "**47,4% · ESTADO ACTUAL · +14 pts**" (Salta) y "36,5%" (nacional, esterilización). Departamentos con k<5 se pintan con **rayado** (patrón diagonal) — prolijo.
7. **Informe de situación (nuevo verificado)**: genera un informe imprimible con TODO lo que un funcionario pediría: "Cobertura antirrábica 47,4% — **1.129 perros en el padrón · el padrón cubre 0,5% de la población canina estimada · 0% firmado por matrícula · meta 80%**", desglose de zoonosis ("0 rabia · 9 lepto · 4 hidat."), ranking "Peores 10", metodología y k-anonimato explicados, "Fuente: MiMAR — Centro de Situación Nacional". **Denominadores explícitos ✅** (lo que el checklist pedía para Programa/Población, acá está).
8. **Línea de tiempo (nuevo verificado)**: reproducción temporal con ventanas (última semana/mes/trimestre) y base "Cuándo ocurrió" vs "Según lo conocido al momento". Castellano impecable.
9. **Vistas**: menú con 8 presets en castellano (Brotes activos, Síntomas, Cumplimiento antirrábico, Registro PPP, Bienestar y fiscalización, Control poblacional, Mortalidad, Pérdidas y reunificación). Cambio Bienestar ↔ Control poblacional anda bien con sesión limpia; el panorama **recuerda la última vista usada** por usuario (ojo demo: dejarla en la vista de apertura deseada al ensayar).

## Lo que sigue igual que anoche

- **/admin carga bien**: inicial 3,6-3,8 s (dentro del rango esperado), recargas 1,1 / 0,7 / 0,6 s, sin cuelgues y sin el aviso de demora (4 cargas). Título "Panel" ✅.
- **El banner rojo de procesos SIGUE**: "Procesos automáticos caídos · avisá a soporte" — cron_daily y cron_health continúan en FALLO. El BLOQUEA/ALTO operativo de la pasada 1 sigue vigente (es la primera pantalla del demo).
- **El buscador explica** ✅ (mismo texto bueno de anoche) y **abrir un caso te deja en el portal** ✅.
- **Motivo en inglés en casos "Mascota perdida" sigue**: "Pet PANO-045778 marked as lost — seed-panorama" + "Abrió: PANO-Seed-Owner". Las denuncias están perfectas — para el demo, abrir CAS-UBNY-6KCF (Churro, Almagro): motivo en castellano, gravedad crítica, y **línea de tiempo con relato** ("Maltrato reportado — Un perro atado muy corto en una terraza de Almagro…").
- **Primer pintado del panorama (frío)**: shell en ~0,5 s; mapa+datos ~9,5 s (una carga) y ~15 s (otra, pestaña nueva con 3 capas). En caliente todo responde rápido. Sigue siendo EL número a vigilar del demo; precalentar antes.

## Hallazgos nuevos de esta pasada

### 🟧 ALTO

**A1-v2 · El "Informe de situación" de Salta rankea unidades de otras provincias.**
- Pantalla: Panorama → alcance Salta → Exportar → Informe de situación.
- Esperaba: "Peores 10" dentro del alcance declarado ("Alcance: Salta").
- Vi: el ranking mezcla **General Roca (Río Negro, #2), San Ignacio (Misiones, #4) y Cushamen (Chubut, #10)** entre departamentos salteños. Un funcionario de Salta leyendo "su" informe ve provincias ajenas.
- Pasos: drill a Salta → botón descargas → Informe de situación → tabla "Peores 10 · señales de zoonosis".

### 🟨 MEDIO

**M1-v2 · "CERRADA POSITIVA / CERRADA NEGATIVA" en observaciones es ambiguo — y con Lola juega en contra.**
- `/admin/observaciones` cierra la observación antirrábica de Lola como "**CERRADA POSITIVA**" y la misma Lola está publicada para adopción con vacuna VIGENTE. Todo indica que "positiva" = *resultado favorable* (sin señales) — pero en jerga clínica "positivo" se lee como *positivo a rabia*, que significaría lo contrario. Un veterinario en la sala lo va a leer al revés. Sugerencia barata: "Cerrada — sin señales" / "Cerrada — con señales" (o "favorable/desfavorable").

**M2-v2 · "Novedades: Sin novedades en los últimos 7 días" al lado de "último evento hace 3 minutos".**
- `/admin` abajo: la sección Novedades dice que no pasó nada en 7 días mientras el pie dice "último evento 18/7, 1:56 a. m." (minutos atrás) y hay 534 casos abiertos. Si "Novedades" es un feed de producto, renombrar o aclarar; si es actividad, está rota.

**M3-v2 · En el mismo informe: "215 unidades protegidas" vs "218 celdas ocultas".**
- El Informe de situación de Salta dice "215 unidades protegidas por privacidad (k-anonimato)" bajo el ranking y "218 celdas ocultas por privacidad" en la metodología. Dos números para lo mismo en el mismo documento.

### 🟦 BAJO

- **Mojibake en localidades**: "Agustí­n Roca, Buenos Aires" (Observaciones — codepoint U+00AD colado, doble encoding en la semilla).
- **Términos internos en inglés que se filtran a la UI**: "outbreak_signal" (metodología del informe), "pregnancy_status='in_progress'" (KPI de Preñeces en Población), "scan_event_purged" (una entrada del feed de Auditoría sin traducir).
- **Dropdown de acciones de Auditoría con duplicados**: "Baja voluntaria cuenta gobierno", "Microchip reemplazado" y "Revocación verificación org" aparecen dos veces en la lista de filtros.
- **Prefijos de estado como texto**: en tarjetas KPI se cuela la palabra de estado antes del título ("Peligro: PERFILES INCOMPLETOS" en Censo, "Normal: TASA DE RETORNO" en Adopciones, "Baja: -100%" en Inteligencia) — probablemente el label del chip leído como texto; revisar cómo se ve en pantalla vs lector.
- **"Informe de situación" dispara el diálogo de imprimir de inmediato** — está bien para imprimir, pero avisarle al presentador (bloquea la pantalla hasta cancelar).
- **Concordancia**: "APROBACIONES · 1 PENDIENTES" y "VENCIMIENTOS DE SLA (OUTBOX)" siguen igual que anoche; chip "PUBLICADO" vs botón "Publicada ✓" en refugio.
- **Denuncias sin jurisdicción** muestran "—" en la lista de casos (3 de 8 en el filtro de bienestar).
- **KPI vs Registros por 3-4** (nacional bienestar: 1.958 tarjeta vs 1.955 pestaña) — ahora al menos la pestaña Registros explica el porqué (k-anonimato).

## Notas de entorno (NO son del producto)

- **Una sesión por navegador**: loguear otra cuenta en cualquier pestaña pisa la sesión de admin. Para el demo: una sola cuenta por vez o perfiles de Chrome separados. (Las "caídas de sesión" de esta pasada fueron eso; la inestabilidad genuina reportada en ronda 5 no se re-observó de forma concluyente.)
- **Pestaña longeva = mapa en blanco**: tras horas de uso intensivo, el lienzo del mapa dejó de pintar en la pestaña vieja (WebGL agotado) y **F5 no lo recuperó — pestaña nueva sí**. Si en el demo el mapa queda gris con leyenda y KPIs bien: abrir el panorama en pestaña nueva.
- El CSV quedó como `panorama-mapa.csv` en Descargas; el toast "Descarga iniciada" confirmó ✅ (dos veces, en dos pasadas).

## Programa y Población: el BLOQUEA de anoche está RESUELTO ✅

**`/admin/programa` carga completo** (FCP 1,1 s · completo ~5-9 s): "Salud del programa" con KPIs y metas explícitas (Total 59.284 "mascotas activas o extraviadas" · Esterilización 36,5% **meta 70%** · Microchip 36,7% **meta 80%** · SLA ENO 50% · Cola más vieja 9d · 72 combinaciones provincia×métrica bajo meta), proyección de vacunación con disclaimer ("*Proyección de tendencia — no es una garantía. n=13, método=linear*") y botón "Ver datos", tabla de valores atípicos por provincia (valor · meta · desvío), **Supervisión de PII** (quedaron registradas mis propias búsquedas de esta noche — el audit de accesos a datos personales funciona en vivo), y Calidad de datos con fórmula al pie ("Completitud = mascotas sin ningún campo faltante ÷ total"). También muestra "Salud de crons" — con los dos FALLO visibles (ver abajo).

**`/admin/poblacion` carga completo** (FCP 1,2 s · completo ~5 s): "36,5% Cobertura de esterilización — **meta programática 70% · 21.636 de 59.284**" (numerador y denominador explícitos), Preñeces activas y Nacimientos con caveat honesto ("Solo partos en seguimiento — subestima la natalidad real"), tendencia + proyección, ranking por provincia con nota "*5 mascotas sin provincia asignada no aparecen en la tabla — la suma de las filas no equivale al total nacional*", y sello de frescura ("Calculado al 18/7/26, 2:49 a. m. · último evento 2:22 a. m.").

La pregunta del checklist ("¿los números dicen qué miden y sobre qué denominador?") queda respondida con un sí rotundo en ambas.

## Barrida del resto del nav admin: TODO CARGA ✅

- **Censo**: KPIs con definiciones ("Inactivas: sin actividad >12m · 1% del total" · "Perfiles incompletos 76%: sin chip, sexo o localidad"), embudo de identificación con nota de purga de escaneos, ranking por provincia.
- **Adopciones**: embudo de colocación con nota metodológica ejemplar ("Cada etapa es un conteo de eventos independiente del período (no cohorte): una etapa posterior puede superar a una anterior" — explica por qué 3.555 adopciones > 2.953 ingresos), tiempos de custodia (mediana/P75), ocupación "cupo no declarado", "1 período oculto (privacidad)" en la tendencia.
- **Inteligencia**: índice territorial compuesto con fórmula, "Política → resultado" (regla PPP CABA → certificaciones 8→0, "*Correlación temporal — no implica causalidad*"), calidad de datos por provincia, y el guardarraíl legal explícito: "**No existe puntuación algorítmica de personas (Ley 25.326)**" — oro para un demo gubernamental.
- **Cola**: 1 solicitud pendiente (matrícula veterinaria APR-BEWW-4NTF) — coherente con el "1 PENDIENTES" del Panel.
- **Alertas**: 1 alerta (esterilización CABA, observado 38 · meta 70, 10 días, RECONOCIDA) con flujo de triage completo — coherente con el badge "1" del nav.
- **Moderación**: cola vacía con buen empty state y filtros con severidades descriptas.
- **Bandeja de salida** (`/admin/outbox`): 24 notificaciones ENO ENTREGADO con SLA.
- **Auditoría**: 200 entradas agrupadas ("×3 acciones consecutivas · tocá para expandir"), mis búsquedas PII de esta noche registradas.
- Tiempos: todas entre ~2 y 9 s en frío; ninguna colgada, ninguna en inglés, ningún error.

## Refugio (alejo) — pendientes de rondas anteriores: TODO OK ✅

- **Selector de organizaciones**: alejo pertenece a 4 (refugio, clínica, red de rescate, autoridad sanitaria) — carga y elige bien.
- **Panel del refugio**: "Primeros pasos 3/5" (faltan Servicios y Capacidad — y el KPI dice "sin capacidad declarada", coherente con el "cupo no declarado" que muestra el admin nacional ✅), Ocupación 4, Disponibles 2, Adopciones en curso 1, "Requieren acción: Todo en orden".
- **Transferencias**: Salientes/Entrantes con la propuesta de Negro (CAS-FABE-AB8S, ACEPTADA) y link al caso.
- **Operaciones (Postulaciones)**: 1 pendiente ("Postulante → Coco", 10 días, Vivienda: Departamento) con flujo de aprobar/rechazar en lote a la vista (no toqué nada).
- **Tablero kanban**: INGRESO (Coco, Toby) → EVALUACIÓN (0) → DISPONIBLE (0) → EN ADOPCIÓN (Bichita, Lola). Prolijo. *Detalle*: el KPI del panel dice "Disponibles 2" pero la columna "DISPONIBLE" del tablero está en 0 (las dos publicadas están en "EN ADOPCIÓN") — la palabra "disponible" significa dos cosas distintas según la pantalla (BAJO).
- **Ficha con QR**: la ficha de Lola abierta como miembro del refugio muestra el banner de contexto ("Cualquier evento que registres queda atribuido a la organización"), credencial con **QR renderizado** y código público P/DIM-S009-PLRM (mismo patrón /p/ verificado con Churro y Toby), "Microchip verificado", cumplimiento "3 de 4 al día" y **vacuna antirrábica VIGENTE (aplicada 20/11)**.

## Tabla de tiempos (pasada 2)

| Pantalla / momento | Medición | Detalle |
|---|---|---|
| `/admin` — post-login (fría) | **~3,6-3,8 s** | TTFB 36 ms · FCP/LCP 1,1 s · load 3,64 s |
| `/admin` — recargas ×3 | **1,1 / 0,7 / 0,6 s** | FCP 0,63 / 0,42 / 0,25 s · sin aviso de demora, sin cuelgues |
| `/admin/panorama` — fría (vista restaurada, 1 capa) | **shell 0,5 s · completo ~9,5 s** | TTFB 35 ms · FCP 0,51 s · LCP 0,82 s · load 9,34 s · último fetch 9,37 s |
| `/admin/panorama` — pestaña nueva, 3 capas | **~15 s hasta mapa completo** | El costo frío se paga una vez; después todo es fluido |
| Drill a Salta + KPIs | **~4-6 s, sin errores** | Los indicadores cargaron al toque esta vez (anoche AR-S colgaba >30 s) |
| Cambios de vista/capas (calientes) | **2-4 s** | Bienestar ↔ Control poblacional, zoonosis on/off |
| `/admin/programa` | **FCP 1,1 s · completo ~5-9 s** | El BLOQUEA de anoche — ahora carga entero |
| `/admin/poblacion` | **FCP 1,2 s · completo ~5 s** | Ídem |
| Resto del nav (8 secciones) | **2-9 s c/u** | Ninguna colgada, ninguna en inglés |

## Guion sugerido para el demo (camino dorado verificado, todo en frío esta madrugada)

1. Abrir **Panorama ya precalentado** (pestaña abierta 5 min antes) — vista Bienestar y fiscalización, nacional.
2. Activar **Zoonosis / señales** (badge "Provincias · Zoonosis: departamentos") → drill a **Salta** con el selector o click en el mapa → popup de General José de San Martín: zoonosis 13 y denuncias "*Dato protegido por privacidad (k-anonimato)*" — el momento privacidad.
3. Pestaña **Registros** → leer en voz alta los explicadores (eventos, unidades, k-anonimato) → **Descargar CSV** (toast de confirmación).
4. **Estadísticas/KPIs**: "77 señales +10% · activas hoy 13" — y "Ver todos los indicadores (8)".
5. **Casos**: buscar "denuncia" → abrir **CAS-UBNY-6KCF (Churro, Almagro)** → línea de tiempo narrada → **Ver mascota** → credencial pública con QR.
6. Cierre analítico: **Programa** (metas y desvíos por provincia + supervisión de PII) o **Inteligencia** ("no existe puntuación algorítmica de personas — Ley 25.326").
7. Evitar en vivo: el Informe de situación de una provincia (ranking mezcla provincias), los casos "Mascota perdida" seed (motivo en inglés), y el pie de Novedades del Panel ("sin novedades en 7 días").
