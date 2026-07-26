# Consolidado del portal MiMAR — bases de documentación y narrativa

> **Fecha:** 2026-07-25 · **Alcance:** 93 rutas de `/gob` y `/admin` + las 11 vistas de Panorama
> **Fuentes:** 6 revisiones con navegador real, 1 auditoría UX externa, 1 auditoría de inventario por script, y verificación en código de cada afirmación grave.
>
> **Cómo leer este documento.** Cada hallazgo lleva su estado:
>
> | Marca | Significa |
> |---|---|
> | **VERIFICADO** | Lo comprobé en el código o en pantalla. Se puede afirmar. |
> | **REPORTADO** | Un revisor lo observó y no lo verifiqué todavía. No afirmar como hecho. |
> | **DESCARTADO** | Se reportó y la verificación lo refutó. Queda escrito para que no vuelva. |
>
> Esta distinción no es burocracia. En esta misma corrida, dos hallazgos "críticos"
> no sobrevivieron la verificación, y uno de ellos —"el auditor no puede saber
> quién cambió qué"— habría sido devastador en una demo si lo repetíamos sin mirar.

---

## 1 · La narrativa: qué es MiMAR y por qué es defendible

### La frase

**MiMAR es la credencial digital de la mascota, y el instrumento que convierte esa credencial en política pública verificable.**

No es un registro. Un registro guarda datos. MiMAR **sostiene un expediente vivo por
animal** —la cadena de eventos que nunca se edita ni se borra— y de esa cadena deriva
todo lo demás: la credencial que el ciudadano muestra, el caso que el inspector
trabaja, y el mapa que el ministro mira.

### Los tres pilares que sí podemos defender frente a un funcionario

**1. La mascota es la credencial.** Un token público único, verificable por QR, que
resuelve a una página pública. El ciudadano no tramita un papel: la mascota *es* el
documento. Eso es lo que habilita la federación con Mi Argentina, que es premisa
fundacional del producto y no una integración más.

**2. Los hechos son inmutables; los cachés se declaran cachés.** Los hechos médicos y
de custodia viven solo en la bitácora append-only. Las tablas operativas que aceleran
consultas están dual-escritas **a propósito**, con límites explícitos y detección de
deriva. Ningún caché manda sobre la bitácora.

> **Por qué esto importa comercialmente:** un funcionario que firma un informe necesita
> poder decir *"este número sale de acá y nadie lo tocó"*. La mayoría de los sistemas
> de gestión no pueden decir eso. Nosotros sí — y el rastro sobrevive incluso al borrado
> de la persona que lo generó (`ON DELETE SET NULL` sobre el actor, no cascada).

**3. El sistema declara lo que NO sabe.** Es el diferencial más difícil de copiar y el
más fácil de perder. Panorama distingue cuatro naturalezas epistémicas:

| Naturaleza | Qué significa | Por qué existe |
|---|---|---|
| `measured-zero` | Medimos y dio cero | Es una buena noticia real |
| `no-signal` | No medimos nada | **No es una buena noticia** |
| `protected` | Sí hay dato, k-anonimato lo protege | Privacidad, no ceguera |
| `censored` | El dato está en el tope de medición | Un piso, no una diferencia |

Un tablero que colapsa las cuatro en "0" le dice a un ministerio que el país está bien
cuando el país no fue mirado. **"Sin señales no es lo mismo que sin problema"** es la
frase que resume el producto entero.

### Panorama: qué es y qué NO es

Panorama es un **instrumento analítico**. Sus tres verbos declarados son
**explorar, entender y exportar**. No es un escritorio de decisión y no muestra costos
ni presupuesto.

Esa restricción es deliberada y hay que saber defenderla — pero la revisión encontró
que **se está aplicando de más**, y eso tiene costo (ver §4, brecha G4).

---

## 2 · El inventario invertido: qué tenemos, dónde aparece, qué es inalcanzable

> **Por qué esta sección existe.** Una revisión pantalla por pantalla encuentra lo que
> sobra. Es estructuralmente incapaz de encontrar **lo que existe y nadie puede
> alcanzar**, porque un activo inalcanzable no se renderiza en ninguna pantalla y por
> lo tanto no aparece en ninguna captura. Este inventario arranca desde los registros.
>
> Es re-ejecutable: `pnpm exec tsx scripts/inventory-reachability.ts`

