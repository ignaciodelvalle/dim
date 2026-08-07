# Demo ejecutiva — runbook

Cómo dejar el entorno listo para grabar el recorrido ejecutivo gubernamental de punta a punta.
Todo es **local-only e idempotente**: los seeds se niegan a correr contra una DB remota y se pueden
re-ejecutar sin duplicar datos.

> Plan de origen: [`docs/superpowers/plans/2026-06-22-demo-readiness.md`](../superpowers/plans/2026-06-22-demo-readiness.md).

---

## Levantar la demo (en orden)

```bash
# 1. DB local arriba (Docker Desktop + Supabase)
supabase start          # o: pnpm db:bootstrap

# 2. Universo nacional (capas del Panorama)
pnpm seed:panorama

# 3. Cuentas de prueba — crea admin@dim.test
pnpm seed:test

# 4. Escenario focal CABA — crea govt@dim.test y materializa la alerta
pnpm seed:demo:scenario

# 5. Verificar que están todos los invariantes (gate antes de filmar)
pnpm demo:verify

# 6. Levantar la app con el banner de "modo demo"
NEXT_PUBLIC_DEMO_MODE=true pnpm build && NEXT_PUBLIC_DEMO_MODE=true pnpm start
# (en dev: NEXT_PUBLIC_DEMO_MODE=true pnpm dev)
```

`demo:verify` imprime una línea `OK / FALTA` por invariante y sale con código `0` (listo para grabar)
o `1` (falta algo). Es el gate antes de filmar.

---

## Credenciales

| Cuenta | Password | Rol | Portal | Localidad focal |
|--------|----------|-----|--------|-----------------|
| `admin@dim.test` | `Test1234!` | admin | `/admin` | universal |
| `govt@dim.test` | `Test1234!` | govt | `/gob` | **CABA** |

Ambas cuentas comparten la localidad focal **CABA**: ahí disparan los outliers, la alerta que cruza
el umbral, y el handoff "Contactar autoridad local" desde `/admin/alertas` resuelve al govt real.

---

## Banner de modo demo

- Flag: `NEXT_PUBLIC_DEMO_MODE` (default `false` → nunca aparece en producción).
- Con `true`: franja honesta "Datos de demostración" en `/admin/*`.

---

## Invariantes que garantiza el escenario (`seed:demo:scenario`)

| ID | Invariante | Beat de la demo |
|----|------------|-----------------|
| D0-1 | ≥4 buckets en esterilización y vacunación (≥6 meses, CABA) | Programa + Forecast |
| D0-2 | CABA bajo meta + Córdoba sobre meta (outliers) | Programa / Informe |
| D0-3 | ≥1 `event_amended` sobre un evento amendable | Libro |
| D0-4 | Suscripción de alerta (admin) que cruza umbral + firing `disparada` | Alertas |
| D0-5 | `occurredAt`/`recordedAt` recientes (footers "calculado al…") | todos |
| D1 | `govt@dim.test` con `govt_assignments` a CABA | Alertas (handoff) |

---

## Cortes de la demo

| Corte | Beats | Requiere |
|-------|-------|----------|
| **Completo** (objetivo) | Dashboard · Panorama · Programa+Forecast · Libro · **Alertas** (acciona→investiga→contacta) · cierre Mi Argentina | seed completo (incluye la parte de alerta) |
| **Temprano** (fallback) | Dashboard · Panorama · Programa+Forecast · Libro · cierre Mi Argentina | seed sin la parte de alerta |

El cierre **Mi Argentina** es una vista ilustrativa con disclaimer no ocultable
(`/admin/acerca/integracion-miarg`) — la autenticación OIDC sigue siendo un stub.
