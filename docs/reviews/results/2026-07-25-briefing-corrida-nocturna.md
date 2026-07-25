# Briefing — corrida nocturna 2026-07-25

Rama `integration/all-20260703`. Rango `c557103b..HEAD`.

## Qué se hizo

| Item | Estado |
|---|---|
| A1 · deep-link | **No reproducía.** Verificado en 5 variantes; quedó fijado con spec e2e |
| A2 · click ranking = drill + hover-preview | Hecho, verificado en vivo |
| B1 · fundación de animación | Hecho: transiciones de coropleta + piso reduced-motion consolidado |
| B2 · reproducción temporal | **Parcial**: velocidad 1×/2×/4×. Prefetch diferido (razón abajo) |
| C1 · selector de tiempo | **Parcial**: YTD honesto. Dos items diferidos (razones abajo) |
| B3 + E1 · fade + exportar vista | Hecho: fade de 140ms + URL reproducible en el informe |
| D1 · consolidación de vistas | Propuesta escrita (`2026-07-25-panorama-d1-consolidacion-vistas.md`) |
| C6 · IA de 5 capas | Propuesta escrita (`2026-07-25-c6-propuesta.md`) |
| Track B / C4 / C3 | **No empezados** — se agotó la noche antes |

## Las tres cosas que tenés que decidir

### 1. La Definition of Done del proyecto es inalcanzable hoy

`pnpm test` completo **siempre** falla en un test: el barrido de drift de caché
encuentra `DIM-BRUNO-DEMO` con `in_custody_dispute=true` y cero filas de disputa.

Probado que es previo a esta corrida:
- El primer gate de la noche falló idéntico con **solo** el fix de lint de OpKpi
  en el árbol, antes de tocar Panorama.
- Entre ese gate y el siguiente resembré el spine (`seed-demo-spine.ts`, que
  auto-sana el estado huérfano). El siguiente gate **volvió a fallar** — la suite
  lo re-crea sola.
- Última corrida completa: **12.084 tests pasan, 1 falla**, y es ese.

No encontré al culpable: descarté los `afterAll` de los cuatro tests de disputas
(todos borran solo sus propias mascotas), no hay `DELETE` ancho sobre
`custody_disputes`, y ningún test menciona a Bruno. El propio seed documenta el
"trío huérfano" desde 2026-07-23 y lo sanea, o sea que ya se conocía y nadie
llegó al fondo.

**Opciones**: (a) cazar al culpable y hacer que restaure estado, (b) que el
barrido tolere la mascota demo — debilita el test, y esa mascota es justo la
interesante, (c) que la suite resiembre como teardown global. Recomiendo (a),
con (c) como paliativo.

### 2. C3 dejó de ser "el refactor grande que va último"

Vos ordenaste Track B → C4 → C3 por riesgo ascendente, y era correcto con la
información que teníamos. Pero al escribir la propuesta de C6 encontré esto en
el plan maestro, sección C6:

> **Dependencia dura:** C6 se construye SOBRE C1-C3 — rediseñar la IA sin
> contratos reproduce las mismas debilidades con otra cara.

C1 y C2 están (Ola I). **C3 no.** O sea que C3 no es solo un refactor: es el
desbloqueante de la iniciativa mayor. Mientras siga abierto, C6 no puede
empezar por regla propia del plan.

Segundo hallazgo del mismo análisis, y este achica C6: **su fence ya está
construido y corriendo**. `scripts/check-screen-manifest.ts` (etiquetado "C6a"),
`lib/ui/screen-manifest.ts` con 49 rutas declarando `route + layer + decision`, y
su baseline. Una pantalla nueva sin decisión declarada ya falla CI hoy. La mitad
mecánica de "la iniciativa mayor" está paga.

### 3. Lo que diferí, y por qué (no son TODOs vagos)

- **Prefetch de frames (B2)**: `asOfDataRef` está keyed por id de capa sola —
  una entrada, sobreescrita en cada cambio de `asOf`. Precargar el frame N+1
  **pisa** el frame N en pantalla. Necesita re-keying a `${layerId}@${iso}` en
  13 sitios de acceso conservando las invalidaciones de período/alcance/nivel.
  Meterlo dentro del commit de velocidad era la forma de romper en silencio el
  scrub, el loop y el deep-link `?asOf=`. El comentario del código que afirmaba
  que ya estaba keyed así (y nunca lo estuvo) quedó corregido.
- **Presets que colisionan (C1)**: 3 años y 5 años resuelven a la misma ventana
  porque el seed abarca ~2,6 años. Rotularlo honestamente ("sin datos > N años")
  necesita una señal de evento-más-antiguo por alcance que **ningún endpoint
  devuelve hoy**. Es plomería de datos, no copy.
- **Granularidad (C1)**: qué pasos ofrecer entre 90d / 12m / 3a / 5a es decisión
  de producto tuya, no de implementación.

## Hallazgos laterales que valen una decisión

1. **HEAD estaba en rojo cuando empecé.** El commit `c557103b` (OpKpi ⓘ) se
   subió con dos errores de lint: complejidad cognitiva 28>25 y
   `useExhaustiveDependencies`. Contra la DoD. Arreglado en `5bded4ae`.
2. **`parseLayersParam` descarta ids de capa desconocidos en silencio.** Una URL
   compartida con una capa renombrada pierde la capa sin avisar — y bajo el
   marco del propio plan ("una URL que miente es lo opuesto al producto") eso
   merece al menos un aviso. Me costó un falso positivo a mí mismo durante la
   noche.
3. **Test intermitente**: `PanoramaConsole.test.tsx > scrubber temporal-gating`
   falla ~1 de cada 6 corridas del directorio completo, y 0 de 11 corriendo el
   archivo solo. Es sensible a contención, no a markup. **No le puse un
   `waitFor` para callarlo** — silenciar un flake sin entenderlo convierte una
   señal intermitente en un punto ciego permanente.
4. **El ratchet de tamaño de archivo me frenó, con razón.** Mis cambios
   engordaron dos archivos ya sobre presupuesto. En vez de subir el baseline
   extraje cinco unidades (ver `4657d735`). Igual: `PanoramaConsole` con 5142
   líneas y `SituationalMap` con 3398 son insostenibles; la extracción alivió el
   síntoma, no la enfermedad.

## Verificación

- `pnpm verify`: los 41 linters verdes, build verde.
- `pnpm test`: 12.084 pasan / 1 falla (el bloqueante pre-existente de arriba).
- Verificación visual con `scripts/qa-vis.ts` sobre el build de producción en
  cada cambio con superficie visible.
- Batería adversarial de 5 revisores independientes (corrección, accesibilidad +
  reduced-motion, honestidad + privacidad, copy es-AR, performance +
  arquitectura) — resultados en la sección siguiente.

## Resultados de la batería adversarial

_(pendiente — se completa al cerrar la corrida)_
