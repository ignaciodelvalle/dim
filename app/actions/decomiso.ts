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

import { db, notifications, organizations } from "@/db";
import { requireDecomisoPrincipal } from "@/lib/infra/auth-guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCapability } from "@/src/modules/organizations/infrastructure/authz-resolver";

import { resolveGovtOrgForUser } from "@/src/modules/decomiso/application/resolve-govt-org";

import {
  acceptDecomisoHandoffInTx,
  validateAcceptDecomisoHandoff,
} from "@/src/modules/decomiso/application/accept-decomiso-handoff";
import {
  executeDecomiso,
  validateExecuteDecomiso,
} from "@/src/modules/decomiso/application/execute-decomiso";
import {
  reassignDecomisoInTx,
  validateReassignDecomiso,
} from "@/src/modules/decomiso/application/reassign-decomiso";
import {
  rejectDecomisoHandoffInTx,
  validateRejectDecomisoHandoff,
} from "@/src/modules/decomiso/application/reject-decomiso-handoff";
import { ATTACHMENT_BUCKET } from "@/src/modules/decomiso/domain/types";

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

  // ---- 3. Pre-tx validation (module use-case) ----------------------------
  // Seizure motive, receiver org, attachments, subject-kind branch
  // (jurisdiction scope + double-seizure guard) live in the decomiso module.
  const validated = await validateExecuteDecomiso(input, { session, govtOrg }, db);
  if (!validated.ok) return { error: validated.error };
  const { receiverOrg: validatedReceiverOrg, existingPet } = validated;

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
      // Web Push leg — urgent-only filtering happens inside the seam;
      // best-effort, never throws into the action path.
      const { sendPushForNotifications } = await import("@/lib/infra/web-push");
      await sendPushForNotifications(pendingNotifications);
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
      // Web Push leg — urgent-only inside the seam; best-effort, never throws.
      const { sendPushForNotifications } = await import("@/lib/infra/web-push");
      await sendPushForNotifications(pendingNotifications);
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
      // Web Push leg — urgent-only inside the seam; best-effort, never throws.
      const { sendPushForNotifications } = await import("@/lib/infra/web-push");
      await sendPushForNotifications(pendingNotifications);
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

  // 3+4. Pre-tx validation (module use-case): case load + open-episode
  // checks, opener authorization, new-receiver rules, pet-name resolution.
  const validated = await validateReassignDecomiso(input, { govtOrg }, db);
  if (!validated.ok) return { error: validated.error };
  const { caseRow, newReceiverOrg: validatedNewReceiverOrg, petName, reassignReason } = validated;

  let pendingNotifications: (typeof notifications.$inferInsert)[] = [];

  try {
    await db.transaction(async (tx) => {
      const result = await reassignDecomisoInTx(
        caseRow,
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
      // Web Push leg — urgent-only inside the seam; best-effort, never throws.
      const { sendPushForNotifications } = await import("@/lib/infra/web-push");
      await sendPushForNotifications(pendingNotifications);
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