### 2.1 · Capas huérfanas — **VERIFICADO**

**Seis capas construidas, tipadas y testeadas que ninguna vista activa.** El backlog
registraba cuatro; el número real es seis.

| Capa | Etiqueta | Archivos de producción | Por qué duele |
|---|---|---|---|
| `microchip` | Penetración microchip (C1) | **195** | KPI de portada en `/gob` con obligación legal (Ley Prov. 14.107, meta 80%). La métrica está en todo el producto y **no hay forma de verla en territorio** |
| `antiparasitario` | Cobertura antiparasitaria (12m) | 17 | Cobertura sanitaria sin superficie geográfica |
| `acceso-veterinario` | Acceso veterinario (visitas/1.000) | 5 | **Es la métrica normalizada que "Desierto veterinario" debería usar** |
| `indice-territorial` | Índice territorial (0-100) | 5 | Índice compuesto sin vista |
| `refugios` | Refugios | 52 | Capacidad instalada — la contraparte de todo diagnóstico |
| `clinicas` | Clínicas veterinarias | 7 | Ídem |

> **La lectura que importa:** no tenemos escasez de ideas. Tenemos **escasez de
> cableado**. Y las dos últimas (`refugios`, `clinicas`) son exactamente la capa de
> capacidad instalada cuya ausencia convierte a "Desierto veterinario" en diagnóstico
> sin plan.

### 2.2 · Redundancia en las vistas — **VERIFICADO**

Dos ejes distintos, con remedios distintos:

**Eje A — eco del nombre propio: 1 de 11 vistas.** Solo `sintomas` tiene una capa que
se llama igual que la vista, así que el nombre aparece tres veces en cuatro renglones.

**Eje B — el encabezado se repite a sí mismo: las 11 vistas.** El caption arranca con
`{vista} — {alcance}` cuando la pantalla ya imprime "Vista · X" arriba y el alcance en
su propio selector.

> **La trampa que hay que evitar al arreglarlo:** `explainViewState` alimenta **cuatro**
> consumidores — "Copiar vista", el informe de una carilla, el embed y la pantalla. En
> los tres primeros la redundancia es **correcta**: una frase que viaja sola necesita su
> sujeto. El dedup va en el sitio de presentación, nunca en el constructor compartido.

### 2.3 · Rutas que son la misma pantalla — **REPORTADO**

Varias rutas distintas resuelven al mismo componente. No es necesariamente un defecto,
pero infla el inventario aparente y confunde al que documenta:

- `/gob/censo`, `/gob/poblacion`, `/gob/padron` → una sola página con pestañas
- `/gob/analytics` → alias en inglés de `/gob/analitica`
- `/gob/outreach` → redirige a `/gob/operativos` → igual que `/gob/campanas`
- `/gob/rupga` → pestaña Credenciales de `/gob/directorio`
- `/admin/organizaciones` y `/admin/directorio` → el mismo componente
- `/gob/vigilancia/zoonosis` → redirige a `/gob/vigilancia`, sin aviso
- `/gob/maltrato` → redirige a `/gob/denuncias?etapa=triage`

### 2.4 · Accesibilidad rota entre roles — **REPORTADO**

- `/admin/moderacion` redirige a `/gob/denuncias` y **pierde el alcance UNIVERSAL** en
  el camino; sus hermanas `/admin/casos`, `/admin/cola` y `/admin/outbox` sí lo conservan.
- `/admin/aprobaciones` devuelve 404.
- `/admin/panorama?preset=…` abierto por un usuario de gobierno redirige a `/gob`
  (no a `/gob/panorama`), **descartando vista, alcance y período**: el link entre
  organismos no sobrevive el cambio de rol.

---

## 3 · Defectos corregidos en esta corrida — **VERIFICADO Y ARREGLADO**

Los cuatro comparten una raíz que conviene nombrar: **el sistema sabía la verdad y la
pantalla decía otra cosa.**

### 3.1 · La leyenda describía al clasificador, no al dato

Mortalidad pintaba valores de **1 a 63** bajo una rampa que decía **"2 … 6"**.
`liftedBreaks` son los cortes **interiores** entre clases; leerlos como mínimo y máximo
achica el rango un orden de magnitud.

Es una superficie **exportable**: el PNG que publica un ministerio salía con un rango
falso bajo sello del Estado.

