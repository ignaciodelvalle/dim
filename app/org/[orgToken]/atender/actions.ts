"use server";

// Atender (walk-in clinical signing) server actions.
//
// These are thin, org-scoped edge actions for the walk-in case. They REUSE the
// exact clinical WRITERS (the events-module use-cases) and carry the #43
// provenance via `eventAuthorship` resolved by resolveAtenderPet — they do NOT
// reimplement the writer or the provenance logic. The only reason they exist
// separately from src/modules/events/actions.ts is the auth EDGE: the shared
// actions call requireAlivePetAccess (custody-gated), which fail-closes for a
// walk-in. Here the guard is resolveAtenderPet (event.write + DIM code, no
// custody). The writers themselves are custody-free, so nothing shared is
// weakened.
//
// Scope: CLINICAL events only (vacuna, desparasitación, cirugía/estudio,
// medicación, nota clínica). No custody/transfer/adoption; no owner PII.

import {
  FREQUENCY_LABELS,
  generateDoseSchedule,
  intervalHoursForFrequency,
  parseFrequencyFields,
} from "@/lib/reference/medication-schedule";

import { db } from "@/db";
import { checkOccurredAtPlausible } from "@/lib/events/plausibility";
import type { SupabaseServerClient } from "@/lib/infra/pet-access";
import { uploadAttachmentIfPresent } from "@/lib/infra/uploads";
import { findDrugByLabel } from "@/lib/reference/drugs";
import { findVaccineByName } from "@/lib/reference/lookups";
import { createClient } from "@/lib/supabase/server";
import { parseDateInput } from "@/lib/utils/format";

import type { EventFormState } from "@/src/modules/events/actions";
import { createClinicalInfo } from "@/src/modules/events/application/clinical/clinical-info-use-case";
import { createMicrochip } from "@/src/modules/events/application/identity/microchip-use-case";
import { createNote } from "@/src/modules/events/application/identity/note-use-case";
import { createDeworming } from "@/src/modules/events/application/medical/deworming-use-case";
import { createMedicationStart } from "@/src/modules/events/application/medical/medication-start-use-case";
import { createSterilization } from "@/src/modules/events/application/medical/sterilization-use-case";
import { createVaccination } from "@/src/modules/events/application/medical/vaccination-use-case";
import { CLINICAL_SUB_KINDS } from "@/src/modules/events/domain/enums";
import { EventsRepository } from "@/src/modules/events/infrastructure/events-repository";

import { ATENDER_TOKEN_PATTERN, normalizeAtenderToken, resolveAtenderPet } from "./atender-access";
import { attemptedChipMatchesDeclaration, rejectIfAlreadySigned } from "./atender-declared-events";
import { completeAtenderSignature } from "./atender-signature-completion";
import { hasUncataloguedVaccineFlag } from "./atender-vaccine-gate";

export type { EventFormState } from "@/src/modules/events/actions";

// ---------------------------------------------------------------------------
// Local plumbing (mirrors src/modules/events/actions.ts module-local helpers)
// ---------------------------------------------------------------------------

function makeTransaction(): <T>(cb: (tx: unknown) => Promise<T>) => Promise<T> {
  return <T>(cb: (tx: unknown) => Promise<T>) =>
    db.transaction(cb as Parameters<typeof db.transaction>[0]) as Promise<T>;
}

async function cleanupAttachment(supabase: SupabaseServerClient, path: string | null) {
  if (!path) return;
  try {
    await supabase.storage.from("event-attachments").remove([path]);
  } catch {
    // Swallow — orphaned file at worst.
  }
}

// authorship typing shim used by every writer (matches events/actions.ts)
type Authorship = {
  authorRole: string;
  authorOrganizationId: string | null;
  authorVerified: boolean;
};

// Every writer below closes through completeAtenderSignature — see that module's
// header. It owns BOTH the owner alert and the `?firmado=1` receipt, so success
// is not something a walk-in writer can construct on its own and the alert
// cannot be forgotten by a writer added later.

// ---------------------------------------------------------------------------
// Code entry — resolve a DIM credential to the signing surface
// ---------------------------------------------------------------------------

