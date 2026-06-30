// Use-case: revokeLibretaShareForUser — strangler migration 32/61.
//
// Pure writer: receives userId + shareTokenRowId, enforces authorization policy,
// and soft-deletes the share token. No Next.js request context.
//
// The outer shim (app/actions/libreta-share.ts) gates via the Supabase session.
// Tests call revokeLibretaShareForUser directly with a known userId.

import { eq } from "drizzle-orm";

import { db, libretaShareTokens, profiles } from "@/db";

import type { RevokeShareResult } from "./types";

export async function revokeLibretaShareForUser(
  userId: string,
  shareTokenRowId: string,
): Promise<RevokeShareResult> {
  const [row] = await db
    .select({
      petId: libretaShareTokens.petId,
      createdByUserId: libretaShareTokens.createdByUserId,
    })
    .from(libretaShareTokens)
    .where(eq(libretaShareTokens.id, shareTokenRowId))
    .limit(1);
  if (!row) return { error: "Compartido no encontrado." };

  // Authorization policy (review 2026-05-19 §2.2): creator can always revoke;
  // app admins can revoke for moderation / compliance. Other current owners
  // of the pet (including fosters and post-transfer owners) CANNOT revoke
  // someone else's share — that protects the medical-history continuity that
  // libreta shares depend on. A new owner who wants to clean up old shares
  // contacts support, or the share simply expires on schedule.
  if (row.createdByUserId !== userId) {
    const [callerProfile] = await db
      .select({ role: profiles.role })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    if (callerProfile?.role !== "admin") {
      return { error: "Sin permisos para revocar este compartido." };
    }
  }

  await db
    .update(libretaShareTokens)
    .set({ revokedAt: new Date(), revokedByUserId: userId })
    .where(eq(libretaShareTokens.id, shareTokenRowId));

  return { ok: true };
}
