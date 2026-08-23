"use server";

import { type EventFormState, cleanupAttachment, makeTransaction } from "./action-support";

// Re-exported because a dozen form components import the type from here. A
// `export type` is erased at compile time, so it adds no runtime export to a
// "use server" module — which may only expose async functions.
export type { EventFormState } from "./action-support";

// The clinical family lives in ./actions-medical.ts (size ratchet, 2026-08-21).
// NOT re-exported from here: Next refuses any `export … from` in a "use server"
// module — "Only async functions are allowed to be exported in a 'use server'
// file" — even when the re-exported bindings ARE async functions. typecheck,
// lint and the whole vitest suite passed on the re-export; only `next build`
// caught it. Callers import from ./actions-medical directly.

import { db, profiles } from "@/db";
import { pets } from "@/db";
import { CoordError, normalizeLocationForWrite } from "@/lib/domain/location-normalize";
import { parseLocationFromFormData } from "@/lib/domain/location-value";
import { checkOccurredAtPlausible } from "@/lib/events/plausibility";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { announceCaretakerDeathRecord } from "@/lib/infra/caretaker-activity-alert";
import { requireAlivePetAccess, requirePetAccess } from "@/lib/infra/pet-access";
import { uploadAttachmentIfPresent } from "@/lib/infra/uploads";
import { findDisease } from "@/lib/reference/diseases";
import { checkboxOn } from "@/lib/ui/form-checkbox";
import { parseDateInput } from "@/lib/utils/format";
import { and, eq } from "drizzle-orm";

import { enqueueEnoTrigger } from "@/src/modules/surveillance/application/enqueue-eno-trigger";
import { SurveillanceRepository } from "@/src/modules/surveillance/infrastructure/surveillance-repository";
import { createClinicalInfo } from "./application/clinical/clinical-info-use-case";
import { recordDiseaseDiagnosisWriter } from "./application/clinical/record-disease-diagnosis-use-case";
import { createVetVisit } from "./application/clinical/vet-visit-use-case";
import { createDangerousBreedAttestation } from "./application/identity/dangerous-breed-attestation-use-case";
import { createMicrochip } from "./application/identity/microchip-use-case";
import { createNote } from "./application/identity/note-use-case";
import { validateAttestationRegistry } from "./application/identity/validate-attestation-registry";
import { createDeathRecord } from "./application/lifecycle/death-record-use-case";
import { setPetFound } from "./application/lifecycle/set-pet-found-use-case";
import { setPetLostWriter } from "./application/lifecycle/set-pet-lost-use-case";
import { updateLostLastSeen } from "./application/lifecycle/update-lost-last-seen-use-case";
import { createSymptomObservedWriter } from "./application/surveillance/symptom-observed-use-case";
import { CLINICAL_SUB_KINDS } from "./domain/enums";

import { NOTE_CATEGORIES } from "./domain/enums";
import { EventsRepository } from "./infrastructure/events-repository";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// P4 item 1 (2026-07-08): shared IMPOSSIBLE-date guard for the medical/
// clinical/identity writers below that parse an occurred-at/date input.
// Bite actions (src/modules/surveillance/actions.ts) run the same guard at
// their own edge.
// ---------------------------------------------------------------------------

