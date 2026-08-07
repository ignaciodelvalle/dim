No leas nada más que este prompt. Sos un evaluador de UX/producto con contexto CERO
sobre este sistema. Vas a auditar DOS cosas en orden: primero A FONDO la pantalla
"Panorama", y después el resto del portal de ADMINISTRACIÓN. Navegás como un usuario
real y reportás SOLO lo que puedas REPRODUCIR con pasos exactos y números exactos.
No leés código ni arreglás nada.

── QUÉ ES EL SISTEMA ──
Registro nacional digital de credenciales de mascotas de Argentina (cada mascota
tiene una credencial pública verificable por QR). Entrás como ADMINISTRADOR
NACIONAL: un funcionario del organismo central que ve TODO el país y tiene que
confiar en estos números para tomar decisiones de política y asignar presupuesto.
UI en español (Argentina). Hay un banner de "datos sintéticos" — evaluá igual como
si un funcionario tuviera que firmar con estos números.

── ENTRAR ──
URL: https://dim-staging.vercel.app  ·  Login: /login
Usuario: admin@dim.test  ·  Clave: Test1234!
Panorama: menú lateral → sección SITUACIÓN → Panorama

Es un entorno de STAGING, no una máquina local. Si algo no carga, esperá y
reintentá antes de reportarlo como roto: puede ser un arranque en frío.

Anotá al empezar la HORA EXACTA (con minutos) de tu primera carga, y volvé a
anotarla si en algún momento recargás después de un rato largo. El sistema se
redespliega varias veces por día y necesitamos poder ubicar cada hallazgo contra
la versión que estaba arriba.

── VENTANA DEL NAVEGADOR ──
Hacé la auditoría principal en escritorio ancho (1440px o más). Al terminar la
PARTE 1, repetí SOLO el Panorama a 390px de ancho y reportá aparte lo que se rompa
ahí — un funcionario lo va a abrir desde el teléfono en una reunión.

── REGLA DE MÉTODO (CRÍTICA) ──
- Navegá SIEMPRE por los controles en pantalla (menús, botones, toggles, scrubber,
  clicks en mapa/tablas/filas). NUNCA tipees ni adivines URLs, nombres de vista,
  ids de preset ni rutas (ej: no inventes "?preset=zoonosis" ni "/admin/sla").
  Si algo no está en un menú o un link clickeable, no existe para esta auditoría.
- Para testear deep-linking usá SOLO una URL que la app haya generado (copiala de
  la barra DESPUÉS de armar el cuadro con clicks) y reabrila.
- Antes de decir "está roto", reproducilo 2 veces y anotá los pasos exactos.
- Si un número te parece mal, buscá PRIMERO si la pantalla declara su ventana
  temporal o su modo. Muchos números que parecen contradecirse están calculados
  sobre ventanas distintas, y eso suele estar rotulado. Si está rotulado y aun así
  confunde, eso es un hallazgo de CLARIDAD, no de dato — marcalo como tal.

════════════════════════════════════════════════════════
PARTE 1 — PANORAMA A FONDO
════════════════════════════════════════════════════════
Modelo mental: Panorama es una SALA DE SITUACIÓN. Elegís una VISTA (lente de
misión) que carga capas del mapa + un pack de KPIs; acotás con ALCANCE
(nación→provincia→comuna) y PERÍODO; pintás el mapa como CONTEO o PER CÁPITA;
cruzás con el cajón inferior (Estadísticas: calendario+ranking / Registros:
tabla+CSV / Referencias / Línea de tiempo con dos bases: "cuándo ocurrió" vs
"según lo conocido al momento"). La URL guarda el estado para compartirlo.

El CORAZÓN de esta parte es COHERENCIA BAJO CAMBIO: armá un cuadro, cambiá UNA
sola cosa, y verificá si TODO lo visible sigue coherente (o si lo que difiere está
claramente rotulado con su motivo). Probá cada eje:

1. VISTAS: abrí el selector de vistas y recorré CADA vista del menú. Por cada una:
   ¿cambian las capas? ¿cambia el pack de KPIs? ¿el badge dice qué vista es?
   ¿dos vistas cargan lo mismo (no deberían)?

2. PERÍODO: con una vista fija, cambiá 7d/30d/90d/1año/año-en-curso. ¿Qué números
   se mueven y cuáles no? ¿Cada KPI dice sobre qué ventana está calculado (período
   / 12 meses fijos / estado actual)? Anotá valores.

3. LÍNEA DE TIEMPO — EL EJE MÁS IMPORTANTE. Tiene dos momentos, tratalos aparte:
   a) CONFIGURANDO (sin reproducir): ¿se entiende qué vas a ver antes de arrancar?
      ¿Las fechas disponibles, la ventana de repetición y la base temporal están
      claras? ¿La diferencia entre las dos bases se explica en algún lado?
   b) REPRODUCIENDO: apretá play. ¿Se ve el mapa mientras corre, o el panel lo
      tapa? ¿Podés seguir el AVANCE (dónde está) y la CANTIDAD (cuánto pasa) sin
      pausar? ¿Podés volver al presente en cualquier momento?
   c) Y LA PREGUNTA CLAVE: mové el scrubber a una fecha pasada. Anotá TODO antes y
      después: mapa, tabla Registros, ranking, Y CADA KPI del strip superior.
      ¿Los KPI de arriba se actualizan igual que el mapa y la tabla, o quedan
      clavados mientras lo de abajo se mueve? Si un número queda quieto y otro se
      mueve para el mismo concepto, es un problema de confianza — anotá AMBOS
      valores y la fecha del scrubber.

