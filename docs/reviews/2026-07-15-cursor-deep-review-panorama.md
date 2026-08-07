# Deep review · Panorama (Centro de Situación)

**Fecha:** 15/7/2026 · **Actor:** `admin@dim.test` en `/admin/panorama`  
**Método:** uso real en browser + lectura de arquitectura (`src/modules/panorama/*`, APIs, k-anon)  
**No es:** checklist de bugs de admin/outbox; este doc es una opinión de sistema.

---

## Veredicto en una frase

Panorama es la pieza más “producto de Estado” del repo: arquitectura limpia (dominio → aplicación → infra → MapLibre), privacidad explícita en UI, y un dock que ya explica denominadores y k-anon — con fricción de **honestidad semántica** (KPI vs mapa vs Registros) y **costo de red duplicado** antes de que el cube nacional se encienda.

---

## 1. Qué es (aprendido usándolo)

Consola fija (`100dvh`) con mapa MapLibre + chrome flotante + dock inferior:

| Pieza | Qué hace |
|---|---|
| Presets (`Vista`) | Empaqueta capas + narrativa (ej. *Brotes activos* = zoonosis + cobertura) |
| Capas (14) | Densidad, choropleth de cumplimiento, directorios (refugios/clínicas), decomisos |
| KPIs | Chips con tendencia vs período anterior |
| Dock Registros | Tabla por unidad + residual honesto de k-anon |
| Dock Estadísticas | Ranking / lectura |
| Dock Línea de tiempo | Scrubber + base **válida** vs **transacción** |
| Exportar | Copiar vista, vistas guardadas, CSV, PNG, informe imprimible |

URL shareable lleva `layers`, `preset`, `period`, `province`, zoom/centro. El `basis` (bitemporal) **no** va en la URL compartible — correcto para no romper bookmarks con un modo avanzado.

**Alcance visto:** Nacional → CABA (barrios, KPIs se recalculan) → Córdoba vía `?province=AR-X` (admin universal puede “visitar” cualquier provincia; botón *Volver a mi jurisdicción* en admin suena raro — copy pensado para govt).

---

## 2. Arquitectura — qué me parece

```
Browser PanoramaConsole
  → GET /api/panorama/[layer|kpis|scope|unit-history]
  → guard institucional + rate limit
  → loadLayerFeaturesCubeOrCached
       ├─ CUBE_READS=1 + elegible → panorama_cube (admin, choropleths)
       └─ else → unstable_cache(300s) → getLayerFeatures → repository (analyticsDb)
            → suppressSmallCells(k=5) → GeoJSON envelope
  → SituationalMap (choropleth / graduated / clustered points)
```

**Lo fuerte**

1. **Hexagonal-lite real:** `domain/layers.ts` es el catálogo declarativo; el repo es el único con `@/db`. Agregar capa = registro + switch — no un nuevo dashboard.
2. **Misma consola, dos portales:** `/gob` scope-bound vs `/admin` universal — un solo `PanoramaConsole`. Eso es disciplina de producto.
3. **Tipos de dato explícitos:** densidad vs choropleth de estado actual vs directorio. El scrubber *atenúa* capas sin dimensión temporal y lo dice en copy (*cobertura no cambia con la fecha*). Eso es arquitectura cognitiva, no solo técnica.
4. **Cube como acelerador, no como verdad:** flag OFF por default; fallback live. Evita el clásico “materialized view miente y nadie lo nota”.

**Lo frágil / a vigilar**

1. **`PanoramaConsole` es un monstruo de cliente** — mucha orquestación (URL, capas, dock, scrub, bivariate). Riesgo de regresiones UX invisibles a tests de dominio.
2. **Semántica tripartita fácil de malinterpretar** (ver §3).
3. **Cube CB1/CB2** (truncación / timeout a escala BA) documentados — no encender `CUBE_READS=1` nacional sin cerrarlos.

---

## 3. Cómo se usan los datos (el corazón del review)

### Tres “mundos” en la misma pantalla

En Córdoba (pérdidas + mordeduras, 90d) el UI mostró a la vez:

| Señal | Valor observado | Semántica |
|---|---|---|
| KPI | **8 Pérdidas activas** · *estado actual* | Stock hoy |
| Caption mapa | burbujas = reportes en **últimos 90 días** | Flujo del período |
| Registros | **310 eventos en 32 unidades (+17 k-anon)** | Conteo agregado post-supresión |

