"use server";

// Tier 2 público temporal — owner-initiated opt-in window for the public
// credential at /p/[publicToken]. While the window is open, the public
// page renders a curated medical summary (vacunas vigentes,
// esterilización, medicación activa, condiciones permanentes) on top of
// the Tier 0 identity rollups it normally shows.
//
// v1 hardcodes the duration to 24 hours. The mockup proposes a 4-card
// picker (24h / 7d / 30d / siempre); the longer durations render as
// disabled cards in the UI so users see the roadmap without picking
// something we haven't validated yet.

import { db, pets } from "@/db";
import { requirePetAccess } from "@/lib/pet-access";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function enableTier2PublicAction(publicToken: string): Promise<void> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) throw new Error(access.error);
  const { pet } = access;

  if (pet.status === "deceased") {
    // The public credential of a deceased pet is the in-memoriam page;
    // surfacing medical detail there has no purpose.
    throw new Error("No se puede habilitar Tier 2 en una mascota fallecida.");
  }

  const until = new Date(Date.now() + TWENTY_FOUR_HOURS_MS);

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
