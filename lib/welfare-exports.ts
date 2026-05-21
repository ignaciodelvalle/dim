// PDF renderer for the Welfare MPF CABA formal denuncia (Chunk F, F1).
//
// Decision F-D1: PDF libre DIM with Ley 14.346 fields — no official template
//   (MPF CABA accepts free-form written denuncias). Low coupling, works for any
//   Argentine jurisdiction.
// Decision F-D2: No PKI signing. Traceability via referenceCode + audit_log +
//   signed URL (Supabase Storage). Footer includes the referenceCode verbatim.
// Decision F-D5: audit_log action name = "welfare_mpf_export_generated" (snake_case).
// Decision F-D6: storage bucket = "welfare-exports" (private, 2 separate buckets).
//
// BUCKETS REQUIRED (owner ops — create in Supabase Studio, do NOT auto-create):
//   - welfare-exports  (private, signed URLs only)
//
// Usage:
//   const pdfBytes = await generateWelfareMpfPdf(report, reporterName, subjectPetInfo, attachmentUrls);

import { PDFDocument, type PDFFont, type PDFPage, PageSizes, StandardFonts, rgb } from "pdf-lib";

import type { WelfareReport, WelfareReportAttachment } from "@/db";
import {
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportSubjectKindLabel,
} from "@/lib/welfare";

// Schema version stamped in audit_log payloads so exports are reproducible.
export const MPF_EXPORT_SCHEMA_VERSION = "2026-05-21";

// ---------------------------------------------------------------------------
// DTO types
// ---------------------------------------------------------------------------

export type WelfareMpfAttachmentInfo = {
  filename: string;
  signedUrl: string | null;
};

export type WelfareMpfSubjectPetInfo = {
  name: string;
  microchipId: string | null;
} | null;

export type WelfareMpfDto = {
  referenceCode: string;
  reportId: string;
  // Hecho
  kindLabel: string;
  severityLabel: string;
  description: string;
  occurredAtLabel: string; // "no especificada" when null
  // Lugar
  jurisdictionProvince: string | null;
  jurisdictionLocality: string | null;
  locationAddress: string | null;
  locationLat: string | null;
  locationLng: string | null;
  // Sujeto
  subjectKindLabel: string;
  subjectDescription: string | null;
  subjectPet: WelfareMpfSubjectPetInfo;
  // Denunciante — null fields indicate anonymous
  reporterDisplayName: string | null;
  reporterIsAnonymous: boolean;
  reporterContactEmail: string | null;
  reporterContactPhone: string | null;
  // Adjuntos
  attachments: WelfareMpfAttachmentInfo[];
  // Audit trail
  exportGeneratedAt: string;
  reportCreatedAt: string;
  exportedByDisplayName: string;
};

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

/**
 * Maps a raw welfare_reports row + ancillary data into the PDF DTO.
 * Pure function — no DB calls, no side effects.
 */
export function welfareReportToMpfDto(
  report: WelfareReport,
  opts: {
    reporterDisplayName: string | null;
    exportedByDisplayName: string;
    subjectPet: WelfareMpfSubjectPetInfo;
    attachments: WelfareMpfAttachmentInfo[];
    exportGeneratedAt: Date;
  },
): WelfareMpfDto {
  const isAnonymous = report.reporterUserId === null && report.reporterOrganizationId === null;

  return {
    referenceCode: report.referenceCode,
    reportId: report.id,
    kindLabel: welfareReportKindLabel(report.kind),
    severityLabel: welfareReportSeverityLabel(report.severity),
    description: report.description,
    occurredAtLabel: report.occurredAt
      ? new Date(report.occurredAt).toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "Fecha del hecho no especificada por el denunciante",
    jurisdictionProvince: report.jurisdictionProvince ?? null,
    jurisdictionLocality: report.jurisdictionLocality ?? null,
    locationAddress: report.locationAddress ?? null,
    locationLat: report.locationLat ?? null,
    locationLng: report.locationLng ?? null,
    subjectKindLabel: welfareReportSubjectKindLabel(report.subjectKind),
    subjectDescription: report.subjectDescription ?? null,
    subjectPet: opts.subjectPet,
    reporterDisplayName: isAnonymous ? null : opts.reporterDisplayName,
    reporterIsAnonymous: isAnonymous,
    reporterContactEmail: isAnonymous ? null : (report.reporterContactEmail ?? null),
    reporterContactPhone: isAnonymous ? null : (report.reporterContactPhone ?? null),
    attachments: opts.attachments,
    exportGeneratedAt: opts.exportGeneratedAt.toLocaleString("es-AR"),
    reportCreatedAt: new Date(report.createdAt).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    exportedByDisplayName: opts.exportedByDisplayName,
  };
}

