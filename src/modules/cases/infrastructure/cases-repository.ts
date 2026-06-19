// CasesRepository — Drizzle wrapper for all cases write operations.
// Wraps the same DB logic as lib/case-helpers.ts with identical parity quirks:
//   - closeCase/escalateCase idempotency: already-closed/merged → return existing
//   - public_code generator uses the SAME executor as the insert
//   - reopenCase runs on db ONLY (no tx param) — preserved exactly
//   - All methods accept optional tx for atomicity with caller's pet_event
//
// Returns Drizzle Case rows — callers already type them as Case.
// No auth logic — auth lives at the action / use-case edge.

import { and, eq, inArray } from "drizzle-orm";

import { type Case, type NewCase, cases, db } from "@/db";
import { generatePrefixedToken } from "@/lib/publicToken";
import type { CaseKind } from "@/src/modules/cases/domain/case-kinds";

// ---------------------------------------------------------------------------
// Type aliases (matching lib/case-helpers.ts exactly)
// ---------------------------------------------------------------------------

type CaseExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

const MAX_CODE_RETRIES = 5;

// ---------------------------------------------------------------------------
// OpenCaseInput (byte-identical interface to lib/case-helpers.ts)
// ---------------------------------------------------------------------------

export interface OpenCaseInput {
  kind: CaseKind;
  primarySubjectKind: "registered_pet" | "unowned_animal" | "location" | "general";
  primaryPetId?: string | null;
  locationLat?: string | null;
  locationLng?: string | null;
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

export interface CloseCaseInput {
  caseId: string;
  reason: "resolved" | "cancelled" | "auto_expired";
  closedByUserId?: string | null;
}

// ---------------------------------------------------------------------------
// CasesRepository
// ---------------------------------------------------------------------------

export class CasesRepository {
  // -------------------------------------------------------------------------
  // public_code generator (CAS-XXXX-XXXX)
  // -------------------------------------------------------------------------

  /**
   * Allocate a new unique CAS-XXXX-XXXX code. Retries on the very rare
   * collision with the unique index. The base entropy is ~8.5e11 — five
   * retries is plenty.
   *
   * Accepts an optional executor so it can run inside a transaction
   * alongside the `cases` INSERT it's about to feed.
   */
  async generateUniqueCasePublicCode(executor: CaseExecutor = db): Promise<string> {
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

  // -------------------------------------------------------------------------
  // openCase
  // -------------------------------------------------------------------------

  /**
   * Insert a new case row. Throws if the insert would violate any
   * CHECK constraint (opened_reason length, subject consistency, etc.).
   * The caller is responsible for picking an appropriate kind and for
   * setting up the jurisdiction from the subject pet (or the location).
   *
   * Pass `executor` (the tx from `db.transaction`) to land the case row
   * atomically with the triggering pet_event in the same transaction.
   */
  async openCase(input: OpenCaseInput, executor: CaseExecutor = db): Promise<Case> {
    const publicCode = await this.generateUniqueCasePublicCode(executor);
    const values: NewCase = {
      publicCode,
      caseKind: input.kind,
      status: "open",
      primarySubjectKind: input.primarySubjectKind,
      primaryPetId: input.primaryPetId ?? null,
      // Canonical write (P3 Phase B). Input arrives as locationLat/locationLng.
      locationLat: input.locationLat ?? null,
      locationLng: input.locationLng ?? null,
      // cases_subject_location_consistency CHECK still references primary_location_lat/lng
      // (constraint added in 0033, not updated in 0101). Mirror canonical to legacy so
      // the constraint is satisfied until Phase C drops both columns and the constraint.
      primaryLocationLat: input.locationLat ?? null,
      primaryLocationLng: input.locationLng ?? null,
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

  // -------------------------------------------------------------------------
  // closeCase
  // -------------------------------------------------------------------------

  /**
   * UPDATE `cases` setting status='closed', closed_reason, closed_at,
   * closed_by_user_id. Idempotent: closing an already-closed case is a
   * no-op (returns the existing row).
   */
  async closeCase(input: CloseCaseInput, executor: CaseExecutor = db): Promise<Case | null> {
    const [existing] = await executor
      .select()
      .from(cases)
      .where(eq(cases.id, input.caseId))
      .limit(1);
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

  // -------------------------------------------------------------------------
  // escalateCase
  // -------------------------------------------------------------------------

  /**
   * UPDATE `cases` setting status='escalated'. Only acts when the current
   * status is 'open'. Idempotent: already-escalated or non-open cases are
   * returned unchanged.
   *
   * Pass `executor` (the tx from `db.transaction`) to run escalation
   * atomically with the associated case_event insert and audit row in the
   * same transaction.
   */
  async escalateCase(caseId: string, executor: CaseExecutor = db): Promise<Case | null> {
    const [existing] = await executor.select().from(cases).where(eq(cases.id, caseId)).limit(1);
    if (!existing) return null;
    if (existing.status !== "open") return existing;
    const [updated] = await executor
      .update(cases)
      .set({ status: "escalated", updatedAt: new Date() })
      .where(eq(cases.id, caseId))
      .returning();
    return updated;
  }

  // -------------------------------------------------------------------------
  // reopenCase — only used by adoption_reversed (L4)
  // -------------------------------------------------------------------------

  /**
   * UPDATE `cases` setting status='open', clearing closed fields.
   * Runs on `db` ONLY — no tx param (preserved from lib/case-helpers exactly).
   * Idempotent: already-open case returns the existing row.
   */
  async reopenCase(caseId: string): Promise<Case | null> {
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

  // -------------------------------------------------------------------------
  // Query helpers
  // -------------------------------------------------------------------------

  /**
   * Open cases for a pet. Used by `decideAttachment` to know what to
   * attach a new event to. Caps at 50 because a pet with more than that
   * would already be in trouble.
   */
  async findOpenCasesForPet(petId: string): Promise<Array<{ id: string; caseKind: CaseKind }>> {
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
  async findOpenCaseForPetAndKind(
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
  async findOpenAdoptionApplicationCase(
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
  async findOpenAdoptionListingCase(petId: string, orgId: string): Promise<Case | null> {
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
}
