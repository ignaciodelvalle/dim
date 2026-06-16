// Use-case: create an org-side welfare report (professional, critical severity).
//
// Migrated from app/actions/welfare.ts::createOrgWelfareReportAction.
// Auth (requireUserOrRedirect + org-membership+verified+role gate scoped to
// THE orgToken's org) is handled by the caller (actions.ts).
// This use-case receives a resolved OrgMember principal.
//
// Differences vs. public create (parity from original):
//   - severity FORCED to 'critical' (OA2).
//   - reporterOrganizationId populated.
//   - skips moderation auto-flag (OA7).
//   - OA9 multi-source escalation: query + mutate OTHER open welfare cases
//     for the same pet in the SAME tx; system note on the ORIGINAL case.
//   - OA4 fan-out POST-tx: govt authorities ∪ institutional admins (deduped Set).
//   - audit_log insert inside tx: welfare_report_submitted_by_org.
//
// Orchestrates (parity: exact order from original):
//   1. Resolve subjectPetId from token (if subjectKind=registered_pet).
//   2. insertReportWithRetry (5-attempt 23505 loop via repo).
//   3. ATOMIC tx:
//      a. insertAttachments.
//      b. openCase(welfare_denuncia) → caseRow (openedByOrganizationId set).
//      c. linkCase.
//      d. Pet-event bridge (registered_pet only).
//      e. OA9: findOpenOtherWelfareCasesForPet → insertPetEvent(note_added,
//         authorRole=system, recordedByUserId=null) on the ORIGINAL case.
//      f. Build notifications (govt ∪ admin deduped) + reporter confirmation.
//      g. insertAudit(welfare_report_submitted_by_org).
//   4. POST-tx insertNotifications (best-effort).
//   5. signal.
//   6. Return redirect target.

import { validateEventPayload } from "@/lib/event-schemas";
import { MALTREATMENT_KINDS, derivePrimarySubjectKind } from "../domain/report-classification";
import type { WelfareRepository } from "../infrastructure/welfare-repository";
import type { NewNotification } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Attachment = {
  storagePath: string;
  mimeType: string;
  fileSize: number;
  originalFilename: string | null;
};

type OrgMember = {
  userId: string;
  orgId: string;
  orgDisplayName: string;
  orgVerified: boolean;
  memberRole: string;
};

type OpenCaseInput = {
  kind: string;
  primarySubjectKind: string;
  primaryPetId: string | null;
  primaryLocationLat: string | null;
  primaryLocationLng: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  openedByUserId: string;
  openedByOrganizationId: string;
  openedReason: string;
  welfareReportId: string;
};

export type CreateOrgWelfareReportInput = {
  /** Pre-inserted report ID (from the action's insertReportWithRetry call). */
  reportId: string;
  /** Reference code from the pre-insert (used for notifications + signal). */
  referenceCode: string;
  kind: string;
  severity: string; // will be overridden to 'critical' (OA2)
  description: string;
  subjectKind: string;
  /** Pre-resolved pet ID (null when not a registered_pet or token not found). */
  subjectPetId: string | null;
  subjectDescription: string | null;
  locationAddress: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  /** Drizzle numeric() columns serialize as strings. */
  locationLat: string | null;
  locationLng: string | null;
  occurredAt: Date | null;
  observedSymptoms: string | null;
  /** Already-uploaded attachment refs (paths, mime, size). */
  attachments: Attachment[];
  uploadedPaths: string[];
  orgMember: OrgMember;
  orgToken?: string;
  /** Client-generated UUID for idempotency on the pet-event bridge inserts. */
  clientIdempotencyKey: string | null;
};

type Deps = {
  repo: Pick<
    WelfareRepository,
    | "insertAttachments"
    | "linkCase"
    | "insertPetEvent"
    | "insertPetEventIdempotent"
    | "insertAudit"
    | "insertNotifications"
    | "findOpenOtherWelfareCasesForPet"
    | "findInstitutionalAdmins"
  >;
  openCase: (input: OpenCaseInput) => Promise<{ id: string; publicCode: string }>;
  findGovtRecipients: (opts: {
    province: string;
    locality: string;
  }) => Promise<string[]>;
  signal: (input: {
    reportId: string;
    kind: string;
    severity: string;
    jurisdictionProvince: string | null;
    jurisdictionLocality: string | null;
    hasContact: boolean;
  }) => Promise<void>;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
};

export type CreateOrgWelfareReportResult =
  | { ok: true; reportId: string; referenceCode: string; redirectTo: string }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

