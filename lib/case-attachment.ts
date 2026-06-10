// Case attachment rules — one entry per event_type declares how it
// relates to the case system (§7 of the attachment spec).
//
// Modes:
//   `opens`              creates a new case of the declared kind, or
//                        degrades to `attaches-when-open` if one is
//                        already open for the same subject + kind.
//   `requires-open`      the event REQUIRES a matching open case;
//                        server action rejects the insert otherwise.
//   `attaches-when-open` attaches to a matching open case if one
//                        exists; otherwise the event is inserted
//                        standalone (case_id stays null).
//   `optional`           the human actor picks at insert time whether
//                        to attach to one of the compatible open cases.
//   `never`              the event never attaches to a case (libreta
//                        or telemetry only).
//
// Adding a new event_type:
//   1. Add an entry below.
//   2. The coverage test (__tests__/case-attachment.test.ts) enforces
//      every EVENT_TYPES value has a rule.

import type { EventType } from "@/db/schema";
import type { CaseKind } from "@/src/modules/cases/domain/case-kinds";

export type AttachmentMode =
  | "opens"
  | "requires-open"
  | "attaches-when-open"
  | "optional"
  | "never";

export interface BaseAttachmentRule {
  mode: AttachmentMode;
  /** case_kind values this event can attach to. Empty for `never`. */
  compatibleWith: readonly CaseKind[];
  /** When mode='opens', which kind to open. */
  opensKind?: CaseKind;
}

export type AttachmentRule = BaseAttachmentRule & {
  /**
   * Optional branch — narrows the mode/opensKind based on payload.
   * Used by events whose attachment behavior depends on payload
   * (status_changed, incident_reported, adoption_eligibility_set,
   * microchip_replaced, symptom_observed, credential_scanned, etc.).
   */
  branch?: (payload: Record<string, unknown>) => Partial<BaseAttachmentRule>;
};

