"use server";

// Pregnancy lifecycle actions — spec 2026-05-19-pregnancy-tracking-design.
//
// Two paired actions:
//   - recordPregnancyStartedAction → opens a pregnancy (sub_kind='pregnancy',
//     pregnancy_phase='started'), flips pets.pregnancy_status='in_progress',
//     and generates biweekly checkup reminders until the expected birth date.
//   - recordPregnancyEndedAction → closes the open pregnancy with an outcome,
//     flips pets.pregnancy_status='completed_{outcome}', cancels pending
//     reminders tied to the started event.
//
// Each action delegates to a `*Writer` core function — the writer is exported
// for integration tests so they bypass the Next.js request context (same
// pattern as createSymptomObservedWriter / recordDiseaseDiagnosisWriter).

import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { type Pet, db, notifications, petEvents, pets, reminders } from "@/db";
import { validateEventPayload } from "@/lib/event-schemas";
import { parseDateInput } from "@/lib/format";
import { type PetEventAuthorship, requireAlivePetAccess } from "@/lib/pet-access";

export type PregnancyFormState = { error: string | null };

// Species-specific gestation window. Spec PR6 + §9 reminders.
const PREGNANCY_DURATION_WEEKS: Record<string, number> = {
  dog: 9,
  cat: 9,
  other: 9,
};

const PREGNANCY_OUTCOMES = [
  "live_birth",
  "stillbirth",
  "miscarriage",
  "termination",
  "unknown",
] as const;
type PregnancyOutcome = (typeof PREGNANCY_OUTCOMES)[number];

function statusFromOutcome(outcome: PregnancyOutcome): string {
  return `completed_${outcome}`;
}

// ---------------------------------------------------------------------------
// Writer — recordPregnancyStartedWriter
// ---------------------------------------------------------------------------

export type RecordPregnancyStartedParams = {
  pet: Pick<Pet, "id" | "sex" | "species" | "pregnancyStatus" | "publicToken">;
  recordedByUserId: string;
  eventAuthorship: PetEventAuthorship;
  occurredAt: Date;
  weeksAtDiagnosis: number | null;
  vetConsulted: string | null;
  notes: string | null;
  now?: Date;
};

export type RecordPregnancyResult =
  | { ok: true; eventId: string; reminderCount: number }
  | { ok: false; error: string };

export async function recordPregnancyStartedWriter(
  params: RecordPregnancyStartedParams,
): Promise<RecordPregnancyResult> {
  if (params.pet.sex !== "female") {
    return { ok: false, error: "Solo se pueden registrar embarazos en hembras." };
  }
  if (!Object.hasOwn(PREGNANCY_DURATION_WEEKS, params.pet.species)) {
    return { ok: false, error: "Especie no soportada para embarazos." };
  }
  if (params.pet.pregnancyStatus === "in_progress") {
    return {
      ok: false,
      error:
        "Esta mascota ya tiene un embarazo en seguimiento. Cerralo primero antes de registrar uno nuevo.",
    };
  }

  const now = params.now ?? new Date();
  const speciesWeeks = PREGNANCY_DURATION_WEEKS[params.pet.species];
  const weeksRemaining =
    params.weeksAtDiagnosis !== null
      ? Math.max(speciesWeeks - params.weeksAtDiagnosis, 0)
      : speciesWeeks;
  const expectedBirthAt = new Date(params.occurredAt.getTime() + weeksRemaining * 7 * 86400000);

  let eventId = "";
  let reminderCount = 0;
  try {
    await db.transaction(async (tx) => {
      const payload = validateEventPayload("clinical_info_logged", {
        sub_kind: "pregnancy",
        pregnancy_phase: "started",
        title: "Embarazo en seguimiento",
        details: null,
        performed_by: params.vetConsulted,
        weeks_at_diagnosis: params.weeksAtDiagnosis,
        vet_consulted: params.vetConsulted,
      });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: params.pet.id,
          eventType: "clinical_info_logged",
          occurredAt: params.occurredAt,
          recordedAt: now,
          recordedByUserId: params.recordedByUserId,
          ...params.eventAuthorship,
          payload,
          notes: params.notes,
        })
        .returning();
      eventId = event.id;

      await tx
        .update(pets)
        .set({ pregnancyStatus: "in_progress" })
        .where(eq(pets.id, params.pet.id));

      // Biweekly checkup reminders until expected birth date.
      const reminderRows: (typeof reminders.$inferInsert)[] = [];
      const TWO_WEEKS_MS = 14 * 86400000;
      let cursor = new Date(params.occurredAt.getTime() + TWO_WEEKS_MS);
      while (cursor < expectedBirthAt) {
        reminderRows.push({
          petId: params.pet.id,
          userId: params.recordedByUserId,
          reminderType: "custom",
          dueAt: cursor,
          title: "Control veterinario de embarazo",
          description: "Recordatorio quincenal sugerido durante la gestación.",
          sourceEventId: event.id,
        });
        cursor = new Date(cursor.getTime() + TWO_WEEKS_MS);
      }
      if (reminderRows.length > 0) {
        await tx.insert(reminders).values(reminderRows);
        reminderCount = reminderRows.length;
      }

      await tx.insert(notifications).values({
        userId: params.recordedByUserId,
        notificationType: "pregnancy_started_owner",
        severity: "info",
        title: "Embarazo en seguimiento",
        body: "Te recomendamos llevar a tu mascota a controles veterinarios regulares durante la gestación.",
        relatedPetId: params.pet.id,
        relatedEventId: event.id,
        ctaLabel: "Ver mascota",
        ctaUrl: `/mis-mascotas/${params.pet.publicToken}`,
      });
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "error desconocido" };
  }

  return { ok: true, eventId, reminderCount };
}

