import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  caseEvents,
  db,
  organizations,
  pets,
  profiles,
  welfareReportAttachments,
  welfareReports,
} from "@/db";

// Govt detail projection — all PII fields included (govt role is permitted).
// Performance projection only: drops flaggedAt, flagReasons, moderationResolvedAt,
// moderationResolvedByUserId, reporterOrganizationId, derivedByUserId — not rendered here.
const GOB_WELFARE_DETAIL_SELECT = {
  id: welfareReports.id,
  referenceCode: welfareReports.referenceCode,
  kind: welfareReports.kind,
  severity: welfareReports.severity,
  status: welfareReports.status,
  description: welfareReports.description,
  subjectKind: welfareReports.subjectKind,
  subjectPetId: welfareReports.subjectPetId,
  subjectDescription: welfareReports.subjectDescription,
  locationAddress: welfareReports.locationAddress,
  jurisdictionProvince: welfareReports.jurisdictionProvince,
  jurisdictionLocality: welfareReports.jurisdictionLocality,
  locationLat: welfareReports.locationLat,
  locationLng: welfareReports.locationLng,
  occurredAt: welfareReports.occurredAt,
  createdAt: welfareReports.createdAt,
  triagedAt: welfareReports.triagedAt,
  triagedByUserId: welfareReports.triagedByUserId,
  closedAt: welfareReports.closedAt,
  resolutionNotes: welfareReports.resolutionNotes,
  caseId: welfareReports.caseId,
  assignedToUserId: welfareReports.assignedToUserId,
  derivedToOrganizationId: welfareReports.derivedToOrganizationId,
  derivedAt: welfareReports.derivedAt,
  orgInterventionStatus: welfareReports.orgInterventionStatus,
  orgInterventionAt: welfareReports.orgInterventionAt,
  // PII — allowed: govt/admin role, not org-facing
  reporterUserId: welfareReports.reporterUserId,
  reporterContactEmail: welfareReports.reporterContactEmail,
  reporterContactPhone: welfareReports.reporterContactPhone,
} as const;
import { fetchWelfareTimeline } from "@/lib/analytics/govt-dashboards";
import { getNormativesForCase } from "@/lib/domain/case-normatives";
import { readPoint } from "@/lib/domain/location";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { welfareAttachmentSignedUrl } from "@/lib/infra/storage";
import { logWelfareLocationViewed } from "@/lib/infra/welfare-location-audit";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import {
  welfareReportKindLabel,
  welfareReportSeverityLabel,
  welfareReportStatusLabel,
  welfareReportSubjectKindLabel,
} from "@/src/modules/welfare/domain/types";
import { and, desc, eq, inArray } from "drizzle-orm";

import { OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";

import { AssignmentActions } from "./AssignmentActions";
import { DerivationPanel } from "./DerivationPanel";
import { MpfExportButton } from "./MpfExportButton";
import { Timeline } from "./Timeline";
import { TriageActions } from "./TriageActions";

const LocationMap = dynamic(() => import("@/components/LocationMap"), {
  loading: () => (
    <div className="w-full h-64 rounded-[6px] border border-ln-op-line bg-ln-op-stripe animate-pulse" />
  ),
});

type StatusTone = "open" | "triaged" | "progress" | "closed" | "neutral";

const STATUS_TONE: Record<string, StatusTone> = {
  open: "open",
  triaged: "triaged",
  in_progress: "progress",
  closed: "closed",
  invalid: "neutral",
  duplicate: "neutral",
};

export default async function GobMaltratoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile, jurisdictions, user } = await requireAdminOrGovtOrRedirect();

  const [report] = await db
    .select(GOB_WELFARE_DETAIL_SELECT)
    .from(welfareReports)
    .where(eq(welfareReports.id, id))
    .limit(1);
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

  // Audience-precision plan (2026-06-19): the authority sees the EXACT
  // coordinate (Ley 14.346 investigative need); log every such view for
  // accountability (Ley 25.326). Only logs when there's a point to view.
  // Awaited so the trail commits before the response returns (a fire-and-forget
  // insert could be dropped on serverless freeze). A route prefetch may log a
  // view without a human read — an accepted v1 tradeoff for a tamper-evident
  // access trail.
  if (locationPoint) {
    await logWelfareLocationViewed(user.id, report.id, report.referenceCode);
  }

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
      .where(inArray(profiles.id, actorIds));
    for (const r of rows) actorNames.set(r.id, r.displayName);
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

  // Fetch verified shelters / rescue_networks for the derivation panel.
  // Prefer same jurisdiction; fall back to all verified orgs if none found.
  const ORG_DERIVATION_TYPES = ["shelter", "rescue_network"] as const;
  let derivableOrgs = await db
    .select({
      id: organizations.id,
      displayName: organizations.displayName,
      publicToken: organizations.publicToken,
      orgType: organizations.orgType,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.verified, true),
        inArray(organizations.orgType, [...ORG_DERIVATION_TYPES]),
        ...(report.jurisdictionProvince
          ? [eq(organizations.jurisdictionProvince, report.jurisdictionProvince)]
          : []),
      ),
    )
    .limit(50);

  // If no in-jurisdiction orgs found, broaden to all verified orgs of those types.
  if (derivableOrgs.length === 0) {
    derivableOrgs = await db
      .select({
        id: organizations.id,
        displayName: organizations.displayName,
        publicToken: organizations.publicToken,
        orgType: organizations.orgType,
      })
      .from(organizations)
      .where(
        and(
          eq(organizations.verified, true),
          inArray(organizations.orgType, [...ORG_DERIVATION_TYPES]),
        ),
      )
      .limit(50);
  }

  // Resolve current derivation target (if any).
  let derivedOrgInfo: { orgId: string; orgDisplayName: string; derivedAt: Date } | null = null;
  if (report.derivedToOrganizationId) {
    const [derivedOrg] = await db
      .select({ id: organizations.id, displayName: organizations.displayName })
      .from(organizations)
      .where(eq(organizations.id, report.derivedToOrganizationId))
      .limit(1);
    if (derivedOrg && report.derivedAt) {
      derivedOrgInfo = {
        orgId: derivedOrg.id,
        orgDisplayName: derivedOrg.displayName,
        derivedAt: report.derivedAt,
      };
    }
  }

  // Org intervention state (UI-7). On "devuelto" the org cleared
  // derivedToOrganizationId, so derivedOrgInfo is null but orgInterventionStatus
  // stays 'devuelto' — surface the return reason from the latest return note.
  let orgReturnReason: string | null = null;
  if (report.orgInterventionStatus === "devuelto" && report.caseId) {
    const [returnNote] = await db
      .select({ notes: caseEvents.notes })
      .from(caseEvents)
      .where(
        and(
          eq(caseEvents.caseId, report.caseId),
          eq(caseEvents.entryType, "org_intervention_return"),
        ),
      )
      .orderBy(desc(caseEvents.occurredAt))
      .limit(1);
    orgReturnReason = returnNote?.notes ?? null;
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

  const statusTone = STATUS_TONE[report.status] ?? "neutral";

  return (
    <main className="px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <Link href="/gob/maltrato" className="text-sm text-ln-op-mute hover:text-ln-op-ink-2">
          ← Volver al listado
        </Link>

        <header className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-[22px] font-semibold text-ln-op-ink">
              {welfareReportKindLabel(report.kind)}
            </h1>
            <OpPill tone={statusTone}>{welfareReportStatusLabel(report.status)}</OpPill>
            <span className="text-xs uppercase tracking-wider text-ln-op-mute">
              {welfareReportSeverityLabel(report.severity)}
            </span>
          </div>
          <p className="text-xs font-mono text-ln-op-mute">
            {report.referenceCode} · creada {formatDateTime(report.createdAt)}
          </p>
        </header>

        {/* Summary chips row — case metadata at a glance */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 space-y-0.5">
            <p className="text-xs uppercase tracking-wider text-ln-op-mute">Edad del caso</p>
            <p className="text-[13px] font-semibold text-ln-op-ink">
              {ageInDays === 0 ? "Hoy" : ageInDays === 1 ? "1 día" : `${ageInDays} días`}
            </p>
          </div>
          <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 space-y-0.5">
            <p className="text-xs uppercase tracking-wider text-ln-op-mute">Gravedad</p>
            <p className="text-[13px] font-semibold text-ln-op-ink">
              {welfareReportSeverityLabel(report.severity)}
            </p>
          </div>
          <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 space-y-0.5">
            <p className="text-xs uppercase tracking-wider text-ln-op-mute">Estado</p>
            <p className="text-[13px] font-semibold text-ln-op-ink">
              {welfareReportStatusLabel(report.status)}
            </p>
          </div>
          <div className="rounded-[6px] border border-ln-op-line bg-ln-op-card px-3 py-2 space-y-0.5">
            <p className="text-xs uppercase tracking-wider text-ln-op-mute">Asignado a</p>
            <p className="text-[13px] font-semibold text-ln-op-ink truncate">
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

        <OpCard>
          <OpCardHead title="¿Qué pasó?" />
          <OpCardBody className="space-y-2">
            <p className="text-[13px] text-ln-op-ink whitespace-pre-wrap">{report.description}</p>
            {report.occurredAt && (
              <p className="text-[11px] text-ln-op-mute">
                Ocurrió el {formatDate(report.occurredAt)}
              </p>
            )}
          </OpCardBody>
        </OpCard>

        <OpCard>
          <OpCardHead title="Sujeto" />
          <OpCardBody className="space-y-1">
            <p className="text-[13px] text-ln-op-ink">
              {welfareReportSubjectKindLabel(report.subjectKind)}
            </p>
            {report.subjectDescription && (
              <p className="text-sm text-ln-op-ink-2 whitespace-pre-wrap">
                {report.subjectDescription}
              </p>
            )}
          </OpCardBody>
        </OpCard>

        <OpCard>
          <OpCardHead title="Lugar" />
          <OpCardBody className="space-y-3">
            <div className="text-sm text-ln-op-ink-2 space-y-1">
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
                <p className="text-xs uppercase tracking-wider text-ln-op-mute">
                  Ubicación exacta — uso oficial (Ley 14.346)
                </p>
                <LocationMap lat={locationPoint.lat} lng={locationPoint.lng} />
                <p className="text-xs text-ln-op-mute font-mono">
                  {locationPoint.lat.toFixed(6)}, {locationPoint.lng.toFixed(6)}
                </p>
              </>
            )}
          </OpCardBody>
        </OpCard>

        {attachments.length > 0 && (
          <OpCard>
            <OpCardHead title={`Evidencia (${attachments.length})`} />
            <OpCardBody>
              <ul className="space-y-1.5 text-[13px]">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[11px] truncate text-ln-op-ink-2">
                      {a.originalFilename ?? a.storagePath.split("/").pop()}
                    </span>
                    {a.signedUrl ? (
                      <a
                        href={a.signedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-ln-op-azul underline hover:text-ln-op-azul-700"
                      >
                        Abrir →
                      </a>
                    ) : (
                      <span className="text-[11px] text-ln-op-mute">(no disponible)</span>
                    )}
                  </li>
                ))}
              </ul>
            </OpCardBody>
          </OpCard>
        )}

        <OpCard>
          <OpCardHead title="Reportante" />
          <OpCardBody>
            {report.reporterUserId ? (
              <p className="text-sm text-ln-op-ink-2">
                {actorNames.get(report.reporterUserId) ?? "Usuario registrado"}
                {report.reporterContactEmail && (
                  <span className="text-ln-op-mute"> · {report.reporterContactEmail}</span>
                )}
                {report.reporterContactPhone && (
                  <span className="text-ln-op-mute"> · {report.reporterContactPhone}</span>
                )}
              </p>
            ) : (
              <p className="text-sm text-ln-op-mute">
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
          </OpCardBody>
        </OpCard>

        {(report.triagedAt || report.closedAt) && (
          <OpCard>
            <OpCardHead title="Trayectoria" />
            <OpCardBody className="space-y-2 text-[13px]">
              {report.triagedAt && (
                <p className="text-ln-op-ink">
                  Revisada el {formatDateTime(report.triagedAt)}
                  {report.triagedByUserId && (
                    <span className="text-ln-op-mute">
                      {" "}
                      por {actorNames.get(report.triagedByUserId) ?? "una autoridad"}
                    </span>
                  )}
                </p>
              )}
              {report.closedAt && (
                <p className="text-ln-op-ink">Cerrada el {formatDateTime(report.closedAt)}</p>
              )}
              {report.resolutionNotes && (
                <div className="rounded-[4px] bg-ln-op-stripe p-3 text-[11px] text-ln-op-ink-2 whitespace-pre-wrap">
                  {report.resolutionNotes}
                </div>
              )}
            </OpCardBody>
          </OpCard>
        )}

        {!isTerminal && (
          <section className="space-y-3 pt-2 border-t border-ln-op-line">
            <h2 className="text-md font-semibold text-ln-op-ink">Acciones</h2>
            <TriageActions welfareReportId={report.id} currentStatus={report.status} />
          </section>
        )}

        {/* Derivation to org — forward report to a verified shelter / rescue network */}
        {!isTerminal && (
          <OpCard>
            <OpCardHead title="Derivar a organización" />
            <OpCardBody className="space-y-2">
              <p className="text-[11px] text-ln-op-mute">
                Derivá esta denuncia a un refugio o red de rescate verificada para seguimiento en
                campo. La organización recibirá una notificación.
              </p>
              {/* Org intervention state (UI-7) */}
              {report.orgInterventionStatus === "tomado" && (
                <div className="rounded-[4px] border border-ln-op-line bg-ln-op-stripe px-3 py-2">
                  <p className="text-sm text-ln-op-ink">
                    <span className="font-medium">En intervención</span> — la organización tomó la
                    denuncia
                    {report.orgInterventionAt && (
                      <span className="text-ln-op-mute">
                        {" "}
                        el {formatDateTime(report.orgInterventionAt)}
                      </span>
                    )}
                    .
                  </p>
                </div>
              )}
              {report.orgInterventionStatus === "devuelto" && (
                <div className="rounded-[4px] border border-ln-op-warn-bd bg-ln-op-warn-bg px-3 py-2">
                  <p className="text-sm text-ln-op-warn">
                    <span className="font-medium">Devuelta por la organización</span>
                    {orgReturnReason ? `: ${orgReturnReason}` : "."} Volvé a derivarla a otra
                    organización o gestionala directamente.
                  </p>
                </div>
              )}
              <DerivationPanel
                welfareReportId={report.id}
                availableOrgs={derivableOrgs}
                alreadyDerivedTo={derivedOrgInfo}
              />
            </OpCardBody>
          </OpCard>
        )}

        {/* Decomiso entry point — available for all non-terminal denuncias */}
        {!isTerminal && (
          <OpCard>
            <OpCardHead title="Derivar a decomiso" />
            <OpCardBody className="space-y-2">
              <p className="text-[11px] text-ln-op-mute">
                Si la denuncia amerita una incautación bajo Ley 14.346, iniciá el decomiso desde
                acá. El ID de esta denuncia se pre-completará en el formulario.
              </p>
              <Link
                href={`/gob/decomisos/nuevo?welfareReportId=${report.id}${subjectPetToken ? `&pet=${subjectPetToken}` : ""}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-[6px] bg-ln-op-azul text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
              >
                Iniciar decomiso →
              </Link>
              {report.subjectKind !== "registered_pet" && (
                <p className="text-[11px] text-ln-op-warn">
                  La denuncia no tiene una mascota registrada vinculada. El formulario de decomiso
                  admite solo mascotas con token DIM-XXXX-XXXX — tendrás que ingresar el token
                  manualmente si la mascota está registrada.
                </p>
              )}
            </OpCardBody>
          </OpCard>
        )}

        {/* MPF export — available regardless of triage status */}
        <OpCard>
          <OpCardHead title="Export fiscal" />
          <OpCardBody>
            <MpfExportButton welfareReportId={report.id} />
          </OpCardBody>
        </OpCard>

        {/* Timeline — chronological event log */}
        <OpCard>
          <OpCardHead title="Línea de tiempo" />
          <OpCardBody>
            <Timeline events={timelineEvents} />
          </OpCardBody>
        </OpCard>

        {/* Normativa aplicable — sourced from case-normatives catalog */}
        <OpCard>
          <OpCardHead title="Normativa aplicable" />
          <OpCardBody>
            {(() => {
              const normativas = getNormativesForCase("welfare_denuncia", {
                country: "AR",
                province: report.jurisdictionProvince ?? undefined,
              });
              if (normativas.length === 0)
                return (
                  <p className="text-sm text-ln-op-mute">
                    Sin normativa catalogada para esta jurisdicción.
                  </p>
                );
              return (
                <ul className="space-y-2 text-sm text-ln-op-ink-2">
                  {normativas.map((law) => (
                    <li key={law.id}>
                      <span className="font-medium text-ln-op-ink">{law.label}</span>
                      {` — ${law.scope}`}
                    </li>
                  ))}
                </ul>
              );
            })()}
          </OpCardBody>
        </OpCard>
      </div>
    </main>
  );
}
