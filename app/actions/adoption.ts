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
import { db, notifications, ownerships, petEvents, pets, profiles, reminders } from "@/db";
import { requireCapability } from "@/lib/capabilities";
import { validateEventPayload } from "@/lib/event-schemas";
import { and, eq, isNull } from "drizzle-orm";
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
  publicToken: string,
  _previous: FinalizeAdoptionFormState,
  formData: FormData,
): Promise<FinalizeAdoptionFormState> {
  const auth = await requireCapability("adoption.finalize");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const dniRaw = String(formData.get("adopterDni") ?? "");
  const dni = normalizeDni(dniRaw);
  const displayName = String(formData.get("adopterDisplayName") ?? "").trim();
  const phone = String(formData.get("adopterPhone") ?? "").trim() || null;
  const followupRaw = String(formData.get("followupMonths") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!dni) return { error: "Falta el DNI del adoptante." };
  if (!isValidDni(dni)) return { error: "DNI inválido (deben ser 7 a 9 dígitos)." };
  if (!displayName) return { error: "Falta el nombre del adoptante." };

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

  // Active foster row (optional — many adoptions skip the foster phase).
  const [fosterRow] = await db
    .select({ id: ownerships.id, ownerUserId: ownerships.ownerUserId })
    .from(ownerships)
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "foster"), isNull(ownerships.endedAt)),
    )
    .limit(1);
  const fosterUserId = fosterRow?.ownerUserId ?? null;

  // Look up adopter by DNI. We trim and normalize here so the unique index
  // catches collisions cleanly even if the refugio types punctuation.
  const [existingProfile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.dniNumber, dni))
    .limit(1);

  let adopterUserId: string;
  let isStubAdopter: boolean;
  if (existingProfile) {
    adopterUserId = existingProfile.id;
    isStubAdopter = false;
  } else {
    adopterUserId = randomUUID();
    isStubAdopter = true;
  }

  const now = new Date();
  const authorVerified = organization.verified;

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
        contract_attachment_id: null,
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
        await tx.insert(notifications).values({
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
        await tx.insert(notifications).values({
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
    return {
      error: `No se pudo finalizar la adopción: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/refugio/mascotas?adopcion=${publicToken}`);
}
