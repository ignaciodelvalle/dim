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
    <div className="w-full h-64 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 animate-pulse" />
  ),
});

// Status badge color mapping — matches mis-denuncias page.
function statusBadgeClass(status: string): string {
  switch (status) {
    case "closed":
      return "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200";
    case "invalid":
    case "duplicate":
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400";
    case "in_progress":
      return "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200";
    case "triaged":
      return "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200";
    default:
      return "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300";
  }
}

function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200";
    case "high":
      return "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200";
    case "medium":
      return "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200";
    default:
      return "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400";
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-500">
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
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-6 space-y-8">
        {/* Back link */}
        <Link
          href="/denuncias/mias"
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4 hover:text-neutral-900 dark:hover:text-neutral-50 transition-colors"
        >
          ← Mis denuncias
        </Link>

        {/* Header */}
        <header className="space-y-3">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {welfareReportKindLabel(report.kind)}
          </h1>
          {/* Reference code + share hint */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm text-neutral-500 dark:text-neutral-500">
              Código de seguimiento:{" "}
              <span className="font-mono tracking-wide text-neutral-700 dark:text-neutral-300">
                {report.referenceCode}
              </span>
            </p>
            <a
              href={`/denuncias/codigo/${report.referenceCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline underline-offset-4 text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
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
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-500 dark:text-neutral-500">
            <span>Enviada {formatDateTime(report.createdAt)}</span>
            {report.occurredAt && <span>Ocurrió el {formatDate(report.occurredAt)}</span>}
          </div>
        </header>

        {/* Description */}
        <section className="space-y-2">
          <SectionLabel>¿Qué pasó?</SectionLabel>
          <p className="text-neutral-800 dark:text-neutral-200 leading-relaxed whitespace-pre-wrap">
            {report.description}
          </p>
        </section>

        {/* Subject */}
        <section className="space-y-2">
          <SectionLabel>¿Sobre quién?</SectionLabel>
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            {welfareReportSubjectKindLabel(report.subjectKind)}
          </p>
          {report.subjectKind === "registered_pet" && subjectPet && (
            <Link
              href={`/mis-mascotas/${subjectPet.publicToken}`}
              className="inline-flex items-center gap-1 text-sm underline underline-offset-2 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-50"
            >
              {subjectPet.name}
              <span className="text-xs font-mono text-neutral-400">{subjectPet.publicToken}</span>
            </Link>
          )}
          {report.subjectDescription && (
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              {report.subjectDescription}
            </p>
          )}
        </section>

        {/* Location */}
        {hasLocation && (
          <section className="space-y-2">
            <SectionLabel>Lugar</SectionLabel>
            <div className="text-sm text-neutral-700 dark:text-neutral-300 space-y-1">
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
                  <p className="text-xs text-neutral-500 dark:text-neutral-500 font-mono">
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
            <div className="text-sm text-neutral-700 dark:text-neutral-300 space-y-1">
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
                      className="rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800"
                    >
                      {/* biome-ignore lint/a11y/useMediaCaption: evidence video, no captions available */}
                      <video
                        src={a.signedUrl}
                        controls
                        className="w-full aspect-video object-cover bg-neutral-100 dark:bg-neutral-900"
                      />
                      {a.originalFilename && (
                        <p className="px-2 py-1 text-xs text-neutral-500 dark:text-neutral-500 truncate">
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
                      className="block rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 hover:opacity-90 transition-opacity"
                    >
                      <img
                        src={a.signedUrl}
                        alt={a.originalFilename ?? "Evidencia adjunta"}
                        className="w-full aspect-square object-cover bg-neutral-100 dark:bg-neutral-900"
                      />
                    </a>
                  )
                ) : null,
              )}
            </div>
          </section>
        )}

        {/* Integration-pending notice */}
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-5 py-4 text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
          Esta denuncia aún no fue enviada a la herramienta gubernamental — la integración con los
          canales oficiales de la Ley 14.346 está en desarrollo. Tu reporte queda guardado y será
          enviado cuando la integración esté disponible.
        </div>
      </div>
    </main>
  );
}
