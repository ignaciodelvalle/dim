// Case helpers used by every server action that opens / closes / queries
// cases. Wraps `db.insert(cases)` and `db.update(cases)` with the
// invariants the schema CHECK constraints enforce: public_code
// generation, status/closed consistency, opened_reason floor.
//
// These helpers do NOT touch `pet_events.case_id` — that's caller
// responsibility (the same transaction that inserts the event also
// links it). The split keeps each helper single-purpose.

import { and, eq, inArray, sql } from "drizzle-orm";

import { type Case, type NewCase, cases, db } from "@/db";
import type { CaseKind } from "./case-kinds";
import { generatePrefixedToken } from "./publicToken";

/**
 * Drizzle's transaction callback parameter. Server actions that need
 * to open/close cases atomically with their pet_event inserts pass the
 * `tx` from `db.transaction` into these helpers via the optional
 * executor argument.
 */
type CaseExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

// ---------------------------------------------------------------------------
// public_code generator (CAS-XXXX-XXXX)
// ---------------------------------------------------------------------------

const MAX_CODE_RETRIES = 5;

/**
 * Allocate a new unique CAS-XXXX-XXXX code. Retries on the very rare
 * collision with the unique index. The base entropy is ~8.5e11 — five
 * retries is plenty.
 *
 * Accepts an optional executor so it can run inside a transaction
 * alongside the `cases` INSERT it's about to feed.
 */
export async function generateUniqueCasePublicCode(executor: CaseExecutor = db): Promise<string> {
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
    const candidate = generatePrefixedToken("CAS");
    const [existing] = await executor
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.publicCode, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  throw new Error("generateUniqueCasePublicCode: exhausted retries");
}

// ---------------------------------------------------------------------------
// openCase
// ---------------------------------------------------------------------------

export interface OpenCaseInput {
  kind: CaseKind;
  primarySubjectKind: "registered_pet" | "unowned_animal" | "location" | "general";
  primaryPetId?: string | null;
  primaryLocationLat?: string | null;
  primaryLocationLng?: string | null;
  applicantUserId?: string | null;
  jurisdictionCountry?: string;
  jurisdictionProvince?: string | null;
  jurisdictionLocality?: string | null;
  openedByUserId?: string | null;
  openedByOrganizationId?: string | null;
  /** custody_transfer_handshake only: canonical receiver org id. */
  receiverOrganizationId?: string | null;
  /** Required ≥ 10 chars when manual; auto-open events pass an "auto: ..." string. */
  openedReason: string;
  welfareReportId?: string | null;
  adoptionApplicationId?: string | null;
  custodyDisputeId?: string | null;
  parentListingCaseId?: string | null;
}

/**
 * Insert a new case row. Throws if the insert would violate any
 * CHECK constraint (opened_reason length, subject consistency, etc.).
 * The caller is responsible for picking an appropriate kind and for
 * setting up the jurisdiction from the subject pet (or the location).
 *
 * Pass `executor` (the tx from `db.transaction`) to land the case row
 * atomically with the triggering pet_event in the same transaction.
 */
export async function openCase(input: OpenCaseInput, executor: CaseExecutor = db): Promise<Case> {
  const publicCode = await generateUniqueCasePublicCode(executor);
  const values: NewCase = {
    publicCode,
    caseKind: input.kind,
    status: "open",
    primarySubjectKind: input.primarySubjectKind,
    primaryPetId: input.primaryPetId ?? null,
    primaryLocationLat: input.primaryLocationLat ?? null,
    primaryLocationLng: input.primaryLocationLng ?? null,
    applicantUserId: input.applicantUserId ?? null,
    jurisdictionCountry: input.jurisdictionCountry ?? "AR",
    jurisdictionProvince: input.jurisdictionProvince ?? null,
    jurisdictionLocality: input.jurisdictionLocality ?? null,
    openedByUserId: input.openedByUserId ?? null,
    openedByOrganizationId: input.openedByOrganizationId ?? null,
    receiverOrganizationId: input.receiverOrganizationId ?? null,
    openedReason: input.openedReason,
    welfareReportId: input.welfareReportId ?? null,
    adoptionApplicationId: input.adoptionApplicationId ?? null,
    custodyDisputeId: input.custodyDisputeId ?? null,
    parentListingCaseId: input.parentListingCaseId ?? null,
  };
  const [row] = await executor.insert(cases).values(values).returning();
  return row;
}

// ---------------------------------------------------------------------------
// closeCase
// ---------------------------------------------------------------------------

export interface CloseCaseInput {
  caseId: string;
  reason: "resolved" | "cancelled" | "auto_expired";
  closedByUserId?: string | null;
}