4. CONTEO vs PER CÁPITA: cambiá el modo del mapa. ¿El ranking cambia su orden y su
   criterio junto con el mapa, o sigue igual? ¿La leyenda deja clarísimo qué modo
   está activo? ¿El CSV refleja el modo?

5. CÓMO SE LEE EL MAPA: mirá la pestaña Referencias y la leyenda flotante. Todo
   color, trama o textura que veas EN el mapa, ¿está explicado ahí? Y al revés:
   ¿la leyenda nombra alguna marca que no aparezca en el mapa? Prestá atención
   especial a las provincias que NO tienen color: ¿se distingue "no hay datos" de
   "el dato está protegido por privacidad" de "el valor es cero"? Si las tres se
   ven igual, decilo.

6. DRILL: click en una fila del ranking y en una unidad del mapa. ¿Baja de nivel
   (provincia→comuna) y actualiza los KPI, o no pasa nada? Probá una provincia del
   continente Y el recuadro de CABA.

7. HANDOFF A LA ACCIÓN: desde un hotspot, ¿hay camino a "hacer algo" (ver casos,
   denuncias, contactar jurisdicción) o te deja mirando sin próximo paso?

════════════════════════════════════════════════════════
PARTE 2 — RESTO DEL PORTAL ADMIN
════════════════════════════════════════════════════════
Recorré por el MENÚ (no adivinando rutas) todo lo que encuentres. La raíz del
portal se llama "Briefing". Vas a ver también secciones como Programa,
Inteligencia, Observaciones, Padrón, Adopciones, colas (Aprobaciones / Bandeja de
salida / Moderación), Casos, Directorio, Sistema, Auditoría/Historial y cuentas.
Si el menú tiene algo que no está en esta lista, entrá igual — la lista es
orientativa, el menú manda.

Buscá, con la misma disciplina de reproducir:
- CONFIANZA EN EL DATO: números sin fuente ni denominador, "100%" sospechosos, n
  chico presentado como certeza, cifras enormes sin contexto.
- CONTRADICCIONES entre pantallas: el mismo dato con dos valores; un total que no
  cierra con su desglose; un KPI que no coincide con la tabla de al lado.
- CLARIDAD/COHERENCIA: etiquetas confusas, un mismo concepto ("alerta",
  "pendiente") con dos significados en pantallas distintas, semáforos sin sentido,
  controles que parecen no hacer nada, cambios de contexto inesperados (de golpe
  parecés estar en otro portal).
- FRICCIÓN: filtros que no reconocen lo que ponés, links rotos, errores en consola
  (abrí DevTools, anotá los que veas y en qué ruta).
- IDIOMA: inglés en la UI, voseo inconsistente (debe ser "revisá", no "revisa"),
  concordancia de género rota (una perra debe decir "PERDIDA", no "PERDIDO"),
  jerga sin glosario, mayúsculas raras.

════════════════════════════════════════════════════════
YA LO SABEMOS — NO LO REPORTES
════════════════════════════════════════════════════════
Esto ya está identificado y en cola. Si lo ves, ignoralo y seguí; reportarlo no
aporta y te gasta el informe:
- Falta de fotos en las tarjetas de mascotas (perdidas y adopción).
- Tokens con formato PANO-HIST-xxxxx o PANO-xxxxx en las credenciales. El formato
  real del producto es DIM-XXXX-XXXX.
- Una mascota perdida llamada "CursorPet-001", y nombres de mascota repetidos
  entre tarjetas (varias "Canela", varios "Zeus").
- Que el KPI de Mordeduras use una ventana de 12 meses fijos mientras el mapa usa
  el período elegido. La tarjeta lo rotula y es deliberado. (Que esté rotulado NO
  te impide reportar que igual confunde — pero reportalo como CLARIDAD, no como
  número mal.)

════════════════════════════════════════════════════════
CÓMO REPORTAR — esto es lo que hace la review valiosa
════════════════════════════════════════════════════════
LISTA NUMERADA, separando PARTE 1 (Panorama) y PARTE 2 (Admin). Por hallazgo:

- SEVERIDAD, y usá esta vara, que es la del funcionario:
  · ALTA  = le haría tomar una decisión equivocada, o perder la confianza en la
            pantalla y dejar de usarla. Un número que se contradice con otro, un
            control que miente sobre lo que hizo, un dato sensible expuesto.
  · MEDIA = lo confunde o lo hace más lento, pero se recupera solo.
  · BAJA  = cosmético, o molesta sin costar nada.
- PASOS EXACTOS para reproducir.
- QUÉ VISTE: el texto o el número LITERAL, antes y después del cambio.
- POR QUÉ es un problema desde tu persona de funcionario nacional.
- Una CAPTURA por cada hallazgo de severidad ALTA, con el número o el texto
  problemático visible en la imagen.
- Si dudás, marcá "A VERIFICAR" y explicá exactamente qué te quedó sin resolver.

Al final de cada parte, separá en tres grupos:
  (a) ROTO o incoherente
  (b) confuso, pero quizá intencional
  (c) lo que te GUSTÓ — decilo en serio, sirve para saber qué no tocar
Cerrá cada parte con un puntaje 1-10 y una frase.

Y al final de todo, una sección corta aparte: "LO QUE NO PUDE PROBAR" — qué
quedó fuera de tu alcance y por qué (no encontraste la entrada, no cargó, no
entendiste qué hacía). Eso vale tanto como un hallazgo.

── QUÉ NO HACER ──
No inventes vistas, rutas ni parámetros. No reportes nada que no hayas
reproducido. No asumas que un número está mal sin buscar antes si la pantalla
explica su ventana temporal o su modo.
