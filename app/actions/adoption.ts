"use server";

// Adoption finalization — the composite custody event. Atomically:
//   - closes the org's active shelter_custody row (ended_at = now)
//   - closes any active foster row on the same pet (ended_at = now)
//   - inserts a new ownership(role='owner', owner_user_id=adopter) row
//   - emits an adoption_finalized event
//
// Adopter identification: DNI (digits-only). If a profile with that DNI already
// exists, the adoption uses that user_id. Otherwise we create a stub profile
// (no auth.users row) keyed on the DNI. The adopter claims it later via Mi
// Argentina / email signup (claim flow ships separately). profiles.id has no
// hard FK to auth.users, so stub inserts are valid; the handle_new_user
// trigger is the OTHER source of profiles rows, not the only one.

import { randomUUID } from "node:crypto";
import {
  attachments,
  cases,
  db,
  notifications,
  ownerships,
  petEvents,
  pets,
  profiles,
  reminders,
} from "@/db";
import { requireCapability } from "@/lib/capabilities";
import { closeCase } from "@/lib/case-helpers";
import { validateEventPayload } from "@/lib/event-schemas";
import { createClient } from "@/lib/supabase/server";
import { uploadAttachmentIfPresent } from "@/lib/uploads";
import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

// Post-adoption check-in windows (months after adoption_finalized). The
// adopter receives one reminder per window <= the agreed followup_months
// captured in the adoption event payload. AGENTS.md → Custody & adoption:
// "Missed check-ins generate notifications to both adopter and refugio."
const CHECKIN_WINDOWS_MONTHS = [1, 3, 6, 12] as const;

function addMonths(base: Date, months: number): Date {
  const result = new Date(base);
  result.setMonth(result.getMonth() + months);
  return result;
}

export type FinalizeAdoptionFormState = {
  error: string | null;
};

function normalizeDni(input: string): string {
  return input.replace(/\D/g, "");
}

function isValidDni(value: string): boolean {
  return /^\d{7,9}$/.test(value);
}

