// /gob/servicios/[offeringToken] — detail + approve/reject for a pending service offering (Fase 9).
//
// Gate: actor must be admin OR a govt whose assigned localities include the offering's
// jurisdiction. Out-of-scope requests 404 to avoid information leakage.

import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OpCard, OpCardBody, OpCardHead, OpCodeBadge, OpPill } from "@/components/ui/dashboard";
import { db, organizations, profiles, serviceOfferings } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/infra/auth-guards";
import { findServiceKind } from "@/lib/reference/service-kinds";
import { portalBase } from "@/lib/ui/portal-base";

import { OfferingReviewActions } from "./OfferingReviewActions";

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pendiente de revisión",
  approved: "Aprobado",
  rejected: "Rechazado",
};

type StatusTone = "open" | "ok" | "danger";
const STATUS_TONES: Record<string, StatusTone> = {
  pending_approval: "open",
  approved: "ok",
  rejected: "danger",
};

export default async function GobServicioDetailPage({
  params,
}: {
  params: Promise<{ offeringToken: string }>;
}) {
  const { offeringToken } = await params;
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();
  const base = await portalBase();

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

  // Scope check: govt can only act on offerings in their localities.
  if (profile.role === "govt") {
    const covers = jurisdictions.some(
      (j) =>
        j.province === offering.jurisdictionProvince &&
        j.locality === offering.jurisdictionLocality,
    );
    // j.province and j.locality are the correct field names on AdminOrGovtJurisdiction
    if (!covers) notFound();
  }

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
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href={`${base}/servicios`}
          className="text-[13px] text-ln-op-azul underline underline-offset-4 hover:text-ln-op-ink no-underline"
        >
          {"←"} Volver a servicios pendientes
        </Link>
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <OpPill tone={STATUS_TONES[offering.status] ?? "neutral"}>
            {STATUS_LABELS[offering.status] ?? offering.status}
          </OpPill>
        </div>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">{offering.displayName}</h1>
        <p className="text-sm text-ln-op-mute">
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
          <p className="text-sm text-ln-op-mute">{org.legalName}</p>
        )}
      </DetailSection>

      <DetailSection title="Servicio">
        <p className="text-[13px] text-ln-op-ink">{kindLabel}</p>
        {offering.description && (
          <p className="text-sm text-ln-op-ink-2 mt-1">{offering.description}</p>
        )}
      </DetailSection>

      <DetailSection title="Detalles">
        <dl className="space-y-1">
          <div className="flex gap-3">
            <dt className="text-sm text-ln-op-mute w-32 shrink-0">Duracion</dt>
            <dd className="text-[13px] text-ln-op-ink">{offering.durationMinutes} min</dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-sm text-ln-op-mute w-32 shrink-0">Capacidad</dt>
            <dd className="text-[13px] text-ln-op-ink">
              {offering.slotCapacity} turno{offering.slotCapacity === 1 ? "" : "s"} por slot
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="text-sm text-ln-op-mute w-32 shrink-0">Precio</dt>
            <dd className="text-[13px] text-ln-op-ink">
              {offering.priceArs !== null
                ? `$${Number(offering.priceArs).toLocaleString("es-AR")}`
                : "Gratuito"}
            </dd>
          </div>
          {offering.eligibilitySpecies && offering.eligibilitySpecies.length > 0 && (
            <div className="flex gap-3">
              <dt className="text-sm text-ln-op-mute w-32 shrink-0">Especies</dt>
              <dd className="text-[13px] text-ln-op-ink">
                {offering.eligibilitySpecies.join(", ")}
              </dd>
            </div>
          )}
          {(offering.eligibilityAgeMinMonths !== null ||
            offering.eligibilityAgeMaxMonths !== null) && (
            <div className="flex gap-3">
              <dt className="text-sm text-ln-op-mute w-32 shrink-0">Edad elegible</dt>
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
            <p className="text-sm text-ln-op-ink-2 mt-1">Motivo: {offering.rejectionReason}</p>
          )}
        </DetailSection>
      )}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs uppercase tracking-[0.18em] text-ln-op-mute">{title}</h2>
      <OpCard>
        <OpCardBody className="space-y-1">{children}</OpCardBody>
      </OpCard>
    </section>
  );
}
