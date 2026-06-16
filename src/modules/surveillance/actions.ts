"use server";

// Thin action controllers for the surveillance domain — WU-3 bite + rabies + WU-4 ENO + outbreak.
//
// Each action:
//   1. AUTH GUARD at the edge (EXACT scope per action — see spec §AUTH SCOPE).
//   2. Parse/validate raw input.
//   3. Build deps (repo, openCase, transaction, etc.) and call the use-case.
//   4. Handle UseCaseResult — on error, return the error string.
//   5. Flush pendingNotifications post-tx best-effort.
//   6. revalidatePath or redirect.
//
// AUTH SCOPE CONTRACT:
//   reportBiteAction:                    requireAlivePetAccess (owner+alive)
//   reportBiteFromOrgAction:             requireCapability("bite.report")
//   ownerCloseRabiesObservation:         requireAlivePetAccess
//   professionalCloseRabiesObservation:  requireAdminOrGovtOrRedirect + jurisdiction scope
//   openOutbreakInvestigationAction:     requireAdminOrGovtOrRedirect + isInScope (via use-case)
//   addInvestigationNoteAction:          requireAdminOrGovtOrRedirect + isInScope (via use-case)
//   escalateInvestigationAction:         requireAdminOrGovtOrRedirect + isInScope (via use-case)
//   closeInvestigationAction:            requireAdminOrGovtOrRedirect + isInScope (via use-case)
//
// NO business logic. NO direct Drizzle queries (beyond db.transaction).
// AUDIT_LOG: NONE on bite/rabies. Outbreak: all 4 write audit_log inside tx (use-case handles it).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db, notifications } from "@/db";
import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { notifyOutbreakInvestigationOpened } from "@/lib/authority";
import { closeCase, escalateCase, openCase } from "@/lib/case-helpers";
import { checkboxOn } from "@/lib/form-checkbox";
import { canonicalProvinceNameForStorage } from "@/lib/jurisdiction-canonical";
import { requireAlivePetAccess } from "@/lib/pet-access";
import { requireCapability } from "@/src/modules/organizations/infrastructure/authz-resolver";

import {
  type InvestigationNoteEntryType,
  addInvestigationNote,
  closeInvestigation,
  escalateInvestigation,
  openOutbreakInvestigation,
} from "./application/outbreak-investigation";
import { ownerCloseObservation } from "./application/owner-close-observation";
import { professionalCloseObservation } from "./application/professional-close-observation";
import { reportBite } from "./application/report-bite";
import { reportBiteFromOrg } from "./application/report-bite-from-org";
import type { RabiesObservationOutcome } from "./domain/rabies-observation";
import { SurveillanceRepository } from "./infrastructure/surveillance-repository";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const repo = new SurveillanceRepository();

/** Flush notifications post-tx, best-effort. Never throws. */
async function flushNotifications(
  pending: Array<typeof notifications.$inferInsert>,
): Promise<void> {
  if (pending.length === 0) return;
  try {
    await db.insert(notifications).values(pending);
  } catch (e) {
    console.error("[surveillance/actions] notifications insert failed (action did succeed):", e);
  }
}

// ---------------------------------------------------------------------------
// Re-exported types (matches original app/actions/bite.ts public surface)
// ---------------------------------------------------------------------------

export type BiteFormState = { error: string | null };
export type ReportBiteFromOrgFormState = {
  error: string | null;
  ok?: boolean;
  petToken?: string;
};
export type ProfessionalCloseResult = { error: string | null };

// ---------------------------------------------------------------------------
// reportBiteAction — owner path (spec §A)
// ---------------------------------------------------------------------------

