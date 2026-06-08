import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db, pets, profiles, welfareReportAttachments, welfareReports } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { getNormativesForCase } from "@/lib/case-normatives";
import { formatDate, formatDateTime } from "@/lib/format";
import { fetchWelfareTimeline } from "@/lib/govt-dashboards";
import { readPoint } from "@/lib/location";
import { welfareAttachmentSignedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import {
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportStatusLabel,
  welfareReportSubjectKindLabel,
} from "@/src/modules/welfare/domain/types";
import { eq } from "drizzle-orm";

import { AssignmentActions } from "./AssignmentActions";
import { MpfExportButton } from "./MpfExportButton";
import { Timeline } from "./Timeline";
import { TriageActions } from "./TriageActions";

const LocationMap = dynamic(() => import("@/components/LocationMap"), {
  loading: () => (
    <div className="w-full h-64 rounded-lg border border-gob-border  bg-gob-surface-alt  animate-pulse" />
  ),
});

const STATUS_TONE: Record<string, string> = {
  open: "bg-gob-warning/10  text-gob-warning-text ",
  triaged: "bg-gob-info/10  text-gob-azul-link ",
  in_progress: "bg-gob-primary/10  text-gob-primary ",
  closed: "bg-gob-success/10  text-gob-success ",
  invalid: "bg-gob-surface-alt  text-gob-text-gray ",
  duplicate: "bg-gob-surface-alt  text-gob-text-gray ",
};

export default async function GobMaltratoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, jurisdictions, user } = await requireAdminOrGovtOrRedirect();

  const [report] = await db.select().from(welfareReports).where(eq(welfareReports.id, id)).limit(1);
  if (!report) notFound();

  // Govt scope guard — return notFound rather than a permission error so
  // we don't leak "this denuncia exists somewhere else".
  if (profile.role === "govt") {
    const inScope = jurisdictions.some(
      (j) =>
        j.province === report.jurisdictionProvince && j.locality === report.jurisdictionLocality,
    );
    if (!inScope) notFound();
  }

  const locationPoint = readPoint(report);

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

  // Resolve actors for transparency in the timeline at the bottom.
  const actorIds = [report.triagedByUserId, report.reporterUserId, report.assignedToUserId].filter(
    (x): x is string => x !== null,
  );
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const rows = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, actorIds[0]));
    for (const r of rows) actorNames.set(r.id, r.displayName);
    for (const actorId of actorIds.slice(1)) {
      const more = await db
        .select({ id: profiles.id, displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.id, actorId));
      for (const r of more) actorNames.set(r.id, r.displayName);
    }
  }

  // Resolve pet publicToken when the denuncia is about a registered pet,
  // so we can pre-fill the decomiso form with the pet's token.
  let subjectPetToken: string | null = null;
  if (report.subjectPetId) {
    const [subjectPet] = await db
      .select({ publicToken: pets.publicToken })
      .from(pets)
      .where(eq(pets.id, report.subjectPetId))
      .limit(1);
    subjectPetToken = subjectPet?.publicToken ?? null;
  }

  const isTerminal =
    report.status === "closed" || report.status === "invalid" || report.status === "duplicate";

  // Case age in days.
  const ageInDays = Math.floor(
    (Date.now() - new Date(report.createdAt).getTime()) / (24 * 60 * 60 * 1000),
  );

  // Timeline events.
  const timelineEvents = await fetchWelfareTimeline(report.id);

  // Assignment state.
  const isAssignedToMe = report.assignedToUserId === user.id;
  const assignedToName = report.assignedToUserId
    ? (actorNames.get(report.assignedToUserId) ?? "un agente")
    : null;

  return (
    <main className="px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <Link href="/gob/maltrato" className="text-sm text-gob-text-muted hover:text-gob-text ">
          ← Volver al listado
        </Link>

        <header className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-gob-text ">
              {welfareReportKindLabel(report.kind)}
            </h1>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                STATUS_TONE[report.status] ?? ""
              }`}
            >
              {welfareReportStatusLabel(report.status)}
            </span>
            <span className="text-xs uppercase tracking-wider text-gob-text-muted">
              {welfareReportSeverityLabel(report.severity)}
            </span>
          </div>
          <p className="text-[10px] font-mono text-gob-text-muted ">
            {report.referenceCode} · creada {formatDateTime(report.createdAt)}
          </p>
        </header>

        {/* Summary chips row — case metadata at a glance */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-gob-border  px-3 py-2 space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-gob-text-muted">
              Edad del caso
            </p>
            <p className="text-sm font-semibold text-gob-text ">
              {ageInDays === 0 ? "Hoy" : ageInDays === 1 ? "1 día" : `${ageInDays} días`}
            </p>
          </div>
          <div className="rounded-lg border border-gob-border  px-3 py-2 space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-gob-text-muted">Gravedad</p>
            <p className="text-sm font-semibold text-gob-text ">
              {welfareReportSeverityLabel(report.severity)}
            </p>
          </div>
          <div className="rounded-lg border border-gob-border  px-3 py-2 space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-gob-text-muted">Estado</p>
            <p className="text-sm font-semibold text-gob-text ">
              {welfareReportStatusLabel(report.status)}
            </p>
          </div>
          <div className="rounded-lg border border-gob-border  px-3 py-2 space-y-0.5">
            <p className="text-[10px] uppercase tracking-wider text-gob-text-muted">Asignado a</p>
            <p className="text-sm font-semibold text-gob-text  truncate">
              {assignedToName ?? "Sin asignar"}
            </p>
          </div>
        </div>

        {/* Assignment actions */}
        {!isTerminal && (
          <AssignmentActions
            reportId={report.id}
            assignedToUserId={report.assignedToUserId}
            currentUserId={user.id}
            isAdmin={profile.role === "admin"}
          />
        )}

        <section className="rounded-lg border border-gob-border  p-4 space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">¿Qué pasó?</h2>
          <p className="text-sm text-gob-text  whitespace-pre-wrap">{report.description}</p>
          {report.occurredAt && (
            <p className="text-xs text-gob-text-muted">
              Ocurrió el {formatDate(report.occurredAt)}
            </p>
          )}
        </section>

        <section className="rounded-lg border border-gob-border  p-4 space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">Sujeto</h2>
          <p className="text-sm">{welfareReportSubjectKindLabel(report.subjectKind)}</p>
          {report.subjectDescription && (
            <p className="text-sm text-gob-text-gray  whitespace-pre-wrap">
              {report.subjectDescription}
            </p>
          )}
        </section>

        <section className="rounded-lg border border-gob-border  p-4 space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">Lugar</h2>
          <div className="text-sm text-gob-text-gray  space-y-1">
            {report.locationAddress && <p>{report.locationAddress}</p>}
            {(report.jurisdictionLocality || report.jurisdictionProvince) && (
              <p>
                {[report.jurisdictionLocality, report.jurisdictionProvince]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
          </div>
          {locationPoint && (
            <>
              <LocationMap lat={locationPoint.lat} lng={locationPoint.lng} />
              <p className="text-xs text-gob-text-muted font-mono">
                {locationPoint.lat.toFixed(6)}, {locationPoint.lng.toFixed(6)}
              </p>
            </>
          )}
        </section>

        {attachments.length > 0 && (
          <section className="rounded-lg border border-gob-border  p-4 space-y-2">
            <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">
              Evidencia ({attachments.length})
            </h2>
            <ul className="space-y-1.5 text-sm">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs truncate">
                    {a.originalFilename ?? a.storagePath.split("/").pop()}
                  </span>
                  {a.signedUrl ? (
                    <a
                      href={a.signedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline hover:text-gob-text "
                    >
                      Abrir →
                    </a>
                  ) : (
                    <span className="text-xs text-gob-text-muted">(no disponible)</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-lg border border-gob-border  p-4 space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">Reportante</h2>
          {report.reporterUserId ? (
            <p className="text-sm text-gob-text-gray ">
              {actorNames.get(report.reporterUserId) ?? "Usuario registrado"}
              {report.reporterContactEmail && (
                <span className="text-gob-text-muted"> · {report.reporterContactEmail}</span>
              )}
              {report.reporterContactPhone && (
                <span className="text-gob-text-muted"> · {report.reporterContactPhone}</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-gob-text-muted">
              Denuncia anónima.
              {(report.reporterContactEmail || report.reporterContactPhone) && (
                <span>
                  {" "}
                  Contacto opcional dejado:{" "}
                  {[report.reporterContactEmail, report.reporterContactPhone]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </p>
          )}
        </section>

        {(report.triagedAt || report.closedAt) && (
          <section className="rounded-lg border border-gob-border  p-4 space-y-2 text-sm">
            <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">Trayectoria</h2>
            {report.triagedAt && (
              <p>
                Revisada el {formatDateTime(report.triagedAt)}
                {report.triagedByUserId && (
                  <span className="text-gob-text-muted">
                    {" "}
                    por {actorNames.get(report.triagedByUserId) ?? "una autoridad"}
                  </span>
                )}
              </p>
            )}
            {report.closedAt && <p>Cerrada el {formatDateTime(report.closedAt)}</p>}
            {report.resolutionNotes && (
              <div className="rounded bg-gob-surface-alt  p-3 text-xs text-gob-text-gray  whitespace-pre-wrap">
                {report.resolutionNotes}
              </div>
            )}
          </section>
        )}

        {!isTerminal && (
          <section className="space-y-3 pt-2 border-t border-gob-border ">
            <h2 className="text-lg font-semibold text-gob-text ">Acciones</h2>
            <TriageActions welfareReportId={report.id} currentStatus={report.status} />
          </section>
        )}

        {/* Decomiso entry point — available for all non-terminal denuncias */}
        {!isTerminal && (
          <section className="rounded-lg border border-gob-border  p-4 space-y-2">
            <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">
              Derivar a decomiso
            </h2>
            <p className="text-xs text-gob-text-muted">
              Si la denuncia amerita una incautación bajo Ley 14.346, iniciá el decomiso desde acá.
              El ID de esta denuncia se pre-completará en el formulario.
            </p>
            <Link
              href={`/gob/decomisos/nuevo?welfareReportId=${report.id}${subjectPetToken ? `&pet=${subjectPetToken}` : ""}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gob-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Iniciar decomiso →
            </Link>
            {report.subjectKind !== "registered_pet" && (
              <p className="text-xs text-gob-warning-text">
                La denuncia no tiene una mascota registrada vinculada. El formulario de decomiso
                admite solo mascotas con token DIM-XXXX-XXXX — tendrás que ingresar el token
                manualmente si la mascota está registrada.
              </p>
            )}
          </section>
        )}

        {/* MPF export — available regardless of triage status */}
        <section className="rounded-lg border border-gob-border  p-4 space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">Export fiscal</h2>
          <MpfExportButton welfareReportId={report.id} />
        </section>

        {/* Timeline — chronological event log */}
        <section className="rounded-lg border border-gob-border  p-4 space-y-4">
          <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">Línea de tiempo</h2>
          <Timeline events={timelineEvents} />
        </section>

        {/* Normativa aplicable — sourced from case-normatives catalog */}
        <section className="rounded-lg border border-gob-border  p-4 space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-gob-text-muted">
            Normativa aplicable
          </h2>
          {(() => {
            const normativas = getNormativesForCase("welfare_denuncia", {
              country: "AR",
              province: report.jurisdictionProvince ?? undefined,
            });
            if (normativas.length === 0) return null;
            return (
              <ul className="space-y-2 text-sm text-gob-text-gray ">
                {normativas.map((law) => (
                  <li key={law.id}>
                    <span className="font-medium">{law.label}</span>
                    {` — ${law.scope}`}
                  </li>
                ))}
              </ul>
            );
          })()}
        </section>
      </div>
    </main>
  );
}
