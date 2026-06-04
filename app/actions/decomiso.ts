"use server";

// Decomiso (Ley 14.346) execution — server action.
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md §5.1.
//
// Execution + handoff proposal only (S2). Receiver accept/reject is S3.
//
// Single atomic transaction:
//   1. Auth: requireDecomisoPrincipal (govt | admin) + jurisdictions guard.
//   2. Resolve sanitary_authority org for the acting user.
//   3. Validate subject pet (registered, found by publicToken).
//   4. Validate receiver org (exists + is shelter/rescue_network + verified).
//   5. Validate attachments (min 2 per DC5).
//   6. openCase(custody_episode).
//   7. INSERT shelter_intake_recorded with seizure payload + caseId.
//   8. Close prev owner ownerships — capture prev owner userIds for notification.
//   9. Open transitional shelter_custody ownership for the govt org.
//  10. INSERT custody_transfer_proposed toward the receiver org.
//  11. Upload attachments + link each to the intake event.
//  12. If originatingWelfareReportId: cross-ref note_added on that welfare case.
//  13. Notifications: prev owner (urgent), receiver coordinators (urgent),
//      govt actor (info).
//  14. Audit log: decomiso_executed.
//
// Subject scope (S2): registered_pet only (found by publicToken). The
// unowned_animal path (seizing a stray → create-pet-in-flight) is deferred
// to a follow-up slice — it requires additional product decisions around
// anonymous pet creation that go beyond this action's scope. The action
// returns an explicit error when called with a non-registered subject.
//
// Decomiso marker on the handoff proposal: the custody_transfer_proposed schema
// does not have a `from_decomiso` boolean field (adding one would require a
// schema change + migration). Instead, the decomiso context is embedded in the
// `notes` field as a structured key-value string. S3's acceptDecomisoHandoffAction
// can use the parent case kind ('custody_episode' opened by a sanitary_authority org)
// as the canonical discriminator without relying on the notes text.

