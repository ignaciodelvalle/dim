// Welfare report detail — Libreta Nacional redesign.
// Presentation only; data fetching, actions, ReporterCommentForm, and LocationMap unchanged.

import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnCallout, LnSectionHead } from "@/components/ui/DocElements";
import { db, pets, welfareReportAttachments, welfareReports } from "@/db";
import { caseEvents, cases } from "@/db/schema";
import { formatDate, formatDateTime } from "@/lib/format";
import { readPoint } from "@/lib/location";
import { welfareAttachmentSignedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { addReporterCommentAction } from "@/src/modules/welfare/actions";
import {
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportStatusLabel,
  welfareReportSubjectKindLabel,
} from "@/src/modules/welfare/domain/types";
import { and, desc, eq } from "drizzle-orm";
import { type CommentFormState, ReporterCommentForm } from "./_components/ReporterCommentForm";

const LocationMap = dynamic(() => import("@/components/LocationMap"), {
  loading: () => (
    <div className="w-full h-[240px] rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] animate-pulse" />
  ),
});

// Terminal statuses where the "integration pending" banner contradicts the
// status badge and should be hidden (UI-7 B7).
function isTerminalReportStatus(status: string): boolean {
  return status === "closed" || status === "invalid" || status === "duplicate";
}

// LN status badge class mapping.
function statusBadgeClass(status: string): string {
  switch (status) {
    case "closed":
      return "border-[var(--color-ln-ok-100)] bg-[var(--color-ln-ok-050)] text-[var(--color-ln-ok)]";
    case "invalid":
    case "duplicate":
      return "border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] text-[var(--color-ln-mute)]";
    case "in_progress":
      return "border-[var(--color-ln-celeste-100)] bg-[var(--color-ln-celeste-050)] text-[var(--color-ln-azul)]";
    case "triaged":
      return "border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] text-[var(--color-ln-warn)]";
    default:
      return "border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] text-[var(--color-ln-ink-2)]";
  }
}

function severityBadgeClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "border-[var(--color-ln-err-100)] bg-[var(--color-ln-err-050)] text-[var(--color-ln-err)]";
    case "high":
    case "medium":
      return "border-[var(--color-ln-warn-100)] bg-[var(--color-ln-warn-050)] text-[var(--color-ln-warn)]";
    default:
      return "border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] text-[var(--color-ln-mute)]";
  }
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

  const [report] = await db
    .select()
    .from(welfareReports)
    .where(and(eq(welfareReports.id, id), eq(welfareReports.reporterUserId, user.id)))
    .limit(1);
  if (!report) notFound();

  let subjectPet: { publicToken: string; name: string } | null = null;
  if (report.subjectPetId) {
    const [petRow] = await db
      .select({ publicToken: pets.publicToken, name: pets.name })
      .from(pets)
      .where(eq(pets.id, report.subjectPetId))
      .limit(1);
    subjectPet = petRow ?? null;
  }

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

  let reporterComments: Array<{
    id: string;
    notes: string | null;
    occurredAt: Date;
  }> = [];
  let casePublicCode: string | null = null;

  if (report.caseId) {
    const [caseRow, commentRows] = await Promise.all([
      db
        .select({ publicCode: cases.publicCode })
        .from(cases)
        .where(eq(cases.id, report.caseId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({ id: caseEvents.id, notes: caseEvents.notes, occurredAt: caseEvents.occurredAt })
        .from(caseEvents)
        .where(
          and(eq(caseEvents.caseId, report.caseId), eq(caseEvents.entryType, "reporter_comment")),
        )
        .orderBy(desc(caseEvents.occurredAt)),
    ]);
    casePublicCode = caseRow?.publicCode ?? null;
    reporterComments = commentRows;
  }

  const locationPoint = readPoint(report);
  const hasLocation =
    report.locationAddress ||
    report.jurisdictionProvince ||
    report.jurisdictionLocality ||
    locationPoint !== null;

  const hasContact = report.reporterContactEmail || report.reporterContactPhone;

  async function commentAction(
    _prev: CommentFormState,
    formData: FormData,
  ): Promise<CommentFormState> {
    "use server";
    const text = String(formData.get("text") ?? "").trim();
    const result = await addReporterCommentAction(id, text);
    if (!result.ok) return { error: result.error, success: false };
    return { error: null, success: true };
  }

  return (
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/denuncias/mias"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mis denuncias
      </Link>

      {/* Header */}
      <div className="mb-[24px]">
        <div className="flex items-start justify-between gap-3">
          <h1 className="m-0 font-[var(--font-ln-serif)] text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-ink)]">
            {welfareReportKindLabel(report.kind)}
          </h1>
          <div className="flex flex-shrink-0 flex-wrap gap-[6px]">
            <span
              className={`inline-flex items-center rounded-[2px] border px-[8px] py-[2px] font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] ${statusBadgeClass(report.status)}`}
            >
              {welfareReportStatusLabel(report.status)}
            </span>
            <span
              className={`inline-flex items-center rounded-[2px] border px-[8px] py-[2px] font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] ${severityBadgeClass(report.severity)}`}
            >
              {welfareReportSeverityLabel(report.severity)}
            </span>
          </div>
        </div>

        <div className="mt-[8px] flex flex-wrap items-center gap-x-[14px] gap-y-[4px]">
          <p className="font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-mute)]">
            Código <span className="text-[var(--color-ln-ink-2)]">{report.referenceCode}</span>
          </p>
          <a
            href={`/denuncias/codigo/${report.referenceCode}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-azul)] no-underline hover:underline"
          >
            Compartir link ↗
          </a>
        </div>
        <p className="mt-[4px] font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
          Enviada {formatDateTime(report.createdAt)}
          {report.occurredAt && ` · Ocurrió el ${formatDate(report.occurredAt)}`}
        </p>
        {casePublicCode && (
          <Link
            href={`/casos/${casePublicCode}`}
            className="mt-[4px] inline-block font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-azul)] no-underline hover:underline"
          >
            Ver caso {casePublicCode} →
          </Link>
        )}
      </div>

      {/* Integration-pending notice — only while the report is non-terminal.
          On closed / invalid / duplicate it contradicts the status badge (UI-7 B7). */}
      {!isTerminalReportStatus(report.status) && (
        <div className="mb-[24px]">
          <LnCallout tone="warn">
            Esta denuncia aún no fue enviada a la herramienta gubernamental — la integración con los
            canales oficiales de la Ley 14.346 está en desarrollo. Tu reporte queda guardado y será
            enviado cuando la integración esté disponible.
          </LnCallout>
        </div>
      )}

      <div className="flex flex-col gap-[20px]">
        {/* Description */}
        <LnCard>
          <LnCardHead title="¿Qué pasó?" />
          <LnCardBody>
            <p className="text-[13.5px] text-[var(--color-ln-ink-2)] leading-relaxed whitespace-pre-wrap">
              {report.description}
            </p>
          </LnCardBody>
        </LnCard>

        {/* Subject */}
        <LnCard>
          <LnCardHead title="¿Sobre quién?" />
          <LnCardBody>
            <p className="text-[13px] text-[var(--color-ln-ink-2)]">
              {welfareReportSubjectKindLabel(report.subjectKind)}
            </p>
            {report.subjectKind === "registered_pet" && subjectPet && (
              <Link
                href={`/mis-mascotas/${subjectPet.publicToken}`}
                className="mt-[6px] inline-flex items-center gap-[6px] text-[13px] text-[var(--color-ln-azul)] no-underline hover:underline"
              >
                {subjectPet.name}
                <span className="font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-mute)]">
                  {subjectPet.publicToken}
                </span>
              </Link>
            )}
            {report.subjectDescription && (
              <p className="mt-[6px] text-[13px] text-[var(--color-ln-mute)]">
                {report.subjectDescription}
              </p>
            )}
          </LnCardBody>
        </LnCard>

        {/* Location */}
        {hasLocation && (
          <LnCard>
            <LnCardHead title="Lugar" />
            <LnCardBody>
              <div className="flex flex-col gap-[8px]">
                {report.locationAddress && (
                  <p className="text-[13px] text-[var(--color-ln-ink-2)]">
                    {report.locationAddress}
                  </p>
                )}
                {(report.jurisdictionLocality || report.jurisdictionProvince) && (
                  <p className="font-[var(--font-ln-mono)] text-[11.5px] text-[var(--color-ln-mute)]">
                    {[report.jurisdictionLocality, report.jurisdictionProvince]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
                {locationPoint && (
                  <>
                    <LocationMap lat={locationPoint.lat} lng={locationPoint.lng} />
                    <p className="font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
                      {locationPoint.lat.toFixed(6)}, {locationPoint.lng.toFixed(6)}
                    </p>
                  </>
                )}
              </div>
            </LnCardBody>
          </LnCard>
        )}

        {/* Contact */}
        {hasContact && (
          <LnCard>
            <LnCardHead title="Contacto que dejaste" />
            <LnCardBody>
              <div className="flex flex-col gap-[6px]">
                {report.reporterContactEmail && (
                  <p className="text-[13px] text-[var(--color-ln-ink-2)]">
                    {report.reporterContactEmail}
                  </p>
                )}
                {report.reporterContactPhone && (
                  <p className="text-[13px] text-[var(--color-ln-ink-2)]">
                    {report.reporterContactPhone}
                  </p>
                )}
              </div>
            </LnCardBody>
          </LnCard>
        )}

        {/* Evidence gallery */}
        {attachments.length > 0 && (
          <LnCard>
            <LnCardHead title="Evidencia adjunta" />
            <LnCardBody>
              <div className="grid grid-cols-2 gap-[10px] sm:grid-cols-3">
                {attachments.map((a) =>
                  a.signedUrl ? (
                    a.mimeType.startsWith("video/") ? (
                      <div
                        key={a.id}
                        className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]"
                      >
                        {/* biome-ignore lint/a11y/useMediaCaption: evidence video, no captions available */}
                        <video
                          src={a.signedUrl}
                          controls
                          className="w-full aspect-video object-cover bg-[var(--color-ln-stripe)]"
                        />
                        {a.originalFilename && (
                          <p className="px-[8px] py-[4px] font-[var(--font-ln-mono)] text-xs text-[var(--color-ln-mute)] truncate">
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
                        className="block overflow-hidden rounded-[4px] border border-[var(--color-ln-line)] hover:opacity-90 transition-opacity"
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
            </LnCardBody>
          </LnCard>
        )}

        {/* Reporter comments */}
        {report.caseId && (
          <LnCard>
            <LnCardHead title="Tus comentarios sobre el caso" />
            <LnCardBody>
              {reporterComments.length > 0 && (
                <ol className="mb-[16px] flex flex-col gap-[10px]">
                  {reporterComments.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-stripe)] px-[14px] py-[12px]"
                    >
                      <p className="text-[13px] text-[var(--color-ln-ink-2)] whitespace-pre-wrap">
                        {c.notes}
                      </p>
                      <time className="mt-[4px] block font-[var(--font-ln-mono)] text-xs text-[var(--color-ln-mute)]">
                        {formatDateTime(c.occurredAt)}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
              <ReporterCommentForm action={commentAction} />
            </LnCardBody>
          </LnCard>
        )}
      </div>
    </div>
  );
}
