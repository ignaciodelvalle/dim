// WelfareRepository — thin Drizzle wrapper for welfare_reports and
// welfare_report_attachments writes/reads.
//
// Design decisions:
//   - All write methods accept an optional `executor` param (DbOrTx) to
//     support both top-level calls and participation in a db.transaction().
//   - The 23505 collision retry loop lives here (repo concern: pg error code
//     detection is infra, not domain).
//   - Case ops route through CasesRepository / lib/case-helpers — NOT
//     reimplemented here.
//   - No auth logic — auth lives at the action / use-case edge.
//   - Reads return Drizzle row shapes ($inferSelect) — callers expect them.

import { and, desc, eq, gte, ne } from "drizzle-orm";

import {
  auditLog,
  db,
  notifications,
  pets,
  profiles,
  welfareReportAttachments,
  welfareReports,
} from "@/db";
import type {
  NewAuditLogRow,
  NewWelfareReport,
  WelfareReport,
  WelfareReportAttachment,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | Tx;

type InsertReportValues = Omit<NewWelfareReport, "id">;

type InsertAttachmentValues = Omit<
  typeof welfareReportAttachments.$inferInsert,
  "id" | "createdAt"
>;

type StatusPatch = {
  status?: WelfareReport["status"];
  triagedAt?: Date | null;
  triagedByUserId?: string | null;
  closedAt?: Date | null;
  resolutionNotes?: string | null;
  moderationResolvedAt?: Date | null;
  moderationResolvedByUserId?: string | null;
};

type FlaggedPatch = {
  flaggedAt: Date;
  flagReasons: string[];
};

type MpfExportAuditRow = {
  id: string;
  payload: Record<string, unknown>;
  performedAt: Date;
};

// ---------------------------------------------------------------------------
// WelfareRepository
// ---------------------------------------------------------------------------

export class WelfareRepository {
  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * Insert a welfare_reports row, retrying up to 5 times on a unique-violation
   * (pg 23505) against reference_code. On each retry the caller-supplied
   * `codeGenerator` function is called to produce a fresh candidate code.
   *
   * Throws with message "unique code" after 5 exhausted attempts.
   */
  async insertReportWithRetry(
    values: InsertReportValues,
    executor: DbOrTx = db,
    codeGenerator?: () => string,
  ): Promise<{ id: string; referenceCode: string }> {
    let currentValues = { ...values };
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      try {
        const [row] = await executor
          .insert(welfareReports)
          .values(currentValues)
          .returning({ id: welfareReports.id, referenceCode: welfareReports.referenceCode });
        return { id: row.id, referenceCode: row.referenceCode };
      } catch (err) {
        const pgCode = (err as { code?: string }).code;
        if (pgCode === "23505" && attempts < maxAttempts - 1 && codeGenerator) {
          currentValues = { ...currentValues, referenceCode: codeGenerator() };
          attempts++;
          continue;
        }
        if (pgCode === "23505") {
          throw new Error("No se pudo generar un código único para la denuncia. Probá de nuevo.");
        }
        throw err;
      }
    }

    // Unreachable but satisfies TypeScript control flow.
    throw new Error("No se pudo generar un código único para la denuncia. Probá de nuevo.");
  }

  /**
   * Insert welfare_report_attachments rows. Accepts any executor (db or tx).
   */
  async insertAttachments(rows: InsertAttachmentValues[], executor: DbOrTx = db): Promise<void> {
    if (rows.length === 0) return;
    await executor.insert(welfareReportAttachments).values(rows);
  }

  /**
   * Update the welfare_reports.case_id column to link a case.
   * Called after openCase() returns the new case row.
   */
  async linkCase(reportId: string, caseId: string, executor: DbOrTx = db): Promise<void> {
    await executor.update(welfareReports).set({ caseId }).where(eq(welfareReports.id, reportId));
  }

  /**
   * Apply a status patch (status, triagedAt/By, closedAt, resolutionNotes,
   * moderationResolved) to a welfare report.
   */
  async updateStatus(reportId: string, patch: StatusPatch, executor: DbOrTx = db): Promise<void> {
    await executor
      .update(welfareReports)
      .set(patch as Partial<typeof welfareReports.$inferInsert>)
      .where(eq(welfareReports.id, reportId));
  }

  /**
   * Set the moderation flag (flaggedAt + flagReasons) on a report.
   * Called post-commit, best-effort — callers must catch errors.
   */
  async setFlagged(reportId: string, patch: FlaggedPatch, executor: DbOrTx = db): Promise<void> {
    await executor
      .update(welfareReports)
      .set({ flaggedAt: patch.flaggedAt, flagReasons: patch.flagReasons })
      .where(eq(welfareReports.id, reportId));
  }

  /**
   * Set (or clear) the assignee on a welfare report.
   * No tx required — single update, no audit_log (parity: assign/unassign
   * write no audit_log row, preserved here).
   */
  async setAssignee(reportId: string, userId: string | null): Promise<void> {
    await db
      .update(welfareReports)
      .set({ assignedToUserId: userId })
      .where(eq(welfareReports.id, reportId));
  }

  /**
   * Append an audit_log row. The actorUserId MUST correspond to an existing
   * profiles row (NOT NULL FK with RESTRICT on delete).
   */
  async insertAudit(
    values: Omit<NewAuditLogRow, "id" | "performedAt">,
    executor: DbOrTx = db,
  ): Promise<void> {
    await executor.insert(auditLog).values(values as NewAuditLogRow);
  }

  /**
   * Insert notification rows. Always called post-tx (best-effort);
   * callers must catch errors. Uses the top-level db (not a tx).
   */
  async insertNotifications(rows: (typeof notifications.$inferInsert)[]): Promise<void> {
    if (rows.length === 0) return;
    await db.insert(notifications).values(rows);
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /**
   * Find a welfare report by its primary key. Returns null when not found.
   */
  async findById(reportId: string): Promise<WelfareReport | null> {
    const [row] = await db
      .select()
      .from(welfareReports)
      .where(eq(welfareReports.id, reportId))
      .limit(1);
    return row ?? null;
  }

  /**
   * Find a welfare report by its reference_code. Returns null when not found.
   */
  async findByReferenceCode(referenceCode: string): Promise<WelfareReport | null> {
    const [row] = await db
      .select()
      .from(welfareReports)
      .where(eq(welfareReports.referenceCode, referenceCode))
      .limit(1);
    return row ?? null;
  }

  /**
   * OA9 multi-source escalation: find open/triaged/in_progress welfare
   * cases for the same pet, excluding the case we're currently creating
   * (excludeCaseId). Called inside the same tx as the insert.
   *
   * Returns an array of { welfareReportId, caseId } tuples. The caller
   * uses these to insert a system note_added pet_event on the ORIGINAL case.
   */
  async findOpenOtherWelfareCasesForPet(
    petId: string,
    excludeCaseId: string | null,
    executor: DbOrTx = db,
  ): Promise<{ welfareReportId: string; caseId: string }[]> {
    const rows = await executor
      .select({
        welfareReportId: welfareReports.id,
        caseId: welfareReports.caseId,
      })
      .from(welfareReports)
      .where(
        and(
          eq(welfareReports.subjectPetId, petId),
          // Only open/triaged/in_progress — not terminal
          // Using ne() is simpler than an inArray for the open statuses
          ne(welfareReports.status, "closed"),
          ne(welfareReports.status, "invalid"),
          ne(welfareReports.status, "duplicate"),
          // Must have a linked case to escalate on
          // (reports pre-dating cases system have caseId = null)
          ...(excludeCaseId ? [ne(welfareReports.caseId, excludeCaseId)] : []),
        ),
      );

    // Filter out rows without a caseId (pre-cases-system reports)
    return rows.filter((r): r is { welfareReportId: string; caseId: string } => r.caseId != null);
  }

  /**
   * Idempotency lookup for generateMpfExport: find the most recent
   * audit_log row of type `welfare_mpf_export_generated` for this report
   * within the last `sinceMs` milliseconds. Returns null when none exists.
   */
  async findRecentMpfExport(
    welfareReportId: string,
    sinceMs: number,
  ): Promise<MpfExportAuditRow | null> {
    const since = new Date(Date.now() - sinceMs);
    const rows = await db
      .select({
        id: auditLog.id,
        payload: auditLog.payload,
        performedAt: auditLog.performedAt,
      })
      .from(auditLog)
      .where(
        and(eq(auditLog.action, "welfare_mpf_export_generated"), gte(auditLog.performedAt, since)),
      )
      .orderBy(desc(auditLog.performedAt))
      .limit(10); // limit then filter — no JSON index on payload

    const match = rows.find(
      (r) =>
        typeof r.payload === "object" &&
        r.payload !== null &&
        (r.payload as Record<string, unknown>).welfareReportId === welfareReportId,
    );

    if (!match) return null;
    return {
      id: match.id,
      payload: match.payload as Record<string, unknown>,
      performedAt: match.performedAt,
    };
  }

  /**
   * Return all attachment rows for a welfare report.
   */
  async findAttachments(welfareReportId: string): Promise<WelfareReportAttachment[]> {
    return db
      .select()
      .from(welfareReportAttachments)
      .where(eq(welfareReportAttachments.welfareReportId, welfareReportId));
  }

  /**
   * Return the reporter's display name for MPF export.
   * Returns null when the report is anonymous (reporterUserId is null) or the
   * profile row is not found.
   */
  async findReporterName(reporterUserId: string | null): Promise<string | null> {
    if (!reporterUserId) return null;
    const [row] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, reporterUserId))
      .limit(1);
    return row?.displayName ?? null;
  }

  /**
   * Return the exporter's display name for MPF export.
   * Falls back to "Autoridad DIM" when the profile row is not found.
   */
  async findExporterName(exporterUserId: string): Promise<string> {
    const [row] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, exporterUserId))
      .limit(1);
    return row?.displayName ?? "Autoridad DIM";
  }

  /**
   * Return minimal subject pet info (name + microchipId) for MPF export.
   * Returns null when the report has no subjectPetId or the pet row is not found.
   */
  async findSubjectPet(
    subjectPetId: string | null,
  ): Promise<{ name: string; microchipId: string | null } | null> {
    if (!subjectPetId) return null;
    const [row] = await db
      .select({ name: pets.name, microchipId: pets.microchipId })
      .from(pets)
      .where(eq(pets.id, subjectPetId))
      .limit(1);
    if (!row) return null;
    return { name: row.name, microchipId: row.microchipId ?? null };
  }
}
