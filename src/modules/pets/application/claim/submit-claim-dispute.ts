// Use-case: submitClaimDisputeForUser (variant B)
//
// Raises a custody_dispute against the active owner of a chip/tattoo-matched
// pet. Uploads evidence BEFORE the tx so failures don't dangle, then opens
// a case + raising event + dispute row in one atomic transaction.
//
// AUTHORIZATION: the private identifier, never a caller-supplied pet token.
//
// This writer used to take `petToken` straight into `where(eq(pets.publicToken,
// …))` behind nothing but requireUserOrRedirect. That made it a national
// denial-of-rescue button: /perdidas lists every lost animal with a link to
// /p/{token} and no login, so a free account could scrape tokens and raise a
// dispute on each one. Every raise flips `pets.in_custody_dispute` (see
// openDisputeFromEvent), and app/(public)/p/[publicToken]/page.tsx reads that
// flag to null out ownerFirstName, ownerPhoneE164, ownerEmail, the finder form
// AND the sighting form — so mass-disputing lost pets strips the only channel
// by which a finder reaches the owner, on exactly the animals that need it.
// It also notified each owner that a stranger claims their pet, and appended a
// permanent custody_dispute_raised row to their append-only spine.
//
// The fix resolves the pet FROM the identifier and never consults a token, so
// a mismatch is not merely rejected — it is unrepresentable. That is verbatim
// what submitFreeClaimForUser (the sibling step of the SAME wizard) already
// did, calling the identifier "the evidence". The dispute step was an outlier,
// not a design. The wizard already carries kind+value forward for the free
// branch; this branch now uses the value it was already holding.
//
// The identifier is not proof of ownership — a vet or a shelter knows the chip
// too. It is proof the caller reached this flow legitimately, and the dispute
// is adjudicated by a human authority afterwards. What it buys is the end of
// bulk abuse against arbitrary animals: a 15-digit keyspace at 30 attempts a
// minute instead of a token list anyone can download.

import { and, eq, isNull } from "drizzle-orm";

import {
  attachments,
  auditLog,
  db,
  notifications,
  ownerships,
  petEvents,
  petIdentifications,
  pets,
} from "@/db";
import { validateEventPayload } from "@/lib/events/event-schemas";
import { openCase } from "@/lib/infra/case-helpers";
import { RateLimitError, enforceRateLimit } from "@/lib/infra/rate-limit";
import { removeWelfareEvidence, uploadWelfareEvidence } from "@/lib/infra/welfare-uploads";
import { openDisputeFromEvent } from "@/src/modules/custody-disputes/application/open-dispute";

import type { ClaimDisputeInput, ClaimDisputeResult } from "./types";

