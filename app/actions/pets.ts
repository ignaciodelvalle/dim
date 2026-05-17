"use server";

// Pet-related server actions.
//
// createPetAction is the first place in the app where we write to our
// event-sourced data model. In a single transaction we insert a pet, an
// ownership, the photo attachment (if any), the pet_registered event, AND
// (if the owner provided a microchip number) a microchip_implanted event.
// PPP breeds also generate a notification for the owner.
//
// updatePetAction performs an edit: it computes a diff between the existing
// pet and the submitted values, updates the row, and emits a single
// pet_profile_updated event with the bundled diff. Adding a chip that wasn't
// there also emits a microchip_implanted event.
//
// Lost & Found Fase 2: createPetAction also performs a microchip cross-check
// when acquisitionMethod='found_stray' AND microchipId is set. Same three-status
// branching as createIntakeAction. Match confirmation goes to
// /mis-mascotas/nueva/match/{matchedPetToken}.

import { type Pet, attachments, db, notifications, ownerships, petEvents, pets } from "@/db";
import { provinceByCode } from "@/lib/ar-provincias";
import { isPotentiallyDangerousBreed } from "@/lib/breeds";
import { lookupByChip } from "@/lib/chip-lookup";
import { validateEventPayload } from "@/lib/event-schemas";
import { parseDateInput } from "@/lib/format";
import { generateForceToken, validateForceToken } from "@/lib/microchip-force-token";
import { requirePetAccess } from "@/lib/pet-access";
import { generatePublicToken } from "@/lib/publicToken";
import { createClient } from "@/lib/supabase/server";
import { uploadAttachmentIfPresent } from "@/lib/uploads";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

export type NewPetFormState = {
  error: string | null;
  // Present when a chip cross-check found an active match (WARN state).
  // Only relevant for acquisitionMethod='found_stray'. The UI should show the
  // conflict and offer "continue anyway" backed by forceToken.
  warning?: "CHIP_MATCH_ACTIVE";
  matchedPetToken?: string;
  forceToken?: string;
};

// ---------------------------------------------------------------------------
// Shared form parsing — used by both create and update.
// ---------------------------------------------------------------------------

type AcquisitionMethod =
  | "adopted"
  | "purchased"
  | "found_stray"
  | "gift"
  | "born_in_litter"
  | "other";

const ACQUISITION_METHODS: readonly AcquisitionMethod[] = [
  "adopted",
  "purchased",
  "found_stray",
  "gift",
  "born_in_litter",
  "other",
];

type ParsedPet = {
  name: string;
  species: string;
  sex: "male" | "female" | "unknown";
  breed: string | null;
  dateOfBirth: string | null;
  birthDateIsEstimated: boolean;
  color: string | null;
  microchipId: string | null;
  microchipCountryCode: string | null;
  microchipImplantedAt: string | null;
  microchipImplantedBy: string | null;
  microchipLocation: string | null;
  estimatedWeightKg: string | null;
  favouriteFoods: string[];
  knownAllergies: string[];
  trainingLevel: "none" | "basic" | "intermediate" | "advanced" | "professional" | null;
  insuranceCompany: string | null;
  insurancePolicyNumber: string | null;
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  potentiallyDangerousBreed: boolean;
  acquisitionMethod: AcquisitionMethod | null;
  emergencyInfoVisible: boolean;
  // "owner" by default. "foster_in_transit" is the vecino-helps-stray case
  // (AGENTS.md → Organizations): the user is caretaking, not claiming
  // ownership. Drives ownerships.role at insert and gets recorded in the
  // pet_registered payload so future projections don't have to join ownerships.
  // Edits do NOT change this — changing custody is a separate flow.
  custodyKind: "owner" | "foster_in_transit";
};

