"use server";

// Decomiso (Ley 14.346) — thin server action controllers.
//
// Business logic lives in src/modules/decomiso/application/.
// This file: auth guard → delegate to use-case → flush notifications → return.
//
// Spec: docs/superpowers/specs/2026-05-19-decomiso-welfare-authority-design.md §5.1–5.3.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, notifications, organizations, pets } from "@/db";
import { requireDecomisoPrincipal } from "@/lib/infra/auth-guards";
import { findOpenCaseForPetAndKind } from "@/lib/infra/case-helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCapability } from "@/src/modules/organizations/infrastructure/authz-resolver";

import { resolveGovtOrgForUser } from "@/src/modules/decomiso/application/resolve-govt-org";

import {
  acceptDecomisoHandoffInTx,
  validateAcceptDecomisoHandoff,
} from "@/src/modules/decomiso/application/accept-decomiso-handoff";
import { executeDecomiso } from "@/src/modules/decomiso/application/execute-decomiso";
import { reassignDecomisoInTx } from "@/src/modules/decomiso/application/reassign-decomiso";
import {
  rejectDecomisoHandoffInTx,
  validateRejectDecomisoHandoff,
} from "@/src/modules/decomiso/application/reject-decomiso-handoff";
import {
  validateAttachments,
  validateReceiverOrg,
  validateSeizureMotive,
} from "@/src/modules/decomiso/domain/seizure-rules";
import { ATTACHMENT_BUCKET, MAX_ATTACHMENT_BYTES } from "@/src/modules/decomiso/domain/types";

// ---------------------------------------------------------------------------
// Re-export public types (callers must not change)
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

export interface UnownedAnimalInput {
  species: string;
  sex: "male" | "female" | "unknown";
  breed?: string | null;
  color?: string | null;
  distinguishingFeatures?: string | null;
  approxAgeMonths?: number | null;
}

export interface ExecuteDecomisoInput {
  subjectKind: "registered_pet" | "unowned_animal";
  petPublicToken?: string | null;
  unownedAnimal?: UnownedAnimalInput | null;
  seizureMotive: SeizureMotive;
  seizureMotiveOtherDetail?: string | null;
  judicialProceedingReference?: string | null;
  originatingWelfareReportId?: string | null;
  intendedReceiverOrganizationId: string;
  intakeCondition?: string | null;
  attachmentFiles: File[];
}

// ---------------------------------------------------------------------------
// executeDecomisoAction
// ---------------------------------------------------------------------------

