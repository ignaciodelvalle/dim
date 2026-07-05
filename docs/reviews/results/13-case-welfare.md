## Adversarial review — CASE & WELFARE

**clean:** `case_events` append-only — `db/migrations/0121_case_events_append_only.sql` + `db/triggers.sql` mirror `pet_events` (UPDATE/DELETE blocked; accountable GUC override only).

1. `src/modules/welfare/application/confirm-welfare-as-spam.ts:64` · Spam confirm sets `welfare_reports.status='invalid'` but never `closeCase()` → linked `welfare_denuncia` case stays `open` · **HIGH** · In the same tx, if `report.caseId`, call `closeCase({ caseId, reason: 'cancelled', closedByUserId })`.

2. `lib/analytics/govt-home-kpis.ts:701` · `WELFARE_TERMINAL_STATUSES` omits `'invalid'` while `govt-dashboards.ts:1177` includes it → spam/invalid denuncias count as active in `open_welfare_reports` KPI · **HIGH** · Use `['closed','invalid','duplicate']` (shared constant with `welfare-status-rules.ts`).

3. `lib/analytics/owner-dashboard.ts:441` · Owner workflow uses `ne(status,'closed')` only → `invalid`/`duplicate`/`in_progress` all surface as “open denuncia” · **HIGH** · Filter with `isTerminalStatus()` / `TERMINAL_STATUSES` from `welfare-status-rules.ts`.

4. `src/modules/custody-disputes/application/resolve-dispute.ts:181` · `ownership_transferred` hardcodes `from_role:'owner'` and null `from_*` after blind-ending all ownership rows · **HIGH** · Snapshot active holder(s) before close and populate `from_user_id`/`from_organization_id`/`from_role` from that row.

5. `src/modules/cases/infrastructure/cases-repository.ts:196` · `reopenCase()` reopens any non-`open` case without `reopenAllowed`, and leaves `supersededByCaseId` set → illegal `merged→open` / stale merge pointer · **MED** · Reject unless `reopenAllowed(kind)`; reject `status==='merged'`; clear `supersededByCaseId` on reopen.

6. `src/modules/welfare/application/close-welfare-report.ts:80` · Welfare triage/close/escalate crons update `cases.status` with audit_log only—no `case_events` (`case_closed`/`case_escalated`) unlike outbreak path · **MED** · Insert matching `case_events` in the same tx as every `cases` status mutation.

7. `src/modules/cases/application/escalate-stale-welfare-cases.ts:87` · Stale-welfare cron sets `cases.status='escalated'` with zero timeline row · **MED** · Append `case_events` row `entryType='case_escalated'` in that tx.

8. `src/modules/welfare/application/confirm-welfare-as-spam.ts:55` · Moderation bypasses `statusTransitionAllowed()` → can force `invalid` from any flagged, non-resolved state · **MED** · Require `statusTransitionAllowed(report.status,'invalid')` (or reject terminal reports) before patch.

9. `src/modules/custody-disputes/application/withdraw-dispute.ts:46` · Withdrawal closes linked case + writes audit only—no `custody_dispute_resolved`/`case_events` terminal entry · **MED** · Emit append-only terminal event (`case_events` or structured pet event) in the same tx.

10. `src/modules/custody-disputes/application/add-dispute-party.ts:62` · No dedup on `(disputeId, partyUserId|partyOrganizationId, partyRole)` → duplicate party rows · **MED** · Pre-insert lookup or partial unique index.

11. `src/modules/custody-disputes/application/resolve-dispute.ts:290` · Resolution notifications iterate `partyUserId` only → org parties (`claimant_org`/`current_org_custody`) never notified · **MED** · Fan out to org membership admins when `partyOrganizationId` is set.

12. `lib/analytics/owner-dashboard.ts:623` · Open-case sweep uses `ne(cases.status,'closed')` → `merged`/`escalated` cases show as open workflows · **MED** · Use `inArray(cases.status, ['open','escalated'])` (or explicit open set).

13. `db/schema.ts:3383` · `cases.status` is unconstrained `text`—no DB CHECK on `CaseStatus` values (unlike `custody_disputes_status_valid`) · **MED** · Add `cases_status_valid` CHECK on `open|escalated|closed|merged`.

14. `src/modules/welfare/infrastructure/welfare-repository.ts:149` · `updateStatus()` applies arbitrary patches—comment says callers should validate but repo does not enforce `welfare-status-rules` · **MED** · When `patch.status` present, call `statusTransitionAllowed(current, patch.status)` or reject.

15. `src/modules/welfare/application/assign-welfare.ts:43` · Assignment ignores welfare terminal states—can assign `invalid`/`duplicate`/`closed` reports · **MED** · Reject when `isTerminalStatus(report.status)`.

**clean (other lenses):** Dual-track `CaseStatus` vs `welfare_report_status` is intentional in `welfare-denuncia.ts` lifecycle and `/gob/maltrato` UI maps welfare enum explicitly (`app/gob/maltrato/[id]/page.tsx:86`); `closeCase`/`escalateCase` correctly no-op on `closed`/`merged` and block re-escalation (`cases-repository.ts:145`,`178`). No `mergeCase` writer found—`merged` is schema-only today; risk is via `reopenCase` (#5).
