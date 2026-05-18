"use server";

// Server actions for pet-recordable events. Originally owner-only; since slice
// 7 these also accept the "org-mediated" access path (active member of an org
// that holds the pet in any active ownership role). The access helper
// (`requirePetAccess` / `requireAlivePetAccess`, `lib/pet-access.ts`) is the
// single security boundary; each action just spreads the returned
// `eventAuthorship` into its petEvents insert so `authorRole` and
// `authorOrganizationId` are set automatically.
//
// Shared pattern: resolve access → validate form → insert event (+ optional
// attachment / reminder) atomically → redirect back to the pet's detail page.

import {
  attachments,
  db,
  notifications,
  ownerships,
  petEvents,
  pets,
  profiles,
  reminders,
} from "@/db";
import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";
import { signalAuthorityReport } from "@/lib/authority";
import { findDisease, isReportable } from "@/lib/diseases";
import { findDrugByLabel } from "@/lib/drugs";
import { validateEventPayload } from "@/lib/event-schemas";
import { parseDateInput } from "@/lib/format";
import { writePoint } from "@/lib/location";
import { broadcastLostPet } from "@/lib/lost-pet-broadcast";
import {
  FREQUENCY_LABELS,
  generateDoseSchedule,
  intervalHoursForFrequency,
  parseFrequencyFields,
} from "@/lib/medication-schedule";
import { validateMicrochipId } from "@/lib/microchip-validation";
import {
  type SupabaseServerClient,
  requireAlivePetAccess,
  requirePetAccess,
} from "@/lib/pet-access";
import { createClient } from "@/lib/supabase/server";
import { uploadAttachmentIfPresent } from "@/lib/uploads";
import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type EventFormState = {
  error: string | null;
};

async function cleanupAttachment(supabase: SupabaseServerClient, path: string | null) {
  if (!path) return;
  try {
    await supabase.storage.from("event-attachments").remove([path]);
  } catch {
    // Swallow — the row was never inserted, the file is orphaned at worst.
  }
}

// ---------------------------------------------------------------------------
// Vaccination
// ---------------------------------------------------------------------------