export async function createOrgWelfareReport(
  input: CreateOrgWelfareReportInput,
  deps: Deps,
): Promise<CreateOrgWelfareReportResult> {
  const { repo, openCase, findGovtRecipients, signal, transaction } = deps;
  const {
    reportId,
    referenceCode,
    kind,
    description,
    subjectKind,
    subjectPetId,
    jurisdictionProvince,
    jurisdictionLocality,
    locationLat,
    locationLng,
    occurredAt,
    observedSymptoms,
    attachments,
    orgMember,
    orgToken,
    clientIdempotencyKey,
  } = input;

  // OA2: severity ALWAYS forced to 'critical' (server authoritative).
  const severity = "critical" as const;

  // Atomic tx
  const pendingNotifications: NewNotification[] = [];
  try {
    await transaction(async (tx) => {
      // 3a. Attachment rows
      if (attachments.length > 0) {
        await repo.insertAttachments(
          attachments.map((a) => ({
            welfareReportId: reportId,
            uploadedByUserId: orgMember.userId,
            storagePath: a.storagePath,
            mimeType: a.mimeType,
            fileSize: a.fileSize,
            originalFilename: a.originalFilename,
          })),
          tx as Parameters<typeof repo.insertAttachments>[1],
        );
      }

      // 3b. Open case
      const primarySubjectKind = derivePrimarySubjectKind(
        subjectKind,
        subjectPetId,
        locationLat,
        locationLng,
      );
      const caseRow = await openCase({
        kind: "welfare_denuncia",
        primarySubjectKind,
        primaryPetId: primarySubjectKind === "registered_pet" ? subjectPetId : null,
        primaryLocationLat: primarySubjectKind === "location" ? locationLat : null,
        primaryLocationLng: primarySubjectKind === "location" ? locationLng : null,
        jurisdictionProvince,
        jurisdictionLocality,
        openedByUserId: orgMember.userId,
        openedByOrganizationId: orgMember.orgId,
        openedReason: `auto: org-side welfare report by ${orgMember.orgDisplayName} (${referenceCode})`,
        welfareReportId: reportId,
      });

      // 3c. Link case
      await repo.linkCase(reportId, caseRow.id, tx as Parameters<typeof repo.linkCase>[2]);

      // 3d. Pet-event bridge (registered_pet only; org reports always use role=witness/shelter)
      if (subjectKind === "registered_pet" && subjectPetId) {
        const eventOccurredAt = occurredAt ?? new Date();
        const now = new Date();

        const bridgeKind =
          kind === "abandonment"
            ? "abandonment"
            : MALTREATMENT_KINDS.has(kind as never)
              ? "maltreatment"
              : null;

        if (bridgeKind === "abandonment") {
          const payload = validateEventPayload("abandonment_reported", {
            welfare_report_id: reportId,
            reporter_role: "witness",
            description,
          });
          await repo.insertPetEventIdempotent(
            {
              petId: subjectPetId,
              eventType: "abandonment_reported",
              occurredAt: eventOccurredAt,
              recordedAt: now,
              recordedByUserId: orgMember.userId,
              authorRole: "shelter",
              authorOrganizationId: orgMember.orgId,
              payload,
              locationLat,
              locationLng,
              caseId: caseRow.id,
              clientIdempotencyKey,
            },
            tx as Parameters<typeof repo.insertPetEventIdempotent>[1],
          );
        } else if (bridgeKind === "maltreatment") {
          const payload = validateEventPayload("maltreatment_reported", {
            welfare_report_id: reportId,
            reporter_role: "witness",
            description,
            severity,
            kind,
          });
          await repo.insertPetEventIdempotent(
            {
              petId: subjectPetId,
              eventType: "maltreatment_reported",
              occurredAt: eventOccurredAt,
              recordedAt: now,
              recordedByUserId: orgMember.userId,
              authorRole: "shelter",
              authorOrganizationId: orgMember.orgId,
              payload,
              locationLat,
              locationLng,
              caseId: caseRow.id,
              clientIdempotencyKey,
            },
            tx as Parameters<typeof repo.insertPetEventIdempotent>[1],
          );
        }

        if (observedSymptoms) {
          const payload = validateEventPayload("symptom_observed", {
            source: "welfare_report",
            welfare_report_id: reportId,
            reporter_role: "witness",
            free_text: observedSymptoms,
            matched_symptom_codes: [],
            alerted_disease_codes: [],
            severity_self_assessed: null,
            onset_at: null,
          });
          await repo.insertPetEventIdempotent(
            {
              petId: subjectPetId,
              eventType: "symptom_observed",
              occurredAt: eventOccurredAt,
              recordedAt: now,
              recordedByUserId: orgMember.userId,
              authorRole: "shelter",
              authorOrganizationId: orgMember.orgId,
              payload,
              locationLat,
              locationLng,
              caseId: caseRow.id,
              clientIdempotencyKey,
            },
            tx as Parameters<typeof repo.insertPetEventIdempotent>[1],
          );
        }

        // 3e. OA9: multi-source escalation — system note on the ORIGINAL case
        const otherOpenCases = await repo.findOpenOtherWelfareCasesForPet(
          subjectPetId,
          caseRow.id,
          tx as Parameters<typeof repo.findOpenOtherWelfareCasesForPet>[2],
        );
        if (otherOpenCases.length > 0) {
          const original = otherOpenCases[0];
          const notePayload = validateEventPayload("note_added", {
            category: "system",
            text: `Otra organización (${orgMember.orgDisplayName}) reportó un caso adicional sobre esta mascota. Ver caso ${caseRow.publicCode}. Múltiples fuentes elevan la prioridad.`,
          });
          await repo.insertPetEvent(
            {
              petId: subjectPetId,
              eventType: "note_added",
              occurredAt: now,
              recordedAt: now,
              recordedByUserId: null,
              authorRole: "system",
              payload: notePayload,
              caseId: original.caseId,
            },
            tx as Parameters<typeof repo.insertPetEvent>[1],
          );
        }
      }

      // 3f. Build notifications (OA4 fan-out: govt ∪ institutional admins, deduped)
      const [govtRecipients, adminRecipients] = await Promise.all([
        jurisdictionProvince && jurisdictionLocality
          ? findGovtRecipients({ province: jurisdictionProvince, locality: jurisdictionLocality })
          : Promise.resolve([] as string[]),
        repo.findInstitutionalAdmins(tx as Parameters<typeof repo.findInstitutionalAdmins>[0]),
      ]);

      const recipientSet = new Set<string>([...govtRecipients, ...adminRecipients]);
      for (const userId of recipientSet) {
        pendingNotifications.push({
          userId,
          notificationType: "welfare_org_side_critical_received",
          severity: "urgent",
          title: `Denuncia crítica de ${orgMember.orgDisplayName}`,
          body: `${orgMember.orgDisplayName} reportó un caso de maltrato${jurisdictionLocality ? ` en ${jurisdictionLocality}` : ""}. Reporte profesional con severidad crítica.`,
          ctaLabel: "Ver caso",
          ctaUrl: `/casos/${caseRow.publicCode}`,
          relatedCaseId: caseRow.id,
          relatedPetId: subjectPetId,
        });
      }

      // Reporter confirmation
      pendingNotifications.push({
        userId: orgMember.userId,
        notificationType: "welfare_org_side_confirmed_reporter",
        severity: "info",
        title: "Recibimos tu denuncia profesional",
        body: `La denuncia ${referenceCode} entró al sistema con prioridad crítica. Las autoridades en jurisdicción ya fueron notificadas.`,
        ctaLabel: "Ver caso",
        ctaUrl: `/casos/${caseRow.publicCode}`,
        relatedCaseId: caseRow.id,
      });

      // 3g. Audit log (REQUIRED — spec R2)
      await repo.insertAudit(
        {
          actorUserId: orgMember.userId,
          action: "welfare_report_submitted_by_org",
          payload: {
            organizationId: orgMember.orgId,
            organizationName: orgMember.orgDisplayName,
            welfareReportId: reportId,
            caseId: caseRow.id,
            subjectKind,
          },
        },
        tx as Parameters<typeof repo.insertAudit>[1],
      );
    });
  } catch (err) {
    // Caller (action) is responsible for storage cleanup on tx failure.
    return {
      ok: false,
      error: `No se pudo registrar la denuncia: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  // 4. POST-tx: insertNotifications (best-effort)
  if (pendingNotifications.length > 0) {
    try {
      await repo.insertNotifications(
        pendingNotifications as Parameters<typeof repo.insertNotifications>[0],
      );
    } catch (e) {
      console.error("[welfare] notifications insert failed (action did succeed)", e);
    }
  }

  // 5. Signal (best-effort legacy hook)
  await signal({
    reportId,
    kind,
    severity,
    jurisdictionProvince,
    jurisdictionLocality,
    hasContact: true,
  });

  // 6. Redirect target
  const token = orgToken ?? "unknown";
  const redirectTo = `/org/${token}/maltrato/recibidos`;

  return { ok: true, reportId, referenceCode, redirectTo };
}
