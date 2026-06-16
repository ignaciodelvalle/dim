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
//
// Lost & Found Fase 7: microchipId is validated against ISO 11784/11785 (15
// digits) before the cross-check so malformed chip strings never reach the DB.
//
// Tattoo match (D2): if tattooCode is provided, a cross-check is performed
// after the chip check. On a match, returns TATTOO_MATCH_POSSIBLE advisory
// with a tattooAckToken. Re-submitting with a valid tattooAckToken proceeds.
// Never auto-merges; always "posible coincidencia, verificá con foto".

import { db, notifications, ownerships, petEvents, petIdentifications, pets } from "@/db";
import { provinceByCode } from "@/lib/ar-provincias";
import { isPotentiallyDangerousBreedForJurisdiction } from "@/lib/breeds-server";
import { openCase } from "@/lib/case-helpers";
import { lookupByChip } from "@/lib/chip-lookup";
import { validateEventPayload } from "@/lib/event-schemas";
import { parseDateInput } from "@/lib/format";
import {
  CoordError,
  JurisdictionValidationError,
  normalizeLocationForWrite,
} from "@/lib/location-normalize";
import { parseLocationFromFormData } from "@/lib/location-value";
import { generateForceToken, validateForceToken } from "@/lib/microchip-force-token";
import { validateMicrochipId } from "@/lib/microchip-validation";
import { generatePublicToken } from "@/lib/publicToken";
import { generateTattooAckToken, validateTattooAckToken } from "@/lib/tattoo-ack-token";
import { lookupByTattoo, normalizeTattooCode } from "@/lib/tattoo-lookup";
import { generateUniqueToken } from "@/lib/unique-token";
import { requireCapability } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { chipImplantSiteFromLocation } from "@/src/modules/pets/domain/pet-rules";
import { redirect } from "next/navigation";

export type IntakeFormState = {
  error: string | null;
  // Present when a chip cross-check found an active match (WARN state).
  // The UI should show the conflict details and offer a "continue anyway" path
  // backed by the forceToken.
  warning?: "CHIP_MATCH_ACTIVE" | "TATTOO_MATCH_POSSIBLE";
  matchedPetToken?: string;
  // Chip bypass token — bound to the microchip code, expires in 15 min.
  forceToken?: string;
  // Tattoo advisory ack token — bound to the normalized tattoo code, expires in 15 min.
  // Re-submitting with a valid tattooAckToken skips the tattoo cross-check.
  tattooAckToken?: string;
  // Optional success flag. Default success path is a redirect to the org
  // mascotas list. The intake wizard (sprint 4 PR-030) passes noRedirect=1
  // so it can render its own SuccessScreen with the new pet's name + token.
  ok?: boolean;
  createdPetToken?: string;
  createdPetName?: string;
};

// "seizure" is intentionally absent: a decomiso is a State act (DC1) and
// must go through the government decomiso flow (welfare.decomiso.execute),
// not the org-side intake form. The intake_reason ENUM value "seizure" stays
// valid in the DB and schema — the govt flow will use it.
type IntakeReason = "rescue" | "surrender" | "stray_found" | "other";
const INTAKE_REASONS: readonly IntakeReason[] = ["rescue", "surrender", "stray_found", "other"];

// Custody role the org will take on this animal. Default "shelter_custody"
// matches the rescue-and-rehome path; "owner" is for sanctuary / internal-
// adoption / long-term-keep cases where there's no rehoming pathway planned.
type CustodyRole = "shelter_custody" | "owner";
const CUSTODY_ROLES: readonly CustodyRole[] = ["shelter_custody", "owner"];

