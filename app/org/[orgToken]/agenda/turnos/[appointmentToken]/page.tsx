// /org/[orgToken]/agenda/turnos/[appointmentToken] — appointment detail + attendance (Fase 5).
//
// Capability-gated: appointment.manage.
// Renders the per-service-kind attendance form and no-show / cancel controls.

import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  cancelAppointmentByOrgAction,
  markAppointmentAttendedAction,
  markAppointmentNoShowAction,
} from "@/app/actions/attendance";
import { OpCard, OpCardBody, OpCardHead, OpPill } from "@/components/ui/dashboard";
import { appointments, db, pets, profiles, serviceOfferings, timeSlots } from "@/db";
import { requireOrgAccessByToken } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";
import { AttendanceFormDispatcher } from "./AttendanceFormDispatcher";

type StatusTone = "ok" | "triaged" | "neutral" | "danger";
const STATUS_PILL: Record<string, { label: string; tone: StatusTone }> = {
  confirmed: { label: "Confirmado", tone: "triaged" },
  attended: { label: "Asistido", tone: "ok" },
  cancelled_by_org: { label: "Cancelado org", tone: "neutral" },
  cancelled_by_owner: { label: "Cancelado dueño", tone: "neutral" },
  no_show: { label: "Ausente", tone: "danger" },
};

export default async function OrgAppointmentDetailPage({
  params,
}: {
  params: Promise<{ orgToken: string; appointmentToken: string }>;
}) {
  const { orgToken, appointmentToken } = await params;

  const { organization, membership } = await requireOrgAccessByToken(orgToken);
  const granted = await getGrantedCapabilities(membership);
  if (!granted.has("appointment.manage")) notFound();

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

  // Security: appointment must belong to this org.
  if (row.appointment.organizationId !== organization.id) notFound();

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
  const backUrl = `/org/${orgToken}/agenda`;
  const pill = STATUS_PILL[appointment.status] ?? STATUS_PILL.confirmed;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <Link href={backUrl} className="inline-block text-sm text-ln-op-azul hover:underline">
        ← Volver a la agenda
      </Link>

      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-ln-op-mute">
          {organization.displayName}
        </p>
        <h1 className="text-[22px] font-semibold text-ln-op-ink">{offering.displayName}</h1>
      </header>

      <OpCard>
        <OpCardHead
          title="Detalle del turno"
          actions={<OpPill tone={pill.tone}>{pill.label}</OpPill>}
        />
        <OpCardBody>
          <dl className="space-y-3">
            <Row label="Mascota">{pet.name}</Row>
            <Row label="Tipo de servicio">{kindDef?.label ?? offering.serviceKind}</Row>
            <Row label="Fecha y hora">
              <span className="capitalize">{slotDate}</span> a las {slotTime}
            </Row>
            <Row label="Propietario">
              {ownerProfile?.displayName?.split(" ")[0] ?? "—"}
              {ownerProfile?.phone && (
                <span className="ml-2 text-ln-op-mute">{ownerProfile.phone}</span>
              )}
            </Row>
          </dl>
        </OpCardBody>
      </OpCard>

      {isActionable ? (
        <AttendanceFormDispatcher
          appointmentToken={appointmentToken}
          serviceKind={offering.serviceKind}
          backUrl={backUrl}
          onAttend={markAppointmentAttendedAction}
          onNoShow={markAppointmentNoShowAction}
          onCancel={cancelAppointmentByOrgAction}
        />
      ) : (
        <OpCard>
          <OpCardBody>
            <p className="text-[13px] text-ln-op-ink-2">
              Este turno ya fue procesado (estado:{" "}
              <strong className="text-ln-op-ink">{appointment.status}</strong>).
            </p>
            {appointment.attendedAt && (
              <p className="text-sm text-ln-op-mute mt-1">
                Asistencia registrada el {appointment.attendedAt.toLocaleDateString("es-AR")}.
              </p>
            )}
          </OpCardBody>
        </OpCard>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ln-op-mute uppercase tracking-[0.08em]">{label}</dt>
      <dd className="text-[13px] text-ln-op-ink mt-0.5">{children}</dd>
    </div>
  );
}
