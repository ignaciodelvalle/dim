// Use-case: recordDiseaseDiagnosis (writer + types)
//
// Migrated from app/actions/events.ts::recordDiseaseDiagnosisWriter +
//   recordDiseaseDiagnosisAction.
//
// Spec 2026-05-19-eno-vet-direct-report-and-owner-alerts §6.
//
// AUTH: VET-ONLY (role=vet + matriculaVerified=true). NO ownership check —
//   the vet can diagnose any pet. Auth guard is at the action layer; this
//   writer is auth-agnostic (exported for integration tests without Next.js).
//
// Parity:
//   - PLAIN insertEvent for clinical_info_logged (sub_kind=disease_diagnosis).
//   - Enqueue outbox for the diagnosis event (ENO SLA).
//   - IF reportable: insert outbreak_signal (system) + outbox + routeSignal + maybeOwnerAlert.
//   - Post-tx: processEnoEventTrigger via @/lib/eno-trigger shim — failure is
//     NEVER fatal: catch → insert audit_log(trigger_failed:true) best-effort.
//   - audit_log ONLY on ENO failure, not on diagnosis success.
//   - ENO failure NEVER rolls back the diagnosis (post-tx pattern).
//   - Notifications flushed by caller (flushNotifications dep).

import "server-only";

import { findDisease, isReportable } from "@/lib/diseases";
import { validateEventPayload } from "@/lib/event-schemas";
import { maybeNotifyOwnersOfPublicAlert } from "@/lib/owner-disease-alerts";

import type { EventsRepository } from "../../infrastructure/events-repository";
import type { NewNotification } from "../types";
import { routeOutbreakSignalNotifications } from "./route-outbreak-signal-notifications";

// ---------------------------------------------------------------------------
// Exported types (re-exported from actions.ts for test compatibility)
// ---------------------------------------------------------------------------

export type RecordDiseaseDiagnosisWriterInput = {
  petId: string;
  petName: string;
  petSpecies: string;
  petJurisdictionCountry: string;
  petJurisdictionProvince: string | null;
  petJurisdictionLocality: string | null;
  vetUserId: string;
  vetDisplayName: string;
  diseaseCode: string;
  confirmedByLab: boolean;
  labName: string | null;
  labReportReference: string | null;
  diagnosisDate: Date;
  notes: string | null;
  now?: Date;
};

export type RecordDiseaseDiagnosisWriterResult =
  | {
      ok: true;
      diagnosisEventId: string;
      signalEventId: string | null;
      ownerNotificationsDelivered: number;
    }
  | { ok: false; error: string };

type Deps = {
  repo: Pick<EventsRepository, "insertEvent" | "enqueueOutbox" | "insertAuditLog">;
  transaction: <T>(cb: (tx: unknown) => Promise<T>) => Promise<T>;
  flushNotifications: (pendingNotifications: NewNotification[]) => Promise<void>;
};

type DbTx = Parameters<Parameters<typeof import("@/db").db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Core write path for a vet's direct disease diagnosis (ENO spec §6).
 * Exported so integration tests can call it without the Next.js request context.
 * Same logic as the action minus auth + form parsing.
 */