Eso **no es un bug** si el operador entiende las tres bases. Hoy el riesgo es que un funcionario lea “8” y “310” y no sepa cuál manda para actuar. El dock ya nombra el residual k-anon (excelente); los KPIs deberían etiquetar con la misma agresividad (“stock hoy” vs “eventos del período”) en tipografía primaria, no solo en el pie.

### Fuentes por capa (resumen)

| Familia | Capas | Origen | Notas |
|---|---|---|---|
| Eventos densificados | perdidas, mordeduras, zoonosis, sintomas | `pet_events` (+ outbreak_signal) | Bitemporal sí |
| Bienestar | denuncias | `welfare_reports` → centroide localidad | **Nunca** lat/lng exacto |
| Casos | decomisos | `cases` | Timestamp único |
| Cumplimiento | cobertura, esterilización, microchip, ppp, mortalidad | métricas / EXISTS | Estado actual; scrub los atenúa |
| Directorio | refugios, clinicas | `organizations` | No es serie temporal |
| Tasa | reunificacion | métrica | Período, no bitemporal |

### Capas honestas en el panel

Copy de denuncias: *“ubicadas por localidad (centroide) — nunca la ubicación exacta”*. Eso es el estándar al que deberían apuntar todas las capas sensibles.

---

## 4. Performance (medido en esta sesión)

| Observación | Evidencia |
|---|---|
| First paint mapa | “Cargando el mapa…” varios segundos en nacional |
| Duplicación de fetches | Mismas rutas `cobertura`/`zoonosis` disparadas 2× en carga inicial |
| Payloads | Nacional locality ~60–75 KB transfer; CABA drill más chico; muchos `transferSize:0` (cache/304) |
| Histogramas laterales | Se piden `denuncias`/`decomisos` histogram aunque el preset no las tenga activas |
| Cache 300s | Ayuda en re-drill; la primera vista nacional sigue cara |
| `recorded_at` | Sin índice → base “Según lo conocido al momento” es scan caro a escala |
| Cap 2000 | `PER_LAYER_CAP` — nacional puede truncar; hay que surfacer `truncated` |

**Opinión:** el diseño (cache + budgets + analytics pool + cube opcional) es maduro. El win inmediato no es más infra: es **dedupe de requests en el cliente** y no pedir histogramas de capas apagadas.

---

## 5. Privacidad

| Control | Estado |
|---|---|
| k=5 + complementary suppress | Vivo; legend `⊘ k<5 protegido`; Registros nombra “+N protegidas” |
| KA1/KA2 differencing | **Aceptado** PO (operator-gated) — `docs/architecture/privacy-known-limitations.md` |
| Denuncias coarse | Correcto |
| Points mode mordeduras/perdidas | Coords reales solo scope-bound; justificado como lo que ya ve `/gob/vigilancia` |
| Scope fencing | Query params no ensanchan govt; admin drill explícito |
| Cube | Solo admin, slices completos — reduce differencing cruzado govt |

**Riesgos residuales a no olvidar**

1. Export CSV / informe de situación: ¿heredan k-anon y el residual? (batería de tests abajo).
2. Points mode + scrubber estrecho + mortalidad (KA4) — no reabrir granularidad sub-diaria.
3. Si algún día Panorama se embebe público (`?presentation=1` / embed), **reabrir KA1/KA2 de inmediato**.

---

## 6. UX / producto (desde el asiento del admin)

**Brillante**

- Preset *Brotes activos* cuenta una historia (cobertura + señales + mordeduras/10k).
- Scrubber con toggle *Cuándo ocurrió* / *Según lo conocido al momento* — diferencia que casi ningún sistema AR expone.
- Export pack completo (link, saved views, CSV, PNG, informe).
- Demo banner + k-anon en legend.

**Rozaduras**

