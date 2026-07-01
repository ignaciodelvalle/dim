// get-libreta-tab-data.ts — use-case for the Libreta tab panel.
// Auth guard is handled by the shim (app/actions/pet-tab-data.ts).

import { and, desc, eq, isNull } from "drizzle-orm";

import {
  type Organization,
  type Pet,
  attachments,
  db,
  libretaShareTokens,
  petEvents,
  profiles,
} from "@/db";
import { excludeSelfScansClause } from "@/lib/events/events";
import { computeLibretaHealthStatus } from "@/lib/libreta-health-status";
import {
  type LibretaGroupKey,
  groupLibretaEvents,
  libretaSanitariaClause,
} from "@/lib/libreta-sanitaria";
import { fetchActiveRemindersForPet } from "@/lib/owner-dashboard";
import { fetchActiveIdentifications } from "@/lib/pet-identifiers";
import { petPhotoUrl } from "@/lib/storage";
import type { LibretaEventRow, LibretaTabData } from "./types";

export async function getLibretaTabData(context: {
  user: { id: string };
  pet: Pet;
  accessPath: "owner" | "org";
  organization: Organization | null;
}): Promise<{ ok: true; data: LibretaTabData } | { ok: false; error: string }> {
  const { user, pet, accessPath, organization } = context;

  const [profileRow] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  const ownerFirstName = profileRow?.displayName?.split(" ")[0] ?? null;

  let photoUrl: string | null = null;
  if (pet.primaryPhotoId) {
    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, pet.primaryPhotoId))
      .limit(1);
    photoUrl = petPhotoUrl(row?.storagePath);
  }

  const [events, activeShares, activeReminders, identifications] = await Promise.all([
    db
      .select()
      .from(petEvents)
      .where(and(eq(petEvents.petId, pet.id), excludeSelfScansClause(), libretaSanitariaClause()))
      .orderBy(desc(petEvents.occurredAt)),
    db
      .select()
      .from(libretaShareTokens)
      .where(and(eq(libretaShareTokens.petId, pet.id), isNull(libretaShareTokens.revokedAt))),
    fetchActiveRemindersForPet(user.id, pet.id),
    fetchActiveIdentifications(pet.id),
  ]);

  const grouped = groupLibretaEvents(events) as Record<LibretaGroupKey, LibretaEventRow[]>;
  const healthStatus = computeLibretaHealthStatus(
    {
      species: pet.species,
      permanentConditions: pet.permanentConditions ?? null,
      permanentConditionsOther: pet.permanentConditionsOther ?? null,
    },
    events,
  );

  return {
    ok: true,
    data: {
      pet: {
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        sex: pet.sex,
        microchipId: identifications.microchip?.code ?? null,
        tattooCode: identifications.tattoo?.code ?? null,
        tattooLocation: identifications.tattoo?.tattooLocation ?? null,
        publicToken: pet.publicToken,
      },
      photoUrl,
      ownerFirstName,
      groupedEvents: grouped,
      activeShares,
      accessPath,
      organizationDisplayName: organization?.displayName ?? null,
      healthStatus,
      activeRemindersCount: activeReminders.length,
    },
  };
}
