// adoption_listing lifecycle (lifecycles spec §8).
//
// Opens: adoption_eligibility_set with eligible=true (a refugio marks
// the pet as eligible — opens one listing per (pet, org)).
// Terminal: adoption_eligibility_set with eligible=false (withdraw),
// adoption_finalized triggers post-adoption followup window, the cron
// closes when followup expires.
// Reopen: adoption_reversed reopens the listing — UNIQUE in the system
// (L4 spec). Lifecycle accommodates this with reopenAllowed=true.

import type { CaseLifecycle } from "./types";

export const adoptionListingLifecycle: CaseLifecycle = {
  kind: "adoption_listing",
  statusValues: ["open", "closed"],
  phases: [
    "published_no_apps",
    "reviewing_applications",
    "approved_pending_finalization",
    "finalized_in_followup",
    "closed_resolved",
    "closed_cancelled",
  ],
  opensEvents: [
    {
      eventType: "adoption_eligibility_set",
      whenPayload: (p) => p.eligible === true,
    },
  ],
  terminalEvents: ["adoption_eligibility_set"],
  cronCloseRoute: "/api/cron/close-followup-expired-adoptions",
  cronCloseScheduleHours: 24,
  manualOpenAllowed: false,
  reopenAllowed: true,
};
