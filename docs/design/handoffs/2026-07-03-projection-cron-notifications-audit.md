# Audit — Projection parity · Cron observability · Vaccine notification dedupe

> **Type:** external-agent audit (Cowork) · **Lane:** recommendations only — Claude Code executes.
> **Ground truth:** `integration/all-20260703` @ `12cf68e4` (`git -C C:/dev/dim branch --show-current && git rev-parse --short HEAD`).
> **Protocol:** [`docs/design/handoffs/README.md`](./README.md) — canonical checkout `C:/dev/dim`; never read `.claude/worktrees/**`.
> **Companion docs:** [`docs/design/flow-audit-2026-07.md`](../flow-audit-2026-07.md) (flow completeness), [`docs/archive/2026-06-19-project-critique.md`](../../archive/2026-06-19-project-critique.md) (critique table format).

---

## Executive summary

Three independent audits (2026-07-03) were re-verified against live code at `12cf68e4`. **All three remain open** — no remediation landed on this branch. Severity order for CC:

| # | Theme | Sev | One-line |
|---|--------|-----|----------|
| **A** | `event_amended` projection parity | 🔴 P0 | `applyAmendments()` exists but is never wired to UI/metrics — badge-only overlay |
| **B** | Cron fleet + cache drift visibility | 🔴 P0 | 9/21 crons invisible to `cron_runs`; 3 name mismatches → false health; drift not in admin UI |
| **C** | Vaccine notification dedupe | 🔴 P0 | `relatedEventId` on `vaccine_due` conflicts with migration 0088 — breaks repeat cadence after 1st emit |

Cross-cutting: tests give false confidence (amendment unit-only; vaccine re-emit tests seed history without `relatedEventId`).

---

## How CC should verify (mandatory before acting)

1. **Re-anchor SHA** — same git commands as above; discard this doc if HEAD moved.
2. **Evidence replay** — rerun the commands in §Verification commands; claims without matching output are stale.
3. **Gate after fix** — `pnpm verify` + `pnpm test` green with pasted output; add/adjust tests listed per finding.
4. **Do not** apply migrations to remote DB (PO-gated).

### Verification commands (run on `C:/dev/dim` @ stated SHA)

```powershell
# A — applyAmendments production wiring (expect: only lib + __tests__)
rg -l "applyAmendments\(" --glob "*.ts" --glob "*.tsx"

# B — cron telemetry coverage (expect: 6 files direct; +6 via runCaseCron in case-cron routes)
rg -l "cronRuns" app/api/cron --glob "route.ts"
rg "const CRON_NAME|name: CRON_NAME" app/api/cron --glob "route.ts"
rg '"path":' vercel.json

# C — vaccine_due sets relatedEventId (expect: line in lib/infra/notifications.ts)
rg "relatedEventId" lib/infra/notifications.ts
```

**Replay results @ `12cf68e4`:**

| Command | Result |
|---------|--------|
| `applyAmendments(` files | `lib/infra/amendment.ts`, `__tests__/amendment.test.ts` only |
| `cronRuns` in cron routes | 6 files (direct insert); 6 more use `runCaseCron` → 12/21 instrumented |
| `vercel.json` cron paths | 21 |
| Name mismatches (registry vs route) | `auto_expire_approvals` ↔ `approval_requests_auto_expiry`; `drain_outbox` ↔ `drain-outbox`; `expire_decomiso_handoffs` ↔ `escalate_stale_decomiso_handoffs` |

---

## A — `event_amended` projection parity

### Design intent

`lib/infra/amendment.ts` D2: libreta must show **current value** via latest amendment overlay; original row never mutated.

### Verified gap

