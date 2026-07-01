// Use-case: executeDecomiso — opens the custody_episode case + emits the
// custody_transfer_proposed handshake event toward the receiver refugio.
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md §5.1
//
// Auth (requireDecomisoPrincipal + jurisdiction guard) is handled by the caller.
// This use-case receives a pre-authorized actor context and pre-uploaded attachments.
//
// Transaction steps:
//   1. Unowned path: CREATE pet record + pet_registered event.
//   2. openCase(custody_episode).
//   3. INSERT shelter_intake_recorded.
//   4. Ownership transitions: close prev ownerships (registered path), open govt custody.
//   5. INSERT custody_transfer_proposed.
//   6. INSERT attachment rows (files already uploaded before calling this).
//   7. Cross-ref note on originating welfare case (DC12).
//   8. Build notifications (returned post-tx).
//   9. Audit log: decomiso_executed.

import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  attachments,
  auditLog,
  cases,
  type db,
  notifications,
  organizationMemberships,
  ownerships,
  petEvents,
  pets,
  profiles,
} from "@/db";
import { closeCase as libCloseCase, openCase as libOpenCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { generatePublicToken } from "@/lib/publicToken";
import { generateUniqueToken, isUniqueViolation } from "@/lib/unique-token";

import { motiveLabel, straySyntheticName, validateUnownedAnimal } from "../domain/seizure-rules";
import type { ExecuteDecomisoInput, GovtOrg, NewNotification, ReceiverOrg } from "../domain/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UploadedAttachment = {
  filename: string;
  storagePath: string;
  mimeType: string;
  size: number;
};

export type ExecuteDecomisoContext = {
  /** Pre-authorized actor. */
  user: { id: string };
  /** Pre-resolved govt (sanitary_authority) org. */
  govtOrg: GovtOrg & { jurisdictionProvince: string };
  /** Pre-validated receiver org. */
  receiverOrg: ReceiverOrg & { id: string; displayName: string };
  /** Non-null for registered_pet path. */
  existingPet: { id: string; name: string; publicToken: string } | null;
  /** Non-null for unowned_animal path. */
  unownedData: ExecuteDecomisoInput["unownedAnimal"] | null;
  /** Attachments already uploaded to Storage before the transaction. */
  uploadedAttachments: UploadedAttachment[];
};

export type ExecuteDecomisoResult =
  | { ok: true; value: { publicCode: string }; notifications: NewNotification[] }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Use-case
// ---------------------------------------------------------------------------

type TxType = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function executeDecomiso(
  input: ExecuteDecomisoInput,
  ctx: ExecuteDecomisoContext,
  tx: TxType,
): Promise<
  | { ok: true; publicCode: string; pendingNotifications: NewNotification[] }
  | { ok: false; error: string }
