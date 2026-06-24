# Plan: Demo readiness — terminar la demo ejecutiva · ejecutable

> **Para Claude Code.** Garantiza que el **recorrido ejecutivo gubernamental** sea filmable de punta a punta una vez
> que aterricen los paquetes de features (L Libro · J Forecast · I Reporte · K Alertas). El riesgo #1 de la demo es
> **datos vacíos**: este plan asegura que cada beat tenga el dato que necesita, las cuentas emparejadas, y un aviso
> honesto de "datos de demostración". **Casi todo es seed (additive) + un banner.** SDD test-first.
>
> **Depende de** (corre después o en paralelo a):
> [`2026-06-22-event-ledger-libro.md`](./2026-06-22-event-ledger-libro.md) ·
> [`2026-06-22-forecast-proyeccion.md`](./2026-06-22-forecast-proyeccion.md) ·
> [`2026-06-22-reporte-oficial-pdf.md`](./2026-06-22-reporte-oficial-pdf.md) ·
> [`2026-06-22-bandeja-alertas-triage.md`](./2026-06-22-bandeja-alertas-triage.md).
>
> **Reusa lo ya construido:** seeds determinísticos idempotentes con guard local-only (`scripts/seed-panorama.ts`,
> `seed-demo.ts`, `seed-test-users.ts` → `admin@dim.test`/`Test1234!`), el disclosure de datos sintéticos ya presente
> en `components/panorama/PanoramaShell.tsx:79`.
>
> **Coordinación con CC:** D0/D1/D3/D4 son **archivos nuevos**. D2 (banner) monta en `app/admin/layout.tsx` — commit
> aislado, o detrás de un flag para no forzar la edición si CC lo está tocando.

---

## Beats de la demo y el dato que cada uno exige

| Beat | Pantalla | Dato que DEBE existir | Lo cubre |
|------|----------|------------------------|----------|
| Lo ve | Panorama | capas pobladas (zoonosis, antirrábica, mortalidad), drill | `seed:panorama` (ya) |
| Mide+planifica | Programa + Forecast | **≥4 buckets** por serie (esteriliz., vacunación) en ≥1 jurisdicción | **D0** |
| Acciona | Alertas | **≥1 alerta disparada** en una localidad con **govt asignado** | **D0 + D1** (gated K) |
| Confía | Libro | **≥1 evento `event_amended`** sobre un evento amendable | **D0** |
| Se lo lleva | Informe | KPIs + **outliers cross-jurisdicción** (≥1 jurisdicción bajo meta) | **D0** |
| Escala | Cierre Mi Argentina | tarjeta ilustrativa **con disclaimer** | **D3** |

---

## D0 — Seed de escenario demo (determinístico, idempotente) 🟩

**Archivos nuevos:**
- `scripts/seed-demo-scenario.ts` + script `seed:demo:scenario` en `package.json` (additive).
- `scripts/seed-demo-scenario.test.ts` (asserts de invariantes).

**Garantías (todas determinísticas, prefijo `DEMO-`, idempotente, guard local-only como `seed-panorama`):**
1. **Series con ≥4 buckets:** emitir `sterilization_performed` y `vaccination_administered` distribuidos en
   ≥6 meses en una **jurisdicción demo focal** → el Forecast tiene de dónde proyectar (no cae en `insufficient`).
2. **Una jurisdicción claramente bajo meta** (outlier) y otra sobre meta → Programa muestra outliers y el Forecast
   muestra "no alcanza / alcanza la meta".
3. **≥1 evento enmendado:** crear un evento amendable (p. ej. `vaccination_administered`) y luego su
   `event_amended` que lo corrige → el Libro tiene el beat estrella (reusar el shape de `lib/amendment.ts`).
4. **Setup de alerta** (gated K): insertar una `alert_subscriptions` (owner = admin demo) cuyo umbral **se cruza**
   con los datos de la jurisdicción focal (p. ej. `sterilization_coverage_pct below <meta>` o `active_zoonosis above
   N`). Si el paquete K ya está, **correr la evaluación una vez** al final del seed para materializar el
   `alert_firings` disparado. Si K aún no está, el seed deja la suscripción + los datos listos (la alerta se
   materializa cuando K corra).
5. **Frescura:** `occurredAt`/`recordedAt` recientes para que los footers "calculado al…" no se vean viejos.

**Composición:** correr sobre (o después de) `seed:panorama` para no duplicar el universo nacional; agregar solo el
escenario focal `DEMO-`.

**Tests (D0):** post-seed, los invariantes se cumplen — ≥4 buckets en las 2 series focales, ≥1 `event_amended`,
≥1 jurisdicción bajo meta, la suscripción de alerta existe y su condición se cruza.

---

## D1 — Cuentas demo emparejadas 🟩

**En el mismo `seed-demo-scenario.ts`:**
- Garantizar `admin@dim.test` (ya lo crea `seed:test`) **+** un `govt@dim.test` (password `Test1234!`) **asignado vía
  `govt_assignments` a la MISMA localidad focal** donde dispara la alerta y aparecen los outliers.