| Layer | Status | Evidence |
|-------|--------|----------|
| Storage / writer | ✅ | `event_amended` append-only; `amend-event.ts` |
| `applyAmendments()` | ✅ defined | `lib/infra/amendment.ts:101` |
| Production consumers | ❌ | `rg -l applyAmendments` → test + definition only |
| Shim enrichment | ⚠️ badge-only | `app/actions/pet-tab-data.ts` → `enrichWithAmendments` sets `amendedAt`, not payload |
| Libreta timeline | ❌ | `EventTimeline.tsx:92` → `eventPayloadSummary(event.payload)` + `AmendedBadge` |
| Vaccination KPIs | ❌ | `get-libreta-face-data.ts` → `computeVaccinationSummary(pastEvents)` before amend |
| Compliance / nudges | ❌ | `deriveComplianceState`, `deriveVaccineStatus` read raw payloads |
| Govt SQL KPIs | ❌ | `govt-home-kpis.ts`, `compliance-metrics.ts` → `payload->>'…'` |
| Admin libro | ✅ intentional | audit chain, not clinical overlay |

### Risk

Owner/vet see stale clinical text with “Corregido” badge; compliance stamp and KPIs may use pre-correction values.

### CC resolution

1. Single batch helper: `fetchLatestAmendmentsForEvents` + `applyAmendments(upcastPayload(...))` at read boundary.
2. Wire: `pet-tab-data` shim, `EventTimeline`, event detail, libreta export, share Tier-2, `computeVaccinationSummary` inputs, owner-dashboard compliance inputs.
3. **PO decision:** govt SQL metrics — replay amendments in SQL vs TS projection vs document “as-recorded”.
4. **Tests:** integration test seeded `event_amended` changes visible summary text (not just unit `applyAmendments`).

### Key files

`lib/infra/amendment.ts`, `src/modules/events/application/amendment/fetch-latest-amendments.ts`, `app/actions/pet-tab-data.ts`, `EventTimeline.tsx`, `lib/domain/libreta-health-status.ts`, `lib/projections/pet-compliance.ts`, `scripts/seed-demo-scenario.ts` (D0-3).

---

## B — Cron fleet + cache drift visibility

### Verified gap

**Instrumentation:** 21 crons in `vercel.json`; **9 write no `cron_runs` row:**

`vaccine-due`, `post-adoption-checkin`, `close-rabies-observations`, `materialize-slots`, `business-rules-reeval`, `evaluate-alerts`, `expire-foster-proposals`, `expire-pet-transfers`, `process-eno-queue`.

**Registry drift:** three registries maintained by hand — `vercel.json`, `app/api/cron/cron-health/route.ts` `CRON_REGISTRY`, `lib/analytics/admin-metrics.ts` `CRON_SCHEDULE_MAP`. No `__tests__/cron-registry*.test.ts`.

**False health:** `/admin/sistema/crons` uses registry names; routes write different names (see replay table). `/admin/sistema` card uses `fetchCronRuns()` (DB names) — **two admin surfaces disagree**.

**Semantic health:** `cron-health` checks staleness/failed only. `reconcile_pet_status` with `divergent > 0` still `status='ok'`. No admin UI reads `details.divergent` / sample tokens.

**Cache drift:** `reconcile-pet-status` detects via `rederivePetCache` (detect-only, correct). `scripts/detect-pet-cache-drift.ts` exists; no `package.json` script; no admin card. Scan capped `MAX_PETS_PER_RUN=2000`, no persisted cursor.

**Doc drift:** `process-eno-queue/route.ts` header says “hourly”; `vercel.json` schedule is daily `0 7 * * *`.

### CC resolution

1. Shared `runCronJob({ name, fn })` — migrate 9 blind crons + unify naming.
2. Single `lib/domain/cron-registry.ts` + parity test vs `vercel.json` and route `CRON_NAME`s.
3. Fix three mismatches (pick canonical snake_case; optional one-time SQL alias if needed).
4. Admin card: last `reconcile_pet_status` → `scanned`, `divergent`, sample `publicToken`s.
5. Meta-cron: unhealthy when `details.divergent > 0`.
6. Optional: persist reconcile cursor in `cronRuns.details`.

### Key files

`vercel.json`, `app/api/cron/cron-health/route.ts`, `lib/analytics/admin-metrics.ts`, `app/admin/sistema/page.tsx`, `app/admin/sistema/crons/page.tsx`, `lib/infra/rederive-pet-cache.ts`, `app/api/cron/reconcile-pet-status/route.ts`.

---

## C — Vaccine notification dedupe

### Verified gap

