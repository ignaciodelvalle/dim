# Prompt — el mazo de láminas para la reunión con funcionarios (Cowork), 15/09/2026

> Para vos (el PO): copiá entero el bloque de abajo, desde "El bloque para pegar", en una sesión
> nueva de Cowork con acceso de lectura al repo. Reemplaza, para esta reunión, al prompt de
> `README.md` (ese pide trece diagramas, reducciones y un afiche: es trabajo de días, y es anterior
> al discurso, a las capturas y a las correcciones del 14/09).
> Snapshot del pack: `5de93e385` (`main`).

---

## El bloque para pegar

Sos diseñador de presentaciones. Tenés que armar **el mazo de láminas para una reunión de una hora
con funcionarios argentinos, que es mañana 15/09/2026**. El contenido ya está escrito y verificado
contra el sistema: no inventás nada, resolvés la forma. El público **ya conoce el problema**; la
reunión es sobre la solución.

### 1. El terreno

Checkout canónico: `C:/dev/dim`. Nada por debajo de `.claude/worktrees/**` (son copias viejas).
Antes de empezar corré `git -C C:/dev/dim rev-parse --short HEAD`. Si el resultado no empieza con
`5de93e385` o un commit posterior de `main`, avisá antes de seguir.

### 2. Qué leer, en este orden

1. `docs/presentation/2026-09-oficiales/16-discurso.md` — **la columna vertebral del mazo.** Doce
   secciones con reloj, el texto que se dice en voz alta, las marcas `[MOSTRAR: …]` (qué captura o
   qué demo va en cada momento) y las preguntas preparadas. **El orden y la duración de las láminas
   salen de acá.**
2. `docs/presentation/2026-09-oficiales/glosario.md` — toda etiqueta que escribas sale de acá.
3. `docs/presentation/2026-09-oficiales/limites-honestos.md` — lo que el sistema NO hace.
4. `docs/presentation/2026-09-oficiales/14-lo-que-necesitamos.md` — el pedido al Estado (la lámina
   de cierre).
5. Solo si una lámina necesita un esquema: el spec numerado correspondiente (`01-…` a `13-…`) y su
   bloque Mermaid. No lo leas entero si no vas a dibujarlo.

`00-guion.md` y `15-runbook-demo.md` son contexto, pero **tienen datos anteriores al 14/09**. Donde
contradigan al discurso o a la sección 4 de este bloque, ganan el discurso y la sección 4.

### 3. Qué producir

**(a) El mazo**, entre 16 y 20 láminas, en `16:9`, entregado como **PPTX** y como **PDF**:

- Una lámina por sección del discurso, y dos cuando la sección tiene demo (una para la pantalla y
  otra para el mensaje). Portada con título, "Ministerio / Municipio" genérico (no inventes
  organismos) y la fecha 15/09/2026. Última lámina: "Lo que necesitamos".
- **Cada lámina lleva en las notas del orador el texto de su sección del discurso**, literal.
- Poco texto en pantalla: un título que sea el mensaje (una oración) y, como mucho, tres líneas o
  una captura. La lámina acompaña lo que se dice; no lo repite.
- Las capturas van **tal cual**, sin recortar la franja "ENTORNO DE DEMOSTRACIÓN — DATOS SINTÉTICOS"
  cuando la tengan. Podés enmarcarlas (marco de navegador o de teléfono) y agregar una flecha o un
  resaltado sobre lo que se está diciendo, nada más.

**(b) Como máximo dos esquemas simples**, solo si una lámina los pide y no hay captura que la
cubra (candidatas: "cada actor desde su lugar" y "quién puede hacer qué"). Cinco nodos como máximo,
sacados del Mermaid del spec correspondiente: **no agregues nodos ni flechas** que no estén ahí.

**(c) Un informe corto** (qué láminas armaste, qué captura usaste en cada una, y cualquier
contradicción que hayas encontrado entre las fuentes).

### 4. Correcciones del 14/09 — mandan sobre cualquier texto anterior

- **Las reglas de cumplimiento las carga la administración nacional.** Una cuenta de gobierno las
  ve en modo lectura. No escribas que el municipio las configura.
- **La única obligación cargada es la antirrábica** (Ley Nacional 22.953; en CABA además Ord. 41.831).
  **Microchip y esterilización no son obligatorios**: la investigación normativa (en revisión legal)
  no encontró norma argentina que obligue al microchip, y las leyes provinciales de esterilización
  obligan al Estado, no al dueño.
