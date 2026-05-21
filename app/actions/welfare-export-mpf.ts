"use server";

// Server action for generating the formal Welfare MPF CABA denuncia PDF (Chunk F, F1).
//
// Pipeline: welfare report → PDF bytes (pdf-lib) → Storage (welfare-exports bucket)
//   → signed URL 24h → audit_log row.
//
// Decision F-D2: No PKI. Traceability via referenceCode + audit_log + signed URL.
// Decision F-D5: audit_log action = "welfare_mpf_export_generated" (snake_case).
// Decision F-D6: storage bucket = "welfare-exports" (private, separate from ppp-exports).
//
// Idempotency: if a welfare_mpf_export_generated row exists for this welfareReportId
//   within the last 24 hours AND the signed URL is still accessible, return the
//   existing signed URL instead of regenerating.
//
// Role gate: admin or govt in scope (same guard as the welfare detail page).

import { and, desc, eq, gte, sql } from "drizzle-orm";

import { auditLog, db, pets, profiles, welfareReportAttachments, welfareReports } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { welfareAttachmentSignedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import {
  MPF_EXPORT_SCHEMA_VERSION,
  createSignedExportUrl,
  generateWelfareMpfPdf,
  uploadExportToStorage,
  welfareReportToMpfDto,
} from "@/lib/welfare-exports";

// 7-day TTL for attachment URLs embedded in the PDF (attachments inside a
// downloaded PDF are opened by the officer later — 1h would expire).
const ATTACHMENT_URL_TTL_SECONDS = 7 * 24 * 60 * 60;
// 24h TTL for the export PDF signed URL returned to the actor.
const EXPORT_URL_TTL_SECONDS = 24 * 60 * 60;
// Idempotency window: reuse an existing export if generated within 24h.
const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type GenerateMpfExportResult =
  | { ok: true; signedUrl: string; expiresAt: Date }
  | { ok: false; error: string };

export async function generateMpfExportAction(
  welfareReportId: string,
): Promise<GenerateMpfExportResult> {
  const { profile, jurisdictions, user } = await requireAdminOrGovtOrRedirect();

  // Load the welfare report.
  const [report] = await db
    .select()
    .from(welfareReports)
    .where(eq(welfareReports.id, welfareReportId))
    .limit(1);

  if (!report) return { ok: false, error: "not_found" };

  // Govt scope guard (mirrors the detail page logic).
  if (profile.role === "govt") {
    const inScope = jurisdictions.some(
      (j) =>
        j.province === report.jurisdictionProvince && j.locality === report.jurisdictionLocality,
    );
    if (!inScope) return { ok: false, error: "not_found" };
  }

  const supabase = await createClient();

  // ------------------------------------------------------------------
  // Idempotency check — reuse a recent export if it exists.
  // ------------------------------------------------------------------
  const windowStart = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);
  const [existingExport] = await db
    .select({ payload: auditLog.payload, performedAt: auditLog.performedAt })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, "welfare_mpf_export_generated"),
        gte(auditLog.performedAt, windowStart),
        sql`${auditLog.payload}->>'welfareReportId' = ${welfareReportId}`,
      ),
    )
    .orderBy(desc(auditLog.performedAt))
    .limit(1);

  if (existingExport) {
    const payload = existingExport.payload as Record<string, unknown>;
    const storagePath = typeof payload.storagePath === "string" ? payload.storagePath : null;
    if (storagePath) {
      const existingUrl = await createSignedExportUrl(
        supabase,
        "welfare-exports",
        storagePath,
        EXPORT_URL_TTL_SECONDS,
      );
      if (existingUrl) {
        return {
          ok: true,
          signedUrl: existingUrl,
          expiresAt: new Date(Date.now() + EXPORT_URL_TTL_SECONDS * 1000),
        };
      }
    }
    // Signed URL creation failed (file may have been deleted) — fall through to regenerate.
  }

  // ------------------------------------------------------------------
  // Load ancillary data.
  // ------------------------------------------------------------------

  // Reporter display name.
  let reporterDisplayName: string | null = null;
  if (report.reporterUserId) {
    const [reporterProfile] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, report.reporterUserId))
      .limit(1);
    reporterDisplayName = reporterProfile?.displayName ?? null;
  }

  // Exporter display name.
  const [exporterProfile] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);
  const exportedByDisplayName = exporterProfile?.displayName ?? "Autoridad DIM";

  // Subject pet info.
  let subjectPet: { name: string; microchipId: string | null } | null = null;
  if (report.subjectPetId) {
    const [petRow] = await db
      .select({ name: pets.name, microchipId: pets.microchipId })
      .from(pets)
      .where(eq(pets.id, report.subjectPetId))
      .limit(1);
    if (petRow) {
      subjectPet = { name: petRow.name, microchipId: petRow.microchipId ?? null };
    }
  }

  // Attachment rows with signed URLs (7-day TTL for PDF embeds).
  const attachmentRows = await db
    .select()
    .from(welfareReportAttachments)
    .where(eq(welfareReportAttachments.welfareReportId, welfareReportId));

  const attachments = await Promise.all(
    attachmentRows.map(async (a) => ({
      filename: a.originalFilename ?? a.storagePath.split("/").pop() ?? "adjunto",
      signedUrl: await welfareAttachmentSignedUrl(
        supabase,
        a.storagePath,
        ATTACHMENT_URL_TTL_SECONDS,
      ),
    })),
  );

  // ------------------------------------------------------------------
  // Build DTO + render PDF.
  // ------------------------------------------------------------------
  const exportGeneratedAt = new Date();
  const dto = welfareReportToMpfDto(report, {
    reporterDisplayName,
    exportedByDisplayName,
    subjectPet,
    attachments,
    exportGeneratedAt,
  });

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateWelfareMpfPdf(dto);
  } catch (err) {
    console.error("[welfare-export-mpf] PDF render failed:", err);
    return { ok: false, error: "pdf_render_failed" };
  }

  // ------------------------------------------------------------------
  // Upload to welfare-exports bucket.
  // ------------------------------------------------------------------
  const timestamp = exportGeneratedAt.getTime();
  const storagePath = `${welfareReportId}/${timestamp}.pdf`;

  const uploadResult = await uploadExportToStorage(
    supabase,
    "welfare-exports",
    storagePath,
    pdfBytes,
  );
  if ("error" in uploadResult) {
    console.error("[welfare-export-mpf] Storage upload failed:", uploadResult.error);
    return { ok: false, error: "storage_upload_failed" };
  }

  // ------------------------------------------------------------------
  // Create signed URL (24h).
  // ------------------------------------------------------------------
  const signedUrl = await createSignedExportUrl(
    supabase,
    "welfare-exports",
    storagePath,
    EXPORT_URL_TTL_SECONDS,
  );
  if (!signedUrl) {
    return { ok: false, error: "signed_url_failed" };
  }

  // ------------------------------------------------------------------
  // Audit log.
  // ------------------------------------------------------------------
  await db.insert(auditLog).values({
    actorUserId: user.id,
    action: "welfare_mpf_export_generated",
    payload: {
      welfareReportId,
      referenceCode: report.referenceCode,
      storagePath,
      schemaVersion: MPF_EXPORT_SCHEMA_VERSION,
    },
  });

  return {
    ok: true,
    signedUrl,
    expiresAt: new Date(Date.now() + EXPORT_URL_TTL_SECONDS * 1000),
  };
}
