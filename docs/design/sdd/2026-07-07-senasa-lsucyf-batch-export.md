# SDD — SENASA / LSUCyF batch export

**Date:** 2026-07-07 · **Status:** spec + design; format-independent pipeline IMPLEMENTED, real SENASA formatter DEFERRED (blocked on the real spec) · **Owner:** Ignacio Del Valle (PO)

> A funcionario runs a vaccination campaign, then has to **re-load every dose into the old SENASA/LSUCyF form by hand**. The schema is already aligned (the `ref.*` vocabularies + the SENASA columns on `pet_events` landed in compliance PRs 0–3). The missing piece is the export itself. **CRITICAL / #1 open question: we do NOT know the real SENASA file format, and we will NOT invent one.** This SDD designs the pipeline to be format-agnostic behind a pluggable formatter, and ships the format-independent parts (the scoped query + a CSV baseline) so the moment the real spec arrives, only one class needs writing.

---

## Proposal

**Intent.** Let an authorized govt/admin operator export the sanitary events in their jurisdiction, for a period, in a SENASA-homologable batch — so they stop double-loading the legacy form.

**Why format-agnostic.** The single biggest risk is guessing SENASA's on-the-wire format (fixed-width? XML? a specific CSV column order with SENASA codes?) and shipping something that fails homologation. The pipeline is therefore split so the **only** unknown — the byte layout — is isolated in a swappable `SenasaFormatter`. Everything before it (scope, gather, transform to a neutral canonical row) is knowable today because it is defined by *our* aligned schema, not SENASA's wire format.

**Scope this cycle.** Implement scope → gather → transform → **CSV baseline formatter**, with the formatter behind a registry so the real SENASA formatter drops in later. No app route wired this cycle (keeps the change in `lib/`, reviewable, and off the demo surface); the route is a thin follow-up.

---

## Current state (audited — the alignment is real)

- **`pet_events` already carries the SENASA fields** (migration 0061): `tipoEventoCode`, `loteBiologico`, `laboratorio`, `vencimientoBiologico`, `viaAplicacionCode`, `vetMatricula`, `vetJurisdiccionCode`, `establecimientoRenspa`, `proximaDosisAt`, `firmadoAt`, `firmaHash`. All nullable; populated by the sanitary-event form, legacy rows stay NULL. **The export is a projection over these columns — not new data.**
- **The vocabulary is mirrored** in `lib/reference/sanitary-vocab.ts` (`TIPO_EVENTO_SANITARIO`, `VIA_APLICACION`, helpers `tipoEventoLabel/Norma`, `requiresLote/Via`, `notificableEno`), pinned against the DB seed by `__tests__/sanitary-vocab.test.ts`.
- **Export plumbing exists to reuse**: `rowsToCsv` (RFC-4180 escaping, `lib/analytics/govt-exports.ts`), `buildSectionedCsv` / `csvDownloadResponse` / `logGobDashboardExport` (`lib/analytics/govt-dashboard-export.ts`), the Zod-per-slice anonymization pattern, and `ProjectionContext` scoping (`lib/metrics`, as used by `campaign-metrics.ts`).
- **A pluggable-formatter precedent exists**: the welfare MPF export (`src/modules/welfare/application/generate-mpf-export.ts`) already models "scoped query → transform → formatted document for an external authority."

---

## Spec — requirements & scenarios

### R1 — Scoped gather

- **R1.1** The pipeline SHALL gather `pet_events` where `tipo_evento_code IS NOT NULL` (i.e., sanitary-aligned rows only), joined to their `pets`, within a `ProjectionContext` (jurisdiction scope + period), identical to how `campaign-metrics` scopes.
- **R1.2** Admin scope = all jurisdictions (no WHERE on jurisdiction). Govt scope = the operator's assigned `(province, locality)` pairs, matched against `pets.jurisdiction_province` / `pets.jurisdiction_locality`.
- **R1.3** The period filter SHALL bound on `occurred_at` (the clinical date), not `recorded_at`.

### R2 — Neutral canonical row

- **R2.1** Each gathered event SHALL transform into a `SenasaCanonicalRow` — a flat, format-agnostic shape carrying ONLY export-safe fields (pet public token as the opaque animal identifier, species, jurisdiction, occurred date, and the SENASA-alignment columns + their human labels). **No owner identity, no DNI, no precise lat/lng, no free-text notes** (privacy — same discipline as `eventsExportSchema`).
- **R2.2** `tipo_evento_code` SHALL resolve to its `labelEs` and `normaOrigen` via `sanitary-vocab`, and `via_aplicacion_code` to its label, so the canonical row is self-describing regardless of formatter.

### R3 — Pluggable formatter

- **R3.1** A `SenasaFormatter` interface SHALL define `{ id, label, contentType, fileExtension, format(rows): string }`.
- **R3.2** A registry SHALL expose the available formatters. This cycle ships exactly one: `csv` (the baseline).
- **R3.3** The **real SENASA formatter is a stub-with-a-throw**, registered nowhere until the real spec lands — adding it MUST require touching only the formatter registry, nothing upstream.

### R4 — Audit

- **R4.1** Every export SHALL write an `audit_log` row (actor, action, jurisdiction scope, period, row count, formatter id) — reuse the `logGobDashboardExport` pattern when the route lands.

