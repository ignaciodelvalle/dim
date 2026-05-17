"use server";

// Org-side intake — a refugio or rescue org takes custody of an animal.
// Atomic write: new pet + ownership(role='shelter_custody', owner_org=…) +
// pet_registered event + shelter_intake_recorded event, all in one tx.
//
// Capability-gated on `intake.create`. The capability is enforced by
// requireCapability, which mirrors requireOwnedPet from events.ts.
//
// Lost & Found Fase 2: if microchipId is provided, a cross-check is performed
// BEFORE inserting the new pet. Depending on the matched pet's status:
//   - lost    → redirect to match confirmation page (BLOCK)
//   - active  → return warning with forceToken; if forceToken is valid, proceed
//   - deceased → return error (BLOCK, admin review required)

import { db, notifications, ownerships, petEvents, pets } from "@/db";
import { provinceByCode } from "@/lib/ar-provincias";
import { isPotentiallyDangerousBreed } from "@/lib/breeds";
import { requireCapability } from "@/lib/capabilities";
import { lookupByChip } from "@/lib/chip-lookup";
import { validateEventPayload } from "@/lib/event-schemas";
import { parseDateInput } from "@/lib/format";
import { generateForceToken, validateForceToken } from "@/lib/microchip-force-token";
import { generatePublicToken } from "@/lib/publicToken";
import { redirect } from "next/navigation";

export type IntakeFormState = {
  error: string | null;
  // Present when a chip cross-check found an active match (WARN state).
  // The UI should show the conflict details and offer a "continue anyway" path
  // backed by the forceToken.
  warning?: "CHIP_MATCH_ACTIVE";
  matchedPetToken?: string;
  forceToken?: string;
};

type IntakeReason = "rescue" | "surrender" | "seizure" | "stray_found" | "other";
const INTAKE_REASONS: readonly IntakeReason[] = [
  "rescue",
  "surrender",
  "seizure",
  "stray_found",
  "other",
];

// Custody role the org will take on this animal. Default "shelter_custody"
// matches the rescue-and-rehome path; "owner" is for sanctuary / internal-
// adoption / long-term-keep cases where there's no rehoming pathway planned.
type CustodyRole = "shelter_custody" | "owner";
const CUSTODY_ROLES: readonly CustodyRole[] = ["shelter_custody", "owner"];

function parseIntakeForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const species = String(formData.get("species") ?? "").trim();
  if (!name) return { parsed: null, error: "Falta el nombre (o un alias temporal)." };
  if (!species) return { parsed: null, error: "Falta la especie." };

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

  const intakeReasonRaw = String(formData.get("intakeReason") ?? "").trim();
  if (!INTAKE_REASONS.includes(intakeReasonRaw as IntakeReason)) {
    return { parsed: null, error: "Indicá el motivo de ingreso." };
  }
  const intakeReason = intakeReasonRaw as IntakeReason;

  const custodyRoleRaw = String(formData.get("custodyRole") ?? "shelter_custody").trim();
  const custodyRole: CustodyRole = CUSTODY_ROLES.includes(custodyRoleRaw as CustodyRole)
    ? (custodyRoleRaw as CustodyRole)
    : "shelter_custody";

  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const occurredAt = occurredAtRaw ? parseDateInput(occurredAtRaw) : new Date();
  if (occurredAtRaw && !occurredAt) {
    return { parsed: null, error: "Fecha de ingreso inválida." };
  }

  const breed = String(formData.get("breed") ?? "").trim() || null;
  const microchipId = String(formData.get("microchipId") ?? "").trim() || null;

  return {
    parsed: {
      name,
      species,
      sex,
      breed,
      dateOfBirth,
      birthDateIsEstimated,
      color: String(formData.get("color") ?? "").trim() || null,
      distinguishingFeatures: String(formData.get("distinguishingFeatures") ?? "").trim() || null,
      microchipId,
      microchipCountryCode: microchipId
        ? String(formData.get("microchipCountryCode") ?? "").trim() || null
        : null,
      jurisdictionProvince:
        provinceByCode(String(formData.get("provinceCode") ?? "").trim())?.name ?? null,
      jurisdictionLocality: String(formData.get("localityName") ?? "").trim() || null,
      intakeReason,
      intakeCondition: String(formData.get("intakeCondition") ?? "").trim() || null,
      rescueJurisdiction: String(formData.get("rescueJurisdiction") ?? "").trim() || null,
      occurredAt: occurredAt as Date,
      custodyRole,
      potentiallyDangerousBreed: isPotentiallyDangerousBreed(species, breed),
    },
    error: null,
  };
}