export const CASE_ATTACHMENT_RULES: Record<EventType, AttachmentRule> = {
  // ---------------------------------------------------------------------
  // Lifecycle (4)
  // ---------------------------------------------------------------------
  pet_registered: { mode: "never", compatibleWith: [] },
  pet_profile_updated: { mode: "never", compatibleWith: [] },
  status_changed: {
    // Branched: 'to_status=lost' opens lost_pet_episode; reverse closes it.
    mode: "never",
    compatibleWith: ["lost_pet_episode"],
    opensKind: "lost_pet_episode",
    branch: (p) => {
      if (p.to_status === "lost") return { mode: "opens", opensKind: "lost_pet_episode" };
      if (p.from_status === "lost" && p.to_status === "active") {
        return { mode: "requires-open", compatibleWith: ["lost_pet_episode"] };
      }
      return { mode: "never", compatibleWith: [] };
    },
  },
  death_recorded: {
    // Hot cascade event — closes multiple cases via cascade-emission.
    // Primary attachment via priority (see attachment spec §7.1).
    mode: "attaches-when-open",
    compatibleWith: [
      "bite_incident",
      "foster_placement",
      "adoption_listing",
      "adoption_application",
      "custody_episode",
      "lost_pet_episode",
    ],
  },

  // ---------------------------------------------------------------------
  // Preventive medicine (3) — libreta only
  // ---------------------------------------------------------------------
  vaccination_administered: { mode: "never", compatibleWith: [] },
  deworming_administered: { mode: "never", compatibleWith: [] },
  sterilization_performed: { mode: "never", compatibleWith: [] },

  // ---------------------------------------------------------------------
  // Medication (3) — libreta only
  // ---------------------------------------------------------------------
  medication_started: { mode: "never", compatibleWith: [] },
  medication_stopped: { mode: "never", compatibleWith: [] },
  medication_dose_taken: { mode: "never", compatibleWith: [] },

  // ---------------------------------------------------------------------
  // Clinical encounters and findings (2)
  // ---------------------------------------------------------------------
  vet_visit_logged: {
    mode: "optional",
    compatibleWith: ["bite_incident", "adoption_listing", "welfare_denuncia", "foster_placement"],
  },
  clinical_info_logged: {
    mode: "optional",
    compatibleWith: ["bite_incident", "welfare_denuncia", "outbreak_investigation"],
  },

  // ---------------------------------------------------------------------
  // Body metrics (1) — libreta only
  // ---------------------------------------------------------------------
  weight_recorded: { mode: "never", compatibleWith: [] },

  // ---------------------------------------------------------------------
  // Identification & legal (5)
  // ---------------------------------------------------------------------
  microchip_implanted: { mode: "never", compatibleWith: [] },
  microchip_replaced: {
    // Branched: only fraud/duplicate reasons open a microchip_remediation case.
    mode: "never",
    compatibleWith: ["microchip_remediation"],
    opensKind: "microchip_remediation",
    branch: (p) => {
      const reason = p.reason;
      if (reason === "fraud_detected" || reason === "duplicate_detected") {
        return { mode: "opens", opensKind: "microchip_remediation" };
      }
      return { mode: "never", compatibleWith: [] };
    },
  },
  tattoo_recorded: { mode: "never", compatibleWith: [] },
  tattoo_updated: { mode: "never", compatibleWith: [] },
  dangerous_breed_attested: { mode: "never", compatibleWith: [] },

  // ---------------------------------------------------------------------
  // Free-form (1) — note_added is polymorphic, the UI picks at insert
  // ---------------------------------------------------------------------
  note_added: {
    mode: "optional",
    compatibleWith: [
      "bite_incident",
      "lost_pet_episode",
      "welfare_denuncia",
      "adoption_listing",
      "adoption_application",
      "custody_dispute",
      "foster_placement",
      "custody_episode",
      "custody_transfer_handshake",
      "foster_proposal",
      "outbreak_investigation",
      "microchip_remediation",
    ],
  },

  // ---------------------------------------------------------------------
  // System / observed (3)
  // ---------------------------------------------------------------------
  credential_scanned: {
    // Attaches to lost_pet_episode when the pet is lost AND it's not a
    // self-scan AND there's an open episode. Otherwise never.
    mode: "never",
    compatibleWith: ["lost_pet_episode"],
    branch: (p) => {
      if (p.is_self_scan === true) return { mode: "never", compatibleWith: [] };
      // The pet.status='lost' precondition is checked at the server-action
      // level (we don't have the pet row here). Default to attaches-when-open;
      // if no episode is open, the helper drops it.
      return { mode: "attaches-when-open", compatibleWith: ["lost_pet_episode"] };
    },
  },
  incident_reported: {
    mode: "never",
    compatibleWith: ["bite_incident"],
    opensKind: "bite_incident",
    branch: (p) => {
      if (p.incident_type === "bite_inflicted") {
        return { mode: "opens", opensKind: "bite_incident" };
      }
      if (p.incident_type === "bite_suffered") {
        return { mode: "attaches-when-open", compatibleWith: ["bite_incident"] };
      }
      return { mode: "never", compatibleWith: [] };
    },
  },
  outbreak_signal: {
    mode: "opens",
    compatibleWith: ["outbreak_investigation"],
    opensKind: "outbreak_investigation",
  },
  // Disease reports power /gob KPI tiles (handoff P4-3) but don't open
  // or attach to a case today — outbreak_signal is the case-opening
  // event. A future "spike detector" worker may attach disease_reported
  // rows to outbreak_investigation cases; for now, never.
  disease_reported: {
    mode: "never",
    compatibleWith: [],
  },

  // ---------------------------------------------------------------------
  // Non-owner reporting flow (3) — bridged from welfare_reports
  // ---------------------------------------------------------------------
  symptom_observed: {
    mode: "never",
    compatibleWith: ["bite_incident", "outbreak_investigation", "welfare_denuncia"],
    branch: (p) => {
      if (p.source === "welfare_report") {
        return { mode: "requires-open", compatibleWith: ["welfare_denuncia"] };
      }
      // The bite-rabies escalation (symptom rabies high-spec during open
      // observation) is dispatched in the server action because it needs
      // pet + bite case lookup. Default to attaches-when-open over
      // outbreak_investigation if signalled.
      return {
        mode: "attaches-when-open",
        compatibleWith: ["bite_incident", "outbreak_investigation"],
      };
    },
  },
  abandonment_reported: {
    mode: "requires-open",
    compatibleWith: ["welfare_denuncia"],
  },
  maltreatment_reported: {
    mode: "requires-open",
    compatibleWith: ["welfare_denuncia"],
  },

  // ---------------------------------------------------------------------
  // Clinical info bundle (1)
  // ---------------------------------------------------------------------
  shelter_intake_recorded: {
    mode: "opens",
    compatibleWith: ["custody_episode"],
    opensKind: "custody_episode",
  },

  // ---------------------------------------------------------------------
  // Custody & adoption (16)
  // ---------------------------------------------------------------------
  adoption_eligibility_set: {
    mode: "never",
    compatibleWith: ["adoption_listing"],
    opensKind: "adoption_listing",
    branch: (p) => {
      if (p.eligible === true) {
        return { mode: "opens", opensKind: "adoption_listing" };
      }
      // eligible=false closes the existing listing. requires-open here
      // — the server action chooses to no-op silently if no listing
      // exists (no-op rather than throw).
      return { mode: "requires-open", compatibleWith: ["adoption_listing"] };
    },
  },
  foster_proposed: {
    mode: "opens",
    compatibleWith: ["foster_proposal"],
    opensKind: "foster_proposal",
  },
  foster_proposal_resolved: {
    mode: "requires-open",
    compatibleWith: ["foster_proposal"],
  },
  foster_co_foster_allowed: {
    mode: "requires-open",
    compatibleWith: ["foster_placement"],
  },
  foster_assigned: {
    mode: "opens",
    compatibleWith: ["foster_placement"],
    opensKind: "foster_placement",
  },
  foster_ended: {
    mode: "requires-open",
    compatibleWith: ["foster_placement"],
  },
  adoption_application_submitted: {
    mode: "opens",
    compatibleWith: ["adoption_application", "adoption_listing"],
    opensKind: "adoption_application",
  },
  adoption_application_resolved: {
    mode: "requires-open",
    compatibleWith: ["adoption_application"],
  },
  adoption_finalized: {
    mode: "requires-open",
    compatibleWith: ["adoption_listing"],
  },
  post_adoption_checkin: {
    mode: "requires-open",
    compatibleWith: ["adoption_listing"],
  },
  adoption_reversed: {
    // Reopens adoption_listing in the unique reopen case. The server
    // action handles the reopen UPDATE separately from the standard
    // attachment helper.
    mode: "requires-open",
    compatibleWith: ["adoption_listing"],
  },
  custody_transferred: {
    // Polymorphic by surrounding context. Resolution lives in the
    // server action that emits it — the helper only knows compatibility.
    mode: "attaches-when-open",
    compatibleWith: [
      "custody_transfer_handshake",
      "custody_episode",
      "lost_pet_episode",
      "adoption_listing",
    ],
  },
  ownership_claimed: {
    // Free pet by definition has no open custody/lost/adoption case — the
    // claim guard requires zero active ownerships before emitting this.
    mode: "never",
    compatibleWith: [],
  },
  custody_transfer_proposed: {
    mode: "opens",
    compatibleWith: ["custody_transfer_handshake"],
    opensKind: "custody_transfer_handshake",
  },
  custody_dispute_raised: {
    mode: "opens",
    compatibleWith: ["custody_dispute"],
    opensKind: "custody_dispute",
  },
  custody_dispute_resolved: {
    mode: "requires-open",
    compatibleWith: ["custody_dispute"],
  },

  // ---------------------------------------------------------------------
  // Bite-rabies observation (2)
  // ---------------------------------------------------------------------
  rabies_observation_started: {
    mode: "requires-open",
    compatibleWith: ["bite_incident"],
  },
  rabies_observation_ended: {
    mode: "requires-open",
    compatibleWith: ["bite_incident"],
  },
};