1. KPI vs mapa vs Registros (arriba).
2. Admin: *Volver a mi jurisdicción* sin jurisdicción personal.
3. Capas checkbox `readonly` en a11y tree (mismo patrón que denuncia wizard) — automatización/lectores frágiles.
4. Drill CABA: un instante con KPIs nacionales viejos antes del refetch (flash de mentira).
5. Bivariado / filtros de severidad (#44) existen como promesa; el modo Capas es el default usable.

---

## 7. Batería de tests que yo correría (además de la suite ~99)

### A. Semántica / honestidad

1. Misma jurisdicción: KPI “pérdidas activas” ≤ conteo de pets `status=lost` en scope; Registros período ≠ stock.
2. Choropleth “estado actual” **no** cambia al mover scrubber; capas temporales sí.
3. Toggle basis: mismos filtros → GeoJSON distinto en capas `pet_events` cuando hay lag reporting; denuncias idénticas en ambos modes.
4. Caption + legend + Registros residual suman al total pre-supresión (o documentan gap).

### B. Scope / authz

5. `govt` con solo Palermo: `?province=AR-X` no inventa Córdoba (regresión del hallazgo govt previo).
6. `govt` zero assignments → vacío sin DB hit.
7. Admin universal sí puede AR-X; audit/rate-limit no se salta.
8. Points mode fuera de jurisdicción asignada → agregado, no dots.

### C. Privacidad

9. Response denuncias: cero `location_lat/lng` exactos en JSON.
10. Celda k<5 no aparece como valor numérico en mapa ni CSV.
11. Attack KA1: provincia raw − siblings visibles ≠ revelar celda si se “fixea” (o test que documenta aceptación).
12. Export PNG incluye nota de método; CSV no filtra filas suppressed por error de cliente.

### D. Performance / resiliencia

13. Abrir preset no dispara histogram de capas inactivas.
14. StrictMode / remount no duplica el par cobertura+zoonosis.
15. `CUBE_READS=0` vs `1`: parity test ya existe — extender a truncated national.
16. Budget timeout → `degraded` envelope, no spinner eterno.
17. Cap 2000 → `truncated:true` visible en UI.

### E. Operador E2E (browser)

18. Preset → drill provincia → localidad → scrub → export link → abrir en tab anónima (401) y en otro admin (misma vista).
19. Informe de situación imprimible: KPIs coinciden con chips (no con stock viejo).
20. Capas directorio (clínicas) no “reproducen” en timeline (atenúan).
21. Mordeduras street-zoom points: click → drawer → deep link a caso/vigilancia.
22. Contraste Panorama “8 pérdidas” vs `/gob/perdidas` vs `/perdidas` público (la asimetría G1).

---

## 8. Funcionalidades “regaladas” (fácil dado lo que ya hay)

Ordenadas por leverage / esfuerzo estimado:

| # | Regalo | Por qué es barato | Valor |
|---|---|---|---|
| 1 | **Etiquetas semánticas unificadas** en KPI chips (“stock hoy” / “flujo 90d”) | Copy + maybe `dataType` ya en layer registry | Baja confusión operador |
| 2 | **No fetch histogram de capas off** | Un `if (activeLayers)` en el cliente | Perf gratis |
| 3 | **Dedupe in-flight** por URL de layer | Request coalescing estándar | Mata el doble GET |
| 4 | **Superficializar bitemporal** fuera de Detalle | Toggle ya existe en scrubber; falta discoverability | Diferenciador Mi Argentina |
| 5 | **Deep link Registros → cola** | Token/código ya en puntos; omnibox existe | Cierra mapa→acción |
| 6 | **Filtro severidad/status en dock (#44)** | Comentario explícito deferred; dock ya filtra unidades | Ops diario |
| 7 | **`escaneos` layer** | Tests ya niegan el id; scans tienen TTL + geo coarse | Vigilancia de credencial |
| 8 | **Rate choropleth por localidad** (num/den) | Path k-anon esbozado en comentarios del repo | Cumplimiento honesto |
| 9 | **Presentation / embed polish** | `?presentation=1` + embed ya shipped | Briefings a autoridades |
| 10 | **Index `pet_events.recorded_at`** | Una migración cuando transaction-basis se use | Desbloquea scrub “según conocido” a escala |
| 11 | **Alertas desde vista** | Ya hay 1 alerta + evaluate-alerts cron; “crear regla desde esta capa/umbral” | Panorama → acción |
| 12 | **Hide “Volver a mi jurisdicción” para admin** | Un `role !== 'govt'` | UX 5 minutos |

Mi top 3 si hay que elegir: **1 (semántica), 2+3 (perf), 5 (mapa→caso)**.

---

## 9. Relación con hallazgos previos (sin re-investigar)

- G1 pérdidas govt vacías vs público 116: Panorama en Córdoba mostró **8 activas** + **310 eventos período** — otra cara del mismo problema de definición de “activa”.
- Admin OOS Córdoba en Panorama **sí** es válido (universal); el “fake Córdoba” era el problema de **govt** scope.

---

## 10. Conclusión

Panorama ya no es un mapa bonito: es un **motor de proyección** con catálogo, privacy envelope, bitemporalidad y export pack. La deuda no es “falta arquitectura”; es **cerrar el contrato semántico en la UI**, **dejar de pagar fetches de más**, y **elegir 1–2 regalos que conviertan mirada en trámite** (deep link a cola / alerta desde vista).

Encender el cube nacional es decisión de escala, no de feature — primero CB1/CB2 y parity bajo truncación.
