import { db, welfareReportAttachments, welfareReports } from "@/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { readPoint } from "@/lib/location";
import { maskEmail, maskPhone } from "@/lib/mask-contact";
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
    <div className="w-full h-64 rounded-[5px] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] animate-pulse" />
  ),
});

function statusBadgeClass(status: string): string {
  switch (status) {
    case "closed":
      return "bg-[var(--color-ln-ok-050)] text-[var(--color-ln-ok)] border border-[var(--color-ln-ok-100)]";
    case "invalid":
    case "duplicate":
      return "bg-[var(--color-ln-stripe)] text-[var(--color-ln-mute)] border border-[var(--color-ln-line)]";
    case "in_progress":
      return "bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)] border border-[var(--color-ln-celeste-100)]";
    case "triaged":
      return "bg-[var(--color-ln-warn-050)] text-[var(--color-ln-warn)] border border-[var(--color-ln-warn-100)]";
    default:
      return "bg-[var(--color-ln-stripe)] text-[var(--color-ln-ink-2)] border border-[var(--color-ln-line)]";
  }
}

function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-[var(--color-ln-err-050)] text-[var(--color-ln-seal)] border border-[var(--color-ln-err-100)]";
    case "high":
      return "bg-[var(--color-ln-warn-050)] text-[var(--color-ln-warn)] border border-[var(--color-ln-warn-100)]";
    case "medium":
      return "bg-[var(--color-ln-warn-025)] text-[var(--color-ln-warn)] border border-[var(--color-ln-warn-100)]";
    default:
      return "bg-[var(--color-ln-stripe)] text-[var(--color-ln-ink-2)] border border-[var(--color-ln-line)]";
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[9.5px] uppercase tracking-[.1em] font-semibold text-[var(--color-ln-mute)]"
      style={{ fontFamily: "var(--font-ln-mono)" }}
    >
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
    <main className="p-6 bg-[var(--color-ln-paper)]">
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
          className="inline-block text-[11px] font-semibold uppercase tracking-[.08em] text-[var(--color-ln-mute)] hover:text-[var(--color-ln-ink-2)] transition-colors no-underline"
          style={{ fontFamily: "var(--font-ln-mono)" }}
        >
          ← Buscar otra denuncia
        </Link>

        {/* Fresh submission confirmation banner */}
        {nueva === "1" && (
          <div
            data-comprobante
            className="rounded-[6px] border border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] px-5 py-5 space-y-3"
          >
            <p className="text-sm font-semibold text-[var(--color-ln-ok)]">
              Tu denuncia fue registrada. Gracias por animarte a denunciar.
            </p>
            <p
              className="text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-ok)]"
              style={{ fontFamily: "var(--font-ln-mono)" }}
            >
              Tu código de seguimiento
            </p>
            {/* pub-codecard pattern: mono code in a bordered box */}
            <div className="rounded-[6px] border-2 border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] px-4 py-3 inline-block">
              <p
                className="text-2xl font-semibold tracking-[.06em] text-[var(--color-ln-ink)]"
                style={{ fontFamily: "var(--font-ln-mono)" }}
              >
                {report.referenceCode}
              </p>
            </div>
            <p className="text-xs text-[var(--color-ln-ok)] leading-relaxed">
              Guardá este código. Es la única forma de volver a esta denuncia sin sesión.
            </p>
            <DescargarComprobante />
          </div>
        )}

        {/* Header */}
        <header className="space-y-3">
          <h1
            className="text-[28px] font-semibold tracking-[-0.015em] leading-tight text-[var(--color-ln-ink)]"
            style={{ fontFamily: "var(--font-ln-serif)" }}
          >
            {welfareReportKindLabel(report.kind)}
          </h1>
          {/* Reference code — always visible */}
          <p
            className="text-sm text-[var(--color-ln-mute)]"
            style={{ fontFamily: "var(--font-ln-mono)" }}
          >
            {report.referenceCode}
          </p>
          <div className="flex flex-wrap gap-2">
            <span
              className={`text-[9.5px] font-semibold px-2.5 py-0.5 rounded-[2px] ${statusBadgeClass(report.status)}`}
              style={{
                fontFamily: "var(--font-ln-mono)",
                letterSpacing: ".04em",
                textTransform: "uppercase",
              }}
            >
              {welfareReportStatusLabel(report.status)}
            </span>
            <span
              className={`text-[9.5px] font-semibold px-2.5 py-0.5 rounded-[2px] ${severityBadgeClass(report.severity)}`}
              style={{
                fontFamily: "var(--font-ln-mono)",
                letterSpacing: ".04em",
                textTransform: "uppercase",
              }}
            >
              {welfareReportSeverityLabel(report.severity)}
            </span>
          </div>
          <div
            className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--color-ln-mute)]"
            style={{ fontFamily: "var(--font-ln-mono)" }}
          >
            <span>Enviada {formatDateTime(report.createdAt)}</span>
            {report.occurredAt && <span>Ocurrió el {formatDate(report.occurredAt)}</span>}
          </div>
        </header>

        {/* Description */}
        <section className="space-y-2">
          <SectionLabel>¿Qué pasó?</SectionLabel>
          <p className="text-[var(--color-ln-ink-2)] leading-relaxed whitespace-pre-wrap">
            {report.description}
          </p>
        </section>

        {/* Subject */}
        <section className="space-y-2">
          <SectionLabel>¿Sobre quién?</SectionLabel>
          <p className="text-sm text-[var(--color-ln-ink-2)]">
            {welfareReportSubjectKindLabel(report.subjectKind)}
          </p>
          {report.subjectDescription && (
            <p className="text-sm text-[var(--color-ln-ink-2)]">{report.subjectDescription}</p>
          )}
        </section>

        {/* Location */}
        {hasLocation && (
          <section className="space-y-2">
            <SectionLabel>Lugar</SectionLabel>
            <div className="text-sm text-[var(--color-ln-ink-2)] space-y-1">
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
                  <p
                    className="text-xs text-[var(--color-ln-mute)]"
                    style={{ fontFamily: "var(--font-ln-mono)" }}
                  >
                    {locationPoint.lat.toFixed(6)}, {locationPoint.lng.toFixed(6)}
                  </p>
                </>
              )}
            </div>
          </section>
        )}

        {/* Contact — masked to protect PII while still letting the
            reporter recognise their own data. */}
        {hasContact && (
          <section className="space-y-2">
            <SectionLabel>Contacto que dejaste (parcial)</SectionLabel>
            <div className="text-sm text-[var(--color-ln-ink-2)] space-y-1">
              {report.reporterContactEmail && <p>{maskEmail(report.reporterContactEmail)}</p>}
              {report.reporterContactPhone && <p>{maskPhone(report.reporterContactPhone)}</p>}
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
                    <div
                      key={a.id}
                      className="rounded-[5px] overflow-hidden border border-[var(--color-ln-line-strong)]"
                    >
                      {/* biome-ignore lint/a11y/useMediaCaption: evidence video, no captions available */}
                      <video
                        src={a.signedUrl}
                        controls
                        className="w-full aspect-video object-cover bg-[var(--color-ln-stripe)]"
                      />
                      {a.originalFilename && (
                        <p className="px-2 py-1 text-xs text-[var(--color-ln-mute)] truncate">
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
                      className="block rounded-[5px] overflow-hidden border border-[var(--color-ln-line-strong)] hover:opacity-90 transition-opacity"
                    >
                      <img
                        src={a.signedUrl}
                        alt={a.originalFilename ?? "Evidencia adjunta"}
                        className="w-full aspect-square object-cover bg-[var(--color-ln-stripe)]"
                      />
                    </a>
                  )
                ) : null,
              )}
            </div>
          </section>
        )}

        {/* Integration-pending notice */}
        <div className="rounded-[4px] border border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-025)] px-5 py-4 text-sm text-[var(--color-ln-warn)] leading-relaxed">
          Esta denuncia aún no fue enviada a la herramienta gubernamental — la integración con los
          canales oficiales de la Ley 14.346 está en desarrollo. Tu reporte queda guardado y será
          enviado cuando la integración esté disponible.
        </div>
      </div>
    </main>
  );
}
