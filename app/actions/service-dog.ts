"use server";

// Service-dog credential management — Ley 26.858. Owner-side actions for
// declaring a dog as guía or asistencia and submitting the credential for
// admin/govt verification (RUPGA — Res. ANDIS 2588/2022). Verification
// approves the row via the standard approval_request flow; the public
// access banner on /p/[publicToken] only renders for vigente+inService
// rows with public_visibility='full_banner' and a banner-eligible
// serviceType (ANDIS-recognized — 'otro' never banners).
//
// Privacy posture (Ley 25.326 Art. 7): marking a pet as service dog
// reveals the owner's disability. public_visibility defaults to
// 'private_only' on create; the owner must opt in to the public banner.

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  type ServiceDogStatus,
  type ServiceDogType,
  type ServiceDogVisibility,
  approvalRequests,
  auditLog,
  db,
  notifications,
  ownerships,
  petServiceDog,
  pets,
} from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { generatePrefixedToken } from "@/lib/publicToken";
import { canRevoke } from "@/lib/revocation-scope";

// Helper: only the active owner of a pet can manage the service-dog row.
// Returns the pet row + service_dog row (if any).
async function loadOwnedPetWithServiceDog(
  userId: string,
  publicToken: string,
): Promise<{
  pet: typeof pets.$inferSelect;
  serviceDog: typeof petServiceDog.$inferSelect | null;
} | null> {
  const [row] = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerUserId, userId),
        eq(ownerships.role, "owner"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const [sd] = await db
    .select()
    .from(petServiceDog)
    .where(eq(petServiceDog.petId, row.pet.id))
    .limit(1);
  return { pet: row.pet, serviceDog: sd ?? null };
}

// Inputs ------------------------------------------------------------------

export type UpsertServiceDogInput = {
  petPublicToken: string;
  serviceType: ServiceDogType;
  trainingCenter: string;
  trainingCertDate?: string | null;
  rupgaCredential?: string | null;
  credentialIssueDate?: string | null;
  credentialExpiryDate?: string | null;
  notes?: string | null;
  publicVisibility?: ServiceDogVisibility;
};

export type UpsertServiceDogResult = { ok: true } | { error: string };