// ---------------------------------------------------------------------------
// Helper: decideAttachment
// ---------------------------------------------------------------------------

export interface AttachmentDecision {
  /** Existing case to attach to (priority over opening). */
  attachToCaseId?: string;
  /** When set, the server action must open a new case of this kind. */
  opensNewCase?: { kind: CaseKind };
  /** Server action should reject the insert (requires-open with no match). */
  rejectReason?: string;
}

export interface OpenCaseSummary {
  id: string;
  caseKind: CaseKind;
}

/**
 * Decide what to do with `case_id` for a new event. Pure function —
 * given an event_type, its payload, and the list of open cases for the
 * pet (or relevant subject), returns one of three outcomes:
 *   - attachToCaseId — link the event to this case
 *   - opensNewCase — server action must open a case first, then link
 *   - rejectReason — fail the insert with this human-readable reason
 *
 * If nothing applies, returns an empty object (event inserts without
 * case_id).
 */
export function decideAttachment(
  eventType: EventType,
  payload: Record<string, unknown>,
  openCases: ReadonlyArray<OpenCaseSummary>,
): AttachmentDecision {
  const baseRule = CASE_ATTACHMENT_RULES[eventType];
  if (!baseRule) return {};

  // Apply payload branch if present.
  const effective: BaseAttachmentRule = baseRule.branch
    ? { ...baseRule, ...baseRule.branch(payload) }
    : baseRule;

  if (effective.mode === "never") return {};

  // `optional` is up to the human via UI — the helper returns nothing,
  // the action passes the manual selection through.
  if (effective.mode === "optional") return {};

  // Find a compatible open case (first match wins; rare to have more
  // than one of the same kind for a pet — partial unique index enforces).
  const compatible = openCases.filter((c) => effective.compatibleWith.includes(c.caseKind));

  if (effective.mode === "opens") {
    // Degrade to attaches-when-open when a matching one already exists.
    if (compatible.length > 0) {
      return { attachToCaseId: compatible[0].id };
    }
    if (!effective.opensKind) {
      return { rejectReason: `opens mode without opensKind for ${eventType}` };
    }
    return { opensNewCase: { kind: effective.opensKind } };
  }

  if (effective.mode === "requires-open") {
    if (compatible.length === 0) {
      return {
        rejectReason: `Event ${eventType} requires an open case of kind ${effective.compatibleWith.join("|")} for this pet, but none was found.`,
      };
    }
    return { attachToCaseId: compatible[0].id };
  }

  // attaches-when-open: silent no-op when no compatible case is open.
  if (effective.mode === "attaches-when-open") {
    if (compatible.length === 0) return {};
    return { attachToCaseId: compatible[0].id };
  }

  return {};
}
