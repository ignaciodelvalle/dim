import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db, welfareReportAttachments, welfareReports } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { formatDate, formatDateTime } from "@/lib/format";
import { readPoint } from "@/lib/location";
import { welfareAttachmentSignedUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { type FlagReason, reasonLabel } from "@/lib/welfare-moderation";
import {
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportSubjectKindLabel,
} from "@/src/modules/welfare/domain/types";
import { eq } from "drizzle-orm";

import { ModerationActions } from "./ModerationActions";

const LocationMap = dynamic(() => import("@/components/LocationMap"), {
  loading: () => (
    <div className="w-full h-64 rounded-lg border border-gob-border  bg-gob-surface-alt  animate-pulse" />
  ),
});

export default async function ModeracionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdminOrRedirect();

  const [report] = await db.select().from(welfareReports).where(eq(welfareReports.id, id)).limit(1);
  if (!report) notFound();
  if (!report.flaggedAt) notFound();

  const locationPoint = readPoint(report);
  const reasons = (report.flagReasons as string[]) ?? [];

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

  const isResolved = report.moderationResolvedAt !== null;

  return (
    <main className="px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href="/admin/moderacion" className="text-sm text-gob-text-muted hover:text-gob-text ">
          ← Volver a moderación
        </Link>

        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-gob-text ">
            {welfareReportKindLabel(report.kind)} ·{" "}
            <span className="font-normal text-gob-text-muted">
              {welfareReportSeverityLabel(report.severity)}
            </span>
          </h1>
          <p className="text-[10px] font-mono text-gob-text-muted">
            {report.referenceCode} · creada {formatDateTime(report.createdAt)} · flagged{" "}
            {report.flaggedAt && formatDateTime(report.flaggedAt)}
          </p>
        </header>

        <section className="rounded-lg border border-gob-warning bg-gob-warning/10   p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gob-warning-text ">
            Razones del flag
          </p>
          <ul className="text-sm text-gob-warning-text  space-y-0.5 list-disc pl-5">
            {reasons.map((reason) => (
              <li key={reason}>{reasonLabel(reason as FlagReason)}</li>
            ))}
          </ul>
        </section>

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
          <p className="text-sm">
            {welfareReportSubjectKindLabel(report.subjectKind)}
            {report.subjectPetId && (
              <span className="text-gob-text-muted font-mono text-xs">
                {" "}
                · {report.subjectPetId}
              </span>
            )}
          </p>
          {report.subjectDescription && (
            <p className="text-sm text-gob-text-gray  whitespace-pre-wrap">
              {report.subjectDescription}
            </p>
          )}
        </section>

        {(locationPoint || report.jurisdictionProvince || report.locationAddress) && (
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
            {locationPoint && <LocationMap lat={locationPoint.lat} lng={locationPoint.lng} />}
          </section>
        )}

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
                      className="text-xs underline"
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

        {isResolved ? (
          <p className="text-sm text-gob-text-muted">
            Esta denuncia ya fue moderada el{" "}
            {report.moderationResolvedAt && formatDateTime(report.moderationResolvedAt)}.
          </p>
        ) : (
          <section className="space-y-3 pt-2 border-t border-gob-border ">
            <h2 className="text-lg font-semibold text-gob-text ">Resolución</h2>
            <ModerationActions welfareReportId={report.id} />
          </section>
        )}
      </div>
    </main>
  );
}
