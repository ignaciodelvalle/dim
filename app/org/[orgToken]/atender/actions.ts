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
import { notifyOwnersOfClinicalEvent } from "@/lib/infra/notify-owners-of-clinical-event";
import type { SupabaseServerClient } from "@/lib/infra/pet-access";
import { uploadAttachmentIfPresent } from "@/lib/infra/uploads";
import { findDrugByLabel } from "@/lib/reference/drugs";
import { createClient } from "@/lib/supabase/server";
import { parseDateInput } from "@/lib/utils/format";

import type { EventFormState } from "@/src/modules/events/actions";
import { createClinicalInfo } from "@/src/modules/events/application/clinical/clinical-info-use-case";
import { createNote } from "@/src/modules/events/application/identity/note-use-case";
import { createDeworming } from "@/src/modules/events/application/medical/deworming-use-case";
import { createMedicationStart } from "@/src/modules/events/application/medical/medication-start-use-case";
import { createVaccination } from "@/src/modules/events/application/medical/vaccination-use-case";
import { CLINICAL_SUB_KINDS } from "@/src/modules/events/domain/enums";
import { EventsRepository } from "@/src/modules/events/infrastructure/events-repository";

import { ATENDER_TOKEN_PATTERN, normalizeAtenderToken, resolveAtenderPet } from "./atender-access";

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

function successRedirect(orgToken: string, publicToken: string): string {
  return `/org/${orgToken}/atender/${publicToken}?firmado=1`;
}

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

  // Owner alert for the third-party signature — best-effort and POST-COMMIT: run
  // it AFTER the try/catch so a hypothetical throw in the helper can never trigger
  // cleanupAttachment on an already-persisted event. The helper swallows its own
  // errors (see lib/infra/notify-owners-of-clinical-event.ts).
  if (signedEventId) {
    await notifyOwnersOfClinicalEvent({
      petId: pet.id,
      petName: pet.name,
      petPublicToken: publicToken,
      eventId: signedEventId,
      eventType: "vaccination_administered",
      authorUserId: user.id,
      authorLabel: access.organizationName,
    });
  }

  return { error: null, ok: true, redirectTo: successRedirect(orgToken, publicToken) };
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

  // Owner alert — best-effort, POST-COMMIT (outside the try so a helper throw can
  // never clean up an already-persisted event; the helper swallows its own errors).
  if (signedEventId) {
    await notifyOwnersOfClinicalEvent({
      petId: pet.id,
      petName: pet.name,
      petPublicToken: publicToken,
      eventId: signedEventId,
      eventType: "deworming_administered",
      authorUserId: user.id,
      authorLabel: access.organizationName,
    });
  }

  return { error: null, ok: true, redirectTo: successRedirect(orgToken, publicToken) };
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

  // Owner alert — best-effort, POST-COMMIT (outside the try so a helper throw can
  // never clean up an already-persisted event; the helper swallows its own errors).
  if (signedEventId) {
    await notifyOwnersOfClinicalEvent({
      petId: pet.id,
      petName: pet.name,
      petPublicToken: publicToken,
      eventId: signedEventId,
      eventType: "clinical_info_logged",
      authorUserId: user.id,
      authorLabel: access.organizationName,
    });
  }

  return { error: null, ok: true, redirectTo: successRedirect(orgToken, publicToken) };
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

  // Owner alert — best-effort, POST-COMMIT (outside the try so a helper throw can
  // never clean up an already-persisted event; the helper swallows its own errors).
  if (signedEventId) {
    await notifyOwnersOfClinicalEvent({
      petId: pet.id,
      petName: pet.name,
      petPublicToken: publicToken,
      eventId: signedEventId,
      eventType: "medication_started",
      authorUserId: user.id,
      authorLabel: access.organizationName,
    });
  }

  return { error: null, ok: true, redirectTo: successRedirect(orgToken, publicToken) };
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

  // Owner alert — best-effort, POST-COMMIT (outside the try so a helper throw can
  // never clean up an already-persisted event; the helper swallows its own errors).
  if (signedEventId) {
    await notifyOwnersOfClinicalEvent({
      petId: pet.id,
      petName: pet.name,
      petPublicToken: publicToken,
      eventId: signedEventId,
      eventType: "note_added",
      authorUserId: user.id,
      authorLabel: access.organizationName,
    });
  }

  return { error: null, ok: true, redirectTo: successRedirect(orgToken, publicToken) };
}