import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  attachments,
  auditLog,
  cases,
  db,
  notifications,
  organizationMemberships,
  organizations,
  ownerships,
  petEvents,
  pets,
} from "@/db";
import { requireDecomisoPrincipal } from "@/lib/auth-guards";
import { openCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExecuteDecomisoResult = { ok: true; publicCode: string } | { error: string };

export type SeizureMotive =
  | "maltrato_fisico"
  | "abandono_extremo"
  | "acumulacion"
  | "trafico"
  | "sin_refugio_critico"
  | "pelea_de_perros"
  | "otro";

export interface ExecuteDecomisoInput {
  /** publicToken of the registered pet being seized. */
  petPublicToken: string;
  seizureMotive: SeizureMotive;
  seizureMotiveOtherDetail?: string | null;
  judicialProceedingReference?: string | null;
  originatingWelfareReportId?: string | null;
  /** Verified refugio / rescue_network that will receive the handoff (required). */
  intendedReceiverOrganizationId: string;
  /** Free-text condition of the animal at seizure time. */
  intakeCondition?: string | null;
  /** Minimum 2 files per DC5 (1 foto + 1 acta administrativa). Max 10. */
  attachmentFiles: File[];
}

// ---------------------------------------------------------------------------
// resolveGovtOrgForUser
// ---------------------------------------------------------------------------

/**
 * Returns the sanitary_authority organization where `userId` holds an active
 * membership. Returns null when no such org exists (action blocks).
 *
 * Spec §3 identifies the welfare authority as an org with
 * org_type='sanitary_authority'. A profile.role='govt' without org membership
 * is an incomplete setup — we surface a clear error in that case.
 */
export async function resolveGovtOrgForUser(userId: string): Promise<{
  id: string;
  displayName: string;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
} | null> {
  const [row] = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      jurisdictionProvince: organizations.jurisdictionProvince,
      jurisdictionLocality: organizations.jurisdictionLocality,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizations.orgType, "sanitary_authority"),
        eq(organizations.status, "active"),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// executeDecomisoAction
// ---------------------------------------------------------------------------

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB per DC5
const ATTACHMENT_BUCKET = "pet-attachments";

export async function executeDecomisoAction(
  input: ExecuteDecomisoInput,
): Promise<ExecuteDecomisoResult> {
  // ---- 1. Auth -----------------------------------------------------------
  const session = await requireDecomisoPrincipal();
  const { user } = session;

  // Govt users require at least one active jurisdiction assignment (spec §4.4 / DC1).
  // Admins have universal scope (session.jurisdictions is empty for admin by design).
  if (session.profile.role === "govt" && session.jurisdictions.length === 0) {
    return {
      error:
        "No tenés jurisdicciones activas asignadas. Contactá al administrador para ejecutar un decomiso.",
    };
  }

  // ---- 2. Resolve govt org -----------------------------------------------
  const govtOrg = await resolveGovtOrgForUser(user.id);
  if (!govtOrg) {
    return {
      error:
        "Tu usuario no está asociado a ninguna autoridad sanitaria. Contactá al administrador para configurar tu organización.",
    };
  }

  // ---- 3. Validate seizure motive ----------------------------------------
  if (input.seizureMotive === "otro" && !input.seizureMotiveOtherDetail?.trim()) {
    return { error: "El motivo 'Otro' requiere un detalle explicativo." };
  }

  // ---- 4. Validate receiver org ------------------------------------------
  if (!input.intendedReceiverOrganizationId?.trim()) {
    return { error: "Debe seleccionar un refugio destinatario." };
  }

  const [receiverOrg] = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      verified: organizations.verified,
      status: organizations.status,
      orgType: organizations.orgType,
    })
    .from(organizations)
    .where(eq(organizations.id, input.intendedReceiverOrganizationId))
    .limit(1);
  if (!receiverOrg) {
    return { error: "Organización destinataria no encontrada." };
  }
  if (!receiverOrg.verified || receiverOrg.status !== "active") {
    return { error: "La organización destinataria no está verificada o activa." };
  }
  if (!["shelter", "rescue_network"].includes(receiverOrg.orgType)) {
    return {
      error:
        "La organización destinataria debe ser un refugio (shelter) o red de rescate (rescue_network).",
    };
  }
  if (receiverOrg.id === govtOrg.id) {
    return { error: "El destinatario no puede ser la propia autoridad sanitaria." };
  }

  // ---- 5. Validate attachments (DC5) -------------------------------------
  if (input.attachmentFiles.length < 2) {
    return {
      error: "Mínimo 2 adjuntos requeridos: foto del animal + acta administrativa.",
    };
  }
  for (const file of input.attachmentFiles) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return { error: `El archivo "${file.name}" supera el límite de 25 MB.` };
    }
  }

  // ---- 6. Load subject pet (S2: registered_pet only) ---------------------
  const [pet] = await db
    .select()
    .from(pets)
    .where(eq(pets.publicToken, input.petPublicToken))
    .limit(1);
  if (!pet) {
    return { error: "Mascota no encontrada. Verificá el token público." };
  }

  // ---- Steps 7-14 inside a single transaction ----------------------------
  let createdPublicCode = "";
  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    const supabaseAdmin = createAdminClient();

    await db.transaction(async (tx) => {
      const now = new Date();

      // 7. openCase(custody_episode) — spec §13.3.
      const caseRow = await openCase(
        {
          kind: "custody_episode",
          primarySubjectKind: "registered_pet",
          primaryPetId: pet.id,
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
      createdPublicCode = caseRow.publicCode;

      // 8. INSERT shelter_intake_recorded with full seizure payload + caseId.
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
          petId: pet.id,
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

      // 9. Capture prev owner userIds then close all active ownerships.
      // (DC7 / spec §5.1 step 4: "close existing owner ownerships")
      const prevOwnerOwnerships = await tx
        .select({
          ownerUserId: ownerships.ownerUserId,
        })
        .from(ownerships)
        .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)));

      const prevOwnerUserIds = prevOwnerOwnerships
        .map((o) => o.ownerUserId)
        .filter((id): id is string => id !== null);

      await tx
        .update(ownerships)
        .set({ endedAt: now })
        .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)));

      // 10. Open transitional shelter_custody for the govt org.
      // ownership_role enum has 'shelter_custody'; this is the correct value per DC7
      // ("row de shelter_custody para la welfare authority"). No 'pending_transfer'
      // role exists in the schema — shelter_custody is used by all custody holders.
      await tx.insert(ownerships).values({
        petId: pet.id,
        ownerOrganizationId: govtOrg.id,
        role: "shelter_custody",
        startedAt: now,
      });

      // 11. INSERT custody_transfer_proposed toward the receiver org.
      // Decomiso marker lives in `notes` as a structured string (no dedicated
      // schema field exists; adding one would require a migration). S3 uses
      // the parent case kind + openedByOrganizationId.orgType as the canonical
      // discriminator for decomiso vs. civil cross-org handoffs.
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
        petId: pet.id,
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

      // 12. Upload attachments and link each one to the intake event.
      for (const file of input.attachmentFiles) {
        const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
        const filename = `decomiso/${caseRow.id}/${randomUUID()}.${ext}`;

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const { error: uploadError } = await supabaseAdmin.storage
          .from(ATTACHMENT_BUCKET)
          .upload(filename, buffer, { contentType: file.type });

        if (uploadError) {
          throw new Error(`No se pudo subir el adjunto "${file.name}": ${uploadError.message}`);
        }

        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: intakeEvent.id,
          uploadedByUserId: user.id,
          storagePath: filename,
          mimeType: file.type,
          fileSize: file.size,
        });
      }

      // 13. Cross-reference note on the originating welfare case (spec §5.1 step 8 / DC12).
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
            petId: pet.id,
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

      // 14. Build notifications (inserted outside tx below — spec: notifications
      // are best-effort; a failed notif must not roll back the decomiso).

      // 14a. Previous owner(s) — urgent (spec §13.7: decomiso_owner_lost_custody).
      for (const prevUserId of prevOwnerUserIds) {
        pendingNotifications.push({
          userId: prevUserId,
          notificationType: "decomiso_owner_lost_custody",
          severity: "urgent",
          title: "Custodia oficial transferida",
          body: `La autoridad sanitaria ${govtOrg.displayName} ejecutó un decomiso sobre tu mascota ${pet.name}. Motivo: ${motiveLabel(input.seizureMotive)}.${input.judicialProceedingReference ? ` Referencia judicial: ${input.judicialProceedingReference}.` : ""} Para más información contactá a la autoridad sanitaria de tu jurisdicción.`,
          ctaLabel: "Más información",
          ctaUrl: `/casos/${caseRow.publicCode}`,
          relatedCaseId: caseRow.id,
          relatedPetId: pet.id,
        });
      }

      // 14b. Receiver org coordinators — urgent (spec §13.7: decomiso_handoff_proposed_receiver).
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
          title: `Decomiso entrante — ${pet.name}`,
          body: `La autoridad ${govtOrg.displayName} ejecutó un decomiso y propuso transferirte la custodia de ${pet.name}. Tenés 7 días para aceptar o rechazar.`,
          ctaLabel: "Ver propuesta",
          ctaUrl: `/casos/${caseRow.publicCode}`,
          relatedCaseId: caseRow.id,
          relatedPetId: pet.id,
        });
      }

      // 14c. Govt actor confirmation — info (spec §13.7: decomiso_confirmed_govt).
      pendingNotifications.push({
        userId: user.id,
        notificationType: "decomiso_confirmed_govt",
        severity: "info",
        title: `Decomiso ejecutado — ${pet.name}`,
        body: `El decomiso de ${pet.name} fue registrado. El refugio ${receiverOrg.displayName} fue notificado y tiene 7 días para aceptar.`,
        ctaLabel: "Ver caso",
        ctaUrl: `/casos/${caseRow.publicCode}`,
        relatedCaseId: caseRow.id,
        relatedPetId: pet.id,
      });

      // 15. Audit log (spec §4.5 / §5.1 step 10).
      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "decomiso_executed",
        payload: {
          case_id: caseRow.id,
          case_public_code: caseRow.publicCode,
          pet_id: pet.id,
          pet_public_token: pet.publicToken,
          govt_org_id: govtOrg.id,
          receiver_org_id: receiverOrg.id,
          seizure_motive: input.seizureMotive,
          judicial_ref: input.judicialProceedingReference ?? null,
          originating_welfare_report_id: input.originatingWelfareReportId ?? null,
          attachment_count: input.attachmentFiles.length,
        },
      });
    });
  } catch (err) {
    return {
      error: `No se pudo ejecutar el decomiso: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  // Insert notifications outside the main tx — best-effort, non-blocking.
  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (executeDecomisoAction succeeded)", e);
    }
  }

  revalidatePath("/gob/decomisos");
  return { ok: true, publicCode: createdPublicCode };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function motiveLabel(motive: SeizureMotive): string {
  switch (motive) {
    case "maltrato_fisico":
      return "Maltrato físico";
    case "abandono_extremo":
      return "Abandono extremo";
    case "acumulacion":
      return "Acumulación";
    case "trafico":
      return "Tráfico";
    case "sin_refugio_critico":
      return "Sin refugio crítico";
    case "pelea_de_perros":
      return "Pelea de perros";
    case "otro":
      return "Otro";
  }
}