export async function upsertServiceDogAction(
  input: UpsertServiceDogInput,
): Promise<UpsertServiceDogResult> {
  const { user } = await requireUserOrRedirect();

  if (!input.trainingCenter.trim()) {
    return { error: "Indicá el centro de entrenamiento." };
  }

  const target = await loadOwnedPetWithServiceDog(user.id, input.petPublicToken);
  if (!target) return { error: "Mascota no encontrada o no sos su dueño/a." };

  // Ley 26.858 is dog-specific. Guard at the action so the form can show a
  // clear message; the public banner would skip non-dogs anyway.
  if (target.pet.species !== "dog") {
    return {
      error: "El reconocimiento legal del Art. 1, Ley 26.858 aplica solo a perros.",
    };
  }

  const now = new Date();
  const status: ServiceDogStatus = "pendiente_verificacion";

  try {
    if (target.serviceDog) {
      // Updating an existing row never bumps to 'vigente'; that lives in
      // the approval flow. If the owner edits while vigente, we keep the
      // current status — admin/govt can re-verify if material data changed.
      await db
        .update(petServiceDog)
        .set({
          serviceType: input.serviceType,
          trainingCenter: input.trainingCenter.trim(),
          trainingCertDate: input.trainingCertDate || null,
          rupgaCredential: input.rupgaCredential?.trim() || null,
          credentialIssueDate: input.credentialIssueDate || null,
          credentialExpiryDate: input.credentialExpiryDate || null,
          notes: input.notes?.trim() || null,
          publicVisibility: input.publicVisibility ?? target.serviceDog.publicVisibility,
          updatedAt: now,
        })
        .where(eq(petServiceDog.id, target.serviceDog.id));
    } else {
      await db.insert(petServiceDog).values({
        petId: target.pet.id,
        serviceType: input.serviceType,
        credentialStatus: status,
        trainingCenter: input.trainingCenter.trim(),
        trainingCertDate: input.trainingCertDate || null,
        rupgaCredential: input.rupgaCredential?.trim() || null,
        credentialIssueDate: input.credentialIssueDate || null,
        credentialExpiryDate: input.credentialExpiryDate || null,
        notes: input.notes?.trim() || null,
        publicVisibility: input.publicVisibility ?? "private_only",
      });
    }
  } catch (err) {
    return {
      error: `No se pudo guardar la credencial: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  revalidatePath(`/mis-mascotas/${input.petPublicToken}/asistencia`);
  return { ok: true };
}

// submitServiceDogVerificationRequestAction -------------------------------

// Creates the approval_request that admin/govt reviews. The applicant
// jurisdictionProvince/Locality drive scope-matching (govt sees their
// jurisdiction); admin always sees all. The pet's jurisdiction is preferred,
// falling back to the owner's profile when not set on the pet.
export type SubmitVerificationInput = {
  petPublicToken: string;
};

export type SubmitVerificationResult = { approvalRequestPublicToken: string } | { error: string };

export async function submitServiceDogVerificationRequestAction(
  input: SubmitVerificationInput,
): Promise<SubmitVerificationResult> {
  const { user } = await requireUserOrRedirect();

  const target = await loadOwnedPetWithServiceDog(user.id, input.petPublicToken);
  if (!target) return { error: "Mascota no encontrada o no sos su dueño/a." };
  if (!target.serviceDog) {
    return { error: "Primero completá la información del perro de asistencia." };
  }
  if (target.serviceDog.credentialStatus === "vigente") {
    return { error: "Esta credencial ya está verificada." };
  }

  // Resolve scope. Pet jurisdiction is the canonical source when the owner
  // filled it; otherwise we anchor on the most recent profile jurisdiction
  // — admin will catch the rest.
  const province = target.pet.jurisdictionProvince ?? "Buenos Aires";
  const locality = target.pet.jurisdictionLocality ?? "Sin especificar";

  // Defense in depth: don't allow two pending requests for the same pet.
  const [duplicate] = await db
    .select({ id: approvalRequests.id, publicToken: approvalRequests.publicToken })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.type, "service_dog_credential_verification"),
        eq(approvalRequests.status, "pending"),
        eq(approvalRequests.applicantUserId, user.id),
      ),
    );
  if (duplicate) {
    // Re-check the payload pet_id matches.
    const [dup] = await db
      .select({ payload: approvalRequests.payload, publicToken: approvalRequests.publicToken })
      .from(approvalRequests)
      .where(eq(approvalRequests.id, duplicate.id))
      .limit(1);
    const payload = (dup?.payload ?? {}) as { pet_id?: string };
    if (payload.pet_id === target.pet.id) {
      return { error: "Ya tenés una solicitud pendiente para esta mascota." };
    }
  }

  const publicToken = generatePrefixedToken("APR");
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(approvalRequests).values({
        publicToken,
        type: "service_dog_credential_verification",
        status: "pending",
        applicantUserId: user.id,
        initiatedBy: "self",
        initiatedByUserId: user.id,
        targetUserId: user.id,
        jurisdictionProvince: province,
        jurisdictionLocality: locality,
        payload: {
          pet_id: target.pet.id,
          pet_public_token: target.pet.publicToken,
          service_type: target.serviceDog?.serviceType ?? null,
          training_center: target.serviceDog?.trainingCenter ?? null,
          rupga_credential: target.serviceDog?.rupgaCredential ?? null,
        },
        createdAt: now,
        updatedAt: now,
      });

      // Flip the service-dog row from 'en_entrenamiento' (if applicable) to
      // 'pendiente_verificacion' so the UI shows the right state.
      if (target.serviceDog && target.serviceDog.credentialStatus !== "vigente") {
        await tx
          .update(petServiceDog)
          .set({
            credentialStatus: "pendiente_verificacion",
            updatedAt: now,
          })
          .where(eq(petServiceDog.id, target.serviceDog.id));
      }
    });
  } catch (err) {
    return {
      error: `No se pudo enviar la solicitud: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  revalidatePath(`/mis-mascotas/${input.petPublicToken}/asistencia`);
  return { approvalRequestPublicToken: publicToken };
}

// setServiceDogVisibilityAction -------------------------------------------

export async function setServiceDogVisibilityAction(input: {
  petPublicToken: string;
  publicVisibility: ServiceDogVisibility;
}): Promise<{ ok: true } | { error: string }> {
  const { user } = await requireUserOrRedirect();
  const target = await loadOwnedPetWithServiceDog(user.id, input.petPublicToken);
  if (!target || !target.serviceDog) {
    return { error: "Credencial no encontrada." };
  }

  await db
    .update(petServiceDog)
    .set({ publicVisibility: input.publicVisibility, updatedAt: new Date() })
    .where(eq(petServiceDog.id, target.serviceDog.id));

  revalidatePath(`/mis-mascotas/${input.petPublicToken}/asistencia`);
  revalidatePath(`/p/${input.petPublicToken}`);
  return { ok: true };
}

// retireServiceDogAction --------------------------------------------------

// Owner-side: marks in_service=false. Retired service dogs lose access
// rights legally (Art. 8 implicit — retirement = no longer "perro de
// asistencia en servicio"). The row stays for historical reference; the
// banner hides automatically.
export async function retireServiceDogAction(input: {
  petPublicToken: string;
}): Promise<{ ok: true } | { error: string }> {
  const { user } = await requireUserOrRedirect();
  const target = await loadOwnedPetWithServiceDog(user.id, input.petPublicToken);
  if (!target || !target.serviceDog) {
    return { error: "Credencial no encontrada." };
  }
  if (!target.serviceDog.inService) {
    return { error: "El perro ya está retirado del servicio." };
  }

  await db
    .update(petServiceDog)
    .set({ inService: false, updatedAt: new Date() })
    .where(eq(petServiceDog.id, target.serviceDog.id));

  revalidatePath(`/mis-mascotas/${input.petPublicToken}/asistencia`);
  revalidatePath(`/p/${input.petPublicToken}`);
  return { ok: true };
}

// revokeServiceDogCredentialAction ---------------------------------------

// Admin/govt revocation. Mirrors the vet/org revocation pattern: motivo
// >=30 chars, requires the actor be admin or govt-in-scope of the pet's
// jurisdiction. Audit trail + notification to the owner.
export type RevokeServiceDogInput = {
  petPublicToken: string;
  motivo: string;
};

export async function revokeServiceDogCredentialAction(
  input: RevokeServiceDogInput,
): Promise<{ ok: true } | { error: string }> {
  const { user } = await requireUserOrRedirect();
  const motivo = input.motivo.trim();
  if (motivo.length < 30) {
    return { error: "El motivo de la revocación debe tener al menos 30 caracteres." };
  }

  const { profiles } = await import("@/db");
  const [actorProfile] = await db
    .select({
      id: profiles.id,
      role: profiles.role,
      accountType: profiles.accountType,
      deactivatedAt: profiles.deactivatedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  if (
    !actorProfile ||
    actorProfile.accountType !== "institutional" ||
    (actorProfile.role !== "admin" && actorProfile.role !== "govt") ||
    actorProfile.deactivatedAt !== null
  ) {
    return { error: "Solo admin/govt pueden revocar credenciales de asistencia." };
  }

  const [petRow] = await db
    .select({
      pet: pets,
      sd: petServiceDog,
    })
    .from(pets)
    .innerJoin(petServiceDog, eq(petServiceDog.petId, pets.id))
    .where(eq(pets.publicToken, input.petPublicToken))
    .limit(1);
  if (!petRow) return { error: "Credencial no encontrada para esa mascota." };

  // Govt scope check: must hold an assignment for the pet's jurisdiction.
  // We reuse canRevoke from lib/revocation-scope which already understands
  // the (province, locality) tuple model.
  if (actorProfile.role === "govt") {
    const { govtAssignments } = await import("@/db");
    const assignments = await db
      .select({
        province: govtAssignments.jurisdictionProvince,
        locality: govtAssignments.jurisdictionLocality,
      })
      .from(govtAssignments)
      .where(and(eq(govtAssignments.userId, user.id), isNull(govtAssignments.revokedAt)));
    const inScope = canRevoke(
      { id: user.id, role: "govt" },
      {
        type: "org_verification",
        province: petRow.pet.jurisdictionProvince ?? "",
        locality: petRow.pet.jurisdictionLocality ?? "",
      },
      assignments,
    );
    if (!inScope) {
      return { error: "La mascota está fuera de tu jurisdicción." };
    }
  }

  if (petRow.sd.credentialStatus === "revocada") {
    return { error: "La credencial ya está revocada." };
  }

  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(petServiceDog)
        .set({
          credentialStatus: "revocada",
          revokedAt: now,
          revokedByUserId: user.id,
          revocationReason: motivo,
          updatedAt: now,
        })
        .where(eq(petServiceDog.id, petRow.sd.id));

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "service_dog_credential_revoked",
        targetUserId: null,
        payload: {
          pet_id: petRow.pet.id,
          pet_public_token: petRow.pet.publicToken,
          reason: motivo,
        },
      });

      // Notify the owner — fetch the current owner_user_id.
      const [owner] = await tx
        .select({ id: ownerships.ownerUserId })
        .from(ownerships)
        .where(
          and(
            eq(ownerships.petId, petRow.pet.id),
            eq(ownerships.role, "owner"),
            isNull(ownerships.endedAt),
          ),
        )
        .limit(1);
      if (owner?.id) {
        await tx.insert(notifications).values({
          userId: owner.id,
          notificationType: "service_dog_credential_revoked",
          title: "Tu credencial RUPGA fue revocada",
          body: `Motivo: ${motivo}. El banner público de acceso ya no se muestra. Comunicate con ANDIS si querés apelar.`,
          severity: "warning",
          relatedPetId: petRow.pet.id,
          ctaLabel: "Ver mascota",
          ctaUrl: `/mis-mascotas/${input.petPublicToken}/asistencia`,
        });
      }
    });
  } catch (err) {
    return {
      error: `No se pudo revocar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  revalidatePath(`/mis-mascotas/${input.petPublicToken}/asistencia`);
  revalidatePath(`/p/${input.petPublicToken}`);
  return { ok: true };
}