// ---------------------------------------------------------------------------
// Writer — recordPregnancyEndedWriter
// ---------------------------------------------------------------------------

export type RecordPregnancyEndedParams = {
  pet: Pick<Pet, "id" | "pregnancyStatus" | "publicToken" | "name">;
  recordedByUserId: string;
  eventAuthorship: PetEventAuthorship;
  occurredAt: Date;
  outcome: PregnancyOutcome;
  liveBirthsCount: number | null;
  vetConsulted: string | null;
  notes: string | null;
  now?: Date;
};

export async function recordPregnancyEndedWriter(
  params: RecordPregnancyEndedParams,
): Promise<RecordPregnancyResult> {
  if (params.pet.pregnancyStatus !== "in_progress") {
    return {
      ok: false,
      error: "Esta mascota no tiene un embarazo activo para cerrar.",
    };
  }
  if (params.outcome !== "live_birth" && params.liveBirthsCount !== null) {
    return {
      ok: false,
      error: "live_births_count solo es válido si el resultado es parto exitoso.",
    };
  }
  if (params.outcome === "live_birth" && (params.liveBirthsCount ?? 0) < 1) {
    return { ok: false, error: "Indicá la cantidad de crías nacidas vivas (mínimo 1)." };
  }

  const now = params.now ?? new Date();
  let eventId = "";
  try {
    await db.transaction(async (tx) => {
      const payload = validateEventPayload("clinical_info_logged", {
        sub_kind: "pregnancy",
        pregnancy_phase: "ended",
        title: "Fin del embarazo",
        details: null,
        performed_by: params.vetConsulted,
        outcome: params.outcome,
        live_births_count: params.outcome === "live_birth" ? params.liveBirthsCount : null,
        vet_consulted: params.vetConsulted,
      });
      const [event] = await tx
        .insert(petEvents)
        .values({
          petId: params.pet.id,
          eventType: "clinical_info_logged",
          occurredAt: params.occurredAt,
          recordedAt: now,
          recordedByUserId: params.recordedByUserId,
          ...params.eventAuthorship,
          payload,
          notes: params.notes,
        })
        .returning();
      eventId = event.id;

      await tx
        .update(pets)
        .set({ pregnancyStatus: statusFromOutcome(params.outcome) })
        .where(eq(pets.id, params.pet.id));

      // Cancel future pregnancy checkup reminders tied to the open
      // pregnancy_started event(s) of this pet. Filter on payload.sub_kind
      // so unrelated clinical_info_logged rows don't get touched.
      const startedEvents = await tx
        .select({ id: petEvents.id })
        .from(petEvents)
        .where(
          and(
            eq(petEvents.petId, params.pet.id),
            eq(petEvents.eventType, "clinical_info_logged"),
            sql`${petEvents.payload}->>'sub_kind' = 'pregnancy'`,
            sql`${petEvents.payload}->>'pregnancy_phase' = 'started'`,
          ),
        );
      const startedIds = startedEvents.map((r) => r.id);
      if (startedIds.length > 0) {
        await tx
          .update(reminders)
          .set({ completedAt: now })
          .where(
            and(
              inArray(reminders.sourceEventId, startedIds),
              isNull(reminders.completedAt),
              gt(reminders.dueAt, now),
            ),
          );
      }

      // Owner notification — copy varies by outcome (spec §5.2 step 5-6).
      const owner = params.recordedByUserId;
      let title = "";
      let body = "";
      if (params.outcome === "live_birth") {
        title = `¡Felicitaciones! Quedó registrado el parto de ${params.pet.name}`;
        body = "Acabás de desbloquear el logro 'Tuve crías' en el perfil de tu mascota.";
      } else if (params.outcome === "stillbirth" || params.outcome === "miscarriage") {
        title = `Cierre del embarazo de ${params.pet.name}`;
        body =
          "Lamentamos la pérdida. Te recomendamos un seguimiento veterinario en los próximos días.";
      } else {
        title = `Cierre del embarazo de ${params.pet.name}`;
        body = "Quedó registrado en la libreta.";
      }
      await tx.insert(notifications).values({
        userId: owner,
        notificationType: "pregnancy_ended_owner",
        severity: params.outcome === "live_birth" ? "success" : "info",
        title,
        body,
        relatedPetId: params.pet.id,
        relatedEventId: event.id,
        ctaLabel: "Ver mascota",
        ctaUrl: `/mis-mascotas/${params.pet.publicToken}`,
      });
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "error desconocido" };
  }
  return { ok: true, eventId, reminderCount: 0 };
}

// ---------------------------------------------------------------------------
// Server actions (form wrappers)
// ---------------------------------------------------------------------------

export async function recordPregnancyStartedAction(
  publicToken: string,
  _previous: PregnancyFormState,
  formData: FormData,
): Promise<PregnancyFormState> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { user, pet, eventAuthorship } = access;

  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const weeksRaw = String(formData.get("weeksAtDiagnosis") ?? "").trim();
  const vetConsulted = String(formData.get("vetConsulted") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!occurredAtRaw) return { error: "Falta la fecha estimada de inicio." };
  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha de inicio inválida." };

  let weeksAtDiagnosis: number | null = null;
  if (weeksRaw) {
    const parsed = Number.parseInt(weeksRaw, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 12) {
      return { error: "Semanas al diagnóstico debe ser un número entre 0 y 12." };
    }
    weeksAtDiagnosis = parsed;
  }

  const result = await recordPregnancyStartedWriter({
    pet,
    recordedByUserId: user.id,
    eventAuthorship,
    occurredAt,
    weeksAtDiagnosis,
    vetConsulted,
    notes,
  });
  if (!result.ok) return { error: result.error };
  redirect(`/mis-mascotas/${publicToken}`);
}

