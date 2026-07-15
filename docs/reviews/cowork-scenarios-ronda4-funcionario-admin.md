# Cowork QA — Ronda 4 · "El funcionario curioso" (admin primero)

> Para la próxima sesión de Cowork (tester externo, Claude in Chrome). Entorno: el server local
> que indique el PO (default `http://localhost:3000`, levantado con `scripts/qa-up.ps1`). Datos
> 100% sintéticos de demostración; la base es local y descartable — **podés mutar** (aprobar,
> derivar, anotar), pero registrá todo lo que cambiaste. Se pasan MISIONES, no pasos: vos decidís
> CÓMO resolver cada una. Cubre lo nuevo del batch 2026-07-15: cockpit de admin (Épica D),
> panorama pulido (Épica C) y datos abiertos (Épica B).

## Tu personaje

Sos un **funcionario municipal curioso**, sin formación técnica, con acceso de operador al
sistema. No viniste a "probar software": viniste a **resolver los problemas que te caen en el
escritorio**, y el sistema es tu herramienta. Sos curioso — cuando algo te llama la atención,
lo abrís y mirás qué es — pero tenés la paciencia de una persona real: si algo te hace dar más
de dos vueltas, lo anotás como fricción y seguís. Tu vara para TODO es doble:

1. **¿Resolví MI problema?** (no "¿funciona el botón?")
2. **¿Entendí QUÉ estaba viendo y de DÓNDE salen los números?** (si dudaste, es hallazgo)

Hablás y anotás en castellano rioplatense. Trabajá en viewport desktop, salvo donde se indique
celular (390px).

## Credenciales

Contraseña única: `Test1234!`

| Cuenta | Rol | Cuándo usarla |
|---|---|---|
| `admin@dim.test` | Operador nacional (admin) | Actos 1 a 4 |
| `lucas@dim.test` | Funcionario con 5 jurisdicciones | Acto 5 (el corralito) |
| — sin login — | Ciudadano / periodista | Acto 6 |

---

## ACTO 1 — Lunes a la mañana (`/admin`, cuenta `admin@dim.test`)

Acabás de llegar a la oficina con el mate. Entrás al panel.

- **1a · ¿Qué tengo pendiente HOY?** Sin abrir ninguna sección todavía: mirando solo la pantalla
  de inicio, decí en voz alta qué trabajo pendiente tenés, cuánto de cada tipo, y cuál atacarías
  primero. Si algún número no te dice nada, o dos números parecen contarte lo mismo distinto, es
  hallazgo. *(estresa: cockpit de colas nuevo — pendientes POR TIPO)*
- **1b · Resolvé UNO de punta a punta.** Elegí el pendiente más urgente según el panel y
  resolvelo completo (aprobá, verificá, derivá — lo que corresponda). ¿El panel te llevó hasta la
  acción o te soltó la mano a mitad de camino? Al volver al inicio, ¿el número bajó?
- **1c · ¿Qué pasó mientras no estaba?** Encontrá las novedades del sistema desde tu última
  sesión. Después escondelas: ¿podés sacarlas del medio cuando ya las leíste? ¿Vuelven solas?
- **1d · La oficina nueva.** Sos curioso: usando el mapa del sitio, encontrá y visitá una pantalla
  de admin en la que NUNCA estuviste en esta sesión. ¿El mapa te dijo qué ibas a encontrar antes
  de hacer click, o entraste a ciegas?

## ACTO 2 — Suena el teléfono (siguen los problemas reales)

- **2a · La veterinaria de La Plata.** Te llama una veterinaria: mandó su solicitud para
  habilitarse y no sabe en qué estado está. Encontrá su caso, resolvelo, y decí qué le
  responderías por teléfono. *(¿la cola correcta era obvia desde el cockpit?)*
- **2b · La denuncia de maltrato.** Entró una denuncia de maltrato con una mascota identificada.
  Encontrala, mirá qué evidencia tiene, y hacé lo que un funcionario haría (tomarla, derivarla a
  la autoridad que corresponde — vos decidís). ¿En algún momento dudaste de si estabas viendo
  datos privados que no deberías?
- **2c · El vecino del perro perdido.** Un vecino te llama: se le perdió el perro en Palermo y
  "alguien le dijo que hay un sistema". ¿Qué le decís que haga, paso a paso, SIN mirar
  documentación — solo lo que el sistema te muestra? Después verificá vos mismo del lado admin
  qué se ve de un caso de mascota perdida activo.

