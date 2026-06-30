// Use-case: enableTier2Public — strangler migration 50/61.
//
// Verbatim body of the former enableTier2PublicAction.
// The outer shim (app/actions/tier2-public.ts) delegates here.

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

export async function enableTier2Public(
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

  if (duration === "siempre") {
    // Permanent — no expiry timestamp; activate via the dedicated boolean flag.
    await db
      .update(pets)
      .set({ tier2PublicPermanent: true, tier2PublicEnabledUntil: null, updatedAt: new Date() })
      .where(eq(pets.id, pet.id));
  } else {
    const windowMs = DURATION_MS[duration] ?? DAY_MS;
    const until = new Date(Date.now() + windowMs);
    await db
      .update(pets)
      .set({ tier2PublicPermanent: false, tier2PublicEnabledUntil: until, updatedAt: new Date() })
      .where(eq(pets.id, pet.id));
  }

  revalidatePath(`/mis-mascotas/${publicToken}`);
  revalidatePath(`/mis-mascotas/${publicToken}/mostrar-libreta`);
  revalidatePath(`/p/${publicToken}`);
}
