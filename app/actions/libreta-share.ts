"use server";

import { and, count, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, libretaShareTokens, ownerships, pets, shareTelemetry } from "@/db";
import { generateLibretaShareToken } from "@/lib/publicToken";
import { createClient } from "@/lib/supabase/server";

const MAX_ACTIVE_SHARES_PER_PET = 5;

export type CreateShareInput = {
  petPublicToken: string;
  expiresInDays: number | null; // null = no expiration
  label: string | null;
};

export type CreateShareResult = { error: string } | { shareToken: string };
export type RevokeShareResult = { error: string } | { ok: true };

// ---------------------------------------------------------------------------
// Pure inner writers — called directly from tests.
// ---------------------------------------------------------------------------

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

  const shareToken = generateLibretaShareToken();
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

  // Creator can always revoke. Current owner of the pet can also revoke (D6).
  if (row.createdByUserId !== userId) {
    const [ownership] = await db
      .select({ id: ownerships.id })
      .from(ownerships)
      .where(
        and(
          eq(ownerships.petId, row.petId),
          eq(ownerships.ownerUserId, userId),
          isNull(ownerships.endedAt),
        ),
      )
      .limit(1);
    if (!ownership) return { error: "Sin permisos para revocar este compartido." };
  }

  await db
    .update(libretaShareTokens)
    .set({ revokedAt: new Date(), revokedByUserId: userId })
    .where(eq(libretaShareTokens.id, shareTokenRowId));

  return { ok: true };
}

export async function logLibretaShareViewForToken(input: {
  shareToken: string;
  userAgent: string | null;
}): Promise<void> {
  const [row] = await db
    .select({
      id: libretaShareTokens.id,
      petId: libretaShareTokens.petId,
      revokedAt: libretaShareTokens.revokedAt,
      expiresAt: libretaShareTokens.expiresAt,
    })
    .from(libretaShareTokens)
    .where(eq(libretaShareTokens.shareToken, input.shareToken))
    .limit(1);
  if (!row) return;
  if (row.revokedAt !== null) return;
  if (row.expiresAt !== null && row.expiresAt < new Date()) return;

  const now = new Date();

  await db.transaction(async (tx) => {
    // Tier-2 share view telemetry lives in its own table (not pet_events)
    // since the 2026-05-19 catalog cleanup. The cached counters on
    // libreta_share_tokens are still maintained for the owner's quick
    // glance at view count without scanning telemetry.
    await tx.insert(shareTelemetry).values({
      petId: row.petId,
      shareTokenId: row.id,
      viewedAt: now,
      viewerIpHash: null,
      userAgent: input.userAgent,
    });

    await tx
      .update(libretaShareTokens)
      .set({
        viewCountCached: sql`${libretaShareTokens.viewCountCached} + 1`,
        lastViewedAtCached: now,
      })
      .where(eq(libretaShareTokens.id, row.id));
  });
}

// ---------------------------------------------------------------------------
// Form-action wrappers — read auth session, delegate to inner writers.
// ---------------------------------------------------------------------------

export async function createLibretaShareAction(
  input: CreateShareInput,
): Promise<CreateShareResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const result = await createLibretaShareForUser(user.id, input);
  if ("shareToken" in result) {
    revalidatePath(`/mis-mascotas/${input.petPublicToken}/libreta`);
  }
  return result;
}

export async function revokeLibretaShareAction(
  shareTokenRowId: string,
): Promise<RevokeShareResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada." };

  const result = await revokeLibretaShareForUser(user.id, shareTokenRowId);
  if ("ok" in result) {
    // Find the pet publicToken to revalidate the page.
    const [shareRow] = await db
      .select({ petId: libretaShareTokens.petId })
      .from(libretaShareTokens)
      .where(eq(libretaShareTokens.id, shareTokenRowId))
      .limit(1);
    if (shareRow) {
      const [pet] = await db
        .select({ publicToken: pets.publicToken })
        .from(pets)
        .where(eq(pets.id, shareRow.petId))
        .limit(1);
      if (pet) revalidatePath(`/mis-mascotas/${pet.publicToken}/libreta`);
    }
  }
  return result;
}

export async function logLibretaShareViewAction(input: {
  shareToken: string;
  userAgent: string | null;
}): Promise<void> {
  await logLibretaShareViewForToken(input);
}