## ACTO 3 — El informe del ministro (`/gob/panorama`)

Tu jefe necesita para HOY: *"¿cómo está la cobertura antirrábica en Buenos Aires versus Córdoba,
dónde está peor, y mandame los datos"*.

- **3a · El número con nombre y apellido.** Conseguí los dos números. En cada momento, ¿pudiste
  decir sin dudar QUÉ métrica estabas viendo, de QUÉ territorio y de QUÉ período? Si en algún
  paso el mapa, el rótulo y los números no contaron lo mismo, es hallazgo CRÍTICO — anotá exacto
  qué viste. *(estresa: caption strip nuevo + coherencia rótulo↔mapa↔métrica)*
- **3b · Estadísticas sin ensalada.** Abrí el panel de Estadísticas. ¿Cada dashboard tiene su
  espacio propio y se distingue del resto? ¿Podés esconder los que no te sirven para ESTE
  informe? *(estresa: secciones colapsables nuevas)*
- **3c · Sacá los datos.** Exportá lo que necesitás para el informe. Regla de la misión: TODO
  export debería salir de UN solo lugar. Si encontraste botones de export desperdigados en otros
  rincones, anotá dónde. *(estresa: export hub consolidado)*
- **3d · El brote.** Activá la capa de brotes activos. ¿Los puntos se ven POR ENCIMA del color de
  fondo del mapa apenas la encendés, o hay que tocar algo para que aparezcan? ¿La vista default
  se entiende sola? *(regresión vigilada: z-order de brotes)*
- **3e · La localidad chiquita.** Tratá de averiguar cuántos casos hay en una localidad muy chica
  y despoblada. El sistema debería protegerla (suprimir el dato), no exponerla. Contá qué pasó.

## ACTO 4 — Curiosidad libre (15 minutos)

Sin misión. Sos el funcionario curioso: pasealo como quieras, tocá lo que te llame la atención,
seguí tu olfato. Anotá cualquier cosa que te confunda, te sorprenda (bien o mal) o te deje en un
callejón sin salida. Las perlas de esta sección suelen ser las mejores de la ronda.

## ACTO 5 — El corralito (`lucas@dim.test`)

Cerrá sesión y entrá como Lucas, funcionario con solo 5 jurisdicciones asignadas.

- **5a ·** ¿El sistema te dice claramente CUÁLES son tus jurisdicciones, o lo tenés que adivinar?
- **5b ·** Tratá activamente de espiar datos de una provincia que NO es tuya (por el mapa, por la
  URL, por donde se te ocurra). Debería ser imposible. Si viste algo, hallazgo CRÍTICO con pasos
  exactos.

## ACTO 6 — El periodista (sin login, y en celular 390px)

Un periodista te pide "los datos crudos del sistema" y un vecino te pregunta "qué es eso del QR".

- **6a ·** Cerrá sesión. ¿A dónde lo mandás al periodista? Descargá vos mismo un dataset en CSV,
  y decí si entendiste: qué contiene, cada cuánto se actualiza, con qué licencia lo puede
  republicar, y por qué algunas filas podrían faltar. Todo eso debería estar explicado en
  castellano llano. *(estresa: /transparencia + diccionario + metodología)*
- **6b ·** Abrí la credencial pública `/p/DIM-PAMP-0001` como lo haría un vecino que escaneó un
  QR en la calle: en el celular. ¿Se entiende qué es, qué NO muestra (privacidad), y qué hacer si
  la mascota estuviera perdida?

---

## Formato del informe (entregalo así)

1. **TL;DR** — ¿un funcionario real puede trabajar con esto? Veredicto en 3 líneas.
2. **Hallazgos priorizados** — `BLOQUEA / ALTO / MEDIO / BAJO / IDEA`. Cada uno con: pantalla,
   qué esperabas, qué viste, pasos para reproducir, y captura si aplica.
3. **Consistencia** (sección fija): todo momento donde dos partes de la pantalla contaron
   historias distintas (rótulo vs mapa vs número, contador vs lista, inicio vs detalle).
4. **Lo que funciona muy bien** — también lo bueno, para no romperlo después.
5. **Anexo** — qué actos cubriste, qué quedó sin cubrir y por qué, y qué datos mutaste.

El PO guarda el informe como `docs/reviews/2026-07-XX-cowork-qa-ronda4-funcionario-admin.md`.
