"use server";

// Pet claim flow (handoff P3-1).
//
// Reemplaza la semántica DNI-stub de /mis-mascotas/reclamar (que ahora
// vive en /reclamar-dni) por un wizard de chip/tatuaje con 4 variantes:
//
//   A) chip/tatuaje no existe        → redirect a /mis-mascotas/nueva
//   B) chip/tatuaje matchea con dueño activo → disputa de propiedad
//   C) chip/tatuaje matchea con mascota perdida → redirect a /p/[token]/sighting
//   D) chip/tatuaje matchea SIN custodia activa de ningún rol (libre) →
//      reclamo directo: alta de ownership + evento ownership_claimed
//
// Variante B abre un caso `custody_dispute` con el lifecycle existente.
// El schema de `custody_dispute_raised` se relajó para aceptar
// `raised_by_role: 'owner'` (event-schemas.ts) y el lifecycle pasa a
// `manualOpenAllowed: true` para esta vía.

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  attachments,
  auditLog,
  db,
  notifications,
  ownerships,
  petEvents,
  petIdentifications,
  pets,
  profiles,
} from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { openCase } from "@/lib/case-helpers";
import { lookupByChip } from "@/lib/chip-lookup";
import { validateEventPayload } from "@/lib/event-schemas";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { uploadWelfareEvidence } from "@/lib/welfare-uploads";
import { openDisputeFromEvent } from "./custody-disputes";

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export type ClaimLookupVariant =
  | { variant: "not_found" }
  | { variant: "active_owner"; petToken: string; petName: string; ownerInitials: string | null }
  | { variant: "lost"; petToken: string; petName: string }
  | { variant: "deceased"; petName: string }
  | { variant: "free"; petToken: string; petName: string };

export type ClaimLookupResult = ClaimLookupVariant | { error: string };

const MICROCHIP_PATTERN = /^\d{15}$/;

// A pet is "free" (directly claimable) only when it has NO active custody of
// ANY role — owner, shelter_custody, foster, etc. A refugio's pet without an
// owner-role row must NOT be direct-claimable (adoption/dispute is the path).
async function hasAnyActiveCustody(petId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: ownerships.id })
    .from(ownerships)
    .where(and(eq(ownerships.petId, petId), isNull(ownerships.endedAt)))
    .limit(1);
  return !!row;
}

function deriveInitials(displayName: string | null): string | null {
  if (!displayName) return null;
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts
    .slice(0, 2)
    .map((p) => `${p[0]?.toUpperCase() ?? ""}.`)
    .join("");
}