export async function createIntakeAction(
  orgToken: string,
  _previous: IntakeFormState,
  formData: FormData,
): Promise<IntakeFormState> {
  const auth = await requireCapability("intake.create");
  if (auth.error !== null) return { error: auth.error };
  const { user, organization } = auth;

  const { parsed, error: parseError } = parseIntakeForm(formData);
  if (parseError || !parsed) return { error: parseError ?? "Datos inválidos." };

  // Lost & Found Fase 2 — microchip cross-check before inserting.
  if (parsed.microchipId) {
    const match = await lookupByChip(parsed.microchipId);
    if (match) {
      if (match.pet.status === "lost") {
        // BLOCK: redirect to match-confirmation page so the org can confirm.
        redirect(`/org/${orgToken}/intake/match/${match.pet.publicToken}`);
      }

      if (match.pet.status === "active") {
        // WARN: chip is registered to a live active pet.
        // Check if the caller is presenting a valid force-create token.
        const forceToken = String(formData.get("forceToken") ?? "").trim();
        const forceValid = forceToken
          ? validateForceToken(parsed.microchipId, forceToken)
          : false;

        if (!forceValid) {
          // Block and return a warning with a fresh forceToken for the UI
          // to present the "continue anyway" confirmation.
          return {
            error: null,
            warning: "CHIP_MATCH_ACTIVE",
            matchedPetToken: match.pet.publicToken,
            forceToken: generateForceToken(parsed.microchipId),
          };
        }
        // Force token valid — fall through to normal intake flow.
      }

      if (match.pet.status === "deceased") {
        // BLOCK unconditionally — admin review required.
        return {
          error:
            "Este chip está asociado a una mascota registrada como fallecida en DIM. Pedile a un admin que revise el caso antes de continuar.",
        };
      }
    }
  }

  const publicToken = generatePublicToken();
  const now = new Date();
  const authorVerified = organization.verified;

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
          distinguishingFeatures: parsed.distinguishingFeatures,
          microchipId: parsed.microchipId,
          microchipCountryCode: parsed.microchipCountryCode,
          jurisdictionProvince: parsed.jurisdictionProvince,
          jurisdictionLocality: parsed.jurisdictionLocality,
          potentiallyDangerousBreed: parsed.potentiallyDangerousBreed,
        })
        .returning();

      await tx.insert(ownerships).values({
        petId: newPet.id,
        ownerOrganizationId: organization.id,
        role: parsed.custodyRole,
        startedAt: parsed.occurredAt,
      });

      const registeredPayload = validateEventPayload("pet_registered", {
        name: parsed.name,
        species: parsed.species,
        sex: parsed.sex,
        breed: parsed.breed,
        date_of_birth: parsed.dateOfBirth,
        birth_date_is_estimated: parsed.birthDateIsEstimated,
        color: parsed.color,
        microchip_id: parsed.microchipId,
        microchip_country_code: parsed.microchipCountryCode,
        microchip_implanted_at: null,
        microchip_implanted_by: null,
        microchip_location: null,
        estimated_weight_kg: null,
        favourite_foods: [],
        known_allergies: [],
        training_level: null,
        insurance_company: null,
        insurance_policy_number: null,
        jurisdiction_province: parsed.jurisdictionProvince,
        jurisdiction_locality: parsed.jurisdictionLocality,
        potentially_dangerous_breed: parsed.potentiallyDangerousBreed,
        acquisition_method: null,
        has_photo: false,
        has_microchip: parsed.microchipId !== null,
        custody_kind: parsed.custodyRole === "owner" ? "owner_by_org" : "shelter_custody_by_org",
      });
      await tx.insert(petEvents).values({
        petId: newPet.id,
        eventType: "pet_registered",
        occurredAt: parsed.occurredAt,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified,
        payload: registeredPayload,
      });

      const intakePayload = validateEventPayload("shelter_intake_recorded", {
        intake_reason: parsed.intakeReason,
        intake_condition: parsed.intakeCondition,
        rescue_jurisdiction: parsed.rescueJurisdiction,
      });
      await tx.insert(petEvents).values({
        petId: newPet.id,
        eventType: "shelter_intake_recorded",
        occurredAt: parsed.occurredAt,
        recordedAt: now,
        recordedByUserId: user.id,
        authorRole: "shelter",
        authorOrganizationId: organization.id,
        authorVerified,
        payload: intakePayload,
      });

      // Heads-up notification to the user who recorded the intake. This is a
      // confirmation, not an alert — severity=success. The refugio's other
      // members aren't pinged in v1; bulk-fanout on every intake would noise
      // them out at high-capacity shelters (per AGENTS.md "El Campito scale").
      await tx.insert(notifications).values({
        userId: user.id,
        notificationType: "shelter_intake_confirmed",
        title: `Ingreso registrado: ${parsed.name}`,
        body: `${parsed.name} ahora figura en custodia de ${organization.displayName}.`,
        severity: "success",
        ctaLabel: "Ver listado",
        ctaUrl: `/org/${orgToken}/mascotas`,
        relatedPetId: newPet.id,
      });
    });
  } catch (err) {
    return {
      error: `No se pudo registrar el ingreso: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    };
  }

  redirect(`/org/${orgToken}/mascotas?nueva=${publicToken}`);
}
