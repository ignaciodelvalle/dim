// /gob/servicios/[offeringToken] — detail + approve/reject for a pending service offering (Fase 9).
//
// Gate: actor must be admin OR a govt whose assigned localities include the offering's
// jurisdiction. Out-of-scope requests 404 to avoid information leakage.

import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db, organizations, profiles, serviceOfferings } from "@/db";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";

import { OfferingReviewActions } from "./OfferingReviewActions";

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pendiente de revisión",
  approved: "Aprobado",
  rejected: "Rechazado",
};

export default async function GobServicioDetailPage({
  params,
}: {
  params: Promise<{ offeringToken: string }>;
}) {
  const { offeringToken } = await params;
  const { profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

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
    <main className="px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link
            href="/gob/servicios"
            className="text-sm text-gob-text-gray underline underline-offset-4 hover:text-gob-text"
          >
            ← Volver a servicios pendientes
          </Link>
        </div>

        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-gob-text-muted">
            {STATUS_LABELS[offering.status] ?? offering.status}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text">
            {offering.displayName}
          </h1>
          <p className="text-xs text-gob-text-muted">
            <span className="font-mono">{offering.publicToken}</span>
            {location ? ` · ${location}` : ""}
            {" · enviado "}
            {new Date(offering.submittedAt).toLocaleString("es-AR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </p>
        </header>

        <Section title="Proveedor">
          <p className="text-sm text-gob-text">{providerLabel}</p>
          {offering.organizationId && org?.legalName && (
            <p className="text-xs text-gob-text-muted">{org.legalName}</p>
          )}
        </Section>

        <Section title="Servicio">
          <p className="text-sm text-gob-text">{kindLabel}</p>
          {offering.description && (
            <p className="text-xs text-gob-text-gray mt-1">{offering.description}</p>
          )}
        </Section>

        <Section title="Detalles">
          <dl className="space-y-1 text-sm">
            <div className="flex gap-3">
              <dt className="text-gob-text-muted w-32 shrink-0">Duración</dt>
              <dd className="text-gob-text">{offering.durationMinutes} min</dd>
            </div>
            <div className="flex gap-3">
              <dt className="text-gob-text-muted w-32 shrink-0">Capacidad</dt>
              <dd className="text-gob-text">
                {offering.slotCapacity} turno{offering.slotCapacity === 1 ? "" : "s"} por slot
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="text-gob-text-muted w-32 shrink-0">Precio</dt>
              <dd className="text-gob-text">
                {offering.priceArs !== null
                  ? `$${Number(offering.priceArs).toLocaleString("es-AR")}`
                  : "Gratuito"}
              </dd>
            </div>
            {offering.eligibilitySpecies && offering.eligibilitySpecies.length > 0 && (
              <div className="flex gap-3">
                <dt className="text-gob-text-muted w-32 shrink-0">Especies</dt>
                <dd className="text-gob-text">{offering.eligibilitySpecies.join(", ")}</dd>
              </div>
            )}
            {(offering.eligibilityAgeMinMonths !== null ||
              offering.eligibilityAgeMaxMonths !== null) && (
              <div className="flex gap-3">
                <dt className="text-gob-text-muted w-32 shrink-0">Edad elegible</dt>
                <dd className="text-gob-text">
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
        </Section>

        {offering.status === "pending_approval" ? (
          <Section title="Decisión">
            <OfferingReviewActions publicToken={offering.publicToken} />
          </Section>
        ) : (
          <Section title="Decisión">
            <p className="text-sm text-gob-text">
              {STATUS_LABELS[offering.status] ?? offering.status}
              {offering.reviewedAt &&
                ` el ${new Date(offering.reviewedAt).toLocaleString("es-AR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}`}
            </p>
            {offering.rejectionReason && (
              <p className="text-xs text-gob-text-gray mt-1">Motivo: {offering.rejectionReason}</p>
            )}
          </Section>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs uppercase tracking-[0.18em] text-gob-text-muted">{title}</h2>
      <div className="rounded-lg border border-gob-border p-4 space-y-1">{children}</div>
    </section>
  );
}