> {
  const { user, govtOrg, receiverOrg, uploadedAttachments } = ctx;

  const now = new Date();
  const pendingNotifications: NewNotification[] = [];

  // ---------- Unowned path: CREATE the pet record in-flight ----------
  let activePet: { id: string; name: string; publicToken: string };

  if (ctx.unownedData) {
    const { unownedData } = ctx;

    // Validate (defensive — caller should have already validated, but spec requires server-side).
    const unownedErr = validateUnownedAnimal(unownedData);
    if (unownedErr) return { ok: false, error: unownedErr };

    const publicToken = await generateUniqueToken(pets, pets.publicToken, generatePublicToken, {
      executor: tx,
    });

    // Compute approximate date of birth from approxAgeMonths.
    let dateOfBirth: string | null = null;
    let birthDateIsEstimated = false;
    if (unownedData.approxAgeMonths != null && unownedData.approxAgeMonths >= 0) {
      const dob = new Date();
      dob.setMonth(dob.getMonth() - unownedData.approxAgeMonths);
      dateOfBirth = dob.toISOString().slice(0, 10);
      birthDateIsEstimated = true;
    }

    const petName = straySyntheticName(unownedData);

    let newPet: { id: string; publicToken: string; name: string };
    try {
      const [inserted] = await tx
        .insert(pets)
        .values({
          publicToken,
          name: petName,
          species: unownedData.species,
          sex: unownedData.sex,
          breed: unownedData.breed ?? null,
          color: unownedData.color ?? null,
          distinguishingFeatures: unownedData.distinguishingFeatures ?? null,
          dateOfBirth,
          birthDateIsEstimated,
          jurisdictionProvince: govtOrg.jurisdictionProvince,
          jurisdictionLocality: govtOrg.jurisdictionLocality,
          potentiallyDangerousBreed: false,
        })
        .returning();
      newPet = inserted;
    } catch (insertErr) {
      if (isUniqueViolation(insertErr)) {
        throw new Error("Token de mascota duplicado — reintentá el decomiso.");
      }
      throw insertErr;
    }

    // Emit pet_registered event (append-only protocol).
    const registeredPayload = validateEventPayload("pet_registered", {
      name: petName,
      species: unownedData.species,
      sex: unownedData.sex,
      breed: unownedData.breed ?? null,
      date_of_birth: dateOfBirth,
      birth_date_is_estimated: birthDateIsEstimated,
      color: unownedData.color ?? null,
      microchip_id: null,
      microchip_country_code: null,
      microchip_implanted_at: null,
      microchip_implanted_by: null,
      microchip_location: null,
      estimated_weight_kg: null,
      favourite_foods: [],
      known_allergies: [],
      training_level: null,
      insurance_company: null,
      insurance_policy_number: null,
      jurisdiction_province: govtOrg.jurisdictionProvince,
      jurisdiction_locality: govtOrg.jurisdictionLocality,
      potentially_dangerous_breed: false,
      acquisition_method: null,
      has_photo: false,
      has_microchip: false,
      custody_kind: "shelter_custody_by_org",
    });
    await tx.insert(petEvents).values({
      petId: newPet.id,
      eventType: "pet_registered",
      occurredAt: now,
      recordedAt: now,
      recordedByUserId: user.id,
      authorRole: "govt",
      authorOrganizationId: govtOrg.id,
      authorVerified: true,
      payload: registeredPayload,
    });

    activePet = { id: newPet.id, name: petName, publicToken };
  } else {
    // Registered pet path — existingPet is non-null (validated by caller).
    activePet = ctx.existingPet as { id: string; name: string; publicToken: string };
  }

  // ---------- openCase(custody_episode) ----------
  const caseRow = await libOpenCase(
    {
      kind: "custody_episode",
      primarySubjectKind: "registered_pet",
      primaryPetId: activePet.id,
      jurisdictionCountry: "AR",
      jurisdictionProvince: govtOrg.jurisdictionProvince,
      jurisdictionLocality: govtOrg.jurisdictionLocality,
      openedByUserId: user.id,
      openedByOrganizationId: govtOrg.id,
      receiverOrganizationId: receiverOrg.id,
      openedReason: `auto: decomiso motivo=${input.seizureMotive} judicial_ref=${input.judicialProceedingReference ?? "sin_ref"}`,
    },
    tx,
  );
  const publicCode = caseRow.publicCode;

  // ---------- INSERT shelter_intake_recorded ----------
  const intakePayload = validateEventPayload("shelter_intake_recorded", {
    intake_reason: "seizure" as const,
    intake_condition: input.intakeCondition ?? null,
    rescue_jurisdiction: govtOrg.jurisdictionProvince,
    seizure_motive: input.seizureMotive,
    seizure_motive_other_detail: input.seizureMotiveOtherDetail ?? null,
    judicial_proceeding_reference: input.judicialProceedingReference ?? null,
    originating_welfare_report_id: input.originatingWelfareReportId ?? null,
    intended_receiver_organization_id: receiverOrg.id,
  });
  const [intakeEvent] = await tx
    .insert(petEvents)
    .values({
      petId: activePet.id,
      eventType: "shelter_intake_recorded",
      occurredAt: now,
      recordedAt: now,
      recordedByUserId: user.id,
      authorRole: "govt",
      authorOrganizationId: govtOrg.id,
      authorVerified: true,
      payload: intakePayload,
      caseId: caseRow.id,
    })
    .returning();

  // ---------- Ownership transitions ----------
  const prevOwnerUserIds: string[] = [];

  if (!ctx.unownedData) {
    // Registered pet path only.
    const prevOwnerOwnerships = await tx
      .select({ ownerUserId: ownerships.ownerUserId })
      .from(ownerships)
      .where(and(eq(ownerships.petId, activePet.id), isNull(ownerships.endedAt)));

    for (const o of prevOwnerOwnerships) {
      if (o.ownerUserId) prevOwnerUserIds.push(o.ownerUserId);
    }

    await tx
      .update(ownerships)
      .set({ endedAt: now })
      .where(and(eq(ownerships.petId, activePet.id), isNull(ownerships.endedAt)));
  }

  // Open transitional shelter_custody for the govt org (both paths).
  await tx.insert(ownerships).values({
    petId: activePet.id,
    ownerOrganizationId: govtOrg.id,
    role: "shelter_custody",
    startedAt: now,
  });

  // ---------- INSERT custody_transfer_proposed ----------
  const proposalPayload = validateEventPayload("custody_transfer_proposed", {
    from_user_id: null,
    from_organization_id: govtOrg.id,
    to_user_id: null,
    to_organization_id: receiverOrg.id,
    reason: "other" as const,
    matched_against_pet_id: null,
    proposed_at: now.toISOString(),
    notes: `from_decomiso=true originating_intake_event_id=${intakeEvent.id} case=${caseRow.publicCode}`,
  });
  await tx.insert(petEvents).values({
    petId: activePet.id,
    eventType: "custody_transfer_proposed",
    occurredAt: now,
    recordedAt: now,
    recordedByUserId: user.id,
    authorRole: "govt",
    authorOrganizationId: govtOrg.id,
    authorVerified: true,
    payload: proposalPayload,
    caseId: caseRow.id,
  });

  // ---------- INSERT attachment rows ----------
  for (const uploaded of uploadedAttachments) {
    await tx.insert(attachments).values({
      petId: activePet.id,
      eventId: intakeEvent.id,
      uploadedByUserId: user.id,
      storagePath: uploaded.storagePath,
      mimeType: uploaded.mimeType,
      fileSize: uploaded.size,
    });
  }

  // ---------- Cross-reference note on originating welfare case (DC12) ----------
  if (input.originatingWelfareReportId) {
    const [welfareCase] = await tx
      .select({ id: cases.id, publicCode: cases.publicCode })
      .from(cases)
      .where(
        and(
          eq(cases.welfareReportId, input.originatingWelfareReportId),
          inArray(cases.status, ["open", "escalated"]),
        ),
      )
      .limit(1);

    if (welfareCase) {
      const notePayload = validateEventPayload("note_added", {
        category: "system" as const,
        text: `Devino en decomiso. Ver caso ${caseRow.publicCode} (custodia temporal).`,
      });
      await tx.insert(petEvents).values({
        petId: activePet.id,
        eventType: "note_added",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "govt",
        authorOrganizationId: govtOrg.id,
        authorVerified: true,
        payload: notePayload,
        caseId: welfareCase.id,
      });
    }
  }

  // ---------- Build notifications ----------

  // 14a. Previous owner(s) — urgent. Skipped for unowned_animal path.
  for (const prevUserId of prevOwnerUserIds) {
    pendingNotifications.push({
      userId: prevUserId,
      notificationType: "decomiso_owner_lost_custody",
      severity: "urgent",
      title: "Custodia oficial transferida",
      body: `La autoridad sanitaria ${govtOrg.displayName} ejecutó un decomiso sobre tu mascota ${activePet.name}. Motivo: ${motiveLabel(input.seizureMotive)}.${input.judicialProceedingReference ? ` Referencia judicial: ${input.judicialProceedingReference}.` : ""} Para más información contactá a la autoridad sanitaria de tu jurisdicción.`,
      ctaLabel: "Más información",
      ctaUrl: `/casos/${caseRow.publicCode}`,
      relatedCaseId: caseRow.id,
      relatedPetId: activePet.id,
    });
  }

  // 14b. Receiver org coordinators — urgent.
  const receiverCoords = await tx
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, receiverOrg.id),
        inArray(organizationMemberships.role, ["admin", "coordinator"]),
        isNull(organizationMemberships.leftAt),
      ),
    );
  for (const coord of receiverCoords) {
    pendingNotifications.push({
      userId: coord.userId,
      notificationType: "decomiso_handoff_proposed_receiver",
      severity: "urgent",
      title: `Decomiso entrante — ${activePet.name}`,
      body: `La autoridad ${govtOrg.displayName} ejecutó un decomiso y propuso transferirte la custodia de ${activePet.name}. Tenés 7 días para aceptar o rechazar.`,
      ctaLabel: "Ver propuesta",
      ctaUrl: `/casos/${caseRow.publicCode}`,
      relatedCaseId: caseRow.id,
      relatedPetId: activePet.id,
    });
  }

  // 14c. Govt actor confirmation — info.
  pendingNotifications.push({
    userId: user.id,
    notificationType: "decomiso_confirmed_govt",
    severity: "info",
    title: `Decomiso ejecutado — ${activePet.name}`,
    body: `El decomiso de ${activePet.name} fue registrado. El refugio ${receiverOrg.displayName} fue notificado y tiene 7 días para aceptar.`,
    ctaLabel: "Ver caso",
    ctaUrl: `/casos/${caseRow.publicCode}`,
    relatedCaseId: caseRow.id,
    relatedPetId: activePet.id,
  });

  // Fix 3: Admins also receive a decomiso_confirmed_admin notification.
  const adminProfiles = await tx
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.role, "admin"), isNull(profiles.deactivatedAt)));
  for (const admin of adminProfiles) {
    if (admin.id === user.id) continue;
    pendingNotifications.push({
      userId: admin.id,
      notificationType: "decomiso_confirmed_admin",
      severity: "info",
      title: `Decomiso ejecutado — ${activePet.name}`,
      body: `La autoridad ${govtOrg.displayName} ejecutó un decomiso sobre ${activePet.name} (${motiveLabel(input.seizureMotive)}). Destinatario: ${receiverOrg.displayName}.`,
      ctaLabel: "Ver caso",
      ctaUrl: `/casos/${caseRow.publicCode}`,
      relatedCaseId: caseRow.id,
      relatedPetId: activePet.id,
    });
  }

  // ---------- Audit log ----------
  await tx.insert(auditLog).values({
    actorUserId: user.id,
    action: "decomiso_executed",
    payload: {
      case_id: caseRow.id,
      case_public_code: caseRow.publicCode,
      pet_id: activePet.id,
      pet_public_token: activePet.publicToken,
      subject_kind: input.subjectKind,
      govt_org_id: govtOrg.id,
      receiver_org_id: receiverOrg.id,
      seizure_motive: input.seizureMotive,
      judicial_ref: input.judicialProceedingReference ?? null,
      originating_welfare_report_id: input.originatingWelfareReportId ?? null,
      attachment_count: input.attachmentFiles.length,
    },
  });

  return { ok: true, publicCode, pendingNotifications };
}
