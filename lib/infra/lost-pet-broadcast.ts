// Lost-pet broadcast — fans out in-app notifications to verified org members
// whose coverage matches the pet's jurisdiction when a pet is marked lost.
//
// This is the REAL org-coordination layer, not a mock or placeholder — task
// #43 audit (Cursor #735) confirmed no owner-facing "broadcast mock" UI
// exists anywhere; this backend fanout to verified orgs IS the intended
// coordination mechanism (strategy triage), so it stays live/ungated.
//
// Design decisions:
//   D4 — broadcast targets verified orgs only, severity = 'warning'
//   D5 — notification body is PII-free; the CTA links to the public credential
//          where the owner's disclosure preferences govern what is visible
//   D8 — the helper is defensive: any failure is logged and returns an empty
//          result WITHOUT re-throwing, so the caller (setPetLostWriter) is
//          never blocked by a broadcast error

import {
  type db,
  notifications,
  organizationCoverage,
  organizationMemberships,
  organizations,
} from "@/db";
import type * as schema from "@/db/schema";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

// Chunk size for the bulk notification insert. At national scale a single
// jurisdiction can match thousands of org members; one giant multi-row INSERT
// holds a long write lock and risks exceeding parameter limits. Inserting in
// batches keeps each statement short and the lock window small.
const NOTIFICATION_INSERT_CHUNK = 500;

// The transaction type accepted by Drizzle's `db.transaction(async (tx) => …)`
// callback. We use a looser type here so tests can pass either `db` or a `tx`.
type DbOrTx =
  | PostgresJsDatabase<typeof schema>
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PetForBroadcast = {
  id: string;
  publicToken: string;
  name: string;
  species?: string | null;
  breed?: string | null;
  color?: string | null;
  jurisdictionProvince?: string | null;
  jurisdictionLocality?: string | null;
};

export type OwnerProfileForBroadcast = {
  id: string;
  displayName: string;
};

export type LastLocationForBroadcast = {
  province?: string | null;
  locality?: string | null;
} | null;

export type BroadcastResult = {
  broadcastedToMemberIds: string[];
  orgCount: number;
};

// Builds the notification body: intentionally minimal and PII-free.
// The CTA goes to the public credential where the owner controls exposure.
function buildBroadcastBody(pet: PetForBroadcast): string {
  const parts: string[] = [
    `${pet.name} — ${pet.species ?? "mascota"}${pet.breed ? `, ${pet.breed}` : ""}.`,
  ];
  if (pet.color) parts.push(`Color: ${pet.color}.`);
  parts.push(`Tocá "Ver credencial" para detalles y contacto.`);
  return parts.join("\n");
}

// Main export — call after the pet's status_changed event is committed.
// Pass `db` directly (not a tx) so the broadcast is outside the main
// transaction; failures don't roll back the lost-flip (D8).
//
// Accepts either `db` or a `tx` so tests can drive it directly.
export async function broadcastLostPet(
  client: DbOrTx,
  pet: PetForBroadcast,
  _ownerProfile: OwnerProfileForBroadcast,
  lastLocation: LastLocationForBroadcast,
): Promise<BroadcastResult> {
  try {
    // 1. Require province (locality is optional — province-only rows cover the whole province).
    const province = lastLocation?.province ?? pet.jurisdictionProvince ?? null;
    const locality = lastLocation?.locality ?? pet.jurisdictionLocality ?? null;

    if (!province) {
      return { broadcastedToMemberIds: [], orgCount: 0 };
    }

    // 2. Find verified, active orgs with coverage matching the jurisdiction.
    //
    //    Matching rules (C2 — broader reach for locality-less lost pets):
    //
    //    - pet has locality → match rows where
    //        jurisdictionLocality = locality (exact) OR jurisdictionLocality IS NULL (province-level).
    //        An org with province-level coverage catches any locality; a locality-specific org
    //        catches only its registered locality.
    //
    //    - pet has NO locality → match ALL coverage rows for the province.
    //        Drop the locality predicate entirely (just eq(province)). A pet lost somewhere
    //        in province X with no known locality should alert every org covering any
    //        part of province X — both province-level and locality-specific orgs.
    const localityPredicate =
      locality !== null
        ? or(
            eq(organizationCoverage.jurisdictionLocality, locality),
            isNull(organizationCoverage.jurisdictionLocality),
          )
        : undefined; // no locality filter — match all coverage rows for the province

    const coveringOrgs = await (client as typeof db)
      .select({
        orgId: organizations.id,
        orgDisplayName: organizations.displayName,
      })
      .from(organizations)
      .innerJoin(organizationCoverage, eq(organizationCoverage.organizationId, organizations.id))
      .where(
        and(
          eq(organizations.verified, true),
          eq(organizations.status, "active"),
          eq(organizationCoverage.jurisdictionProvince, province),
          localityPredicate,
        ),
      );

    if (coveringOrgs.length === 0) {
      return { broadcastedToMemberIds: [], orgCount: 0 };
    }

    // 3. Collect unique member IDs across all covering orgs in a SINGLE query.
    //    Previously this looped one query per org (N+1) — at national scale a
    //    pet lost in a populous province can match hundreds of orgs, each
    //    triggering its own round-trip. A single `inArray` over all org ids
    //    fetches every eligible member at once; dedup happens in JS because a
    //    user may belong to multiple orgs in the same jurisdiction (notify once).
    const orgIds = coveringOrgs.map((org) => org.orgId);
    const members = await (client as typeof db)
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(
        and(
          inArray(organizationMemberships.organizationId, orgIds),
          eq(organizationMemberships.receivesBroadcasts, true),
          isNull(organizationMemberships.leftAt),
        ),
      );

    const notifiedUserIds = new Set<string>();
    for (const member of members) {
      if (member.userId) {
        notifiedUserIds.add(member.userId);
      }
    }

    if (notifiedUserIds.size === 0) {
      return { broadcastedToMemberIds: [], orgCount: coveringOrgs.length };
    }

    // 4. Bulk insert one notification per unique member.
    const body = buildBroadcastBody(pet);
    const title = `Mascota perdida en tu zona: ${pet.name}`;
    const ctaUrl = `/p/${pet.publicToken}`;

    const notifValues = Array.from(notifiedUserIds).map((userId) => ({
      userId,
      notificationType: "lost_pet_broadcast" as const,
      severity: "warning" as const,
      title,
      body,
      ctaLabel: "Ver credencial",
      ctaUrl,
      relatedPetId: pet.id,
    }));

    // Chunked insert: one giant multi-row INSERT at national scale holds a long
    // write lock and can blow past the bind-parameter limit. Batching keeps each
    // statement short. The whole broadcast is non-fatal (D8), so a mid-chunk
    // failure simply surfaces fewer notifications without blocking the lost-flip.
    for (let i = 0; i < notifValues.length; i += NOTIFICATION_INSERT_CHUNK) {
      const chunk = notifValues.slice(i, i + NOTIFICATION_INSERT_CHUNK);
      await (client as typeof db).insert(notifications).values(chunk);
    }

    return {
      broadcastedToMemberIds: Array.from(notifiedUserIds),
      orgCount: coveringOrgs.length,
    };
  } catch (err) {
    console.error("[broadcastLostPet] broadcast failed (non-fatal):", err);
    return { broadcastedToMemberIds: [], orgCount: 0 };
  }
}
