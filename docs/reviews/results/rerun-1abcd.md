# Re-validation runs 1a–1d (post-Wave-A/E) — for the record

Cursor re-audits of the touched prior reviews. Findings drove Wave F (F2/F3/F4).

## 1a — cron reliability (review 23) → Wave F2
CLOSED (16 HIGH, Wave A): withCronRun partial-failure, close-rabies/process-eno/auto-expire 200-on-fail, 6 runCaseCron routes, cron-health paging, drain-outbox/eno schedules, materialize-slots/business-rules-reeval/vaccine-due/transfers/case-finders unbounded scans, decomiso-handoffs schedule, dead-letter staleness.
STILL-OPEN (MED, fixed in F2): expire-pet-transfers, expire-foster-proposals, drain-notification-dead-letter, purge-scan-events, data-lifecycle, reconcile-pet-status (all 200-on-failure); foster.expirePendingProposals, surveillance.findPetsInProgress (unordered-limit — froze rabies auto-close), scan-retention, data-lifecycle, rate-limit cleanup, record-firings (unbounded); business-rules-reeval nextPetId persistence.

## 1b — tenant isolation (review 24) → Wave F3
HIGH: closed (7/7, Wave A2). STILL-OPEN (MED, fixed in F3): decomiso combobox nationwide, maltrato nationwide fallback, custody-disputes lookup-transfer-target (no dispute scope), intake.ts session-default org, foster actions session-default, adoption actions session-default, transitos endedAt IS NULL. (`requireCapabilityForOrgToken` became the canonical guard.)

## 1c — projections / corrections-supersede (review 02) → CLEAN
Public credential /p: clean (overlayAmendments via credential-badges; Tier-0/2 are existence-based). lib/metrics: clean for amendable fields (amendedPayloadText threaded through rabies/trends/population-control; sterilization is EXISTS). Out of scope (fast-follow): lib/projections self-overlay, rederive-pet-cache, govt-dashboards partial (to_status lost).

## 1d — cache-event pairing (review 22) → Wave F4
CLOSED: profile weight (pet-weight.ts), jurisdiction FULL-LOCK #40. STILL-OPEN (MED, fixed in F4): business-rules-reeval PPP flip without event, correctSpecies PPP not in event changes[], amend-event doesn't refresh pets cache for weight/jurisdiction/pregnancy amendments.

## Option 2 — MED triage → docs/reviews/results/med-triage.md
17 MED/LOW → 5 pilot-blocking (erasure RPC, free claim, leaked-passwords, signup enum, flood-by-token). Flood = atender, now rate-limited (F6). Erasure-RPC/free-claim/signup-enum = deferred fast-follows. Leaked-passwords = PO dashboard.