export async function recordPregnancyEndedAction(
  publicToken: string,
  _previous: PregnancyFormState,
  formData: FormData,
): Promise<PregnancyFormState> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { user, pet, eventAuthorship } = access;

  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const outcomeRaw = String(formData.get("outcome") ?? "").trim();
  const liveBirthsRaw = String(formData.get("liveBirthsCount") ?? "").trim();
  const vetConsulted = String(formData.get("vetConsulted") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!occurredAtRaw) return { error: "Falta la fecha del cierre." };
  const occurredAt = parseDateInput(occurredAtRaw);
  if (!occurredAt) return { error: "Fecha inválida." };
  if (!(PREGNANCY_OUTCOMES as readonly string[]).includes(outcomeRaw)) {
    return { error: "Resultado inválido." };
  }
  const outcome = outcomeRaw as PregnancyOutcome;

  let liveBirthsCount: number | null = null;
  if (outcome === "live_birth") {
    const parsed = Number.parseInt(liveBirthsRaw, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 20) {
      return { error: "Cantidad de crías debe ser entre 1 y 20." };
    }
    liveBirthsCount = parsed;
  }

  const result = await recordPregnancyEndedWriter({
    pet,
    recordedByUserId: user.id,
    eventAuthorship,
    occurredAt,
    outcome,
    liveBirthsCount,
    vetConsulted,
    notes,
  });
  if (!result.ok) return { error: result.error };
  redirect(`/mis-mascotas/${publicToken}`);
}