function parsePetForm(formData: FormData): { parsed: ParsedPet; error: string | null } {
  const name = String(formData.get("name") ?? "").trim();
  const species = String(formData.get("species") ?? "").trim();
  if (!name) return { parsed: null as never, error: "Falta el nombre." };
  if (!species) return { parsed: null as never, error: "Falta la especie." };

  const sexRaw = String(formData.get("sex") ?? "unknown");
  const sex: "male" | "female" | "unknown" =
    sexRaw === "male" || sexRaw === "female" ? sexRaw : "unknown";

  const ageYearsRaw = String(formData.get("ageYears") ?? "").trim();
  const ageMonthsRaw = String(formData.get("ageMonths") ?? "").trim();
  const ageYears = ageYearsRaw ? Math.max(0, Number.parseInt(ageYearsRaw, 10) || 0) : null;
  const ageMonths = ageMonthsRaw ? Math.max(0, Number.parseInt(ageMonthsRaw, 10) || 0) : null;
  let dateOfBirth: string | null = null;
  let birthDateIsEstimated = false;
  if (ageYears !== null || ageMonths !== null) {
    const totalMonths = (ageYears ?? 0) * 12 + (ageMonths ?? 0);
    const dob = new Date();
    dob.setMonth(dob.getMonth() - totalMonths);
    dateOfBirth = dob.toISOString().slice(0, 10);
    birthDateIsEstimated = true;
  }

  const breed = String(formData.get("breed") ?? "").trim() || null;

  const microchipId = String(formData.get("microchipId") ?? "").trim() || null;

  const favouriteFoodsList = (formData.getAll("favouriteFoods") as string[])
    .map((s) => s.trim())
    .filter(Boolean);
  const favouriteFoodsOther = String(formData.get("favouriteFoodsOther") ?? "").trim();
  const favouriteFoods = [
    ...favouriteFoodsList,
    ...favouriteFoodsOther
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ];

  const knownAllergiesList = (formData.getAll("knownAllergies") as string[])
    .map((s) => s.trim())
    .filter(Boolean);
  const knownAllergiesOther = String(formData.get("knownAllergiesOther") ?? "").trim();
  const knownAllergies = [
    ...knownAllergiesList,
    ...knownAllergiesOther
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ];

  const trainingLevelRaw = String(formData.get("trainingLevel") ?? "").trim();
  const trainingLevel = ["none", "basic", "intermediate", "advanced", "professional"].includes(
    trainingLevelRaw,
  )
    ? (trainingLevelRaw as "none" | "basic" | "intermediate" | "advanced" | "professional")
    : null;

  const acquisitionMethodRaw = String(formData.get("acquisitionMethod") ?? "").trim();
  const acquisitionMethod = (ACQUISITION_METHODS as readonly string[]).includes(
    acquisitionMethodRaw,
  )
    ? (acquisitionMethodRaw as AcquisitionMethod)
    : null;

  const custodyKindRaw = String(formData.get("custodyKind") ?? "owner").trim();
  const custodyKind: "owner" | "foster_in_transit" =
    custodyKindRaw === "foster_in_transit" ? "foster_in_transit" : "owner";

  return {
    parsed: {
      name,
      species,
      sex,
      breed,
      dateOfBirth,
      birthDateIsEstimated,
      color: String(formData.get("color") ?? "").trim() || null,
      microchipId,
      microchipCountryCode: microchipId
        ? String(formData.get("microchipCountryCode") ?? "").trim() || null
        : null,
      microchipImplantedAt: microchipId
        ? String(formData.get("microchipImplantedAt") ?? "").trim() || null
        : null,
      microchipImplantedBy: microchipId
        ? String(formData.get("microchipImplantedBy") ?? "").trim() || null
        : null,
      microchipLocation: microchipId
        ? String(formData.get("microchipLocation") ?? "").trim() || null
        : null,
      estimatedWeightKg: String(formData.get("estimatedWeightKg") ?? "").trim() || null,
      favouriteFoods,
      knownAllergies,
      trainingLevel,
      insuranceCompany: String(formData.get("insuranceCompany") ?? "").trim() || null,
      insurancePolicyNumber: String(formData.get("insurancePolicyNumber") ?? "").trim() || null,
      // The shared LocationFields component submits the ISO 3166-2:AR code.
      // Resolve it to the display name for storage — the column still holds
      // free text until the canonical-codes migration lands (deferred until
      // gov dashboards need k-anonymity-safe rollups).
      jurisdictionProvince:
        provinceByCode(String(formData.get("provinceCode") ?? "").trim())?.name ?? null,
      jurisdictionLocality: String(formData.get("localityName") ?? "").trim() || null,
      potentiallyDangerousBreed: isPotentiallyDangerousBreed(species, breed),
      acquisitionMethod,
      emergencyInfoVisible: formData.get("emergencyInfoVisible") === "true",
      custodyKind,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// CREATE
// ---------------------------------------------------------------------------

export async function createPetAction(
  _previous: NewPetFormState,
  formData: FormData,
): Promise<NewPetFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada. Iniciá sesión de nuevo." };

  const { parsed, error: parseError } = parsePetForm(formData);
  if (parseError) return { error: parseError };

  // Lost & Found Fase 2 — microchip cross-check for found_stray intake.
  // Only triggered when the user is registering a stray they found AND provided
  // a chip number. Normal pet registrations (adopted, purchased, etc.) skip this.
  if (parsed.acquisitionMethod === "found_stray" && parsed.microchipId) {
    const match = await lookupByChip(parsed.microchipId);
    if (match) {
      if (match.pet.status === "lost") {
        // BLOCK: redirect to vecino match-confirmation page.
        redirect(`/mis-mascotas/nueva/match/${match.pet.publicToken}`);
      }

      if (match.pet.status === "active") {
        const forceToken = String(formData.get("forceToken") ?? "").trim();
        const forceValid = forceToken ? validateForceToken(parsed.microchipId, forceToken) : false;

        if (!forceValid) {
          return {
            error: null,
            warning: "CHIP_MATCH_ACTIVE",
            matchedPetToken: match.pet.publicToken,
            forceToken: generateForceToken(parsed.microchipId),
          };
        }
        // Force token valid — fall through.
      }

      if (match.pet.status === "deceased") {
        return {
          error:
            "Este chip está asociado a una mascota registrada como fallecida en DIM. Pedile a un admin que revise el caso antes de continuar.",
        };
      }
    }
  }

  const photoFile = formData.get("photo") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, photoFile, "pet-photos");
  if (upload.error) return { error: upload.error };

  const publicToken = generatePublicToken();
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      const [newPet] = await tx
        .insert(pets)
        .values({
          publicToken,
          name: parsed.name,
          species: parsed.species,
          sex: parsed.sex,
          breed: parsed.breed,
          dateOfBirth: parsed.dateOfBirth,
          birthDateIsEstimated: parsed.birthDateIsEstimated,
          color: parsed.color,
          microchipId: parsed.microchipId,
          microchipCountryCode: parsed.microchipCountryCode,
          microchipImplantedAt: parsed.microchipImplantedAt,
          microchipImplantedBy: parsed.microchipImplantedBy,
          microchipLocation: parsed.microchipLocation,
          estimatedWeightKg: parsed.estimatedWeightKg,
          favouriteFoods: parsed.favouriteFoods.length > 0 ? parsed.favouriteFoods : null,
          knownAllergies: parsed.knownAllergies.length > 0 ? parsed.knownAllergies : null,
          trainingLevel: parsed.trainingLevel,
          potentiallyDangerousBreed: parsed.potentiallyDangerousBreed,
          insuranceCompany: parsed.insuranceCompany,
          insurancePolicyNumber: parsed.insurancePolicyNumber,
          jurisdictionProvince: parsed.jurisdictionProvince,
          jurisdictionLocality: parsed.jurisdictionLocality,
          acquisitionMethod: parsed.acquisitionMethod,
          emergencyInfoVisible: parsed.emergencyInfoVisible,
        })
        .returning();

      // Custody role: foster_in_transit → shelter_custody (vecino-helps-stray
      // case from AGENTS.md → Organizations); default → owner.
      const ownershipRole =
        parsed.custodyKind === "foster_in_transit" ? "shelter_custody" : "owner";
      await tx.insert(ownerships).values({
        petId: newPet.id,
        ownerUserId: user.id,
        role: ownershipRole,
        startedAt: now,
      });

      if (upload.uploadedPath) {
        const [attachment] = await tx
          .insert(attachments)
          .values({
            petId: newPet.id,
            uploadedByUserId: user.id,
            storagePath: upload.uploadedPath,
            mimeType: upload.mimeType ?? "image/jpeg",
            fileSize: upload.size ?? 0,
          })
          .returning();
        await tx.update(pets).set({ primaryPhotoId: attachment.id }).where(eq(pets.id, newPet.id));
      }

      // Explicit snake_case payload — no `...parsed` spread. Mixing camelCase
      // and snake_case in the same JSON column made the schema unable to be
      // strict and let `emergencyInfoVisible` (a UI preference, not
      // registration metadata) leak into the immutable log historically.
      const petRegisteredPayload = validateEventPayload("pet_registered", {
        name: parsed.name,
        species: parsed.species,
        sex: parsed.sex,
        breed: parsed.breed,
        date_of_birth: parsed.dateOfBirth,
        birth_date_is_estimated: parsed.birthDateIsEstimated,
        color: parsed.color,
        microchip_id: parsed.microchipId,
        microchip_country_code: parsed.microchipCountryCode,
        microchip_implanted_at: parsed.microchipImplantedAt,
        microchip_implanted_by: parsed.microchipImplantedBy,
        microchip_location: parsed.microchipLocation,
        estimated_weight_kg: parsed.estimatedWeightKg,
        favourite_foods: parsed.favouriteFoods,
        known_allergies: parsed.knownAllergies,
        training_level: parsed.trainingLevel,
        insurance_company: parsed.insuranceCompany,
        insurance_policy_number: parsed.insurancePolicyNumber,
        jurisdiction_province: parsed.jurisdictionProvince,
        jurisdiction_locality: parsed.jurisdictionLocality,
        potentially_dangerous_breed: parsed.potentiallyDangerousBreed,
        acquisition_method: parsed.acquisitionMethod,
        has_photo: upload.uploadedPath !== null,
        has_microchip: parsed.microchipId !== null,
        custody_kind:
          parsed.custodyKind === "foster_in_transit" ? "shelter_custody_by_citizen" : "owner",
      });
      const registeredEvent = await tx
        .insert(petEvents)
        .values({
          petId: newPet.id,
          eventType: "pet_registered",
          occurredAt: now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: petRegisteredPayload,
        })
        .returning();

      if (parsed.microchipId) {
        const microchipEventPayload = validateEventPayload("microchip_implanted", {
          chip_number: parsed.microchipId,
          country_code: parsed.microchipCountryCode,
          implanted_by: parsed.microchipImplantedBy,
          location_on_body: parsed.microchipLocation,
          implant_date_known: !!parsed.microchipImplantedAt,
        });
        await tx.insert(petEvents).values({
          petId: newPet.id,
          eventType: "microchip_implanted",
          occurredAt: parseDateInput(parsed.microchipImplantedAt) ?? now,
          recordedAt: now,
          recordedByUserId: user.id,
          authorRole: "owner",
          payload: microchipEventPayload,
        });
      }

      // Auto-generate the PPP-registration reminder notification.
      // Suppressed for foster_in_transit custodians — the legal obligation to
      // inscribe in the provincial PPP registry belongs to the legal owner,
      // not a transitional caretaker. Sending it to a vecino would be misleading.
      if (parsed.potentiallyDangerousBreed && parsed.custodyKind !== "foster_in_transit") {
        await tx.insert(notifications).values({
          userId: user.id,
          notificationType: "ppp_registration_reminder",
          title: `${parsed.name}: registrá tu PPP en el provincial`,
          body: `Tu mascota está marcada como raza potencialmente peligrosa por ${parsed.breed ?? "su raza"}. La Ley CABA 4078 / Ley Provincial 14.107 requiere que la inscribas en el registro provincial correspondiente. MiMAR la marcó automáticamente con la flag oficial.`,
          severity: "warning",
          ctaLabel: "Más info sobre PPP",
          ctaUrl: "https://www.argentina.gob.ar/justicia/derechofacil/leysimple/maltrato-animales",
          relatedPetId: newPet.id,
          relatedEventId: registeredEvent[0].id,
        });
      }
    });
  } catch (err) {
    if (upload.uploadedPath) {
      try {
        await supabase.storage.from("pet-photos").remove([upload.uploadedPath]);
      } catch {
        // Swallow.
      }
    }
    return {
      error: `No se pudo crear la mascota: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  redirect("/mis-mascotas");
}

// ---------------------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------------------

// Compute a diff between the existing pet record and the parsed form values.
// Returns a list of {field, old_value, new_value} entries — these become the
// payload of a single bundled pet_profile_updated event.
function diffPet(
  existing: Pet,
  parsed: ParsedPet,
): Array<{
  field: string;
  old: unknown;
  new: unknown;
}> {
  const fields: Array<{ field: string; oldVal: unknown; newVal: unknown }> = [
    { field: "name", oldVal: existing.name, newVal: parsed.name },
    { field: "species", oldVal: existing.species, newVal: parsed.species },
    { field: "sex", oldVal: existing.sex, newVal: parsed.sex },
    { field: "breed", oldVal: existing.breed, newVal: parsed.breed },
    { field: "date_of_birth", oldVal: existing.dateOfBirth, newVal: parsed.dateOfBirth },
    { field: "color", oldVal: existing.color, newVal: parsed.color },
    { field: "microchip_id", oldVal: existing.microchipId, newVal: parsed.microchipId },
    {
      field: "microchip_country_code",
      oldVal: existing.microchipCountryCode,
      newVal: parsed.microchipCountryCode,
    },
    {
      field: "microchip_implanted_at",
      oldVal: existing.microchipImplantedAt,
      newVal: parsed.microchipImplantedAt,
    },
    {
      field: "microchip_implanted_by",
      oldVal: existing.microchipImplantedBy,
      newVal: parsed.microchipImplantedBy,
    },
    {
      field: "microchip_location",
      oldVal: existing.microchipLocation,
      newVal: parsed.microchipLocation,
    },
    {
      field: "estimated_weight_kg",
      oldVal: existing.estimatedWeightKg,
      newVal: parsed.estimatedWeightKg,
    },
    {
      field: "favourite_foods",
      oldVal: existing.favouriteFoods,
      newVal: parsed.favouriteFoods.length > 0 ? parsed.favouriteFoods : null,
    },
    {
      field: "known_allergies",
      oldVal: existing.knownAllergies,
      newVal: parsed.knownAllergies.length > 0 ? parsed.knownAllergies : null,
    },
    { field: "training_level", oldVal: existing.trainingLevel, newVal: parsed.trainingLevel },
    {
      field: "potentially_dangerous_breed",
      oldVal: existing.potentiallyDangerousBreed,
      newVal: parsed.potentiallyDangerousBreed,
    },
    {
      field: "insurance_company",
      oldVal: existing.insuranceCompany,
      newVal: parsed.insuranceCompany,
    },
    {
      field: "insurance_policy_number",
      oldVal: existing.insurancePolicyNumber,
      newVal: parsed.insurancePolicyNumber,
    },
    {
      field: "jurisdiction_province",
      oldVal: existing.jurisdictionProvince,
      newVal: parsed.jurisdictionProvince,
    },
    {
      field: "jurisdiction_locality",
      oldVal: existing.jurisdictionLocality,
      newVal: parsed.jurisdictionLocality,
    },
    {
      field: "acquisition_method",
      oldVal: existing.acquisitionMethod,
      newVal: parsed.acquisitionMethod,
    },
  ];
  return fields
    .filter((f) => JSON.stringify(f.oldVal) !== JSON.stringify(f.newVal))
    .map((f) => ({ field: f.field, old: f.oldVal, new: f.newVal }));
}

export async function updatePetAction(
  publicToken: string,
  _previous: NewPetFormState,
  formData: FormData,
): Promise<NewPetFormState> {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet: existingPet, eventAuthorship, accessPath } = access;

  const { parsed, error: parseError } = parsePetForm(formData);
  if (parseError) return { error: parseError };

  const photoFile = formData.get("photo") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, photoFile, "pet-photos");
  if (upload.error) return { error: upload.error };

  const changes = diffPet(existingPet, parsed);
  const wasChipPresent = !!existingPet.microchipId;
  const isChipPresent = !!parsed.microchipId;
  const chipNewlyAdded = !wasChipPresent && isChipPresent;
  const becamePPP = !existingPet.potentiallyDangerousBreed && parsed.potentiallyDangerousBreed;
  // emergencyInfoVisible is intentionally NOT in diffPet — it is a UI preference,
  // not a fact about the pet, so flipping it does not emit a pet_profile_updated
  // event. We still persist it on the row when it changes.
  const flagChanged = parsed.emergencyInfoVisible !== existingPet.emergencyInfoVisible;
  const hasContentChanges = changes.length > 0 || upload.uploadedPath !== null;

  // Skip the whole transaction if nothing changed at all (no edits, no new
  // photo, no flag flip).
  if (!hasContentChanges && !flagChanged) {
    redirect(`/mis-mascotas/${publicToken}`);
  }

  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(pets)
        .set({
          name: parsed.name,
          species: parsed.species,
          sex: parsed.sex,
          breed: parsed.breed,
          dateOfBirth: parsed.dateOfBirth,
          birthDateIsEstimated: parsed.birthDateIsEstimated,
          color: parsed.color,
          microchipId: parsed.microchipId,
          microchipCountryCode: parsed.microchipCountryCode,
          microchipImplantedAt: parsed.microchipImplantedAt,
          microchipImplantedBy: parsed.microchipImplantedBy,
          microchipLocation: parsed.microchipLocation,
          estimatedWeightKg: parsed.estimatedWeightKg,
          favouriteFoods: parsed.favouriteFoods.length > 0 ? parsed.favouriteFoods : null,
          knownAllergies: parsed.knownAllergies.length > 0 ? parsed.knownAllergies : null,
          trainingLevel: parsed.trainingLevel,
          potentiallyDangerousBreed: parsed.potentiallyDangerousBreed,
          insuranceCompany: parsed.insuranceCompany,
          insurancePolicyNumber: parsed.insurancePolicyNumber,
          jurisdictionProvince: parsed.jurisdictionProvince,
          jurisdictionLocality: parsed.jurisdictionLocality,
          acquisitionMethod: parsed.acquisitionMethod,
          emergencyInfoVisible: parsed.emergencyInfoVisible,
          updatedAt: now,
        })
        .where(eq(pets.id, existingPet.id));

      if (upload.uploadedPath) {
        const [attachment] = await tx
          .insert(attachments)
          .values({
            petId: existingPet.id,
            uploadedByUserId: user.id,
            storagePath: upload.uploadedPath,
            mimeType: upload.mimeType ?? "image/jpeg",
            fileSize: upload.size ?? 0,
          })
          .returning();
        await tx
          .update(pets)
          .set({ primaryPhotoId: attachment.id })
          .where(eq(pets.id, existingPet.id));
      }

      // Only emit pet_profile_updated when actual content (or photo) changed.
      // A flag-only flip (e.g. emergencyInfoVisible toggle) updates the row
      // above but produces no event — see AGENTS.md → Core principles #2:
      // events are facts about the pet, not UI preferences.
      if (hasContentChanges) {
        const petProfileUpdatedPayload = validateEventPayload("pet_profile_updated", {
          changes,
          photo_replaced: upload.uploadedPath !== null,
        });
        const updateEvent = await tx
          .insert(petEvents)
          .values({
            petId: existingPet.id,
            eventType: "pet_profile_updated",
            occurredAt: now,
            recordedAt: now,
            recordedByUserId: user.id,
            ...eventAuthorship,
            payload: petProfileUpdatedPayload,
          })
          .returning();

        // PPP-registration reminder is a legal obligation that attaches to the
        // permanent owner. Org-side updates (refugio, sanctuary) shouldn't send
        // this notification to the org-member who edited — the obligation
        // doesn't apply to org custody, and the org member isn't the owner.
        if (becamePPP && accessPath === "owner") {
          await tx.insert(notifications).values({
            userId: user.id,
            notificationType: "ppp_registration_reminder",
            title: `${parsed.name}: registrá tu PPP en el provincial`,
            body: `Tu mascota fue marcada como raza potencialmente peligrosa por ${parsed.breed ?? "su raza"}. La Ley CABA 4078 / Ley Provincial 14.107 requiere que la inscribas en el registro provincial correspondiente.`,
            severity: "warning",
            ctaLabel: "Más info sobre PPP",
            ctaUrl:
              "https://www.argentina.gob.ar/justicia/derechofacil/leysimple/maltrato-animales",
            relatedPetId: existingPet.id,
            relatedEventId: updateEvent[0].id,
          });
        }
      }

      if (chipNewlyAdded) {
        const microchipEventPayload = validateEventPayload("microchip_implanted", {
          chip_number: parsed.microchipId,
          country_code: parsed.microchipCountryCode,
          implanted_by: parsed.microchipImplantedBy,
          location_on_body: parsed.microchipLocation,
          implant_date_known: !!parsed.microchipImplantedAt,
        });
        await tx.insert(petEvents).values({
          petId: existingPet.id,
          eventType: "microchip_implanted",
          occurredAt: parseDateInput(parsed.microchipImplantedAt) ?? now,
          recordedAt: now,
          recordedByUserId: user.id,
          ...eventAuthorship,
          payload: microchipEventPayload,
        });
      }
    });
  } catch (err) {
    if (upload.uploadedPath) {
      try {
        await supabase.storage.from("pet-photos").remove([upload.uploadedPath]);
      } catch {
        // Swallow.
      }
    }
    return {
      error: `No se pudo actualizar: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}
