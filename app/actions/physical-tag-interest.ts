"use server";

// Toggle the §4.20 physical-tag-interest placeholder for a pet/user pair.
//
// Three states the action handles:
//   - first toggle: INSERT a new row (cancelled_at NULL).
//   - second toggle on the active row: SET cancelled_at = now() (soft).
//   - third toggle on a cancelled row: CLEAR cancelled_at (re-interest).
//
// Ownership is enforced via `requirePetAccess` — the user must be on the
// owner path (an active ownership row keyed to their user_id). Org-path
// (foster, shelter custody) is intentionally rejected here: this is a
// product-demand signal that belongs to the legal owner, not transient
// caretakers.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, physicalTagInterest } from "@/db";
import { requirePetAccess } from "@/lib/pet-access";

export type TogglePhysicalTagInterestResult =
  | { ok: true; state: "interested" | "cancelled" }
  | { error: string };

export async function togglePhysicalTagInterestAction(
  petPublicToken: string,
): Promise<TogglePhysicalTagInterestResult> {
  const access = await requirePetAccess(petPublicToken);
  if (!access.ok) return { error: access.error };
  if (access.accessPath !== "owner") {
    return { error: "Solo el dueño legal puede manifestar interés en una chapa física." };
  }

  const userId = access.user.id;
  const petId = access.pet.id;

  const [existing] = await db
    .select({
      id: physicalTagInterest.id,
      cancelledAt: physicalTagInterest.cancelledAt,
    })
    .from(physicalTagInterest)
    .where(and(eq(physicalTagInterest.petId, petId), eq(physicalTagInterest.userId, userId)))
    .limit(1);

  let nextState: "interested" | "cancelled";
  if (!existing) {
    await db.insert(physicalTagInterest).values({ petId, userId });
    nextState = "interested";
  } else if (existing.cancelledAt) {
    await db
      .update(physicalTagInterest)
      .set({ cancelledAt: null })
      .where(eq(physicalTagInterest.id, existing.id));
    nextState = "interested";
  } else {
    await db
      .update(physicalTagInterest)
      .set({ cancelledAt: new Date() })
      .where(eq(physicalTagInterest.id, existing.id));
    nextState = "cancelled";
  }

  revalidatePath(`/mis-mascotas/${petPublicToken}`);
  return { ok: true, state: nextState };
}
