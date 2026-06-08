import { db, welfareReportAttachments, welfareReports } from "@/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { readPoint } from "@/lib/location";
import { welfareAttachmentSignedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import {
  isValidReferenceCodeFormat,
  normalizeReferenceCode,
} from "@/src/modules/welfare/domain/reference-code";
import {
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportStatusLabel,
  welfareReportSubjectKindLabel,
} from "@/src/modules/welfare/domain/types";
import { eq } from "drizzle-orm";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DescargarComprobante } from "./DescargarComprobante";

const LocationMap = dynamic(() => import("@/components/LocationMap"), {
  loading: () => (
    <div className="w-full h-64 rounded-lg border border-gob-border bg-gob-surface-alt animate-pulse" />
  ),
});

function statusBadgeClass(status: string): string {
  switch (status) {
    case "closed":
      return "bg-gob-success/10 text-gob-success";
    case "invalid":
    case "duplicate":
      return "bg-gob-surface-alt text-gob-text-muted";
    case "in_progress":
      return "bg-gob-info/10 text-gob-info";
    case "triaged":
      return "bg-gob-warning/20 text-gob-warning-text";
    default:
      return "bg-gob-surface-alt text-gob-text-gray";
  }
}

function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-gob-danger/10 text-gob-danger";
    case "high":
      return "bg-gob-warning/20 text-gob-warning-text";
    case "medium":
      return "bg-gob-warning/10 text-gob-warning-text";
    default:
      return "bg-gob-surface-alt text-gob-text-gray";
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs uppercase tracking-wider font-semibold text-gob-text-muted">
      {children}
    </h2>
  );
}

