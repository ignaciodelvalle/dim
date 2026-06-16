"use server";

// Tier 2 público — owner-initiated opt-in for the public credential at
// /p/[publicToken]. While active, the public page renders a curated medical
// summary (vacunas vigentes, esterilización, medicación activa, condiciones
// permanentes) on top of the Tier 0 identity rollups it normally shows.
//
// Duration options:
//   24h / 7d / 30d — expiring windows (set tier2PublicEnabledUntil to a
//                    future timestamp; tier2PublicPermanent stays false).
//   siempre        — permanent / no-expiry (sets tier2PublicPermanent = true,
//                    tier2PublicEnabledUntil = null). A dedicated boolean is
//                    required because a null expiry reads as inactive on the
//                    public page.
//
// Revocation always clears both fields.

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

export async function revokeTier2PublicAction(publicToken: string): Promise<void> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) throw new Error(access.error);
  const { pet } = access;

  await db
    .update(pets)
    .set({ tier2PublicPermanent: false, tier2PublicEnabledUntil: null, updatedAt: new Date() })
    .where(eq(pets.id, pet.id));

  revalidatePath(`/mis-mascotas/${publicToken}`);
  revalidatePath(`/mis-mascotas/${publicToken}/mostrar-libreta`);
  revalidatePath(`/p/${publicToken}`);
}
