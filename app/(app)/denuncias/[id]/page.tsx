import { db, pets, welfareReportAttachments, welfareReports } from "@/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { readPoint } from "@/lib/location";
import { welfareAttachmentSignedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import {
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportStatusLabel,
  welfareReportSubjectKindLabel,
} from "@/lib/welfare";
import { and, eq } from "drizzle-orm";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

const LocationMap = dynamic(() => import("@/components/LocationMap"), {
  loading: () => (
    <div className="w-full h-64 rounded-lg border border-gob-border  bg-gob-surface-alt  animate-pulse" />
  ),
});

// Status badge color mapping — matches mis-denuncias page.
function statusBadgeClass(status: string): string {
  switch (status) {
    case "closed":
      return "bg-gob-success/10  text-gob-success ";
    case "invalid":
    case "duplicate":
      return "bg-gob-surface-alt  text-gob-text-muted ";
    case "in_progress":
      return "bg-gob-info/10  text-gob-azul-link ";
    case "triaged":
      return "bg-gob-warning/10  text-gob-warning-text ";
    default:
      return "bg-gob-surface-alt  text-gob-text-gray ";
  }
}

function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-gob-danger/10  text-gob-danger ";
    case "high":
      return "bg-gob-warning/10  text-gob-warning-text ";
    case "medium":
      return "bg-gob-warning/10  text-gob-warning-text ";
    default:
      return "bg-gob-surface-alt  text-gob-text-gray ";
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs uppercase tracking-wider font-semibold text-gob-text-muted ">
      {children}
    </h2>
  );
}

export default async function WelfareReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch report — only the reporter can see their own submissions.
  const [report] = await db
    .select()
    .from(welfareReports)
    .where(and(eq(welfareReports.id, id), eq(welfareReports.reporterUserId, user.id)))
    .limit(1);
  if (!report) notFound();

  // Fetch subject pet info if applicable.
  let subjectPet: { publicToken: string; name: string } | null = null;
  if (report.subjectPetId) {
    const [petRow] = await db
      .select({ publicToken: pets.publicToken, name: pets.name })
      .from(pets)
      .where(eq(pets.id, report.subjectPetId))
      .limit(1);
    subjectPet = petRow ?? null;
  }

  // Fetch attachments + generate signed URLs.
  const attachmentRows = await db
    .select()
    .from(welfareReportAttachments)
    .where(eq(welfareReportAttachments.welfareReportId, report.id));

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
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-6 space-y-8">
        {/* Back link */}
        <Link
          href="/denuncias/mias"
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4 hover:text-gob-text  transition-colors"
        >
          ← Mis denuncias
        </Link>

        {/* Header */}
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-gob-text ">
            {welfareReportKindLabel(report.kind)}
          </h1>
          {/* Reference code + share hint */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm text-gob-text-muted ">
              Código de seguimiento:{" "}
              <span className="font-mono tracking-wide text-gob-text-gray ">
                {report.referenceCode}
              </span>
            </p>
            <a
              href={`/denuncias/codigo/${report.referenceCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline underline-offset-4 text-gob-text-muted  hover:text-gob-text-gray  transition-colors"
            >
              Compartir este link
            </a>
          </div>
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
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gob-text-muted ">
            <span>Enviada {formatDateTime(report.createdAt)}</span>
            {report.occurredAt && <span>Ocurrió el {formatDate(report.occurredAt)}</span>}
          </div>
        </header>

        {/* Description */}
        <section className="space-y-2">
          <SectionLabel>¿Qué pasó?</SectionLabel>
          <p className="text-gob-text  leading-relaxed whitespace-pre-wrap">{report.description}</p>
        </section>

        {/* Subject */}
        <section className="space-y-2">
          <SectionLabel>¿Sobre quién?</SectionLabel>
          <p className="text-sm text-gob-text-gray ">
            {welfareReportSubjectKindLabel(report.subjectKind)}
          </p>
          {report.subjectKind === "registered_pet" && subjectPet && (
            <Link
              href={`/mis-mascotas/${subjectPet.publicToken}`}
              className="inline-flex items-center gap-1 text-sm underline underline-offset-2 text-gob-text-gray  hover:text-gob-text "
            >
              {subjectPet.name}
              <span className="text-xs font-mono text-gob-text-muted">
                {subjectPet.publicToken}
              </span>
            </Link>
          )}
          {report.subjectDescription && (
            <p className="text-sm text-gob-text-gray ">{report.subjectDescription}</p>
          )}
        </section>

        {/* Location */}
        {hasLocation && (
          <section className="space-y-2">
            <SectionLabel>Lugar</SectionLabel>
            <div className="text-sm text-gob-text-gray  space-y-1">
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
                  <p className="text-xs text-gob-text-muted  font-mono">
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
            <div className="text-sm text-gob-text-gray  space-y-1">
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
                    <div
                      key={a.id}
                      className="rounded-lg overflow-hidden border border-gob-border "
                    >
                      {/* biome-ignore lint/a11y/useMediaCaption: evidence video, no captions available */}
                      <video
                        src={a.signedUrl}
                        controls
                        className="w-full aspect-video object-cover bg-gob-surface-alt "
                      />
                      {a.originalFilename && (
                        <p className="px-2 py-1 text-xs text-gob-text-muted  truncate">
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
                      className="block rounded-lg overflow-hidden border border-gob-border  hover:opacity-90 transition-opacity"
                    >
                      <img
                        src={a.signedUrl}
                        alt={a.originalFilename ?? "Evidencia adjunta"}
                        className="w-full aspect-square object-cover bg-gob-surface-alt "
                      />
                    </a>
                  )
                ) : null,
              )}
            </div>
          </section>
        )}

        {/* Integration-pending notice */}
        <div className="rounded-xl border border-gob-warning  bg-gob-warning/10  px-5 py-4 text-sm text-gob-warning-text  leading-relaxed">
          Esta denuncia aún no fue enviada a la herramienta gubernamental — la integración con los
          canales oficiales de la Ley 14.346 está en desarrollo. Tu reporte queda guardado y será
          enviado cuando la integración esté disponible.
        </div>
      </div>
    </main>
  );
}
