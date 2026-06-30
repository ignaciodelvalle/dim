// Use-case: revokeTier2Public — strangler migration 50/61.
//
// Verbatim body of the former revokeTier2PublicAction.
// The outer shim (app/actions/tier2-public.ts) delegates here.

import { db, pets } from "@/db";
import { requirePetAccess } from "@/lib/pet-access";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function revokeTier2Public(publicToken: string): Promise<void> {
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
