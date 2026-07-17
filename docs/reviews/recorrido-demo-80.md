# Recorrido demo — el 80% que importa

> **Para Cowork y Cursor.** Corren el MISMO recorrido, cada uno en su puerto, y después
> comparamos. Lo que buscamos no es "¿anda?" — es **¿los dos vieron lo mismo?**
>
> · **Cowork** → `http://localhost:3000` · **Cursor** → `http://localhost:3001`
> · Contraseña única: `Test1234!`
> · Base recién reconstruida: 66.729 mascotas · 3.017 denuncias · 836 casos · 12 organizaciones

## Por qué este recorrido y no otro

Cubre las seis superficies que sostienen el producto: la **credencial pública** (el invariante
"la mascota es la credencial"), el **panorama** (la vista que se le muestra a un funcionario),
el **ciclo del refugio** (ingreso → adopción → transferencia, el cambio de responsable legal),
el **trabajo del operador** (colas, denuncias, alertas), la **transparencia** (datos abiertos), y
el **alta ciudadana**.

Deliberadamente **afuera**, por bajo valor demostrativo: decomisos, tránsitos/foster, registro PPP,
mordeduras desde organización, disputas de custodia, y todo `/admin/sistema` salvo un vistazo.
No son menos importantes en producción — son menos convincentes en una demo de 40 minutos.

---

## Reglas para los dos

1. **Click real.** Si no lo clickeaste, no lo reportes. Adivinar una URL y encontrar un 404 es un
   hallazgo tuyo, no del sistema.
2. **Verificá antes de reportar.** Si algo parece una fuga de permisos o un bug grave, comprobalo
   primero. Un hallazgo falso quema más tiempo que uno que falta.
3. **Anotá el número exacto** que ves en pantalla cuando el acto lo pida. La comparación entre
   ustedes dos se hace sobre números, no sobre impresiones.
4. **Castellano rioplatense.** Cualquier palabra en inglés en pantalla es hallazgo.

---

## ACTO 1 · El vecino en la calle (sin sesión, celular 390px)

Escaneaste un QR en una chapita.

- Abrí `/p/DIM-PAMP-0001`. ¿Entendés en 10 segundos qué es esto, qué **no** muestra y por qué, y
  qué hacer ahora?
- **Anotá:** el estado de la credencial, y qué dice el bloque de vacunación.
- Entrá a `/perdidas` sin sesión. ¿La lista se entiende? Abrí una. ¿El camino para avisar es obvio?

## ACTO 2 · El ministro pide un informe (`lucas@dim.test` → `/gob/panorama`)

Lucas ahora coordina la **región Este**: CABA, Buenos Aires, Santa Fe, Entre Ríos, Corrientes,
Misiones, Chaco y Formosa — 1.775 localidades.

- **2a.** Abrí `/gob/panorama` **sin tocar nada**. Debería abrir en la vista de **riesgo
  combinado (bivariado)**. **Anotá:** ¿abrió en bivariado? ¿cuánto tardó en pintar? ¿el mapa
  muestra datos o está en blanco?
- **2b.** ¿La etiqueta de alcance dice cuántas jurisdicciones tenés, o dice una provincia a secas?
- **2c.** El bivariado cruza **cobertura × zoonosis**. ¿La leyenda te explica qué significa cada
  color, o tenés que adivinar? ¿Podés decir en voz alta qué zona está peor y por qué?
- **2d.** Hacé zoom hasta departamentos. **Anotá el número que muestra el popup fijo.** ¿Tiene `%`?
  ¿Y el panel lateral dice lo mismo que el popup? **Si difieren, es CRÍTICO.**
- **2e.** Mirá el pie de la vista. ¿Qué período declara? ¿Coincide con lo que dice la métrica?
- **2f.** Exportá algo. ¿Salió?

## ACTO 3 · El funcionario trabaja (`lucas@dim.test`)

- **3a.** `/gob/vigilancia/investigaciones`. **Anotá el texto del motivo** de la primera. ¿Está en
  castellano llano o parece un código interno?