// Every caller in this module parses `occurredAt` from a date-only
// `<input type="date">` via `parseDateInput` (noon-UTC anchor), so the shared
// checkOccurredAtPlausible (lib/events/plausibility.ts) runs in date-only
// mode: the future check compares Argentine calendar days, never the noon-UTC
// instant against the wall clock (which rejected same-day submissions made
// before 09:05 AR).

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
  const plausibility = checkOccurredAtPlausible(occurredAt, pet.dateOfBirth);
  if (plausibility) return plausibility;

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  const repo = new EventsRepository();

  // ARCH-S: read canonical chip status (legacy pets.microchipId column dropped).
  const { fetchActiveIdentifications } = await import("@/lib/infra/pet-identifiers");
  const existingIds = await fetchActiveIdentifications(pet.id);

  try {
    const result = await createMicrochip(
      {
        pet: { id: pet.id, canonicalChipNumber: existingIds.microchip?.code ?? null },
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

  return { error: null, ok: true, redirectTo: `/mis-mascotas/${publicToken}` };
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

  // Lote A4 — the accepted registries mirror what the form OFFERED (the
  // per-jurisdiction rule; see validate-attestation-registry.ts).
  const registryError = await validateAttestationRegistry(registry, {
    province: pet.jurisdictionProvince,
    locality: pet.jurisdictionLocality,
  });
  if (registryError) return { error: registryError };
  if (!attestedAtRaw) return { error: "Falta la fecha de atestación." };
  const attestedAt = parseDateInput(attestedAtRaw);
  if (!attestedAt) return { error: "Fecha inválida." };
  const plausibility = checkOccurredAtPlausible(attestedAt, pet.dateOfBirth);
  if (plausibility) return plausibility;

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

  return { error: null, ok: true, redirectTo: `/mis-mascotas/${publicToken}` };
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
  const plausibility = checkOccurredAtPlausible(occurredAt, pet.dateOfBirth);
  if (plausibility) return plausibility;

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

  return { error: null, ok: true, redirectTo: `/mis-mascotas/${publicToken}` };
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
  const loc = parseLocationFromFormData(formData);
  // locality:"none" — canonicalize province only (vet_visit behavior unchanged).
  let normalizedLoc: Awaited<ReturnType<typeof normalizeLocationForWrite>>;
  try {
    normalizedLoc = await normalizeLocationForWrite(loc, { locality: "none" });
  } catch (err) {
    if (err instanceof CoordError) {
      return { error: err.message };
    }
    throw err;
  }
  const eventJurisdictionProvince = normalizedLoc.province;
  const eventJurisdictionLocality = normalizedLoc.locality;

  if (!reason) return { error: "Falta el motivo de la visita." };
  if (!occurredAtRaw) return { error: "Falta la fecha." };

  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };
  const plausibility = checkOccurredAtPlausible(occurredAt, pet.dateOfBirth);
  if (plausibility) return plausibility;

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

  return { error: null, ok: true, redirectTo: `/mis-mascotas/${publicToken}` };
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
  const loc = parseLocationFromFormData(formData);
  // locality:"none" — canonicalize province only (clinical_info behavior unchanged).
  let normalizedLoc: Awaited<ReturnType<typeof normalizeLocationForWrite>>;
  try {
    normalizedLoc = await normalizeLocationForWrite(loc, { locality: "none" });
  } catch (err) {
    if (err instanceof CoordError) {
      return { error: err.message };
    }
    throw err;
  }
  const eventJurisdictionProvince = normalizedLoc.province;
  const eventJurisdictionLocality = normalizedLoc.locality;

  if (!(CLINICAL_SUB_KINDS as readonly string[]).includes(subKindRaw)) {
    return { error: "Tipo de información clínica inválido." };
  }
  const subKind = subKindRaw;
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

  return { error: null, ok: true, redirectTo: `/mis-mascotas/${publicToken}` };
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
    // Web Push leg (ADR 2026-07-18 §4): urgent-only, best-effort, never throws.
    const { sendPushForNotifications } = await import("@/lib/infra/web-push");
    await sendPushForNotifications(pending);
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
  const confirmedByLab = checkboxOn(formData, "confirmedByLab");
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

  const plausibility = checkOccurredAtPlausible(diagnosisDate, pet.dateOfBirth);
  if (plausibility) return plausibility;

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
): import("./application/lifecycle/set-pet-lost-use-case").DisclosurePrefsInput {
  const checked = (name: string) => checkboxOn(formData, name);
  const hasSection = [
    "disclose_first_name_when_lost",
    "disclose_phone_when_lost",
    "disclose_email_when_lost",
    "disclose_last_location_when_lost",
    "allow_finder_form_when_lost",
  ].some((key) => formData.has(key));

  // cursor privacy P4: fail CLOSED. A caller that omits the disclosure section
  // entirely used to inherit the pet's current (possibly permissive) prefs via
  // a `petDefaults` fallback — but the only real caller (MarkLostWizard) always
  // submits all five fields explicitly via hidden inputs, so "section absent"
  // means no consent was expressed, not "keep whatever was there before".
  // Every toggle defaults to false rather than silently republishing PII.
  if (!hasSection) {
    return {
      discloseFirstNameWhenLost: false,
      disclosePhoneWhenLost: false,
      discloseEmailWhenLost: false,
      discloseLastLocationWhenLost: false,
      allowFinderFormWhenLost: false,
    };
  }

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
  /** Same `redirectTo` contract as EventFormState (see its docblock). */
  redirectTo?: string;
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

  // Guard the optional date-only onset (the writer stamps occurredAt from it;
  // an unparseable value falls back to "now" inside the use-case, so only a
  // successfully parsed onset needs the plausibility check).
  if (onsetAt) {
    const onsetDate = parseDateInput(onsetAt);
    if (onsetDate) {
      const plausibility = checkOccurredAtPlausible(onsetDate, pet.dateOfBirth);
      if (plausibility) return plausibility;
    }
  }

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
  return {
    error: null,
    ok: true,
    redirectTo: `/mis-mascotas/${publicToken}?evento=sintoma_registrado`,
  };
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

  // Validate coords through the gate.
  // - isFinite check preserved from before P2 (user error message unchanged).
  // - STEP 3 hardening: also reject out-of-range coords (previously not checked).
  if (locationLatRaw && locationLngRaw) {
    const latNum = Number.parseFloat(locationLatRaw);
    const lngNum = Number.parseFloat(locationLngRaw);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return { error: "Coordenadas inválidas. Tocá el mapa de nuevo para marcar el punto." };
    }
    if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return { error: "La ubicación está fuera de rango." };
    }
  }

  // Parse disclosure prefs from FormData (checkbox pattern). cursor privacy P4:
  // fails closed when the section is absent — see parseDisclosurePrefsFromForm.
  const disclosurePrefs = parseDisclosurePrefsFromForm(formData);
  const enrichedDescription = parseEnrichedDescriptionFromForm(formData);

  const repo = new EventsRepository();

  const { broadcastLostPet } = await import("@/lib/infra/lost-pet-broadcast");

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

  return { error: null, ok: true, redirectTo: `/mis-mascotas/${publicToken}` };
}

