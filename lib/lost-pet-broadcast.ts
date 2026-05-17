// Lost-pet broadcast — fans out in-app notifications to verified org members
// whose coverage matches the pet's jurisdiction when a pet is marked lost.
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
import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

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
    // 1. Require province + locality. Without them we have no jurisdiction to target.
    const province = lastLocation?.province ?? pet.jurisdictionProvince ?? null;
    const locality = lastLocation?.locality ?? pet.jurisdictionLocality ?? null;

    if (!province || !locality) {
      return { broadcastedToMemberIds: [], orgCount: 0 };
    }

    // 2. Find verified, active orgs with coverage matching the jurisdiction.
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
          eq(organizationCoverage.jurisdictionLocality, locality),
        ),
      );

    if (coveringOrgs.length === 0) {
      return { broadcastedToMemberIds: [], orgCount: 0 };
    }

    // 3. Collect unique member IDs across all covering orgs.
    //    A user may be a member of multiple orgs in the same jurisdiction — notify only once.
    const notifiedUserIds = new Set<string>();

    for (const org of coveringOrgs) {
      const members = await (client as typeof db)
        .select({ userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.organizationId, org.orgId),
            eq(organizationMemberships.receivesBroadcasts, true),
            isNull(organizationMemberships.leftAt),
          ),
        );

      for (const member of members) {
        if (member.userId) {
          notifiedUserIds.add(member.userId);
        }
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

    await (client as typeof db).insert(notifications).values(notifValues);

    return {
      broadcastedToMemberIds: Array.from(notifiedUserIds),
      orgCount: coveringOrgs.length,
    };
  } catch (err) {
    console.error("[broadcastLostPet] broadcast failed (non-fatal):", err);
    return { broadcastedToMemberIds: [], orgCount: 0 };
  }
}
