# Prompt para el WU de notificaciones push

> **Cómo se usa.** Tu amigo abre Claude Code en la raíz del repo y pega el bloque
> de abajo tal cual, empezando por `/loop`. El `/loop` sin intervalo hace que se
> auto-marque el ritmo: trabaja, decide cuándo volver, y sigue solo hasta que la
> unidad esté cerrada o se tope con algo que necesite tu mano.
>
> Escrito 2026-09-11, después de que la build de producción se cortara sin push.

---

/loop Sos el responsable de una unidad de trabajo cerrada: **notificaciones push en la app móvil de miMAR**. Trabajás sola/o y sin frenar hasta terminarla.

## Lo primero, y no sigas sin hacerlo

Leé **`docs/handoff/push-notifications.md`** entero, de punta a punta, antes de escribir una línea. Son 497 líneas y son tu contrato: qué existe hoy medido contra el código, qué entra y qué NO entra en el alcance, las once decisiones de diseño ya tomadas, las convenciones de la casa, tu territorio de archivos, las trampas conocidas, los tests que debés escribir y qué significa "terminado".

**No hay decisiones abiertas.** Si encontrás una que te parece abierta, es que el documento ya la cerró y no la viste — volvé a buscarla antes de inventar una respuesta. Si genuinamente falta, anotala y seguí con lo que no depende de ella; no la resuelvas por tu cuenta.

## Tres correcciones al documento, que ya venció en esos puntos

El documento se escribió el 10 de septiembre. Estas tres cosas cambiaron y **mandan sobre lo que dice el archivo**:

**1. La sección 3.9 está vencida.** Dice que tu trabajo tiene que entrar antes de que se corte la build nativa. Esa build se cortó el 11 de septiembre **sin** push. Consecuencias, y son concretas:

- `expo-notifications` es un módulo nativo y `runtimeVersion` es `{ policy: "fingerprint" }`, así que tu cambio **no puede viajar por aire**: necesita su propia build de tienda. Eso ya no es un riesgo a evitar, es el plan.
- **No vas a poder probar sobre la build que está en Play.** Armate la tuya con el perfil `development` o `preview` de `eas.json` (los dos generan APK). Ese es tu entorno de prueba.
- Ya no hay apuro de corte. Lo que sí hay es una prueba cerrada corriendo, así que **nada de lo tuyo puede romper lo que ya está instalado**.

Todo lo demás de 3.9 sigue vigente, incluida la orden de **no tocar la política de `runtimeVersion`** para esquivar el cambio de huella. Tiene que cambiar.

**2. El número de migración se movió.** El documento dice que el más alto era `0217`. Hoy es **`0220`**. Igual hacé lo que la sección 6.2 te pide: escribí tu migración **al final** y contá el número libre **en el momento de escribirla**, no ahora. Hay huecos en `0009` y `0057`, así que contar archivos no te da el número.

**3. Mirá `git log` antes de empezar.** Entre el 10 y el 11 de septiembre entraron varios lotes —el borrado de datos del artículo 16, una ruta de exportación nueva, un helper compartido de CSV, correcciones de marca— y alguno puede haber tocado un archivo que el handoff describe. El código vivo gana sobre el documento, siempre.

## Cómo trabajás

Por lotes. Cada lote es una unidad de trabajo que se sostiene sola:

1. **Implementás** la tanda.
2. **Corrés el gate**: `pnpm verify` y después `pnpm test:verified`. Los dos tienen que dar verde y en el reporte pegás **el renglón del veredicto textual**, no el código de salida:
   `reported N file(s); N discovered; 0 failing test(s); 0 broken file(s)`
   Cualquier archivo faltante, cualquier test fallando o cualquier archivo roto es rojo. No hay criterio propio acá y no se vuelve a tirar el dado para sacar un número más lindo.
3. **Verificás por mutación** lo que de verdad importa: rompés el arreglo, confirmás que fallan exactamente los tests que esperabas, y restaurás con una copia hecha con `cp`. **Nunca con `git checkout -- <archivo>`**, que te borra todo lo demás sin commitear que tengas en el árbol.
4. **Commiteás por unidad de trabajo**, con conventional commits, en castellano, explicando *por qué* y no *qué*. **Sin ninguna atribución de IA, ni `Co-Authored-By`, ni nada parecido.** El proyecto es claro en esto.
5. Seguís con el lote siguiente.

## Las reglas que te van a morder si no las sabés

**El Node.** El repo fija **22.23.2**. Confirmá con `node --version` antes del primer gate: si tu terminal te resuelve otra versión, el verde que obtengas no significa nada. En Windows con fnm suele haber que anteponer la ruta de la versión fijada al `PATH` en cada comando.

**No corras la cadena de facts.** Agregar una `route.ts`, un test o una migración mueve `docs/architecture/facts.json`, unos marcadores escritos a mano en la documentación, y el canon renderizado. Sección 6.3: **eso no es tuyo**. Anotá en tu reporte qué archivos nuevos creaste y que la cadena queda pendiente.

**No apliques tu migración a ninguna base remota.** Local y nada más. Aplicar a staging o producción es del dueño del producto, y sólo de él.

**Rama propia, nunca `main`.** Sección 6.5.

**El gate tarda ~25 minutos.** No lo corras por cada archivo que tocás; corré antes el preflight barato (typecheck, biome, y los tests puntuales de lo que tocaste) y guardá el gate para el cierre del lote. Y **no toques ningún archivo mientras el gate corre**: varias fences escanean el árbol entero y un archivo que cambia a mitad de corrida produce un rojo que no es tuyo y que vas a perseguir un rato largo.

## Cuándo parás

Parás cuando se cumple una de estas tres:

- **Terminaste**: la sección 9 del handoff dice qué significa "hecho", todo eso está, el gate cerró verde y está commiteado y empujado.
- **Estás bloqueada/o de verdad**: necesitás una credencial, un permiso o una decisión que no es tuya. No adivines: parás y lo escribís.
- **No podés avanzar** sin romper una regla de arriba.

En los tres casos escribís el reporte de la sección 8.

## Cómo reportás

La sección 8 del handoff dice la forma exacta. Tres cosas que quiero explícitas además:

1. **Lo que decidiste que nadie decidió por vos.** Si el handoff no cubría algo y elegiste, decilo y argumentalo. Lo prefiero dicho aunque esté mal, no escondido aunque esté bien.
2. **Lo que encontraste roto y NO arreglaste**, un renglón por cosa con la razón. Esa lista vale más que un reporte limpio.
3. **Si el handoff se equivoca sobre el código en algún punto, decilo derecho.** Se escribió leyendo el repo y el repo cambia.

Arrancá ahora leyendo el handoff.
