// /admin/servicios/[offeringToken] — admin detail + approve/reject for any service offering (Fase 9).
//
// Same shape as /gob/servicios/[token] but admin has universal scope — no
// jurisdiction gate.

import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  OpCard,
  OpCardBody,
  OpCardHead,
  OpCodeBadge,
  OpCrumbs,
  OpPill,
} from "@/components/ui/dashboard";
import { db, organizations, profiles, serviceOfferings } from "@/db";
import { requireAdminOrRedirect } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";

import { OfferingReviewActions } from "@/app/gob/servicios/[offeringToken]/OfferingReviewActions";

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pendiente de revision",
  approved: "Aprobado",
  rejected: "Rechazado",
};

type StatusTone = "open" | "ok" | "danger";
const STATUS_TONES: Record<string, StatusTone> = {
  pending_approval: "open",
  approved: "ok",
  rejected: "danger",
};

export default async function AdminServicioDetailPage({
  params,
}: {
  params: Promise<{ offeringToken: string }>;
}) {
  const { offeringToken } = await params;
  await requireAdminOrRedirect();

  const [row] = await db
    .select({
      offering: serviceOfferings,
      org: {
        displayName: organizations.displayName,
        publicToken: organizations.publicToken,
        legalName: organizations.legalName,
      },
      provider: {
        displayName: profiles.displayName,
        matriculaNumber: profiles.matriculaNumber,
      },
    })
    .from(serviceOfferings)
    .leftJoin(organizations, eq(organizations.id, serviceOfferings.organizationId))
    .leftJoin(profiles, eq(profiles.id, serviceOfferings.providerUserId))
    .where(eq(serviceOfferings.publicToken, offeringToken))
    .limit(1);

  if (!row) notFound();

  const { offering, org, provider } = row;

  const kindLabel = findServiceKind(offering.serviceKind)?.label ?? offering.serviceKind;
  const location = [offering.jurisdictionLocality, offering.jurisdictionProvince]
    .filter(Boolean)
    .join(", ");

  const providerLabel =
    offering.organizationId && org
      ? org.displayName
      : provider
        ? `Dr/a. ${provider.displayName}${provider.matriculaNumber ? ` · Mat. ${provider.matriculaNumber}` : ""}`
        : "Profesional independiente";

  return (
    <div className="max-w-3xl space-y-6">
      <OpCrumbs
        items={[{ label: "Servicios", href: "/admin/servicios" }, { label: offering.displayName }]}
      />

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <OpPill tone={STATUS_TONES[offering.status] ?? "neutral"}>
            {STATUS_LABELS[offering.status] ?? offering.status}
          </OpPill>
        </div>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">{offering.displayName}</h1>
        <p className="text-[12px] text-ln-op-mute">
          <OpCodeBadge tone="neutral">{offering.publicToken}</OpCodeBadge>
          {location ? ` · ${location}` : ""}
          {" · enviado "}
          {new Date(offering.submittedAt).toLocaleString("es-AR", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </p>
      </header>

      <DetailSection title="Proveedor">
        <p className="text-[13px] text-ln-op-ink">{providerLabel}</p>
        {offering.organizationId && org?.legalName && (
          <p className="text-[12px] text-ln-op-mute">{org.legalName}</p>
        )}
      </DetailSection>

      <DetailSection title="Servicio">
        <p className="text-[13px] text-ln-op-ink">{kindLabel}</p>
        {offering.description && (
          <p className="text-[12px] text-ln-op-ink-2 mt-1">{offering.description}</p>
        )}
      </DetailSection>

      <DetailSection title="Detalles">
        <dl className="space-y-1">
          <div className="flex gap-3">
            <dt className="text-[12px] text-ln-op-mute w-32 shrink-0">Duracion</dt>
            <dd className="text-[13px] text-ln-op-ink">{offering.durationMinutes} min</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-[12px] text-ln-op-mute w-32 shrink-0">Capacidad</dt>
            <dd className="text-[13px] text-ln-op-ink">
              {offering.slotCapacity} turno{offering.slotCapacity === 1 ? "" : "s"} por slot
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-[12px] text-ln-op-mute w-32 shrink-0">Precio</dt>
            <dd className="text-[13px] text-ln-op-ink">
              {offering.priceArs !== null
                ? `$${Number(offering.priceArs).toLocaleString("es-AR")}`
                : "Gratuito"}
            </dd>
          </div>
          {offering.eligibilitySpecies && offering.eligibilitySpecies.length > 0 && (
            <div className="flex gap-3">
              <dt className="text-[12px] text-ln-op-mute w-32 shrink-0">Especies</dt>
              <dd className="text-[13px] text-ln-op-ink">
                {offering.eligibilitySpecies.join(", ")}
              </dd>
            </div>
          )}
          {(offering.eligibilityAgeMinMonths !== null ||
            offering.eligibilityAgeMaxMonths !== null) && (
            <div className="flex gap-3">
              <dt className="text-[12px] text-ln-op-mute w-32 shrink-0">Edad elegible</dt>
              <dd className="text-[13px] text-ln-op-ink">
                {offering.eligibilityAgeMinMonths !== null
                  ? `desde ${offering.eligibilityAgeMinMonths} meses`
                  : ""}
                {offering.eligibilityAgeMinMonths !== null &&
                offering.eligibilityAgeMaxMonths !== null
                  ? " — "
                  : ""}
                {offering.eligibilityAgeMaxMonths !== null
                  ? `hasta ${offering.eligibilityAgeMaxMonths} meses`
                  : ""}
              </dd>
            </div>
          )}
        </dl>
      </DetailSection>

      {offering.status === "pending_approval" ? (
        <DetailSection title="Decision">
          <OfferingReviewActions publicToken={offering.publicToken} />
        </DetailSection>
      ) : (
        <DetailSection title="Decision">
          <p className="text-[13px] text-ln-op-ink">
            {STATUS_LABELS[offering.status] ?? offering.status}
            {offering.reviewedAt &&
              ` el ${new Date(offering.reviewedAt).toLocaleString("es-AR", {
                dateStyle: "short",
                timeStyle: "short",
              })}`}
          </p>
          {offering.rejectionReason && (
            <p className="text-[12px] text-ln-op-ink-2 mt-1">Motivo: {offering.rejectionReason}</p>
          )}
        </DetailSection>
      )}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <OpCard>
      <OpCardHead title={title} />
      <OpCardBody>{children}</OpCardBody>
    </OpCard>
  );
}
