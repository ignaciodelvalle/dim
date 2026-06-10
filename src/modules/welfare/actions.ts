"use server";

// Thin action controllers for the welfare domain — WU-2 + WU-3 actions.
//
// Each action:
//   1. AUTH GUARD at the edge (EXACT scope per action — see spec §AUTH SCOPE).
//   2. Parse/validate raw input.
//   3. Build deps (repo, actor, closeCase, transaction) and call the use-case.
//   4. Handle UseCaseResult — on error, return the error string.
//   5. Flush pendingNotifications post-tx best-effort.
//   6. revalidatePath or return result.
//
// AUTH SCOPE CONTRACT (CRITICAL — foster cross-org bypass lesson):
//   public create (anon+auth): no gate; anon rate-limited at edge (welfare_anon bucket)
//   org create: requireUserOrRedirect + org-membership+verified+role gate scoped to orgToken
//   triage / start / close / assign / unassign / mpf-export:
//       requireAdminOrGovtOrRedirect() — govt scoped to jurisdiction in use-case
//   moderation (pass / confirm):
//       requireAdminOrRedirect() — ADMIN ONLY. Govt cannot moderate.
//
// NO business logic. NO direct Drizzle imports beyond shared db for notifications.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  db,
  type notifications,
  organizationMemberships,
  organizations,
  welfareReports,
} from "@/db";
import { findAuthoritiesForJurisdiction } from "@/lib/approval-routing";
import {
  requireAdminOrGovtOrRedirect,
  requireAdminOrRedirect,
  requireUserOrRedirect,
} from "@/lib/auth-guards";
import { signalWelfareReport } from "@/lib/authority";
import { closeCase, openCase } from "@/lib/case-helpers";
import { parseDateInput } from "@/lib/format";
import { canonicalProvinceNameForStorage } from "@/lib/jurisdiction-canonical";
import {
  JurisdictionValidationError,
  resolveCanonicalJurisdiction,
} from "@/lib/jurisdiction-validation";
import { writePoint } from "@/lib/location";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";
import { welfareAttachmentSignedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import {
  MPF_EXPORT_SCHEMA_VERSION,
  createSignedExportUrl,
  generateWelfareMpfPdf,
  uploadExportToStorage,
  welfareReportToMpfDto,
} from "@/lib/welfare-exports";
import { computeFlagReasons } from "@/lib/welfare-moderation";
import { uploadWelfareEvidence } from "@/lib/welfare-uploads";
import { generateReferenceCode } from "@/src/modules/welfare/domain/reference-code";
import { and, eq, isNull } from "drizzle-orm";

import { addReporterComment } from "./application/add-reporter-comment";
import { assignWelfare } from "./application/assign-welfare";
import { closeWelfareReport } from "./application/close-welfare-report";
import { confirmWelfareAsSpam } from "./application/confirm-welfare-as-spam";
import { createOrgWelfareReport } from "./application/create-org-welfare-report";
import { createWelfareReport } from "./application/create-welfare-report";
import { generateMpfExport } from "./application/generate-mpf-export";
import { passWelfareToTriage } from "./application/pass-welfare-to-triage";
import { startWelfareReport } from "./application/start-welfare-report";
import { triageWelfareReport } from "./application/triage-welfare-report";
import { unassignWelfare } from "./application/unassign-welfare";
import { WelfareRepository } from "./infrastructure/welfare-repository";

// ---------------------------------------------------------------------------
// Re-export types that existing consumers import from the old action files.
// (kept here so strangler shims can re-export without duplication)
// ---------------------------------------------------------------------------

export type { TriageDecision } from "./application/triage-welfare-report";
export type WelfareReportFormState = { error: string | null };
export type TriageResult = { ok: true } | { error: string };
export type ModerationResult = { ok: true } | { error: string };
export type AssignResult = { ok: true } | { ok: false; error: string };
export type GenerateMpfExportResult =
  | { ok: true; signedUrl: string; expiresAt: Date }
  | { ok: false; error: string };

// getActiveGovtScopeForUser is a server-only query helper, NOT a server action.
// Import it directly from "./application/get-active-govt-scope" — a "use server"
// file may only export locally-declared async actions.

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const repo = new WelfareRepository();

/** Flush notifications post-tx, best-effort. Never throws. */
async function flushNotifications(
  pending: Array<{
    userId: string;
    notificationType: string;
    title: string;
    body: string;
    severity: "info" | "success" | "warning" | "urgent";
    ctaLabel?: string | null;
    ctaUrl?: string | null;
    category?: string | null;
  }>,
): Promise<void> {
  if (pending.length === 0) return;
  try {
    await repo.insertNotifications(pending as (typeof notifications.$inferInsert)[]);
  } catch (e) {
    console.error("[welfare/actions] notifications insert failed (action did succeed):", e);
  }
}

// ---------------------------------------------------------------------------
// triageWelfareReportAction — R3
// ---------------------------------------------------------------------------

export async function triageWelfareReportAction(input: {
  welfareReportId: string;
  decision: "triaged" | "invalid" | "duplicate";
  notes: string;
}): Promise<TriageResult> {
  const session = await requireAdminOrGovtOrRedirect();

  // Jurisdiction scope is enforced inside the action via a pre-load.
  // The use-case receives a trusted actor — jurisdiction check happens here.
  const loaded = await loadInScopeReport(
    input.welfareReportId,
    session.profile,
    session.jurisdictions,
  );
  if ("error" in loaded) return loaded;

  const result = await triageWelfareReport(input, {
    repo,
    closeCase: async (args, tx) => {
      await closeCase(args, tx as Parameters<typeof closeCase>[1]);
    },
    transaction: db.transaction.bind(db),
    actor: { user: session.user, profile: session.profile },
  });

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath("/gob/maltrato");
  revalidatePath(`/gob/maltrato/${input.welfareReportId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// startWelfareReportAction — R3
// ---------------------------------------------------------------------------

export async function startWelfareReportAction(input: {
  welfareReportId: string;
  notes: string;
}): Promise<TriageResult> {
  const session = await requireAdminOrGovtOrRedirect();

  const loaded = await loadInScopeReport(
    input.welfareReportId,
    session.profile,
    session.jurisdictions,
  );
  if ("error" in loaded) return loaded;

  const result = await startWelfareReport(input, {
    repo,
    transaction: db.transaction.bind(db),
    actor: { user: session.user, profile: session.profile },
  });

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath("/gob/maltrato");
  revalidatePath(`/gob/maltrato/${input.welfareReportId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// closeWelfareReportAction — R3
// ---------------------------------------------------------------------------

export async function closeWelfareReportAction(input: {
  welfareReportId: string;
  resolutionNotes: string;
}): Promise<TriageResult> {
  const session = await requireAdminOrGovtOrRedirect();

  const loaded = await loadInScopeReport(
    input.welfareReportId,
    session.profile,
    session.jurisdictions,
  );
  if ("error" in loaded) return loaded;

  const result = await closeWelfareReport(input, {
    repo,
    closeCase: async (args, tx) => {
      await closeCase(args, tx as Parameters<typeof closeCase>[1]);
    },
    transaction: db.transaction.bind(db),
    actor: { user: session.user, profile: session.profile },
  });

  if (!result.ok) return { error: result.error };

  await flushNotifications(result.notifications);

  revalidatePath("/gob/maltrato");
  revalidatePath(`/gob/maltrato/${input.welfareReportId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// passWelfareToTriageAction — R4 (admin-ONLY)
// ---------------------------------------------------------------------------

export async function passWelfareToTriageAction(input: {
  welfareReportId: string;
  notes: string;
}): Promise<ModerationResult> {
  const { user } = await requireAdminOrRedirect();

  const result = await passWelfareToTriage(input, {
    repo,
    transaction: db.transaction.bind(db),
    actor: { user },
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/moderacion");
  revalidatePath("/gob/maltrato");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// confirmWelfareAsSpamAction — R4 (admin-ONLY)
// ---------------------------------------------------------------------------

export async function confirmWelfareAsSpamAction(input: {
  welfareReportId: string;
  notes: string;
}): Promise<ModerationResult> {
  const { user } = await requireAdminOrRedirect();

  const result = await confirmWelfareAsSpam(input, {
    repo,
    transaction: db.transaction.bind(db),
    actor: { user },
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/admin/moderacion");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// assignWelfareToMeAction — R5
// ---------------------------------------------------------------------------

export async function assignWelfareToMeAction(reportId: string): Promise<AssignResult> {
  const session = await requireAdminOrGovtOrRedirect();

  const loaded = await loadAndVerifyScope(reportId, session.profile, session.jurisdictions);
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const result = await assignWelfare(
    { welfareReportId: reportId },
    { repo, actor: { user: session.user, profile: session.profile } },
  );

  if (!result.ok) return result;

  revalidatePath("/gob/maltrato");
  revalidatePath(`/gob/maltrato/${reportId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// unassignWelfareAction — R5
// ---------------------------------------------------------------------------

export async function unassignWelfareAction(reportId: string): Promise<AssignResult> {
  const session = await requireAdminOrGovtOrRedirect();

  const loaded = await loadAndVerifyScope(reportId, session.profile, session.jurisdictions);
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const result = await unassignWelfare(
    { welfareReportId: reportId },
    { repo, actor: { user: session.user, profile: session.profile } },
  );

  if (!result.ok) return result;

  revalidatePath("/gob/maltrato");
  revalidatePath(`/gob/maltrato/${reportId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// deriveWelfareToOrgAction — R7
// ---------------------------------------------------------------------------
//
// AUTH SCOPE: requireAdminOrGovtOrRedirect + jurisdiction scope (mirrors triage).
// Forwards a non-terminal welfare report to a verified shelter / rescue_network
// for follow-up. Sets derived_to_organization_id / derived_at / derived_by_user_id,
// notifies active org members (cap 10), writes an audit_log entry.
//
// Idempotent: re-deriving overwrites the previous derivation target. Known
// limitation: the previous org is NOT de-notified — its members keep a stale
// notification whose report no longer appears in their inbox.
// Rejected for terminal statuses (closed / invalid / duplicate).

export type DeriveWelfareToOrgResult = { ok: true } | { ok: false; error: string };

export async function deriveWelfareToOrgAction(input: {
  welfareReportId: string;
  targetOrgId: string;
}): Promise<DeriveWelfareToOrgResult> {
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const loaded = await loadAndVerifyScope(input.welfareReportId, profile, jurisdictions);
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const report = loaded.row;

  // Guard: terminal reports cannot be derived.
  if (report.status === "closed" || report.status === "invalid" || report.status === "duplicate") {
    return { ok: false, error: "No se puede derivar una denuncia cerrada o inválida." };
  }

  // Verify the target org exists, is verified, and is shelter or rescue_network.
  const [targetOrg] = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      publicToken: organizations.publicToken,
      verified: organizations.verified,
      orgType: organizations.orgType,
    })
    .from(organizations)
    .where(eq(organizations.id, input.targetOrgId))
    .limit(1);

  if (!targetOrg) return { ok: false, error: "Organización no encontrada." };
  if (!targetOrg.verified) return { ok: false, error: "La organización no está verificada." };
  if (targetOrg.orgType !== "shelter" && targetOrg.orgType !== "rescue_network") {
    return { ok: false, error: "Solo se puede derivar a refugios o redes de rescate verificados." };
  }

  // Persist derivation fields.
  await db
    .update(welfareReports)
    .set({
      derivedToOrganizationId: targetOrg.id,
      derivedAt: new Date(),
      derivedByUserId: user.id,
    })
    .where(eq(welfareReports.id, input.welfareReportId));

  // Audit log — same pattern as create-org-welfare-report.
  await repo.insertAudit({
    actorUserId: user.id,
    action: "welfare_report_derived_to_org",
    targetOrganizationId: targetOrg.id,
    payload: {
      welfareReportId: input.welfareReportId,
      referenceCode: report.referenceCode,
      targetOrgId: targetOrg.id,
      targetOrgDisplayName: targetOrg.displayName,
    },
  });

  // Notify active org members (cap 10) — use publicToken in ctaUrl (NEVER UUID).
  const memberRows = await db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, targetOrg.id),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(10);

  const ctaUrl = `/org/${targetOrg.publicToken}/maltrato/recibidos?tab=recibidos`;
  const pendingNotifications = memberRows.map((m) => ({
    userId: m.userId,
    notificationType: "welfare_report_derived_to_org",
    title: "Nueva derivación de denuncia",
    body: `El gobierno derivó la denuncia ${report.referenceCode} a tu organización para seguimiento.`,
    severity: "warning" as const,
    ctaLabel: "Ver denuncia",
    ctaUrl,
    category: "welfare",
  }));

  await flushNotifications(pendingNotifications);

  revalidatePath("/gob/maltrato");
  revalidatePath(`/gob/maltrato/${input.welfareReportId}`);
  revalidatePath(`/org/${targetOrg.publicToken}/maltrato/recibidos`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// generateMpfExportAction — R6
// ---------------------------------------------------------------------------

export async function generateMpfExportAction(
  welfareReportId: string,
): Promise<GenerateMpfExportResult> {
  const { profile, jurisdictions, user } = await requireAdminOrGovtOrRedirect();

  // Jurisdiction scope guard (mirrors the detail page).
  const loaded = await loadAndVerifyScope(welfareReportId, profile, jurisdictions);
  if ("error" in loaded) return { ok: false, error: "not_found" };

  const supabase = await createClient();

  const result = await generateMpfExport(
    { welfareReportId },
    {
      repo,
      generatePdf: async (dto) => {
        // The DTO built by the use-case uses raw enum values for kindLabel/severityLabel.
        // Wire through the real mapper for production so labels are human-readable.
        const report = loaded.row;
        const [reporterDisplayName, exportedByDisplayName, subjectPet, attachmentRows] =
          await Promise.all([
            repo.findReporterName(report.reporterUserId),
            repo.findExporterName(user.id),
            repo.findSubjectPet(report.subjectPetId),
            repo.findAttachments(welfareReportId),
          ]);
        const attachments = await Promise.all(
          attachmentRows.map(async (a) => ({
            filename: a.originalFilename ?? a.storagePath.split("/").pop() ?? "adjunto",
            signedUrl: await welfareAttachmentSignedUrl(supabase, a.storagePath, 7 * 24 * 60 * 60),
          })),
        );
        const exportGeneratedAt = new Date(dto.exportGeneratedAt);
        const properDto = welfareReportToMpfDto(report, {
          reporterDisplayName,
          exportedByDisplayName,
          subjectPet,
          attachments,
          exportGeneratedAt,
        });
        return generateWelfareMpfPdf(properDto);
      },
      createSignedUrl: (bucket, path, expiresIn) =>
        createSignedExportUrl(supabase, bucket as "welfare-exports", path, expiresIn),
      upload: (bucket, path, bytes) =>
        uploadExportToStorage(supabase, bucket as "welfare-exports", path, bytes),
      actor: { user },
    },
  );

  return result;
}

// ---------------------------------------------------------------------------
// createWelfareReportAction — R1 (public: anon + auth)
// ---------------------------------------------------------------------------
//
// AUTH SCOPE: none for anon (reporter_user_id=null); authenticated user attached
// if logged in. Edge rate-limit for anon only (bucket: welfare_anon, 1/min + 3/hr).
// Authenticated users SKIP rate-limit entirely.
//
// File upload happens BEFORE the tx. On tx failure, uploaded files are removed
// (best-effort) and the action returns an error.
//
// Spec R1 audit_log: public create writes NO audit_log row (parity confirmed).

const WELFARE_KINDS = [
  "abandonment",
  "neglect",
  "physical_abuse",
  "chained",
  "no_shelter",
  "hoarding",
  "dog_fighting",
  "trafficking",
  "other",
];
const WELFARE_SEVERITIES = ["low", "medium", "high", "critical"];
const WELFARE_SUBJECT_KINDS = ["registered_pet", "unowned_animal", "location", "general"];
const ORG_WELFARE_ROLES = new Set(["admin", "coordinator", "member", "vet_individual"]);

export async function createWelfareReportAction(
  _previous: WelfareReportFormState,
  formData: FormData,
): Promise<WelfareReportFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rate-limit anonymous submissions only. Auth users skip entirely.
  if (!user) {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    try {
      await enforceRateLimit("welfare_anon", ip, {
        maxPerMinute: 1,
        maxPerHour: 3,
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return {
          error:
            "Estás enviando demasiadas denuncias seguidas. Esperá unos minutos y volvé a intentar. Si tenés muchos casos legítimos para reportar, considerá crear una cuenta.",
        };
      }
      throw err;
    }
  }

  // Parse fields
  const kind = String(formData.get("kind") ?? "").trim();
  const severity = String(formData.get("severity") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const subjectKind = String(formData.get("subjectKind") ?? "").trim();
  const subjectPetToken = String(formData.get("subjectPetToken") ?? "").trim() || null;
  const subjectDescription = String(formData.get("subjectDescription") ?? "").trim() || null;
  const locationAddress = String(formData.get("locationAddress") ?? "").trim() || null;
  const provinceCodeRaw = String(formData.get("provinceCode") ?? "").trim();
  const localityNameRaw = String(formData.get("localityName") ?? "").trim();
  const provinceName = canonicalProvinceNameForStorage(provinceCodeRaw);
  const jurisdictionProvince: string | null = provinceName;
  let jurisdictionLocality: string | null = null;
  if (provinceName && localityNameRaw) {
    try {
      const canonical = await resolveCanonicalJurisdiction({
        rawProvince: provinceName,
        rawLocality: localityNameRaw,
      });
      jurisdictionLocality = canonical.locality.localityName;
    } catch (err) {
      if (err instanceof JurisdictionValidationError) {
        return { error: err.message };
      }
      throw err;
    }
  }
  const locationLatRaw = String(formData.get("locationLat") ?? "").trim();
  const locationLngRaw = String(formData.get("locationLng") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const reporterContactEmail = String(formData.get("reporterContactEmail") ?? "").trim() || null;
  const reporterContactPhone = String(formData.get("reporterContactPhone") ?? "").trim() || null;
  const observedSymptoms = String(formData.get("observedSymptoms") ?? "").trim() || null;
  const dwellTimeMsRaw = String(formData.get("dwellTimeMs") ?? "").trim();
  const dwellTimeMs = dwellTimeMsRaw ? Number.parseInt(dwellTimeMsRaw, 10) : undefined;
  const honeypotValue = String(formData.get("_hp") ?? "");

  // Validate
  if (!WELFARE_KINDS.includes(kind)) return { error: "Tipo de denuncia inválido." };
  if (!WELFARE_SEVERITIES.includes(severity)) return { error: "Gravedad inválida." };
  if (!description) return { error: "Falta la descripción de la situación." };
  if (description.length < 20)
    return {
      error: "La descripción debe tener al menos 20 caracteres para poder ser actuable.",
    };
  if (!WELFARE_SUBJECT_KINDS.includes(subjectKind))
    return { error: "Sujeto de la denuncia inválido." };
  if (subjectKind !== "registered_pet" && !subjectDescription) {
    return { error: "Describí brevemente al animal o el lugar denunciado." };
  }

  let locationLat: string | null = null;
  let locationLng: string | null = null;
  if (locationLatRaw || locationLngRaw) {
    if (!locationLatRaw || !locationLngRaw) {
      return { error: "Se requieren ambas coordenadas: latitud y longitud." };
    }
    const lat = Number.parseFloat(locationLatRaw);
    const lng = Number.parseFloat(locationLngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: "Coordenadas inválidas. Revisá latitud y longitud." };
    }
    const point = writePoint({ lat, lng });
    locationLat = point.locationLat;
    locationLng = point.locationLng;
  }

  const occurredAt = occurredAtRaw ? parseDateInput(occurredAtRaw) : null;
  if (occurredAtRaw && !occurredAt) return { error: "Fecha del hecho inválida." };

  // File upload BEFORE tx
  const attachmentEntries = formData.getAll("attachment");
  const files = attachmentEntries
    .filter((e): e is File => e instanceof File)
    .filter((f) => f.size > 0);

  let uploadResult: Awaited<ReturnType<typeof uploadWelfareEvidence>> | null = null;
  // We need a temporary ID for the upload path — we'll use a pre-generated UUID.
  // The report row is inserted first (outside tx), so we use insertedId from the use-case
  // result. However, the original uploads AFTER the insert. We follow parity:
  // upload after insert, before the attachment tx.
  // The use-case handles this by receiving pre-uploaded attachment refs.
  // We do a two-phase: (1) call use-case for insert only, (2) upload, (3) complete tx.
  // Parity simplification: we call the use-case with uploadResult that may be null initially.
  // Actually, looking at the original: insert report → upload → attachment tx.
  // We follow same order but the use-case handles insert internally.
  // The action calls uploadWelfareEvidence AFTER the use-case inserts the report row.
  // But the use-case doesn't return the ID until it runs. This requires a split approach.
  //
  // Design choice: use-case accepts pre-resolved attachment refs. We pre-insert the report
  // via repo directly here (same as original: insert outside tx, then upload, then tx).
  // This matches the original exactly.

  // Phase 1: call use-case (which inserts the report + runs the tx)
  // But we need the reportId BEFORE uploading. The original inserts first, then uploads.
  // We mirror this exactly by pre-inserting via repo, then uploading, then running the use-case's tx path.
  // However, our use-case design does everything atomically. Let's adjust to match parity:
  // The use-case's insertReportWithRetry runs FIRST (outside tx in our impl too), then we upload, then tx.
  // This is exactly what the use-case does — insert first, return reportId, then tx.
  // We can upload between insertReportWithRetry and the tx by splitting concerns.
  //
  // Practical solution: run the whole use-case with empty attachments to get insertedId,
  // upload, then... that doesn't work since the tx already ran.
  //
  // Correct parity: upload happens in the ACTION (not use-case). The use-case receives
  // the already-uploaded attachment rows. We need the reportId from insertReportWithRetry
  // BEFORE the upload. The use-case does: insert → upload → tx. We match by:
  // 1. Call use-case with files=[] (empty), get reportId from return value.
  // 2. If files, upload using reportId.
  // 3. If upload fails, return error (report row stays — parity).
  // 4. But use-case already ran the tx...
  //
  // The cleanest parity approach: the use-case handles insert+tx atomically with pre-uploaded refs.
  // The action does: (1) parse, (2) pre-upload (needs reportId — but we don't have it yet),
  // OR: the action uses a pre-generated UUID and pre-uploads to that path.
  // Original actually uploads AFTER insert (using insertedId).
  //
  // Resolution: follow the original EXACTLY. The action owns the two-phase flow:
  // (1) insert via repo.insertReportWithRetry directly in the action,
  // (2) upload using the returned ID,
  // (3) pass uploadResult to a narrower use-case that only does the tx portion.
  // This is the cleanest split and matches parity perfectly.
  //
  // For WU-3 we keep this in the action (not use-case) to match original exactly.

  // Insert the report row (outside tx — parity with original)
  const insertResult = await repo
    .insertReportWithRetry(
      {
        reporterUserId: user?.id ?? null,
        reporterContactEmail,
        reporterContactPhone,
        kind: kind as Parameters<typeof repo.insertReportWithRetry>[0]["kind"],
        severity: severity as Parameters<typeof repo.insertReportWithRetry>[0]["severity"],
        description,
        subjectKind: subjectKind as Parameters<typeof repo.insertReportWithRetry>[0]["subjectKind"],
        subjectPetId: null, // resolved inside use-case
        subjectDescription,
        locationAddress,
        jurisdictionProvince,
        jurisdictionLocality,
        locationLat,
        locationLng,
        occurredAt,
        referenceCode: generateReferenceCode(),
      },
      undefined,
      generateReferenceCode,
    )
    .catch((err) => {
      return { error: err instanceof Error ? err.message : "error desconocido" } as const;
    });

  if ("error" in insertResult) {
    return { error: insertResult.error };
  }

  const { id: insertedId, referenceCode } = insertResult;

  // Upload files (after insert, before tx — parity)
  if (files.length > 0) {
    uploadResult = await uploadWelfareEvidence(supabase, insertedId, files);
    if (uploadResult.error) {
      return { error: uploadResult.error };
    }
  }

  // Resolve pet + ownership at the action level (needed for role derivation in use-case)
  let subjectPetId: string | null = null;
  let isOwnerOfSubjectPet = false;
  if (subjectKind === "registered_pet" && subjectPetToken) {
    subjectPetId = (await repo.findPetByToken(subjectPetToken))?.id ?? null;
    if (subjectPetId && user?.id) {
      const ownership = await repo.findActiveOwnership(subjectPetId, user.id);
      isOwnerOfSubjectPet = ownership != null;
    }
  }

  const attachments = (uploadResult?.uploaded ?? []).map((u) => ({
    storagePath: u.storagePath,
    mimeType: u.mimeType,
    fileSize: u.fileSize,
    originalFilename: u.originalFilename,
  }));

  const result = await createWelfareReport(
    {
      reportId: insertedId,
      referenceCode,
      kind,
      severity,
      description,
      subjectKind,
      subjectPetId,
      isOwnerOfSubjectPet,
      subjectDescription,
      locationAddress,
      jurisdictionProvince,
      jurisdictionLocality,
      locationLat,
      locationLng,
      occurredAt,
      reporterContactEmail,
      reporterContactPhone,
      observedSymptoms,
      attachments,
      uploadedPaths: uploadResult?.uploadedPaths ?? [],
      reporterUserId: user?.id ?? null,
      dwellTimeMs: Number.isFinite(dwellTimeMs) ? dwellTimeMs : undefined,
      honeypotValue,
    },
    {
      repo,
      openCase: async (input) => openCase(input as Parameters<typeof openCase>[0]),
      computeFlagReasons,
      signal: async (opts) => {
        await signalWelfareReport(opts);
      },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) {
    // Tx failed — clean up uploaded files
    if (uploadResult?.uploadedPaths?.length) {
      await supabase.storage
        .from("welfare-evidence")
        .remove(uploadResult.uploadedPaths)
        .catch(() => {});
    }
    return { error: result.error };
  }

  redirect(result.redirectTo);
}

// ---------------------------------------------------------------------------
// createOrgWelfareReportAction — R2 (org-side, professional)
// ---------------------------------------------------------------------------
//
// AUTH SCOPE: requireUserOrRedirect THEN org-membership gate:
//   - non-leftAt membership in org by publicToken
//   - org.verified = true
//   - role ∈ {admin, coordinator, member, vet_individual}
//   - SCOPED TO THIS ORG ONLY (foster cross-org bypass lesson)
//
// Spec R2: audit_log REQUIRED (welfare_report_submitted_by_org).

export async function createOrgWelfareReportAction(
  orgToken: string,
  _previous: WelfareReportFormState,
  formData: FormData,
): Promise<WelfareReportFormState> {
  const { user } = await requireUserOrRedirect();

  // Org membership gate — scoped to THIS org's publicToken
  const [orgRow] = await db
    .select({
      orgId: organizations.id,
      orgDisplayName: organizations.displayName,
      orgVerified: organizations.verified,
      memberRole: organizationMemberships.role,
    })
    .from(organizations)
    .innerJoin(
      organizationMemberships,
      eq(organizationMemberships.organizationId, organizations.id),
    )
    .where(
      and(
        eq(organizations.publicToken, orgToken),
        eq(organizationMemberships.userId, user.id),
        isNull(organizationMemberships.leftAt),
      ),
    )
    .limit(1);

  if (!orgRow) return { error: "No sos miembro activo de esta organización." };
  if (!orgRow.orgVerified) {
    return { error: "Tu organización todavía no está verificada por MiMAR." };
  }
  if (!ORG_WELFARE_ROLES.has(orgRow.memberRole)) {
    return {
      error:
        "Tu rol dentro de la organización no habilita el reporte de maltrato. Pediselo a un coordinador.",
    };
  }

  // Parse fields
  const kind = String(formData.get("kind") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const subjectKind = String(formData.get("subjectKind") ?? "").trim();
  const subjectPetToken = String(formData.get("subjectPetToken") ?? "").trim() || null;
  const subjectDescription = String(formData.get("subjectDescription") ?? "").trim() || null;
  const locationAddress = String(formData.get("locationAddress") ?? "").trim() || null;
  const provinceCodeRaw = String(formData.get("provinceCode") ?? "").trim();
  const localityNameRaw = String(formData.get("localityName") ?? "").trim();
  const provinceName = canonicalProvinceNameForStorage(provinceCodeRaw);
  const jurisdictionProvince: string | null = provinceName;
  let jurisdictionLocality: string | null = null;
  if (provinceName && localityNameRaw) {
    try {
      const canonical = await resolveCanonicalJurisdiction({
        rawProvince: provinceName,
        rawLocality: localityNameRaw,
      });
      jurisdictionLocality = canonical.locality.localityName;
    } catch (err) {
      if (err instanceof JurisdictionValidationError) {
        return { error: err.message };
      }
      throw err;
    }
  }
  const locationLatRaw = String(formData.get("locationLat") ?? "").trim();
  const locationLngRaw = String(formData.get("locationLng") ?? "").trim();
  const occurredAtRaw = String(formData.get("occurredAt") ?? "").trim();
  const observedSymptoms = String(formData.get("observedSymptoms") ?? "").trim() || null;

  // Validate
  if (!WELFARE_KINDS.includes(kind)) return { error: "Tipo de denuncia inválido." };
  if (description.length < 100) {
    return {
      error:
        "La descripción profesional debe tener al menos 100 caracteres con contexto operativo.",
    };
  }
  if (!WELFARE_SUBJECT_KINDS.includes(subjectKind))
    return { error: "Sujeto de la denuncia inválido." };
  if (subjectKind !== "registered_pet" && !subjectDescription) {
    return { error: "Describí brevemente al animal o el lugar denunciado." };
  }

  let locationLat: string | null = null;
  let locationLng: string | null = null;
  if (locationLatRaw || locationLngRaw) {
    if (!locationLatRaw || !locationLngRaw) {
      return { error: "Se requieren ambas coordenadas: latitud y longitud." };
    }
    const lat = Number.parseFloat(locationLatRaw);
    const lng = Number.parseFloat(locationLngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { error: "Coordenadas inválidas. Revisá latitud y longitud." };
    }
    const point = writePoint({ lat, lng });
    locationLat = point.locationLat;
    locationLng = point.locationLng;
  }

  const occurredAt = occurredAtRaw ? parseDateInput(occurredAtRaw) : null;
  if (occurredAtRaw && !occurredAt) return { error: "Fecha del hecho inválida." };

  // File upload required for org reports (spec R2)
  const attachmentEntries = formData.getAll("attachment");
  const files = attachmentEntries
    .filter((e): e is File => e instanceof File)
    .filter((f) => f.size > 0);
  if (files.length === 0) {
    return { error: "Un reporte profesional requiere al menos un adjunto de evidencia." };
  }

  // Insert the report row (outside tx — parity with original createOrgWelfareReportAction)
  const insertResult = await repo
    .insertReportWithRetry(
      {
        reporterUserId: user.id,
        reporterOrganizationId: orgRow.orgId,
        kind: kind as Parameters<typeof repo.insertReportWithRetry>[0]["kind"],
        severity: "critical", // OA2: server-authoritative
        description,
        subjectKind: subjectKind as Parameters<typeof repo.insertReportWithRetry>[0]["subjectKind"],
        subjectPetId: null, // resolved inside use-case
        subjectDescription,
        locationAddress,
        jurisdictionProvince,
        jurisdictionLocality,
        locationLat,
        locationLng,
        occurredAt,
        referenceCode: generateReferenceCode(),
      },
      undefined,
      generateReferenceCode,
    )
    .catch((err) => {
      return { error: err instanceof Error ? err.message : "error desconocido" } as const;
    });

  if ("error" in insertResult) {
    return { error: insertResult.error };
  }

  const { id: insertedId, referenceCode: orgReferenceCode } = insertResult;

  // Upload evidence files
  const supabase = await createClient();
  const uploadResult = await uploadWelfareEvidence(supabase, insertedId, files);
  if (uploadResult.error) return { error: uploadResult.error };

  // Resolve pet at the action level (org reporters are always "witnesses" — no ownership check)
  let subjectPetId: string | null = null;
  if (subjectKind === "registered_pet" && subjectPetToken) {
    subjectPetId = (await repo.findPetByToken(subjectPetToken))?.id ?? null;
  }

  const attachments = uploadResult.uploaded.map((u) => ({
    storagePath: u.storagePath,
    mimeType: u.mimeType,
    fileSize: u.fileSize,
    originalFilename: u.originalFilename,
  }));

  const result = await createOrgWelfareReport(
    {
      reportId: insertedId,
      referenceCode: orgReferenceCode,
      kind,
      severity: "critical",
      description,
      subjectKind,
      subjectPetId,
      subjectDescription,
      locationAddress,
      jurisdictionProvince,
      jurisdictionLocality,
      locationLat,
      locationLng,
      occurredAt,
      observedSymptoms,
      attachments,
      uploadedPaths: uploadResult.uploadedPaths,
      orgMember: {
        userId: user.id,
        orgId: orgRow.orgId,
        orgDisplayName: orgRow.orgDisplayName,
        orgVerified: orgRow.orgVerified,
        memberRole: orgRow.memberRole,
      },
      orgToken,
    },
    {
      repo,
      openCase: async (input) => openCase(input as Parameters<typeof openCase>[0]),
      findGovtRecipients: async (opts) => findAuthoritiesForJurisdiction(opts),
      signal: async (opts) => {
        await signalWelfareReport(opts);
      },
      transaction: db.transaction.bind(db),
    },
  );

  if (!result.ok) {
    if (uploadResult.uploadedPaths.length > 0) {
      await supabase.storage
        .from("welfare-evidence")
        .remove(uploadResult.uploadedPaths)
        .catch(() => {});
    }
    return { error: result.error };
  }

  redirect(result.redirectTo);
}

// ---------------------------------------------------------------------------
// Internal helpers — jurisdiction scope guards
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// addReporterCommentAction — reporter adds a free-text note to their case
// ---------------------------------------------------------------------------

export type ReporterCommentResult = { ok: true } | { ok: false; error: string };

export async function addReporterCommentAction(
  welfareReportId: string,
  text: string,
): Promise<ReporterCommentResult> {
  const session = await requireUserOrRedirect();

  const result = await addReporterComment(
    { reportId: welfareReportId, reporterUserId: session.user.id, text },
    {
      repo: { findById: repo.findById.bind(repo) },
      insertCaseEvent: repo.insertCaseEvent.bind(repo),
    },
  );

  if (!result.ok) {
    const errorMessages: Record<string, string> = {
      forbidden: "No tenés permiso para comentar en esta denuncia.",
      validation: "El comentario debe tener entre 1 y 2000 caracteres.",
      no_case: "Esta denuncia aún no tiene un caso asociado.",
      report_not_found: "Denuncia no encontrada.",
      db_error: "Error al guardar el comentario. Intentá de nuevo.",
    };
    return { ok: false, error: errorMessages[result.error] ?? "Error inesperado." };
  }

  revalidatePath(`/denuncias/${welfareReportId}`);
  return { ok: true };
}

type WelfareReportRow = import("@/db").WelfareReport;

async function loadInScopeReport(
  reportId: string,
  actor: { id: string; role: "admin" | "govt" },
  jurisdictions: { province: string; locality: string }[],
): Promise<{ row: WelfareReportRow } | { error: string }> {
  const row = await repo.findById(reportId);
  if (!row) return { error: "Denuncia no encontrada." };

  if (actor.role === "govt") {
    const inScope = jurisdictions.some(
      (j) => j.province === row.jurisdictionProvince && j.locality === row.jurisdictionLocality,
    );
    if (!inScope) return { error: "La denuncia está fuera de tu jurisdicción." };
  }

  return { row };
}

async function loadAndVerifyScope(
  reportId: string,
  actor: { id: string; role: "admin" | "govt" },
  jurisdictions: { province: string; locality: string }[],
): Promise<{ row: WelfareReportRow } | { ok: false; error: string }> {
  const row = await repo.findById(reportId);
  if (!row) return { ok: false, error: "Denuncia no encontrada." };

  if (actor.role === "govt") {
    const inScope = jurisdictions.some(
      (j) => j.province === row.jurisdictionProvince && j.locality === row.jurisdictionLocality,
    );
    if (!inScope) return { ok: false, error: "La denuncia está fuera de tu jurisdicción." };
  }

  return { row };
}
