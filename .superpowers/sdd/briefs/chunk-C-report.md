# Chunk C — Report: Multi-year campaigns history

## Files changed

- `scripts/seed-panorama.ts` — added `seedHistoryCampaigns()` function (section 15f) + call in `main()`

## Seed summary

- **60 historical offerings** (10 per year for 2024/2025, 6 for 2026 Q1+Q2, across 6 PANO orgs)
- **180 time slots** (3 per offering, pinned to 15th of each quarter month at staggered hours)
- **713 appointments** (`attended` / `no_show`, `createdAt` set explicitly within the offering year)
- Jurisdiction mirrors base seed: `jurisdictionProvince = org.provinceName`, `jurisdictionLocality = org.locality`
- Token prefixes: `PANO-SVO-HIST-` and `PANO-APT-HIST-`

## Verification query output (fetchCampaignDashboard shape — Córdoba × 2024/2025/2026)

Query used (mirrors `resolveOfferingIds` status filter + `fetchOfferingStats` createdAt/status filter):

```sql
SELECT
  so.jurisdiction_province,
  EXTRACT(year FROM a.created_at)::int AS year,
  COUNT(a.id) AS appointment_count
FROM service_offerings so
JOIN appointments a ON a.service_offering_id = so.id
WHERE so.jurisdiction_province LIKE 'C_rdoba'
  AND so.status IN ('approved', 'pending_approval', 'paused', 'archived')
  AND a.status IN ('confirmed', 'attended', 'no_show')
  AND EXTRACT(year FROM a.created_at) IN (2024, 2025, 2026)
GROUP BY so.jurisdiction_province, EXTRACT(year FROM a.created_at)
ORDER BY year;
```

Result:
```
 jurisdiction_province | year | appointment_count
-----------------------+------+-------------------
 Córdoba               | 2024 |                41
 Córdoba               | 2025 |                52
 Córdoba               | 2026 |               184
(3 rows)
```

Non-empty for all three years. ✓

## Idempotency

`--clean` run logs: `Deleted 70 PANO campaigns (offerings + 310 slots + appointments)` (10 base + 60 historical).
The existing `LIKE 'PANO-SVO-%'` and `LIKE 'PANO-APT-%'` patterns in `runClean()` auto-catch the `PANO-SVO-HIST-*` / `PANO-APT-HIST-*` prefixes — no `runClean()` changes needed.
Re-seed after `--clean` produces identical counts (713 appointments, same per-year breakdown).

## Typecheck + biome

- `pnpm typecheck` → clean (0 errors)
- `pnpm biome check scripts/seed-panorama.ts` → clean

## Key non-obvious findings

1. `fetchCampaignDashboard` filters only `appointments.createdAt` — not offering dates. Historical offerings need `createdAt` set explicitly on each appointment (overriding the `defaultNow()`).
2. `time_slots` has `UNIQUE INDEX (service_offering_id, starts_at)`. Fixed slots to the 15th at staggered hours (9/11/13 UTC) to guarantee uniqueness per offering.
3. For 2026, only Q1 and Q2 are seeded — the anchor is 2026-06-20 so Q3/Q4 would require future slot dates.
