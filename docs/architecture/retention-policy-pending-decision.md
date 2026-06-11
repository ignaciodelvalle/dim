# Data retention (`retention_until`) — pending product/legal decision

**Status: OPEN — requires legal sign-off. No engineering action until then.**
**Date raised: 2026-06-11 (ARCH-G / ARCH-U of the data-architecture remediation series)**

## Context

Four tables carry a `retention_until` column applied by the PII baseline
(`pii.apply_baseline()`). The columns are deliberately **inert**: no writer
sets them and no cron purges by them. The data-lifecycle cron
(`/api/cron/data-lifecycle`, ARCH-G) purges only targets with explicit,
non-PII expiry semantics (notifications, rate-limit buckets, cron_runs).

Wiring retention for the tables below means choosing legal retention periods
for personal data under **Ley 25.326 (Protección de los Datos Personales)**.
That is not an engineering decision. This document captures what the decision
requires so it can be made once, deliberately.

## Tables and the decision each one needs

| Table | PII purpose tag | What retention means here | Open question |
|---|---|---|---|
| `profiles` | personal / identidad | Owner identity: name, DNI (optional), contact | How long after account erasure (`erase_subject_data` soft-delete) may the anonymized husk persist before hard-delete? ARCH-H already unblocked hard-deletion structurally. |
| `pets` | identidad_mascota | The pet credential itself — core registry entity | Is indefinite retention the *explicit* policy (national registry semantics), or does a pet record expire N years after `death_recorded`? |
| `pet_identifications` | identidad_mascota | Microchip/tattoo identifier records | Identifiers are quasi-legal records (chip uniqueness disputes). Same question as pets: indefinite, or N years post-death? |
| `custody_disputes` | auditoria_legal | Legal-proceeding records | Retention is governed by judicial timelines. N years after `resolved_at` / `withdrawn`? Counsel must confirm against prescription periods. |

## What is already true (no decision needed)

- Subject-rights RPCs exist: `erase_subject_data` anonymizes PII on request
  (Ley 25.326 art. 16). Retention is about the *residual* records.
- Hard-deletion of users is structurally possible since ARCH-H (PR #488):
  audit/config rows survive via `ON DELETE SET NULL` actor FKs.
- The purge infrastructure exists (ARCH-G, `lib/data-lifecycle.ts`): once
  periods are defined, wiring is a writer per table + one purge entry in the
  existing cron. Estimated effort: one small PR.

## What the decision must produce

For each table: **(period | indefinite-by-policy)**, the **anchor event** the
period counts from (erasure request, pet death, dispute resolution), and any
**legal-hold override** (e.g. open custody dispute freezes the pet's clock).

## Explicitly rejected alternatives

- **Provisional conservative periods** ("10 years, adjust later"): rejected
  2026-06-11 — provisional legal periods have a way of becoming permanent,
  and a wrong period in either direction is a compliance defect.
- **Error-shape unification (legacy `{error}` vs hexagonal `Result`)** —
  unrelated to retention but recorded here as the other deliberate skip from
  the same review round: the strangler migration converges module-by-module;
  a forced global refactor was judged low-ROI (2026-06-11).

## When the decision lands

1. Record periods + anchors in this file (flip status to DECIDED).
2. Wire writers: set `retention_until` at the anchor event in the same tx.
3. Backfill existing rows from historical anchor data.
4. Add the purge to `runDataLifecyclePurge()` with the same batched-delete
   pattern; legal-hold guards in the WHERE clause.
5. Extend `__tests__/cron-data-lifecycle.test.ts`.
