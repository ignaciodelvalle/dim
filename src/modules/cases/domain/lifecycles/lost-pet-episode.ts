// lost_pet_episode lifecycle (lifecycles spec §6).
//
// Opens: status_changed with to_status='lost'.
// Terminal: status_changed with to_status='active' (recovered) closes
// the episode atomically with the same event. Custody_transferred during
// the episode also closes via return-to-owner handshake.
// Auto-close: cron closes episodes inactive >180 days.
// No reopen — losing the pet again opens a new episode.

import type { CaseLifecycle } from "./types";

export const lostPetEpisodeLifecycle: CaseLifecycle = {
  kind: "lost_pet_episode",
  statusValues: ["open", "closed"],
  phases: [
    "lost_open",
    "match_proposed",
    "lost_closed_resolved",
    "lost_closed_auto_expired",
    "lost_closed_cancelled",
  ],
  opensEvents: [
    {
      eventType: "status_changed",
      whenPayload: (p) => p.to_status === "lost",
    },
  ],
  terminalEvents: ["status_changed", "custody_transferred"],
  cronCloseRoute: "/api/cron/close-stale-lost-episodes",
  cronCloseScheduleHours: 24,
  manualOpenAllowed: false,
  reopenAllowed: false,
};
