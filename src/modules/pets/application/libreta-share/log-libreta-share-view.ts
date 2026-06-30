// Use-case: logLibretaShareViewForToken — strangler migration 32/61.
//
// Token-based writer (no userId): validates the share token, then records a
// telemetry row and bumps the cached view counter inside a transaction.
// No Next.js request context.
//
// The outer shim (app/actions/libreta-share.ts) delegates without auth —
// the share token itself is the credential.

import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { db, libretaShareTokens, shareTelemetry } from "@/db";

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
