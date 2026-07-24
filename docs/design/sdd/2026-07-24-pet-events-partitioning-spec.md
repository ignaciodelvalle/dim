# Spec — particionado de `pet_events` (supervivencia a escala nacional)

**Origen**: cursor Scale review S4 (CONFIRMADO). Decisión PO: parte de la Ola integridad ES /
readiness a provincia. NO es un one-liner — requiere rebuild.

## Problema

`pet_events` es una tabla plana (`relkind='r'`, sin `PARTITION BY`) y es la tabla más grande
del sistema (comentario propio en `db/schema.ts:1253`). A escala nacional (100M mascotas × años
de eventos) el crecimiento de una sola tabla + sus índices se vuelve el muro de largo plazo
(vacuum, bloat, planificación de queries). Hoy la única mitigación es cobertura de índices
(que está bien: `(pet_id, occurred_at)`, tipo/tiempo, ubicación, idempotencia, expresión JSONB).

## Diseño propuesto

### Partición declarativa por rango de tiempo
`PARTITION BY RANGE (occurred_at)` — particiones mensuales o trimestrales.
- Las queries analíticas (dashboards) filtran por período → partition pruning gratis.
- Las queries por mascota (`pet_id, occurred_at`) siguen usando el índice local de cada partición.
- Vacuum/retención opera por partición (drop de particiones viejas si alguna clase de evento
  tiene TTL — el TTL de scan-events ya existe como precedente).

### Por qué es un rebuild (no un ALTER)
Postgres no convierte una tabla existente a particionada in-place. El procedimiento seguro:
1. Crear `pet_events_partitioned` (nueva, particionada, misma estructura + constraints + trigger
   append-only).
2. Crear las particiones que cubren el rango histórico + futuras.
3. Backfill por lotes (copiar los eventos existentes, respetando el append-only trigger — o
   deshabilitarlo temporalmente en la ventana de migración con el GUC existente).
4. Attach + swap de nombres en una transacción corta.
5. Re-apuntar FKs lógicas / verificar que nada asuma OID de tabla.

Esto es una migración de horas con ventana de mantenimiento — planificada, no sorpresa.

## Gatillo (cuándo hacerlo)
NO ahora (ciudad-piloto: 200k eventos locales, holgado). El gatillo honesto: **cuando el volumen
de eventos cruce el umbral piloto** (a definir con datos reales de provincia — orden de magnitud
10-50M filas). Antes de eso: monitorear bloat de tabla/índice.

## Relacionado (misma familia de escala, del review Scale)
- **S1/S2** (1 cron de 55s para 22 jobs): decisión PO = seguir difiriendo Vercel Pro; ya
  aplicadas las mitigaciones gratis (alerta en skip + drains de entrega adelantados) en el commit
  nocturno. Pro se justifica al pasar a provincia.
- **S3** (refresh_cube des-agendado): se pliega a la decisión "cubo ON" ya tomada — el cubo se
  agenda cuando se active para superficies nacionales.
- **S5** (drift 2000/noche): OK — tiene cursor de resume, es un barrido rodante completo.
- **S8** (sin error sink): setear `CRON_ALERT_WEBHOOK` (hecho en el lote nocturno); el sink
  Sentry sigue como TODO de infra.

## Ladder de readiness (del review, validado)
- **Ciudad piloto** (CABA, hoy): Hobby aguanta, cubo manual, drains diarios. OK.
- **Provincia** (~1-5M mascotas): Vercel Pro o scheduler externo (sub-diario de outbox/ENO/cubo),
  `CUBE_READS=1`, webhook + error sink, rollups de KPI.
- **Nacional** (10M+): particionar pet_events (este spec), cubos incrementales, tablas de
  proyección /gob, drift muestreado + invariantes de write-path, réplica analítica, límites en
  omnibox.
