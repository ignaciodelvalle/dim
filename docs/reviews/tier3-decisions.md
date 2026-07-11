# Tier 3 critique — decisions report (event sourcing)

Core verdict (projections): SOUND — pure/deterministic (no hidden `Date.now()`,
`asOf`/`now` always an explicit param), corrections applied via `overlayAmendments`
(latest wins), `death_recorded` intentionally non-amendable so death stays
terminal, `replayPetStatus` deterministic, reminder-variant boundaries explicit.

Auto-fixed in-loop (see fixer commits): H1 (find→best-provenance), M1 (deceased
guard), M2 (calendar months), M3 (AR_TIME_ZONE expiry).

## Decisions for the PO (judgment-required)

| # | Sev | Finding | Where | Decision |
|---|---|---|---|---|
| **PJ-H2** | HIGH | "Sterilization/microchip compliant?" has TWO definitions. Owner projection requires PROFESSIONAL provenance to count (`clearsObligation`); the panorama/govt choropleth counts ANY event (no provenance filter). Same pet, one owner-declared sterilization → panorama says "covered", owner credential says "Declarada · sin verificar / not al día". Govt "60% esterilización" and owner "al día" measure different populations. | `pet-compliance.ts:165` vs `repository.ts:792,801` | Should the panorama/govt metric also require professional verification? Policy call — aligns the two surfaces or keeps them deliberately different. |
| **PJ-H3** | HIGH | Rabies "Registrada" (vet dose, no `next_due_at`) counts as al-día FOREVER (no currency check) and drives the "AL DÍA" chip; the govt rabies metric requires 12-month currency (`rabiesCurrentlyValidCondition`). A 2018 vet dose reads "al día" to the owner but "not covered" to govt. | `pet-compliance.ts:285`, `lib/metrics/rabies.ts:60` | Add a currency/age gate to the owner "Registrada→ok" so an ancient dose isn't shown al-día? Deliberate UX gate (M5a) vs honesty. |
| PJ-note | LOW | `fetchComplianceStatesForPets` passes `microchipCode: null` so the LIST surface shows "Sin registro" while the profile shows "Microchip declarado" — cosmetic card-label drift, does NOT change the al-día count. | `owner-dashboard.ts:1257` | Pass the real code to the list? Cosmetic. |

## Event log (append-only) — spine SOUND (DB-enforced, not convention)

Verified clean: append-only enforced by BEFORE UPDATE/DELETE triggers that RAISE
(mig 0127 — exists because an audit caught the triggers were bootstrap-only); no
unaudited mutation path (erasure + scan-purge are the only audited escapes);
amend IDOR-fenced to the pet; no double-count (corrections are separate
`event_amended` rows, overlaid not added); event-type validated at write with a
compile-time literal; deterministic `(occurredAt, recordedAt, id)` ordering;
idempotency on ~23 writers. Auto-fixed in-loop: F1 (amend idempotency), F3
(tiebreaker parity).

| # | Sev | Finding | Where | Decision |
|---|---|---|---|---|
| EL-F2 | LOW | `event_type` is `text` with NO DB CHECK against the catalog and no DB payload validation (deliberate — new types need no migration). Asymmetry: append-only got a hard trigger, type/shape validity rests on app `tsc`+Zod. A raw-SQL/BYPASSRLS path could append an off-catalog type or malformed payload that projections read as silent NULLs. | `db/schema.ts:1096` | Add a trigger-based catalog+shape check parallel to append-only? The schema comment argues against it (migration-free new types). Posture call. |

## Rabies observation / bites — arithmetic SOUND, INPUT ANCHOR was wrong

Verified clean: deadline arithmetic DST-proof (`setDate(+10)`, not +240h); status
event-derivable via `replayPetRabiesObservation` + drift-detection harness; close
authorization fenced (govt jurisdiction-scoped, owner hard-limited to
negative/≥10d/no-escalation). Auto-fixed in-loop: the midnight-UTC bite-date
anchor (HIGH), + close-estimate timeZone + an integration test feeding a bare date.

| # | Sev | Finding | Where | Decision |
|---|---|---|---|---|
| **RO-M1** | MED | Deadline-passed + escalating symptom leaves the pet `in_progress` and fires an URGENT "observación vencida" notification to authorities — but the next daily cron re-scans and **re-fires the same urgent alert every day** (no dedup marker). Happy path is idempotent; the escalation path is not. | `close-eligible-observations.ts:131-166` | Add an "already flagged for review" state/marker. Needs a small state-machine change (not mechanical). |
| RO-L1 | LOW | No DB unique constraint enforcing ≤1 open observation per pet. Two concurrent different-key bite reports could both pass the app-level `in_progress` check and open two. Last-wins projection prevents catastrophic corruption; two open `bite_incident` cases result. | `surveillance/actions.ts:112,279` | Partial-unique index on (pet, open)? Low likelihood. |
| **RO-PII?** | ? | UNVERIFIED two-party leak: does the biting pet's OWNER see the victim's contact PII (`victim_contact_name`/`phone`) in their own pet's event ledger? The `incident_reported` payload stores it; the notifications don't leak it, but the ledger renderer's redaction is unverified. **Being investigated (read-only) — will surface, not auto-fix.** | `incident_reported` payload, `mis-mascotas/[publicToken]` ledger | If it leaks → redaction decision (Tier-1-class). |
