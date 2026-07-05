**pet_events catalog (48 types)**

1. `src/modules/surveillance/infrastructure/surveillance-repository.ts:255` · `insertIncidentEventIdempotent`/`insertObservation*` write raw `petEvents` without `validatedEventValues` (unlike `EventsRepository`/`WelfareRepository.insertPetEvent`) · **MED** · wrap every surveillance insert with `validatedEventValues(values)` before `.values()`.

2. `src/modules/welfare/infrastructure/welfare-repository.ts:440` · `insertCaseEvent` persists unchecked `entryType` + `payload` JSONB (no Zod registry) · **MED** · add per-`entryType` Zod schemas and validate at the repository boundary.

3. `db/schema.ts:3538` · `CASE_EVENT_ENTRY_TYPES` omits live writers `org_intervention_taken`, `org_intervention_note`, `org_intervention_return` (used in `take-derived-report.ts:108`, `return-derived-report.ts:108`, `govt-dashboards.ts:1430`) · **MED** · extend the const (or enforce via Zod) so TS catalog matches production entry types.

4. `lib/events/events.ts:426` · `eventPayloadSummary` reads `symptoms` but `symptomObserved` schema field is `free_text` (`event-schemas.ts:917`) · **MED** · summary from `free_text` (Libreta/asiento default path for `symptom_observed`).

5. `lib/events/events.ts:91-167` · `eventPayloadDetails` has no cases for libreta types `tattoo_recorded`, `tattoo_updated`, `rabies_observation_started`, `rabies_observation_ended`, `incident_reported` — `asiento-fields.ts:325-335` default renders title-only · **MED** · add whitelisted detail cases (or dedicated `toAsientoView` templates).

6. `components/pet-profile/asiento-fields.ts:244` · deworming asiento reads `dose`; `dewormingAdministered` schema has no `dose` (`event-schemas.ts:230-243`) · **LOW** · drop the row or add optional `dose` to schema + writers.

7. `components/pet-profile/asiento-fields.ts:205` · vaccination asiento reads `route`; `vaccinationAdministered` has no `route` (`event-schemas.ts:204-217`) · **LOW** · drop “Vía” or add `route` to schema + writers.

8. `lib/events/events.ts:477` · `adoption_application_resolved` checks `str("auto_generated") === "true"` but schema types `auto_generated` as `boolean` (`event-schemas.ts:1300+`) · **LOW** · use `p.auto_generated === true`.

9. `__tests__/event-schemas.test.ts:42` · test titled “no schema” throws on `{}` for `shelter_intake_recorded` (schema exists; failure is missing required keys) · **LOW** · assert against a genuinely unregistered type or rename test to “invalid payload”.

10. `lib/events/event-schemas.ts:48-50` · comment documents legacy `pet_registered` mixed-case rows with no read-path upcaster (only `adoption_application_submitted` registered in `event-upcasters.ts:39`) · **LOW** · add `pet_registered` v0→v1 upcaster if those rows still surface in projections.

**Clean**

- `lib/events/event-schemas.ts` ↔ `db/schema.ts` `EVENT_TYPES`: **48/48** `PayloadSchemas` entries; `UNIMPLEMENTED` empty (`__tests__/event-schemas.test.ts:25`).
- `pet_events.event_type` is **text** (not a PG enum) — no DB/TS enum drift for event types.
- `author_role` PG enum includes `finder` (`db/schema.ts:106-114`), used by `encontre/action.ts:279`.
- Template + `eventPayloadDetails` paths: internal `*_id` / hash keys blocked from DOM (`__tests__/event-payload-details.test.ts:29-44`, `LibretaFace.test.tsx:75-90`).
- Surveillance **use-cases** call `validateEventPayload` before repo insert (`report-bite.ts:118`, `professional-close-observation.ts:112`); gap is repository backstop (#1), not missing schemas.
- `adoption_application_submitted` v2 write + v1→v2 upcaster (`event-schemas.ts:1271`, `event-upcasters.ts:42-49`) — versioning pattern is sound for that type.