- Así "Contactar autoridad local" en `/admin/alertas` resuelve a un govt real, y el corte puede mostrar el handoff
  completo (incluso saltar a `/gob` para ver el otro lado, si se quiere).
- **No editar `seed-test-users.ts`** (CC puede tocarlo) — crear/asegurar el govt focal desde el script de escenario,
  idempotente (buscar por email antes de crear).

**Entregable de credenciales (en el header del script + README de demo):** `admin@dim.test` / `govt@dim.test`,
ambos `Test1234!`, localidad focal documentada.

**Tests (D1):** el govt focal existe y tiene `govt_assignments` a la localidad focal; es distinto del admin.

---

## D2 — Banner de "modo demo" (aviso honesto, global) 🟢

**Archivos nuevos:**
- `components/ui/DemoModeBanner.tsx` (presentacional, una franja sutil "Datos de demostración — entorno de muestra").
- Reusa el tono del disclosure que ya existe en `PanoramaShell.tsx` (no inventar copy nuevo).

**Activación:** flag `NEXT_PUBLIC_DEMO_MODE` (default `false`). En el build de demo se setea `true`.
- Montar el banner una sola vez en `app/admin/layout.tsx` (lectura del flag) — **commit aislado**; si CC está tocando
  el layout, dejarlo detrás del flag y montar en un punto neutral para minimizar conflicto.
- Default off → en producción real no aparece nunca.

**Tests (D2):** con flag on → banner visible en `/admin/*`; con flag off → ausente.

> Decisión tomada (tu #3): **avisamos siempre** en la demo. Con un funcionario, la credibilidad pesa más que el brillo.

---

## D3 — Cierre Mi Argentina (asumido, con disclaimer) 🟢

> Decisión tomada (tu #4): **asumir realizado con disclaimer.** No es login real (el OIDC es stub) — el cierre del
> video usa una **vista ilustrativa**.

**Archivos nuevos:**
- Una vista/asset estático del cierre (p. ej. `app/admin/acerca/integracion-miarg/page.tsx` o un asset en `public/`)
  con el styling Mi Argentina **y un disclaimer visible**: "Integración en desarrollo — vista ilustrativa".
- Sin OIDC, sin tocar `app/auth/miarg/callback/route.ts` (sigue siendo stub gated).

**Tests (D3):** la vista renderiza el disclaimer (no se puede ocultar).

---

## D4 — Verificación de readiness (gate antes de filmar) 🟩

**Archivo nuevo:** `scripts/demo-verify.ts` + script `demo:verify`.
- Asserta los invariantes de la demo de una: ≥4 buckets en las series focales · ≥1 `event_amended` ·
  ≥1 jurisdicción bajo meta · suscripción de alerta presente (y firing si K está) · `admin@dim.test` +
  `govt@dim.test` con assignment a la localidad focal · flag de demo documentado.
- Salida clara OK/FALTA por invariante → "listo para grabar" o "falta X".

**Test (D4):** corre contra el seed y reporta verde; falla si falta un invariante.

---

## Cross-cutting

- **Local-only + idempotente** (patrón `seed-panorama`): el seed se niega a correr contra DB remota y se puede
  re-ejecutar sin duplicar.
- **Additive:** sin schema nuevo (la tabla `alert_firings` la trae el Paquete K, no este plan).
- **Docs en el PR:** un `docs/demo/README.md` corto — cómo levantar la demo (`db:bootstrap` → `seed:panorama` →
  `seed:demo:scenario` → `NEXT_PUBLIC_DEMO_MODE=true` → `demo:verify`), credenciales, y los dos cortes (abajo).

## Dos cortes (tu #5)

| Corte | Beats | Bloqueado por |
|-------|-------|---------------|
| **Corte temprano** (filmable antes) | Dashboard · Panorama · Programa+**Forecast** · **Libro** · **Informe** · cierre Mi Arg | L + J + I (ninguno toca schema) + D0/D1(cuentas)/D2/D3/D4 |
| **Corte completo** | agrega **Bandeja de alertas** (acciona → investiga → contacta) | + K (schema) + la parte de alerta de D0 |

El beat de **Alertas** y su seed asociado quedan **diferidos al corte completo** (ver Diferidos abajo).

## Decisiones abiertas

- **§Demo-D1 — alcance del banner.** Solo `/admin/*` (recomendado) vs todas las superficies. Default admin.
- **§Demo-D2 — localidad focal.** Elegir una localidad real del catálogo INDEC con buen render en el mapa (CABA o
  un partido de PBA). Documentarla.
- **§Demo-D3 — materializar el firing en el seed.** Si K está, correr la eval en el seed; si no, dejar la suscripción
  y materializar cuando K corra. Confirmar al integrar.

## Criterios de aceptación (resumen)

1. `seed:demo:scenario` produce, determinístico e idempotente, todos los invariantes de la tabla de beats.
2. `admin@dim.test` + `govt@dim.test` emparejados en la localidad focal.
3. `NEXT_PUBLIC_DEMO_MODE=true` muestra el banner de datos de demostración en `/admin/*`.
4. El cierre Mi Argentina existe como vista ilustrativa con disclaimer no ocultable.
5. `demo:verify` reporta verde para el corte temprano sin necesidad del Paquete K.