Los números correctos ya estaban en la función — `divisionLegend.min/max` son los
extremos verdaderos y la rama de fallback siempre los usó. La rama de clases los tapaba.

### 3.2 · Un plazo legal incumplido pintado en verde

`/gob/vigilancia` mostraba **7,1% de cumplimiento en verde**. El tono se calculaba a mano
y solo miraba incumplimientos **vivos**, así que sin ninguno abierto cualquier porcentaje
histórico daba luz verde — sobre un plazo legal (Ord. CABA 41.831 art. 9 / Decreto
4669/1973 PBA) que se incumplía el 92,9% de las veces.

El contrato de la métrica nunca fue ambiguo: `target: 100`,
`sourceKind: "statutory-obligation"`, `semaphore: { paintAgainst: "target" }`. **El
contrato decía pintá contra la meta; la pantalla pintaba contra nada.** La ficha hermana
del SLA de ENO ya tenía el arreglo; a ésta le faltaba el gemelo.

### 3.3 · Un control que prometía lo que no era

El glifo de dirección del delta usaba un **chevron** — el símbolo universal de
"desplegá esto". Al lado de "−26%" se leía como botón de minimizar y el PO intentó
clickearlo. Nunca fue interactivo. `/gob` ya usaba flechas `↑ ↓` para lo mismo.

Detalle incómodo: **había un test que fijaba el chevron**. Pasaba en verde clavando el
comportamiento equivocado.

### 3.4 · Números de gobierno sin separador de miles

"1507" al lado de "3.541" en el mismo panel, y `n = 67519` junto a "faltan ~29.708 chips"
en la misma oración. **Diecisiete** conteos llegaban a pantalla vía `String()`.

Sobrevivió porque **ningún fixture del proyecto cruzaba los mil** — 500, 1000, 100, 10, 3.
La cobertura estaba; el caso no.

### 3.5 · Corrección de accesibilidad que yo mismo había roto

Un pedido de copy ("matar la fuga del `sr-only` 'Normal:'") se implementó **borrando la
etiqueta**. El ícono de tono es `aria-hidden`, así que eso dejó al **color como único
portador del estado** — WCAG 1.4.1. La fuga nunca fue el texto: era el **orden**.
Ahora el estado sigue a la etiqueta.

### 3.6 · El bloqueante de la DoD, cerrado

Un test borraba `DELETE FROM pet_events WHERE event_type = 'custody_dispute_raised'` sin
acotar a lo suyo, y `custody_disputes.raising_event_id` es `ON DELETE CASCADE`. **Cada
corrida de la suite destruía toda disputa de custodia de la base.** Se encontró poniendo
un trigger sobre la ruta de la cascada, no bisecando.

---

## 4 · Los factores de administración pública que NO estamos tocando

> Esta es la sección más valiosa para vender, y la más incómoda. Son los huecos que un
> funcionario ve en la primera semana de uso real. Están agrupados por severidad
> comercial, no por esfuerzo.

### G1 · No producimos acto administrativo — **el hueco más grande**

El output máximo del sistema es un PDF o un CSV **fuera del circuito formal**. No hay:

- número de expediente ni puente al expediente electrónico (Ley 19.549, GDE/TAD)
- firma digital (Ley 25.506)
- snapshot inmutable y reproducible de lo que se firmó

**Consecuencia:** ninguna lectura del sistema se convierte en decisión con validez legal.
El funcionario mira MiMAR y después abre otro sistema para *hacer* algo. Somos un
instrumento de lectura en un mundo que necesita instrumentos de acto.

### G2 · No hay interoperabilidad con los sistemas que la ley obliga a usar

Declarado pendiente en tres pantallas distintas. Falta salida a:

- **SNVS 2.0 / SISA** — notificación obligatoria, Ley 15.465
- **SENASA**
- direcciones provinciales de zoonosis

**Consecuencia:** el brote se detecta acá y se recarga a mano allá, y nadie audita si
la recarga ocurrió.

### G3 · El denominador es nuestro padrón, no el territorio

Toda tasa se calcula sobre el padrón MiMAR (**67.519** mascotas), no sobre la población
animal estimada. El sesgo **premia a la jurisdicción que menos registra**.