// ---------------------------------------------------------------------------
// PDF renderer
// ---------------------------------------------------------------------------

// Tiny helper to draw a labelled text block and advance the cursor.
function drawField(
  page: PDFPage,
  opts: {
    label: string;
    value: string;
    x: number;
    y: number;
    boldFont: PDFFont;
    regularFont: PDFFont;
    labelSize?: number;
    valueSize?: number;
    maxWidth?: number;
  },
): number {
  const {
    label,
    value,
    x,
    y,
    boldFont,
    regularFont,
    labelSize = 7,
    valueSize = 9,
    maxWidth = 480,
  } = opts;

  page.drawText(label.toUpperCase(), {
    x,
    y,
    size: labelSize,
    font: boldFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Naive word-wrap: split on newlines, then wrap long lines.
  const rawLines = value.split("\n");
  const wrapped: string[] = [];
  for (const raw of rawLines) {
    if (regularFont.widthOfTextAtSize(raw, valueSize) <= maxWidth) {
      wrapped.push(raw);
    } else {
      const words = raw.split(" ");
      let current = "";
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (regularFont.widthOfTextAtSize(test, valueSize) <= maxWidth) {
          current = test;
        } else {
          if (current) wrapped.push(current);
          current = word;
        }
      }
      if (current) wrapped.push(current);
    }
  }

  let cursor = y - labelSize - 2;
  for (const line of wrapped) {
    page.drawText(line, {
      x,
      y: cursor,
      size: valueSize,
      font: regularFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    cursor -= valueSize + 2;
  }

  return cursor - 4; // bottom of this field with a gap
}

function drawSectionHeader(
  page: PDFPage,
  opts: {
    text: string;
    x: number;
    y: number;
    width: number;
    boldFont: PDFFont;
  },
): number {
  const { text, x, y, width, boldFont } = opts;
  page.drawRectangle({
    x,
    y: y - 3,
    width,
    height: 14,
    color: rgb(0.93, 0.93, 0.93),
  });
  page.drawText(text, {
    x: x + 4,
    y,
    size: 8,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  return y - 20;
}

/**
 * Renders a Welfare MPF CABA denuncia PDF and returns the raw bytes.
 * Uses pdf-lib (pure JS, no React, no peer-dep conflicts with React 19).
 */
export async function generateWelfareMpfPdf(dto: WelfareMpfDto): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage(PageSizes.A4);

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { width, height } = page.getSize();
  const margin = 56;
  const contentWidth = width - margin * 2;
  let y = height - margin;

  // ------------------------------------------------------------------
  // Header
  // ------------------------------------------------------------------
  page.drawText("MiMAR — Mi Mascota Argentina", {
    x: margin,
    y,
    size: 14,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.6),
  });
  y -= 18;
  page.drawText("DENUNCIA FORMAL — LEY NACIONAL 14.346 (1954)", {
    x: margin,
    y,
    size: 10,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 14;
  page.drawText("Malos tratos y actos de crueldad contra animales", {
    x: margin,
    y,
    size: 8,
    font: regularFont,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 14;

  // ------------------------------------------------------------------
  // Referencia
  // ------------------------------------------------------------------
  y = drawSectionHeader(page, { text: "REFERENCIA", x: margin, y, width: contentWidth, boldFont });
  y = drawField(page, {
    label: "Código de referencia",
    value: dto.referenceCode,
    x: margin,
    y,
    boldFont,
    regularFont,
    maxWidth: contentWidth,
  });
  y = drawField(page, {
    label: "Fecha de creación de la denuncia",
    value: dto.reportCreatedAt,
    x: margin,
    y,
    boldFont,
    regularFont,
    maxWidth: contentWidth,
  });
  y -= 4;

  // ------------------------------------------------------------------
  // Hecho
  // ------------------------------------------------------------------
  y = drawSectionHeader(page, { text: "EL HECHO", x: margin, y, width: contentWidth, boldFont });
  y = drawField(page, {
    label: "Tipo de maltrato",
    value: dto.kindLabel,
    x: margin,
    y,
    boldFont,
    regularFont,
    maxWidth: contentWidth,
  });
  y = drawField(page, {
    label: "Gravedad",
    value: dto.severityLabel,
    x: margin,
    y,
    boldFont,
    regularFont,
    maxWidth: contentWidth,
  });
  y = drawField(page, {
    label: "Fecha del hecho",
    value: dto.occurredAtLabel,
    x: margin,
    y,
    boldFont,
    regularFont,
    maxWidth: contentWidth,
  });
  y = drawField(page, {
    label: "Descripción",
    value: dto.description,
    x: margin,
    y,
    boldFont,
    regularFont,
    maxWidth: contentWidth,
  });
  y -= 4;

  // ------------------------------------------------------------------
  // Lugar
  // ------------------------------------------------------------------
  y = drawSectionHeader(page, { text: "LUGAR", x: margin, y, width: contentWidth, boldFont });
  const locationParts: string[] = [];
  if (dto.locationAddress) locationParts.push(dto.locationAddress);
  if (dto.jurisdictionLocality) locationParts.push(dto.jurisdictionLocality);
  if (dto.jurisdictionProvince) locationParts.push(dto.jurisdictionProvince);
  y = drawField(page, {
    label: "Dirección / jurisdicción",
    value: locationParts.length > 0 ? locationParts.join(", ") : "No especificado",
    x: margin,
    y,
    boldFont,
    regularFont,
    maxWidth: contentWidth,
  });
  if (dto.locationLat && dto.locationLng) {
    y = drawField(page, {
      label: "Coordenadas GPS",
      value: `Lat: ${dto.locationLat} · Lng: ${dto.locationLng}`,
      x: margin,
      y,
      boldFont,
      regularFont,
      maxWidth: contentWidth,
    });
  }
  y -= 4;

  // ------------------------------------------------------------------
  // Sujeto
  // ------------------------------------------------------------------
  y = drawSectionHeader(page, { text: "SUJETO", x: margin, y, width: contentWidth, boldFont });
  y = drawField(page, {
    label: "Tipo de sujeto",
    value: dto.subjectKindLabel,
    x: margin,
    y,
    boldFont,
    regularFont,
    maxWidth: contentWidth,
  });
  if (dto.subjectPet) {
    y = drawField(page, {
      label: "Mascota identificada",
      value: `${dto.subjectPet.name}${dto.subjectPet.microchipId ? ` · Microchip: ${dto.subjectPet.microchipId}` : ""}`,
      x: margin,
      y,
      boldFont,
      regularFont,
      maxWidth: contentWidth,
    });
  } else if (dto.subjectDescription) {
    y = drawField(page, {
      label: "Descripción del sujeto",
      value: dto.subjectDescription,
      x: margin,
      y,
      boldFont,
      regularFont,
      maxWidth: contentWidth,
    });
  } else {
    y = drawField(page, {
      label: "Sujeto",
      value: "Animal no identificado",
      x: margin,
      y,
      boldFont,
      regularFont,
      maxWidth: contentWidth,
    });
  }
  y -= 4;

  // ------------------------------------------------------------------
  // Denunciante
  // ------------------------------------------------------------------
  y = drawSectionHeader(page, { text: "DENUNCIANTE", x: margin, y, width: contentWidth, boldFont });
  if (dto.reporterIsAnonymous) {
    y = drawField(page, {
      label: "Identidad",
      value: "Anónimo (denuncia legal por Ley 14.346 §11)",
      x: margin,
      y,
      boldFont,
      regularFont,
      maxWidth: contentWidth,
    });
  } else {
    y = drawField(page, {
      label: "Nombre",
      value: dto.reporterDisplayName ?? "Usuario registrado",
      x: margin,
      y,
      boldFont,
      regularFont,
      maxWidth: contentWidth,
    });
    if (dto.reporterContactEmail || dto.reporterContactPhone) {
      y = drawField(page, {
        label: "Contacto",
        value: [dto.reporterContactEmail, dto.reporterContactPhone].filter(Boolean).join(" · "),
        x: margin,
        y,
        boldFont,
        regularFont,
        maxWidth: contentWidth,
      });
    }
  }
  y -= 4;

  // ------------------------------------------------------------------
  // Evidencias adjuntas
  // ------------------------------------------------------------------
  if (dto.attachments.length > 0) {
    y = drawSectionHeader(page, {
      text: "EVIDENCIAS ADJUNTAS",
      x: margin,
      y,
      width: contentWidth,
      boldFont,
    });
    page.drawText(
      "Nota: los enlaces de evidencia tienen validez limitada (7 días desde la generación del PDF).",
      {
        x: margin,
        y,
        size: 7,
        font: regularFont,
        color: rgb(0.5, 0.5, 0.5),
      },
    );
    y -= 12;
    for (const att of dto.attachments) {
      const attText = att.signedUrl
        ? `${att.filename} — ${att.signedUrl}`
        : `${att.filename} — (URL no disponible)`;
      y = drawField(page, {
        label: "",
        value: attText,
        x: margin,
        y,
        boldFont,
        regularFont,
        valueSize: 7,
        maxWidth: contentWidth,
      });
    }
    y -= 4;
  }

  // ------------------------------------------------------------------
  // Normativa aplicable (verbatim from lib/case-normatives.ts)
  // ------------------------------------------------------------------
  y = drawSectionHeader(page, {
    text: "NORMATIVA APLICABLE",
    x: margin,
    y,
    width: contentWidth,
    boldFont,
  });
  y = drawField(page, {
    label: "Ley Nacional 14.346 (1954)",
    value: "Malos tratos y actos de crueldad contra animales",
    x: margin,
    y,
    boldFont,
    regularFont,
    maxWidth: contentWidth,
  });
  y = drawField(page, {
    label: "MPF CABA — Unidad Fiscal de Maltrato Animal",
    value: "Pipeline de denuncia formal (referencia operativa, no marco legal)",
    x: margin,
    y,
    boldFont,
    regularFont,
    maxWidth: contentWidth,
  });
  y -= 4;

  // ------------------------------------------------------------------
  // Audit trail
  // ------------------------------------------------------------------
  y = drawSectionHeader(page, {
    text: "TRAZABILIDAD",
    x: margin,
    y,
    width: contentWidth,
    boldFont,
  });
  y = drawField(page, {
    label: "PDF generado el",
    value: dto.exportGeneratedAt,
    x: margin,
    y,
    boldFont,
    regularFont,
    maxWidth: contentWidth,
  });
  y = drawField(page, {
    label: "Generado por",
    value: dto.exportedByDisplayName,
    x: margin,
    y,
    boldFont,
    regularFont,
    maxWidth: contentWidth,
  });

  // ------------------------------------------------------------------
  // Footer
  // ------------------------------------------------------------------
  const footerY = margin - 10;
  page.drawLine({
    start: { x: margin, y: footerY + 14 },
    end: { x: width - margin, y: footerY + 14 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  page.drawText(`Documento generado por DIM — Trazabilidad: ${dto.referenceCode} — mimar.ar`, {
    x: margin,
    y: footerY,
    size: 7,
    font: regularFont,
    color: rgb(0.5, 0.5, 0.5),
  });
  page.drawText("Sin firma PKI. Autenticidad verificable via referenceCode + audit_log (F-D2).", {
    x: margin,
    y: footerY - 10,
    size: 6,
    font: regularFont,
    color: rgb(0.65, 0.65, 0.65),
  });

  return pdfDoc.save();
}

// ---------------------------------------------------------------------------
// Storage helpers (shared between F1 and F2)
// ---------------------------------------------------------------------------

import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Uploads a PDF buffer to a private Supabase Storage bucket.
 * Returns the storage path on success.
 *
 * BUCKETS REQUIRED (owner ops — create in Supabase Studio before deploying):
 *   - welfare-exports  (private)
 *   - ppp-exports      (private)
 * Do NOT auto-create buckets from application code.
 */
export async function uploadExportToStorage(
  supabase: SupabaseServerClient,
  bucket: "welfare-exports" | "ppp-exports",
  path: string,
  bytes: Uint8Array,
): Promise<{ storagePath: string } | { error: string }> {
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) return { error: error.message };
  return { storagePath: path };
}

/**
 * Creates a signed URL for a private export PDF.
 * @param expiresIn TTL in seconds (default: 86400 = 24 h)
 */
export async function createSignedExportUrl(
  supabase: SupabaseServerClient,
  bucket: "welfare-exports" | "ppp-exports",
  path: string,
  expiresIn = 86400,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

// Re-export attachment type for convenience
export type { WelfareReportAttachment };