export async function recordDiseaseDiagnosisWriter(
  params: RecordDiseaseDiagnosisWriterInput,
  deps: Deps,
): Promise<RecordDiseaseDiagnosisWriterResult> {
  const disease = findDisease(params.diseaseCode);
  if (!disease) return { ok: false, error: "unknown disease_code" };

  const now = params.now ?? new Date();
  let diagnosisEventId = "";
  let signalEventId: string | null = null;
  let ownerNotificationsDelivered = 0;

  const pendingNotifications: NewNotification[] = [];

  try {
    await deps.transaction(async (tx) => {
      const diagnosisPayload = validateEventPayload("clinical_info_logged", {
        sub_kind: "disease_diagnosis",
        title: `Diagnóstico: ${disease.label}`,
        details: null,
        performed_by: params.vetDisplayName,
        performed_by_user_id: params.vetUserId,
        performed_by_organization_id: null,
        disease_code: params.diseaseCode,
        confirmed_by_lab: params.confirmedByLab,
        lab_name: params.labName,
        lab_report_reference: params.labReportReference,
        diagnosis_date: params.diagnosisDate.toISOString(),
      });

      const diagnosisEvent = await deps.repo.insertEvent(
        {
          petId: params.petId,
          eventType: "clinical_info_logged",
          occurredAt: params.diagnosisDate,
          recordedAt: now,
          recordedByUserId: params.vetUserId,
          authorRole: "vet",
          authorVerified: true,
          authorOrganizationId: null,
          payload: diagnosisPayload,
          notes: params.notes,
        } as Parameters<typeof deps.repo.insertEvent>[0],
        tx as Parameters<typeof deps.repo.insertEvent>[1],
      );
      diagnosisEventId = diagnosisEvent.id;

      // Enqueue outbox row for the diagnosis event (ENO SLA notification).
      await deps.repo.enqueueOutbox(
        tx as Parameters<typeof deps.repo.enqueueOutbox>[0],
        {
          id: diagnosisEvent.id,
          eventType: "clinical_info_logged",
          payload: diagnosisPayload as Record<string, unknown>,
        },
        {
          jurisdictionProvince: params.petJurisdictionProvince,
          jurisdictionLocality: params.petJurisdictionLocality,
        },
      );

      if (isReportable(params.diseaseCode)) {
        const signalPayload = validateEventPayload("outbreak_signal", {
          triggered_by: "direct_diagnosis",
          source_symptom_event_id: null,
          source_disease_diagnosis_event_id: diagnosisEvent.id,
          confirmed_by_lab: params.confirmedByLab,
          disease_code: params.diseaseCode,
          disease_label: disease.label,
          match_strength: {
            high_count: 0,
            medium_count: 0,
            low_count: 0,
            matched_symptom_codes: [],
          },
          pet_jurisdiction_country: params.petJurisdictionCountry,
          pet_jurisdiction_province: params.petJurisdictionProvince,
          pet_jurisdiction_locality: params.petJurisdictionLocality,
          pet_species: params.petSpecies,
        });

        const signalEvent = await deps.repo.insertEvent(
          {
            petId: params.petId,
            eventType: "outbreak_signal",
            occurredAt: now,
            recordedAt: now,
            recordedByUserId: null,
            authorRole: "system",
            authorOrganizationId: null,
            authorVerified: false,
            payload: signalPayload,
          } as Parameters<typeof deps.repo.insertEvent>[0],
          tx as Parameters<typeof deps.repo.insertEvent>[1],
        );
        signalEventId = signalEvent.id;

        // Enqueue outbox row for the outbreak_signal event.
        await deps.repo.enqueueOutbox(
          tx as Parameters<typeof deps.repo.enqueueOutbox>[0],
          {
            id: signalEvent.id,
            eventType: "outbreak_signal",
            payload: signalPayload as Record<string, unknown>,
          },
          {
            jurisdictionProvince: params.petJurisdictionProvince,
            jurisdictionLocality: params.petJurisdictionLocality,
          },
        );

        // Build a minimal pet shape for routeOutbreakSignalNotifications.
        const fakePet = {
          id: params.petId,
          publicToken: "",
          jurisdictionCountry: params.petJurisdictionCountry,
          jurisdictionProvince: params.petJurisdictionProvince,
          jurisdictionLocality: params.petJurisdictionLocality,
          species: params.petSpecies,
        };

        await routeOutbreakSignalNotifications(
          tx as DbTx,
          {
            signalEvent,
            // biome-ignore lint/suspicious/noExplicitAny: minimal shape satisfies the helper's Pick
            pet: fakePet as any,
            disease: {
              disease_code: params.diseaseCode,
              disease_label: disease.label,
              high_count: 0,
              medium_count: 0,
            },
            escalation: false,
          },
          pendingNotifications,
        );

        const alertResult = await maybeNotifyOwnersOfPublicAlert(
          {
            pet: { id: params.petId, name: params.petName },
            diseaseCode: params.diseaseCode,
            triggerEventId: signalEvent.id,
          },
          tx as Parameters<typeof maybeNotifyOwnersOfPublicAlert>[1],
        );
        ownerNotificationsDelivered = alertResult.delivered;
      }
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
  }

  // Flush pending notifications post-tx.
  await deps.flushNotifications(pendingNotifications);

  // ENO pipeline — processEnoEventTrigger fires AFTER the transaction commits.
  // Failure MUST NEVER block or roll back the diagnosis insert (defensive wrap).
  if (diagnosisEventId) {
    try {
      const { processEnoEventTrigger } = await import("@/lib/eno-trigger");
      await processEnoEventTrigger({
        id: diagnosisEventId,
        petId: params.petId,
        authorRole: "vet",
        recordedByUserId: params.vetUserId,
        authorOrganizationId: null,
        payload: {
          sub_kind: "disease_diagnosis",
          disease_code: params.diseaseCode,
          diagnosis_date: params.diagnosisDate.toISOString(),
        },
      });
    } catch (err) {
      console.error("[recordDiseaseDiagnosisWriter] ENO trigger failed (non-fatal):", err);
      // Audit the failure so ops can investigate without a bug report.
      try {
        await deps.repo.insertAuditLog({
          actorUserId: params.vetUserId,
          action: "eno_notification_emitted",
          payload: {
            disease_code: params.diseaseCode,
            pet_id: params.petId,
            error: err instanceof Error ? err.message : "unknown",
            trigger_failed: true,
          },
        });
      } catch {
        // Swallow — audit insert failure is non-fatal.
      }
    }
  }

  return { ok: true, diagnosisEventId, signalEventId, ownerNotificationsDelivered };
}
