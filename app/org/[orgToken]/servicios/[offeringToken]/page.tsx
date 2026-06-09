// Org portal — service offering detail. Shows status, submitted data, rejection
// reason when rejected, and a link to the schedule rules page when approved.
// Schedule rules CRUD (Fase 2) will live at ./agenda — linked here but not yet built.

import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  OpBreach,
  OpCallout,
  OpCard,
  OpCardBody,
  OpCardHead,
  OpPill,
} from "@/components/ui/dashboard";
import { db, organizations, serviceOfferings } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";

type StatusTone = "open" | "ok" | "danger" | "neutral";
const STATUS_CONFIG: Record<string, { label: string; tone: StatusTone }> = {
  pending_approval: { label: "Pendiente de aprobación", tone: "open" },
  approved: { label: "Aprobado", tone: "ok" },
  rejected: { label: "Rechazado", tone: "danger" },
  paused: { label: "Pausado", tone: "neutral" },
  archived: { label: "Archivado", tone: "neutral" },
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
    // biome-ignore lint/style/noNonNullAssertion: org-scoped offerings always have organizationId.
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
  const statusConfig = STATUS_CONFIG[offering.status] ?? STATUS_CONFIG.pending_approval;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <header className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          {organization.displayName} · Servicios
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">{offering.displayName}</h1>
        <p className="text-[13px] text-ln-op-mute">
          {kind?.label ?? offering.serviceKind} · Enviado el {formatDate(offering.submittedAt)}
        </p>
      </header>

      {/* Status banner */}
      <div className="flex items-center gap-3">
        <OpPill tone={statusConfig.tone}>{statusConfig.label}</OpPill>
        {offering.status === "pending_approval" && (
          <span className="text-[12px] text-ln-op-mute">
            La autoridad revisará tu solicitud y te notificaremos por email y en el panel.
          </span>
        )}
        {offering.status === "approved" && (
          <span className="text-[12px] text-ln-op-mute">
            Ya podés{" "}
            <Link
              href={`/org/${orgToken}/servicios/${offeringToken}/agenda`}
              className="text-ln-op-azul hover:underline font-medium"
            >
              configurar la agenda
            </Link>{" "}
            y empezar a recibir reservas.
          </span>
        )}
        {offering.status === "rejected" && offering.rejectionReason && (
          <span className="text-[12px] text-ln-op-danger">Motivo: {offering.rejectionReason}</span>
        )}
      </div>

      {/* Details grid */}
      <OpCard>
        <OpCardHead title="Datos del servicio" />
        <OpCardBody className="p-0">
          <dl className="divide-y divide-ln-op-line">
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
            <Row
              label="Capacidad por turno"
              value={`${offering.slotCapacity} lugar${offering.slotCapacity === 1 ? "" : "es"}`}
            />
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
              <Row label="Revisado el" value={formatDate(offering.reviewedAt)} />
            )}
          </dl>
        </OpCardBody>
      </OpCard>

      {/* CTA for approved offerings */}
      {offering.status === "approved" && (
        <div>
          <Link
            href={`/org/${orgToken}/servicios/${offeringToken}/agenda`}
            className="inline-block px-4 py-2 rounded-[6px] bg-ln-op-azul text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
          >
            Configurar agenda →
          </Link>
        </div>
      )}

      <footer className="pt-4 border-t border-ln-op-line">
        <Link
          href={`/org/${orgToken}/servicios`}
          className="text-[12px] text-ln-op-azul hover:underline"
        >
          ← Volver a mis servicios
        </Link>
      </footer>
    </div>
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
      <dt className="text-[12px] text-ln-op-mute shrink-0 w-36">{label}</dt>
      <dd className={`text-[13px] text-ln-op-ink flex-1 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
