"use server";

// Decomiso (Ley 14.346) — server actions for the full handshake lifecycle.
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md §5.1–5.3.
//
// S2: executeDecomisoAction — opens the custody_episode case + emits the
//     custody_transfer_proposed handshake event toward the receiver refugio.
//
// S3 (this file): three receiver-handshake actions:
//   - acceptDecomisoHandoffAction   — receiver org member accepts the handoff.
//   - rejectDecomisoHandoffAction   — receiver org member rejects the handoff.
//   - reassignDecomisoToAnotherReceiverAction — govt reassigns to a new refugio.
//
// CANONICAL DISCRIMINATOR (S2 review §2.4):
//   A decomiso handshake = a custody_episode case opened by an org whose
//   orgType='sanitary_authority', with an open custody_transfer_proposed event.
//   Do NOT parse notes text to identify a decomiso handoff — use the case kind +
//   openedByOrganizationId.orgType + receiverOrganizationId on the case row.
//
// Receiver identifier: the receiver-facing actions take `casePublicCode` (the
//   custody_episode's public code) as the identifier, mirroring acceptCrossOrg-
//   TransferAction's pattern. The receiver org is the organization the caller
//   belongs to, and it must match the case's receiverOrganizationId.
//
// S2 transaction steps for executeDecomisoAction:
//   1. Auth: requireDecomisoPrincipal (govt | admin) + jurisdictions guard.
//   2. Resolve sanitary_authority org for the acting user.
//   3. Validate subject pet (registered, found by publicToken).
//   4. Validate receiver org (exists + is shelter/rescue_network + verified).
//   5. Validate attachments (min 2 per DC5).
//   6. Upload attachment files to Storage BEFORE the DB transaction.
//   7. openCase(custody_episode).
//   8. INSERT shelter_intake_recorded with seizure payload + caseId.
//   9. Close prev owner ownerships — capture prev owner userIds for notification.
//  10. Open transitional shelter_custody ownership for the govt org.
//  11. INSERT custody_transfer_proposed toward the receiver org.
//  12. INSERT attachment rows using pre-resolved storage paths.
//  13. If originatingWelfareReportId: cross-ref note_added on that welfare case.
//  14. Notifications: prev owner (urgent), receiver coordinators (urgent),
//      govt actor (info), admins (info).
//  15. Audit log: decomiso_executed.
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
// `notes` field as a structured key-value string. S3 uses the parent case kind
// + openedByOrganizationId.orgType as the canonical discriminator.

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
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
  profiles,
} from "@/db";
import { requireDecomisoPrincipal } from "@/lib/auth-guards";
import { requireCapability } from "@/lib/capabilities";
import { closeCase, findOpenCaseForPetAndKind, openCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExecuteDecomisoResult = { ok: true; publicCode: string } | { error: string };
export type DecomisoHandshakeResult = { ok: true; publicCode: string } | { error: string };

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
 *
 * Any active member of a sanitary_authority org may execute decomisos on
 * behalf of the org (spec §5.1 / DC1: the check is role='govt' at the profile
 * level, not org-level role). We do not further restrict by membership.role
 * here because the org-level role (coordinator vs. member) is not defined as
 * a discriminator in the spec — the profile.role='govt' check is sufficient.
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

  // Fix 4: Reject if the govt org has no province assigned. A null province
  // would make the custody_episode invisible to jurisdiction-filtered queries
  // (spec §13.6) and produce a case with no auditable jurisdiction.
  if (!govtOrg.jurisdictionProvince) {
    return {
      error: "La organización sanitaria no tiene provincia asignada. Contactá al administrador.",
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

  // ---- 5. Validate attachments (DC5) — BEFORE uploading anything ---------
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

  // Fix 1: Pet-jurisdiction vs user-jurisdiction scope check (spec §9 —
  // "govt fuera de jurisdiction RECHAZADO"). Admin role has universal scope
  // and bypasses this check. For govt, the pet's registered province must
  // appear in the user's assigned jurisdictions. A null pet province means
  // the pet was registered without a province — we allow the decomiso in that
  // case (no jurisdiction can be violated if none is recorded).
  if (session.profile.role === "govt") {
    const petProvince = pet.jurisdictionProvince;
    const inScope = !petProvince || session.jurisdictions.some((j) => j.province === petProvince);
    if (!inScope) {
      return {
        error: "Esta mascota no está en tu jurisdicción asignada.",
      };
    }
  }

  // Fix 5: Explicit double-seizure guard — clear Spanish error instead of raw
  // Postgres unique-constraint. A pet may only have one open custody_episode
  // at a time. We check before opening the case to return a human-readable
  // message.
  const existingEpisode = await findOpenCaseForPetAndKind(pet.id, "custody_episode");
  if (existingEpisode) {
    return {
      error: "Esta mascota ya tiene un decomiso/custodia activa en curso.",
    };
  }

  // Fix 2: Upload ALL attachment files to Storage BEFORE opening the DB
  // transaction. If any upload fails, we delete the already-uploaded blobs
  // (compensating cleanup) and return the error — no DB mutation happens.
  // After the transaction commits, if the DB throws, we also best-effort
  // clean up the uploaded blobs so a failed decomiso doesn't leave orphans.
  const supabaseAdmin = createAdminClient();

  type UploadedAttachment = {
    filename: string;
    storagePath: string;
    mimeType: string;
    size: number;
  };

  const uploadedAttachments: UploadedAttachment[] = [];

  // We need a stable prefix for all blobs in this decomiso. Use a
  // pre-generated UUID as the case-scoped directory (the real caseId will be
  // known only after openCase inside the tx, so we use a pre-generated UUID).
  const attachmentDir = randomUUID();

  for (const file of input.attachmentFiles) {
    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
    const storagePath = `decomiso/${attachmentDir}/${randomUUID()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabaseAdmin.storage
      .from(ATTACHMENT_BUCKET)
      .upload(storagePath, buffer, { contentType: file.type });

    if (uploadError) {
      // Compensating cleanup: delete the blobs already uploaded.
      if (uploadedAttachments.length > 0) {
        await supabaseAdmin.storage
          .from(ATTACHMENT_BUCKET)
          .remove(uploadedAttachments.map((u) => u.storagePath));
      }
      return {
        error: `No se pudo subir el adjunto "${file.name}": ${uploadError.message}`,
      };
    }

    uploadedAttachments.push({
      filename: file.name,
      storagePath,
      mimeType: file.type,
      size: file.size,
    });
  }

  // ---- Steps 7-15 inside a single transaction ----------------------------
  let createdPublicCode = "";
  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
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

      // 12. INSERT attachment rows using pre-resolved storage paths.
      // Files were already uploaded to Storage above (Fix 2). We only insert
      // the DB rows here — no uploads inside the transaction.
      for (const uploaded of uploadedAttachments) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: intakeEvent.id,
          uploadedByUserId: user.id,
          storagePath: uploaded.storagePath,
          mimeType: uploaded.mimeType,
          fileSize: uploaded.size,
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

      // Fix 3: Admins also receive a decomiso_confirmed_admin notification
      // (spec §13.7: "govt actor (confirmation) + admin"). Query active admins
      // inside the tx so we capture their IDs for the outside-tx insert below.
      const adminProfiles = await tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.role, "admin"), isNull(profiles.deactivatedAt)));
      for (const admin of adminProfiles) {
        if (admin.id === user.id) continue; // avoid duplicate if actor is admin
        pendingNotifications.push({
          userId: admin.id,
          notificationType: "decomiso_confirmed_admin",
          severity: "info",
          title: `Decomiso ejecutado — ${pet.name}`,
          body: `La autoridad ${govtOrg.displayName} ejecutó un decomiso sobre ${pet.name} (${motiveLabel(input.seizureMotive)}). Destinatario: ${receiverOrg.displayName}.`,
          ctaLabel: "Ver caso",
          ctaUrl: `/casos/${caseRow.publicCode}`,
          relatedCaseId: caseRow.id,
          relatedPetId: pet.id,
        });
      }

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
    // Fix 2 (post-tx compensating cleanup): if the DB transaction throws after
    // uploads succeeded, best-effort delete the uploaded blobs so a failed
    // decomiso doesn't leave orphans in Storage.
    if (uploadedAttachments.length > 0) {
      await supabaseAdmin.storage
        .from(ATTACHMENT_BUCKET)
        .remove(uploadedAttachments.map((u) => u.storagePath))
        .catch((cleanupErr) => {
          console.error("storage cleanup after failed decomiso tx (best-effort)", cleanupErr);
        });
    }
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

// ---------------------------------------------------------------------------
// acceptDecomisoHandoffAction (S3 — receiver org member accepts)
// ---------------------------------------------------------------------------
//
// Spec §5.2 — same pattern as acceptCrossOrgTransferAction but with two
// differences:
//   a) Auth: requireCapability('org.transfer.accept') against the RECEIVER org,
//      NOT requireDecomisoPrincipal. The receiver is a refugio.
//   b) After closing the govt's custody_episode, a NEW custody_episode is opened
//      for the receiver org (cross-org accept does not open a new episode).
//
// Single atomic transaction:
//   1. Auth + receiver org membership check.
//   2. Load + validate the custody_episode case (open, correct kind).
//   3. Load the latest custody_transfer_proposed — fail loudly if >1 (integrity).
//   4. Discriminator: openedByOrg.orgType must be 'sanitary_authority'.
//   5. Receiver authorization: caseRow.receiverOrganizationId === caller's org.
//   6. Emit custody_transferred (shelter_custody → shelter_custody, govt→receiver).
//   7. End govt's shelter_custody ownership row.
//   8. Open receiver's shelter_custody ownership row.
//   9. CLOSE the govt's custody_episode case (reason='resolved').
//  10. OPEN a new custody_episode for the receiver org (no further receiver).
//  11. Build notifications (best-effort outside tx): govt + receiver.
//  12. Audit log: decomiso_handoff_accepted.

export async function acceptDecomisoHandoffAction(input: {
  receiverOrgToken: string;
  casePublicCode: string;
}): Promise<DecomisoHandshakeResult> {
  const auth = await requireCapability("org.transfer.accept");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  if (organization.publicToken !== input.receiverOrgToken) {
    return { error: "Estás operando desde una organización distinta a la destinataria." };
  }

  // Load the custody_episode case.
  const [caseRow] = await db
    .select()
    .from(cases)
    .where(eq(cases.publicCode, input.casePublicCode))
    .limit(1);
  if (!caseRow) return { error: "Caso no encontrado." };
  if (caseRow.caseKind !== "custody_episode") {
    return { error: "Este caso no es un episodio de custodia." };
  }
  if (caseRow.status !== "open") {
    return { error: "Este caso ya no está abierto. El handoff ya fue procesado o cancelado." };
  }
  if (!caseRow.primaryPetId) {
    return { error: "Caso sin mascota asociada." };
  }

  // Validate canonical discriminator: opener must be a sanitary_authority org.
  const [openerOrg] = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      orgType: organizations.orgType,
    })
    .from(organizations)
    .where(eq(organizations.id, caseRow.openedByOrganizationId as string))
    .limit(1);
  if (!openerOrg || openerOrg.orgType !== "sanitary_authority") {
    return { error: "Este caso no corresponde a un decomiso de autoridad sanitaria." };
  }
  const govtOrgId = openerOrg.id;
  const govtOrgName = openerOrg.displayName;

  // Receiver authorization: canonical column is source of truth.
  const canonicalReceiverOrgId = caseRow.receiverOrganizationId;
  if (!canonicalReceiverOrgId) {
    return { error: "El caso no tiene destinatario asignado." };
  }
  if (canonicalReceiverOrgId !== organization.id) {
    return { error: "El decomiso no fue dirigido a tu organización." };
  }

  // Load the latest custody_transfer_proposed — fail loudly if >1 (same
  // integrity pattern as acceptCrossOrgTransferAction).
  const proposalEvents = await db
    .select()
    .from(petEvents)
    .where(
      and(eq(petEvents.caseId, caseRow.id), eq(petEvents.eventType, "custody_transfer_proposed")),
    )
    .orderBy(desc(petEvents.recordedAt))
    .limit(2);
  const [proposalEvent, shadowProposalEvent] = proposalEvents;
  if (!proposalEvent) return { error: "Propuesta de handoff no encontrada." };
  if (shadowProposalEvent) {
    console.error(
      `decomiso-handshake integrity: case ${caseRow.id} has multiple custody_transfer_proposed events; refusing to accept until reconciled`,
    );
    return {
      error:
        "El caso tiene propuestas duplicadas. Contactá soporte para reconciliarlo antes de aceptar.",
    };
  }

  const proposalPayload = proposalEvent.payload as {
    from_organization_id?: string;
    to_organization_id?: string;
    reason?: string;
  };

  // Cross-check proposal payload vs case row (same drift guard as cross-org).
  if (
    caseRow.openedByOrganizationId &&
    proposalPayload.from_organization_id &&
    caseRow.openedByOrganizationId !== proposalPayload.from_organization_id
  ) {
    console.error(
      `decomiso-handshake integrity: case ${caseRow.id} openedByOrganizationId (${caseRow.openedByOrganizationId}) does not match proposal from_organization_id (${proposalPayload.from_organization_id})`,
    );
    return {
      error: "Inconsistencia entre el caso y la propuesta. Contactá soporte.",
    };
  }
  if (
    caseRow.receiverOrganizationId &&
    proposalPayload.to_organization_id &&
    caseRow.receiverOrganizationId !== proposalPayload.to_organization_id
  ) {
    console.error(
      `decomiso-handshake integrity: case ${caseRow.id} receiverOrganizationId (${caseRow.receiverOrganizationId}) does not match proposal to_organization_id (${proposalPayload.to_organization_id})`,
    );
    return {
      error: "Inconsistencia entre el caso y la propuesta. Contactá soporte.",
    };
  }

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      const now = new Date();

      // 6. Emit custody_transferred (shelter_custody → shelter_custody, govt→receiver).
      const transferPayload = validateEventPayload("custody_transferred", {
        from_user_id: null,
        from_organization_id: govtOrgId,
        to_user_id: null,
        to_organization_id: organization.id,
        from_role: "shelter_custody",
        to_role: "shelter_custody",
        reason: "org_to_org_handoff",
        matched_against_pet_id: null,
        foster_ended_event_id: null,
        notes: null,
      });
      await tx.insert(petEvents).values({
        petId: caseRow.primaryPetId as string,
        eventType: "custody_transferred",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified: organization.verified,
        payload: transferPayload,
        caseId: caseRow.id,
      });

      // 7. End the govt's transitional shelter_custody ownership.
      await tx
        .update(ownerships)
        .set({ endedAt: now })
        .where(
          and(
            eq(ownerships.petId, caseRow.primaryPetId as string),
            eq(ownerships.ownerOrganizationId, govtOrgId),
            eq(ownerships.role, "shelter_custody"),
            isNull(ownerships.endedAt),
          ),
        );

      // 8. Open the receiver's shelter_custody ownership.
      await tx.insert(ownerships).values({
        petId: caseRow.primaryPetId as string,
        ownerOrganizationId: organization.id,
        role: "shelter_custody",
        startedAt: now,
      });

      // 9. Close the govt's custody_episode case (reason='resolved').
      await closeCase({ caseId: caseRow.id, reason: "resolved", closedByUserId: user.id }, tx);

      // 10. Open a NEW custody_episode for the receiver org (spec §5.2 / DC10).
      // This is the key difference from acceptCrossOrgTransferAction, which does
      // NOT open a new episode. The receiver's custody_episode tracks the refugio's
      // active custody going forward (adoption, transfer, death, etc.).
      const receiverEpisode = await openCase(
        {
          kind: "custody_episode",
          primarySubjectKind: "registered_pet",
          primaryPetId: caseRow.primaryPetId,
          jurisdictionProvince: caseRow.jurisdictionProvince,
          jurisdictionLocality: caseRow.jurisdictionLocality,
          jurisdictionCountry: caseRow.jurisdictionCountry ?? "AR",
          openedByUserId: user.id,
          openedByOrganizationId: organization.id,
          // No receiverOrganizationId — this episode is the receiver's own custody.
          openedReason: `auto: decomiso handoff aceptado desde caso ${caseRow.publicCode}`,
        },
        tx,
      );

      // 11. Build notifications (best-effort, inserted outside tx).

      // Govt org coordinators — success (spec §13.7: decomiso_handoff_accepted_govt).
      const govtCoords = await tx
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, govtOrgId),
            inArray(organizationMemberships.role, ["admin", "coordinator"]),
            isNull(organizationMemberships.leftAt),
          ),
        );
      for (const coord of govtCoords) {
        pendingNotifications.push({
          userId: coord.userId,
          notificationType: "decomiso_handoff_accepted_govt" as const,
          severity: "success" as const,
          title: "Decomiso aceptado por el refugio",
          body: `${organization.displayName} aceptó la custodia del decomiso (caso ${caseRow.publicCode}). El episodio de custodia del refugio quedó registrado como ${receiverEpisode.publicCode}.`,
          ctaLabel: "Ver caso",
          ctaUrl: `/casos/${receiverEpisode.publicCode}`,
          relatedCaseId: receiverEpisode.id,
          relatedPetId: caseRow.primaryPetId,
        });
      }

      // Receiver actor — success (spec §13.7: decomiso_handoff_accepted_receiver).
      pendingNotifications.push({
        userId: user.id,
        notificationType: "decomiso_handoff_accepted_receiver" as const,
        severity: "success" as const,
        title: "Custodia del decomiso confirmada",
        body: `Aceptaste la custodia del animal decomisado por ${govtOrgName}. El caso de custodia es ${receiverEpisode.publicCode}.`,
        ctaLabel: "Ver caso",
        ctaUrl: `/casos/${receiverEpisode.publicCode}`,
        relatedCaseId: receiverEpisode.id,
        relatedPetId: caseRow.primaryPetId,
      });

      // 12. Audit log.
      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "decomiso_handoff_accepted",
        payload: {
          closed_govt_case_id: caseRow.id,
          closed_govt_case_public_code: caseRow.publicCode,
          opened_receiver_case_id: receiverEpisode.id,
          opened_receiver_case_public_code: receiverEpisode.publicCode,
          pet_id: caseRow.primaryPetId,
          govt_org_id: govtOrgId,
          receiver_org_id: organization.id,
        },
      });
    });
  } catch (err) {
    return {
      error: `No se pudo aceptar el handoff de decomiso: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (acceptDecomisoHandoffAction succeeded)", e);
    }
  }

  revalidatePath(`/org/${input.receiverOrgToken}/transferencias/recibidas`);
  revalidatePath("/gob/decomisos");
  return { ok: true, publicCode: input.casePublicCode };
}

// ---------------------------------------------------------------------------
// rejectDecomisoHandoffAction (S3 — receiver org member rejects)
// ---------------------------------------------------------------------------
//
// Spec §5.3 — receiver rejects; govt's custody_episode stays open.
//
// Key differences from rejectCrossOrgTransferAction:
//   - The case kind is custody_episode, not custody_transfer_handshake.
//   - The case is NOT closed — the govt retains the open episode.
//   - No ownership flip: pet stays in govt transitional custody.
//
// Single atomic transaction:
//   1. Auth: requireCapability('org.transfer.accept') — receiver org member.
//   2. Load + validate the custody_episode case (open, correct kind).
//   3. Discriminator check: opener is sanitary_authority.
//   4. Receiver authorization: receiverOrganizationId matches caller's org.
//   5. Emit note_added(category='rejection') with the reason.
//   6. Close the custody_transfer_proposed handshake (NOT the custody_episode).
//      Mechanically: close a note-only "handshake" state — because there is no
//      separate handshake case for decomiso (the custody_episode IS the case),
//      we mark the proposal as cancelled by updating the case's
//      receiverOrganizationId to null and emitting the rejection note. The
//      custody_episode status stays 'open'.
//   7. Notify govt (decomiso_handoff_rejected_govt).
//   8. Audit log: decomiso_handoff_rejected.

export async function rejectDecomisoHandoffAction(input: {
  receiverOrgToken: string;
  casePublicCode: string;
  reason?: string | null;
  message?: string | null;
}): Promise<DecomisoHandshakeResult> {
  const auth = await requireCapability("org.transfer.accept");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  if (organization.publicToken !== input.receiverOrgToken) {
    return { error: "Estás operando desde una organización distinta a la destinataria." };
  }

  const [caseRow] = await db
    .select()
    .from(cases)
    .where(eq(cases.publicCode, input.casePublicCode))
    .limit(1);
  if (!caseRow) return { error: "Caso no encontrado." };
  if (caseRow.caseKind !== "custody_episode") {
    return { error: "Este caso no es un episodio de custodia." };
  }
  if (caseRow.status !== "open") {
    return { error: "Este caso ya no está abierto. El handoff ya fue procesado o cancelado." };
  }
  if (!caseRow.primaryPetId) {
    return { error: "Caso sin mascota asociada." };
  }

  // Discriminator: opener must be a sanitary_authority org.
  const [openerOrg] = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      orgType: organizations.orgType,
    })
    .from(organizations)
    .where(eq(organizations.id, caseRow.openedByOrganizationId as string))
    .limit(1);
  if (!openerOrg || openerOrg.orgType !== "sanitary_authority") {
    return { error: "Este caso no corresponde a un decomiso de autoridad sanitaria." };
  }
  const govtOrgId = openerOrg.id;

  // Receiver authorization.
  const canonicalReceiverOrgId = caseRow.receiverOrganizationId;
  if (!canonicalReceiverOrgId) {
    return {
      error: "Este decomiso no tiene destinatario activo. Puede que ya haya sido reasignado.",
    };
  }
  if (canonicalReceiverOrgId !== organization.id) {
    return { error: "El decomiso no fue dirigido a tu organización." };
  }

  const reasonNote =
    [input.reason, input.message?.trim()].filter(Boolean).join(" — ") ||
    "Rechazado sin motivo especificado";

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      const now = new Date();

      // 5. Emit note_added(category='rejection') — spec §5.3.
      const notePayload = validateEventPayload("note_added", {
        category: "system" as const,
        text: `Handoff rechazado por el receptor (${organization.displayName}): ${reasonNote}`,
      });
      await tx.insert(petEvents).values({
        petId: caseRow.primaryPetId as string,
        eventType: "note_added",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified: organization.verified,
        payload: notePayload,
        caseId: caseRow.id,
      });

      // 6. Cancel the pending proposal: clear receiverOrganizationId on the case
      // so the episode is no longer in the "intake_pending_acceptance" phase (spec
      // §13.2). The custody_episode remains open — the pet stays with the govt.
      // The cross-org pattern would close the handshake case entirely; here the
      // episode IS the case, so we only clear the receiver instead of closing.
      await tx
        .update(cases)
        .set({ receiverOrganizationId: null, updatedAt: now })
        .where(eq(cases.id, caseRow.id));

      // 7. Notify govt coordinators.
      const govtCoords = await tx
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, govtOrgId),
            inArray(organizationMemberships.role, ["admin", "coordinator"]),
            isNull(organizationMemberships.leftAt),
          ),
        );
      for (const coord of govtCoords) {
        pendingNotifications.push({
          userId: coord.userId,
          notificationType: "decomiso_handoff_rejected_govt" as const,
          severity: "info" as const,
          title: "Handoff de decomiso rechazado",
          body: `${organization.displayName} rechazó la propuesta de custodia del caso ${caseRow.publicCode}. Motivo: ${reasonNote}. El animal sigue en custodia oficial — podés reasignar a otro refugio.`,
          ctaLabel: "Ver caso",
          ctaUrl: `/casos/${caseRow.publicCode}`,
          relatedCaseId: caseRow.id,
          relatedPetId: caseRow.primaryPetId,
        });
      }

      // 8. Audit log.
      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "decomiso_handoff_rejected",
        payload: {
          case_id: caseRow.id,
          case_public_code: caseRow.publicCode,
          pet_id: caseRow.primaryPetId,
          govt_org_id: govtOrgId,
          receiver_org_id: organization.id,
          reason: reasonNote,
        },
      });
    });
  } catch (err) {
    return {
      error: `No se pudo rechazar el handoff de decomiso: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (rejectDecomisoHandoffAction succeeded)", e);
    }
  }

  revalidatePath(`/org/${input.receiverOrgToken}/transferencias/recibidas`);
  revalidatePath("/gob/decomisos");
  return { ok: true, publicCode: input.casePublicCode };
}

// ---------------------------------------------------------------------------
// reassignDecomisoToAnotherReceiverAction (S3 — govt reassigns to new refugio)
// ---------------------------------------------------------------------------
//
// Spec §5.3 — govt action after rejection or proactive reassign.
//
// Auth: requireDecomisoPrincipal (govt | admin) + must be the opening org.
//
// Single atomic transaction:
//   1. Auth: requireDecomisoPrincipal + jurisdiction check.
//   2. Resolve govt org (must be the case opener).
//   3. Load + validate the custody_episode case.
//   4. Validate new receiver org (verified shelter/rescue_network).
//   5. Cancel the current proposal: emit note_added(category='system', text='reassign')
//      to document why the previous proposal is superseded.
//   6. Emit a new custody_transfer_proposed toward the new receiver org.
//   7. Update the case's receiverOrganizationId to the new receiver.
//   8. Notify the new receiver (decomiso_handoff_proposed_receiver).
//   9. Audit log: decomiso_handoff_cancelled (for the cancelled prior proposal).

export async function reassignDecomisoToAnotherReceiverAction(input: {
  casePublicCode: string;
  newReceiverOrgId: string;
  reason?: string | null;
}): Promise<DecomisoHandshakeResult> {
  // 1. Auth.
  const session = await requireDecomisoPrincipal();
  const { user } = session;

  if (session.profile.role === "govt" && session.jurisdictions.length === 0) {
    return {
      error: "No tenés jurisdicciones activas asignadas para reasignar un decomiso.",
    };
  }

  // 2. Resolve govt org.
  const govtOrg = await resolveGovtOrgForUser(user.id);
  if (!govtOrg) {
    return {
      error: "Tu usuario no está asociado a ninguna autoridad sanitaria.",
    };
  }

  // 3. Load + validate the custody_episode case.
  const [caseRow] = await db
    .select()
    .from(cases)
    .where(eq(cases.publicCode, input.casePublicCode))
    .limit(1);
  if (!caseRow) return { error: "Caso no encontrado." };
  if (caseRow.caseKind !== "custody_episode") {
    return { error: "Este caso no es un episodio de custodia." };
  }
  if (caseRow.status !== "open") {
    return { error: "Este caso ya no está abierto." };
  }
  if (!caseRow.primaryPetId) {
    return { error: "Caso sin mascota asociada." };
  }

  // Must be the opening govt org.
  if (caseRow.openedByOrganizationId !== govtOrg.id) {
    return { error: "Solo la autoridad que abrió el decomiso puede reasignarlo." };
  }

  // 4. Validate new receiver org (same checks as executeDecomisoAction).
  if (!input.newReceiverOrgId?.trim()) {
    return { error: "Debe seleccionar un nuevo refugio destinatario." };
  }
  if (input.newReceiverOrgId === govtOrg.id) {
    return { error: "El nuevo destinatario no puede ser la propia autoridad sanitaria." };
  }
  // Prevent reassigning to the same current receiver (no-op guard).
  if (input.newReceiverOrgId === caseRow.receiverOrganizationId) {
    return { error: "El nuevo destinatario es el mismo que el actual." };
  }

  const [newReceiverOrg] = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      verified: organizations.verified,
      status: organizations.status,
      orgType: organizations.orgType,
    })
    .from(organizations)
    .where(eq(organizations.id, input.newReceiverOrgId))
    .limit(1);
  if (!newReceiverOrg) {
    return { error: "Organización destinataria no encontrada." };
  }
  if (!newReceiverOrg.verified || newReceiverOrg.status !== "active") {
    return { error: "La organización destinataria no está verificada o activa." };
  }
  if (!["shelter", "rescue_network"].includes(newReceiverOrg.orgType)) {
    return {
      error:
        "El nuevo destinatario debe ser un refugio (shelter) o red de rescate (rescue_network).",
    };
  }

  // Load the pet for notification copy.
  const [pet] = await db
    .select({ id: pets.id, name: pets.name })
    .from(pets)
    .where(eq(pets.id, caseRow.primaryPetId as string))
    .limit(1);

  const petName = pet?.name ?? "el animal";
  const reassignReason = input.reason?.trim() || "Reasignado por la autoridad sanitaria";

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      const now = new Date();

      // 5. Cancel the current proposal: emit note_added documenting the supersession.
      const cancelNotePayload = validateEventPayload("note_added", {
        category: "system" as const,
        text: `Propuesta anterior cancelada por reasignación. Nuevo destinatario: ${newReceiverOrg.displayName}. Motivo: ${reassignReason}`,
      });
      await tx.insert(petEvents).values({
        petId: caseRow.primaryPetId as string,
        eventType: "note_added",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "govt",
        authorOrganizationId: govtOrg.id,
        authorVerified: true,
        payload: cancelNotePayload,
        caseId: caseRow.id,
      });

      // 6. Emit a new custody_transfer_proposed toward the new receiver.
      const newProposalPayload = validateEventPayload("custody_transfer_proposed", {
        from_user_id: null,
        from_organization_id: govtOrg.id,
        to_user_id: null,
        to_organization_id: newReceiverOrg.id,
        reason: "other" as const,
        matched_against_pet_id: null,
        proposed_at: now.toISOString(),
        notes: `from_decomiso=true reassignment=true case=${caseRow.publicCode}`,
      });
      await tx.insert(petEvents).values({
        petId: caseRow.primaryPetId as string,
        eventType: "custody_transfer_proposed",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "govt",
        authorOrganizationId: govtOrg.id,
        authorVerified: true,
        payload: newProposalPayload,
        caseId: caseRow.id,
      });

      // 7. Update the case's receiverOrganizationId to the new receiver.
      await tx
        .update(cases)
        .set({ receiverOrganizationId: newReceiverOrg.id, updatedAt: now })
        .where(eq(cases.id, caseRow.id));

      // 8. Notify the new receiver coordinators (spec §13.7: decomiso_handoff_proposed_receiver).
      const newReceiverCoords = await tx
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, newReceiverOrg.id),
            inArray(organizationMemberships.role, ["admin", "coordinator"]),
            isNull(organizationMemberships.leftAt),
          ),
        );
      for (const coord of newReceiverCoords) {
        pendingNotifications.push({
          userId: coord.userId,
          notificationType: "decomiso_handoff_proposed_receiver" as const,
          severity: "urgent" as const,
          title: `Decomiso reasignado — ${petName}`,
          body: `La autoridad ${govtOrg.displayName} reasignó el decomiso de ${petName} a tu organización. Tenés 7 días para aceptar o rechazar.`,
          ctaLabel: "Ver propuesta",
          ctaUrl: `/casos/${caseRow.publicCode}`,
          relatedCaseId: caseRow.id,
          relatedPetId: caseRow.primaryPetId,
        });
      }

      // 9. Audit log: decomiso_handoff_cancelled (for the cancelled prior proposal).
      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "decomiso_handoff_cancelled",
        payload: {
          case_id: caseRow.id,
          case_public_code: caseRow.publicCode,
          pet_id: caseRow.primaryPetId,
          govt_org_id: govtOrg.id,
          previous_receiver_org_id: caseRow.receiverOrganizationId ?? null,
          new_receiver_org_id: newReceiverOrg.id,
          reason: reassignReason,
        },
      });
    });
  } catch (err) {
    return {
      error: `No se pudo reasignar el decomiso: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error(
        "notifications insert failed (reassignDecomisoToAnotherReceiverAction succeeded)",
        e,
      );
    }
  }

  revalidatePath("/gob/decomisos");
  return { ok: true, publicCode: input.casePublicCode };
}