export async function lookupAtenderPetAction(
  orgToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const rawCode = String(formData.get("code") ?? "");
  const normalized = normalizeAtenderToken(rawCode);
  if (!normalized) return { error: "Ingresá el código de la credencial." };
  if (!ATENDER_TOKEN_PATTERN.test(normalized)) {
    return { error: "El formato del código es DIM-XXXX-XXXX." };
  }

  const access = await resolveAtenderPet(orgToken, normalized);
  if (!access.ok) return { error: access.error };

  return {
    error: null,
    ok: true,
    redirectTo: `/org/${orgToken}/atender/${access.pet.publicToken}`,
  };
}

// ---------------------------------------------------------------------------
// Vaccination
// ---------------------------------------------------------------------------

export async function atenderVaccinationAction(
  orgToken: string,
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await resolveAtenderPet(orgToken, publicToken);
  if (!access.ok) return { error: access.error };
  const { user, pet, eventAuthorship } = access;
  const supabase = await createClient();

  const vaccineName = String(formData.get("vaccineName") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const brand = String(formData.get("brand") ?? "").trim() || null;
  const batch = String(formData.get("batch") ?? "").trim() || null;
  const administeredBy = String(formData.get("administeredBy") ?? "").trim() || null;
  const nextDueAtRaw = String(formData.get("nextDueAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  if (!vaccineName) return { error: "Falta el nombre de la vacuna." };
  if (!occurredAtRaw) return { error: "Falta la fecha de aplicación." };
  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha de aplicación inválida." };
  // Same date-only plausibility guard as the owner edge (P4 item 1) — the
  // walk-in input is an <input type="date">, so AR calendar-day compare.
  const plausibility = checkOccurredAtPlausible(occurredAt, pet.dateOfBirth);
  if (plausibility) return plausibility;
  const nextDueAt = nextDueAtRaw ? parseDateInput(nextDueAtRaw) : null;
  if (nextDueAtRaw && !nextDueAt) return { error: "Fecha de próxima dosis inválida." };

  // THE HARD GATE, server-side mirror (#5, PO decision, defense in depth): a
  // vaccine name outside the catalog must never commit unless it's explicitly
  // flagged as uncatalogued in notes — the client picker (AtenderVaccinationGate)
  // is the primary gate; this is the backstop for a client that skips it.
  if (!hasUncataloguedVaccineFlag(notes) && !findVaccineByName(vaccineName)) {
    return {
      error:
        "Esa vacuna no está en el catálogo. Elegí una del listado o marcala como no catalogada en las notas.",
    };
  }

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const repo = new EventsRepository();
  let signedEventId: string | null = null;
  try {
    const result = await createVaccination(
      {
        pet: { id: pet.id },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as Authorship,
        vaccineName,
        occurredAt,
        brand,
        batch,
        administeredBy,
        nextDueAt,
        notes,
        sourceReminderId: null,
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
    signedEventId = result.value?.eventId ?? null;
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la vacuna: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  // Closed AFTER the try/catch, always: the owner alert inside is POST-COMMIT, so
  // a hypothetical throw there can never reach cleanupAttachment and delete the
  // attachment of an event that already persisted.
  return completeAtenderSignature({
    orgToken,
    publicToken,
    petId: pet.id,
    petName: pet.name,
    organizationName: access.organizationName,
    signerUserId: user.id,
    eventId: signedEventId,
    eventType: "vaccination_administered",
    occurredAt,
  });
}

// ---------------------------------------------------------------------------
// Deworming
// ---------------------------------------------------------------------------

export async function atenderDewormingAction(
  orgToken: string,
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await resolveAtenderPet(orgToken, publicToken);
  if (!access.ok) return { error: access.error };
  const { user, pet, eventAuthorship } = access;
  const supabase = await createClient();

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
  const plausibility = checkOccurredAtPlausible(occurredAt, pet.dateOfBirth);
  if (plausibility) return plausibility;
  const nextDueAt = nextDueAtRaw ? parseDateInput(nextDueAtRaw) : null;
  if (nextDueAtRaw && !nextDueAt) return { error: "Fecha de próxima dosis inválida." };

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const repo = new EventsRepository();
  let signedEventId: string | null = null;
  try {
    const result = await createDeworming(
      {
        pet: { id: pet.id, name: pet.name },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as Authorship,
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
    signedEventId = result.value?.eventId ?? null;
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el antiparasitario: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return completeAtenderSignature({
    orgToken,
    publicToken,
    petId: pet.id,
    petName: pet.name,
    organizationName: access.organizationName,
    signerUserId: user.id,
    eventId: signedEventId,
    eventType: "deworming_administered",
    occurredAt,
  });
}

// ---------------------------------------------------------------------------
// Clinical info (cirugía / estudio clínico)
// ---------------------------------------------------------------------------

export async function atenderClinicalInfoAction(
  orgToken: string,
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await resolveAtenderPet(orgToken, publicToken);
  if (!access.ok) return { error: access.error };
  const { user, pet, eventAuthorship } = access;
  const supabase = await createClient();

  const subKindRaw = String(formData.get("subKind") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim() || null;
  const performedBy = String(formData.get("performedBy") ?? "").trim() || null;
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  if (!(CLINICAL_SUB_KINDS as readonly string[]).includes(subKindRaw)) {
    return { error: "Tipo de información clínica inválido." };
  }
  if (!title) return { error: "Falta el título / nombre del estudio o procedimiento." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };
  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };
  const plausibility = checkOccurredAtPlausible(occurredAt, pet.dateOfBirth);
  if (plausibility) return plausibility;

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const repo = new EventsRepository();
  let signedEventId: string | null = null;
  try {
    const result = await createClinicalInfo(
      {
        pet: { id: pet.id },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as Authorship,
        subKind: subKindRaw,
        title,
        details,
        performedBy,
        occurredAt,
        notes,
        // Walk-in surface does not capture per-event jurisdiction; the pet's
        // own jurisdiction is the projection default (parity with owner flow
        // when location is left blank).
        eventJurisdictionProvince: null,
        eventJurisdictionLocality: null,
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
    signedEventId = result.value?.eventId ?? null;
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo guardar la información clínica: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return completeAtenderSignature({
    orgToken,
    publicToken,
    petId: pet.id,
    petName: pet.name,
    organizationName: access.organizationName,
    signerUserId: user.id,
    eventId: signedEventId,
    eventType: "clinical_info_logged",
    occurredAt,
  });
}

// ---------------------------------------------------------------------------
// Medication start
// ---------------------------------------------------------------------------

export async function atenderMedicationStartAction(
  orgToken: string,
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await resolveAtenderPet(orgToken, publicToken);
  if (!access.ok) return { error: access.error };
  const { user, pet, eventAuthorship } = access;
  const supabase = await createClient();

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
  const plausibility = checkOccurredAtPlausible(occurredAt, pet.dateOfBirth);
  if (plausibility) return plausibility;

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
    frequency: import("@/lib/reference/drugs").FrequencyKind;
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
  let signedEventId: string | null = null;
  try {
    const result = await createMedicationStart(
      {
        pet: { id: pet.id, name: pet.name },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as Authorship,
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
    signedEventId = result.value?.eventId ?? null;
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la medicación: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return completeAtenderSignature({
    orgToken,
    publicToken,
    petId: pet.id,
    petName: pet.name,
    organizationName: access.organizationName,
    signerUserId: user.id,
    eventId: signedEventId,
    eventType: "medication_started",
    occurredAt,
  });
}

// ---------------------------------------------------------------------------
// Clinical note
// ---------------------------------------------------------------------------

export async function atenderNoteAction(
  orgToken: string,
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await resolveAtenderPet(orgToken, publicToken);
  if (!access.ok) return { error: access.error };
  const { user, pet, eventAuthorship } = access;
  const supabase = await createClient();

  const text = String(formData.get("text") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  if (!text) return { error: "Falta el contenido de la nota." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };
  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };
  const plausibility = checkOccurredAtPlausible(occurredAt, pet.dateOfBirth);
  if (plausibility) return plausibility;

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const repo = new EventsRepository();
  let signedEventId: string | null = null;
  try {
    const result = await createNote(
      {
        pet: { id: pet.id },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as Authorship,
        text,
        occurredAt,
        // Clinical note — category is owner-facing taxonomy; leave null here.
        category: null,
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
    signedEventId = result.value?.eventId ?? null;
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo guardar la nota: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return completeAtenderSignature({
    orgToken,
    publicToken,
    petId: pet.id,
    petName: pet.name,
    organizationName: access.organizationName,
    signerUserId: user.id,
    eventId: signedEventId,
    eventType: "note_added",
    occurredAt,
  });
}

// ---------------------------------------------------------------------------
// Microchip — declared-by-owner sign-off (#3, #43 keystone extension)
// ---------------------------------------------------------------------------
//
// Same #43 provenance mechanism the vaccine keystone already uses (this file,
// atenderVaccinationAction): the writer is CUSTODY-FREE and takes the SIGNER's
// eventAuthorship from resolveAtenderPet, so a matriculated vet's chip
// confirmation lands as verified_professional exactly like every other
// atender-signed event. `confirmEventId`, when present, is the pet_event id
// of the owner-declared row this submission confirms — bound as a SERVER
// ACTION ARGUMENT (see AtenderCaptureMounter's .bind), not a form field, so a
// client cannot forge which declared event a signature targets. Append-only:
// rejectIfAlreadySigned only reads that row; this action always INSERTS a new
// event, never edits the original.

export async function atenderMicrochipAction(
  orgToken: string,
  publicToken: string,
  confirmEventId: string | null,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await resolveAtenderPet(orgToken, publicToken);
  if (!access.ok) return { error: access.error };
  const { user, pet, eventAuthorship } = access;
  const supabase = await createClient();

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
  const plausibility = checkOccurredAtPlausible(occurredAt, pet.dateOfBirth);
  if (plausibility) return plausibility;

  if (confirmEventId) {
    const rejected = await rejectIfAlreadySigned(
      pet.id,
      "microchip_implanted",
      confirmEventId,
      eventAuthorship,
    );
    if (rejected) return rejected;

    // Proof of scan. The pending-signatures card no longer shows or prefills
    // the declared number (see toPendingDeclaredEvent), so the signer types
    // what they read off the scanner. Without this the typed value and the
    // declaration could diverge and we would still mark THAT declaration
    // professionally verified — stamping a number it never contained onto an
    // append-only record. The comparison lives in the SQL predicate; the
    // declared value is never selected.
    const matches = await attemptedChipMatchesDeclaration(pet.id, confirmEventId, chipNumber);
    if (!matches) {
      return {
        error:
          "El número no coincide con el microchip declarado por la persona responsable. Verificá la lectura del escáner.",
      };
    }
  }

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  // ARCH-S parity with the owner action: read canonical chip status (legacy
  // pets.microchipId column dropped).
  const { fetchActiveIdentifications } = await import("@/lib/infra/pet-identifiers");
  const existingIds = await fetchActiveIdentifications(pet.id);

  const repo = new EventsRepository();
  let signedEventId: string | null = null;
  try {
    const result = await createMicrochip(
      {
        pet: { id: pet.id, canonicalChipNumber: existingIds.microchip?.code ?? null },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as Authorship,
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
    signedEventId = result.value?.eventId ?? null;
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar el microchip: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return completeAtenderSignature({
    orgToken,
    publicToken,
    petId: pet.id,
    petName: pet.name,
    organizationName: access.organizationName,
    signerUserId: user.id,
    eventId: signedEventId,
    eventType: "microchip_implanted",
    occurredAt,
  });
}

// ---------------------------------------------------------------------------
// Sterilization — declared-by-owner sign-off (#3, #43 keystone extension)
// ---------------------------------------------------------------------------
//
// See atenderMicrochipAction above for the shared rationale (same #43
// provenance mechanism, same confirmEventId/append-only contract).

export async function atenderSterilizationAction(
  orgToken: string,
  publicToken: string,
  confirmEventId: string | null,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const access = await resolveAtenderPet(orgToken, publicToken);
  if (!access.ok) return { error: access.error };
  const { user, pet, eventAuthorship } = access;
  const supabase = await createClient();

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
  const plausibility = checkOccurredAtPlausible(occurredAt, pet.dateOfBirth);
  if (plausibility) return plausibility;

  if (confirmEventId) {
    const rejected = await rejectIfAlreadySigned(
      pet.id,
      "sterilization_performed",
      confirmEventId,
      eventAuthorship,
    );
    if (rejected) return rejected;
  }

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const repo = new EventsRepository();
  let signedEventId: string | null = null;
  try {
    const result = await createSterilization(
      {
        pet: { id: pet.id },
        user: { id: user.id },
        eventAuthorship: eventAuthorship as Authorship,
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
    signedEventId = result.value?.eventId ?? null;
  } catch (err) {
    await cleanupAttachment(supabase, upload.uploadedPath);
    return {
      error: `No se pudo registrar la esterilización: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  return completeAtenderSignature({
    orgToken,
    publicToken,
    petId: pet.id,
    petName: pet.name,
    organizationName: access.organizationName,
    signerUserId: user.id,
    eventId: signedEventId,
    eventType: "sterilization_performed",
    occurredAt,
  });
}
