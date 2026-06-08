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
// S2 transaction steps for executeDecomisoAction (registered_pet path):
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
// Subject scope: two paths (DC3):
//   - registered_pet: found by publicToken. DC2 double-confirm applies (owner
//     notification emitted, prev ownerships closed).
//   - unowned_animal: a stray with no prior registration. A new pet row is
//     created inside the tx (mirroring createIntakeAction's pet insert, no
//     ownership row for a prior owner). primarySubjectKind is set to
//     'registered_pet' on the case (the pet was just created — it IS registered
//     at that point) and primaryPetId = newPet.id. The cases CHECK constraint
//     requires (primarySubjectKind = 'registered_pet') = (primaryPetId IS NOT
//     NULL), so unowned_animal with a non-null petId would violate it. Jurisdiction
//     for the new pet comes from the govt org (the stray has no prior jurisdiction).
//     DC2 double-confirm modal is NOT shown (no prior owner to dispossess).
//     Owner notification is skipped. All other steps (seizure, custody, handoff,
//     audit) are identical to the registered_pet path.
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
import { closeCase, findOpenCaseForPetAndKind, openCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";
import { generatePublicToken } from "@/lib/publicToken";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateUniqueToken, isUniqueViolation } from "@/lib/unique-token";
import { requireCapability } from "@/src/modules/organizations/infrastructure/authz-resolver";

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

/** Descriptive fields for an unowned stray animal. Mirrors createIntakeAction's pet fields. */
export interface UnownedAnimalInput {
  /** Required: species (e.g. 'dog', 'cat'). */
  species: string;
  /** Approximate sex ('male' | 'female' | 'unknown'). */
  sex: "male" | "female" | "unknown";
  /** Optional breed description. */
  breed?: string | null;
  /** Optional coat / fur color. */
  color?: string | null;
  /** Optional distinctive markings (cicatrices, manchas, etc.). */
  distinguishingFeatures?: string | null;
  /** Approximate age in months (null when unknown). */
  approxAgeMonths?: number | null;
}

export interface ExecuteDecomisoInput {
  /** Discriminator — determines which path is taken. */
  subjectKind: "registered_pet" | "unowned_animal";
  /** Required when subjectKind='registered_pet': publicToken of the registered pet. */
  petPublicToken?: string | null;
  /** Required when subjectKind='unowned_animal': descriptive fields for the stray. */
  unownedAnimal?: UnownedAnimalInput | null;
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

  // ---- 6. Load / validate subject — branches on subjectKind (DC3) --------

  if (input.subjectKind === "registered_pet") {
    // --- Registered pet path ---
    if (!input.petPublicToken?.trim()) {
      return { error: "Ingresá el token de la mascota registrada." };
    }

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
        return { error: "Esta mascota no está en tu jurisdicción asignada." };
      }
    }

    // Fix 5: Explicit double-seizure guard — clear Spanish error instead of raw
    // Postgres unique-constraint. A pet may only have one open custody_episode
    // at a time. We check before opening the case to return a human-readable message.
    const existingEpisode = await findOpenCaseForPetAndKind(pet.id, "custody_episode");
    if (existingEpisode) {
      return { error: "Esta mascota ya tiene un decomiso/custodia activa en curso." };
    }

    return _runDecomisoTransaction({
      input,
      govtOrg,
      receiverOrg,
      user,
      existingPet: pet,
      unownedData: null,
    });
  }

  // --- Unowned animal path (DC3) ---
  if (!input.unownedAnimal?.species?.trim()) {
    return { error: "Indicá al menos la especie del animal sin registrar." };
  }

  // W3: Server-side species allowlist (the form <select> is not a real guard).
  const ALLOWED_SPECIES = ["dog", "cat", "other"];
  if (!ALLOWED_SPECIES.includes(input.unownedAnimal.species.trim())) {
    return { error: "Especie no válida. Las opciones son: perro, gato u otro." };
  }

  // W4: Server-side upper bound on approxAgeMonths.
  if (input.unownedAnimal.approxAgeMonths != null && input.unownedAnimal.approxAgeMonths > 360) {
    return { error: "La edad aproximada no puede superar los 360 meses (30 años)." };
  }

  // C1: Jurisdiction check for unowned path — mirror the registered_pet path.
  // govtOrg.jurisdictionProvince is guaranteed non-null here (checked above).
  if (session.profile.role === "govt") {
    const orgProvince = govtOrg.jurisdictionProvince;
    const inScope = session.jurisdictions.some((j) => j.province === orgProvince);
    if (!inScope) {
      return {
        error: "Tu organización sanitaria no está en tu jurisdicción asignada.",
      };
    }
  }

  return _runDecomisoTransaction({
    input,
    govtOrg,
    receiverOrg,
    user,
    existingPet: null,
    unownedData: input.unownedAnimal,
  });
}