**Conflict with migration 0088:** migration comment says cron notifications (`vaccine-due`, etc.) must keep `related_event_id IS NULL` to allow repeats. `runVaccineDueScan` sets:

```ts
relatedReminderId: row.reminderId,
relatedEventId: row.sourceEventId ?? undefined,  // lib/infra/notifications.ts ~174
```

Partial unique index `notifications_event_natural_key_unique` on `(user_id, related_event_id, notification_type)` WHERE `related_event_id IS NOT NULL` → **second `vaccine_due` for same vaccination event fails** → overdue daily / upcoming 7d cadence broken in production.

**Test blind spot:** `__tests__/vaccine-due-scan.test.ts` `seedNotification()` omits `relatedEventId`; re-emit tests pass with seeded history + scan insert (different keys). `__tests__/notifications.test.ts` asserts first insert has `relatedEventId` but **no second-scan-after-8d-with-same-eventId test**.

**Archive bypass:** throttle history query filters `archived_at IS NULL` → archiving all rows resets `notif_count` to 0 → immediate re-emit.

**Triple UX (no cross-surface dedupe):** same overdue vaccine may show:

- `/inicio` nudge `vaccine_overdue` (`owner-nudges.ts`)
- `/inicio` nudge `reminder_due` (same pet if open reminder)
- `/inicio` Vencimientos card
- `/notificaciones` `vaccine_due` (cron)

Nudge CTA lacks `reminderId`; cron uses `buildReminderVaccineUrl` (14.2 contract).

**Secondary:** `ppp_registration_reminder` no dedupe on `(userId, petId)`; `lib/infra/notifications.ts` still only centralizes vaccine + post-adoption (header TODO).

### CC resolution

1. **P0:** Stop setting `relatedEventId` on `vaccine_due` inserts (align 0088). Throttle already keys on `relatedReminderId`.
2. **Test:** first scan + advance time + second scan with same reminder → 2 rows, no unique violation.
3. Throttle history: count archived rows OR separate throttle anchor.
4. **PO/UX:** suppress `vaccine_overdue` nudge when open vaccine reminder exists; align nudge CTA to `buildReminderVaccineUrl`.
5. Optional: PPP `NOT EXISTS` before insert; per-jurisdiction `reminder_windows` in cron.

### Key files

`lib/infra/notifications.ts`, `app/api/cron/vaccine-due/route.ts`, `db/migrations/0088_eno_durability_idempotency.sql`, `__tests__/vaccine-due-scan.test.ts`, `lib/infra/owner-nudges.ts`, `app/(app)/notificaciones/page.tsx` (`GROUP_MIN = 3`).

---

## Triage matrix (for CC)

| ID | Claim | @ `12cf68e4` | Action |
|----|-------|--------------|--------|
| A1 | `applyAmendments` not wired | verified → **task** | Wire projection boundary + tests |
| A2 | KPIs use raw payload | verified → **task** | Same PR or follow-up with PO call |
| B1 | 9 crons no telemetry | verified → **task** | `runCronJob` wrapper |
| B2 | 3 cron_name mismatches | verified → **task** | Registry SSOT + rename |
| B3 | Drift invisible in admin | verified → **task** | Card + meta-cron semantic check |
| C1 | `relatedEventId` breaks cadence | verified → **task** | Remove from insert |
| C2 | Archive resets throttle | verified → **task** | Fix history query |
| C3 | Triple /inicio + inbox signal | verified → **PO + task** | Nudge suppression rules |
| C4 | PPP dedupe | verified → **task** (P2) | Optional same PR |

---

## Suggested execution order (single PR acceptable per PO default)

1. **C1 + C2 + regression test** — unblocks legal repeat notifications; smallest blast radius.
2. **B1 + B2** — ops visibility; prevents false green dashboards.
3. **A1** — clinical integrity; may touch many read paths — structure as commits: shim → UI → metrics.
4. **C3 + B3 + A2** — UX/PO decisions.

---

## Out of scope

- Auto-repair of cache drift (human-gated; keep detect-only).
- Exposing cron health on `/gob/sistema` (correctly admin-only).
- Mi Argentina / push notifications.

---

*Cowork audit — recommendations only. Claude Code owns verification at execution time.*
