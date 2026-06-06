"use server";

// Thin action controllers for the welfare domain — WU-2 actions.
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
//   triage / start / close / assign / unassign / mpf-export:
//       requireAdminOrGovtOrRedirect() — govt scoped to jurisdiction in use-case
//   moderation (pass / confirm):
//       requireAdminOrRedirect() — ADMIN ONLY. Govt cannot moderate.
//
// NO business logic. NO direct Drizzle imports beyond shared db for notifications.

import { revalidatePath } from "next/cache";

import { db, type notifications } from "@/db";
import { requireAdminOrGovtOrRedirect, requireAdminOrRedirect } from "@/lib/auth-guards";
import { closeCase } from "@/lib/case-helpers";
import { welfareAttachmentSignedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import {
  MPF_EXPORT_SCHEMA_VERSION,
  createSignedExportUrl,
  generateWelfareMpfPdf,
  uploadExportToStorage,
  welfareReportToMpfDto,
} from "@/lib/welfare-exports";

import { assignWelfare } from "./application/assign-welfare";
import { closeWelfareReport } from "./application/close-welfare-report";
import { confirmWelfareAsSpam } from "./application/confirm-welfare-as-spam";
import { generateMpfExport } from "./application/generate-mpf-export";
import { getActiveGovtScopeForUser } from "./application/get-active-govt-scope";
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
export type TriageResult = { ok: true } | { error: string };
export type ModerationResult = { ok: true } | { error: string };
export type AssignResult = { ok: true } | { ok: false; error: string };
export type GenerateMpfExportResult =
  | { ok: true; signedUrl: string; expiresAt: Date }
  | { ok: false; error: string };

// Re-export helper (consumed by listing pages — must stay importable from here)
export { getActiveGovtScopeForUser };

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
// Internal helpers — jurisdiction scope guards
// ---------------------------------------------------------------------------

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
