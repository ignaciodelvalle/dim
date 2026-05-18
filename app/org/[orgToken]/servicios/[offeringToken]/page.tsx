// Org portal — service offering detail. Shows status, submitted data, rejection
// reason when rejected, and a link to the schedule rules page when approved.
// Schedule rules CRUD (Fase 2) will live at ./agenda — linked here but not yet built.

import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db, organizations, serviceOfferings } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending_approval: {
    label: "Pendiente de aprobación",
    className:
      "text-amber-800 bg-amber-50 border-amber-300 dark:text-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
  },
  approved: {
    label: "Aprobado",
    className:
      "text-emerald-800 bg-emerald-50 border-emerald-300 dark:text-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
  },
  rejected: {
    label: "Rechazado",
    className:
      "text-red-800 bg-red-50 border-red-300 dark:text-red-200 dark:bg-red-950/30 dark:border-red-800",
  },
  paused: {
    label: "Pausado",
    className:
      "text-neutral-800 bg-neutral-50 border-neutral-300 dark:text-neutral-200 dark:bg-neutral-900 dark:border-neutral-700",
  },
  archived: {
    label: "Archivado",
    className:
      "text-neutral-600 bg-neutral-50 border-neutral-200 dark:text-neutral-400 dark:bg-neutral-950 dark:border-neutral-800",
  },
};

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR", { dateStyle: "medium" });
}

export default async function OfferingDetailPage({
  params,
}: {
  params: Promise<{ orgToken: string; offeringToken: string }>;
}) {
  const { orgToken, offeringToken } = await params;
  const { organization } = await requireOrgAccessByToken(orgToken);

  // Verify the offering belongs to this org.
  const [row] = await db
    .select({ offering: serviceOfferings, org: organizations })
    .from(serviceOfferings)
    .innerJoin(organizations, eq(organizations.id, serviceOfferings.organizationId!))
    .where(
      and(
        eq(serviceOfferings.publicToken, offeringToken),
        eq(serviceOfferings.organizationId, organization.id),
      ),
    )
    .limit(1);

  if (!row) notFound();

  const { offering } = row;
  const kind = findServiceKind(offering.serviceKind);
  const statusConfig = STATUS_LABELS[offering.status] ?? STATUS_LABELS.pending_approval;

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            {organization.displayName} · Servicios
          </p>
          <h1 className="text-3xl font-semibold">{offering.displayName}</h1>
          <p className="text-sm text-neutral-500">
            {kind?.label ?? offering.serviceKind} · Enviado el {formatDate(offering.submittedAt)}
          </p>
        </header>

        {/* Status banner */}
        <div className={`text-sm rounded border px-3 py-2 ${statusConfig.className}`}>
          <strong>{statusConfig.label}</strong>
          {offering.status === "pending_approval" && (
            <span>
              {" "}
              — La autoridad revisará tu solicitud y te notificaremos por email y en el panel.
            </span>
          )}
          {offering.status === "approved" && (
            <span>
              {" "}
              — Ya podés{" "}
              <Link
                href={`/org/${orgToken}/servicios/${offeringToken}/agenda`}
                className="underline font-medium"
              >
                configurar la agenda
              </Link>{" "}
              y empezar a recibir reservas.
            </span>
          )}
          {offering.status === "rejected" && offering.rejectionReason && (
            <span> — Motivo: {offering.rejectionReason}</span>
          )}
        </div>

        {/* Details grid */}
        <section className="rounded border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-200 dark:divide-neutral-800">
          <Row label="Token público" value={offering.publicToken} mono />
          <Row label="Tipo de servicio" value={kind?.label ?? offering.serviceKind} />
          <Row
            label="Precio"
            value={
              offering.priceArs !== null
                ? `$${Number(offering.priceArs).toLocaleString("es-AR")}`
                : "Campaña gratuita"
            }
          />
          <Row label="Duración" value={`${offering.durationMinutes} minutos`} />
          <Row label="Capacidad por turno" value={`${offering.slotCapacity} lugar${offering.slotCapacity === 1 ? "" : "es"}`} />
          {offering.description && <Row label="Descripción" value={offering.description} />}
          {offering.eligibilitySpecies && offering.eligibilitySpecies.length > 0 && (
            <Row
              label="Especies"
              value={offering.eligibilitySpecies
                .map((s) => (s === "dog" ? "Perros" : "Gatos"))
                .join(", ")}
            />
          )}
          {(offering.eligibilityAgeMinMonths !== null ||
            offering.eligibilityAgeMaxMonths !== null) && (
            <Row
              label="Rango de edad"
              value={[
                offering.eligibilityAgeMinMonths !== null
                  ? `desde ${offering.eligibilityAgeMinMonths} meses`
                  : null,
                offering.eligibilityAgeMaxMonths !== null
                  ? `hasta ${offering.eligibilityAgeMaxMonths} meses`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          )}
          {offering.reviewedAt && (
            <Row
              label="Revisado el"
              value={formatDate(offering.reviewedAt)}
            />
          )}
        </section>

        {/* CTA for approved offerings */}
        {offering.status === "approved" && (
          <div>
            <Link
              href={`/org/${orgToken}/servicios/${offeringToken}/agenda`}
              className="inline-block px-4 py-2 rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm"
            >
              Configurar agenda →
            </Link>
            <p className="mt-2 text-xs text-neutral-500">
              La agenda (Fase 2) estará disponible en la próxima versión.
            </p>
          </div>
        )}

        <footer className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Link
            href={`/org/${orgToken}/servicios`}
            className="text-sm text-neutral-600 underline dark:text-neutral-400"
          >
            ← Volver a mis servicios
          </Link>
        </footer>
      </div>
    </main>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 px-4 py-3 flex-wrap">
      <dt className="text-xs text-neutral-500 shrink-0 w-36">{label}</dt>
      <dd className={`text-sm flex-1 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