export async function createVaccinationAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  const vaccineName = String(formData.get("vaccineName") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim() || null;
  const batch = String(formData.get("batch") ?? "").trim() || null;
  const administeredBy = String(formData.get("administeredBy") ?? "").trim() || null;
  const nextDueAtRaw = String(formData.get("nextDueAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const sourceReminderId = String(formData.get("sourceReminderId") ?? "").trim() || null;

  if (!vaccineName) return { error: "Falta el nombre de la vacuna." };
  if (!occurredAtRaw) return { error: "Falta la fecha de aplicación." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha de aplicación inválida." };

  const nextDueAt = nextDueAtRaw ? parseDateInput(nextDueAtRaw) : null;
  if (nextDueAtRaw && !nextDueAt) {
    return { error: "Fecha de próxima dosis inválida." };
  }

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const eventPayload = validateEventPayload("vaccination_administered", {
        vaccine_name: vaccineName,
        brand,
        batch,
        administered_by: administeredBy,
        next_due_at: nextDueAt ? nextDueAt.toISOString() : null,
      });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "vaccination_administered",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: eventPayload,
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      // Mark the source reminder (if any) as completed.
      if (sourceReminderId) {
        await tx
          .update(reminders)
          .set({ completedAt: now })
          .where(and(eq(reminders.id, sourceReminderId), eq(reminders.petId, pet.id)));
      }

      // Auto-create a vaccine reminder when next dose is known.
      if (nextDueAt) {
        await tx.insert(reminders).values({
          petId: pet.id,
          userId: user.id,
          reminderType: "vaccine",
          dueAt: nextDueAt,
          title: `Refuerzo: ${vaccineName}`,
          description: `Próxima dosis programada para ${pet.name}.`,
          sourceEventId: event.id,
        });
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la vacuna: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

export async function createWeightAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  const kgRaw = String(formData.get("kg") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!kgRaw) return { error: "Falta el peso." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const kgNum = Number.parseFloat(kgRaw);
  if (!Number.isFinite(kgNum) || kgNum <= 0) return { error: "Peso inválido." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const now = new Date();
  const kgStr = kgNum.toFixed(2);

  try {
    await db.transaction(async (tx) => {
      const eventPayload = validateEventPayload("weight_recorded", { kg: kgStr });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "weight_recorded",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: eventPayload,
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      // Update the denormalized cache so the pet card / detail show the latest
      // weight without re-scanning the event log.
      await tx.update(pets).set({ estimatedWeightKg: kgStr }).where(eq(pets.id, pet.id));
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el peso: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Note (free-form catch-all)
// ---------------------------------------------------------------------------

const NOTE_CATEGORIES = ["comportamiento", "dieta", "grooming", "estado_de_animo", "otro"];

export async function createNoteAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  const text = String(formData.get("text") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();

  if (!text) return { error: "Falta el contenido de la nota." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const category = NOTE_CATEGORIES.includes(categoryRaw) ? categoryRaw : null;

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  try {
    await db.transaction(async (tx) => {
      const eventPayload = validateEventPayload("note_added", { category, text });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "note_added",
          occurredAt,
          recordedAt: new Date(),
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: eventPayload,
          notes: null,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo guardar la nota: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Vet visit
// ---------------------------------------------------------------------------

export async function createVetVisitAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  const reason = String(formData.get("reason") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const diagnosis = String(formData.get("diagnosis") ?? "").trim() || null;
  const vetName = String(formData.get("vetName") ?? "").trim() || null;
  const clinic = String(formData.get("clinic") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!reason) return { error: "Falta el motivo de la visita." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  try {
    await db.transaction(async (tx) => {
      const eventPayload = validateEventPayload("vet_visit_logged", {
        reason,
        diagnosis,
        vet_name: vetName,
        clinic,
      });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "vet_visit_logged",
          occurredAt,
          recordedAt: new Date(),
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: eventPayload,
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la visita: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Status changes (lost / found)
// ---------------------------------------------------------------------------

// Disclosure preference fields parsed from MarkLostForm. All five booleans
// are submitted as "on" / absent (checkbox pattern). The writer also accepts
// a pre-parsed object for tests that bypass FormData.
export type DisclosurePrefsInput = {
  discloseFirstNameWhenLost: boolean;
  disclosePhoneWhenLost: boolean;
  discloseEmailWhenLost: boolean;
  discloseLastLocationWhenLost: boolean;
  allowFinderFormWhenLost: boolean;
};

// Enriched description fields captured at lost-time for unchipped pets.
// These split into two buckets:
//   - Identity fields (color, distinguishingFeatures) → update pets row
//   - Incident snapshot fields (accessories, behavior, last-seen context) →
//     embedded in the status_changed event payload as lost_description
export type EnrichedLostDescriptionInput = {
  // Persistent identity — update pets row
  color: string | null;
  distinguishingFeatures: string | null;
  // Incident snapshot — event payload only
  accessoriesWhenLost: string | null;
  behaviorNotes: string | null;
  lastSeenContext: string | null;
  // Retroactive microchip capture (optional — writes microchip_implanted event
  // + updates pets.microchipId if the pet had no chip before)
  microchipId: string | null;
};

// Inner writer — testable without Next.js runtime or FormData.
//
// Responsibilities:
//   1. Guard status (lost / deceased short-circuits).
//   2. Update the 5 disclosure pref columns on pets (source of truth for
//      the live credential render).
//   3. Insert a status_changed event with disclosure_prefs_snapshot for
//      historical audit.
//   4. (Fase 4) If enriched description provided:
//      a. Persist identity fields (color, distinguishingFeatures) to pets row.
//      b. Embed incident snapshot in the status_changed event payload as
//         lost_description.
//      c. If retroactive microchipId provided and pet had no chip: insert
//         microchip_implanted event + update pets.microchipId.
//   5. (Fase 6) After the transaction commits, fire broadcastLostPet (defensive —
//      failure does NOT block the lost-flip per D8).
//
// Does NOT redirect — callers decide navigation.
export async function setPetLostWriter(params: {
  petId: string;
  // Broadcast fields (Fase 6) — optional so existing callers (tests from
  // earlier fases) don't need updating. When omitted, the broadcast is
  // silently skipped (province/locality will be null).
  petPublicToken?: string;
  petName?: string;
  petStatus: string;
  petMicrochipId?: string | null;
  petSpecies?: string | null;
  petBreed?: string | null;
  petColor?: string | null;
  petJurisdictionProvince?: string | null;
  petJurisdictionLocality?: string | null;
  ownerUserId?: string;
  ownerDisplayName?: string;
  fromStatus: string;
  recordedByUserId: string;
  eventAuthorship: Record<string, unknown>;
  locationDescription: string | null;
  locationLat: string | null;
  locationLng: string | null;
  reason: string | null;
  disclosurePrefs: DisclosurePrefsInput;
  enrichedDescription?: EnrichedLostDescriptionInput | null;
  now?: Date;
}): Promise<EventFormState> {
  const {
    petId,
    petPublicToken = "",
    petName = "",
    petStatus,
    petMicrochipId = null,
    petSpecies = null,
    petBreed = null,
    petColor = null,
    petJurisdictionProvince = null,
    petJurisdictionLocality = null,
    ownerUserId = "",
    ownerDisplayName = "",
    fromStatus,
    recordedByUserId,
    eventAuthorship,
    locationDescription,
    locationLat,
    locationLng,
    reason,
    disclosurePrefs,
    enrichedDescription = null,
    now = new Date(),
  } = params;

  if (petStatus === "lost") return { error: "Esta mascota ya está marcada como perdida." };
  if (petStatus === "deceased")
    return { error: "No se puede cambiar el estado de una mascota fallecida." };

  const {
    discloseFirstNameWhenLost,
    disclosePhoneWhenLost,
    discloseEmailWhenLost,
    discloseLastLocationWhenLost,
    allowFinderFormWhenLost,
  } = disclosurePrefs;

  const disclosurePrefsSnapshot = {
    first_name: discloseFirstNameWhenLost,
    phone: disclosePhoneWhenLost,
    email: discloseEmailWhenLost,
    last_location: discloseLastLocationWhenLost,
    finder_form: allowFinderFormWhenLost,
  };

  const { locationLat: latVal, locationLng: lngVal } = writePoint(
    locationLat && locationLng
      ? { lat: Number.parseFloat(locationLat), lng: Number.parseFloat(locationLng) }
      : null,
  );

  // Build lost_description if at least one incident snapshot field is provided.
  const hasIncidentSnapshot =
    enrichedDescription?.accessoriesWhenLost ||
    enrichedDescription?.behaviorNotes ||
    enrichedDescription?.lastSeenContext;

  const lostDescription = hasIncidentSnapshot
    ? {
        accessories_when_lost: enrichedDescription?.accessoriesWhenLost ?? null,
        behavior_notes: enrichedDescription?.behaviorNotes ?? null,
        last_seen_context: enrichedDescription?.lastSeenContext ?? null,
      }
    : null;

  // Lost & Found Fase 7 — validate retroactive chip format OUTSIDE the
  // transaction so we can return an error before any DB writes.
  const rawRetroChipId = enrichedDescription?.microchipId?.trim() || null;
  let validatedRetroChipId: string | null = null;
  if (rawRetroChipId) {
    const chipValidation = validateMicrochipId(rawRetroChipId);
    if (!chipValidation.ok) {
      return { error: "INVALID_MICROCHIP_FORMAT" };
    }
    validatedRetroChipId = chipValidation.normalized;
  }

  try {
    await db.transaction(async (tx) => {
      const eventPayload = validateEventPayload("status_changed", {
        from_status: fromStatus as "active" | "lost" | "deceased",
        to_status: "lost",
        location_description: locationDescription,
        reason,
        disclosure_prefs_snapshot: disclosurePrefsSnapshot,
        ...(lostDescription !== null ? { lost_description: lostDescription } : {}),
      });

      await tx.insert(petEvents).values({
        petId,
        eventType: "status_changed",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId,
        ...(eventAuthorship as object),
        locationLat: latVal,
        locationLng: lngVal,
        payload: eventPayload,
      });

      // Update status, all 5 disclosure preference columns, and (optionally)
      // identity fields from the enriched section.
      // The prefs columns are the live source of truth for the public
      // credential render — the snapshot above is for audit only.
      await tx
        .update(pets)
        .set({
          status: "lost",
          discloseFirstNameWhenLost,
          disclosePhoneWhenLost,
          discloseEmailWhenLost,
          discloseLastLocationWhenLost,
          allowFinderFormWhenLost,
          // Persist refined identity fields when provided (unchipped flow, §8.2a).
          // A chipped pet that somehow submits these fields also persists them —
          // the UI hides the section but the server is intentionally lenient.
          ...(enrichedDescription?.color != null
            ? { color: enrichedDescription.color || null }
            : {}),
          ...(enrichedDescription?.distinguishingFeatures != null
            ? { distinguishingFeatures: enrichedDescription.distinguishingFeatures || null }
            : {}),
          updatedAt: now,
        })
        .where(eq(pets.id, petId));

      // Retroactive microchip capture — only when:
      //   a. The owner provided a chip number in the enriched section (already
      //      validated and normalized above via validatedRetroChipId).
      //   b. The pet had no chip before (petMicrochipId is null).
      if (validatedRetroChipId && !petMicrochipId) {
        const newChipId = validatedRetroChipId;
        const microchipPayload = validateEventPayload("microchip_implanted", {
          chip_number: newChipId,
          country_code: null,
          implanted_by: null,
          location_on_body: null,
        });

        await tx.insert(petEvents).values({
          petId,
          eventType: "microchip_implanted",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId,
          ...(eventAuthorship as object),
          payload: microchipPayload,
        });

        await tx
          .update(pets)
          .set({ microchipId: newChipId, updatedAt: now })
          .where(eq(pets.id, petId));
      }
    });
  } catch (err) {
    return {
      error: `No se pudo marcar como perdida: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  // Fase 6 — broadcast OUTSIDE the transaction so a failure never rolls back
  // the committed lost-flip (D8). The broadcast is best-effort.
  // Only runs when petPublicToken was provided (full caller context available).
  if (petPublicToken) {
    // Resolve the color to use: enriched description may have refined it.
    const broadcastColor =
      enrichedDescription?.color != null ? enrichedDescription.color || null : petColor;

    try {
      await broadcastLostPet(
        db,
        {
          id: petId,
          publicToken: petPublicToken,
          name: petName,
          species: petSpecies,
          breed: petBreed,
          color: broadcastColor,
          jurisdictionProvince: petJurisdictionProvince,
          jurisdictionLocality: petJurisdictionLocality,
        },
        { id: ownerUserId, displayName: ownerDisplayName },
        null, // lastLocation — province/locality is taken from pet's jurisdiction columns
      );
    } catch (err) {
      console.error("[setPetLost] broadcast failed (non-fatal):", err);
    }
  }

  return { error: null };
}

// Parses disclosure prefs from FormData (checkbox pattern: "on" = true, absent
// = false). Pre-fills from current pet values so that unchecked boxes correctly
// persist false rather than defaulting to true.
function parseDisclosurePrefsFromForm(
  formData: FormData,
  petDefaults: DisclosurePrefsInput,
): DisclosurePrefsInput {
  // Checkboxes only submit when checked. Absent means false.
  const checked = (name: string) => formData.get(name) === "on";

  // If the form section was submitted (any of the 5 keys present), use form
  // values. If none present (old form submission without the section),
  // preserve the pet's current values so we don't accidentally reset them.
  const hasSection = [
    "disclose_first_name_when_lost",
    "disclose_phone_when_lost",
    "disclose_email_when_lost",
    "disclose_last_location_when_lost",
    "allow_finder_form_when_lost",
  ].some((key) => formData.has(key));

  if (!hasSection) return petDefaults;

  return {
    discloseFirstNameWhenLost: checked("disclose_first_name_when_lost"),
    disclosePhoneWhenLost: checked("disclose_phone_when_lost"),
    discloseEmailWhenLost: checked("disclose_email_when_lost"),
    discloseLastLocationWhenLost: checked("disclose_last_location_when_lost"),
    allowFinderFormWhenLost: checked("allow_finder_form_when_lost"),
  };
}

// Parses enriched description fields from FormData (unchipped pet section).
// Returns null if none of the enriched fields are present in the form — this
// allows form submissions that don't include the section (chipped pets, old
// form versions) to pass through without any enrichment.
function parseEnrichedDescriptionFromForm(formData: FormData): EnrichedLostDescriptionInput | null {
  const enrichedKeys = [
    "enriched_color",
    "enriched_distinguishing_features",
    "enriched_accessories_when_lost",
    "enriched_behavior_notes",
    "enriched_last_seen_context",
    "enriched_microchip_id",
  ];

  const hasSection = enrichedKeys.some((k) => formData.has(k));
  if (!hasSection) return null;

  const str = (key: string) => String(formData.get(key) ?? "").trim() || null;

  return {
    color: str("enriched_color"),
    distinguishingFeatures: str("enriched_distinguishing_features"),
    accessoriesWhenLost: str("enriched_accessories_when_lost"),
    behaviorNotes: str("enriched_behavior_notes"),
    lastSeenContext: str("enriched_last_seen_context"),
    microchipId: str("enriched_microchip_id"),
  };
}

export async function setPetLostAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { user, pet, eventAuthorship } = access;

  const locationDescription = String(formData.get("lastKnownLocation") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  // Precise coordinates from the LocationFields map picker. Empty string when
  // the owner didn't drop a pin. writePoint(null) erases both columns.
  const locationLatRaw = String(formData.get("locationLat") ?? "").trim() || null;
  const locationLngRaw = String(formData.get("locationLng") ?? "").trim() || null;

  if (locationLatRaw && locationLngRaw) {
    const lat = Number.parseFloat(locationLatRaw);
    const lng = Number.parseFloat(locationLngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: "Coordenadas inválidas. Tocá el mapa de nuevo para marcar el punto." };
    }
  }

  const petDefaults: DisclosurePrefsInput = {
    discloseFirstNameWhenLost: pet.discloseFirstNameWhenLost,
    disclosePhoneWhenLost: pet.disclosePhoneWhenLost,
    discloseEmailWhenLost: pet.discloseEmailWhenLost,
    discloseLastLocationWhenLost: pet.discloseLastLocationWhenLost,
    allowFinderFormWhenLost: pet.allowFinderFormWhenLost,
  };

  const disclosurePrefs = parseDisclosurePrefsFromForm(formData, petDefaults);
  const enrichedDescription = parseEnrichedDescriptionFromForm(formData);

  const result = await setPetLostWriter({
    petId: pet.id,
    petPublicToken: pet.publicToken,
    petName: pet.name,
    petStatus: pet.status,
    petMicrochipId: pet.microchipId,
    petSpecies: pet.species,
    petBreed: pet.breed,
    petColor: pet.color,
    petJurisdictionProvince: pet.jurisdictionProvince,
    petJurisdictionLocality: pet.jurisdictionLocality,
    ownerUserId: user.id,
    ownerDisplayName: "",
    fromStatus: pet.status,
    recordedByUserId: user.id,
    eventAuthorship: eventAuthorship as Record<string, unknown>,
    locationDescription,
    locationLat: locationLatRaw,
    locationLng: locationLngRaw,
    reason,
    disclosurePrefs,
    enrichedDescription,
  });

  if (result.error) return result;

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Deworming
// ---------------------------------------------------------------------------

export async function createDewormingAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  const product = String(formData.get("product") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const nextDueAtRaw = String(formData.get("nextDueAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!product) return { error: "Falta el nombre del producto." };
  if (!["internal", "external", "both"].includes(type))
    return { error: "Tipo de antiparasitario inválido." };
  if (!occurredAtRaw) return { error: "Falta la fecha de aplicación." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha de aplicación inválida." };

  const nextDueAt = nextDueAtRaw ? parseDateInput(nextDueAtRaw) : null;
  if (nextDueAtRaw && !nextDueAt) return { error: "Fecha de próxima dosis inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const eventPayload = validateEventPayload("deworming_administered", {
        product,
        type,
        next_due_at: nextDueAt ? nextDueAt.toISOString() : null,
      });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "deworming_administered",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: eventPayload,
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      // Auto-create a reminder when next dose is known.
      if (nextDueAt) {
        await tx.insert(reminders).values({
          petId: pet.id,
          userId: user.id,
          reminderType: "deworming",
          dueAt: nextDueAt,
          title: `Refuerzo antiparasitario: ${product}`,
          description: `Próxima dosis programada para ${pet.name}.`,
          sourceEventId: event.id,
        });
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el antiparasitario: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Sterilization
// ---------------------------------------------------------------------------

export async function createSterilizationAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  const procedure = String(formData.get("procedure") ?? "").trim();
  const performedBy = String(formData.get("performedBy") ?? "").trim() || null;
  const clinic = String(formData.get("clinic") ?? "").trim() || null;
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!["castration", "spay"].includes(procedure)) return { error: "Procedimiento inválido." };
  if (!occurredAtRaw) return { error: "Falta la fecha de la cirugía." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  try {
    await db.transaction(async (tx) => {
      const eventPayload = validateEventPayload("sterilization_performed", {
        procedure,
        performed_by: performedBy,
        clinic,
      });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "sterilization_performed",
          occurredAt,
          recordedAt: new Date(),
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: eventPayload,
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la esterilización: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Microchip
// ---------------------------------------------------------------------------

export async function createMicrochipAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  const chipNumber = String(formData.get("chipNumber") ?? "").trim();
  const countryCode = String(formData.get("countryCode") ?? "").trim() || null;
  const implantedBy = String(formData.get("implantedBy") ?? "").trim() || null;
  const locationOnBody = String(formData.get("locationOnBody") ?? "").trim() || null;
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!chipNumber) return { error: "Falta el número de microchip." };
  if (!occurredAtRaw) return { error: "Falta la fecha de implantación." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  try {
    await db.transaction(async (tx) => {
      const eventPayload = validateEventPayload("microchip_implanted", {
        chip_number: chipNumber,
        country_code: countryCode,
        implanted_by: implantedBy,
        location_on_body: locationOnBody,
      });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "microchip_implanted",
          occurredAt,
          recordedAt: new Date(),
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: eventPayload,
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      // Back-fill denormalized microchip columns on the pets row only if they
      // are currently NULL (never overwrite existing data).
      if (!pet.microchipId) {
        await tx
          .update(pets)
          .set({
            microchipId: chipNumber,
            microchipCountryCode: countryCode ?? pet.microchipCountryCode,
            microchipImplantedAt: pet.microchipImplantedAt ?? occurredAt.toISOString().slice(0, 10),
            microchipImplantedBy: pet.microchipImplantedBy ?? implantedBy,
            microchipLocation: pet.microchipLocation ?? locationOnBody,
            updatedAt: new Date(),
          })
          .where(eq(pets.id, pet.id));
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el microchip: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Medication start
// ---------------------------------------------------------------------------

export async function createMedicationStartAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  const drugName = String(formData.get("drugName") ?? "").trim();
  const dose = String(formData.get("dose") ?? "").trim();
  const prescribedBy = String(formData.get("prescribedBy") ?? "").trim() || null;
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!drugName) return { error: "Falta el nombre del medicamento." };
  if (!dose) return { error: "Falta la dosis." };
  if (!occurredAtRaw) return { error: "Falta la fecha de inicio." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha de inicio inválida." };

  // Frequency + schedule fields.
  const frequencyRaw = String(formData.get("frequency") ?? "").trim();
  const customHoursRaw = String(formData.get("customHours") ?? "").trim() || null;
  const durationDaysRaw = String(formData.get("durationDays") ?? "").trim() || null;
  const firstDoseAtRaw = String(formData.get("firstDoseAt") ?? "").trim() || null;

  if (!frequencyRaw) return { error: "Falta la frecuencia." };

  const parsedFreq = parseFrequencyFields(
    frequencyRaw,
    customHoursRaw,
    durationDaysRaw,
    firstDoseAtRaw,
  );
  if (parsedFreq.error !== null) return { error: parsedFreq.error };
  // TypeScript needs the explicit cast here because it can't narrow after the
  // error-field check on a discriminated union without a type predicate.
  const { frequency, customHours, durationDays, firstDoseAt } = parsedFreq as {
    error: null;
    frequency: import("@/lib/drugs").FrequencyKind;
    customHours: number | null;
    durationDays: number | null;
    firstDoseAt: Date;
  };

  const intervalHours = intervalHoursForFrequency(frequency, customHours);
  const schedule = generateDoseSchedule({ firstDoseAt, intervalHours, durationDays });

  // Try to match a catalog drug for richer payload.
  const matchedDrug = findDrugByLabel(drugName);

  const frequencyLabel = (FREQUENCY_LABELS as Record<string, string>)[frequency] ?? frequency;

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const eventPayload = validateEventPayload("medication_started", {
        drug_name: drugName,
        dose,
        frequency,
        prescribed_by: prescribedBy,
        drug_code: matchedDrug?.code ?? null,
        first_dose_at: firstDoseAt.toISOString(),
        duration_days: durationDays,
        custom_hours: frequency === "custom" ? customHours : null,
        schedule_count: schedule.length,
      });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "medication_started",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: eventPayload,
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      // Insert dose reminders if schedule is non-empty.
      if (schedule.length > 0) {
        await tx.insert(reminders).values(
          schedule.map((dueAt) => ({
            petId: pet.id,
            userId: user.id,
            reminderType: "medication" as const,
            dueAt,
            title: `${drugName} – Dosis`,
            description: `${dose}${frequencyLabel ? ` · ${frequencyLabel}` : ""}`,
            sourceEventId: event.id,
          })),
        );
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la medicación: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Medication end
// ---------------------------------------------------------------------------

export async function createMedicationEndAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  const medicationStartedEventId = String(formData.get("medicationStartedEventId") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!medicationStartedEventId) return { error: "Falta seleccionar la medicación." };
  if (!occurredAtRaw) return { error: "Falta la fecha de fin." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha de fin inválida." };

  // Defense in depth: verify the referenced event belongs to this pet and is medication_started.
  const [sourceEvent] = await db
    .select({ id: petEvents.id })
    .from(petEvents)
    .where(
      and(
        eq(petEvents.id, medicationStartedEventId),
        eq(petEvents.petId, pet.id),
        eq(petEvents.eventType, "medication_started"),
      ),
    )
    .limit(1);

  if (!sourceEvent) return { error: "Medicación de origen inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const eventPayload = validateEventPayload("medication_stopped", {
        medication_started_event_id: medicationStartedEventId,
        reason,
      });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "medication_stopped",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: eventPayload,
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      // Cancel future incomplete reminders tied to this medication source event.
      // Past-due-not-marked reminders are left as-is (they stay as a record of
      // missed doses and can still be marked by the owner).
      await tx
        .update(reminders)
        .set({ completedAt: now })
        .where(
          and(
            eq(reminders.sourceEventId, medicationStartedEventId),
            isNull(reminders.completedAt),
            gt(reminders.dueAt, now),
          ),
        );
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el fin de medicación: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Medication dose taken (adherence dual-write)
// ---------------------------------------------------------------------------

// Note: this action does NOT follow the useActionState(_previous, formData) pattern
// because it is invoked from a server-component form (no client-side state). It redirects
// on success and throws on hard errors (same pattern as deleteVaccineReminderAction).
export async function markMedicationDoseTakenAction(formData: FormData): Promise<void> {
  const reminderId = String(formData.get("reminderId") ?? "").trim();
  if (!reminderId) throw new Error("Falta el identificador del recordatorio.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sesión expirada.");

  // Fetch the reminder and verify it belongs to a pet owned by this user.
  const [reminderRow] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, reminderId), eq(reminders.userId, user.id)))
    .limit(1);

  if (!reminderRow) throw new Error("Recordatorio no encontrado o sin permisos.");
  if (reminderRow.reminderType !== "medication") throw new Error("Tipo de recordatorio inválido.");
  if (reminderRow.completedAt) throw new Error("Esta dosis ya fue marcada.");

  // Verify the pet is alive via requireOwnedAndAlive pattern (look up pet directly).
  const [petRow] = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      and(
        eq(pets.id, reminderRow.petId),
        eq(ownerships.ownerUserId, user.id),
        isNull(ownerships.endedAt),
      ),
    )
    .limit(1);

  if (!petRow) throw new Error("Mascota no encontrada o sin permisos.");
  if (petRow.pet.status === "deceased") {
    throw new Error("Esta mascota está registrada como fallecida.");
  }

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      // Mark reminder as completed.
      await tx.update(reminders).set({ completedAt: now }).where(eq(reminders.id, reminderId));

      // Dual-write: insert a medication_dose_taken event for full audit trail.
      const eventPayload = validateEventPayload("medication_dose_taken", {
        medication_started_event_id: reminderRow.sourceEventId ?? null,
        scheduled_for: reminderRow.dueAt.toISOString(),
        reminder_id: reminderId,
      });
      // This action is reminder-keyed (reminders.userId = user.id) rather than
      // pet-keyed, so it stays owner-authored for now. Org-side dose tracking
      // needs a separate reminder-ownership model and lives outside slice 7.
      await tx.insert(petEvents).values({
        petId: reminderRow.petId,
        eventType: "medication_dose_taken",
        occurredAt: now,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "owner",
        payload: eventPayload,
      });
    });
  } catch (err) {
    throw new Error(
      `No se pudo marcar la dosis: ${err instanceof Error ? err.message : "error desconocido"}`,
    );
  }

  // Redirect to the pet's detail page using the pet's publicToken.
  const token = petRow.pet.publicToken;
  redirect(`/mis-mascotas/${token}`);
}

// ---------------------------------------------------------------------------
// Death record
// ---------------------------------------------------------------------------

const DEATH_CAUSES = [
  "known",
  "unknown",
  "natural",
  "disease",
  "accident",
  "euthanasia",
  "sudden",
  "violent",
  "other",
];
const DISPOSITION_METHODS = [
  "cremation_collective",
  "cremation_individual_ashes",
  "authorized_cemetery",
  "owner_burial",
  "household_waste",
  "rendering",
  "unknown",
];
const VET_CONTACT_VALUES = ["yes", "no", "not_applicable"];

export async function createDeathRecordAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  if (pet.status === "deceased")
    return { error: "Esta mascota ya está registrada como fallecida." };

  const cause = String(formData.get("cause") ?? "").trim();
  const causeDetail = String(formData.get("causeDetail") ?? "").trim() || null;
  const confirmedByVet = formData.get("confirmedByVet") === "true";
  const vetName = String(formData.get("vetName") ?? "").trim() || null;
  const dispositionMethodRaw = String(formData.get("dispositionMethod") ?? "").trim();
  const facility = String(formData.get("facility") ?? "").trim() || null;
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const deathAtClinic = formData.get("deathAtClinic") === "true";
  const clinicName = String(formData.get("clinicName") ?? "").trim() || null;
  const vetContactedOwnerRaw = String(formData.get("vetContactedOwner") ?? "").trim();
  const vetDecidedAlone = formData.get("vetDecidedAlone") === "true";
  const ownerToPrivateCrematorium = formData.get("ownerToPrivateCrematorium") === "true";

  if (!DEATH_CAUSES.includes(cause)) return { error: "Causa de fallecimiento inválida." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const dispositionMethod = dispositionMethodRaw === "" ? null : dispositionMethodRaw;
  if (dispositionMethod !== null && !DISPOSITION_METHODS.includes(dispositionMethod)) {
    return { error: "Método de disposición inválido." };
  }

  const vetContactedOwner = vetContactedOwnerRaw === "" ? null : vetContactedOwnerRaw;
  if (vetContactedOwner !== null && !VET_CONTACT_VALUES.includes(vetContactedOwner)) {
    return { error: "Valor de contacto del veterinario inválido." };
  }

  if (clinicName && !deathAtClinic) {
    return {
      error: "Indicaste un nombre de clínica pero no marcaste que falleció en una veterinaria.",
    };
  }
  if (vetContactedOwner && !deathAtClinic) {
    return { error: "El contacto del veterinario solo aplica si falleció en una veterinaria." };
  }
  if (vetDecidedAlone && vetContactedOwner !== "no") {
    return {
      error:
        "Solo se puede marcar 'vet decidió sin contacto' cuando el veterinario no logró contactar al propietario.",
    };
  }

  const diseaseCodeRaw = String(formData.get("diseaseCode") ?? "").trim() || null;
  const confirmedByLab = formData.get("confirmedByLab") === "true";

  // Disease fields only valid when cause is "disease". Strip otherwise.
  const diseaseCode = cause === "disease" && diseaseCodeRaw ? diseaseCodeRaw : null;
  if (diseaseCode && !findDisease(diseaseCode)) {
    return { error: "Enfermedad no reconocida." };
  }
  const reportable = isReportable(diseaseCode);

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const now = new Date();
  let insertedEvent: { id: string } | null = null;
  // Captured inside the tx so the post-tx authority escalation knows whether
  // a rabies observation was auto-closed by this death.
  let rabiesObservationClosed = false;

  try {
    await db.transaction(async (tx) => {
      // Detect active rabies observation BEFORE inserting the death event so
      // we can carry the during_rabies_observation flag into the payload.
      const wasInObservation = pet.rabiesObservationStatus === "in_progress";

      const eventPayload = validateEventPayload("death_recorded", {
        cause,
        cause_detail: causeDetail,
        confirmed_by_vet: confirmedByVet || null,
        vet_name: vetName,
        disposition_method: dispositionMethod,
        facility,
        // Vet-mediated branch (owner-as-proxy in v1; promotable to authorRole='vet' when portal lands)
        death_at_clinic: deathAtClinic || null,
        clinic_name: clinicName,
        vet_contacted_owner: vetContactedOwner,
        vet_decided_alone: vetDecidedAlone || null,
        owner_to_private_crematorium: ownerToPrivateCrematorium || null,
        // Disease enrichment (only when cause === "disease")
        disease_code: diseaseCode,
        confirmed_by_lab: diseaseCode ? confirmedByLab : null,
        is_reportable: reportable,
        ...(wasInObservation ? { during_rabies_observation: true } : {}),
      });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "death_recorded",
          occurredAt,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: eventPayload,
          notes,
        })
        .returning();

      insertedEvent = event;

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      await tx
        .update(pets)
        .set({ status: "deceased", deceasedAt: occurredAt, updatedAt: now })
        .where(eq(pets.id, pet.id));

      // Auto-close any active foster row on this pet (spec foster-volunteers-pool
      // v1.4 §6.9 case C). The foster_ended event references the death event so
      // the libreta surfaces both as one block. Notification language for the
      // foster intentionally non-judgmental: empathy first.
      const activeFosters = await tx
        .select({ id: ownerships.id, ownerUserId: ownerships.ownerUserId })
        .from(ownerships)
        .where(
          and(
            eq(ownerships.petId, pet.id),
            eq(ownerships.role, "foster"),
            isNull(ownerships.endedAt),
          ),
        );
      for (const f of activeFosters) {
        if (!f.ownerUserId) continue;
        await tx.update(ownerships).set({ endedAt: now }).where(eq(ownerships.id, f.id));
        const endedPayload = validateEventPayload("foster_ended", {
          foster_user_id: f.ownerUserId,
          reason: "pet_died",
          death_event_id: event.id,
        });
        await tx.insert(petEvents).values({
          petId: pet.id,
          eventType: "foster_ended",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: eventAuthorship.authorRole,
          authorOrganizationId: eventAuthorship.authorOrganizationId,
          authorVerified: eventAuthorship.authorVerified,
          payload: endedPayload,
        });
        await tx.insert(notifications).values({
          userId: f.ownerUserId,
          notificationType: "foster_ended_by_death",
          severity: "info",
          title: `${pet.name} falleció`,
          body: `Lamentamos avisarte que ${pet.name} falleció. Gracias por el tiempo que le diste como tránsito.`,
          relatedPetId: pet.id,
          relatedEventId: event.id,
        });
      }

      // Death-during-observation hook (bite-rabies-observation spec D9).
      // When the pet was in active 10-day rabies observation at time of death,
      // atomically close the observation with outcome='dead' and flip status.
      // Authority notification is best-effort post-tx — the auto-close itself
      // is part of the atomic death transaction.
      if (wasInObservation) {
        const [startedEvent] = await tx
          .select()
          .from(petEvents)
          .where(
            and(eq(petEvents.petId, pet.id), eq(petEvents.eventType, "rabies_observation_started")),
          )
          .orderBy(desc(petEvents.occurredAt))
          .limit(1);
        if (startedEvent) {
          const startedPayload = startedEvent.payload as Record<string, unknown>;
          const endedPayload = validateEventPayload("rabies_observation_ended", {
            bite_event_id: startedPayload.bite_event_id as string,
            observation_started_event_id: startedEvent.id,
            outcome: "dead",
            closed_by_role: "system",
            closure_notes: "Cierre automático por fallecimiento durante observación",
            death_event_id: event.id,
          });
          await tx.insert(petEvents).values({
            petId: pet.id,
            eventType: "rabies_observation_ended",
            occurredAt: now,
            recordedAt: now,
            recordedByUserId: null,
            authorRole: "system",
            authorOrganizationId: null,
            authorVerified: false,
            payload: endedPayload,
          });
          await tx
            .update(pets)
            .set({ rabiesObservationStatus: "completed_dead", updatedAt: now })
            .where(eq(pets.id, pet.id));
          rabiesObservationClosed = true;
        }
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el fallecimiento: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  if (reportable && diseaseCode && insertedEvent) {
    await signalAuthorityReport({
      eventId: (insertedEvent as { id: string }).id,
      petId: pet.id,
      diseaseCode,
      confirmedByLab,
      occurredAt,
      jurisdictionProvince: pet.jurisdictionProvince ?? null,
      jurisdictionLocality: pet.jurisdictionLocality ?? null,
    });
  }

  // Best-effort urgent escalation when this death closed an active rabies
  // observation. Public-health critical regardless of declared cause — the
  // overlap with a bite window is the signal that needs immediate review.
  if (rabiesObservationClosed && insertedEvent) {
    try {
      if (pet.jurisdictionProvince && pet.jurisdictionLocality) {
        const authorityIds = await findAuthoritiesForJurisdiction({
          province: pet.jurisdictionProvince,
          locality: pet.jurisdictionLocality,
        });
        if (authorityIds.length > 0) {
          await db.insert(notifications).values(
            authorityIds.map((authorityId) => ({
              userId: authorityId,
              notificationType: "rabies_observation_completed_dead_authority",
              severity: "urgent" as const,
              title: `URGENTE — fallecimiento durante observación antirrábica (${pet.name})`,
              body: `La mascota falleció dentro del período de 10 días de observación post-mordedura. Causa declarada: ${cause}. Requiere revisión inmediata por riesgo de rabia.`,
              relatedPetId: pet.id,
              relatedEventId: (insertedEvent as { id: string }).id,
            })),
          );
        }
      }
    } catch (err) {
      console.error("[death] rabies-observation authority escalation failed:", err);
    }
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Clinical info (unified: lab, imaging, surgery, allergy detection)
// ---------------------------------------------------------------------------

const CLINICAL_SUB_KINDS = [
  "lab_work",
  "imaging",
  "surgery",
  "allergy_detection",
  "other",
] as const;
type ClinicalSubKind = (typeof CLINICAL_SUB_KINDS)[number];

export async function createClinicalInfoAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  const subKindRaw = String(formData.get("subKind") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim() || null;
  const performedBy = String(formData.get("performedBy") ?? "").trim() || null;
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!(CLINICAL_SUB_KINDS as readonly string[]).includes(subKindRaw)) {
    return { error: "Tipo de información clínica inválido." };
  }
  const subKind = subKindRaw as ClinicalSubKind;
  if (!title) return { error: "Falta el título / nombre del estudio o procedimiento." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  try {
    await db.transaction(async (tx) => {
      const eventPayload = validateEventPayload("clinical_info_logged", {
        sub_kind: subKind,
        title,
        details,
        performed_by: performedBy,
      });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "clinical_info_logged",
          occurredAt,
          recordedAt: new Date(),
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: eventPayload,
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo guardar la información clínica: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Dangerous-breed attestation (Ley CABA 4078 / Ley Prov 14.107)
// ---------------------------------------------------------------------------

const DANGEROUS_BREED_REGISTRIES = ["caba_4078", "prov_14107", "other"] as const;

export async function createDangerousBreedAttestationAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  const registry = String(formData.get("registry") ?? "").trim();
  const registryId = String(formData.get("registryId") ?? "").trim() || null;
  const attestedAtRaw = String(formData.get("attestedAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!(DANGEROUS_BREED_REGISTRIES as readonly string[]).includes(registry)) {
    return { error: "Registro inválido. Elegí uno de los disponibles." };
  }
  if (!attestedAtRaw) return { error: "Falta la fecha de atestación." };
  const attestedAt = parseDateInput(attestedAtRaw);
  if (!attestedAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      // Single insert — payload is final. attached_documents is intentionally
      // NOT stored in the payload: the attachments table already provides the
      // join via event_id, matching the pattern used by sterilization /
      // microchip / vaccination actions, and preserving the append-only
      // discipline on pet_events (AGENTS.md → Core principles #2).
      const eventPayload = validateEventPayload("dangerous_breed_attested", {
        registry,
        registry_id: registryId,
        attested_at: attestedAt.toISOString().slice(0, 10),
      });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "dangerous_breed_attested",
          occurredAt: attestedAt,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: eventPayload,
          notes,
        })
        .returning();

      if (upload.uploadedPath) {
        await tx.insert(attachments).values({
          petId: pet.id,
          eventId: event.id,
          uploadedByUserId: user.id,
          storagePath: upload.uploadedPath,
          mimeType: upload.mimeType ?? "image/jpeg",
          fileSize: upload.size ?? 0,
        });
      }

      // Mark any unread ppp_registration_reminder for this pet as read — the
      // owner just acted on it. Mirrors the spec: "the notification (if unread)
      // is auto-marked-read".
      await tx
        .update(notifications)
        .set({ readAt: now })
        .where(
          and(
            eq(notifications.userId, user.id),
            eq(notifications.relatedPetId, pet.id),
            eq(notifications.notificationType, "ppp_registration_reminder"),
            isNull(notifications.readAt),
          ),
        );
    });
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la atestación: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Status: found
// ---------------------------------------------------------------------------

export async function setPetFoundAction(publicToken: string): Promise<void> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) throw new Error(access.error);
  const { user, pet, eventAuthorship } = access;
  if (pet.status === "deceased") {
    throw new Error("Esta mascota está registrada como fallecida y no acepta nuevos eventos.");
  }
  if (pet.status !== "lost") {
    // Idempotent — just redirect.
    redirect(`/mis-mascotas/${publicToken}`);
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    const eventPayload = validateEventPayload("status_changed", {
      from_status: "lost",
      to_status: "active",
    });
    await tx.insert(petEvents).values({
      petId: pet.id,
      eventType: "status_changed",
      occurredAt: now,
      recordedAt: now,
      recordedByUserId: user.id,
      ...eventAuthorship,
      payload: eventPayload,
    });
    await tx.update(pets).set({ status: "active", updatedAt: now }).where(eq(pets.id, pet.id));
  });

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Symptom observation — surveillance pipeline (Fase 3-4)
// ---------------------------------------------------------------------------

export type SymptomFormState = {
  error: string | null;
  ok?: boolean;
};

/**
 * Register a symptom observed by the owner. Runs the fuzzy matcher in-transaction;
 * emits outbreak_signal events and authority notifications for each alertable
 * reportable disease detected.
 *
 * The matcher is wrapped in try/catch — a matcher failure does NOT block the
 * symptom_observed insert. The owner's data is always preserved (spec D7).
 */
export async function createSymptomObservedAction(
  publicToken: string,
  _previous: SymptomFormState,
  formData: FormData,
): Promise<SymptomFormState> {
  // 1. Auth + pet ownership (alive pets only).
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { pet, user, eventAuthorship } = access;

  // 2. Parse form.
  const freeText = String(formData.get("freeText") ?? "").trim();
  if (!freeText) return { error: "Tenés que describir los síntomas." };

  const severityRaw = String(formData.get("severity") ?? "").trim();
  const severity: "mild" | "moderate" | "severe" | null =
    severityRaw === "mild" || severityRaw === "moderate" || severityRaw === "severe"
      ? severityRaw
      : null;

  const onsetRaw = String(formData.get("onsetAt") ?? "").trim();
  const onsetAt = onsetRaw.length > 0 ? onsetRaw : null;

  // 3. Run matcher (defensive — matcher failure must never block the insert).
  let alertableDiseases: import("@/lib/symptom-matcher").DiseaseMatch[] = [];
  let matchedSymptomCodes: string[] = [];
  try {
    const { matchSymptoms, aggregateDiseaseMatches } = await import("@/lib/symptom-matcher");
    const matched = matchSymptoms(freeText, pet.species);
    matchedSymptomCodes = matched.map((m) => m.symptom_code);
    const aggregated = aggregateDiseaseMatches(matched);
    alertableDiseases = aggregated.filter((d) => d.triggers_alert && d.is_reportable);
  } catch (err) {
    console.error("Symptom matcher failed:", err);
    alertableDiseases = [];
    matchedSymptomCodes = [];
  }

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      // 4. Insert symptom_observed event.
      const symptomPayload = validateEventPayload("symptom_observed", {
        source: "libreta" as const,
        welfare_report_id: null,
        reporter_role: "owner" as const,
        free_text: freeText,
        matched_symptom_codes: matchedSymptomCodes,
        alerted_disease_codes: alertableDiseases.map((d) => d.disease_code),
        severity_self_assessed: severity,
        onset_at: onsetAt,
      });

      const [symptomEvent] = await tx
        .insert(petEvents)
        .values({
          petId: pet.id,
          eventType: "symptom_observed",
          occurredAt: onsetAt ? new Date(onsetAt) : now,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: symptomPayload,
        })
        .returning();

      // 5. For each alertable reportable disease: emit outbreak_signal + Notification.
      // If the pet is in an active rabies observation AND the matcher returned
      // rabies_suspected with high-specificity matches, escalate: bump severity
      // to 'urgent' on the authority signal and send the owner an extra urgent
      // notification (explicit exception to surveillance D1, justified by the
      // concrete public-health risk — see bite-rabies-observation spec D5).
      const rabiesObservationActive = pet.rabiesObservationStatus === "in_progress";

      for (const d of alertableDiseases) {
        const isRabiesEscalation =
          rabiesObservationActive && d.disease_code === "rabies_suspected" && d.high_count >= 1;

        const signalPayload = validateEventPayload("outbreak_signal", {
          source_symptom_event_id: symptomEvent.id,
          disease_code: d.disease_code,
          disease_label: d.disease_label,
          match_strength: {
            high_count: d.high_count,
            medium_count: d.medium_count,
            low_count: d.low_count,
            matched_symptom_codes: d.matched_symptoms,
          },
          pet_jurisdiction_country: pet.jurisdictionCountry,
          pet_jurisdiction_province: pet.jurisdictionProvince ?? null,
          pet_jurisdiction_locality: pet.jurisdictionLocality ?? null,
          pet_species: pet.species,
          ...(isRabiesEscalation ? { bite_observation_active: true } : {}),
        });

        const [signalEvent] = await tx
          .insert(petEvents)
          .values({
            petId: pet.id,
            eventType: "outbreak_signal",
            occurredAt: now,
            recordedAt: now,
            recordedByUserId: null,
            authorRole: "system",
            authorOrganizationId: null,
            authorVerified: false,
            payload: signalPayload,
          })
          .returning();

        // 6. Route notification to authority targets — severity bumped to
        // 'urgent' when this signal is an active-observation rabies escalation.
        await routeOutbreakSignalNotification(tx, {
          signalEvent,
          pet,
          disease: d,
          escalation: isRabiesEscalation,
        });

        // 7. Owner-side urgent nudge during an active rabies observation. Spec
        // D5: explicit exception to "owner sees no diagnoses" — the bite
        // window + PEP timing make this a legitimate public-health prompt.
        if (isRabiesEscalation) {
          await tx.insert(notifications).values({
            userId: user.id,
            notificationType: "rabies_observation_escalation_owner",
            severity: "urgent",
            title: `URGENTE — posible signo de rabia en ${pet.name}`,
            body: "Durante el período de observación antirrábica, registraste síntomas compatibles con rabia. CONSULTÁ AL VETERINARIO INMEDIATAMENTE. Si no podés, andá al dispensario antirrábico más cercano o llamá al 107.",
            relatedPetId: pet.id,
            relatedEventId: signalEvent.id,
            ctaLabel: "Ver mascota",
            ctaUrl: `/mis-mascotas/${pet.publicToken}`,
          });
        }
      }
    });
  } catch (err) {
    console.error("createSymptomObservedAction failed:", err);
    return {
      error: `No se pudo registrar el síntoma: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  revalidatePath(`/mis-mascotas/${publicToken}`);
  redirect(`/mis-mascotas/${publicToken}?evento=sintoma_registrado`);
}

// ---------------------------------------------------------------------------
// Outbreak-signal notification routing (Fase 4)
// ---------------------------------------------------------------------------

/**
 * Route a notification for each outbreak_signal event to authority targets.
 *
 * v2: Uses findAuthoritiesForJurisdiction — routes to govts in scope first,
 * falls back to active institutional admins when no govt covers the locality.
 * CTA is per-recipient: govt → /gob/cola, admin → /admin/cola.
 */
async function routeOutbreakSignalNotification(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  args: {
    signalEvent: typeof petEvents.$inferSelect;
    pet: typeof pets.$inferSelect;
    disease: {
      disease_code: string;
      disease_label: string;
      high_count: number;
      medium_count: number;
    };
    // When true (rabies escalation during an active 10-day observation),
    // the authority notification fires at severity='urgent' with a banner
    // line marking the overlap.
    escalation?: boolean;
  },
): Promise<void> {
  const { signalEvent, pet, disease, escalation } = args;

  const province = pet.jurisdictionProvince ?? "";
  const locality = pet.jurisdictionLocality ?? "";

  // findAuthoritiesForJurisdiction uses db (not tx) for reads — acceptable for
  // read-only scope resolution inside a write transaction.
  const authorityIds = await findAuthoritiesForJurisdiction({ province, locality });

  if (authorityIds.length === 0) {
    console.warn(
      `No authorities to route outbreak_signal ${signalEvent.id} (disease=${disease.disease_code}, jurisdiction=${locality}/${province}). Signal recorded but no notification sent.`,
    );
    return;
  }

  // Load roles in one batch so we can build per-recipient CTA URLs.
  const authorityProfiles = await tx
    .select({ id: profiles.id, role: profiles.role })
    .from(profiles)
    .where(inArray(profiles.id, authorityIds));

  const localityPart = pet.jurisdictionLocality ? ` en ${pet.jurisdictionLocality}` : "";
  const titlePrefix = escalation ? "URGENTE — " : "Signal: ";
  const title = `${titlePrefix}posible ${disease.disease_label}${localityPart}`;
  const bodyLines = [
    `**Signal automático.** Síntomas auto-reportados por dueño matchearon con la enfermedad reportable **${disease.disease_label}**.`,
    "",
  ];
  if (escalation) {
    bodyLines.push(
      "**Observación antirrábica activa.** Esta señal ocurre dentro del período de 10 días de observación post-mordedura. Coordinar inspección inmediata.",
      "",
    );
  }
  bodyLines.push(
    `- Especie: ${pet.species}`,
    `- Jurisdicción: ${[pet.jurisdictionLocality, pet.jurisdictionProvince].filter(Boolean).join(", ") || "no especificada"}`,
    `- Match strength: ${disease.high_count} high · ${disease.medium_count} medium`,
    "",
    "_No es diagnóstico. Considerá el contexto: cuántos signals similares en la jurisdicción / período._",
  );
  const body = bodyLines.join("\n");
  const severity = escalation ? ("urgent" as const) : ("warning" as const);

  for (const authority of authorityProfiles) {
    const ctaUrl = authority.role === "govt" ? "/gob/cola" : "/admin/cola";
    await tx.insert(notifications).values({
      userId: authority.id,
      notificationType: "outbreak_signal_detected",
      title,
      body,
      severity,
      relatedPetId: pet.id,
      relatedEventId: signalEvent.id,
      ctaLabel: "Ver señales",
      ctaUrl,
    });
  }
}

// ---------------------------------------------------------------------------
// createSymptomObservedWriter — exported for integration tests
// ---------------------------------------------------------------------------

export type SymptomObservedWriterParams = {
  petId: string;
  petPublicToken: string;
  petSpecies: string;
  petJurisdictionCountry: string;
  petJurisdictionProvince: string | null;
  petJurisdictionLocality: string | null;
  recordedByUserId: string;
  eventAuthorship: import("@/lib/pet-access").PetEventAuthorship;
  freeText: string;
  severity: "mild" | "moderate" | "severe" | null;
  onsetAt: string | null;
  now?: Date;
};

/**
 * The core write path for symptom observation, exported so integration tests
 * can call it without the Next.js request context imposed by
 * requireAlivePetAccess / createClient. Same logic as createSymptomObservedAction
 * minus the auth layer.
 */
export async function createSymptomObservedWriter(
  params: SymptomObservedWriterParams,
): Promise<
  { ok: true; symptomEventId: string; signalEventIds: string[] } | { ok: false; error: string }
> {
  const {
    petId,
    petSpecies,
    petJurisdictionCountry,
    petJurisdictionProvince,
    petJurisdictionLocality,
    recordedByUserId,
    eventAuthorship,
    freeText,
    severity,
    onsetAt,
    now = new Date(),
  } = params;

  // Run matcher (defensive — failure must never block the insert).
  let alertableDiseases: import("@/lib/symptom-matcher").DiseaseMatch[] = [];
  let matchedSymptomCodes: string[] = [];
  try {
    const { matchSymptoms, aggregateDiseaseMatches } = await import("@/lib/symptom-matcher");
    const matched = matchSymptoms(freeText, petSpecies);
    matchedSymptomCodes = matched.map((m) => m.symptom_code);
    const aggregated = aggregateDiseaseMatches(matched);
    alertableDiseases = aggregated.filter((d) => d.triggers_alert && d.is_reportable);
  } catch (err) {
    console.error("Symptom matcher failed in writer:", err);
    alertableDiseases = [];
    matchedSymptomCodes = [];
  }

  let symptomEventId = "";
  const signalEventIds: string[] = [];

  try {
    await db.transaction(async (tx) => {
      const symptomPayload = validateEventPayload("symptom_observed", {
        source: "libreta" as const,
        welfare_report_id: null,
        reporter_role: "owner" as const,
        free_text: freeText,
        matched_symptom_codes: matchedSymptomCodes,
        alerted_disease_codes: alertableDiseases.map((d) => d.disease_code),
        severity_self_assessed: severity,
        onset_at: onsetAt,
      });

      const [symptomEvent] = await tx
        .insert(petEvents)
        .values({
          petId,
          eventType: "symptom_observed",
          occurredAt: onsetAt ? new Date(onsetAt) : now,
          recordedAt: now,
          recordedByUserId,
          ...eventAuthorship,
          payload: symptomPayload,
        })
        .returning();

      symptomEventId = symptomEvent.id;

      for (const d of alertableDiseases) {
        const signalPayload = validateEventPayload("outbreak_signal", {
          source_symptom_event_id: symptomEvent.id,
          disease_code: d.disease_code,
          disease_label: d.disease_label,
          match_strength: {
            high_count: d.high_count,
            medium_count: d.medium_count,
            low_count: d.low_count,
            matched_symptom_codes: d.matched_symptoms,
          },
          pet_jurisdiction_country: petJurisdictionCountry,
          pet_jurisdiction_province: petJurisdictionProvince,
          pet_jurisdiction_locality: petJurisdictionLocality,
          pet_species: petSpecies,
        });

        const [signalEvent] = await tx
          .insert(petEvents)
          .values({
            petId,
            eventType: "outbreak_signal",
            occurredAt: now,
            recordedAt: now,
            recordedByUserId: null,
            authorRole: "system",
            authorOrganizationId: null,
            authorVerified: false,
            payload: signalPayload,
          })
          .returning();

        signalEventIds.push(signalEvent.id);

        // Route notifications (same logic as the server action).
        const pet = {
          id: petId,
          jurisdictionCountry: petJurisdictionCountry,
          jurisdictionProvince: petJurisdictionProvince,
          jurisdictionLocality: petJurisdictionLocality,
          species: petSpecies,
        } as typeof petEvents.$inferSelect & typeof pets.$inferSelect;

        // biome-ignore lint/suspicious/noExplicitAny: composite row shape from manual select narrows below routeOutbreakSignalNotification expectations.
        await routeOutbreakSignalNotification(tx, { signalEvent, pet: pet as any, disease: d });
      }
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
  }

  return { ok: true, symptomEventId, signalEventIds };
}
