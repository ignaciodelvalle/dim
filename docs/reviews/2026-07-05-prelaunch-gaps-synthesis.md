# Pre-launch gap reviews (25–28) — synthesis + triage

Cursor adversarial audits of the PO pre-launch guide's uncovered areas (B/C/E/H).
18 HIGH + 30 MED total. Triaged by launch-blocking severity. Findings are Cursor's
claims — each MUST-FIX is verified before/while remediating.

## 🔴 MUST-FIX before launch (violate a product invariant or a legal duty)

### Corrections don't supersede (violates Invariant #3 — "every view is a projection; a correction is a new event")
- **27-#7** `app/(public)/p/[publicToken]/page.tsx` — the PUBLIC QR credential reads raw `pet_events` with NO `overlayAmendments`/`upcastPayload`: a correction to a wrong `vaccination_administered` never reaches the credential a stranger scans. The public source of truth shows stale/wrong data after a correction.
- **27-#8** `lib/metrics/**` + `lib/analytics/govt-dashboards.ts` + `compliance-metrics.ts` — every raw-SQL aggregate over `pet_events` has NO join to `event_amended`: a corrected vaccination/sterilization/weight never changes rabies coverage, sterilization rate, AMR, or any govt KPI. The old wrong value counts forever. Fix: a shared "latest-corrected-payload" CTE (LATERAL join to newest `event_amended`) reused by every metrics/credential fetcher.
- **27-#11** `upcastPayload` is called from only 3 sites; projections/metrics/modules never call it → a `payload_version` bump silently breaks readers. Add a fitness test / a single always-upcasting payload accessor.

### Right-to-erasure incomplete (Ley 25.326)
- **27-#1** `lib/infra/auth-guards.ts` — `requireUserOrRedirect` never checks `profiles.deletedAt`: a self-erased account still authenticates with a full session.
- **27-#2** `app/actions/subject-rights.ts` — `eraseMySubjectDataAction` never calls `admin.deleteUser`: `auth.users` (email + password hash) survives "erasure" → user logs back in (with #1).
- **27-#3** `erase_subject_data` RPC never redacts `pet_events`/`case_events` payloads → third-party PII (`incident_reported.victim_contact_name/phone`) has no redaction path. Needs a narrow audited redaction (distinct from legit sanitary-record retention).

### Ownership trust chain — concurrency + consent (guide C)
- **26-#4** `owner-accept-return.ts` — the ONE return-to-owner writer missing `pg_advisory_xact_lock` (all siblings have it): an owner accept can execute a proposal that a concurrent actor already cancelled.
- **26-closeCase** TOCTOU — `closeCase` UPDATEs without a `status` predicate in the WHERE: two concurrent closers both succeed → duplicate downstream effects. Fold the guard into the UPDATE + branch on rowCount.
- **26-#5** `transfer-custody.ts` — direct org→org custody handoff is fully UNILATERAL (only checks destination `verified`), while a two-phase propose/accept exists for the same move: one path can dump a pet + full history on an org that never agreed. Route through the handshake or require receiver confirmation.

### Public abuse surface (guide B)
- **25** `app/libreta/compartir/[shareToken]` — the MOST sensitive public surface (full medical history + owner name + chip/tattoo) has NO rate limiting, unlike `/p/[publicToken]`. Add `enforceRateLimit("libreta_share_page", ip, {maxPerMinute:30,maxPerHour:200})`.
- **25** `logScanAction` — zero rate-limit/dedupe → forgeable scan counts.

## 🟠 CUTOVER-CHECKLIST (config/ops, not code)
- **28-#1/#6** Login is unthrottled at the app layer; the `[auth.rate_limit]`/`[auth.captcha]` in `supabase/config.toml` is LOCAL dev config only — no `supabase config push` / dashboard-parity step. VERIFY hosted-project Auth rate limits + enable CAPTCHA before launch. → add to prelaunch checklist.

## 🟡 FAST-FOLLOW (real, not launch-blocking)
- 27-#12 pets.status cache-drift is read-only/manual, no cron, no trigger → schedule a detect-only alert cron (min) or a DB trigger deriving pets.status from pet_events.
- The remaining MEDs across 25–28 (see result files).

## Remediation plan
Wave D (before Vercel close): the corrections-superseding CTE (27-#7/#8/#11), the erasure completion (27-#1/#2/#3), the ownership races/consent (26-#4/closeCase/#5), the share-surface rate limits (25). The auth rate-limit parity (28) → cutover checklist. MEDs + fast-follow → surfaced to PO.

---
## Re-run validation (post-Wave-D) — corrections to this doc
Cursor re-audit of 25/26/27 after remediation found Wave D INCOMPLETE on some points (this doc's "MUST-FIX remediated" claims corrected):
- **25**: both HIGH CLOSED ✓ (logScan + libreta rate-limits verified). MEDs (logLibretaShareView telemetry, /denuncias/codigo lookup throttle) remain → fast-follow.
- **26**: STILL-OPEN HIGH — (a) `expire-pet-transfers.ts` blind status update (no expectedStatus guard → cron stomps a resolved transfer to "expired"); (b) `accept-cross-org-transfer.ts` — the closeCase guard runs AFTER destructive writes + return discarded, so an accept still executes after a concurrent reject/cancel closed the case (needs a lock + pre-write pending re-check, like owner-accept-return got). transfer-custody unilateral remains PO-gated (+ it's the only custody writer with no open-dispute check). → WAVE E1.
- **27**: #1 PARTIAL — `deletedAt` guards `requireUserOrRedirect` but NOT `lib/infra/pet-access.ts` `requirePetAccess`/`requireAlivePetAccess` (the real pet-mutation boundary) nor ~18 raw-`auth.getUser()` action files → erased account can still mutate pets. → WAVE E2. #8 (govt/analyst KPI aggregates don't overlay `event_amended`) is STILL OPEN — D1's `amendedPayloadText` covers priority rabies KPIs only, not all metrics fetchers; this doc's earlier "refuted/already-fixed" was premature. → WAVE E3. #4/#5/#6/#9/#10/#12 (dispute-erasure asymmetry, attachments/storage purge, vet_name anonymization, projections self-overlay, rederivePetCache, cache-drift cron) unchanged → fast-follow/surface.
