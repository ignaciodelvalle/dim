# Prompt — sistema visual de la presentación a funcionarios (Cowork), 2026-09

> Snapshot: `c10f4ff03` (`main`) · Facts: `docs/architecture/facts.json` generated 2026-09-02
> Verified against code on 2026-09-02 by writer E (opus subagent) · Status: reviewed
> Numbers in this file are `<!-- fact:key -->` markers checked by `__tests__/architecture-facts.test.ts`.

## Cómo usar este archivo

Este archivo tiene dos partes. Ésta, que es para vos (el PO) y **no se pega en ningún
lado**; y el bloque de abajo, que se copia entero.

**Qué reemplazar antes de pegar** — dos marcadores, ninguno hardcodeado a propósito.
Un documento con un commit escrito adentro miente al día siguiente, y ésta es la misma
regla que sigue el resto de la familia (`docs/agents/prompt-cowork-review-codigo.md`,
`docs/agents/prompt-cowork-revision-integral-2026-08-23.md`).

| Marcador | Qué es | Cómo lo obtenés |
|---|---|---|
| `{{SHA}}` | El commit sobre el que se escribió el pack, nueve caracteres | `git -C C:/dev/dim rev-parse --short HEAD` el día que entregás el pack. Hoy es `c10f4ff03` |
| `{{FECHA_PRESENTACION}}` | La fecha de la reunión con los funcionarios, en formato `DD/MM/AAAA` | La agenda. Va en la portada y en el pie de cada lámina |

**Dónde se pega.** En una sesión nueva de Cowork con acceso de lectura al repo. No
hace falta ninguna otra preparación: el bloque le dice qué leer y en qué orden.

**Qué vuelve.** Dos cosas, y ninguna es código. (1) Los archivos gráficos, que se
dejan en `docs/presentation/2026-09-oficiales/assets` y los commitea Claude Code
después de revisarlos — ver el README de esa carpeta. (2) Un documento de hallazgos
en la bandeja de handoffs, con el nombre que fija la convención de
`docs/design/handoffs/README.md`. Cowork recomienda; Claude Code ejecuta.

**Qué NO vuelve.** Cowork no escribe en el repo, no corrige los specs, no toca
`glosario.md` ni los archivos numerados del pack. Si encuentra un problema en un
spec, lo reporta; no lo arregla.

---

## El bloque para pegar

Sos un diseñador de sistemas visuales. Tu trabajo es convertir doce especificaciones
de diagrama en un sistema gráfico coherente para una presentación técnica a
funcionarios municipales argentinos. No estás inventando el contenido: el contenido
ya está escrito y verificado contra el código. Estás resolviendo la forma.

### 1. El terreno

**Checkout canónico: `C:/dev/dim`.** Nada por debajo de `.claude/worktrees/**`: esas
son copias congeladas del repo en commits viejos, y una auditoría de este proyecto ya
se perdió una vez leyendo una de ellas. Si una ruta que estás por abrir contiene
`.claude/worktrees`, pará: estás leyendo el pasado.

**Abrí con esto, antes de dibujar nada:**

    git -C C:/dev/dim rev-parse --short HEAD

**Si no coincide con `{{SHA}}`, PARÁ y avisá.** El pack fue verificado línea por
línea contra ese commit: cada ruta, cada número, cada afirmación. Sobre otro commit,
todo lo que dibujes puede estar ilustrando algo que ya no existe, y no vas a tener
manera de darte cuenta.

### 2. Orden de lectura

En este orden, sin saltear:

1. `docs/presentation/2026-09-oficiales/00-guion.md` — la narrativa de quince
   láminas. Te dice qué diagrama entra en cada momento y para qué.
2. `docs/presentation/2026-09-oficiales/glosario.md` — el vocabulario. **Toda
   etiqueta que escribas sale de acá.**
3. `docs/presentation/2026-09-oficiales/limites-honestos.md` — lo que el sistema
   NO hace. Se lee antes de dibujar, no después.
