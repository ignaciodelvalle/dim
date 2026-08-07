# C6 — IA de 5 capas + gramática de workqueue (propuesta, sin código)

> Decisión de PO (2026-07-25): C6 queda **fuera** de la corrida nocturna como
> código; el entregable es esta propuesta. Este documento explica por qué esa
> decisión además es la única compatible con el propio plan maestro.

## Lo primero: C6 está bloqueado por el plan, no por falta de tiempo

`docs/reviews/results/2026-07-22-plan-maestro-integridad.md`, sección C6:

> **Dependencia dura:** C6 se construye SOBRE C1-C3 — rediseñar la IA sin
> contratos reproduce las mismas debilidades con otra cara.

Estado real de esa dependencia hoy:

| Contrato | Estado |
|---|---|
| C1 · Contrato de Métrica | ✅ Ola I |
| C2 · Lenguaje operativo | ✅ Ola I |
| **C3 · Un solo ViewScope** | ❌ **sin empezar** |

**C6 no puede arrancar.** No es una cuestión de prioridad: empezarlo con C3
abierto es exactamente el modo de falla que el plan nombra — rediseñar la
arquitectura de información encima de un scope que todavía se resuelve de N
maneras distintas, y terminar con las mismas incoherencias en una carcasa nueva.

Esto reordena el backlog de la noche por sí solo: **C3 dejó de ser "el refactor
grande que va último" y pasó a ser el desbloqueante de la iniciativa mayor.**

## Lo que ya está lockeado por PO (no se re-decide)

- Iniciativa comprometida post-quick-fixes.
- Maltrato: default "sin asignar abiertas", histórico demotado.
- Journey único de Denuncias.
- Briefing reemplaza el feed héroe: 3-5 trabajos del día, alertas priorizadas
  por gap × población × tendencia, forecast-a-meta.
- Outreach como pipeline de intervención (filtros + CTA de asignación).
- Vigilancia se parte: epidemiología → Situación, cumplimiento → Programa.

## El primitivo, en una línea

`BRIEFING → SITUACIÓN → PROGRAMA → INTERVENCIÓN → PROFUNDIDAD`, y **colas ≠
tableros**: maltrato / moderación / decomisos son bandeja operativa con gramática
`inbox → tomar → actuar → cerrar`, no dashboards.

La regla que hace esto ejecutable: **toda pantalla declara su decisión dueña.**
Si una pantalla no puede nombrar la decisión que habilita, es un reporte o una
cola — no un dashboard.

## El fence YA ESTÁ CONSTRUIDO (verificado, no supuesto)

Antes de proponer construirlo, lo busqué. **Existe y corre en `pnpm verify`:**

- `scripts/check-screen-manifest.ts` — etiquetado en su propio encabezado como
  **C6a**, citando la sección C6 del plan maestro.
- `lib/ui/screen-manifest.ts` — el registro: 49 rutas con `route + layer +
  decision` en una frase.
- `scripts/screen-manifest-baseline.json` — el baseline de lo grandfathered.
- Segundo chequeo incluido: consistencia manifest ↔ nav (`nav-presets.ts`),
  deliberadamente como módulos separados.

Ejemplo real del registro:

```ts
layer: "briefing",
decision: "¿Qué 3 cosas priorizo hoy?",
```

O sea: **la mitad mecánica de C6 está hecha.** Una pantalla nueva sin decisión
declarada ya falla CI hoy. Lo que falta de C6 no es el fence — es la
reestructuración de la IA que el fence existe para proteger.

Esto cambia el tamaño percibido de C6 hacia abajo, y conviene decirlo fuerte
porque el plan lo describe como "la iniciativa mayor": una parte ya se pagó.

## Lo que necesito que decidas, cuando C3 esté

1. **¿El manifest es por pantalla o por ruta?** Las rutas con `[param]` sirven a
   varias decisiones (una vista de caso no decide lo mismo que la lista).
2. **¿Qué pasa con las pantallas que hoy no tienen decisión dueña?** ¿Se
   reclasifican a "reporte"/"cola" (y pierden el chrome de dashboard), o se
   baselinean y se migran de a poco? Lo primero es más honesto y más caro.
3. **Briefing: ¿cuántos trabajos del día?** El plan dice 3-5. El número fija el
   algoritmo de corte, y "5 cuando hay 40" necesita una regla de qué se esconde.

## Recomendación

No empezar C6. Hacer **C3 primero**, y recién ahí abrir C6 con las tres
decisiones de arriba resueltas. El fence ya está, así que lo que
queda de C6 es la reestructuración de la IA — que es exactamente lo que la
dependencia dura sobre C3 bloquea.
