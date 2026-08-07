"use server";

// amendment.ts — thin shim (strangler migration 27/61, 2026-06-30).
//
// Business logic moved to:
//   src/modules/events/application/amendment/
//
// Auth model (D3 — capability by access path):
//   - Owner path: requireAlivePetAccess. Reason optional (nullable).
//   - Admin/govt (D5): reason mandatory (≥5 chars), audit_log row inserted,
//     owner notification sent ("admin_event_amended").
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { requireAlivePetAccess } from "@/lib/infra/pet-access";

import { amendEvent as _amendEvent } from "@/src/modules/events/application/amendment/amend-event";
import type {
  AmendEventInput,
  AmendEventResult,
} from "@/src/modules/events/application/amendment/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  AmendEventInput,
  AmendEventResult,
  AmendmentSummary,
} from "@/src/modules/events/application/amendment/types";

// ---------------------------------------------------------------------------
// Action wrapper — thin controller for UI components
// ---------------------------------------------------------------------------

export async function amendEventAction(input: AmendEventInput): Promise<AmendEventResult> {
  // --- 1. Auth gate ---------------------------------------------------------
  const access = await requireAlivePetAccess(input.publicToken);
  if (!access.ok) {
    return { ok: false, error: access.error };
  }
  const { user, pet } = access;

  return _amendEvent(user, pet, access.eventAuthorship, input);
}

// fetchLatestAmendmentsForEvents is intentionally NOT re-exported here: it is
// an unguarded projection query, so exporting it from a "use server" file
// would make it an independently-addressable server action (read leak — authz
// triage 2026-07-04). Server components import it from
// src/modules/events/application/amendment/fetch-latest-amendments.