export async function reportBiteAction(
  publicToken: string,
  _prev: BiteFormState,
  formData: FormData,
): Promise<BiteFormState> {
  // 1. Auth + pet access (alive pets only).
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { pet, user, eventAuthorship } = access;

  // 2. Refuse if an observation is already active.
  if (pet.rabiesObservationStatus === "in_progress") {
    return {
      error: "Esta mascota ya está en observación antirrábica por otra mordedura activa.",
    };
  }

  // 3. Parse + validate form input.
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  if (!occurredAtRaw) return { error: "Indicá la fecha del incidente." };
  const occurredAt = new Date(occurredAtRaw);
  if (!Number.isFinite(occurredAt.getTime())) {
    return { error: "Fecha del incidente inválida." };
  }
  if (occurredAt > new Date()) return { error: "La fecha no puede ser futura." };

  const victimKindRaw = String(formData.get("victimKind") ?? "");
  if (!["human", "animal", "unknown"].includes(victimKindRaw)) {
    return { error: "Indicá el tipo de víctima." };
  }
  const victimKind = victimKindRaw as "human" | "animal" | "unknown";

  const severityRaw = String(formData.get("severity") ?? "");
  if (!["minor", "moderate", "severe"].includes(severityRaw)) {
    return { error: "Indicá la severidad." };
  }
  const severity = severityRaw as "minor" | "moderate" | "severe";

  const confirmed = checkboxOn(formData, "confirmObservation");
  if (!confirmed) {
    return {
      error:
        "Tenés que confirmar que entendés que esto inicia una observación obligatoria de 10 días.",
    };
  }

  const locationDescription = String(formData.get("locationDescription") ?? "").trim() || null;
  const context = String(formData.get("context") ?? "").trim() || null;
  const victimContactName = String(formData.get("victimContactName") ?? "").trim() || null;
  const victimContactPhone = String(formData.get("victimContactPhone") ?? "").trim() || null;
  const victimAgeEstimate = String(formData.get("victimAgeEstimate") ?? "").trim() || null;
  const clientIdempotencyKey = String(formData.get("clientIdempotencyKey") ?? "").trim() || null;
  const eventJurisdictionProvince = canonicalProvinceNameForStorage(
    String(formData.get("provinceCode") ?? ""),
  );
  const eventJurisdictionLocality = String(formData.get("localityName") ?? "").trim() || null;

  // 4. Call use-case.
  const result = await reportBite(
    {
      pet,
      user,
      eventAuthorship: eventAuthorship as {
        authorRole: string;
        authorOrganizationId: string | null;
        authorVerified: boolean;
      },
      occurredAt,
      victimKind,
      severity,
      locationDescription,
      context,
      victimContactName,
      victimContactPhone,
      victimAgeEstimate,
      clientIdempotencyKey,
      eventJurisdictionProvince,
      eventJurisdictionLocality,
    },
    {
      repo,
      openCase: async (input, tx) =>
        openCase(input as Parameters<typeof openCase>[0], tx as Parameters<typeof openCase>[1]),
      transaction: db.transaction.bind(db),
      findAuthoritiesForJurisdiction,
    },
  );

  if (!result.ok) return { error: result.error };

  // 5. Flush notifications post-tx best-effort.
  await flushNotifications(result.notifications as (typeof notifications.$inferInsert)[]);

  revalidatePath(`/mis-mascotas/${publicToken}`);
  redirect(`/mis-mascotas/${publicToken}?evento=mordedura_reportada`);
}

// ---------------------------------------------------------------------------
// ownerCloseRabiesObservationAction (spec §C)
// ---------------------------------------------------------------------------

