"use server";

// Thin server actions for events module — medical (WU-2), identity (WU-3), clinical (WU-4),
// surveillance-bridge (WU-5), lifecycle (WU-6).
// Auth stays at the EDGE here (exact guard per AUTH SCOPE MATRIX).
// Each action: parse → auth guard → use-case → redirect.
//
// Medical auth:
//   - vaccination/weight/deworming/sterilization/medication-start/medication-end:
//       requireAlivePetAccess
//   - markMedicationDoseTaken: reminder-keyed (NOT requirePetAccess) + use-case verifies
//       ownership+alive manually.
// Identity auth:
//   - microchip, dangerous-breed-attestation: requireAlivePetAccess
//   - note: requirePetAccess (allows deceased/lost) — PARITY QUIRK.
// Clinical auth:
//   - vet-visit, clinical-info: requireAlivePetAccess
//   - recordDiseaseDiagnosis: role=vet + matriculaVerified, NO ownership check.
// Surveillance auth:
//   - createSymptomObserved: requireAlivePetAccess.
// Lifecycle auth:
//   - setPetLost/setPetFound/deathRecord: requirePetAccess (accepts non-alive).
//
// Post-tx side-effects (cleanupAttachment) remain in the action per original parity.

import {
  FREQUENCY_LABELS,
  generateDoseSchedule,
  intervalHoursForFrequency,
  parseFrequencyFields,
} from "@/lib/medication-schedule";

import { db, profiles } from "@/db";
import { pets } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { findDisease } from "@/lib/diseases";
import { findDrugByLabel } from "@/lib/drugs";
import { parseDateInput } from "@/lib/format";
import { requireAlivePetAccess, requirePetAccess } from "@/lib/pet-access";
import type { SupabaseServerClient } from "@/lib/pet-access";
import { createClient } from "@/lib/supabase/server";
import { uploadAttachmentIfPresent } from "@/lib/uploads";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { enqueueEnoTrigger } from "@/src/modules/surveillance/application/enqueue-eno-trigger";
import { SurveillanceRepository } from "@/src/modules/surveillance/infrastructure/surveillance-repository";
import { createClinicalInfo } from "./application/clinical/clinical-info-use-case";
import { recordDiseaseDiagnosisWriter } from "./application/clinical/record-disease-diagnosis-use-case";
import { createVetVisit } from "./application/clinical/vet-visit-use-case";
import { createDangerousBreedAttestation } from "./application/identity/dangerous-breed-attestation-use-case";
import { createMicrochip } from "./application/identity/microchip-use-case";
import { createNote } from "./application/identity/note-use-case";
import { createDeathRecord } from "./application/lifecycle/death-record-use-case";
import { setPetFound } from "./application/lifecycle/set-pet-found-use-case";
import { setPetLostWriter } from "./application/lifecycle/set-pet-lost-use-case";
import { createDeworming } from "./application/medical/deworming-use-case";
import { markMedicationDoseTaken } from "./application/medical/medication-dose-taken-use-case";
import { createMedicationEnd } from "./application/medical/medication-end-use-case";
import { createMedicationStart } from "./application/medical/medication-start-use-case";
import { createSterilization } from "./application/medical/sterilization-use-case";
import { createVaccination } from "./application/medical/vaccination-use-case";
import { createWeight } from "./application/medical/weight-use-case";
import { createSymptomObservedWriter } from "./application/surveillance/symptom-observed-use-case";
import { CLINICAL_SUB_KINDS } from "./domain/enums";
import { DANGEROUS_BREED_REGISTRIES } from "./domain/enums";
import { NOTE_CATEGORIES } from "./domain/enums";
import { EventsRepository } from "./infrastructure/events-repository";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type EventFormState = {
  error: string | null;
  ok?: boolean;
};

async function cleanupAttachment(supabase: SupabaseServerClient, path: string | null) {
  if (!path) return;
  try {
    await supabase.storage.from("event-attachments").remove([path]);
  } catch {
    // Swallow — orphaned file at worst.
  }
}

