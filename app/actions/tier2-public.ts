"use server";

// Tier 2 público temporal — owner-initiated opt-in window for the public
// credential at /p/[publicToken]. While the window is open, the public
// page renders a curated medical summary (vacunas vigentes,
// esterilización, medicación activa, condiciones permanentes) on top of
// the Tier 0 identity rollups it normally shows.
//
// The owner picks a window from the duration card picker. 24h / 7d / 30d are
// expiring windows (set a future tier2PublicEnabledUntil). "siempre" (no expiry)
// needs a dedicated permanent flag — since a null expiry reads as inactive on the
// public page — and is tracked as a separate follow-up; this action accepts the
// three bounded durations and falls back to 24h for anything unrecognized.

import { db, pets } from "@/db";
import { requirePetAccess } from "@/lib/pet-access";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const DAY_MS = 24 * 60 * 60 * 1000;
// Bounded share windows offered by the duration picker, keyed by the card id.
const DURATION_MS: Record<string, number> = {
  "24h": DAY_MS,
  "7d": 7 * DAY_MS,
  "30d": 30 * DAY_MS,
};

export async function enableTier2PublicAction(
  publicToken: string,
  formData?: FormData,
): Promise<void> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) throw new Error(access.error);
  const { pet } = access;

  if (pet.status === "deceased") {
    // The public credential of a deceased pet is the in-memoriam page;
    // surfacing medical detail there has no purpose.
    throw new Error("No se puede habilitar Tier 2 en una mascota fallecida.");
  }

  // Default to 24h when no/unknown duration is submitted (back-compat with any
  // caller that invokes the action without form data).
  const duration = String(formData?.get("duration") ?? "24h");
  const windowMs = DURATION_MS[duration] ?? DAY_MS;
  const until = new Date(Date.now() + windowMs);

  await db
    .update(pets)
    .set({ tier2PublicEnabledUntil: until, updatedAt: new Date() })
    .where(eq(pets.id, pet.id));

  revalidatePath(`/mis-mascotas/${publicToken}`);
  revalidatePath(`/mis-mascotas/${publicToken}/mostrar-libreta`);
  revalidatePath(`/p/${publicToken}`);
}

export async function revokeTier2PublicAction(publicToken: string): Promise<void> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) throw new Error(access.error);
  const { pet } = access;

  await db
    .update(pets)
    .set({ tier2PublicEnabledUntil: null, updatedAt: new Date() })
    .where(eq(pets.id, pet.id));

  revalidatePath(`/mis-mascotas/${publicToken}`);
  revalidatePath(`/mis-mascotas/${publicToken}/mostrar-libreta`);
  revalidatePath(`/p/${publicToken}`);
}