// ---------------------------------------------------------------------------
// _runDecomisoTransaction — shared transaction body for both subject paths
// ---------------------------------------------------------------------------
//
// Separated so we can branch on subjectKind before entering the tx (to avoid
// any DB work when input validation fails) while keeping the transaction body
// DRY. The caller is responsible for all pre-tx validations.

async function _runDecomisoTransaction(args: {
  input: ExecuteDecomisoInput;
  govtOrg: Awaited<ReturnType<typeof resolveGovtOrgForUser>> & object;
  receiverOrg: { id: string; displayName: string };
  user: { id: string };
  /** Non-null for registered_pet path. */
  existingPet: { id: string; name: string; publicToken: string } | null;
  /** Non-null for unowned_animal path. */
  unownedData: UnownedAnimalInput | null;
}): Promise<ExecuteDecomisoResult> {
  const { input, govtOrg, receiverOrg, user } = args;

  // Upload ALL attachment files to Storage BEFORE opening the DB transaction.
  // If any upload fails, delete already-uploaded blobs (compensating cleanup)
  // and return the error — no DB mutation happens.
  // After the transaction commits, if the DB throws, best-effort clean up the
  // uploaded blobs so a failed decomiso doesn't leave orphans in Storage.
  const supabaseAdmin = createAdminClient();

  type UploadedAttachment = {
    filename: string;
    storagePath: string;
    mimeType: string;
    size: number;
  };

  const uploadedAttachments: UploadedAttachment[] = [];

  // Pre-generate a stable directory prefix (the real caseId is unknown until
  // openCase inside the tx returns, so we use a pre-generated UUID).
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

  let createdPublicCode = "";
  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      const now = new Date();

      // ---------- Unowned path: CREATE the pet record in-flight ----------
      // Mirrors createIntakeAction's pets insert. No ownership row is created
      // for a prior owner. Jurisdiction comes from the govt org (the stray
      // has no prior registered jurisdiction).
      // primarySubjectKind is 'registered_pet' on the case because the pet
      // IS registered at this point (we just created it). The cases CHECK
      // constraint requires (primarySubjectKind='registered_pet') =
      // (primaryPetId IS NOT NULL) — using 'unowned_animal' with a non-null
      // petId would violate it.
      let activePet: { id: string; name: string; publicToken: string };

      if (args.unownedData) {
        const { unownedData } = args;
        const publicToken = await generateUniqueToken(pets, pets.publicToken, generatePublicToken, {
          executor: tx,
        });

        // Compute approximate date of birth from approxAgeMonths (same
        // pattern as createIntakeAction's age-to-dob conversion).
        let dateOfBirth: string | null = null;
        let birthDateIsEstimated = false;
        if (unownedData.approxAgeMonths != null && unownedData.approxAgeMonths >= 0) {
          const dob = new Date();
          dob.setMonth(dob.getMonth() - unownedData.approxAgeMonths);
          dateOfBirth = dob.toISOString().slice(0, 10);
          birthDateIsEstimated = true;
        }

        // Descriptive name for the stray — used in notifications and audit.
        const straySyntheticName = [
          unownedData.species,
          unownedData.breed ?? null,
          unownedData.color ?? null,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();
        const petName = straySyntheticName || "Animal sin registrar";

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
              // Jurisdiction from the govt org — the stray has no prior jurisdiction.
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
        activePet = args.existingPet as { id: string; name: string; publicToken: string };
      }

      // ---------- openCase(custody_episode) — spec §13.3 ----------
      const caseRow = await openCase(
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
      createdPublicCode = caseRow.publicCode;

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
      // For registered_pet: capture prev owner userIds then close all active ownerships.
      // For unowned_animal: no prev ownership rows exist (pet was just created).
      const prevOwnerUserIds: string[] = [];

      if (!args.unownedData) {
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
      // ownership_role 'shelter_custody' is correct per DC7.
      await tx.insert(ownerships).values({
        petId: activePet.id,
        ownerOrganizationId: govtOrg.id,
        role: "shelter_custody",
        startedAt: now,
      });

      // ---------- INSERT custody_transfer_proposed ----------
      // Decomiso marker lives in `notes` (no dedicated schema field — adding
      // one would require a migration). S3 uses the parent case kind +
      // openedByOrganizationId.orgType as the canonical discriminator.
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
      // Files were already uploaded to Storage above. We only insert DB rows here.
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

      // ---------- Build notifications (inserted outside tx — best-effort) ----------

      // 14a. Previous owner(s) — urgent (spec §13.7: decomiso_owner_lost_custody).
      // Skipped for unowned_animal path (no prior owner).
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
          title: `Decomiso entrante — ${activePet.name}`,
          body: `La autoridad ${govtOrg.displayName} ejecutó un decomiso y propuso transferirte la custodia de ${activePet.name}. Tenés 7 días para aceptar o rechazar.`,
          ctaLabel: "Ver propuesta",
          ctaUrl: `/casos/${caseRow.publicCode}`,
          relatedCaseId: caseRow.id,
          relatedPetId: activePet.id,
        });
      }

      // 14c. Govt actor confirmation — info (spec §13.7: decomiso_confirmed_govt).
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

      // Fix 3: Admins also receive a decomiso_confirmed_admin notification
      // (spec §13.7: "govt actor (confirmation) + admin").
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

      // ---------- Audit log (spec §4.5 / §5.1 step 10) ----------
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
    });
  } catch (err) {
    // Post-tx compensating cleanup: if the DB transaction throws after uploads
    // succeeded, best-effort delete the uploaded blobs.
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
  // Resolve the receiver org by publicToken first so we can pin requireCapability
  // to that specific org. Without pinning, a multi-org user could get a confusing
  // error from the last-joined-membership fallback instead of a clean capability check.
  const [receiverOrgByToken] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.publicToken, input.receiverOrgToken))
    .limit(1);
  if (!receiverOrgByToken) {
    return { error: "Organización destinataria no encontrada." };
  }

  const auth = await requireCapability("org.transfer.accept", receiverOrgByToken.id);
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  // Defense-in-depth: verify the token we looked up matches the org the capability
  // check resolved (they should be the same row; this guard catches any mismatch).
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
//   5. Emit note_added(category='system') with the reason (spec says 'rejection'
//      but that value is not in the enum — 'system' is used; reason in `text`).
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
  // Resolve the receiver org by publicToken first so we can pin requireCapability
  // to that specific org. Without pinning, a multi-org user could get a confusing
  // error from the last-joined-membership fallback instead of a clean capability check.
  const [receiverOrgByToken] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.publicToken, input.receiverOrgToken))
    .limit(1);
  if (!receiverOrgByToken) {
    return { error: "Organización destinataria no encontrada." };
  }

  const auth = await requireCapability("org.transfer.accept", receiverOrgByToken.id);
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  // Defense-in-depth: verify the token we looked up matches the org the capability
  // check resolved (they should be the same row; this guard catches any mismatch).
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

      // 5. Emit note_added(category='system') — spec §5.3 asks for category='rejection'
      // but that value does not exist in the noteAdded Zod enum
      // (["comportamiento","dieta","grooming","estado_de_animo","otro","system"]).
      // 'system' is the correct runtime value; the rejection reason is preserved
      // in full in the `text` payload below. Adding 'rejection' to the enum is
      // deferred tech debt.
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
