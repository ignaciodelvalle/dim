# Backlog completo — al cierre de la corrida 2026-07-25

> Todo lo pendiente, con su razón de estar pendiente. Lo que está bloqueado por
> DATO no se destraba con esfuerzo de producto, y lo que está bloqueado por
> DECISIÓN no se destraba con código. Está marcado.

## 1 · Bugs vivos sin cerrar

| # | Qué | Estado |
|---|---|---|
| 1 | **`/admin/programa` podría renderizar impacto sin disparar `applyCensusCoverageGuard`** | HIPÓTESIS sin verificar. Si es cierto, es bug de honestidad en página de gobierno ya shippeada |
| 2 | **Desierto: empate a 23 bandas en 90 días** | "Peores 10" es un corte arbitrario de un empate. Sin arreglo real hasta decidir si la vista se reescribe |

## 2 · Bloqueado por DECISIÓN tuya (no por código)

| Qué | La decisión |
|---|---|
| **Tendencia: polaridad** | Hoy declara "más eventos = alarma" y las 24 provincias dan positivo por adopción del registro. El arreglo es restringir el delta a eventos de INCIDENTE (mordeduras/denuncias/zoonosis). Qué eventos cuentan como deterioro es producto |
| **Brotes activos: rescate** | El bivariado se autosuprime (233 unidades ocultas vs 9 visibles). Opción propuesta: caer automáticamente a la señal sola cuando la supresión pasa X%, y decirlo |
| **Per cápita por defecto** | Tres vistas de densidad ordenan por población. El toggle existe y está apagado |
| **C1: granularidad temporal** | Qué pasos ofrecer entre 90d / 12m / 3a / 5a |
| **D1: consolidación de vistas** | 11 → 8 propuesto. Cumplimiento + Registro PPP + Control poblacional son la misma vista |
| **Bloqueante de la DoD** | `pnpm test` completo nunca da verde por el drift de `DIM-BRUNO-DEMO`. Tres opciones en el briefing nocturno |

## 3 · Bloqueado por DATO (ningún esfuerzo de producto lo destraba)

| Qué | Qué falta exactamente |
|---|---|
| **Resultado de intervención** | `appointments.outcome_event_id` NULL en 838/838; `govt_business_rules` se hace UPSERT sin historial (necesita tabla versionada); decomisos = 0 eventos |
| **Equidad / oferta de servicio** | 12 organizaciones en 6 provincias, 2 clínicas en el país, y los 68 veterinarios con provincia NULL |
| **Carga operativa / SLA territorial** | Recién ahora hay `closed_at`; hay que re-medir si aparece varianza real por provincia |
| **C1: presets 3a/5a que colisionan** | Necesita señal de evento-más-antiguo por alcance; ningún endpoint la devuelve |

## 4 · Listo para implementar (sin bloqueo)

Ordenado por apalancamiento:

1. **Cuarta naturaleza epistémica: `censored`.** "≥90 días" no es una medición de 90 días. **Una primitiva arregla tres vistas** (Desierto, Mortalidad, Brotes). El mejor ratio del backlog.
2. **Cablear las cuatro capas huérfanas.** `indice-territorial`, `acceso-veterinario`, `refugios` y `clinicas` están construidas y **no las usa ningún preset**. *"La consola no tiene escasez de ideas, tiene escasez de cableado."*
3. **Portar `impact-ranking.ts` a Panorama** con base PADRÓN (no censo). Ya existe, testeado, cableado a 3 páginas, cero referencias en Panorama. Reordena de verdad: Santa Fe 23 → 5.
4. **Capa "Mascotas registradas por 1.000 habitantes"** con etiqueta honesta — NO llamarla "subregistro" (requiere una prevalencia de tenencia que Argentina no tiene).
5. **KPIs que midan su propia vista.** Desierto y Tendencia muestran los de otras. Requiere ampliar `PanoramaKpiId` (hoy 11 miembros, ninguno mide acceso ni recencia).
6. **Leyenda bivariada usando el `bivariatePair` de la vista** (hoy Riesgo PPP dice "cobertura × señal").
7. **Codificar los puntos de Síntomas** por magnitud y severidad.
8. **Consolidar SLA en `/gob/programa`** — hoy hay cuatro vocabularios en cuatro pantallas.
9. **Poblar `outcome_event_id`** al registrar asistencia. Chico, alto valor, y es un hueco de integridad del spine independiente de Panorama.
10. **`buildMapTableCsv` no exporta `gap`** — para un instrumento cuyo tercer verbo declarado es EXPORTAR.

## 5 · Deuda técnica con razón escrita

| Qué | Por qué se difirió |
|---|---|
| **Prefetch de frames (B2)** | `asOfDataRef` keyed por capa sola; precargar N+1 pisa N. Necesita re-keying a `${layerId}@${iso}` en 13 sitios |
| **Filtro client-commit global (Track B)** | El único ítem del hito de dashboards que no se hizo (OpFilterBar, 161 sitios) |
| **`PanoramaConsole` 5.142 líneas** | Se extrajeron 7 unidades esta corrida; sigue insostenible. Costuras propuestas: `usePanoramaData` (empezada), `usePanoramaViewState`, `PanoramaDock` |
| **Test intermitente** | `PanoramaConsole.test.tsx > scrubber temporal-gating`, ~1 de 6 corridas del directorio. **No silenciado a propósito** |

## 6 · Iniciativas mayores del plan maestro

| Qué | Estado |
|---|---|
| **C3 · Un solo ViewScope** | Primitivo y ambos fences YA existen. Falta: consumidores nombrados + bajar las 54 refs baselineadas. **Es el desbloqueante de C6** |
| **C6 · IA de 5 capas** | Bloqueado por C3 (dependencia dura del propio plan). Su fence ya está construido — la mitad mecánica está paga |
| **Infra de confianza** | Transversal, sin empezar |

## 7 · Specs escritos sin empezar (previos a esta corrida)

- `2026-07-24-pet-events-partitioning-spec.md` — venía como High del Pass 6 de escala
- `2026-07-24-credential-token-rotation-spec.md`
- `2026-07-24-death-voided-spec.md`

## 8 · Blockers de escala (Pass 6, sin planificar como cambio)

Cron único diario de 55s en Vercel Hobby alimentando ~22 jobs · `refresh_cube` fuera de la flota · `CUBE_READS` en OFF por defecto · `PER_LAYER_CAP=2000` · sin sink de on-call.

---

## Lo que yo haría primero

**`censored`** (una primitiva, tres vistas) y **cablear las cuatro capas huérfanas** — máximo valor por esfuerzo, cero bloqueos, y ambas atacan el problema real: no faltan ideas, falta terminar lo construido.

Después **C3**, porque dejó de ser un refactor y es el desbloqueante de la iniciativa mayor.