// ---------------------------------------------------------------------------
// Update lost last-seen (WU-6 lifecycle) — "ACTUALIZAR" on LostCaseBlock
// ---------------------------------------------------------------------------

// Re-export types only (no value re-exports in "use server" files).
export type {
  UpdateLostLastSeenParams,
  UpdateLostLastSeenResult,
} from "./application/lifecycle/update-lost-last-seen-use-case";

export async function updateLostLastSeenAction(
  publicToken: string,
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  // AUTH: requirePetAccess (accepts non-alive), same as setPetLostAction/
  // setPetFoundAction — the use-case itself rejects non-'lost' status.
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { user, pet, eventAuthorship } = access;

  const locationDescription = String(formData.get("locationAddress") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;

  const loc = parseLocationFromFormData(formData);
  // locality:"none" — this flow doesn't validate against the INDEC catalog
  // (parity with setPetLostAction's own last-seen point capture); coords are
  // optional (an owner may want to log a text-only update with no map pin).
  let normalizedLoc: Awaited<ReturnType<typeof normalizeLocationForWrite>>;
  try {
    normalizedLoc = await normalizeLocationForWrite(loc, { locality: "none" });
  } catch (err) {
    if (err instanceof CoordError) {
      return { error: err.message };
    }
    throw err;
  }

  // Compose the note text from the address/reference + free-text note — the
  // note_added payload has a single required `text` field (no separate
  // location_description like status_changed has).
  const text = [locationDescription, reason].filter(Boolean).join(" — ") || null;

  const repo = new EventsRepository();

  const result = await updateLostLastSeen(
    {
      petId: pet.id,
      petStatus: pet.status,
      recordedByUserId: user.id,
      eventAuthorship: eventAuthorship as {
        authorRole: string;
        authorOrganizationId: string | null;
        authorVerified: boolean;
      },
      text,
      locationDescription,
      locationLat: normalizedLoc.lat != null ? String(normalizedLoc.lat) : null,
      locationLng: normalizedLoc.lng != null ? String(normalizedLoc.lng) : null,
      clientIdempotencyKey,
    },
    { repo, transaction: makeTransaction() },
  );

  if (result.error) return { error: result.error };

  return { error: null, ok: true, redirectTo: `/mis-mascotas/${publicToken}` };
}

// ---------------------------------------------------------------------------
// Set pet found (WU-6 lifecycle)
// ---------------------------------------------------------------------------

export async function setPetFoundAction(
  publicToken: string,
  _previous: EventFormState,
  _formData: FormData,
): Promise<EventFormState> {
  // AUTH: requirePetAccess (accepts non-alive).
  const access = await requirePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { user, pet, eventAuthorship } = access;

  const repo = new EventsRepository();

  // Resolve the active TITULAR's user id so the recovery confirmation reaches
  // the human owner even when an org member triggers the action. Falls back to
  // the acting user when no owner-user row exists (e.g. org-owned pet).
  //
  // `role = 'owner'` is load-bearing and was missing until 2026-08-23: this is
  // the seventh instance of the `(pet_id, ended_at IS NULL)` + `limit(1)`
  // pattern, and the previous sweep (afd01fb3c) claimed the corpus was bounded
  // without having seen it. An accepted caretaker grant opens a SECOND active
  // ownerships row, so heap order decided who got the confirmation: the titular
  // marks their own pet found and "Marcaste a Luna como encontrada" lands on
  // the caretaker's phone, while the titular — who pressed the button — is
  // never told, and is then re-notified through the broadcast branch as if they
  // were a stranger who had been looking.
  //
  // A FILTER IS RIGHT HERE AND WAS WRONG IN THE SIGHTING FLOW, and the
  // difference is worth naming so the next reader does not copy the wrong half.
  // lib/infra/pet-alert-recipients.ts refuses a role filter because THERE the
  // read is a hard gate and an empty result cancels the whole action for a pet
  // in shelter custody. Here the `?? user.id` fallback below already absorbs an
  // empty result — a pet with no owner-user row confirms to whoever pressed the
  // button, which is the behaviour that fallback was written for. And the
  // ranking helper would be actively wrong: it returns a RECIPIENT SET with
  // concurrent caretakers, whereas this value is a single IDENTITY used twice —
  // as the addressee of a second-person confirmation ("Marcaste…", which only
  // the actor's titular can be told) and as the `userId === ownerUserId` key
  // that suppresses the duplicate broadcast notice. A set has no answer to
  // either question.
  const { ownerships } = await import("@/db");
  const { asc, isNull } = await import("drizzle-orm");
  const [ownerRow] = await db
    .select({ ownerUserId: ownerships.ownerUserId })
    .from(ownerships)
    .where(
      and(eq(ownerships.petId, pet.id), eq(ownerships.role, "owner"), isNull(ownerships.endedAt)),
    )
    .orderBy(asc(ownerships.startedAt))
    .limit(1);
  const ownerUserId = ownerRow?.ownerUserId ?? user.id;

  // Resolves the audience of the original lost_pet_broadcast for this pet by
  // reading the broadcast notification rows (relatedPetId scoped, distinct user).
  async function findBroadcastRecipientUserIds(petId: string): Promise<string[]> {
    const { notifications } = await import("@/db");
    const rows = await db
      .selectDistinct({ userId: notifications.userId })
      .from(notifications)
      .where(
        and(
          eq(notifications.notificationType, "lost_pet_broadcast"),
          eq(notifications.relatedPetId, petId),
        ),
      );
    return rows.map((r) => r.userId).filter((id): id is string => Boolean(id));
  }

  await setPetFound(
    {
      petId: pet.id,
      petStatus: pet.status,
      petPublicToken: pet.publicToken,
      petName: pet.name,
      petSex: pet.sex,
      recordedByUserId: user.id,
      ownerUserId,
      eventAuthorship: eventAuthorship as {
        authorRole: string;
        authorOrganizationId: string | null;
        authorVerified: boolean;
      },
    },
    {
      repo,
      transaction: makeTransaction(),
      findBroadcastRecipientUserIds,
      flushNotifications,
    },
  );

  return { error: null, ok: true, redirectTo: `/mis-mascotas/${publicToken}` };
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
  // A future death date is an impossible record (PO decision 2026-07-16 —
  // same family as the P4 guard on the medical writers above).
  const plausibility = checkOccurredAtPlausible(occurredAt, pet.dateOfBirth);
  if (plausibility) return plausibility;

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
  const { isReportable } = await import("@/lib/reference/diseases");
  const reportable = isReportable(diseaseCode);

  const attachmentFile = formData.get("attachment") as File | null;
  const upload = await uploadAttachmentIfPresent(supabase, attachmentFile, "event-attachments");
  if (upload.error) return { error: upload.error };

  // Look up custody_episode BEFORE the tx — stamp caseId on the death event.
  const { findOpenCaseForPetAndKind } = await import("@/lib/infra/case-helpers");
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

  // T9.13/T9.14 — gate, copy and failure policy in lib/infra/caretaker-activity-alert.ts.
  await announceCaretakerDeathRecord(access, result.insertedEventId);

  return { error: null, ok: true, redirectTo: `/mis-mascotas/${publicToken}` };
}
