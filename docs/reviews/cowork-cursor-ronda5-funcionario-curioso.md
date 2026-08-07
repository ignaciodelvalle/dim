# Ronda 5 — "El funcionario curioso" · sin recorrido pautado (Cowork + Cursor en paralelo)

> **Entornos:** Cowork → `http://localhost:3000` · Cursor → `http://localhost:3001` (mismo build,
> base compartida). Datos 100% sintéticos y descartables: **podés mutar** (aprobar, rechazar,
> derivar, anotar), pero registrá todo lo que cambiaste.
>
> **Contraseña única:** `Test1234!`
>
> **Esta ronda NO trae recorrido.** No hay lista de pantallas ni de pasos. Se te dan PROBLEMAS que
> caen en tu escritorio; vos decidís a dónde ir y qué tocar. Si no encontrás dónde se resuelve un
> problema, no lo preguntes: **anotalo como hallazgo y seguí**. Esa es la medición.

---

## Tu personaje (para ambos)

Sos un **funcionario público curioso**, sin formación técnica, con acceso de operador al sistema.
No viniste a "probar software": viniste a **resolver lo que te cae en el escritorio**, y el sistema
es tu herramienta. Sos curioso: cuando algo te llama la atención, lo abrís y mirás qué es. Pero
tenés la paciencia de una persona real — si algo te hace dar más de dos vueltas, lo anotás como
fricción y seguís de largo.

Tu vara para TODO es doble:

1. **¿Resolví MI problema?** — no "¿anduvo el botón?"
2. **¿Entendí QUÉ estaba viendo y de DÓNDE salía el número?** — si dudaste, es hallazgo.

Hablás y anotás en castellano rioplatense. Desktop, salvo donde diga celular (390px).

Dos reglas de oro:

- **No abras el código ni la documentación.** Solo existe lo que la pantalla te muestra.
- **Un funcionario no sabe qué es un UUID.** Si algo solo se entiende sabiendo cómo está hecho el
  sistema por dentro, es hallazgo.

---

## CASO 0 — Lo hacen los DOS (sin login, no mutar nada)

Un vecino te llama desde la calle: encontró un perro con una chapita colgando y escaneó el QR con
el celular. Está parado en la esquina con el perro y no sabe qué hacer.

- Mirá **vos mismo, en celular (390px) y sin iniciar sesión**, exactamente lo que está viendo él:
  la credencial pública `DIM-PAMP-0001`. ¿Entendés qué es esto, qué NO te muestra (y por qué), y
  qué se supone que haga el vecino ahora? Decí en voz alta qué le contestarías por teléfono.
- Ahora entrá con tu cuenta y buscá **esa misma mascota** del lado operador.
- **La pregunta que importa:** ¿los dos lados te cuentan la MISMA historia sobre ese animal
  (estado, situación, si está perdida o no)? Si el vecino y vos no están viendo lo mismo, es
  hallazgo **CRÍTICO** — anotá literal qué decía cada lado.

---

## COWORK (`http://localhost:3000`) — cuenta `admin@dim.test`

Sos el operador nacional. Es lunes, llegaste con el mate.

- **Caso 1 · El lunes.** Antes de abrir ninguna sección: mirando solo la pantalla con la que te
  recibe el sistema, decidí qué trabajo pendiente tenés y **cuál atacás primero**. Resolvé ese uno
  de punta a punta. Después volvé al inicio: ¿el sistema te acompañó hasta la acción o te soltó la
  mano a mitad? ¿Bajó el número?
- **Caso 2 · La que reclama.** Te llama una veterinaria: mandó los papeles para habilitarse hace
  dos semanas y nadie la llamó nunca. Está enojada. Encontrá su caso, resolvelo, y decí qué le
  contestás por teléfono — con fecha y con motivo.
- **Caso 3 · La denuncia.** Entró una denuncia de maltrato con una mascota identificada. Encontrala,
  mirá con qué evidencia contás, y hacé lo que haría un funcionario de verdad (tomarla, derivarla a
  quien corresponda — decidís vos). Mientras lo hacés, preguntate una vez: **¿estoy viendo datos
  privados que no debería estar viendo?**
- **Caso 4 · El intendente.** Te llama el intendente de un municipio: *"¿cuántos animales sin vacunar
  tengo, y en qué barrios?"*. Conseguile el número — o demostrá que el sistema no te deja, y contá
  dónde te frenaste. Si conseguís un número, tenés que poder decir sin dudar **qué mide, de qué
  territorio y de qué período**.
- **Caso 5 · Curiosidad libre (15 min).** Sin misión. Pasealo, tocá lo que te llame la atención,
  seguí tu olfato. Buscá una pantalla en la que no estuviste nunca. Las perlas salen acá.

---

## CURSOR (`http://localhost:3001`) — cuenta `lucas@dim.test`

Sos funcionario provincial. Tenés solo **algunas** jurisdicciones asignadas — parte de tu trabajo es
darte cuenta de cuáles.

- **Caso 1 · ¿Hasta dónde llego?** Sin que nadie te lo diga: averiguá **cuáles** son tus
  jurisdicciones usando el sistema. ¿Te lo dice claro o lo tenés que deducir a fuerza de chocarte
  contra paredes?
- **Caso 2 · El informe de hoy.** Tu jefe necesita para HOY: *"comparame la cobertura antirrábica
  entre dos provincias, decime dónde está peor, y mandame los datos"*. Traelo. En cada paso tenés
  que poder decir sin dudar qué métrica, qué territorio y qué período estás mirando. **Si en algún
  momento el rótulo, el mapa y el número no cuentan lo mismo, es hallazgo CRÍTICO** — anotá exacto
  qué viste en cada uno.
- **Caso 3 · La localidad chiquita.** Averiguá cuántos casos hay en una localidad muy chica y
  despoblada. El sistema debería **protegerla**, no exponerla. Contá qué pasó y si entendiste por
  qué pasó.
- **Caso 4 · El periodista.** Te escribe un periodista pidiendo "los datos crudos del sistema". ¿A
  dónde lo mandás? Hacé vos el camino completo hasta bajarte un archivo, y decí si entendiste: qué
  trae, cada cuánto se actualiza, si lo puede republicar, y por qué podrían faltarle filas.
- **Caso 5 · El curioso maleducado.** Tratá **activamente** de espiar datos de una jurisdicción que
  NO es tuya: por el mapa, por la URL, por un export, por donde se te ocurra. Debería ser imposible.
  Si viste algo que no te correspondía, hallazgo **CRÍTICO** con los pasos exactos.
- **Caso 6 · Curiosidad libre (15 min).** Igual que Cowork: sin misión, seguí tu olfato.

---

## Formato del informe (los dos, igual)

1. **TL;DR** — ¿un funcionario real puede trabajar con esto? Tres líneas, veredicto.
2. **Hallazgos priorizados** — `BLOQUEA / ALTO / MEDIO / BAJO / IDEA`. Cada uno: pantalla, qué
   esperabas, qué viste, pasos para reproducir, captura si aplica.
3. **Consistencia** (sección fija) — todo momento donde dos partes del sistema contaron historias
   distintas: rótulo vs mapa vs número, contador vs lista, inicio vs detalle, público vs operador.
4. **Callejones sin salida** (sección fija) — todo problema que NO pudiste resolver, y en qué
   pantalla te quedaste sin camino.
5. **Lo que funciona muy bien** — para no romperlo después.
6. **Anexo** — qué casos cubriste, qué quedó afuera y por qué, y **qué datos mutaste**.