export async function executeDecomisoAction(
  input: ExecuteDecomisoInput,
): Promise<ExecuteDecomisoResult> {
  // ---- 1. Auth -----------------------------------------------------------
  const session = await requireDecomisoPrincipal();
  const { user } = session;

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

  if (!govtOrg.jurisdictionProvince) {
    return {
      error: "La organización sanitaria no tiene provincia asignada. Contactá al administrador.",
    };
  }

  // ---- 3. Validate seizure motive ----------------------------------------
  const motiveErr = validateSeizureMotive(input.seizureMotive, input.seizureMotiveOtherDetail);
  if (motiveErr) return { error: motiveErr };

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

  const receiverErr = validateReceiverOrg(receiverOrg, govtOrg.id);
  if (receiverErr) return { error: receiverErr };
  // receiverOrg is guaranteed non-null here (validateReceiverOrg returns an error if null).
  const validatedReceiverOrg = receiverOrg as NonNullable<typeof receiverOrg>;

  // ---- 5. Validate attachments (DC5) -------------------------------------
  const attachErr = validateAttachments(input.attachmentFiles);
  if (attachErr) return { error: attachErr };

  // ---- 6. Subject-kind branch --------------------------------------------
  let existingPet: { id: string; name: string; publicToken: string } | null = null;

  if (input.subjectKind === "registered_pet") {
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

    // Jurisdiction scope check (spec §9; review 24 HIGH #4). Require the pet's
    // FULL (province, locality) pair to match an assignment before seizing —
    // province-only / null-province let a govt seize an animal (and revoke its
    // owner's custody) outside their jurisdiction. Fail-closed on any mismatch.
    if (session.profile.role === "govt") {
      const inScope = session.jurisdictions.some(
        (j) => j.province === pet.jurisdictionProvince && j.locality === pet.jurisdictionLocality,
      );
      if (!inScope) {
        return { error: "Esta mascota no está en tu jurisdicción asignada." };
      }
    }

    // Double-seizure guard (Fix 5).
    const existingEpisode = await findOpenCaseForPetAndKind(pet.id, "custody_episode");
    if (existingEpisode) {
      return { error: "Esta mascota ya tiene un decomiso/custodia activa en curso." };
    }

    existingPet = pet;
  } else {
    // Unowned path jurisdiction check (C1; review 24 HIGH #5). Require the govt
    // org's FULL (province, locality) pair to match an assignment — a
    // province-only check let a govt seize an unowned animal outside their
    // assigned locality. Fail-closed on any mismatch (incl. null org locality).
    if (session.profile.role === "govt") {
      const inScope = session.jurisdictions.some(
        (j) =>
          j.province === govtOrg.jurisdictionProvince &&
          j.locality === govtOrg.jurisdictionLocality,
      );
      if (!inScope) {
        return {
          error: "Tu organización sanitaria no está en tu jurisdicción asignada.",
        };
      }
    }
  }

  // ---- 7. Upload attachments to Storage (before the DB transaction) ------
  const supabaseAdmin = createAdminClient();
  const attachmentDir = randomUUID();

  type UploadedAttachment = {
    filename: string;
    storagePath: string;
    mimeType: string;
    size: number;
  };
  const uploadedAttachments: UploadedAttachment[] = [];

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

  // ---- 8. Run the transaction via use-case -------------------------------
  let createdPublicCode = "";
  let pendingNotifications: (typeof notifications.$inferInsert)[] = [];

  try {
    await db.transaction(async (tx) => {
      const result = await executeDecomiso(
        input,
        {
          user,
          govtOrg: govtOrg as typeof govtOrg & { jurisdictionProvince: string },
          receiverOrg: validatedReceiverOrg,
          existingPet,
          unownedData:
            input.subjectKind === "unowned_animal" ? (input.unownedAnimal ?? null) : null,
          uploadedAttachments,
        },
        tx,
      );

      if (!result.ok) throw new Error(result.error);
      createdPublicCode = result.publicCode;
      pendingNotifications = result.pendingNotifications as (typeof notifications.$inferInsert)[];
    });
  } catch (err) {
    // Compensating cleanup: best-effort delete uploaded blobs on tx failure.
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

  // Insert notifications outside the main tx — best-effort.
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
// acceptDecomisoHandoffAction
// ---------------------------------------------------------------------------

export async function acceptDecomisoHandoffAction(input: {
  receiverOrgToken: string;
  casePublicCode: string;
}): Promise<DecomisoHandshakeResult> {
  // Resolve the receiver org by publicToken first to pin requireCapability.
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

  // Defense-in-depth: verify token matches the capability-resolved org.
  if (organization.publicToken !== input.receiverOrgToken) {
    return { error: "Estás operando desde una organización distinta a la destinataria." };
  }

  // Pre-tx validation.
  const validated = await validateAcceptDecomisoHandoff(
    { casePublicCode: input.casePublicCode },
    { user, organization },
    db,
  );
  if (!validated.ok) return { error: validated.error };
  const { caseRow, govtOrgId, govtOrgName } = validated;

  let pendingNotifications: (typeof notifications.$inferInsert)[] = [];

  try {
    await db.transaction(async (tx) => {
      const result = await acceptDecomisoHandoffInTx(
        caseRow,
        govtOrgId,
        govtOrgName,
        { user, organization },
        tx,
      );
      pendingNotifications = result.pendingNotifications as (typeof notifications.$inferInsert)[];
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
// rejectDecomisoHandoffAction
// ---------------------------------------------------------------------------

export async function rejectDecomisoHandoffAction(input: {
  receiverOrgToken: string;
  casePublicCode: string;
  reason?: string | null;
  message?: string | null;
}): Promise<DecomisoHandshakeResult> {
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

  if (organization.publicToken !== input.receiverOrgToken) {
    return { error: "Estás operando desde una organización distinta a la destinataria." };
  }

  // Pre-tx validation.
  const validated = await validateRejectDecomisoHandoff(
    { casePublicCode: input.casePublicCode, reason: input.reason, message: input.message },
    { user, organization },
    db,
  );
  if (!validated.ok) return { error: validated.error };
  const { caseRow, govtOrgId, reasonNote } = validated;

  let pendingNotifications: (typeof notifications.$inferInsert)[] = [];

  try {
    await db.transaction(async (tx) => {
      const result = await rejectDecomisoHandoffInTx(
        caseRow,
        govtOrgId,
        reasonNote,
        { user, organization },
        tx,
      );
      pendingNotifications = result.pendingNotifications as (typeof notifications.$inferInsert)[];
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
// reassignDecomisoToAnotherReceiverAction
// ---------------------------------------------------------------------------

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
  const { cases } = await import("@/db");
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

  // 4. Validate new receiver org.
  if (!input.newReceiverOrgId?.trim()) {
    return { error: "Debe seleccionar un nuevo refugio destinatario." };
  }
  if (input.newReceiverOrgId === govtOrg.id) {
    return { error: "El nuevo destinatario no puede ser la propia autoridad sanitaria." };
  }
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

  const receiverErr = validateReceiverOrg(newReceiverOrg, govtOrg.id);
  if (receiverErr) {
    // Adjust error message for reassign context.
    return {
      error: receiverErr.replace(
        "La organización destinataria debe ser un refugio",
        "El nuevo destinatario debe ser un refugio",
      ),
    };
  }
  // newReceiverOrg is guaranteed non-null here (validateReceiverOrg returns error if null).
  const validatedNewReceiverOrg = newReceiverOrg as NonNullable<typeof newReceiverOrg>;

  // Load pet name for notification copy.
  const [pet] = await db
    .select({ id: pets.id, name: pets.name })
    .from(pets)
    .where(eq(pets.id, caseRow.primaryPetId as string))
    .limit(1);

  const petName = pet?.name ?? "el animal";
  const reassignReason = input.reason?.trim() || "Reasignado por la autoridad sanitaria";

  let pendingNotifications: (typeof notifications.$inferInsert)[] = [];

  try {
    await db.transaction(async (tx) => {
      const result = await reassignDecomisoInTx(
        caseRow as {
          id: string;
          primaryPetId: string | null;
          publicCode: string;
          receiverOrganizationId: string | null;
        },
        validatedNewReceiverOrg,
        petName,
        reassignReason,
        { user, govtOrg },
        tx,
      );
      pendingNotifications = result.pendingNotifications as (typeof notifications.$inferInsert)[];
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