function parseIntakeForm(formData: FormData) {
  const loc = parseLocationFromFormData(formData);
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

  // Tattoo code — stored normalized (trim + uppercase + collapse whitespace).
  // Pass raw input to lookupByTattoo (it normalizes internally). For the
  // pets row write we normalize here to keep the DB consistent with
  // every other writer (createTattooForUser pattern).
  const tattooCodeRaw = String(formData.get("tattooCode") ?? "").trim();
  const tattooCode = tattooCodeRaw ? normalizeTattooCode(tattooCodeRaw) : null;

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
      tattooCode,
      jurisdictionProvince: provinceByCode(loc.provinceCode ?? "")?.name ?? null,
      jurisdictionLocality: loc.locality,
      intakeReason,
      intakeCondition: String(formData.get("intakeCondition") ?? "").trim() || null,
      rescueJurisdiction: String(formData.get("rescueJurisdiction") ?? "").trim() || null,
      occurredAt: occurredAt as Date,
      custodyRole,
      // Flag is jurisdiction-resolved at action time — parse stays sync.
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

  // Canonicalize the pet's jurisdiction strictly against the INDEC catalog.
  // The intake form uses LocationFields (forces a catalog selection); this
  // validates crafted/bypassed requests and ensures org-side intakes converge
  // on the same canonical spelling as owner-side registrations.
  // locality:"strict" — resolveCanonicalJurisdiction (intake behavior unchanged).
  if (parsed.jurisdictionProvince && parsed.jurisdictionLocality) {
    try {
      const normalizedLoc = await normalizeLocationForWrite(
        {
          province: parsed.jurisdictionProvince,
          provinceCode: null,
          locality: parsed.jurisdictionLocality,
          localityIndecId: null,
          lat: null,
          lng: null,
          address: null,
        },
        { locality: "strict" },
      );
      parsed.jurisdictionProvince = normalizedLoc.province;
      parsed.jurisdictionLocality = normalizedLoc.locality;
    } catch (err) {
      if (err instanceof JurisdictionValidationError) {
        return { error: err.message };
      }
      if (err instanceof CoordError) {
        return { error: err.message };
      }
      throw err;
    }
  }

  // Lost & Found Fase 7 — validate chip format (ISO 11784/11785, 15 digits)
  // before the cross-check so malformed values never reach the DB.
  if (parsed.microchipId) {
    const chipValidation = validateMicrochipId(parsed.microchipId);
    if (!chipValidation.ok) {
      return { error: "INVALID_MICROCHIP_FORMAT" };
    }
    // Overwrite with the normalized (separators stripped) form.
    parsed.microchipId = chipValidation.normalized;
  }

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
        const forceValid = forceToken ? validateForceToken(parsed.microchipId, forceToken) : false;

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
            "Este chip está asociado a una mascota registrada como fallecida en MiMAR. Pedile a un admin que revise el caso antes de continuar.",
        };
      }
    }
  }

  // Tattoo cross-check (D2) — advisory only, never auto-merge.
  // Tattoo codes collide across registries; we surface a warning and require
  // visual verification ("posible coincidencia, verificá con foto").
  // On re-submit with a valid tattooAckToken the check is skipped — the
  // operator has asserted the animals are different after photo review.
  if (parsed.tattooCode) {
    const tattooAckToken = String(formData.get("tattooAckToken") ?? "").trim();
    const ackValid = tattooAckToken
      ? validateTattooAckToken(parsed.tattooCode, tattooAckToken)
      : false;

    if (!ackValid) {
      const tattooMatch = await lookupByTattoo(parsed.tattooCode);
      if (tattooMatch && tattooMatch.pet.status !== "deceased") {
        // Advisory: surface the possible match so the operator can photo-verify.
        // If a microchip is also present, the chip check already passed above
        // (forceToken was valid). Carry a fresh forceToken forward so the next
        // submit (with tattooAckToken) doesn't re-trigger CHIP_MATCH_ACTIVE
        // and loop indefinitely.
        return {
          error: null,
          warning: "TATTOO_MATCH_POSSIBLE",
          matchedPetToken: tattooMatch.pet.publicToken,
          tattooAckToken: generateTattooAckToken(parsed.tattooCode),
          ...(parsed.microchipId
            ? { forceToken: generateForceToken(parsed.microchipId) }
            : undefined),
        };
      }
    }
    // Ack token valid, or no match (or only deceased match) → proceed.
  }

  const publicToken = await generateUniqueToken(pets, pets.publicToken, generatePublicToken);
  const now = new Date();
  const authorVerified = organization.verified;

  // Jurisdiction-aware PPP evaluation (spec govt-business-rules-poc §4).
  const potentiallyDangerousBreed = await isPotentiallyDangerousBreedForJurisdiction(
    parsed.species,
    parsed.breed,
    {
      country: "AR",
      province: parsed.jurisdictionProvince,
      locality: parsed.jurisdictionLocality,
    },
  );

  type PendingNotification = typeof notifications.$inferInsert;
  const pendingNotifications: PendingNotification[] = [];

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
          // ARCH-S: microchipId, microchipCountryCode, tattooCode columns dropped
          // from pets — canonical rows written to pet_identifications below.
          jurisdictionProvince: parsed.jurisdictionProvince,
          jurisdictionLocality: parsed.jurisdictionLocality,
          potentiallyDangerousBreed: potentiallyDangerousBreed,
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
        potentially_dangerous_breed: potentiallyDangerousBreed,
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

      // Cases system: open a custody_episode for every org intake so the
      // custody period has a first-class entry in /casos. The lifecycle's
      // opensEvents = shelter_intake_recorded with no sub-condition, so all
      // intake reasons (rescue / surrender / stray_found / other) open a case.
      // "seizure" is excluded from org-side intake (DC1); the govt decomiso
      // flow will open its own case. Close transitions (custody_transferred,
      // adoption_finalized, death_recorded) are wired separately and are out
      // of scope here — cases stay open until then.
      const custodyCase = await openCase(
        {
          kind: "custody_episode",
          primarySubjectKind: "registered_pet",
          primaryPetId: newPet.id,
          jurisdictionProvince: parsed.jurisdictionProvince,
          jurisdictionLocality: parsed.jurisdictionLocality,
          openedByUserId: user.id,
          openedByOrganizationId: organization.id,
          openedReason: `auto: org intake reason=${parsed.intakeReason}`,
        },
        tx,
      );

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
        caseId: custodyCase.id,
      });

      // Canonical dual-write — insert pet_identifications rows for any
      // identifiers captured at intake time (chip and/or tattoo).
      if (parsed.microchipId) {
        const chipCode = parsed.microchipId;
        const implantSite = chipImplantSiteFromLocation(null); // no location at intake
        await tx.insert(petIdentifications).values({
          petId: newPet.id,
          kind: "microchip_iso",
          code: chipCode,
          recordedAt: parsed.occurredAt.toISOString().slice(0, 10),
          recordedByUserId: user.id,
          isoCountryCode: chipCode.slice(0, 3),
          isoManufacturerCode: chipCode.slice(3, 7),
          isoNationalId: chipCode.slice(7, 15),
          isoCompliant: true,
          implantationSite: implantSite ?? undefined,
        });
      }

      if (parsed.tattooCode) {
        await tx.insert(petIdentifications).values({
          petId: newPet.id,
          kind: "tattoo",
          code: parsed.tattooCode,
          recordedAt: parsed.occurredAt.toISOString().slice(0, 10),
          recordedByUserId: user.id,
        });
      }

      // Heads-up notification to the user who recorded the intake. This is a
      // confirmation, not an alert — severity=success. The refugio's other
      // members aren't pinged in v1; bulk-fanout on every intake would noise
      // them out at high-capacity shelters (per AGENTS.md "El Campito scale").
      pendingNotifications.push({
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

  if (pendingNotifications.length > 0) {
    try {
      await db.insert(notifications).values(pendingNotifications);
    } catch (e) {
      console.error("notifications insert failed (action did succeed)", e);
    }
  }

  if (String(formData.get("noRedirect") ?? "") === "1") {
    return {
      error: null,
      ok: true,
      createdPetToken: publicToken,
      createdPetName: parsed.name,
    };
  }

  redirect(`/org/${orgToken}/mascotas?nueva=${publicToken}`);
}
