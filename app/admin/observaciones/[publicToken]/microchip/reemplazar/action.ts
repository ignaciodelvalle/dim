"use server";

import type { EventFormState } from "@/app/actions/events";
import { replaceMicrochipForUser } from "@/app/actions/microchip";
import { db, pets } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { parseDateInput } from "@/lib/format";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

const ADMIN_REASONS = new Set([
  "damaged",
  "unreadable",
  "owner_request",
  "device_failure",
  "other",
  "duplicate_detected",
  "fraud_detected",
]);

const REVOCATION_REASONS = new Set(["owner_request", "device_failure", "fraud_detected"]);

export async function replaceMicrochipAdminAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const { user } = await requireAdminOrRedirect();

  const [pet] = await db.select().from(pets).where(eq(pets.publicToken, publicToken)).limit(1);
  if (!pet) return { error: "Mascota no encontrada." };

  if (!pet.microchipId) {
    return { error: "Esta mascota no tiene microchip registrado." };
  }

  const reason = String(formData.get("reason") ?? "").trim();
  const newChipNumberRaw = String(formData.get("newChipNumber") ?? "").trim();
  const replacedBy = String(formData.get("replacedBy") ?? "").trim() || null;
  const replacedAtRaw = String(formData.get("replacedAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!ADMIN_REASONS.has(reason)) {
    return { error: "Motivo inválido." };
  }

  if (reason === "fraud_detected" && !notes) {
    return {
      error:
        "Las acciones por fraude requieren una nota que justifique la decisión (pista de auditoría).",
    };
  }

  const newChipNumber = newChipNumberRaw || null;

  if (newChipNumber === null && !REVOCATION_REASONS.has(reason)) {
    return {
      error:
        "Para dejar la mascota sin chip, el motivo debe ser 'Fraude detectado', 'Solicitud del dueño' o 'Falla del dispositivo'.",
    };
  }

  if (!replacedAtRaw) return { error: "Falta la fecha del reemplazo." };
  const replacedAtDate = parseDateInput(replacedAtRaw);
  if (!replacedAtDate) return { error: "Fecha de reemplazo inválida." };

  const result = await replaceMicrochipForUser(user.id, {
    petId: pet.id,
    previousChipNumber: pet.microchipId,
    newChipNumber,
    reason: reason as
      | "damaged"
      | "unreadable"
      | "owner_request"
      | "device_failure"
      | "other"
      | "duplicate_detected"
      | "fraud_detected",
    replacedBy,
    replacedAt: replacedAtDate.toISOString(),
    notes,
    actorContext: { kind: "admin" },
  });

  if ("error" in result) {
    return { error: result.error };
  }

  redirect(`/admin/observaciones`);
}