Caso concreto **REPORTADO**: la columna "Impacto" de `/gob/programa` muestra ~996.765
mascotas sin chip para Buenos Aires — imposible, porque el padrón nacional entero son
67.519. Mezcla censo estimado con padrón sin declararlo.

> **Cómo se dice esto en una venta sin mentir:** *"Todo mapa nuestro es simultáneamente
> un mapa del fenómeno y un mapa de quién carga datos, y hoy no los podemos separar. Por
> eso la primera métrica que hay que mirar es la completitud del padrón."* Dicho así, es
> una fortaleza de honestidad. Dicho mal, es un producto que miente.

### G4 · Falta toda la capa de ejecución y capacidad instalada

El sistema se detiene **justo antes** de "dónde y con qué actuamos". No existe:

- operativo / jornada / quirófano móvil / agenda
- vacunatorios, dosis en stock, cadena de frío
- inspectores, veterinarios matriculados disponibles
- asignación de un caso a un agente, ni distribución de carga

**La regla de "no costos" se está aplicando de más.** Sin contraparte de capacidad,
"Desierto veterinario" es un diagnóstico sin plan — y las capas `clinicas` y `refugios`,
que serían justamente esa contraparte, **están construidas y huérfanas** (§2.1).

### G5 · No hay ciclo de vida del trámite ni rendición al ciudadano

- Ningún caso se asigna a un responsable
- El escalamiento se menciona en el copy pero no se ejecuta
- No hay doble control supervisorio sobre decomisos ni aprobaciones
- **No hay devolución al ciudadano que denunció** — ni SLA comprometido, ni notificación
- El expediente judicial es texto libre sin validación
- No existe derivación a otra jurisdicción

Evidencia **REPORTADA** de por qué esto no es teórico: una denuncia **CRÍTICA de 29
meses** en el tope de una cola sin asignar de 1.213 ítems.

### G6 · Falta gobernanza del dato

Sin métrica de "quién carga y hace cuánto", no se puede distinguir **"no pasa nada"** de
**"no cargamos nada"**. Falta:

- completitud del padrón por jurisdicción
- alerta de "esta provincia no reporta desde X"
- indicador de confianza en Panorama (el panel `/gob` **sí** lo tiene: "Confianza: baja · n = 8")

### G7 · Sin traspaso interjurisdiccional

El alcance es un **embudo** —nación → provincia → localidad— y nunca una conversación
lateral. No se puede derivar un hallazgo a la jurisdicción vecina ni ver la señal del
otro lado del límite. Los brotes no respetan límites administrativos; nuestro modelo de
alcance sí.

### G8 · El municipio no existe como identidad

**La mayor oportunidad comercial desaprovechada.** El municipio es la unidad ejecutora
real de zoonosis, bienestar y PPP, y no tiene identidad propia en el selector de alcance.

### G9 · Vacíos institucionales varios

Delegación de autoridad · acto/resolución que respalde un cambio de reglas · política de
retención y archivo · obligaciones de transparencia y datos abiertos (**Ley 27.275**) ·
convenios interjurisdiccionales · onboarding de un municipio nuevo · continuidad ante
rotación de personal.

---

## 5 · Mejoras futuras, ordenadas por apalancamiento

### Nivel 1 — máximo valor, cero bloqueos

1. **Cablear las seis capas huérfanas.** Empezando por `microchip`, que ya es KPI legal
   de portada. Máximo valor por esfuerzo: el trabajo ya está hecho y pago.
2. **Que "Desierto veterinario" use `acceso-veterinario`.** La métrica normalizada
   correcta ya existe. Hoy la vista satura y no discrimina nada. **REPORTADO:** además
   filtra solo `vet_visit_logged`, así que vacunar 10.000 perros no cuenta como
   actividad veterinaria.
3. **Indicador de completitud del padrón por jurisdicción** (G6). Es la métrica que
   vuelve honestas a todas las demás.
4. **Dedup del caption en el sitio de presentación** (§2.2), sin tocar el constructor
   compartido.

### Nivel 2 — decisión de producto primero

5. **Per cápita por defecto** en las vistas de densidad. Hoy el toggle existe y está
   apagado, y **REPORTADO**: da vuelta la historia por completo (de "Buenos Aires 189"
   a La Pampa y Patagonia). Es la mejor demostración en vivo del producto y está oculta.