const MICROCHIP_PATTERN = /^\d{15}$/;

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

  // Evidence gate — mirrors submitFreeClaimForUser. An empty value (or a
  // malformed microchip) can never resolve to a pet, so reject before spending
  // a rate-limit token or uploading anything.
  const identifierValue = input.identifierValue.trim();
  if (!identifierValue) {
    return { error: "Ingresá el número de microchip o el código del tatuaje." };
  }
  if (input.identifierKind === "microchip" && !MICROCHIP_PATTERN.test(identifierValue)) {
    return { error: "El microchip debe tener exactamente 15 dígitos." };
  }

  // Evidence gate (PO decision 2026-07-30). Raising a dispute is not a request
  // — it is a permanent, third-party-visible accusation: it notifies the
  // registered owner that a stranger claims their animal, appends an
  // uneditable custody_dispute_raised row to their spine (invariant #2), flips
  // pets.in_custody_dispute (which strips the owner's contact channel from the
  // public credential) and opens a case the local authority must adjudicate.
  // The friction has to be proportional to that, and 20 characters of prose
  // was not: `files: []` opened a dispute with zero proof.
  //
  // Same rule the other two evidence-backed accusation writers already
  // enforce: createOrgWelfareReportAction ("Un reporte profesional requiere al
  // menos un adjunto de evidencia") and validateMotivoAndAttachments
  // (EVIDENCE_REQUIRED) for revocations. Empty/zero-byte entries are filtered
  // first so a submitted-but-empty file input cannot satisfy the gate — that
  // is the same `f.size > 0` filter uploadWelfareEvidence applies downstream,
  // hoisted here so the count the gate checks is the count that gets stored.
  //
  // Server-side on purpose: the wizard also marks the input required, but the
  // action is an independently-addressable server action — the client check is
  // a courtesy, this is the rule.
  const evidenceFiles = files.filter((f) => f && f.size > 0);
  if (evidenceFiles.length === 0) {
    return {
      error:
        "Adjuntá al menos una foto o un video como prueba. Una disputa le avisa a la persona registrada como dueña y queda asentada de forma permanente, así que la autoridad necesita ver algo concreto para poder revisarla.",
    };
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

  // Resolve the pet FROM the private identifier — this is the evidence, and it
  // is the whole authorization. No caller-supplied token is consulted anywhere
  // in this function, so there is no token/pet pair that could disagree.
  // The active-status partial unique index guarantees at most one match.
  //
  // ART. 16: `isNull(pets.deletedAt)` on the join is load-bearing, same clause
  // and same reason as `submit-free-claim.ts` and `lookup-for-claim.ts` —
  // `pet_identifications` rows stay `status = 'active'` after an erasure, and
  // `ownerships` rows survive it too (erase-subject-data soft-deletes only
  // `pets`). Without the clause an erased pet's chip answered "figura como
  // fallecida" / "no tiene dueño activo registrado" — both distinguishable
  // from "No encontramos la mascota." — and with a surviving active-owner row
  // the dispute PROCEEDED: case opened, `custody_dispute_raised` appended to
  // the erased spine, `in_custody_dispute` flipped, the erased subject
  // notified. Filtered out, `!pet` below answers exactly what an unregistered
  // chip answers. Found by the 2026-09-01 pre-push review of the free-claim
  // fix, which had named only `lookup-for-claim` as "the sibling".
  const identificationKind = input.identifierKind === "microchip" ? "microchip_iso" : "tattoo";
  const [pet] = await db
    .select({
      id: pets.id,
      publicToken: pets.publicToken,
      name: pets.name,
      status: pets.status,
      inCustodyDispute: pets.inCustodyDispute,
      jurisdictionProvince: pets.jurisdictionProvince,
      jurisdictionLocality: pets.jurisdictionLocality,
    })
    .from(petIdentifications)
    .innerJoin(pets, and(eq(pets.id, petIdentifications.petId), isNull(pets.deletedAt)))
    .where(
      and(
        eq(petIdentifications.kind, identificationKind),
        eq(petIdentifications.code, identifierValue),
        eq(petIdentifications.status, "active"),
      ),
    )
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
  const upload = await uploadWelfareEvidence(`claims/${reportId}`, evidenceFiles);
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
          // NOT "owner" — see the twin fix in confirm-chip-match-vecino.ts
          // (4b09b445). This writer runs on a pet the actor demonstrably does
          // NOT own: the guard 100 lines up returns an error when the claimant
          // IS the registered owner, so reaching this insert proves they are
          // not. The timeline renders author_role verbatim as "Dueño/a", so
          // signing it "owner" showed the real owner an accusation against
          // themselves apparently written by themselves. The spine is
          // append-only (invariant #2): a false attribution here cannot be
          // edited later, only contradicted by a second event.
          //
          // The payload's `raised_by_role` below stays "owner" on purpose —
          // that is a different axis. Its domain is owner|org|govt|admin (DB
          // CHECK custody_disputes_raised_role_valid, migration 0025) and it
          // classifies WHO INITIATED — a private party asserting ownership, as
          // opposed to an org, a govt agent or an admin. There is no
          // "claimant" member; adding one is a CHECK migration plus the label
          // and legacy-parser tables, not a rename. authorRole answers "who
          // wrote this row", raised_by_role answers "under what capacity was
          // the dispute opened".
          authorRole: "finder",
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
          // The RESOLVED token, not caller input — this notification goes to
          // the owner and must point at their own pet.
          ctaUrl: `/mis-mascotas/${pet.publicToken}`,
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

  return { disputeToken, petToken: pet.publicToken };
}
