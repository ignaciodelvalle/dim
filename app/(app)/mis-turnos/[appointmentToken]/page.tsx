// /mis-turnos/[appointmentToken] — Appointment detail (Fase 4).
//
// Shows full appointment info: pet, offering, slot, provider, status.
// Cancellation button is stubbed here but wired in Block F.

import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { appointments, db, organizations, pets, profiles, serviceOfferings, timeSlots } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";
import { CancelButton } from "./CancelButton";

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ appointmentToken: string }>;
}) {
  const { user } = await requireUserOrRedirect();
  const { appointmentToken } = await params;

  const [row] = await db
    .select({
      appointment: appointments,
      slot: timeSlots,
      offering: serviceOfferings,
      pet: pets,
      org: {
        displayName: organizations.displayName,
        avatarUrl: organizations.avatarUrl,
        email: organizations.email,
        phone: organizations.phone,
        jurisdictionLocality: organizations.jurisdictionLocality,
      },
      provider: {
        displayName: profiles.displayName,
        matriculaNumber: profiles.matriculaNumber,
        phone: profiles.phone,
      },
    })
    .from(appointments)
    .innerJoin(timeSlots, eq(timeSlots.id, appointments.slotId))
    .innerJoin(serviceOfferings, eq(serviceOfferings.id, appointments.serviceOfferingId))
    .innerJoin(pets, eq(pets.id, appointments.petId))
    .leftJoin(organizations, eq(organizations.id, appointments.organizationId))
    .leftJoin(profiles, eq(profiles.id, serviceOfferings.providerUserId))
    .where(eq(appointments.publicToken, appointmentToken))
    .limit(1);

  if (!row) notFound();

  // Ownership check — users can only see their own appointments.
  if (row.appointment.ownerUserId !== user.id) notFound();

  const { appointment, slot, offering, pet, org, provider } = row;
  const kindDef = findServiceKind(offering.serviceKind);

  const providerLabel =
    appointment.organizationId && org
      ? org.displayName
      : provider
        ? `Dr/a. ${provider.displayName.split(" ")[0]}${provider.matriculaNumber ? ` · Mat. ${provider.matriculaNumber}` : ""}`
        : "Profesional independiente";

  const slotDate = slot.startsAt.toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const slotTime = slot.startsAt.toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
  });

  const statusBadge = STATUS_BADGE[appointment.status] ?? STATUS_BADGE.confirmed;
  const canCancel =
    appointment.status === "confirmed" && slot.startsAt > new Date();

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href="/mis-turnos"
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4"
        >
          ← Volver a mis turnos
        </Link>

        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            {offering.displayName}
          </h1>
          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
        </div>

        {/* Details */}
        <dl className="space-y-4">
          <DetailRow label="Mascota">
            <Link
              href={`/mis-mascotas/${pet.publicToken}`}
              className="underline underline-offset-4 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              {pet.name}
            </Link>
          </DetailRow>

          <DetailRow label="Tipo de servicio">
            {kindDef?.label ?? offering.serviceKind}
          </DetailRow>

          <DetailRow label="Prestador">
            {providerLabel}
          </DetailRow>

          <DetailRow label="Fecha y hora">
            <span className="capitalize">{slotDate}</span> a las {slotTime}
          </DetailRow>

          <DetailRow label="Duración">
            {offering.durationMinutes} minutos
          </DetailRow>

          {offering.priceArs !== null ? (
            <DetailRow label="Precio">
              ${Number(offering.priceArs).toLocaleString("es-AR")}
            </DetailRow>
          ) : (
            <DetailRow label="Precio">Gratuito</DetailRow>
          )}

          {org?.jurisdictionLocality && (
            <DetailRow label="Localidad">{org.jurisdictionLocality}</DetailRow>
          )}

          {org?.phone && (
            <DetailRow label="Teléfono contacto">{org.phone}</DetailRow>
          )}
          {!org && provider?.phone && (
            <DetailRow label="Teléfono contacto">{provider.phone}</DetailRow>
          )}
        </dl>

        {/* Cancellation — Fase 6 */}
        {canCancel && (
          <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <CancelButton appointmentToken={appointmentToken} />
          </div>
        )}

        {appointment.status === "attended" && (
          <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Asististe a este turno. El registro médico quedó guardado en la libreta de{" "}
              {pet.name}.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm text-neutral-900 dark:text-neutral-50 mt-0.5">{children}</dd>
    </div>
  );
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed: {
    label: "Confirmado",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  attended: {
    label: "Asistido",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  },
  cancelled: {
    label: "Cancelado",
    className: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-300",
  },
  no_show: {
    label: "No asistió",
    className: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  },
};