- **3b.** `/gob/maltrato`. Abrí una denuncia. ¿Podés decir qué pasó, dónde, y qué ley aplica?
- **3c.** `/gob/programa`. ¿Los números dicen **qué** miden y **sobre qué** denominador?
- **3d.** Intentá espiar una provincia que NO es tuya (Mendoza, Neuquén) por la URL. Debería ser
  imposible.

## ACTO 4 · La oficina nacional (`admin@dim.test` → `/admin`)

- **4a.** Sin abrir nada: ¿qué trabajo pendiente tenés y cuál atacás primero?
- **4b.** Abrí un caso desde `/admin/casos`. **¿Seguís dentro del portal de operador**, o
  aparecieron "Adoptar / Refugios / Volver a mi app"? *(regresión vigilada)*
- **4c.** `/admin/alertas`: reconocé y resolvé una. **¿La fila cambia sola o tenés que recargar?**
- **4d.** Pegá `DIM-PAMP-0001` en el buscador global. **Anotá la respuesta exacta.** ¿Te explica
  por qué, o te deja pensando que el sistema está roto?
- **4e.** `/admin/observaciones`: cerrá una profesionalmente. ¿Te confirma que pasó?

## ACTO 5 · El refugio (`alejo@dim.test` → Refugio Patitas del Norte)

Este acto es **el que más nos importa**: es el cambio de responsable legal.

- **5a.** Registrá un ingreso de un animal sin dueño (prefijo `QA7-`).
- **5b.** Marcalo **apto para adopción**. *(regresión vigilada: antes fallaba diciendo que no
  estaba bajo tu custodia)*
- **5c.** **Publicalo** en adopción. *(regresión vigilada: el paso siguiente, que también fallaba)*
- **5d.** Miralo en `/adoptar` sin sesión. ¿Aparece? ¿Da ganas?
- **5e.** Finalizá una adopción a una persona. ¿Las dos partes entienden en qué estado quedó?
- **5f.** Abrí su credencial pública. **¿Dice el dueño nuevo?**

## ACTO 6 · La dueña y la veterinaria

- **6a.** (`carla@dim.test`, celular 390px) Registrá una mascota. ¿Entendés qué es el QR y qué
  hacer con él?
- **6b.** Reportala perdida. Abrí su credencial sin sesión: ¿se enteró? Marcala encontrada:
  ¿volvió atrás?
- **6c.** (`lilian@dim.test`) Cargale la antirrábica. **Contá los clicks.** ¿La dueña se entera?
- **6d.** ¿La credencial pública muestra **cuál** vacuna y su vigencia, o solo que "hay registros"?

## ACTO 7 · El periodista (sin sesión)

- `/transparencia`: bajate un CSV. ¿Entendés qué trae, cada cuánto se actualiza, con qué licencia
  se republica, y por qué podrían faltar filas?

---

## Lo que comparamos después (la parte que importa)

Cada uno entrega:

1. **TL;DR** — ¿un funcionario puede trabajar con esto? ¿Le mostrarías esta pantalla a un
   ministro? Tres líneas.
2. **Tabla de números anotados** — actos 1, 2a, 2d, 4d. **Acá se compara Cowork contra Cursor.**
   Si los dos vieron números distintos en la misma pantalla, eso es lo más grave que puede salir
   de esta ronda.
3. **Hallazgos** — `BLOQUEA / ALTO / MEDIO / BAJO / IDEA`, con pantalla, qué esperabas, qué viste,
   pasos.
4. **Consistencia** — todo momento donde dos partes contaron historias distintas: rótulo vs mapa
   vs número, popup vs panel, público vs operador, contador vs lista.
5. **Callejones sin salida** — qué no pudiste terminar y dónde te quedaste.
6. **Anexo** — qué mutaste, con tokens.

Cowork → `docs/reviews/2026-07-XX-cowork-recorrido80.md`
Cursor → `docs/reviews/2026-07-XX-cursor-recorrido80.md`

## Aviso honesto sobre el entorno

Hay **3 mascotas publicadas en adopción**. La galería `/adoptar` va a verse flaca — es límite de
la semilla, no un bug. Reportenlo como fricción de demo si les molesta, pero no lo persigan como
defecto.
