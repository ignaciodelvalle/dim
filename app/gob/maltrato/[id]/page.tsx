import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db, profiles, welfareReportAttachments, welfareReports } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
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
import { eq } from "drizzle-orm";

import { TriageActions } from "./TriageActions";

const LocationMap = dynamic(() => import("@/components/LocationMap"), {
  loading: () => (
    <div className="w-full h-64 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 animate-pulse" />
  ),
});

const STATUS_TONE: Record<string, string> = {
  open: "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200",
  triaged: "bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200",
  in_progress: "bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200",
  closed: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200",
  invalid: "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400",
  duplicate: "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400",
};

export default async function GobMaltratoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

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
  const actorIds = [report.triagedByUserId, report.reporterUserId].filter(
    (x): x is string => x !== null,
  );
  const actorNames = new Map<string, string>();
  if (actorIds.length > 0) {
    const rows = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.id, actorIds[0]));
    for (const r of rows) actorNames.set(r.id, r.displayName);
    if (actorIds.length > 1) {
      const more = await db
        .select({ id: profiles.id, displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.id, actorIds[1]));
      for (const r of more) actorNames.set(r.id, r.displayName);
    }
  }

  const isTerminal =
    report.status === "closed" || report.status === "invalid" || report.status === "duplicate";

  return (
    <main className="px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href="/gob/maltrato"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-50"
        >
          ← Volver a la cola
        </Link>

        <header className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
              {welfareReportKindLabel(report.kind)}
            </h1>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                STATUS_TONE[report.status] ?? ""
              }`}
            >
              {welfareReportStatusLabel(report.status)}
            </span>
            <span className="text-xs uppercase tracking-wider text-neutral-500">
              {welfareReportSeverityLabel(report.severity)}
            </span>
          </div>
          <p className="text-[10px] font-mono text-neutral-400 dark:text-neutral-600">
            {report.referenceCode} · creada {formatDateTime(report.createdAt)}
          </p>
        </header>

        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500">¿Qué pasó?</h2>
          <p className="text-sm text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap">
            {report.description}
          </p>
          {report.occurredAt && (
            <p className="text-xs text-neutral-500">Ocurrió el {formatDate(report.occurredAt)}</p>
          )}
        </section>

        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500">Sujeto</h2>
          <p className="text-sm">{welfareReportSubjectKindLabel(report.subjectKind)}</p>
          {report.subjectDescription && (
            <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
              {report.subjectDescription}
            </p>
          )}
        </section>

        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500">Lugar</h2>
          <div className="text-sm text-neutral-700 dark:text-neutral-300 space-y-1">
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
              <p className="text-xs text-neutral-500 font-mono">
                {locationPoint.lat.toFixed(6)}, {locationPoint.lng.toFixed(6)}
              </p>
            </>
          )}
        </section>

        {attachments.length > 0 && (
          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500">
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
                      className="text-xs underline hover:text-neutral-900 dark:hover:text-neutral-50"
                    >
                      Abrir →
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-500">(no disponible)</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500">Reportante</h2>
          {report.reporterUserId ? (
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              {actorNames.get(report.reporterUserId) ?? "Usuario registrado"}
              {report.reporterContactEmail && (
                <span className="text-neutral-500"> · {report.reporterContactEmail}</span>
              )}
              {report.reporterContactPhone && (
                <span className="text-neutral-500"> · {report.reporterContactPhone}</span>
              )}
            </p>
          ) : (
            <p className="text-sm text-neutral-500">
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
          <section className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 space-y-2 text-sm">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500">Trayectoria</h2>
            {report.triagedAt && (
              <p>
                Revisada el {formatDateTime(report.triagedAt)}
                {report.triagedByUserId && (
                  <span className="text-neutral-500">
                    {" "}
                    por {actorNames.get(report.triagedByUserId) ?? "una autoridad"}
                  </span>
                )}
              </p>
            )}
            {report.closedAt && <p>Cerrada el {formatDateTime(report.closedAt)}</p>}
            {report.resolutionNotes && (
              <div className="rounded bg-neutral-50 dark:bg-neutral-900 p-3 text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
                {report.resolutionNotes}
              </div>
            )}
          </section>
        )}

        {!isTerminal && (
          <section className="space-y-3 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              Acciones
            </h2>
            <TriageActions welfareReportId={report.id} currentStatus={report.status} />
          </section>
        )}
      </div>
    </main>
  );
}
