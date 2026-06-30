// Use-case: createLibretaShareForUser — strangler migration 32/61.
//
// Pure writer: receives userId + input, runs the DB mutation, and returns the
// result. No Next.js request context.
//
// The outer shim (app/actions/libreta-share.ts) gates via the Supabase session.
// Tests call createLibretaShareForUser directly with a known userId.

import { and, count, eq, isNull } from "drizzle-orm";

import { db, libretaShareTokens, ownerships, pets } from "@/db";
import { generateLibretaShareToken } from "@/lib/publicToken";
import { generateUniqueToken } from "@/lib/unique-token";

import type { CreateShareInput, CreateShareResult } from "./types";

const MAX_ACTIVE_SHARES_PER_PET = 5;

export async function createLibretaShareForUser(
  userId: string,
  input: CreateShareInput,
): Promise<CreateShareResult> {
  // Verify active ownership of the pet identified by publicToken.
  const [petRow] = await db
    .select({ id: pets.id })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.publicToken, input.petPublicToken),
        eq(ownerships.ownerUserId, userId),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);
  if (!petRow) return { error: "Mascota no encontrada o sin permisos." };

  // Enforce hard cap of 5 active shares per pet.
  const [{ activeCount }] = await db
    .select({ activeCount: count() })
    .from(libretaShareTokens)
    .where(and(eq(libretaShareTokens.petId, petRow.id), isNull(libretaShareTokens.revokedAt)));
  if (activeCount >= MAX_ACTIVE_SHARES_PER_PET) {
    return {
      error: `Ya tenés ${MAX_ACTIVE_SHARES_PER_PET} compartidos activos para esta mascota. Revocá uno antes de crear otro.`,
    };
  }

  const shareToken = await generateUniqueToken(
    libretaShareTokens,
    libretaShareTokens.shareToken,
    generateLibretaShareToken,
  );
  const expiresAt =
    input.expiresInDays === null
      ? null
      : new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);

  await db.insert(libretaShareTokens).values({
    shareToken,
    petId: petRow.id,
    createdByUserId: userId,
    label: input.label,
    expiresAt,
  });

  return { shareToken };
}
