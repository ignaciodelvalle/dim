// Read-side helper for the §4.20 physical-tag-interest placeholder.
//
// The card on /mis-mascotas/[publicToken] needs to know whether THIS user
// already expressed interest in a physical QR tag for THIS pet. One row
// per (pet, user). The interest is "active" iff `cancelled_at IS NULL`.

import { and, eq } from "drizzle-orm";

import { db, physicalTagInterest } from "@/db";

export interface PhysicalTagInterestState {
  interested: boolean;
  /** Set when the user has an active (non-cancelled) row. */
  requestedAt: Date | null;
}

export async function getPhysicalTagInterest(
  petId: string,
  userId: string,
): Promise<PhysicalTagInterestState> {
  const [row] = await db
    .select({
      createdAt: physicalTagInterest.createdAt,
      cancelledAt: physicalTagInterest.cancelledAt,
    })
    .from(physicalTagInterest)
    .where(and(eq(physicalTagInterest.petId, petId), eq(physicalTagInterest.userId, userId)))
    .limit(1);
  if (!row || row.cancelledAt) {
    return { interested: false, requestedAt: null };
  }
  return { interested: true, requestedAt: row.createdAt };
}
