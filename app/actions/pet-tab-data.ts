"use server";

// pet-tab-data — server actions that load panel data for the in-page
// PetDetailTabs. Called client-side on first tab activation (deferred fetch).
//
// Auth: requirePetAccess (owner or org path). Each action validates access
// before running any DB query.

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  type LibretaShareToken,
  attachments,
  db,
  libretaShareTokens,
  petEvents,
  profiles,
} from "@/db";
import { excludeSelfScansClause } from "@/lib/events";
import {
  type LibretaGroupKey,
  groupLibretaEvents,
  libretaSanitariaClause,
} from "@/lib/libreta-sanitaria";
import { fetchActiveRemindersForPet, fetchVaccinationHistory } from "@/lib/owner-dashboard";
import { requirePetAccess } from "@/lib/pet-access";
import { eventAttachmentSignedUrl, petPhotoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Libreta panel
// ---------------------------------------------------------------------------

// Row type for grouped libreta events (full petEvent row shape).
export type LibretaEventRow = {
  id: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date;
  notes: string | null;
  authorRole: string;
  authorVerified: boolean;
  authorOrganizationId: string | null;
  tipoEventoCode?: string | null;
};

export type LibretaTabData = {
  pet: {
    name: string;
    species: string;
    breed: string | null;
    sex: string;
    microchipId: string | null;
    tattooCode: string | null;
    tattooLocation: string | null;
    publicToken: string;
  };
  photoUrl: string | null;
  ownerFirstName: string | null;
  groupedEvents: Record<LibretaGroupKey, LibretaEventRow[]>;
  activeShares: LibretaShareToken[];
  accessPath: "owner" | "org";
  organizationDisplayName: string | null;
};

export async function getLibretaTabData(
  publicToken: string,
): Promise<{ ok: true; data: LibretaTabData } | { ok: false; error: string }> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { ok: false, error: "Acceso denegado" };

  const { user, pet, accessPath, organization } = access;

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

  const events = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), excludeSelfScansClause(), libretaSanitariaClause()))
    .orderBy(desc(petEvents.occurredAt));

  const grouped = groupLibretaEvents(events) as Record<LibretaGroupKey, LibretaEventRow[]>;

  const activeShares = await db
    .select()
    .from(libretaShareTokens)
    .where(and(eq(libretaShareTokens.petId, pet.id), isNull(libretaShareTokens.revokedAt)));

  return {
    ok: true,
    data: {
      pet: {
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        sex: pet.sex,
        microchipId: pet.microchipId,
        tattooCode: pet.tattooCode,
        tattooLocation: pet.tattooLocation,
        publicToken: pet.publicToken,
      },
      photoUrl,
      ownerFirstName,
      groupedEvents: grouped,
      activeShares,
      accessPath,
      organizationDisplayName: organization?.displayName ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Vacunas panel
// ---------------------------------------------------------------------------

export type VacunasTabData = {
  petName: string;
  petToken: string;
  upcomingReminders: Awaited<ReturnType<typeof fetchActiveRemindersForPet>>;
  history: Awaited<ReturnType<typeof fetchVaccinationHistory>>;
  accessPath: "owner" | "org";
  organizationDisplayName: string | null;
};

export async function getVacunasTabData(
  publicToken: string,
): Promise<{ ok: true; data: VacunasTabData } | { ok: false; error: string }> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { ok: false, error: "Acceso denegado" };

  const { user, pet, accessPath, organization } = access;

  const [upcomingReminders, history] = await Promise.all([
    accessPath === "owner" ? fetchActiveRemindersForPet(user.id, pet.id) : Promise.resolve([]),
    fetchVaccinationHistory(pet.id),
  ]);

  return {
    ok: true,
    data: {
      petName: pet.name,
      petToken: pet.publicToken,
      upcomingReminders,
      history,
      accessPath,
      organizationDisplayName: organization?.displayName ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Historial panel
// ---------------------------------------------------------------------------

export type HistorialEventRow = {
  id: string;
  petId: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date;
  notes: string | null;
  authorRole: string;
  authorVerified: boolean;
  authorOrganizationId: string | null;
  attachmentUrl: string | null;
};

export type HistorialTabData = {
  petName: string;
  petToken: string;
  events: HistorialEventRow[];
};

export async function getHistorialTabData(
  publicToken: string,
): Promise<{ ok: true; data: HistorialTabData } | { ok: false; error: string }> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { ok: false, error: "Acceso denegado" };

  const { pet } = access;

  const events = await db
    .select()
    .from(petEvents)
    .where(and(eq(petEvents.petId, pet.id), excludeSelfScansClause()))
    .orderBy(desc(petEvents.occurredAt));

  const eventIds = events.map((e) => e.id);
  const eventAttachmentRows =
    eventIds.length > 0
      ? await db.select().from(attachments).where(inArray(attachments.eventId, eventIds))
      : [];

  const supabase = await createClient();
  const urlMap = new Map<string, string>();
  await Promise.all(
    eventAttachmentRows.map(async (a) => {
      if (!a.eventId) return;
      const url = await eventAttachmentSignedUrl(supabase, a.storagePath);
      if (url) urlMap.set(a.eventId, url);
    }),
  );

  return {
    ok: true,
    data: {
      petName: pet.name,
      petToken: pet.publicToken,
      events: events.map((e) => ({
        ...e,
        attachmentUrl: urlMap.get(e.id) ?? null,
      })),
    },
  };
}