- **La frecuencia "cada 12 meses" se muestra pero todavía no calcula el vencimiento.** No dibujes ni
  escribas que el sistema vence la vacuna a partir de la regla.
- **Los datos son sintéticos** (casi la totalidad de los animales). Cualquier lámina con números lo
  dice en el pie.
- **Un solo ambiente, de ensayo.** Sin producción separada.
- **Mi Argentina no está integrada**: es la premisa del diseño y el primer pedido. RENAPER no está
  integrado (el DNI es autodeclarado y se guarda protegido). SENASA: se exporta, no se notifica, el
  formato no está homologado. Las notificaciones ENO se registran y **no salen del sistema**.
- **La app Android está en prueba interna con un grupo de testers.** Sin número de testers ni fecha
  de tienda en ninguna lámina.
- **No uses** `09-app-pampa-libreta-dorso-OJO-sin-aplicar.png` ni `06-gob-panorama-caba.jpg` (la
  primera se contradice, la segunda tiene el mapa vacío). **No** hay capturas de adopciones a
  propósito: no las pidas ni las simules.

### 5. Material gráfico

**Capturas** — `docs/presentation/2026-09-oficiales/assets/capturas/`:

| Sección del discurso | Captura |
|---|---|
| 2 · La credencial | `02-credencial-publica-pampa-web.jpg`, `03-vecino-escanea-pampa-celular-1.jpg` |
| 3 · Cada actor | `14-app-pampa-credencial-frente.png` (titular), `04b-veterinaria-panel-matricula-verificada.jpg`, `04c-veterinaria-atender-pampa.jpg`, `04d-refugio-panel.jpg` |
| 4 · El municipio e indicadores | `05-gob-briefing-caba.jpg` |
| 5 · Cumplimiento | `cumplimiento-gob-reglas-2-antirrabica.jpg`, `cumplimiento-app-pampa-al-dia.png` |
| 6 · Extravío y denuncias | `07-mascotas-perdidas.jpg`, `08-gob-denuncias-triage.jpg` |
| 7 · Vigilancia | `16-gob-vigilancia.jpg` |
| 8 · Privacidad | `11-privacidad-credencial-sin-contacto-celular.jpg` |
| Portada o apertura | `01-landing.jpg` |

**Marca:**

- Logo (isotipo, vectorial): `public/logo-mimar-mark.svg`. No hay archivo con la palabra: escribí
  **miMAR** (eme minúscula) en IBM Plex Serif al lado del isotipo.
- Ícono de la app: `public/icons/icon-512.png`. Foto de Pampa: `public/landing/pampa-hero.jpg`.
- Paleta (`packages/contract/src/tokens/ln-tokens.ts`): azul institucional `#0e5a99` (oscuro
  `#0a3556`), celeste `#4e97d1` (suave `#dcebf7`), texto `#1b2a33`, secundario `#616e77`, fondo papel
  `#fbfaf5`, líneas `#e4dfd3`, alerta `#a23a2c`.
- Tipografía: IBM Plex Serif (títulos), IBM Plex Sans (texto), IBM Plex Mono (códigos).
- Si usás color para datos, `packages/contract/src/viz/viz-scales.ts` le gana a cualquier paleta.

### 6. Restricciones que no se negocian

- **miMAR** con eme minúscula. **"DIM" no aparece en ningún texto que escribas.** Los códigos de
  credencial que ya se ven dentro de una captura (por ejemplo el de Pampa) quedan como están: son
  públicos. En texto propio, usá "el código de la credencial".
- Castellano rioplatense, registro formal, sin anglicismos ni adjetivos de venta.
- **Ningún número que no esté en el discurso.** Si te falta uno, pedilo en el informe.
- **La lámina de lo que falta va en el flujo principal**, antes del pedido; no a un anexo.

### 7. Cómo se entrega

- PPTX, PDF y los esquemas (si hubo) en `docs/presentation/2026-09-oficiales/assets/mazo/`.
  **No commitees**: lo revisa y lo commitea Claude Code.
- El informe en `docs/design/handoffs/2026-09-14-presentacion-oficiales-mazo-audit.md`, con el SHA
  en el encabezado.
- **Es para mañana.** Si algo no entra en el tiempo, priorizá en este orden: las láminas de las
  secciones 1 a 10 con sus capturas y notas del orador → la lámina de cierre → los esquemas.