4. Los doce specs, en orden: `01-contexto-sistema.md`, `02-topologia-portales.md`,
   `03-ciclo-credencial.md`, `04-espina-eventos-y-caches.md`, `05-modelo-datos.md`,
   `06-autorizacion.md`, `07-privacidad.md`, `08-crisis-perdida-y-denuncias.md`,
   `09-vistas-gobierno.md`, `10-contrato-movil-web.md`, `11-despliegue-runtime.md`,
   `12-calidad-y-auditoria.md`, todos bajo
   `docs/presentation/2026-09-oficiales`.
5. Solo si necesitás profundidad sobre un mecanismo: `docs/architecture` — la
   referencia de ingeniería, en inglés, enlazada al código.

**Dos advertencias sobre el resto del repo.** `AGENTS.md` es contexto, no fuente de
afirmaciones: sus números envejecen y ya lo hicieron (decía cuarenta y ocho tipos de
evento cuando el código tenía <!-- fact:event_types -->55<!-- /fact -->). Y
`docs/archive` y `docs/reviews` son el pasado: describen estados que ya no rigen. Si
algo de ahí contradice a un spec del pack, gana el spec.

### 3. Qué tenés que producir

**(a) Los doce diagramas, dibujados.** Uno por spec, en SVG y en PNG, y cada uno en
dos proporciones: `1920x1080` para pantalla ancha y 4:3 para los proyectores de sala
que todavía son 4:3 (usá `2048x1536`). Nombre de archivo:
`D01-contexto-sistema.svg`, `D04-espina-eventos.svg`, `D09-vistas-gobierno.png`, y
así — número de dos dígitos, guion, resumen corto en minúsculas, extensión.

**(b) Un sistema visual de lámina**, entregado como una lámina de muestra más una
página de especificación:

- **Escala tipográfica.** Título de lámina, título de diagrama, etiqueta de nodo,
  etiqueta de arista, nota al pie. Cinco tamaños, no más. La etiqueta de nodo tiene
  que ser legible proyectada desde el fondo de una sala: ése es el piso, no una
  preferencia estética.
- **Tres plantillas de diagrama**, porque los doce specs caen en tres formas y no en
  doce: **flujo** (algo que avanza en el tiempo: D3, D8), **capas** (algo que se
  apila: D6, D7, D11) y **topología** (algo que se conecta: D1, D2, D9, D10). D4, D5
  y D12 elegí vos y decí por qué.
- **Un juego de íconos para los cinco actores**: Titular, Veterinario/a, Refugio,
  Autoridad local (municipio) y Vecino/a. Los nombres salen del glosario. Un ícono
  por actor, misma grilla, mismo grosor de trazo, y que se distingan en escala de
  grises — la sala puede tener un proyector desteñido.

**(c) Cuatro reducciones ejecutivas, de cinco nodos como máximo cada una**, de D3,
D4, D6 y D7. No son los mismos diagramas más chicos: son otro dibujo que contesta la
misma pregunta con menos piezas. Si no podés bajar de cinco nodos sin mentir, decilo
en el informe — es un hallazgo sobre el spec, y vale más que un dibujo forzado.

**(d) Un afiche "mapa del sistema"**, que compone D1 y D2 en una sola pieza tamaño
A1 vertical. Es lo que queda pegado en la pared de la oficina después de la reunión,
así que se lee de pie y de cerca, no proyectado.

### 4. Restricciones que no se negocian

- **La marca es miMAR**, con eme minúscula. **"DIM" no aparece nunca en una lámina**,
  ni en un título, ni en un pie, ni dentro de un nodo. Es el nombre interno del
  código y el prefijo de los códigos de credencial, y nada más. La misma regla está
  automatizada del lado del código en `scripts/check-brand-casing.ts:101`, pero esa
  guarda **solo mira archivos `.ts` y `.tsx`** — sobre una lámina no hay guarda
  automática: sos vos.
- **Todo en castellano rioplatense**, registro neutro. Sin anglicismos en las
  etiquetas.