/**
 * UPDATE `cases` setting status='closed', closed_reason, closed_at,
 * closed_by_user_id. Idempotent: closing an already-closed case is a
 * no-op (returns the existing row).
 */
export async function closeCase(
  input: CloseCaseInput,
  executor: CaseExecutor = db,
): Promise<Case | null> {
  const [existing] = await executor.select().from(cases).where(eq(cases.id, input.caseId)).limit(1);
  if (!existing) return null;
  if (existing.status === "closed" || existing.status === "merged") {
    return existing;
  }
  const [updated] = await executor
    .update(cases)
    .set({
      status: "closed",
      closedReason: input.reason,
      closedAt: new Date(),
      closedByUserId: input.closedByUserId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(cases.id, input.caseId))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// escalateCase
// ---------------------------------------------------------------------------

export async function escalateCase(caseId: string): Promise<Case | null> {
  const [existing] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  if (!existing) return null;
  if (existing.status !== "open") return existing;
  const [updated] = await db
    .update(cases)
    .set({ status: "escalated", updatedAt: new Date() })
    .where(eq(cases.id, caseId))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// reopenCase — only used by adoption_reversed (L4)
// ---------------------------------------------------------------------------

export async function reopenCase(caseId: string): Promise<Case | null> {
  const [existing] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  if (!existing) return null;
  if (existing.status === "open") return existing;
  const [updated] = await db
    .update(cases)
    .set({
      status: "open",
      closedReason: null,
      closedAt: null,
      closedByUserId: null,
      updatedAt: new Date(),
    })
    .where(eq(cases.id, caseId))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Open cases for a pet. Used by `decideAttachment` to know what to
 * attach a new event to. Caps at 50 because a pet with more than that
 * would already be in trouble.
 */
export async function findOpenCasesForPet(
  petId: string,
): Promise<Array<{ id: string; caseKind: CaseKind }>> {
  const rows = await db
    .select({ id: cases.id, caseKind: cases.caseKind })
    .from(cases)
    .where(and(eq(cases.primaryPetId, petId), inArray(cases.status, ["open", "escalated"])))
    .limit(50);
  return rows as Array<{ id: string; caseKind: CaseKind }>;
}

/**
 * One open case for (pet, kind). Returns null when none. The partial
 * unique index in the schema guarantees at most one match for
 * non-multi-applicant kinds.
 */
export async function findOpenCaseForPetAndKind(
  petId: string,
  kind: CaseKind,
  executor: CaseExecutor = db,
): Promise<Case | null> {
  const [row] = await executor
    .select()
    .from(cases)
    .where(
      and(
        eq(cases.primaryPetId, petId),
        eq(cases.caseKind, kind),
        inArray(cases.status, ["open", "escalated"]),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * For adoption_application — finds an open case for (pet, kind, applicant).
 * Returns null when none.
 */
export async function findOpenAdoptionApplicationCase(
  petId: string,
  applicantUserId: string,
): Promise<Case | null> {
  const [row] = await db
    .select()
    .from(cases)
    .where(
      and(
        eq(cases.primaryPetId, petId),
        eq(cases.caseKind, "adoption_application"),
        eq(cases.applicantUserId, applicantUserId),
        inArray(cases.status, ["open", "escalated"]),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * For adoption_listing — finds an open case for (pet, kind, org).
 */
export async function findOpenAdoptionListingCase(
  petId: string,
  orgId: string,
): Promise<Case | null> {
  const [row] = await db
    .select()
    .from(cases)
    .where(
      and(
        eq(cases.primaryPetId, petId),
        eq(cases.caseKind, "adoption_listing"),
        eq(cases.openedByOrganizationId, orgId),
        inArray(cases.status, ["open", "escalated"]),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Marker for cascade-emitted events
// ---------------------------------------------------------------------------
//
// Every cascade event payload must carry `triggered_by_event_id` so the
// UI can render "este foster_ended se generó automáticamente por la
// muerte del animal el ___". The constant lives here so all writers
// reference the same string.

export const CASCADE_TRIGGER_PAYLOAD_KEY = "triggered_by_event_id";

/**
 * Build the partial payload that flags an event as cascade-emitted.
 * Spread into the event payload at insert time.
 */
export function cascadeTriggerPayload(triggerEventId: string): Record<string, string> {
  return { [CASCADE_TRIGGER_PAYLOAD_KEY]: triggerEventId };
}

/**
 * Sanity check at the read side. Returns true if the event payload
 * carries the cascade marker. Useful for the case timeline UI to mark
 * "auto" events visually.
 */
export function isCascadeEvent(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  return CASCADE_TRIGGER_PAYLOAD_KEY in (payload as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// SQL helpers re-exported for callers that need raw queries
// ---------------------------------------------------------------------------
export { eq, and, inArray, sql };
