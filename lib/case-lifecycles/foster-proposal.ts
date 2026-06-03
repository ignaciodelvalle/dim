// foster_proposal lifecycle (attachment spec §7.10 + foster-volunteers-pool spec §4.5).
//
// Two-phase foster-pool flow (org → volunteer):
//   Phase 1 (Proposal): org emits foster_proposed → opens the case.
//   Phase 2 (Resolution): foster_proposal_resolved closes the case.
//     outcome='accepted'  → cascade emits foster_assigned → opens foster_placement.
//     outcome='rejected'  → closed_reason='resolved', no cascade.
//     outcome='cancelled' → org cancelled their own proposal, closed_reason='cancelled'.
//     outcome='expired'   → cron auto-expires after 7 days, closed_reason='auto_expired'.
//
// Cron: /api/cron/expire-foster-proposals (already exists) runs daily and emits
// foster_proposal_resolved(outcome=expired) for pending proposals past expires_at.
// No reopen — if a volunteer declines, the org opens a new proposal.

import type { CaseLifecycle } from "./types";

export const fosterProposalLifecycle: CaseLifecycle = {
  kind: "foster_proposal",
  statusValues: ["open", "closed"],
  phases: ["pending_response", "accepted", "rejected", "cancelled", "expired"],
  opensEvents: [
    {
      eventType: "foster_proposed",
    },
  ],
  terminalEvents: ["foster_proposal_resolved"],
  cronCloseRoute: "/api/cron/expire-foster-proposals",
  cronCloseScheduleHours: 24,
  manualOpenAllowed: false,
  reopenAllowed: false,
};
