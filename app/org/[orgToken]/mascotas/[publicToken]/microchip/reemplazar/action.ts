"use server";

import { replaceMicrochipForUser } from "@/app/actions/microchip";
import { db, ownerships, pets } from "@/db";
import { requireOrgAccessByToken } from "@/lib/infra/auth-guards";
import { fetchActiveIdentifications } from "@/lib/infra/pet-identifiers";
import { parseDateInput } from "@/lib/utils/format";
import type { EventFormState } from "@/src/modules/events/actions";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

const VET_REASONS = new Set([
  "damaged",
  "unreadable",
  "owner_request",
  "device_failure",
  "other",
  "duplicate_detected",
]);

const REVOCATION_REASONS = new Set(["owner_request", "device_failure"]);

export async function replaceMicrochipVetAction(
  orgToken: string,
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { user, organization, membership } = await requireOrgAccessByToken(orgToken);

  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("event.write")) {
    return { error: "No tenés permiso para registrar eventos de identificación." };
  }

  // Verify the org holds active custody over this pet.
  const [petRow] = await db
    .select({ pet: pets, role: ownerships.role })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, publicToken),
        eq(ownerships.ownerOrganizationId, organization.id),
        isNull(ownerships.endedAt),
        inArray(ownerships.role, ["shelter_custody", "foster"]),
      ),
    )
    .limit(1);

  if (!petRow) {
    return {
      error:
        "Esta mascota no está bajo custodia activa de la organización (shelter_custody o foster).",
    };
  }

  const { pet } = petRow;

  // ARCH-S: legacy pets.microchipId column dropped — read from canonical.
  const canonicalIds = await fetchActiveIdentifications(pet.id);
  if (!canonicalIds.microchip) {
    return { error: "Esta mascota no tiene microchip registrado." };
  }

  const reason = String(formData.get("reason") ?? "").trim();
  const newChipNumberRaw = String(formData.get("newChipNumber") ?? "").trim();
  const replacedBy = String(formData.get("replacedBy") ?? "").trim() || null;
  const replacedAtRaw = String(formData.get("replacedAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!VET_REASONS.has(reason)) {
    return { error: "Motivo inválido." };
  }

  const newChipNumber = newChipNumberRaw || null;

  if (newChipNumber === null && !REVOCATION_REASONS.has(reason)) {
    return {
      error:
        "Para dejar la mascota sin chip, el motivo debe ser 'Solicitud del dueño' o 'Falla del dispositivo'.",
    };
  }

  if (!replacedAtRaw) return { error: "Falta la fecha del reemplazo." };
  const replacedAtDate = parseDateInput(replacedAtRaw);
  if (!replacedAtDate) return { error: "Fecha de reemplazo inválida." };

  const result = await replaceMicrochipForUser(user.id, {
    petId: pet.id,
    previousChipNumber: canonicalIds.microchip.code,
    newChipNumber,
    reason: reason as
      | "damaged"
      | "unreadable"
      | "owner_request"
      | "device_failure"
      | "other"
      | "duplicate_detected",
    replacedBy,
    replacedAt: replacedAtDate.toISOString(),
    notes,
    actorContext: { kind: "vet_in_org", organizationId: organization.id },
  });

  if ("error" in result) {
    return { error: result.error };
  }

  redirect(`/org/${orgToken}/mascotas`);
}