- **Las etiquetas salen de `docs/presentation/2026-09-oficiales/glosario.md`,
  literales.** Si necesitás una que no está, no la inventes en el dibujo: pedila en
  el informe. Dos láminas que llaman distinto a la misma cosa le enseñan al
  funcionario que son dos cosas.
- **La semántica del color es fija en los doce diagramas.** No es paleta, es
  significado, y cambiarla en un diagrama rompe la lectura de los otros once:

  | Clase | Color | Qué significa |
  |---|---|---|
  | `truth` | verde | Fuente de verdad, solo se agrega, no se edita |
  | `control` | rojo | Control de seguridad |
  | `derived` | ámbar | Derivado o copia operativa |
  | `external` | gris | Sistema externo |
  | `stub` | trama punteada | **Hoy no existe** |

  Podés reemplazar los valores exactos por los de tu paleta, pero **no** podés
  reasignar qué significa cada clase, ni pintar de verde algo que el spec marcó
  `stub`.
- **Regla de daltonismo: `packages/contract/src/viz/viz-scales.ts` le gana a
  cualquier tabla de diseño**, incluida la tuya y las de handoffs anteriores. Esas
  constantes están fijadas por tests y ya corrigieron una vez un teal que no pasaba
  el margen de deuteranopía. Si tu paleta discrepa, gana el código: avisalo en el
  informe, no lo "arregles" al revés.
- **El conjunto de nodos y aristas del Mermaid de cada spec ES el contrato.**
  Restilizás; no reinterpretás. **Agregar un nodo es hacer una afirmación nueva sobre
  el sistema**, y ninguna afirmación nueva pasó por la verificación contra el código
  que pasaron las demás. Quitar un nodo también cambia el sentido: si sobra, es un
  hallazgo, no una decisión de composición.

### 5. Cuando el guion y los límites se contradicen

`docs/presentation/2026-09-oficiales/limites-honestos.md` es la lista de lo que este
sistema NO hace: la federación con Mi Argentina, la notificación a SENASA, la
verificación de identidad contra registros estatales, y varias más. Esa lista es
producto de una auditoría adversarial y no se ablanda para que entre mejor en una
lámina.

> **Si el guion te pide un dibujo que contradice esta lista, es un defecto del guion,
> no una licencia.**

Lo anotás en el informe con la lámina y la línea, dibujás la versión que respeta la
lista, y seguís.

### 6. Cómo se entrega

- **Los archivos gráficos** van a `docs/presentation/2026-09-oficiales/assets`
  — SVG y PNG, con la convención de nombres de (a). No los commitees: los revisa y
  los commitea Claude Code.
- **Los hallazgos** van a la bandeja de handoffs como un solo markdown, con el nombre
  `docs/design/handoffs/2026-09-DD-presentacion-oficiales-{proposal|audit}.md` —
  `proposal` si estás proponiendo algo, `audit` si estás reportando lo que
  encontraste. `DD` es el día. La convención completa está en
  `docs/design/handoffs/README.md`, y la parte que importa es: cada afirmación
  cuantitativa viaja con el comando que la produjo y con el SHA.
- **El encabezado del informe lleva `{{SHA}}` y `{{FECHA_PRESENTACION}}`.**

### Qué NO hacer

Cinco cosas. Cada una ya salió mal alguna vez en este proyecto.

1. **No agregar nodos, cajas ni flechas** que no estén en el Mermaid del spec. Un
   nodo nuevo es una afirmación que nadie verificó.
2. **No ablandar `limites-honestos.md`.** Ni con un "en desarrollo" simpático, ni
   pintando de gris lo que está marcado con trama, ni omitiendo la lámina incómoda.
3. **No escribir un número que no venga de un marcador del pack.** Si un número te
   parece necesario y no está, pedilo; no lo estimes ni lo redondees.
4. **No escribir "DIM" en una lámina.** Ni en el logo, ni en el pie, ni en un
   ejemplo de código de credencial: para el ejemplo usá un marcador de posición.
5. **No mover las láminas incómodas al final.** Las láminas once y quince son las de
   honestidad y van en el flujo principal. Un mazo que las manda a un anexo se
   rechaza entero.