---

## Design

### D1 — Pipeline shape (three pure stages + one IO stage)

```
ProjectionContext ──▶ fetchSenasaBatch()      [IO: scoped query]      lib/analytics/senasa-export-query.ts
   raw rows       ──▶ toSenasaCanonicalRows()  [pure: transform]       lib/analytics/senasa-export.ts
   canonical rows ──▶ SenasaFormatter.format()  [pure: serialize]       lib/analytics/senasa-export.ts
```

**Why the split into two files.** The pure core (`senasa-export.ts`: types, vocab mapping, transform, formatters, registry) imports **no** `db`, so it is unit-testable without a database connection. The IO stage (`senasa-export-query.ts`) imports `db` and does only the scoped gather. This mirrors the hexagonal boundary the repo already favors (domain vs. infrastructure).

### D2 — The canonical row is defined by OUR schema, so it is knowable today

Because `pet_events` already has the aligned columns, the canonical row is essentially those columns + a resolved label. Nothing here depends on SENASA's wire format:

```
SenasaCanonicalRow = {
  animal_token, species, jurisdiction_province, jurisdiction_locality,
  occurred_on (YYYY-MM-DD),
  tipo_evento_code, tipo_evento_label, tipo_evento_norma,
  lote_biologico?, laboratorio?, vencimiento_biologico?,
  via_aplicacion_code?, via_aplicacion_label?,
  vet_matricula?, vet_jurisdiccion_code?, establecimiento_renspa?,
  proxima_dosis_on?,
}
```

### D3 — CSV baseline is a real, useful deliverable

The CSV formatter is not a throwaway: a funcionario can open it in Excel and cross-load today, and it exercises the entire pipeline end-to-end. It reuses `rowsToCsv` (no third CSV implementation) with a stable, documented column order + a UTF-8 BOM for Excel. When the real SENASA formatter lands it slots in beside CSV; CSV stays as the human-readable fallback.

### D4 — Privacy

The transform is the privacy boundary (R2.1). The canonical row is an allowlist — it physically cannot carry owner PII because those fields are never selected into it. This is the same "Zod-schema-as-allowlist" philosophy as `govt-exports.ts`, expressed as an explicit mapping function.

### D5 — Route (deferred, thin)

`GET /gob/senasa/export` — `requireAdminOrGovtOrRedirect` guard, capability check (admin or govt with assignments), `buildProjectionContext`, `fetchSenasaBatch`, pick formatter from `?format=` (default `csv`), `logGobDashboardExport`, `csvDownloadResponse`. ~40 lines mirroring `app/gob/campanas/export/route.ts`. Held out of this cycle to keep the change in `lib/` and off the demo surface.

---

## Tractable slice (IMPLEMENTED this cycle) vs. deferred

**IMPLEMENTED (format-independent, decision-free):**
- `lib/analytics/senasa-export.ts` — `SenasaCanonicalRow` type, `SenasaEventRow` input type, `toSenasaCanonicalRow(s)` transform (vocab-resolving, privacy-allowlisting), `SenasaFormatter` interface, `csvSenasaFormatter` baseline, `SENASA_FORMATTERS` registry, `SENASA_CSV_COLUMNS` stable order.
- `lib/analytics/senasa-export-query.ts` — `fetchSenasaBatch(ctx)` scoped gather over `pet_events ⋈ pets`, jurisdiction- + period-scoped via `ProjectionContext`.
- `__tests__/senasa-export.test.ts` — pure unit tests for the transform (vocab resolution, privacy allowlist, null handling) + the CSV formatter (column order, escaping, empty batch). No DB.

**DEFERRED:**
- **The real SENASA/LSUCyF formatter** — BLOCKED on the real SENASA file spec (**#1 open question**). Do not invent it.
- The `GET /gob/senasa/export` route + UI button (D5) — thin follow-up, deliberately out of this cycle to stay off the demo surface.

---

## Open questions

1. **#1 (CRITICAL, BLOCKING the real formatter) — What IS the SENASA/LSUCyF batch file format?** Fixed-width? XML against an XSD? A prescribed CSV with SENASA-specific codes and column order? A REST payload? **We need the real SENASA homologation spec.** Until then, only the CSV baseline exists. Everything upstream (query + canonical row) is ready to feed it.
2. **RENSPA / establishment identity.** `establecimiento_renspa` is on the event but sparsely populated. Does SENASA require the vaccinating establishment's RENSPA on every row? If mandatory, we need a backfill/validation gate before export. → part of the real-spec reconciliation.
3. **Vet matrícula completeness.** Rows written before the sanitary-event form (legacy) have NULL `vet_matricula`. Does SENASA reject rows without it? → validation policy decision (drop vs. flag vs. block the batch).
4. **Batch granularity.** Per-campaign, per-locality, or per-period? The pipeline is period+jurisdiction scoped (matches `/gob` dashboards); if SENASA wants per-campaign batches, add an offering filter (trivial, additive). → PO/SENASA.
5. **Signature (`firma_hash` / `firmado_at`).** Does the homologated batch need a digital signature envelope? Columns exist; the signing step is unspecified. → real-spec reconciliation.