// Distinct from lookupPetForDenunciaAction — claim needs to distinguish
// "free / active / lost / deceased" so the wizard can route to the right
// step. Returns ONLY a minimal projection; never the full pet record.
export async function lookupForClaimAction(input: {
  kind: "microchip" | "tattoo";
  value: string;
}): Promise<ClaimLookupResult> {
  const { user } = await requireUserOrRedirect();
  const value = input.value.trim();
  if (!value) return { variant: "not_found" };

  try {
    await enforceRateLimit("claim_lookup", user.id, { maxPerMinute: 30, maxPerHour: 200 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { error: "Demasiados intentos. Probá en unos minutos." };
    }
    throw err;
  }

  if (input.kind === "microchip") {
    if (!MICROCHIP_PATTERN.test(value)) {
      return { error: "El microchip debe tener exactamente 15 dígitos." };
    }
    const result = await lookupByChip(value);
    if (!result) return { variant: "not_found" };

    if (result.pet.status === "deceased") {
      return { variant: "deceased", petName: result.pet.name };
    }
    if (result.pet.status === "lost") {
      return { variant: "lost", petToken: result.pet.publicToken, petName: result.pet.name };
    }
    if (result.pet.ownerUserId === null && !(await hasAnyActiveCustody(result.pet.id))) {
      return { variant: "free", petToken: result.pet.publicToken, petName: result.pet.name };
    }
    return {
      variant: "active_owner",
      petToken: result.pet.publicToken,
      petName: result.pet.name,
      ownerInitials: deriveInitials(result.ownerFirstName),
    };
  }

  // Tattoo path — look up via the canonical pet_identifications table
  // (kind='tattoo', status='active'). Migration 0082 ensures completeness.
  const [row] = await db
    .select({
      petId: pets.id,
      petToken: pets.publicToken,
      petName: pets.name,
      petStatus: pets.status,
      ownerUserId: ownerships.ownerUserId,
      ownerDisplayName: profiles.displayName,
    })
    .from(petIdentifications)
    .innerJoin(pets, eq(pets.id, petIdentifications.petId))
    .leftJoin(
      ownerships,
      and(eq(ownerships.petId, pets.id), isNull(ownerships.endedAt), eq(ownerships.role, "owner")),
    )
    .leftJoin(profiles, eq(profiles.id, ownerships.ownerUserId))
    .where(
      and(
        eq(petIdentifications.kind, "tattoo"),
        eq(petIdentifications.code, value),
        eq(petIdentifications.status, "active"),
      ),
    )
    .limit(1);

  if (!row) return { variant: "not_found" };
  if (row.petStatus === "deceased") {
    return { variant: "deceased", petName: row.petName };
  }
  if (row.petStatus === "lost") {
    return { variant: "lost", petToken: row.petToken, petName: row.petName };
  }
  if (row.ownerUserId === null && !(await hasAnyActiveCustody(row.petId))) {
    return { variant: "free", petToken: row.petToken, petName: row.petName };
  }
  return {
    variant: "active_owner",
    petToken: row.petToken,
    petName: row.petName,
    ownerInitials: deriveInitials(row.ownerDisplayName),
  };
}

// ---------------------------------------------------------------------------
// Submit dispute (variant B)
// ---------------------------------------------------------------------------

export type ClaimDisputeInput = {
  petToken: string;
  reason: string;
};

export type ClaimDisputeResult = { disputeToken: string } | { error: string };

export async function submitClaimDisputeAction(
  input: ClaimDisputeInput,
  files: File[],
): Promise<ClaimDisputeResult> {
  const { user } = await requireUserOrRedirect();

  if (input.reason.trim().length < 20) {
    return { error: "Contanos por qué creés que es tuya (al menos 20 caracteres)." };
  }
  if (input.reason.length > 2000) {
    return { error: "La explicación no puede superar los 2000 caracteres." };
  }

  // Rate limit — same key as lookup so a burst of probes counts together.
  try {
    await enforceRateLimit("claim_lookup", user.id, { maxPerMinute: 30, maxPerHour: 200 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { error: "Demasiados intentos. Probá en unos minutos." };
    }
    throw err;
  }

  // Load pet + current owner.
  const [pet] = await db
    .select({
      id: pets.id,
      name: pets.name,
      status: pets.status,
      inCustodyDispute: pets.inCustodyDispute,
      jurisdictionProvince: pets.jurisdictionProvince,
      jurisdictionLocality: pets.jurisdictionLocality,
    })
    .from(pets)
    .where(eq(pets.publicToken, input.petToken))
    .limit(1);
  if (!pet) return { error: "No encontramos la mascota." };
  if (pet.status === "deceased") {
    return { error: "Esta mascota figura como fallecida en MiMAR." };
  }
  if (pet.inCustodyDispute) {
    return { error: "Ya hay una disputa abierta para esta mascota." };
  }

  const [ownership] = await db
    .select({ ownerUserId: ownerships.ownerUserId })
    .from(ownerships)
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "owner"), isNull(ownerships.endedAt)),
    )
    .limit(1);
  if (!ownership) return { error: "Esta mascota no tiene dueño activo registrado." };
  if (ownership.ownerUserId === user.id) {
    return { error: "Esta mascota ya está registrada a tu nombre." };
  }

  // Evidence upload — happens BEFORE the tx so failures don't dangle.
  const supabase = await createClient();
  const reportId = crypto.randomUUID();
  const upload = await uploadWelfareEvidence(supabase, `claims/${reportId}`, files);
  if (upload.error) return { error: upload.error };

  let disputeToken = "";
  try {
    await db.transaction(async (tx) => {
      const payload = validateEventPayload("custody_dispute_raised", {
        raised_by_role: "owner",
        raised_by_user_id: user.id,
        external_proceeding_reference: null,
        reason: input.reason.trim(),
      });

      // ARCH-E sequencing fix: create the case BEFORE inserting the raising
      // event so the event row can carry case_id in the same transaction.
      // pet_events.case_id is append-only (trigger-enforced) — a post-insert
      // UPDATE is blocked without the GUC escape hatch.
      // custodyDisputeId is backfilled by openDisputeFromEvent once the
      // dispute row exists (passed via preCreatedCaseId).
      const disputeCase = await openCase(
        {
          kind: "custody_dispute",
          primarySubjectKind: "registered_pet",
          primaryPetId: pet.id,
          jurisdictionProvince: pet.jurisdictionProvince ?? "",
          jurisdictionLocality: pet.jurisdictionLocality ?? "",
          openedByUserId: user.id,
          openedByOrganizationId: null,
          openedReason: "Custody dispute raised on pet — raised_by_role=owner",
        },
        tx,
      );

      const [raisingEvent] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "custody_dispute_raised",
          occurredAt: new Date(),
          recordedAt: new Date(),
          recordedByUserId: user.id,
          authorRole: "owner",
          payload,
          caseId: disputeCase.id,
        })
        .returning({ id: petEvents.id });

      const { publicToken } = await openDisputeFromEvent(tx, {
        petId: pet.id,
        raisingEventId: raisingEvent.id,
        raisedByUserId: user.id,
        raisedByOrgId: null,
        raisedByRole: "owner",
        jurisdictionProvince: pet.jurisdictionProvince ?? "",
        jurisdictionLocality: pet.jurisdictionLocality ?? "",
        initialParties: [
          { userId: ownership.ownerUserId, role: "current_owner" },
          { userId: user.id, role: "claimant_owner", positionSummary: input.reason.trim() },
        ],
        preCreatedCaseId: disputeCase.id,
      });
      disputeToken = publicToken;

      if (upload.uploaded.length > 0) {
        await tx.insert(attachments).values(
          upload.uploaded.map((u) => ({
            petId: pet.id,
            eventId: raisingEvent.id,
            uploadedByUserId: user.id,
            storagePath: u.storagePath,
            mimeType: u.mimeType,
            fileSize: u.fileSize,
            caption: "Evidencia del reclamo",
          })),
        );
      }

      // Notify current owner.
      if (ownership.ownerUserId) {
        await tx.insert(notifications).values({
          userId: ownership.ownerUserId,
          notificationType: "custody_dispute_raised_against_you",
          title: `Reclamo de propiedad sobre ${pet.name}`,
          body: "Otro usuario reclamó ser dueño/a de tu mascota. El gobierno local va a revisar la disputa. Te avisaremos cuando se resuelva.",
          severity: "warning",
          relatedPetId: pet.id,
          ctaLabel: "Ver mi mascota",
          ctaUrl: `/mis-mascotas/${input.petToken}`,
          category: "custody",
        });
      }

      // Confirmation to claimant.
      await tx.insert(notifications).values({
        userId: user.id,
        notificationType: "custody_dispute_raised_by_you",
        title: "Reclamo enviado",
        body: `Iniciamos el reclamo por ${pet.name}. Una autoridad local va a revisar la evidencia y decidir.`,
        severity: "info",
        relatedPetId: pet.id,
        ctaLabel: "Volver a mis mascotas",
        ctaUrl: "/mis-mascotas",
        category: "custody",
      });

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "claim_dispute_submitted",
        payload: {
          dispute_public_token: publicToken,
          pet_id: pet.id,
          attachments_count: upload.uploaded.length,
        },
      });
    });
  } catch (err) {
    // Roll back uploaded files if the tx failed.
    if (upload.uploadedPaths.length > 0) {
      await supabase.storage
        .from("welfare-evidence")
        .remove(upload.uploadedPaths)
        .catch(() => {});
    }
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return { error: `No se pudo enviar el reclamo: ${message}` };
  }

  revalidatePath(`/mis-mascotas/${input.petToken}`);
  return { disputeToken };
}

