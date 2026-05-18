// /pro/agenda/turnos/[appointmentToken] — vet provider appointment detail (Fase 8).
//
// Gated by requireVetProviderOrRedirect + identity check (appointment.provider_user_id === actor.id).

import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  appointments,
  db,
  pets,
  profiles,
  serviceOfferings,
  timeSlots,
} from "@/db";
import { requireVetProviderOrRedirect } from "@/lib/auth-guards";
import {
  cancelAppointmentByOrgAction,
  markAppointmentAttendedAction,
  markAppointmentNoShowAction,
} from "@/app/actions/attendance";
import { findServiceKind } from "@/lib/service-kinds";
import { AttendanceFormDispatcher } from "./AttendanceFormDispatcher";

export default async function ProAppointmentDetailPage({
  params,
}: {
  params: Promise<{ appointmentToken: string }>;
}) {
  const { appointmentToken } = await params;
  const { user } = await requireVetProviderOrRedirect();

  const [row] = await db
    .select({
      appointment: appointments,
      slot: timeSlots,
      offering: serviceOfferings,
      pet: pets,
      ownerProfile: {
        displayName: profiles.displayName,
        phone: profiles.phone,
      },
    })
    .from(appointments)
    .innerJoin(timeSlots, eq(timeSlots.id, appointments.slotId))
    .innerJoin(serviceOfferings, eq(serviceOfferings.id, appointments.serviceOfferingId))
    .innerJoin(pets, eq(pets.id, appointments.petId))
    .leftJoin(profiles, eq(profiles.id, appointments.ownerUserId))
    .where(eq(appointments.publicToken, appointmentToken))
    .limit(1);

  if (!row) notFound();

  // Identity check: only the vet whose offering this is can manage it.
  if (row.offering.providerUserId !== user.id) notFound();

  const { appointment, slot, offering, pet, ownerProfile } = row;
  const kindDef = findServiceKind(offering.serviceKind);

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

  const isActionable = appointment.status === "confirmed";

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950 p-6">
      <div className="max-w-lg mx-auto pt-8 space-y-8">
        <Link
          href="/pro/agenda"
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4"
        >
          ← Volver a mi agenda
        </Link>

        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">Portal profesional</p>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            {offering.displayName}
          </h1>
        </header>

        <dl className="space-y-3 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
          <Row label="Mascota">{pet.name}</Row>
          <Row label="Tipo de servicio">{kindDef?.label ?? offering.serviceKind}</Row>
          <Row label="Fecha y hora">
            <span className="capitalize">{slotDate}</span> a las {slotTime}
          </Row>
          <Row label="Propietario">
            {ownerProfile?.displayName?.split(" ")[0] ?? "—"}
            {ownerProfile?.phone && (
              <span className="ml-2 text-neutral-500">{ownerProfile.phone}</span>
            )}
          </Row>
          <Row label="Estado">{appointment.status}</Row>
        </dl>

        {isActionable ? (
          <AttendanceFormDispatcher
            appointmentToken={appointmentToken}
            serviceKind={offering.serviceKind}
            backUrl="/pro/agenda"
            onAttend={markAppointmentAttendedAction}
            onNoShow={markAppointmentNoShowAction}
            onCancel={cancelAppointmentByOrgAction}
          />
        ) : (
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Este turno ya fue procesado (estado: <strong>{appointment.status}</strong>).
            </p>
            {appointment.attendedAt && (
              <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                Asistencia registrada el{" "}
                {appointment.attendedAt.toLocaleDateString("es-AR")}.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm text-neutral-900 dark:text-neutral-50 mt-0.5">{children}</dd>
    </div>
  );
}