export async function ownerCloseRabiesObservationAction(
  publicToken: string,
): Promise<{ error: string | null }> {
  const access = await requireAlivePetAccess(publicToken);
  if (!access.ok) return { error: access.error };
  const { pet, user, eventAuthorship } = access;

  const result = await ownerCloseObservation(
    {
      pet,
      user,
      eventAuthorship: eventAuthorship as {
        authorRole: string;
        authorOrganizationId: string | null;
        authorVerified: boolean;
      },
    },
    {
      repo,
      closeCase: async (args, tx) => {
        await closeCase(args, tx as Parameters<typeof closeCase>[1]);
      },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications as (typeof notifications.$inferInsert)[]);

  revalidatePath(`/mis-mascotas/${publicToken}`);
  return { error: null };
}

// ---------------------------------------------------------------------------
// reportBiteFromOrgAction — org path (spec §B)
// ---------------------------------------------------------------------------

export async function reportBiteFromOrgAction(
  orgToken: string,
  _prev: ReportBiteFromOrgFormState,
  formData: FormData,
): Promise<ReportBiteFromOrgFormState> {
  // 1. Capability gate.
  const cap = await requireCapability("bite.report");
  if (cap.error !== null) return { error: cap.error };
  const { user, organization } = cap;

  // 2. Locate the target pet.
  const petPublicTokenRaw = String(formData.get("petPublicToken") ?? "").trim();
  if (!petPublicTokenRaw) return { error: "Indicá el token público de la mascota." };

  const pet = await repo.findPetByToken(petPublicTokenRaw);
  if (!pet) return { error: "No encontramos una mascota con ese token." };
  if (pet.status === "deceased") {
    return { error: "Esta mascota está registrada como fallecida." };
  }
  if (pet.rabiesObservationStatus === "in_progress") {
    return {
      error: "Esta mascota ya está en observación antirrábica por otra mordedura activa.",
    };
  }

  // 3. Parse bite-specific fields.
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  if (!occurredAtRaw) return { error: "Indicá la fecha del incidente." };
  const occurredAt = new Date(occurredAtRaw);
  if (!Number.isFinite(occurredAt.getTime())) {
    return { error: "Fecha del incidente inválida." };
  }
  if (occurredAt > new Date()) return { error: "La fecha no puede ser futura." };

  const victimKindRaw = String(formData.get("victimKind") ?? "");
  if (!["human", "animal", "unknown"].includes(victimKindRaw)) {
    return { error: "Indicá el tipo de víctima." };
  }
  const victimKind = victimKindRaw as "human" | "animal" | "unknown";

  const severityRaw = String(formData.get("severity") ?? "");
  if (!["minor", "moderate", "severe"].includes(severityRaw)) {
    return { error: "Indicá la severidad." };
  }
  const severity = severityRaw as "minor" | "moderate" | "severe";

  if (!checkboxOn(formData, "confirmObservation")) {
    return {
      error:
        "Tenés que confirmar que entendés que esto inicia una observación obligatoria de 10 días.",
    };
  }

  const locationDescription = String(formData.get("locationDescription") ?? "").trim() || null;
  const context = String(formData.get("context") ?? "").trim() || null;
  const victimContactName = String(formData.get("victimContactName") ?? "").trim() || null;
  const victimContactPhone = String(formData.get("victimContactPhone") ?? "").trim() || null;
  const victimAgeEstimate = String(formData.get("victimAgeEstimate") ?? "").trim() || null;
  const injuriesSummary = String(formData.get("injuriesSummary") ?? "").trim() || null;
  const vetInvolved = checkboxOn(formData, "vetInvolved");
  const eventJurisdictionProvince = canonicalProvinceNameForStorage(
    String(formData.get("provinceCode") ?? ""),
  );
  const eventJurisdictionLocality = String(formData.get("localityName") ?? "").trim() || null;
  const noRedirect = String(formData.get("noRedirect") ?? "") === "1";

  // 4. Call use-case.
  const result = await reportBiteFromOrg(
    {
      pet,
      user: { id: user.id },
      organization: {
        id: organization.id,
        displayName: organization.displayName,
        orgType: organization.orgType,
        verified: organization.verified,
      },
      occurredAt,
      victimKind,
      severity,
      locationDescription,
      context,
      victimContactName,
      victimContactPhone,
      victimAgeEstimate,
      injuriesSummary,
      vetInvolved,
      eventJurisdictionProvince,
      eventJurisdictionLocality,
      noRedirect,
      orgToken,
    },
    {
      repo,
      openCase: async (input, tx) =>
        openCase(input as Parameters<typeof openCase>[0], tx as Parameters<typeof openCase>[1]),
      transaction: db.transaction.bind(db),
      findAuthoritiesForJurisdiction,
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications as (typeof notifications.$inferInsert)[]);

  revalidatePath(`/org/${orgToken}`);
  if (noRedirect) {
    return {
      error: null,
      ok: true,
      petToken: String(formData.get("petPublicToken") ?? "").trim(),
    };
  }
  redirect(`/org/${orgToken}?evento=mordedura_reportada`);
}

// ---------------------------------------------------------------------------
// professionalCloseRabiesObservationAction — admin/govt (spec §D)
// ---------------------------------------------------------------------------

export async function professionalCloseRabiesObservationAction(
  petPublicToken: string,
  formData: FormData,
): Promise<ProfessionalCloseResult> {
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const outcomeRaw = String(formData.get("outcome") ?? "").trim();
  const PROFESSIONAL_OUTCOMES: RabiesObservationOutcome[] = [
    "negative",
    "positive_rabies",
    "dead",
    "lost_to_followup",
  ];
  if (!PROFESSIONAL_OUTCOMES.includes(outcomeRaw as RabiesObservationOutcome)) {
    return { error: "Outcome inválido." };
  }
  const outcome = outcomeRaw as RabiesObservationOutcome;
  const closureNotes = String(formData.get("closureNotes") ?? "").trim() || null;

  const result = await professionalCloseObservation(
    {
      petPublicToken,
      outcome,
      closureNotes,
      actor: { profile, jurisdictions },
    },
    {
      repo,
      closeCase: async (args, tx) => {
        await closeCase(args, tx as Parameters<typeof closeCase>[1]);
      },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications as (typeof notifications.$inferInsert)[]);

  redirect("/admin/observaciones");
}

// ---------------------------------------------------------------------------
// Cron use-case (spec §E): closeEligibleObservations lives in
// ./application/close-eligible-observations and is invoked by the cron route via
// the lib/rabies-observation-closer shim. It is intentionally NOT re-exported here —
// a "use server" file may only export locally-declared async actions.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Outbreak investigation actions — admin/govt (spec §H, §I)
// Auth: requireAdminOrGovtOrRedirect + isInScope enforced inside use-case.
// AUDIT_LOG: all 4 write inside tx with v1_noop:true (use-case handles it).
// ---------------------------------------------------------------------------

export type OutbreakInvestigationActionResult =
  | { ok: true; publicCode: string }
  | { error: string };

export type OutbreakInvestigationNoteResult = { ok: true } | { error: string };

export type { InvestigationNoteEntryType };

/** Build shared outbreak deps (repo + case ops + tx + notif + revalidate). */
function makeOutbreakDeps(revalidateFn: (path: string) => void) {
  return {
    repo,
    openCase: async (
      input: {
        kind: string;
        primarySubjectKind: string;
        primaryPetId: null;
        jurisdictionCountry: string;
        jurisdictionProvince: string | null;
        jurisdictionLocality: string | null;
        openedByUserId: string;
        openedReason: string;
      },
      tx: unknown,
    ) => openCase(input as Parameters<typeof openCase>[0], tx as Parameters<typeof openCase>[1]),
    closeCase: async (
      args: { caseId: string; reason: "resolved" | "cancelled"; closedByUserId: string },
      tx: unknown,
    ): Promise<void> => {
      await closeCase(args, tx as Parameters<typeof closeCase>[1]);
    },
    escalateCase: async (caseId: string, tx: unknown): Promise<void> => {
      await escalateCase(caseId, tx as Parameters<typeof escalateCase>[1]);
    },
    transaction: db.transaction.bind(db),
    notifyOutbreakOpened: async (
      ...args: Parameters<typeof notifyOutbreakInvestigationOpened>
    ): Promise<void> => {
      await notifyOutbreakInvestigationOpened(...args);
    },
    revalidate: revalidateFn,
  };
}

export async function openOutbreakInvestigationAction(input: {
  diseaseCode: string;
  reason: string;
  linkedSignalEventId?: string | null;
}): Promise<OutbreakInvestigationActionResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const { profile, jurisdictions } = session;

  const result = await openOutbreakInvestigation(
    {
      diseaseCode: input.diseaseCode ?? "",
      reason: input.reason ?? "",
      linkedSignalEventId: input.linkedSignalEventId,
      actor: { profile, jurisdictions },
    },
    makeOutbreakDeps(revalidatePath),
  );

  if (!result.ok) return { error: result.error };
  return { ok: true, publicCode: result.value.publicCode };
}

export async function addInvestigationNoteAction(input: {
  casePublicCode: string;
  entryType: InvestigationNoteEntryType;
  notes: string;
  payload?: Record<string, unknown>;
}): Promise<OutbreakInvestigationNoteResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const { profile, jurisdictions } = session;

  const result = await addInvestigationNote(
    {
      casePublicCode: input.casePublicCode,
      entryType: input.entryType,
      notes: input.notes ?? "",
      payload: input.payload,
      actor: { profile, jurisdictions },
    },
    makeOutbreakDeps(revalidatePath),
  );

  if (!result.ok) return { error: result.error };
  return { ok: true };
}

export async function escalateInvestigationAction(input: {
  casePublicCode: string;
  reason: string;
}): Promise<OutbreakInvestigationNoteResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const { profile, jurisdictions } = session;

  const result = await escalateInvestigation(
    {
      casePublicCode: input.casePublicCode,
      reason: input.reason ?? "",
      actor: { profile, jurisdictions },
    },
    makeOutbreakDeps(revalidatePath),
  );

  if (!result.ok) return { error: result.error };
  return { ok: true };
}

export async function closeInvestigationAction(input: {
  casePublicCode: string;
  outcome: "resolved" | "dismissed";
  finalReportText?: string | null;
  reason: string;
}): Promise<OutbreakInvestigationNoteResult> {
  const session = await requireAdminOrGovtOrRedirect();
  const { profile, jurisdictions } = session;

  const result = await closeInvestigation(
    {
      casePublicCode: input.casePublicCode,
      outcome: input.outcome,
      reason: input.reason ?? "",
      finalReportText: input.finalReportText,
      actor: { profile, jurisdictions },
    },
    makeOutbreakDeps(revalidatePath),
  );

  if (!result.ok) return { error: result.error };
  return { ok: true };
}