function makeTransaction(): <T>(cb: (tx: unknown) => Promise<T>) => Promise<T> {
  return <T>(cb: (tx: unknown) => Promise<T>) =>
    db.transaction(cb as Parameters<typeof db.transaction>[0]) as Promise<T>;
}

const surveillanceRepoForEno = new SurveillanceRepository();

/**
 * In-transaction ENO enqueue dep for recordDiseaseDiagnosisWriter (P1-3
 * durability). The eno_processing_queue row is enqueued inside the diagnosis
 * tx so it is atomic with the event insert and can never be lost on a crash.
 * Idempotent on pet_event_id; DB errors propagate to roll the tx back.
 */
async function enqueueEnoTriggerInTx(
  petEvent: {
    id: string;
    petId: string;
    authorRole: string;
    recordedByUserId: string | null;
    authorOrganizationId: string | null;
    payload: Record<string, unknown>;
  },
  tx: unknown,
): Promise<void> {
  await enqueueEnoTrigger(petEvent, { repo: surveillanceRepoForEno, executor: tx });
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
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  if (!vaccineName) return { error: "Falta el nombre de la vacuna." };
  if (!occurredAtRaw) return { error: "Falta la fecha de aplicación." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha de aplicación inválida." };

  const nextDueAt = nextDueAtRaw ? parseDateInput(nextDueAtRaw) : null;
  if (nextDueAtRaw && !nextDueAt) return { error: "Fecha de próxima dosis inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const repo = new EventsRepository();

  try {
    const result = await createVaccination(
      {
        pet: { id: pet.id },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as {
          authorRole: string;
          authorOrganizationId: string | null;
          authorVerified: boolean;
        },
        vaccineName,
        occurredAt,
        brand,
        batch,
        administeredBy,
        nextDueAt,
        notes,
        sourceReminderId,
        uploadedPath: upload.uploadedPath,
        uploadedMimeType: upload.mimeType ?? null,
        uploadedSize: upload.size ?? null,
        clientIdempotencyKey,
      },
      { repo, transaction: makeTransaction() },
    );
    if (!result.ok) {
      await cleanupAttachment(supabase, upload.uploadedPath);
      return { error: result.error };
    }
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la vacuna: ${err instanceof Error ? err.message : "error desconocido"}`,
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
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  if (!kgRaw) return { error: "Falta el peso." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const kgNum = Number.parseFloat(kgRaw);
  if (!Number.isFinite(kgNum) || kgNum <= 0) return { error: "Peso inválido." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const kgStr = kgNum.toFixed(2);
  const repo = new EventsRepository();

  try {
    const result = await createWeight(
      {
        pet: { id: pet.id },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as {
          authorRole: string;
          authorOrganizationId: string | null;
          authorVerified: boolean;
        },
        kgStr,
        occurredAt,
        notes,
        uploadedPath: upload.uploadedPath,
        uploadedMimeType: upload.mimeType ?? null,
        uploadedSize: upload.size ?? null,
        clientIdempotencyKey,
      },
      { repo, transaction: makeTransaction() },
    );
    if (!result.ok) {
      await cleanupAttachment(supabase, upload.uploadedPath);
      return { error: result.error };
    }
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el peso: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

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
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

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

  const repo = new EventsRepository();

  try {
    const result = await createDeworming(
      {
        pet: { id: pet.id, name: pet.name },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as {
          authorRole: string;
          authorOrganizationId: string | null;
          authorVerified: boolean;
        },
        product,
        type,
        occurredAt,
        nextDueAt,
        notes,
        uploadedPath: upload.uploadedPath,
        uploadedMimeType: upload.mimeType ?? null,
        uploadedSize: upload.size ?? null,
        clientIdempotencyKey,
      },
      { repo, transaction: makeTransaction() },
    );
    if (!result.ok) {
      await cleanupAttachment(supabase, upload.uploadedPath);
      return { error: result.error };
    }
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el antiparasitario: ${err instanceof Error ? err.message : "error desconocido"}`,
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
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  if (!["castration", "spay"].includes(procedure)) return { error: "Procedimiento inválido." };
  if (!occurredAtRaw) return { error: "Falta la fecha de la cirugía." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const repo = new EventsRepository();

  try {
    const result = await createSterilization(
      {
        pet: { id: pet.id },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as {
          authorRole: string;
          authorOrganizationId: string | null;
          authorVerified: boolean;
        },
        procedure,
        performedBy,
        clinic,
        occurredAt,
        notes,
        uploadedPath: upload.uploadedPath,
        uploadedMimeType: upload.mimeType ?? null,
        uploadedSize: upload.size ?? null,
        clientIdempotencyKey,
      },
      { repo, transaction: makeTransaction() },
    );
    if (!result.ok) {
      await cleanupAttachment(supabase, upload.uploadedPath);
      return { error: result.error };
    }
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la esterilización: ${err instanceof Error ? err.message : "error desconocido"}`,
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
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  if (!drugName) return { error: "Falta el nombre del medicamento." };
  if (!dose) return { error: "Falta la dosis." };
  if (!occurredAtRaw) return { error: "Falta la fecha de inicio." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha de inicio inválida." };

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

  const { frequency, customHours, durationDays, firstDoseAt } = parsedFreq as {
    error: null;
    frequency: import("@/lib/drugs").FrequencyKind;
    customHours: number | null;
    durationDays: number | null;
    firstDoseAt: Date;
  };

  const intervalHours = intervalHoursForFrequency(frequency, customHours);
  const schedule = generateDoseSchedule({ firstDoseAt, intervalHours, durationDays });

  const matchedDrug = findDrugByLabel(drugName);
  const frequencyLabel = (FREQUENCY_LABELS as Record<string, string>)[frequency] ?? frequency;

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const repo = new EventsRepository();

  try {
    const result = await createMedicationStart(
      {
        pet: { id: pet.id, name: pet.name },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as {
          authorRole: string;
          authorOrganizationId: string | null;
          authorVerified: boolean;
        },
        drugName,
        dose,
        prescribedBy,
        occurredAt,
        notes,
        uploadedPath: upload.uploadedPath,
        uploadedMimeType: upload.mimeType ?? null,
        uploadedSize: upload.size ?? null,
        clientIdempotencyKey,
        frequency,
        customHours,
        durationDays,
        firstDoseAt,
        schedule,
        matchedDrugCode: matchedDrug?.code ?? null,
        frequencyLabel,
      },
      { repo, transaction: makeTransaction() },
    );
    if (!result.ok) {
      await cleanupAttachment(supabase, upload.uploadedPath);
      return { error: result.error };
    }
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la medicación: ${err instanceof Error ? err.message : "error desconocido"}`,
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
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  if (!medicationStartedEventId) return { error: "Falta seleccionar la medicación." };
  if (!occurredAtRaw) return { error: "Falta la fecha de fin." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha de fin inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const repo = new EventsRepository();

  try {
    const result = await createMedicationEnd(
      {
        pet: { id: pet.id },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as {
          authorRole: string;
          authorOrganizationId: string | null;
          authorVerified: boolean;
        },
        medicationStartedEventId,
        occurredAt,
        reason,
        notes,
        uploadedPath: upload.uploadedPath,
        uploadedMimeType: upload.mimeType ?? null,
        uploadedSize: upload.size ?? null,
        clientIdempotencyKey,
      },
      { repo, transaction: makeTransaction() },
    );
    if (!result.ok) {
      await cleanupAttachment(supabase, upload.uploadedPath);
      return { error: result.error };
    }
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el fin de medicación: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Medication dose taken (reminder-keyed, non-idempotent, throws on error)
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

  const repo = new EventsRepository();

  const result = await markMedicationDoseTaken(
    { reminderId, userId: user.id },
    { repo, transaction: makeTransaction() },
  );

  if (!result.ok) {
    throw new Error(result.error);
  }

  redirect(`/mis-mascotas/${result.value.petPublicToken}`);
}

// ---------------------------------------------------------------------------
// Microchip (WU-3 identity)
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
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  if (!chipNumber) return { error: "Falta el número de microchip." };
  if (!occurredAtRaw) return { error: "Falta la fecha de implantación." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const repo = new EventsRepository();

  // ARCH-S: read canonical chip status (legacy pets.microchipId column dropped).
  const { fetchActiveIdentifications } = await import("@/lib/pet-identifiers");
  const existingIds = await fetchActiveIdentifications(pet.id);

  try {
    const result = await createMicrochip(
      {
        pet: { id: pet.id, petHasCanonicalChip: existingIds.microchip !== null },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as {
          authorRole: string;
          authorOrganizationId: string | null;
          authorVerified: boolean;
        },
        chipNumber,
        countryCode,
        implantedBy,
        locationOnBody,
        occurredAt,
        notes,
        uploadedPath: upload.uploadedPath,
        uploadedMimeType: upload.mimeType ?? null,
        uploadedSize: upload.size ?? null,
        clientIdempotencyKey,
      },
      { repo, transaction: makeTransaction() },
    );
    if (!result.ok) {
      await cleanupAttachment(supabase, upload.uploadedPath);
      return { error: result.error };
    }
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el microchip: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Dangerous-breed attestation (WU-3 identity)
// ---------------------------------------------------------------------------

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

  const repo = new EventsRepository();

  try {
    const result = await createDangerousBreedAttestation(
      {
        pet: { id: pet.id },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as {
          authorRole: string;
          authorOrganizationId: string | null;
          authorVerified: boolean;
        },
        registry,
        registryId,
        attestedAt,
        notes,
        uploadedPath: upload.uploadedPath,
        uploadedMimeType: upload.mimeType ?? null,
        uploadedSize: upload.size ?? null,
      },
      { repo, transaction: makeTransaction() },
    );
    if (!result.ok) {
      await cleanupAttachment(supabase, upload.uploadedPath);
      return { error: result.error };
    }
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la atestación: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Note (WU-3 identity) — requirePetAccess (allows deceased/lost)
// ---------------------------------------------------------------------------

export async function createNoteAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  // PARITY: requirePetAccess (NOT requireAlivePetAccess) — allows deceased/lost pets.
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  const text = String(formData.get("text") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  if (!text) return { error: "Falta el contenido de la nota." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const category = (NOTE_CATEGORIES as readonly string[]).includes(categoryRaw)
    ? categoryRaw
    : null;

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const repo = new EventsRepository();

  try {
    const result = await createNote(
      {
        pet: { id: pet.id },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as {
          authorRole: string;
          authorOrganizationId: string | null;
          authorVerified: boolean;
        },
        text,
        occurredAt,
        category,
        uploadedPath: upload.uploadedPath,
        uploadedMimeType: upload.mimeType ?? null,
        uploadedSize: upload.size ?? null,
        clientIdempotencyKey,
      },
      { repo, transaction: makeTransaction() },
    );
    if (!result.ok) {
      await cleanupAttachment(supabase, upload.uploadedPath);
      return { error: result.error };
    }
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo guardar la nota: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Vet visit (WU-4 clinical)
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
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;
  const eventJurisdictionProvince = String(formData.get("provinceCode") ?? "").trim() || null;
  const eventJurisdictionLocality = String(formData.get("localityName") ?? "").trim() || null;

  if (!reason) return { error: "Falta el motivo de la visita." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const repo = new EventsRepository();

  try {
    const result = await createVetVisit(
      {
        pet: { id: pet.id },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as {
          authorRole: string;
          authorOrganizationId: string | null;
          authorVerified: boolean;
        },
        reason,
        occurredAt,
        diagnosis,
        vetName,
        clinic,
        notes,
        eventJurisdictionProvince,
        eventJurisdictionLocality,
        uploadedPath: upload.uploadedPath,
        uploadedMimeType: upload.mimeType ?? null,
        uploadedSize: upload.size ?? null,
        clientIdempotencyKey,
      },
      { repo, transaction: makeTransaction() },
    );
    if (!result.ok) {
      await cleanupAttachment(supabase, upload.uploadedPath);
      return { error: result.error };
    }
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la visita: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Clinical info (WU-4 clinical)
// ---------------------------------------------------------------------------

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
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;
  const eventJurisdictionProvince = String(formData.get("provinceCode") ?? "").trim() || null;
  const eventJurisdictionLocality = String(formData.get("localityName") ?? "").trim() || null;

  if (!(CLINICAL_SUB_KINDS as readonly string[]).includes(subKindRaw)) {
    return { error: "Tipo de información clínica inválido." };
  }
  const subKind = subKindRaw;
  if (!title) return { error: "Falta el título / nombre del estudio o procedimiento." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const repo = new EventsRepository();

  try {
    const result = await createClinicalInfo(
      {
        pet: { id: pet.id },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as {
          authorRole: string;
          authorOrganizationId: string | null;
          authorVerified: boolean;
        },
        subKind,
        title,
        details,
        performedBy,
        occurredAt,
        notes,
        eventJurisdictionProvince,
        eventJurisdictionLocality,
        uploadedPath: upload.uploadedPath,
        uploadedMimeType: upload.mimeType ?? null,
        uploadedSize: upload.size ?? null,
        clientIdempotencyKey,
      },
      { repo, transaction: makeTransaction() },
    );
    if (!result.ok) {
      await cleanupAttachment(supabase, upload.uploadedPath);
      return { error: result.error };
    }
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo guardar la información clínica: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Record disease diagnosis (WU-4 clinical) — VET-ONLY, NO ownership check
// ---------------------------------------------------------------------------

// Re-export types only (no value re-exports in "use server" files).
export type {
  RecordDiseaseDiagnosisWriterInput,
  RecordDiseaseDiagnosisWriterResult,
} from "./application/clinical/record-disease-diagnosis-use-case";

async function flushNotifications(
  pending: import("./application/types").NewNotification[],
): Promise<void> {
  if (pending.length === 0) return;
  const { notifications } = await import("@/db");
  try {
    // biome-ignore lint/suspicious/noExplicitAny: NewNotification is structurally compatible with notifications.$inferInsert
    await db.insert(notifications).values(pending as any[]);
  } catch (e) {
    console.error("notifications insert failed (action did succeed)", e);
  }
}

export async function recordDiseaseDiagnosisAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  // VET-ONLY auth: role=vet + matriculaVerified=true. NO ownership check.
  const { user } = await requireUserOrRedirect();
  const [vetProfile] = await db
    .select({
      role: profiles.role,
      matriculaVerified: profiles.matriculaVerified,
      displayName: profiles.displayName,
    })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (!vetProfile || vetProfile.role !== "vet" || !vetProfile.matriculaVerified) {
    return { error: "Solo veterinarios con matrícula verificada pueden registrar diagnósticos." };
  }

  const diseaseCode = String(formData.get("diseaseCode") ?? "").trim();
  const confirmedByLab = formData.get("confirmedByLab") === "on";
  const labName = String(formData.get("labName") ?? "").trim() || null;
  const labReportRef = String(formData.get("labReportReference") ?? "").trim() || null;
  const diagnosisDateRaw = String(formData.get("diagnosisDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!diseaseCode) return { error: "Falta el código de enfermedad." };
  const disease = findDisease(diseaseCode);
  if (!disease) return { error: "Código de enfermedad desconocido." };
  if (!diagnosisDateRaw) return { error: "Falta la fecha del diagnóstico." };
  const diagnosisDate = parseDateInput(diagnosisDateRaw);
  if (!diagnosisDate) return { error: "Fecha de diagnóstico inválida." };

  if (confirmedByLab && !labName) {
    return {
      error: "Para marcar como confirmado por laboratorio indicá el nombre del laboratorio.",
    };
  }

  // Resolve pet by publicToken — NO ownership check (vet can diagnose any pet).
  const [pet] = await db.select().from(pets).where(eq(pets.publicToken, publicToken)).limit(1);
  if (!pet) return { error: "Mascota no encontrada." };

  const repo = new EventsRepository();

  const result = await recordDiseaseDiagnosisWriter(
    {
      petId: pet.id,
      petName: pet.name,
      petSpecies: pet.species,
      petJurisdictionCountry: pet.jurisdictionCountry,
      petJurisdictionProvince: pet.jurisdictionProvince ?? null,
      petJurisdictionLocality: pet.jurisdictionLocality ?? null,
      vetUserId: user.id,
      vetDisplayName: vetProfile.displayName,
      diseaseCode,
      confirmedByLab,
      labName,
      labReportReference: labReportRef,
      diagnosisDate,
      notes,
    },
    {
      repo,
      transaction: makeTransaction(),
      flushNotifications,
      enqueueEnoTrigger: enqueueEnoTriggerInTx,
    },
  );

  if (!result.ok) {
    return { error: `No se pudo registrar el diagnóstico: ${result.error}` };
  }
  return { error: null };
}

// ---------------------------------------------------------------------------
// Disclosure prefs + enriched description form helpers (lifecycle)
// ---------------------------------------------------------------------------

function parseDisclosurePrefsFromForm(
  formData: FormData,
  petDefaults: import("./application/lifecycle/set-pet-lost-use-case").DisclosurePrefsInput,
): import("./application/lifecycle/set-pet-lost-use-case").DisclosurePrefsInput {
  const checked = (name: string) => formData.get(name) === "on";
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

function parseEnrichedDescriptionFromForm(
  formData: FormData,
): import("./application/lifecycle/set-pet-lost-use-case").EnrichedLostDescriptionInput | null {
  const enrichedKeys = [
    "enriched_color",
    "enriched_distinguishing_features",
    "enriched_accessories_when_lost",
    "enriched_behavior_notes",
    "enriched_last_seen_context",
    "enriched_microchip_id",
    "enriched_tattoo_code",
    "enriched_tattoo_location",
    "enriched_tattoo_description",
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
    tattooCode: str("enriched_tattoo_code"),
    tattooLocation: str("enriched_tattoo_location"),
    tattooDescription: str("enriched_tattoo_description"),
  };
}

// ---------------------------------------------------------------------------
// Symptom observed (WU-5 surveillance-bridge)
// ---------------------------------------------------------------------------

// Re-export types only (no value re-exports in "use server" files).
export type {
  CreateSymptomObservedWriterParams as SymptomObservedWriterParams,
  CreateSymptomObservedWriterResult,
} from "./application/surveillance/symptom-observed-use-case";

export type SymptomFormState = {
  error: string | null;
  ok?: boolean;
};

export async function createSymptomObservedAction(
  publicToken: string,
  _previous: SymptomFormState,
  formData: FormData,
): Promise<SymptomFormState> {
  // AUTH: requireAlivePetAccess (alive pets only).
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { pet, user, eventAuthorship } = access;

  const freeText = String(formData.get("freeText") ?? "").trim();
  if (!freeText) return { error: "Tenés que describir los síntomas." };

  const severityRaw = String(formData.get("severity") ?? "").trim();
  const severity: "mild" | "moderate" | "severe" | null =
    severityRaw === "mild" || severityRaw === "moderate" || severityRaw === "severe"
      ? severityRaw
      : null;

  const onsetRaw = String(formData.get("onsetAt") ?? "").trim();
  const onsetAt = onsetRaw.length > 0 ? onsetRaw : null;

  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  const repo = new EventsRepository();

  const result = await createSymptomObservedWriter(
    {
      petId: pet.id,
      petPublicToken: pet.publicToken,
      petSpecies: pet.species,
      petJurisdictionCountry: pet.jurisdictionCountry,
      petJurisdictionProvince: pet.jurisdictionProvince ?? null,
      petJurisdictionLocality: pet.jurisdictionLocality ?? null,
      rabiesObservationStatus: pet.rabiesObservationStatus ?? null,
      recordedByUserId: user.id,
      eventAuthorship: eventAuthorship as {
        authorRole: string;
        authorOrganizationId: string | null;
        authorVerified: boolean;
      },
      freeText,
      severity,
      onsetAt,
      clientIdempotencyKey,
    },
    {
      repo,
      transaction: makeTransaction(),
      flushNotifications,
    },
  );

  if (!result.ok) {
    return { error: `No se pudo registrar el síntoma: ${result.error}` };
  }

  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/mis-mascotas/${publicToken}`);
  redirect(`/mis-mascotas/${publicToken}?evento=sintoma_registrado`);
}

// ---------------------------------------------------------------------------
// Set pet lost (WU-6 lifecycle) — writer re-export
// ---------------------------------------------------------------------------

// Re-export types only (no value re-exports in "use server" files).
export type {
  SetPetLostWriterParams,
  SetPetLostWriterResult,
  DisclosurePrefsInput,
  EnrichedLostDescriptionInput,
} from "./application/lifecycle/set-pet-lost-use-case";

export async function setPetLostAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  // AUTH: requirePetAccess (accepts non-alive — lost pets can still update disclosure prefs).
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { user, pet, eventAuthorship } = access;

  const locationDescription = String(formData.get("locationAddress") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const locationLatRaw = String(formData.get("locationLat") ?? "").trim() || null;
  const locationLngRaw = String(formData.get("locationLng") ?? "").trim() || null;

  if (locationLatRaw && locationLngRaw) {
    const lat = Number.parseFloat(locationLatRaw);
    const lng = Number.parseFloat(locationLngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: "Coordenadas inválidas. Tocá el mapa de nuevo para marcar el punto." };
    }
  }

  // Parse disclosure prefs from FormData (checkbox pattern).
  const petDefaults: import("./application/lifecycle/set-pet-lost-use-case").DisclosurePrefsInput =
    {
      discloseFirstNameWhenLost: pet.discloseFirstNameWhenLost,
      disclosePhoneWhenLost: pet.disclosePhoneWhenLost,
      discloseEmailWhenLost: pet.discloseEmailWhenLost,
      discloseLastLocationWhenLost: pet.discloseLastLocationWhenLost,
      allowFinderFormWhenLost: pet.allowFinderFormWhenLost,
    };
  const disclosurePrefs = parseDisclosurePrefsFromForm(formData, petDefaults);
  const enrichedDescription = parseEnrichedDescriptionFromForm(formData);

  const repo = new EventsRepository();

  const { broadcastLostPet } = await import("@/lib/lost-pet-broadcast");

  const result = await setPetLostWriter(
    {
      petId: pet.id,
      petPublicToken: pet.publicToken,
      petName: pet.name,
      petStatus: pet.status,
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
    },
    {
      repo,
      transaction: makeTransaction(),
      broadcastLostPet: broadcastLostPet as Parameters<
        typeof setPetLostWriter
      >[1]["broadcastLostPet"],
    },
  );

  if (result.error) return result;

  if (String(formData.get("noRedirect") ?? "") === "1") {
    return { error: null, ok: true };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Set pet found (WU-6 lifecycle)
// ---------------------------------------------------------------------------

export async function setPetFoundAction(publicToken: string): Promise<void> {
  // AUTH: requirePetAccess (accepts non-alive).
  const access = await requirePetAccess(publicToken);
  if (!access.ok) throw new Error(access.error);
  const { user, pet, eventAuthorship } = access;

  const repo = new EventsRepository();

  const result = await setPetFound(
    {
      petId: pet.id,
      petStatus: pet.status,
      petPublicToken: pet.publicToken,
      recordedByUserId: user.id,
      eventAuthorship: eventAuthorship as {
        authorRole: string;
        authorOrganizationId: string | null;
        authorVerified: boolean;
      },
    },
    { repo, transaction: makeTransaction() },
  );

  redirect(`/mis-mascotas/${publicToken}`);
}

// ---------------------------------------------------------------------------
// Death record (WU-6 lifecycle — multi-cascade)
// ---------------------------------------------------------------------------

export async function createDeathRecordAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  // AUTH: requirePetAccess (accepts non-alive — deceased guard is inside the writer).
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { supabase, user, pet, eventAuthorship } = access;

  if (pet.status === "deceased")
    return { error: "Esta mascota ya está registrada como fallecida." };

  const {
    DEATH_CAUSES: DC,
    DISPOSITION_METHODS: DM,
    VET_CONTACT_VALUES: VCV,
  } = await import("./domain/death-rules");

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

  if (!(DC as readonly string[]).includes(cause))
    return { error: "Causa de fallecimiento inválida." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };

  const dispositionMethod = dispositionMethodRaw === "" ? null : dispositionMethodRaw;
  if (dispositionMethod !== null && !(DM as readonly string[]).includes(dispositionMethod)) {
    return { error: "Método de disposición inválido." };
  }

  const vetContactedOwner = vetContactedOwnerRaw === "" ? null : vetContactedOwnerRaw;
  if (vetContactedOwner !== null && !(VCV as readonly string[]).includes(vetContactedOwner)) {
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
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  const diseaseCode = cause === "disease" && diseaseCodeRaw ? diseaseCodeRaw : null;
  if (diseaseCode && !findDisease(diseaseCode)) {
    return { error: "Enfermedad no reconocida." };
  }
  const { isReportable } = await import("@/lib/diseases");
  const reportable = isReportable(diseaseCode);

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  // Look up custody_episode BEFORE the tx — stamp caseId on the death event.
  const { findOpenCaseForPetAndKind } = await import("@/lib/case-helpers");
  const custodyEpisodeCaseForDeath = await findOpenCaseForPetAndKind(pet.id, "custody_episode");

  const repo = new EventsRepository();

  const result = await createDeathRecord(
    {
      pet: {
        id: pet.id,
        name: pet.name,
        status: pet.status,
        rabiesObservationStatus: pet.rabiesObservationStatus ?? null,
        jurisdictionProvince: pet.jurisdictionProvince ?? null,
        jurisdictionLocality: pet.jurisdictionLocality ?? null,
      },
      recordedByUserId: user.id,
      eventAuthorship: eventAuthorship as {
        authorRole: string;
        authorOrganizationId: string | null;
        authorVerified: boolean;
      },
      cause,
      causeDetail,
      confirmedByVet,
      vetName,
      dispositionMethod,
      facility,
      occurredAt,
      notes,
      deathAtClinic,
      clinicName,
      vetContactedOwner,
      vetDecidedAlone,
      ownerToPrivateCrematorium,
      diseaseCode,
      confirmedByLab,
      isReportable: reportable,
      uploadedPath: upload.uploadedPath,
      uploadedMimeType: upload.mimeType ?? null,
      uploadedSize: upload.size ?? null,
      clientIdempotencyKey,
      custodyEpisodeCaseId: custodyEpisodeCaseForDeath?.id ?? null,
    },
    {
      repo,
      transaction: makeTransaction(),
      flushNotifications,
    },
  );

  if (!result.ok) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el fallecimiento: ${result.error}`,
    };
  }

  redirect(`/mis-mascotas/${publicToken}`);
}
