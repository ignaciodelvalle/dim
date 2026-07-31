// Use-case: submitClaimDisputeForUser (variant B)
//
// Raises a custody_dispute against the active owner of a chip/tattoo-matched
// pet. Uploads evidence BEFORE the tx so failures don't dangle, then opens
// a case + raising event + dispute row in one atomic transaction.

import { and, eq, isNull } from "drizzle-orm";

import { attachments, auditLog, db, notifications, ownerships, petEvents, pets } from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { openCase } from "@/lib/infra/case-helpers";
import { RateLimitError, enforceRateLimit } from "@/lib/infra/rate-limit";
import { removeWelfareEvidence, uploadWelfareEvidence } from "@/lib/infra/welfare-uploads";
import { openDisputeFromEvent } from "@/src/modules/custody-disputes/application/open-dispute";

import type { ClaimDisputeInput, ClaimDisputeResult } from "./types";

export async function submitClaimDisputeForUser(
  userId: string,
  input: ClaimDisputeInput,
  files: File[],
): Promise<ClaimDisputeResult> {
  if (input.reason.trim().length < 20) {
    return { error: "Contanos por qué creés que es tuya (al menos 20 caracteres)." };
  }
  if (input.reason.length > 2000) {
    return { error: "La explicación no puede superar los 2000 caracteres." };
  }

  // Rate limit — same key as lookup so a burst of probes counts together.
  try {
    await enforceRateLimit("claim_lookup", userId, { maxPerMinute: 30, maxPerHour: 200 });
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
    return { error: "Esta mascota figura como fallecida en miMAR." };
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
  if (ownership.ownerUserId === userId) {
    return { error: "Esta mascota ya está registrada a tu nombre." };
  }

  // Evidence upload — happens BEFORE the tx so failures don't dangle.
  const reportId = crypto.randomUUID();
  const upload = await uploadWelfareEvidence(`claims/${reportId}`, files);
  if (upload.error) return { error: upload.error };

  let disputeToken = "";
  try {
    await db.transaction(async (tx) => {
      const payload = validateEventPayload("custody_dispute_raised", {
        raised_by_role: "owner",
        raised_by_user_id: userId,
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
          openedByUserId: userId,
          openedByOrganizationId: null,
          // This writer only ever raises `owner`. The union carries the role
          // so the other three roles the custody_disputes CHECK allows read
          // correctly if a writer ever raises one.
          openedReason: { code: "custody_dispute_raised", raisedByRole: "owner" },
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
          recordedByUserId: userId,
          authorRole: "owner",
          payload,
          caseId: disputeCase.id,
        })
        .returning({ id: petEvents.id });

      const { publicToken } = await openDisputeFromEvent(tx, {
        petId: pet.id,
        raisingEventId: raisingEvent.id,
        raisedByUserId: userId,
        raisedByOrgId: null,
        raisedByRole: "owner",
        jurisdictionProvince: pet.jurisdictionProvince ?? "",
        jurisdictionLocality: pet.jurisdictionLocality ?? "",
        initialParties: [
          { userId: ownership.ownerUserId, role: "current_owner" },
          { userId: userId, role: "claimant_owner", positionSummary: input.reason.trim() },
        ],
        preCreatedCaseId: disputeCase.id,
      });
      disputeToken = publicToken;

      if (upload.uploaded.length > 0) {
        await tx.insert(attachments).values(
          upload.uploaded.map((u) => ({
            petId: pet.id,
            eventId: raisingEvent.id,
            uploadedByUserId: userId,
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
        userId: userId,
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
        actorUserId: userId,
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
    await removeWelfareEvidence(upload.uploadedPaths);
    const message = err instanceof Error ? err.message : "Error desconocido.";
    return { error: `No se pudo enviar el reclamo: ${message}` };
  }

  return { disputeToken };
}
