"use server";

// Public, anon-callable server actions for /p/[publicToken].
//
// These are reachable without auth — anyone scanning a QR can invoke them.
// Each action verifies its input by public_token + status. No PII is returned
// to the caller; the notification path uses Drizzle (bypasses RLS) to write
// a notification row scoped to the pet's current owner.

import { db, notifications, ownerships, pets } from "@/db";
import { and, eq, isNull } from "drizzle-orm";

export type PublicActionState = { ok: boolean; error: string | null };

export async function notifyOwnerOfFoundPetAction(
  publicToken: string,
  _previous: PublicActionState,
  formData: FormData,
): Promise<PublicActionState> {
  if (!publicToken) return { ok: false, error: "Token de mascota inválido." };

  const finderName = String(formData.get("finderName") ?? "").trim();
  const finderContact = String(formData.get("finderContact") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!finderName) return { ok: false, error: "Falta tu nombre." };
  if (!finderContact) {
    return { ok: false, error: "Falta tu contacto (teléfono o email)." };
  }

  const [pet] = await db
    .select({ id: pets.id, name: pets.name, status: pets.status, publicToken: pets.publicToken })
    .from(pets)
    .where(eq(pets.publicToken, publicToken))
    .limit(1);
  if (!pet) return { ok: false, error: "Mascota no encontrada." };

  // The form is part of Tier 0 per AGENTS.md:376 — anyone scanning the QR can
  // notify the owner regardless of pet status. The notification is the
  // owner-side projection; there is no public broadcast and no PII exposure
  // back to the finder.

  const [owner] = await db
    .select({ userId: ownerships.ownerUserId })
    .from(ownerships)
    .where(and(eq(ownerships.petId, pet.id), isNull(ownerships.endedAt)))
    .limit(1);
  if (!owner?.userId) return { ok: false, error: "No se encontró un dueño activo." };

  // Truncate finder-supplied strings so a notification cannot be used as a
  // payload-size vector. Plenty of room for a useful message.
  const safeName = finderName.slice(0, 80);
  const safeContact = finderContact.slice(0, 120);
  const safeMessage = message.slice(0, 500);

  const body = safeMessage
    ? `${safeName} dejó un mensaje: "${safeMessage}". Te podés contactar al ${safeContact}.`
    : `${safeName} encontró a ${pet.name}. Te podés contactar al ${safeContact}.`;

  await db.insert(notifications).values({
    userId: owner.userId,
    notificationType: "pet_found_report",
    title: `Alguien encontró a ${pet.name}`,
    body,
    severity: "urgent",
    relatedPetId: pet.id,
    ctaLabel: "Ver mascota",
    ctaUrl: `/mis-mascotas/${pet.publicToken}`,
  });

  return { ok: true, error: null };
}
