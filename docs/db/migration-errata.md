# Migration errata

Applied migration files are **immutable**. When one of them says something false, the correction is recorded here — never by editing the file.

Read this before trusting a comment inside `db/migrations/*.sql`. A migration's SQL is authoritative (it ran); its prose is not.

## Why the file cannot be fixed

`scripts/migrate.ts` stores the **sha256 of each file's bytes** in `public._dim_migrations.checksum` when it applies it. On every later run it re-hashes the file and compares:

- Default mode → a mismatch prints a loud `checksum drift` warning naming the file.
- `--strict` → a mismatch is fatal, exit code **3**, refusing to continue.

Editing an applied file — even a single comment character — changes its hash and trips that fence on every environment that already ran it. The fence is doing its job: it cannot tell a typo fix from someone quietly rewriting SQL that already shipped. So the file stays byte-identical forever and the truth lives here.

---

## E-1 — `0156_mpf_export_format_rule_type.sql`: wrong value counts, contradictory rollback

| | |
|---|---|
| **File** | `db/migrations/0156_mpf_export_format_rule_type.sql` |
| **Lines** | 42–44 (ROLLBACK note), 49–50 (DROP comment), 54 (ADD comment) |
| **Nature** | Comments only. **The SQL is correct** and produced the right constraint. |
| **Recorded** | PO decision 2026-08-04 |

### What the file claims vs. what is true

| Line | The file says | Actually |
|---|---|---|
| 42–44 | re-run 0150's constraint, a "10-value list, **before travel_corridor_requirements**/mpf_export_format" | 10 values is right, but 0150 **already includes** `travel_corridor_requirements` — 0120 added it |
| 49–50 | dropping the "**11-value** list from migration 0150, which already included travel_corridor_requirements" | "already included" is right; the count is **10**, not 11 |
| 54 | re-adding "the **12-value** list" | the new list is **11** values |

The two rollback-adjacent claims also contradict each other: line 43 says 0150 came *before* `travel_corridor_requirements`, line 50 says 0150 *already included* it. Both cannot hold. Line 50's version is the true one.

### The real lineage

| Migration | Values | Change |
|---|---|---|
| `0120_travel_corridor_rule_type.sql` | 9 | adds `travel_corridor_requirements` |
| `0150_microchip_required_rule_type.sql` | 10 | adds `microchip_required` |
| `0156_mpf_export_format_rule_type.sql` | **11** | adds `mpf_export_format` |

0120 and 0150 describe themselves accurately. The counting error starts and ends in 0156.

### Verified against the database

```
$ psql -c "SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
           WHERE t.relname = 'govt_business_rules'
             AND c.conname = 'govt_business_rules_rule_type_valid';"

CHECK ((rule_type = ANY (ARRAY['ppp_breed_list', 'ppp_weight_threshold',
  'ppp_attestation_required_registries', 'physical_credential_channels',
  'microchip_required', 'rabies_observation_window', 'due_soon_window',
  'reminder_windows', 'long_stay_days', 'travel_corridor_requirements',
  'mpf_export_format'])))
```

Eleven values. Matches 0156's SQL, not 0156's prose.

### If you ever roll 0156 back

Its ROLLBACK paragraph is the part most likely to hurt someone, because it is read under pressure. The corrected procedure:

1. `DELETE FROM govt_business_rules WHERE rule_type = 'mpf_export_format';`
2. Re-apply **0150's** constraint — the **10-value** list, which **keeps** `travel_corridor_requirements`. Dropping that value would break travel-corridor rules that 0120 legitimised four migrations earlier.

---

## E-2 — `0181_appointments_one_live_booking_per_pet_offering.sql`: remediation note lacks the operator SQL

| | |
|---|---|
| **File** | `db/migrations/0181_appointments_one_live_booking_per_pet_offering.sql` |
| **Lines** | 35–39 (the "Si el CREATE del índice por campaña falla acá" paragraph) |
| **Nature** | Comments only — an **addendum**, not a falsehood. **The SQL is correct.** |
| **Recorded** | Adversarial review fix 2026-08-14 |

### What is missing

The header correctly says that a failure of the per-campaign `CREATE UNIQUE
INDEX CONCURRENTLY` means the environment holds duplicate confirmed pairs per
(mascota, oferta), and that the fix is cancelling one of the two turnos — but
it never gives the operator the query that FINDS those pairs. Under pressure
(a failed migration on staging), that query should not have to be derived from
the index definition by hand. It is:

```sql
SELECT pet_id, service_offering_id, count(*)
  FROM appointments
 WHERE status = 'confirmed'
 GROUP BY pet_id, service_offering_id
HAVING count(*) > 1;
```

For each row returned: cancel the extra appointment **via the normal flow**
(owner cancel, or an org-side `cancelled_by_org` with a stated reason — never
by deleting history), then re-run the migration. The no-transaction re-run is
safe: the file's `DROP INDEX CONCURRENTLY IF EXISTS` + bare `CREATE` pattern
retries the invalid leftover instead of skipping it (see the file's own
"POR QUÉ SE RECONSTRUYE" section).

### Verified against the index definition

The query's shape is the index's predicate read back: `0181` lines 49–51
create `appointments_one_live_per_pet_offering` as `UNIQUE ... ON appointments
(pet_id, service_offering_id) WHERE status = 'confirmed'`. Grouping by exactly
those two columns under exactly that predicate and keeping `count(*) > 1`
enumerates precisely the rows that violate the uniqueness the CREATE tries to
certify — nothing more, nothing less.

---

## Adding an entry

One `## E-N` section per erratum. Include, in this order: the file, the exact lines, whether SQL or prose is affected, the claim, the truth, and how the truth was verified. Say the verification out loud — an erratum that only asserts is a second unverified claim stacked on the first.

Prose-only errors go here. A **wrong SQL** effect is not an erratum: it is a new forward-only migration that corrects the schema, and the old file stays as the record of what actually ran.