export default async function WelfareReportByCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ nueva?: string }>;
}) {
  const { code: rawCode } = await params;
  const { nueva } = await searchParams;
  const code = normalizeReferenceCode(decodeURIComponent(rawCode));
  if (!isValidReferenceCodeFormat(code)) notFound();

  const [report] = await db
    .select()
    .from(welfareReports)
    .where(eq(welfareReports.referenceCode, code))
    .limit(1);
  if (!report) notFound();

  const attachmentRows = await db
    .select()
    .from(welfareReportAttachments)
    .where(eq(welfareReportAttachments.welfareReportId, report.id));

  const supabase = await createClient();
  const attachments = await Promise.all(
    attachmentRows.map(async (a) => ({
      ...a,
      signedUrl: await welfareAttachmentSignedUrl(supabase, a.storagePath),
    })),
  );

  const locationPoint = readPoint(report);
  const hasLocation =
    report.locationAddress ||
    report.jurisdictionProvince ||
    report.jurisdictionLocality ||
    locationPoint !== null;

  const hasContact = report.reporterContactEmail || report.reporterContactPhone;

  return (
    <main className="p-6 bg-white">
      {/* Print styles: hide nav chrome, show only the comprobante section */}
      <style
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static print CSS, no user input
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  body > *:not(main) { display: none !important; }
  main > div > *:not([data-comprobante]) { display: none !important; }
  [data-comprobante] { display: block !important; }
  [data-comprobante] * { color: #000 !important; border-color: #ccc !important; background: #fff !important; }
}
          `.trim(),
        }}
      />
      <div className="max-w-2xl mx-auto pt-6 space-y-8">
        {/* Back link */}
        <Link
          href="/denuncias/buscar"
          className="inline-block text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text transition-colors"
        >
          ← Buscar otra denuncia
        </Link>

        {/* Fresh submission confirmation banner */}
        {nueva === "1" && (
          <div
            data-comprobante
            className="rounded-xl border border-gob-success/30 bg-gob-success/10 px-5 py-5 space-y-3"
          >
            <p className="text-sm font-semibold text-gob-success">
              Tu denuncia fue registrada. Gracias por animarte a denunciar.
            </p>
            <p className="text-xs text-gob-success">Tu código de seguimiento:</p>
            <p className="text-3xl font-mono tracking-widest font-bold text-gob-text">
              {report.referenceCode}
            </p>
            <p className="text-xs text-gob-success leading-relaxed">
              Guardá este código. Es la única forma de volver a esta denuncia sin sesión.
            </p>
            <DescargarComprobante />
          </div>
        )}

        {/* Header */}
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-gob-text">
            {welfareReportKindLabel(report.kind)}
          </h1>
          {/* Reference code — always visible */}
          <p className="text-sm text-gob-text-muted">
            Código de seguimiento:{" "}
            <span className="font-mono tracking-wide text-gob-text-gray">
              {report.referenceCode}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <span
              className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusBadgeClass(report.status)}`}
            >
              {welfareReportStatusLabel(report.status)}
            </span>
            <span
              className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${severityBadgeClass(report.severity)}`}
            >
              {welfareReportSeverityLabel(report.severity)}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gob-text-muted">
            <span>Enviada {formatDateTime(report.createdAt)}</span>
            {report.occurredAt && <span>Ocurrió el {formatDate(report.occurredAt)}</span>}
          </div>
        </header>

        {/* Description */}
        <section className="space-y-2">
          <SectionLabel>¿Qué pasó?</SectionLabel>
          <p className="text-gob-text-gray leading-relaxed whitespace-pre-wrap">
            {report.description}
          </p>
        </section>

        {/* Subject */}
        <section className="space-y-2">
          <SectionLabel>¿Sobre quién?</SectionLabel>
          <p className="text-sm text-gob-text-gray">
            {welfareReportSubjectKindLabel(report.subjectKind)}
          </p>
          {report.subjectDescription && (
            <p className="text-sm text-gob-text-gray">{report.subjectDescription}</p>
          )}
        </section>

        {/* Location */}
        {hasLocation && (
          <section className="space-y-2">
            <SectionLabel>Lugar</SectionLabel>
            <div className="text-sm text-gob-text-gray space-y-1">
              {report.locationAddress && <p>{report.locationAddress}</p>}
              {(report.jurisdictionLocality || report.jurisdictionProvince) && (
                <p>
                  {[report.jurisdictionLocality, report.jurisdictionProvince]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              {locationPoint && (
                <>
                  <LocationMap lat={locationPoint.lat} lng={locationPoint.lng} />
                  <p className="text-xs text-gob-text-muted font-mono">
                    {locationPoint.lat.toFixed(6)}, {locationPoint.lng.toFixed(6)}
                  </p>
                </>
              )}
            </div>
          </section>
        )}

        {/* Contact */}
        {hasContact && (
          <section className="space-y-2">
            <SectionLabel>Contacto que dejaste</SectionLabel>
            <div className="text-sm text-gob-text-gray space-y-1">
              {report.reporterContactEmail && <p>{report.reporterContactEmail}</p>}
              {report.reporterContactPhone && <p>{report.reporterContactPhone}</p>}
            </div>
          </section>
        )}

        {/* Evidence gallery */}
        {attachments.length > 0 && (
          <section className="space-y-3">
            <SectionLabel>Evidencia adjunta</SectionLabel>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {attachments.map((a) =>
                a.signedUrl ? (
                  a.mimeType.startsWith("video/") ? (
                    <div key={a.id} className="rounded-lg overflow-hidden border border-gob-border">
                      {/* biome-ignore lint/a11y/useMediaCaption: evidence video, no captions available */}
                      <video
                        src={a.signedUrl}
                        controls
                        className="w-full aspect-video object-cover bg-gob-surface-alt"
                      />
                      {a.originalFilename && (
                        <p className="px-2 py-1 text-xs text-gob-text-muted truncate">
                          {a.originalFilename}
                        </p>
                      )}
                    </div>
                  ) : (
                    <a
                      key={a.id}
                      href={a.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg overflow-hidden border border-gob-border hover:opacity-90 transition-opacity"
                    >
                      <img
                        src={a.signedUrl}
                        alt={a.originalFilename ?? "Evidencia adjunta"}
                        className="w-full aspect-square object-cover bg-gob-surface-alt"
                      />
                    </a>
                  )
                ) : null,
              )}
            </div>
          </section>
        )}

        {/* Integration-pending notice */}
        <div className="rounded-xl border border-gob-warning/40 bg-gob-warning/10 px-5 py-4 text-sm text-gob-warning-text leading-relaxed">
          Esta denuncia aún no fue enviada a la herramienta gubernamental — la integración con los
          canales oficiales de la Ley 14.346 está en desarrollo. Tu reporte queda guardado y será
          enviado cuando la integración esté disponible.
        </div>
      </div>
    </main>
  );
}