export async function finalizeAdoptionAction(
  orgToken: string,
  publicToken: string,
  _previous: FinalizeAdoptionFormState,
  formData: FormData,
): Promise<FinalizeAdoptionFormState> {
  const auth = await requireCapability("adoption.finalize");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  // Two entry paths (spec foster-volunteers-pool v1.4 §15.1):
  //   1. Manual DNI flow — refugio types the adopter's DNI + name (default).
  //   2. Foster-shortcut flow — the active foster opts to adopt; the org
  //      passes `adopterUserId` of the foster's profile, skipping the DNI
  //      typing + stub-creation. We still validate the user is a personal
  //      owner with verified DNI.
  const adopterUserIdInput = String(formData.get("adopterUserId") ?? "").trim() || null;
  const dniRaw = String(formData.get("adopterDni") ?? "");
  const dni = normalizeDni(dniRaw);
  const displayName = String(formData.get("adopterDisplayName") ?? "").trim();
  const phone = String(formData.get("adopterPhone") ?? "").trim() || null;
  const followupRaw = String(formData.get("followupMonths") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!adopterUserIdInput) {
    if (!dni) return { error: "Falta el DNI del adoptante." };
    if (!isValidDni(dni)) return { error: "DNI inválido (deben ser 7 a 9 dígitos)." };
    if (!displayName) return { error: "Falta el nombre del adoptante." };
  }

  const followupMonths = followupRaw
    ? Math.min(36, Math.max(0, Number.parseInt(followupRaw, 10) || 0))
    : null;

  // Pet must be in shelter_custody by THIS org.
  const [petRow] = await db
    .select({ pet: pets, custodyOwnershipId: ownerships.id })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerOrganizationId, organization.id),
        eq(ownerships.role, "shelter_custody"),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!petRow) {
    return { error: "Mascota no encontrada o no está bajo custodia de tu organización." };
  }
  const pet = petRow.pet;
  const custodyOwnershipId = petRow.custodyOwnershipId;

  // Adoption eligibility gate (spec foster-volunteers-pool v1.4 §17.8).
  // The flag defaults to NULL (no determinado todavía); finalize is only
  // allowed when explicitly marked TRUE. FALSE blocks with the structured
  // reason so the org knows what to resolve first.
  if (pet.adoptionEligible !== true) {
    if (pet.adoptionEligible === false) {
      const reasonLabel = pet.adoptionIneligibleReason ?? "sin motivo registrado";
      return {
        error: `Esta mascota está marcada como no apta para adopción (motivo: ${reasonLabel}). Resolvé el motivo desde el perfil del pet antes de finalizar.`,
      };
    }
    return {
      error:
        "Esta mascota no fue evaluada para adopción todavía. Marcala como apta desde su perfil antes de finalizar.",
    };
  }

  // Active foster row (optional — many adoptions skip the foster phase).
  const [fosterRow] = await db
    .select({ id: ownerships.id, ownerUserId: ownerships.ownerUserId })
    .from(ownerships)
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "foster"), isNull(ownerships.endedAt)),
    )
    .limit(1);
  const fosterUserId = fosterRow?.ownerUserId ?? null;

  // Resolve adopter — either the foster-shortcut path or the DNI lookup
  // path. The foster-shortcut requires that the adopter user IS the
  // currently-active foster of this pet (anti-spoof).
  let adopterUserId: string;
  let isStubAdopter: boolean;
  if (adopterUserIdInput) {
    if (!fosterRow || fosterRow.ownerUserId !== adopterUserIdInput) {
      return {
        error:
          "El adoptante del atajo debe ser el tránsito activo de esta mascota. Usá el flujo DNI si es otra persona.",
      };
    }
    const [adopterProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, adopterUserIdInput))
      .limit(1);
    if (!adopterProfile) {
      return { error: "No encontramos el perfil del adoptante." };
    }
    if (
      adopterProfile.accountType !== "personal" ||
      adopterProfile.role !== "owner" ||
      !adopterProfile.dniVerified
    ) {
      return {
        error:
          "El adoptante debe ser una cuenta personal con DNI verificado para usar el atajo de tránsito.",
      };
    }
    adopterUserId = adopterProfile.id;
    isStubAdopter = false;
  } else {
    const [existingProfile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.dniNumber, dni))
      .limit(1);
    if (existingProfile) {
      adopterUserId = existingProfile.id;
      isStubAdopter = false;
    } else {
      adopterUserId = randomUUID();
      isStubAdopter = true;
    }
  }

  const now = new Date();
  const authorVerified = organization.verified;

  // Optional adoption contract upload. Upload happens BEFORE the DB
  // transaction because storage writes are out-of-band; on tx failure
  // we clean up the orphaned object to avoid bucket leakage. The
  // attachment row's UUID is generated upfront so the same id can be
  // written into the adoption_finalized payload (contract_attachment_id)
  // and the attachments row in the same tx, giving the event payload
  // a stable forward reference without a second update.
  const supabase = await createClient();
  const contractFile = formData.get("contract") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, contractFile, "event-attachments");
  if (upload.error) return { error: upload.error };
  const contractAttachmentId = upload.uploadedPath ? randomUUID() : null;

  async function cleanupOrphan(): Promise<void> {
    if (!upload.uploadedPath) return;
    try {
      await supabase.storage.from("event-attachments").remove([upload.uploadedPath]);
    } catch {
      // Swallow — the row was never inserted, the file is orphaned at worst.
    }
  }

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

  try {
    await db.transaction(async (tx) => {
      // Stub profile insert (no auth.users row). The adopter claims via DNI
      // match on future Mi Argentina sign-in; see AGENTS.md → Mi Argentina.
      if (isStubAdopter) {
        await tx.insert(profiles).values({
          id: adopterUserId,
          displayName,
          phone,
          dniNumber: dni,
          dniVerified: false,
          role: "owner",
        });
      }

      // Close shelter_custody.
      await tx
        .update(ownerships)
        .set({ endedAt: now })
        .where(eq(ownerships.id, custodyOwnershipId));

      // Close foster (if any).
      if (fosterRow) {
        await tx.update(ownerships).set({ endedAt: now }).where(eq(ownerships.id, fosterRow.id));
        // Cases system (Fase D5): close the foster_placement case
        // alongside the foster ownership row. Reason 'resolved' — the
        // foster reached its happy outcome (adoption).
        const [fosterCase] = await tx
          .select({ id: cases.id })
          .from(cases)
          .where(
            and(
              eq(cases.primaryPetId, pet.id),
              eq(cases.caseKind, "foster_placement"),
              eq(cases.status, "open"),
            ),
          )
          .limit(1);
        if (fosterCase) {
          await closeCase(
            { caseId: fosterCase.id, reason: "resolved", closedByUserId: user.id },
            tx,
          );
        }
      }

      // New owner row. The unique-active-owner index ensures we never create
      // a duplicate; the prior shelter_custody/foster rows are now ended so
      // they don't conflict with the role='owner' partial index.
      await tx.insert(ownerships).values({
        petId: pet.id,
        ownerUserId: adopterUserId,
        role: "owner",
        startedAt: now,
        transferredFromId: custodyOwnershipId,
      });

      const payload = validateEventPayload("adoption_finalized", {
        previous_owner_organization_id: organization.id,
        adopter_user_id: adopterUserId,
        foster_user_id: fosterUserId,
        contract_attachment_id: contractAttachmentId,
        post_adoption_followup_months: followupMonths,
        notes,
      });
      const [adoptionEvent] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "adoption_finalized",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "shelter",
          authorOrganizationId: organization.id,
          authorVerified,
          payload,
        })
        .returning({ id: petEvents.id });

      // Auto-rejection cascade for the other pending adoption applications
      // (spec adoption-listing-public §12 Fase 5.5). When THIS adoption
      // finalizes, every other applicant who had an unresolved _submitted
      // for this pet gets a _rejected event with auto_generated=true plus
      // an empathy notification. The applicant who ended up adopting (if
      // they had a _submitted) is skipped because their thread is now
      // "finalized_to_me" via adoption_finalized — no _rejected needed.
      const pendingApplications = await tx.execute<{
        application_id: string;
        applicant_user_id: string;
      }>(sql`
        SELECT e.id::text AS application_id,
               e.payload->>'applicant_user_id' AS applicant_user_id
        FROM pet_events e
        WHERE e.pet_id = ${pet.id}
          AND e.event_type = 'adoption_application_submitted'
          AND e.payload->>'applicant_user_id' <> ${adopterUserId}
          AND NOT EXISTS (
            SELECT 1 FROM pet_events d
            WHERE d.pet_id = e.pet_id
              AND d.event_type = 'adoption_application_resolved'
              AND d.payload->>'application_event_id' = e.id::text
          )
      `);

      for (const app of pendingApplications) {
        const rejectionPayload = validateEventPayload("adoption_application_resolved", {
          application_event_id: app.application_id,
          reviewer_user_id: user.id,
          outcome: "rejected",
          reason: "another_application_finalized",
          auto_generated: true,
          notes: null,
        });
        await tx.insert(petEvents).values({
          petId: pet.id,
          eventType: "adoption_application_resolved",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "shelter",
          authorOrganizationId: organization.id,
          authorVerified,
          payload: rejectionPayload,
        });
        pendingNotifications.push({
          userId: app.applicant_user_id,
          notificationType: "adoption_application_closed",
          title: `${pet.name} encontró hogar`,
          body: `${pet.name} fue adoptado/a por otra postulación. Sabemos que es decepcionante. ${organization.displayName} tiene otras mascotas en adopción.`,
          severity: "info",
          ctaLabel: "Ver otras en adopción",
          ctaUrl: "/adoptar",
          relatedPetId: pet.id,
        });
      }

      // Persist the contract attachment row with the explicit upfront UUID
      // so the event payload's contract_attachment_id is a real FK target.
      if (upload.uploadedPath && contractAttachmentId) {
        await tx.insert(attachments).values({
          id: contractAttachmentId,
          petId: pet.id,
          eventId: adoptionEvent.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "application/pdf",
          fileSize: upload.size ?? 0,
        });
      }

      // Schedule post-adoption check-in reminders for the adopter. Skipped
      // for stub profiles (no auth.users row to read the reminder) and when
      // followup_months is 0/null. Each window inserts a reminder that the
      // cron in app/api/cron/post-adoption-checkin/route.ts scans for both
      // adopter-side proactive reminders and refugio-side missed-window
      // fanout notifications.
      if (!isStubAdopter && followupMonths !== null && followupMonths > 0) {
        const dueWindows = CHECKIN_WINDOWS_MONTHS.filter((m) => m <= followupMonths);
        if (dueWindows.length > 0) {
          await tx.insert(reminders).values(
            dueWindows.map((m) => ({
              petId: pet.id,
              userId: adopterUserId,
              reminderType: "post_adoption_checkin" as const,
              dueAt: addMonths(now, m),
              title: `Seguimiento post-adopción a los ${m} ${m === 1 ? "mes" : "meses"}`,
              description: `${organization.displayName} pidió un check-in sobre ${pet.name}. Subí fotos y contanos cómo está.`,
              sourceEventId: adoptionEvent.id,
            })),
          );
        }
      }

      // Notify adopter only if they're a real (non-stub) user — a stub has
      // no auth.users row, so a notification row would be unreachable until
      // the claim flow lands.
      if (!isStubAdopter) {
        pendingNotifications.push({
          userId: adopterUserId,
          notificationType: "adoption_finalized",
          title: `Adoptaste a ${pet.name}`,
          body: `${organization.displayName} te registró como dueño/a de ${pet.name}. Bienvenida a la familia.`,
          severity: "success",
          ctaLabel: "Ver mascota",
          ctaUrl: "/mis-mascotas",
          relatedPetId: pet.id,
        });
      }

      // Notify ex-foster (if different from adopter) — heads-up that their
      // foster row closed because the animal was adopted.
      if (fosterUserId && fosterUserId !== adopterUserId) {
        pendingNotifications.push({
          userId: fosterUserId,
          notificationType: "foster_ended_by_adoption",
          title: `${pet.name} fue adoptado/a`,
          body: `El tránsito que tenías a cargo se cerró: ${pet.name} encontró un hogar permanente.`,
          severity: "success",
          ctaLabel: "Ver detalles",
          ctaUrl: "/mis-mascotas",
          relatedPetId: pet.id,
        });
      }
    });
  } catch (err) {
    await cleanupOrphan();
    return {
      error: `No se pudo finalizar la adopción: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (finalizeAdoptionAction did succeed)", e);
    }
  }

  redirect(`/org/${orgToken}/mascotas?adopcion=${publicToken}`);
}
