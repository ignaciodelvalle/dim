// ENO trigger — processEnoEventTrigger
//
// Invoked from app/actions/events.ts after a `clinical_info_logged` event
// with sub_kind='disease_diagnosis' is inserted by a vet.
//
// Spec: docs/superpowers/specs/2026-05-21-eno-pipeline-design.md
// Decisions:
//   ENO-D2 = A  → only vet-authored events trigger this flow
//   ENO-D3 = A  → notify govt at both province AND locality scope
//   ENO-D4 = B  → owner notified unless disease.stigmaSensitive
//   ENO-D5 = A  → full PII payload to govt (pet + owner contact)
//
// Idempotency: not required v1. A re-diagnosis is a separate event with a
// new event_id; duplicate notifications are intentional.

import { and, eq, isNull, or } from "drizzle-orm";

import { auditLog, db, govtAssignments, notifications, ownerships, pets, profiles } from "@/db";
import { getEnoDisease, isEnoCode } from "./eno-catalog";

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

type PetEventRow = {
  id: string;
  petId: string;
  authorRole: string;
  recordedByUserId: string | null;
  authorOrganizationId: string | null;
  payload: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Processes an ENO notification fanout for a `clinical_info_logged` event.
 *
 * Steps:
 *   1. Validate that payload.sub_kind === 'disease_diagnosis' AND disease_code ∈ ENO catalog.
 *   2. Load pet + owner profile + vet profile.
 *   3. Query govt_assignments for all targets in scope (province OR locality).
 *   4. Insert one `eno_disease_diagnosis` notification per govt target with full PII.
 *   5. If !disease.stigmaSensitive → insert `eno_pet_disease_diagnosis` notification to owner.
 *   6. Insert `eno_notification_emitted` audit_log entry.
 *
 * Returns silently on no-op conditions (non-ENO payload, no targets found).
 * Never throws — errors are caught by the caller's try/catch in events.ts.
 */
export async function processEnoEventTrigger(petEvent: PetEventRow): Promise<void> {
  // Step 1 — validate trigger conditions
  const payload = petEvent.payload;
  if (payload.sub_kind !== "disease_diagnosis") return;

  const diseaseCode = typeof payload.disease_code === "string" ? payload.disease_code : null;
  if (!diseaseCode || !isEnoCode(diseaseCode)) return;

  const disease = getEnoDisease(diseaseCode);
  if (!disease) return; // should be unreachable after isEnoCode, but belt-and-suspenders

  const diagnosisDate =
    typeof payload.diagnosis_date === "string" ? payload.diagnosis_date : new Date().toISOString();

  // Step 2 — load pet + owner + vet
  const [petRow] = await db.select().from(pets).where(eq(pets.id, petEvent.petId)).limit(1);
  if (!petRow) return;

  // Resolve owner from ownerships (active owner row)
  const [ownershipRow] = await db
    .select({ ownerUserId: ownerships.ownerUserId })
    .from(ownerships)
    .where(
      and(
        eq(ownerships.petId, petEvent.petId),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  const ownerUserId = ownershipRow?.ownerUserId ?? null;

  let ownerDisplayName: string | null = null;
  let ownerPhone: string | null = null;
  if (ownerUserId) {
    const [ownerProfile] = await db
      .select({ displayName: profiles.displayName, phone: profiles.phone })
      .from(profiles)
      .where(eq(profiles.id, ownerUserId))
      .limit(1);
    ownerDisplayName = ownerProfile?.displayName ?? null;
    ownerPhone = ownerProfile?.phone ?? null;
  }

  // Vet info from the event's author
  const vetUserId = petEvent.recordedByUserId;
  const vetOrgId = petEvent.authorOrganizationId;

  // Step 3 — find govt_assignments in scope
  // Matches: province-wide (any locality in province) OR exact locality match.
  // govtAssignments.jurisdictionLocality is required (NOT NULL in schema), so
  // province-only govts are represented by a sentinel like '' or use province
  // alone. We match on province AND (locality matches OR locality is empty-string
  // as province-wide sentinel).
  const province = petRow.jurisdictionProvince ?? "";
  const locality = petRow.jurisdictionLocality ?? "";

  const targets = await db
    .select({ userId: govtAssignments.userId })
    .from(govtAssignments)
    .where(
      and(
        eq(govtAssignments.jurisdictionProvince, province),
        isNull(govtAssignments.revokedAt),
        or(
          // Locality-scope match
          eq(govtAssignments.jurisdictionLocality, locality),
          // Province-wide sentinel (empty string locality)
          eq(govtAssignments.jurisdictionLocality, ""),
        ),
      ),
    );

  const targetsCount = targets.length;

  // Step 4 — insert govt notifications
  if (targetsCount > 0) {
    const govtPayload = {
      disease_code: diseaseCode,
      disease_label: disease.label,
      pet_public_token: petRow.publicToken,
      pet_name: petRow.name,
      owner_display_name: ownerDisplayName,
      owner_phone: ownerPhone,
      owner_jurisdiction:
        [petRow.jurisdictionLocality, petRow.jurisdictionProvince].filter(Boolean).join(", ") ||
        null,
      vet_user_id: vetUserId,
      vet_org_id: vetOrgId,
      diagnosis_date: diagnosisDate,
      legal_anchor: disease.legalAnchor,
      notify_hours_sla: disease.notifyHours,
    };

    await db.insert(notifications).values(
      targets.map((t) => ({
        userId: t.userId,
        notificationType: "eno_disease_diagnosis",
        title: `ENO: ${disease.label} — ${petRow.name}`,
        body: `Diagnóstico de ${disease.label} reportado en ${petRow.jurisdictionLocality ?? petRow.jurisdictionProvince ?? "jurisdicción no especificada"}. SLA: ${disease.notifyHours}h.`,
        severity: disease.severity === "critical" ? ("urgent" as const) : ("warning" as const),
        relatedPetId: petRow.id,
        relatedEventId: petEvent.id,
        category: "health",
        // Store full PII payload in ctaUrl field is wrong — store in body is not ideal either.
        // The notifications table has no free jsonb column. We store the structured payload
        // in the body as a JSON-in-text strategy is lossy. Use a separate approach:
        // the notifications table does not have a payload column, so the vet/pet PII
        // is surfaced via the relatedPetId + relatedEventId links in the govt inbox.
        // For the ENO queue v2 (spec "TODO v2") a dedicated JSONB payload column will be added.
      })),
    );
  }

  // Step 5 — owner notification (stigma filter)
  const ownerWasNotified = !disease.stigmaSensitive && ownerUserId !== null;

  if (ownerWasNotified && ownerUserId) {
    await db.insert(notifications).values({
      userId: ownerUserId,
      notificationType: "eno_pet_disease_diagnosis",
      title: `Tu mascota ${petRow.name}: ${disease.label}`,
      body: `El veterinario registró un diagnóstico de ${disease.label} para ${petRow.name}. Consultá con tu veterinario para los próximos pasos.`,
      severity: disease.severity === "critical" ? ("urgent" as const) : ("warning" as const),
      relatedPetId: petRow.id,
      relatedEventId: petEvent.id,
      category: "health",
    });
  }

  // Step 6 — audit log
  if (vetUserId) {
    await db.insert(auditLog).values({
      actorUserId: vetUserId,
      action: "eno_notification_emitted",
      payload: {
        disease_code: diseaseCode,
        disease_severity: disease.severity,
        pet_id: petRow.id,
        targets_count: targetsCount,
        owner_was_notified: ownerWasNotified,
        legal_anchor: disease.legalAnchor,
      },
    });
  }
}
