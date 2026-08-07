# Agrupación de IA operador — mapa de misiones

> **Status:** 2026-07-03 — agrupa superficies `/gob` y `/admin` por misión del operador.
> **Principio:** agrupar, no amputar. Ninguna ruta existente se elimina; solo se reorganiza el nav y se unifica la gramática de filtros.

## Las 4 misiones

### 1. Salud poblacional y cumplimiento

**Pregunta:** ¿Qué tan protegida está la población frente a obligaciones sanitarias (vacunas, chip, esterilización, PPP) y cómo evoluciona la mortalidad?

| Entrada | Superficies de detalle |
|---|---|
| Panorama presets `cumplimiento-*`, `control-poblacional` | `/gob/mortalidad`, `/gob/campanas`, `/gob/outreach`, `/gob/poblacion` |
| `/gob/programa` — KPIs C1/C7, esterilización, mortalidad | `/gob/analytics` (cobertura antirrábica) |

**No mostrar junto (F2):** denuncias/decomisos (misión 3); zoonosis/brotes (misión 2).

---

### 2. Vigilancia y respuesta

**Pregunta:** ¿Dónde hay señales de riesgo zoonótico, síntomas reportables, mordeduras u observaciones antirrábicas que requieran respuesta?

| Entrada | Superficies de detalle |
|---|---|
| Panorama `brotes-activos`, `sintomas` | `/gob/vigilancia`, `/gob/analytics`, `/gob/outbox`, `/admin/observaciones` |
| `/gob/programa` — zoonosis, ENO SLA | `/gob/sistema` (crons) |

**No mostrar junto (F2):** cumplimiento PPP/microchip (misión 1); adopciones/censo (misión 4).

---

### 3. Bienestar y fiscalización

**Pregunta:** ¿Dónde se acumulan denuncias, decomisos, disputas de custodia o mascotas perdidas sin reunificar?

| Entrada | Superficies de detalle |
|---|---|
| Panorama `bienestar`, `perdidas-reunificacion` | `/gob/maltrato`, `/gob/decomisos`, `/gob/disputas`, `/gob/perdidas`, `/gob/casos` |
| `/gob/programa` — D4 reunificación, D5 decomisos | `/admin/moderacion`, `/admin/alertas` |

**No mostrar junto (F2):** coropletas de cobertura vacunal (misión 1); brotes zoonosis (misión 2).

---

### 4. Registro, custodia y programa

**Pregunta:** ¿Crece el registro, fluye la custodia/adopción, y está sana la operación del programa?

| Entrada | Superficies de detalle |
|---|---|
| `/gob/programa` (resumen ejecutivo) | `/gob/censo`, `/gob/adopciones`, `/gob/cola`, `/gob/organizaciones`, `/gob/usuarios`, `/gob/reglas`, `/gob/sistema`, `/gob/outbox` |
| Panorama `refugios` (referencia) | `/gob/historial`, `/gob/servicios` |

**No mostrar junto (F2):** capas de vigilancia sindrómica (misión 2).

---

## Paridad numérica Panorama ↔ dashboards

| Capa Panorama | Métrica rollup | Fetcher canónico |
|---|---|---|
| `cobertura` | `rabies-coverage` | `govt-home-kpis.fetchRabiesCoverageByProvince` |
| `esterilizacion` | `sterilization-coverage` | `population-control.fetchSterilizationCoverage` |
| `microchip` | `microchip-penetration` | `compliance-metrics.fetchMicrochipPenetrationByProvince` |
| `ppp` | `ppp-compliance` | `compliance-metrics.fetchPppComplianceByProvince` |
| `mortalidad` | `mortality` | `repository.rollupPetsPerLocality` |
| `sintomas` | `symptom-density` | `metrics/symptom-density.fetchSymptomDensityByUnit` |
| `reunificacion` | `reunification-rate` | `metrics/reunification-rollups.fetchReunificationByUnit` |
| `perdidas` | `lost-density` | `repository.loadPerdidasByUnit` |
| `mordeduras` | `bite-density` | `repository.loadMordedurassByUnit` |
| `zoonosis` | `outbreak-signal` | `repository.loadZoonosisByUnit` |

Registro central: `lib/metrics/rollup.ts` → `CHOROPLETH_LAYER_METRIC`, `PANORAMA_METRIC_SOURCE`.

---

## Métricas implementadas (esta sesión)

| Métrica | Fórmula | Denominador | Fuente | Superficie | k-anon |
|---|---|---|---|---|---|
| **Síntomas / 10k** | `COUNT(symptom_observed) / (censo/10k)` | población censo | `pet_events` | Panorama `sintomas` | localidad k=5 |
| **Gap antirrábica** | `100 - cobertura%` perros activos 12m | perros activos | `pet_events` + `pets` | `/gob/programa`, Panorama | provincia sin k-anon |
| **Reunificación D4** | `recuperadas / episodios_perdida` | episodios lost en período | `status_changed` | Panorama `reunificacion`, `/gob/perdidas` | localidad k=5 |

---

## Backlog ordenado (proyección, sin schema)

1. **Embudo identificación** (registrada → chip → ISO-válido → scan) — Paquete E
2. **Pipeline custodia/adopción** con tiempo-en-estado — Paquete F
3. **Esterilización vs natalidad** (control poblacional neto) — Paquete G ⭐
4. **Salud operativa SLA** (colas, crons, PII oversight) — Paquete H
5. **Perro de asistencia vigente** — población credencializada
6. **Calidad identificación** (replaced/unreadable chips) — C2 extendido
7. **Dormant / perfil incompleto** — salud del registro
8. **Forecast cobertura vs meta** — Paquete H QOL