6. **Que el ranking y el CSV sigan al mapa** cuando se activa per cápita. Hoy el ojo mira
   tasas y la lista ordena conteos: dos respuestas opuestas en la misma pantalla.
7. **Consolidación de vistas** — 11 → 8 propuesto.
8. **Identidad municipal en el alcance** (G8).

### Nivel 3 — bloqueado por dato o por integración

9. Puente al expediente electrónico y firma digital (G1)
10. Interoperabilidad SNVS/SISA/SENASA (G2)
11. Capa de capacidad instalada y ejecución (G4)
12. Asignación, escalamiento y devolución al ciudadano (G5)

---

## 6 · Hallazgos pendientes de verificar

> No afirmar ninguno de estos en una demo o documento comercial hasta comprobarlo.

| Hallazgo | Fuente |
|---|---|
| `asOf` se borra al cambiar de pestaña del cajón | Auditoría UX externa |
| Deep-link de CABA: KPI 52 vs badge Registros 0 | Auditoría UX externa |
| Chip de período dice "Año en curso" en 3 años y 5 años | Auditoría UX externa |
| 3 años = 5 años sin explicación *(ya documentado como bloqueado por falta de señal de evento más antiguo)* | Auditoría UX externa |
| Contradicción: 12 rábicas activas en Vigilancia vs 0 en `/admin/observaciones` | Revisión vigilancia |
| 125 señales de brote, 0 investigaciones abiertas | Revisión vigilancia |
| 0/22 crons sanos *(el propio revisor dudó de si es artefacto del demo)* | Revisión administración |
| Drill pinta conteos con rótulo "PEORES N" — Capital encabeza los peores | Revisión Panorama A |
| Detalle de caso sin próxima acción | Revisión operativa |
| Vista `sintomas` vacía en todos los alcances | Revisión Panorama A |

## 7 · Hallazgos descartados

| Se dijo | La verdad |
|---|---|
| "El auditor no puede saber quién cambió qué" | **Falso.** `audit_log.actor_user_id` es FK a `profiles` y la página resuelve los nombres. El revisor confundió el nombre del perfil demo ("Administración MiMAR") con una cuenta de servicio. `system:backfill-0039` es etiquetado honesto de un backfill donde no hubo humano |
| "`n = 67519` sin formato" | **Cierto pero vencido:** ya estaba arreglado; el revisor miraba el build anterior |
| "El período de decomisos no filtra" | **Matizado:** filtra los KPIs, no la tabla, y el código lo documenta. El defecto real no es funcional sino de honestidad: la tabla necesita decir que no responde al período |

---

## Apéndice · Reportes fuente

- `2026-07-25-portal-panorama-A.md` — vistas 1-6
- `2026-07-25-portal-panorama-B.md` — vistas 7-11 + shell
- `2026-07-25-portal-vigilancia.md`
- `2026-07-25-portal-programa.md`
- `2026-07-25-portal-operativa.md`
- `2026-07-25-portal-administracion.md`
- `scripts/inventory-reachability.ts` — auditoría de alcanzabilidad, re-ejecutable

---

## 8 · Decisiones del PO — 2026-07-25

Tomadas al cierre de la corrida. **No re-preguntar.**

| # | Decisión | Fundamento |
|---|---|---|
| 1 | **Seed: fidelidad sobre volumen.** Si el circuito real es más lento, se baja el volumen — nunca se vuelve al insert masivo para el seed de demo | Las 67.000 mascotas se eligieron para que el mapa se viera denso, no por realismo. `seed-perf` sigue insertando en bloque, marcado con procedencia |
| 2 | **Fence de integridad del spine: bloqueante desde el día uno.** Rompe `pnpm verify` si una mascota no tiene su `pet_registered`. Sin perdón para lo existente | Ya está demostrado que un aviso que no bloquea se ignora: así se acumularon 855 huérfanas y así se silenció el barrido de fitness a fuerza de reseedear |
| 3 | **La regla "Panorama sin costos" se revisa: capacidad instalada NO es presupuesto.** Clínicas, refugios y matriculados pueden mostrarse | Sin contraparte de capacidad, "Desierto veterinario" es diagnóstico sin plan. Las capas `clinicas` y `refugios` ya están construidas y huérfanas |
| 4 | **Los 10 hallazgos sin verificar se verifican antes de tocar nada** | En esta misma corrida dos hallazgos "críticos" no sobrevivieron la verificación |
