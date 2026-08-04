# Deprecated event types (2026-05-19 catalog cleanup)

Moved out of AGENTS.md on 2026-08-04: this is a historical mapping, not a rule an
agent needs in-context. The live catalog is `EVENT_TYPES` in `db/schema.ts` and the
Zod registry in `lib/events/event-schemas.ts` — neither contains the types below, so
nothing can write them. Kept because the replacement column explains what a reader
who meets one of these names in an old plan or seed script should look for instead.

These event_types existed in earlier versions but are no longer written by any flow. **Note:** DB will be wiped before the next migration cycle (per 2026-05-19 catalog cleanup plan), so historical rows with these types will not be preserved — no catch-all renderer required. The Zod registry has dropped them; any seed scripts that still write them are stale and will be regenerated post-wipe.

| Deprecated                       | Replacement                                                            | Deprecated since |
| -------------------------------- | ---------------------------------------------------------------------- | ---------------- |
| `lab_work_performed`             | `clinical_info_logged` with `sub_kind='lab_work'`                      | 2026-05-18       |
| `imaging_performed`              | `clinical_info_logged` with `sub_kind='imaging'`                       | 2026-05-18       |
| `surgery_performed`              | `clinical_info_logged` with `sub_kind='surgery'`                       | 2026-05-18       |
| `allergy_detected`               | `clinical_info_logged` with `sub_kind='allergy_detection'`             | 2026-05-18       |
| `adoption_application_reviewed`  | Application-table status field already captures the "in review" stage | 2026-05-18       |
| `foster_proposal_accepted`       | `foster_proposal_resolved` with `outcome='accepted'`                   | 2026-05-19       |
| `foster_proposal_rejected`       | `foster_proposal_resolved` with `outcome='rejected'`                   | 2026-05-19       |
| `foster_proposal_cancelled`      | `foster_proposal_resolved` with `outcome='cancelled'`                  | 2026-05-19       |
| `foster_proposal_expired`        | `foster_proposal_resolved` with `outcome='expired'`                    | 2026-05-19       |
| `adoption_application_approved`  | `adoption_application_resolved` with `outcome='approved'`              | 2026-05-19       |
| `adoption_application_rejected`  | `adoption_application_resolved` with `outcome='rejected'`              | 2026-05-19       |
| `adoption_revoked`               | `adoption_reversed` with `actor='shelter'` or `'court'`                | 2026-05-19       |
| `adoption_withdrawn`             | `adoption_reversed` with `actor='adopter'`                             | 2026-05-19       |
| `libreta_shared_viewed`          | Moved out of `pet_events` into the `share_telemetry` table             | 2026-05-19       |
| `microchip_revoked`              | `microchip_replaced` with `new_chip_number=null`                       | 2026-05-19       |

