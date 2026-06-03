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
// Phases (lifecycles spec L1): phases are subdivisions of status='open'. The
// only open phase is pending_response. The outcomes (accepted / rejected /
// cancelled / expired) are discriminated by closed_reason/payload — they are
// NOT phases; they describe a closed case.
//
// Cron close: NOT wired yet. The cron /api/cron/expire-foster-proposals already
// exists and marks foster_proposals rows expired, but proposeFosterAction does
// NOT open a cases row (no INSERT cases in the transaction). cronCloseRoute is
// set to null until the case-opening action is implemented and a case_id column
// is linked to foster_proposals, at which point the cron can look up and close
// the cases row.
//
// No reopen — if a volunteer declines, the org opens a new proposal.

import type { CaseLifecycle } from "./types";

export const fosterProposalLifecycle: CaseLifecycle = {
  kind: "foster_proposal",
  statusValues: ["open", "closed"],
  // pending_response is the only genuine open phase (lifecycles spec L1: phases
  // are subdivisions of status='open'). accepted / rejected / cancelled / expired
  // are closed outcomes — discriminated by closed_reason/payload, not phases.
  phases: ["pending_response"],
  opensEvents: [
    {
      eventType: "foster_proposed",
    },
  ],
  terminalEvents: ["foster_proposal_resolved"],
  // cronCloseRoute is null because proposeFosterAction does not yet open a
  // cases row. The cron wiring lands together with the case-opening action
  // (foster_proposed → INSERT cases). See comment above.
  cronCloseRoute: null,
  cronCloseScheduleHours: 0,
  manualOpenAllowed: false,
  reopenAllowed: false,
};