// ---------------------------------------------------------------------------
// Submit free claim (variant D)
// ---------------------------------------------------------------------------
//
// Direct claim of a pet with NO active custody of any role. Opens a fresh
// owner ownership + ownership_claimed event in one tx. The pet row is locked
// (SELECT ... FOR UPDATE) so two concurrent claims on the same pet serialize
// and the second one fails the re-check.

export type FreeClaimResult = { petToken: string; petName: string } | { error: string };

// Distinguishes intentional user-facing guard failures from unexpected DB
// errors so the latter are never surfaced verbatim to the client.
class FreeClaimGuardError extends Error {}

export async function submitFreeClaimAction(input: {
  petToken: string;
  identifierKind: "microchip" | "tattoo";
}): Promise<FreeClaimResult> {
  const { user } = await requireUserOrRedirect();

  // Rate limit — same key as lookup so a burst of probes counts together.
  try {
    await enforceRateLimit("claim_lookup", user.id, { maxPerMinute: 30, maxPerHour: 200 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { error: "Demasiados intentos. Probá en unos minutos." };
    }
    throw err;
  }

  try {
    const claimed = await db.transaction(async (tx) => {
      const [pet] = await tx
        .select({
          id: pets.id,
          name: pets.name,
          status: pets.status,
          inCustodyDispute: pets.inCustodyDispute,
        })
        .from(pets)
        .where(eq(pets.publicToken, input.petToken))
        .limit(1)
        .for("update");
      if (!pet) throw new FreeClaimGuardError("No encontramos la mascota.");
      if (pet.status === "deceased") {
        throw new FreeClaimGuardError("Esta mascota figura como fallecida en MiMAR.");
      }
      if (pet.status === "lost") {
        throw new FreeClaimGuardError(
          "Esta mascota figura como perdida. Si la encontraste, reportá un avistaje.",
        );
      }
      if (pet.inCustodyDispute) {
        throw new FreeClaimGuardError("Hay una disputa abierta para esta mascota.");
      }

      // Re-check inside the tx (the lookup result may be stale).
      const [activeCustody] = await tx
        .select({ id: ownerships.id })
        .from(ownerships)
        .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)))
        .limit(1);
      if (activeCustody) {
        throw new FreeClaimGuardError(
          "Esta mascota ya tiene una custodia activa. Podés iniciar una disputa.",
        );
      }

      const now = new Date();
      await tx.insert(ownerships).values({
        petId: pet.id,
        ownerUserId: user.id,
        role: "owner",
        startedAt: now,
      });

      const payload = validateEventPayload("ownership_claimed", {
        claimed_by_user_id: user.id,
        identifier_kind: input.identifierKind,
      });
      await tx.insert(petEvents).values({
        petId: pet.id,
        eventType: "ownership_claimed",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "owner",
        payload,
      });

      await tx.insert(notifications).values({
        userId: user.id,
        notificationType: "free_pet_claimed",
        title: `${pet.name} ahora está a tu nombre`,
        body: "Registramos la mascota a tu nombre. Ya podés ver su credencial y completar su libreta sanitaria.",
        severity: "info",
        relatedPetId: pet.id,
        ctaLabel: "Ver mi mascota",
        ctaUrl: `/mis-mascotas/${input.petToken}`,
        category: "custody",
      });

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "free_pet_claimed",
        payload: {
          pet_id: pet.id,
          identifier_kind: input.identifierKind,
        },
      });

      return { petName: pet.name };
    });

    revalidatePath("/mis-mascotas");
    revalidatePath(`/mis-mascotas/${input.petToken}`);
    return { petToken: input.petToken, petName: claimed.petName };
  } catch (err) {
    if (err instanceof FreeClaimGuardError) {
      return { error: err.message };
    }
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return { error: `No se pudo completar el reclamo: ${message}` };
  }
}
