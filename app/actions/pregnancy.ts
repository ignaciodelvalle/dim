"use server";

// pregnancy.ts — thin shim (strangler migration 18/61).
//
// Business logic moved to:
//   src/modules/pets/application/pregnancy/
//
// This file re-exports the 2 pregnancy writers (used by integration tests)
// and provides the 2 auth-guarded action wrappers for UI components.
//
// CRITICAL: Every runtime export in a "use server" file must be an async
// function. Types are re-exported with `export type` (erased at runtime).

import { redirect } from "next/navigation";

import { parseDateInput } from "@/lib/format";
import { requireAlivePetAccess } from "@/lib/pet-access";
import { recordPregnancyEndedWriter as _recordPregnancyEndedWriter } from "@/src/modules/pets/application/pregnancy/record-pregnancy-ended";
import { recordPregnancyStartedWriter as _recordPregnancyStartedWriter } from "@/src/modules/pets/application/pregnancy/record-pregnancy-started";
import { PREGNANCY_OUTCOMES } from "@/src/modules/pets/application/pregnancy/types";
import type {
  PregnancyFormState,
  PregnancyOutcome,
  RecordPregnancyEndedParams,
  RecordPregnancyResult,
  RecordPregnancyStartedParams,
} from "@/src/modules/pets/application/pregnancy/types";

// ---------------------------------------------------------------------------
// Type re-exports (erased at runtime — allowed in "use server" files)
// ---------------------------------------------------------------------------

export type {
  PregnancyFormState,
  RecordPregnancyEndedParams,
  RecordPregnancyResult,
  RecordPregnancyStartedParams,
} from "@/src/modules/pets/application/pregnancy/types";

// ---------------------------------------------------------------------------
// Writer re-exports — async wrappers (used by integration tests)
// ---------------------------------------------------------------------------

export async function recordPregnancyStartedWriter(
  params: RecordPregnancyStartedParams,
): Promise<RecordPregnancyResult> {
  return _recordPregnancyStartedWriter(params);
}

export async function recordPregnancyEndedWriter(
  params: RecordPregnancyEndedParams,
): Promise<RecordPregnancyResult> {
  return _recordPregnancyEndedWriter(params);
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

  const result = await _recordPregnancyStartedWriter({
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

  const result = await _recordPregnancyEndedWriter({
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
