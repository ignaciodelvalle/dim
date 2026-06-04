"use server";

// Server actions for the outbreak investigation management surface.
// Legal frame: Ley 15.465/60 + Decreto 3640/64.
// External notification (SNVS/SENASA/zoonosis) NOT integrated - v1_noop=true in audit rows.

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { type AuditLogAction, auditLog, cases, db, investigationNotes } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { notifyOutbreakInvestigationOpened } from "@/lib/authority";
import { closeCase, escalateCase, openCase } from "@/lib/case-helpers";
import { isEnoCode } from "@/lib/eno-catalog";

export type OutbreakInvestigationActionResult =
  | { ok: true; publicCode: string }
  | { error: string };

export type OutbreakInvestigationNoteResult = { ok: true } | { error: string };

export type InvestigationNoteEntryType =
  | "dataset_classification"
  | "lab_result"
  | "control_action"
  | "contact_tracing"
  | "general_note"
  | "final_report";

// --- openOutbreakInvestigationAction ---
export async function openOutbreakInvestigationAction(input: {
  diseaseCode: string;
  reason: string;
  linkedSignalEventId?: string | null;
}): Promise<OutbreakInvestigationActionResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const { user, profile, jurisdictions } = session;

  if (!input.diseaseCode?.trim() || !isEnoCode(input.diseaseCode.trim())) {
    return { error: "El codigo de enfermedad no esta en el catalogo ENO." };
  }
  const diseaseCode = input.diseaseCode.trim();

  if (!input.reason?.trim() || input.reason.trim().length < 10) {
    return { error: "El motivo debe tener al menos 10 caracteres." };
  }

  let jurisdictionProvince: string | null = null;
  let jurisdictionLocality: string | null = null;

  if (profile.role === "govt") {
    if (jurisdictions.length === 0) {
      return { error: "No tenes jurisdicciones activas asignadas. Contacta al administrador." };
    }
    jurisdictionProvince = jurisdictions[0].province;
    jurisdictionLocality = jurisdictions[0].locality;
  }

  const openedReasonPrefix = `manual [${diseaseCode}]:`;

  const existingRows = await db
    .select({ id: cases.id, publicCode: cases.publicCode, openedReason: cases.openedReason })
    .from(cases)
    .where(
      and(
        eq(cases.caseKind, "outbreak_investigation"),
        inArray(cases.status, ["open", "escalated"]),
        jurisdictionProvince
          ? and(
              eq(cases.jurisdictionProvince, jurisdictionProvince),
              eq(cases.jurisdictionLocality, jurisdictionLocality ?? ""),
            )
          : eq(cases.jurisdictionCountry, "AR"),
      ),
    )
    .limit(50);

  const duplicateForDisease = existingRows.find((r) =>
    r.openedReason?.startsWith(openedReasonPrefix),
  );
  if (duplicateForDisease) {
    return {
      error: `Ya existe una investigacion abierta para ${diseaseCode} en esta jurisdiccion (${duplicateForDisease.publicCode}).`,
    };
  }

  const openedReason = `${openedReasonPrefix} ${input.reason.trim()}`;
  let createdPublicCode = "";

  try {
    await db.transaction(async (tx) => {
      const caseRow = await openCase(
        {
          kind: "outbreak_investigation",
          primarySubjectKind: "general",
          primaryPetId: null,
          jurisdictionCountry: "AR",
          jurisdictionProvince,
          jurisdictionLocality,
          openedByUserId: user.id,
          openedReason,
        },
        tx,
      );
      createdPublicCode = caseRow.publicCode;

      await tx.insert(investigationNotes).values({
        caseId: caseRow.id,
        entryType: "case_opened",
        recordedByUserId: user.id,
        authorRole: profile.role,
        payload: {
          disease_code: diseaseCode,
          reason: input.reason.trim(),
          linked_signal_event_id: input.linkedSignalEventId ?? null,
        },
        notes: input.linkedSignalEventId ? `Signal vinculada: ${input.linkedSignalEventId}` : null,
      });

      if (input.linkedSignalEventId?.trim()) {
        await tx.insert(investigationNotes).values({
          caseId: caseRow.id,
          entryType: "linked_signal",
          recordedByUserId: user.id,
          authorRole: profile.role,
          payload: { signal_event_id: input.linkedSignalEventId.trim() },
          notes: "Signal epidemiologica vinculada al abrir la investigacion.",
        });
      }

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "outbreak_investigation_opened" as AuditLogAction,
        payload: {
          case_id: caseRow.id,
          case_public_code: caseRow.publicCode,
          disease_code: diseaseCode,
          jurisdiction_province: jurisdictionProvince,
          jurisdiction_locality: jurisdictionLocality,
          linked_signal_event_id: input.linkedSignalEventId ?? null,
          v1_noop: true,
        },
      });
    });
  } catch (err) {
    return {
      error: `No se pudo abrir la investigacion: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  notifyOutbreakInvestigationOpened({
    casePublicCode: createdPublicCode,
    caseId: createdPublicCode,
    diseaseCode,
    jurisdictionProvince,
    jurisdictionLocality,
    openedByUserId: user.id,
  }).catch(() => undefined);

  revalidatePath("/gob/vigilancia/investigaciones");
  return { ok: true, publicCode: createdPublicCode };
}

// --- addInvestigationNoteAction ---
export async function addInvestigationNoteAction(input: {
  casePublicCode: string;
  entryType: InvestigationNoteEntryType;
  notes: string;
  payload?: Record<string, unknown>;
}): Promise<OutbreakInvestigationNoteResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const { user, profile, jurisdictions } = session;

  if (!input.notes?.trim() || input.notes.trim().length < 5) {
    return { error: "La nota debe tener al menos 5 caracteres." };
  }

  const [caseRow] = await db
    .select()
    .from(cases)
    .where(
      and(eq(cases.publicCode, input.casePublicCode), eq(cases.caseKind, "outbreak_investigation")),
    )
    .limit(1);

  if (!caseRow) return { error: "Caso no encontrado." };
  if (caseRow.status === "closed") {
    return { error: "No se pueden agregar notas a una investigacion cerrada." };
  }

  if (profile.role === "govt") {
    const inScope =
      !caseRow.jurisdictionProvince ||
      jurisdictions.some((j) => j.province === caseRow.jurisdictionProvince);
    if (!inScope) return { error: "Esta investigacion no esta en tu jurisdiccion." };
  }

  try {
    await db.transaction(async (tx) => {
      await tx.insert(investigationNotes).values({
        caseId: caseRow.id,
        entryType: input.entryType,
        recordedByUserId: user.id,
        authorRole: profile.role,
        payload: input.payload ?? {},
        notes: input.notes.trim(),
      });

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "outbreak_investigation_note_added" as AuditLogAction,
        payload: {
          case_id: caseRow.id,
          case_public_code: input.casePublicCode,
          entry_type: input.entryType,
        },
      });
    });
  } catch (err) {
    return {
      error: `No se pudo guardar la nota: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  revalidatePath(`/gob/vigilancia/investigaciones/${input.casePublicCode}`);
  return { ok: true };
}

// --- escalateInvestigationAction ---
export async function escalateInvestigationAction(input: {
  casePublicCode: string;
  reason: string;
}): Promise<OutbreakInvestigationNoteResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const { user, profile, jurisdictions } = session;

  if (!input.reason?.trim() || input.reason.trim().length < 10) {
    return { error: "El motivo de escalada debe tener al menos 10 caracteres." };
  }

  const [caseRow] = await db
    .select()
    .from(cases)
    .where(
      and(eq(cases.publicCode, input.casePublicCode), eq(cases.caseKind, "outbreak_investigation")),
    )
    .limit(1);

  if (!caseRow) return { error: "Caso no encontrado." };
  if (caseRow.status !== "open") {
    return { error: "Solo se pueden escalar investigaciones en estado abierto." };
  }

  if (profile.role === "govt") {
    const inScope =
      !caseRow.jurisdictionProvince ||
      jurisdictions.some((j) => j.province === caseRow.jurisdictionProvince);
    if (!inScope) return { error: "Esta investigacion no esta en tu jurisdiccion." };
  }

  try {
    await db.transaction(async (tx) => {
      await escalateCase(caseRow.id);

      await tx.insert(investigationNotes).values({
        caseId: caseRow.id,
        entryType: "case_escalated",
        recordedByUserId: user.id,
        authorRole: profile.role,
        payload: { reason: input.reason.trim() },
        notes: input.reason.trim(),
      });

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: "outbreak_investigation_escalated" as AuditLogAction,
        payload: {
          case_id: caseRow.id,
          case_public_code: input.casePublicCode,
          reason: input.reason.trim(),
        },
      });
    });
  } catch (err) {
    return {
      error: `No se pudo escalar la investigacion: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  revalidatePath(`/gob/vigilancia/investigaciones/${input.casePublicCode}`);
  revalidatePath("/gob/vigilancia/investigaciones");
  return { ok: true };
}

// --- closeInvestigationAction ---
export async function closeInvestigationAction(input: {
  casePublicCode: string;
  outcome: "resolved" | "dismissed";
  finalReportText?: string | null;
  reason: string;
}): Promise<OutbreakInvestigationNoteResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const { user, profile, jurisdictions } = session;

  if (!input.reason?.trim() || input.reason.trim().length < 10) {
    return { error: "El motivo de cierre debe tener al menos 10 caracteres." };
  }

  const [caseRow] = await db
    .select()
    .from(cases)
    .where(
      and(eq(cases.publicCode, input.casePublicCode), eq(cases.caseKind, "outbreak_investigation")),
    )
    .limit(1);

  if (!caseRow) return { error: "Caso no encontrado." };
  if (caseRow.status === "closed") {
    return { error: "Esta investigacion ya esta cerrada." };
  }

  if (profile.role === "govt") {
    const inScope =
      !caseRow.jurisdictionProvince ||
      jurisdictions.some((j) => j.province === caseRow.jurisdictionProvince);
    if (!inScope) return { error: "Esta investigacion no esta en tu jurisdiccion." };
  }

  if (input.outcome === "resolved") {
    const hasFinalReport = await db
      .select({ id: investigationNotes.id })
      .from(investigationNotes)
      .where(
        and(
          eq(investigationNotes.caseId, caseRow.id),
          eq(investigationNotes.entryType, "final_report"),
        ),
      )
      .limit(1)
      .then((rows) => rows.length > 0);

    if (!hasFinalReport && !input.finalReportText?.trim()) {
      return {
        error:
          "Para cerrar como resuelta, registra primero un informe epidemiologico final (o ingresa el texto del informe en este formulario).",
      };
    }
  }

  const auditAction: AuditLogAction =
    input.outcome === "resolved"
      ? "outbreak_investigation_closed_resolved"
      : "outbreak_investigation_closed_dismissed";

  try {
    await db.transaction(async (tx) => {
      if (input.outcome === "resolved" && input.finalReportText?.trim()) {
        await tx.insert(investigationNotes).values({
          caseId: caseRow.id,
          entryType: "final_report",
          recordedByUserId: user.id,
          authorRole: profile.role,
          payload: { inline: true },
          notes: input.finalReportText.trim(),
        });
      }

      await tx.insert(investigationNotes).values({
        caseId: caseRow.id,
        entryType: "case_closed",
        recordedByUserId: user.id,
        authorRole: profile.role,
        payload: { outcome: input.outcome, reason: input.reason.trim() },
        notes: input.reason.trim(),
      });

      await closeCase(
        {
          caseId: caseRow.id,
          reason: input.outcome === "resolved" ? "resolved" : "cancelled",
          closedByUserId: user.id,
        },
        tx,
      );

      await tx.insert(auditLog).values({
        actorUserId: user.id,
        action: auditAction,
        payload: {
          case_id: caseRow.id,
          case_public_code: input.casePublicCode,
          outcome: input.outcome,
          reason: input.reason.trim(),
          v1_noop: true,
        },
      });
    });
  } catch (err) {
    return {
      error: `No se pudo cerrar la investigacion: ${err instanceof Error ? err.message : "error desconocido"}`,
    };
  }

  revalidatePath(`/gob/vigilancia/investigaciones/${input.casePublicCode}`);
  revalidatePath("/gob/vigilancia/investigaciones");
  return { ok: true };
}
