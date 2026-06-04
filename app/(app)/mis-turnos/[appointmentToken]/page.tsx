// /mis-turnos/[appointmentToken] — Appointment detail (Fase 4).
//
// Shows full appointment info: pet, offering, slot, provider, status.
// Cancellation is handled via URL-state sheet (?sheet=cancelar-turno).

import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Suspense } from "react";

import { appointments, db, organizations, pets, profiles, serviceOfferings, timeSlots } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";
import { CancelButton } from "./CancelButton";
import { MisTurnosSheetMounter } from "./MisTurnosSheetMounter";

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
  const canCancel = appointment.status === "confirmed" && slot.startsAt > new Date();

  // QR check-in (handoff P4-9 / D10). Encodes the appointment token so
  // the clinic's check-in flow can resolve it via a single scan. The
  // alphanumeric code below the QR is the fallback when the scanner
  // can't read a screen (glare, small phone, etc).
  const showCheckInQr = appointment.status === "confirmed";
  const qrSvg = showCheckInQr
    ? await QRCode.toString(`mimar://appointment/${appointmentToken}`, {
        type: "svg",
        margin: 1,
        width: 180,
        errorCorrectionLevel: "M",
      })
    : null;

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href="/mis-turnos"
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4"
        >
          ← Volver a mis turnos
        </Link>

        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold text-gob-text ">{offering.displayName}</h1>
          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${statusBadge.className}`}>
            {statusBadge.label}
          </span>
        </div>

        {/* Details */}
        <dl className="space-y-4">
          <DetailRow label="Mascota">
            <Link
              href={`/mis-mascotas/${pet.publicToken}`}
              className="underline underline-offset-4 hover:text-gob-text-gray "
            >
              {pet.name}
            </Link>
          </DetailRow>

          <DetailRow label="Tipo de servicio">{kindDef?.label ?? offering.serviceKind}</DetailRow>

          <DetailRow label="Prestador">{providerLabel}</DetailRow>

          <DetailRow label="Fecha y hora">
            <span className="capitalize">{slotDate}</span> a las {slotTime}
          </DetailRow>

          <DetailRow label="Duración">{offering.durationMinutes} minutos</DetailRow>

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

          {org?.phone && <DetailRow label="Teléfono contacto">{org.phone}</DetailRow>}
          {!org && provider?.phone && (
            <DetailRow label="Teléfono contacto">{provider.phone}</DetailRow>
          )}
        </dl>

        {/* QR check-in card (handoff P4-9 / D10). Only visible while the
            appointment is confirmed (not after attended/cancelled). */}
        {showCheckInQr && qrSvg && (
          <section
            aria-labelledby="checkin-h"
            className="rounded-2xl border border-gob-border  bg-white  p-5 space-y-3"
          >
            <h2 id="checkin-h" className="text-base font-semibold text-gob-text ">
              Para check-in en la clínica
            </h2>
            <p className="text-xs text-gob-text-gray ">
              Mostrá este QR cuando llegues. Si el escáner no lo lee, dictá el código de abajo.
            </p>
            <div
              className="mx-auto w-fit p-2 bg-white rounded-lg border border-gob-border"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered SVG from qrcode lib
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="text-center text-lg font-mono font-bold tracking-widest text-gob-text  select-all">
              {appointmentToken}
            </p>
          </section>
        )}

        {/* Cancellation — Fase 6 */}
        {canCancel && (
          <div className="pt-2 border-t border-gob-border ">
            <Suspense>
              <CancelButton />
            </Suspense>
          </div>
        )}

        {appointment.status === "attended" && (
          <div className="rounded-xl border border-gob-info  bg-gob-info/10  p-4">
            <p className="text-sm text-gob-azul-link ">
              Asististe a este turno. El registro médico quedó guardado en la libreta de {pet.name}.
            </p>
          </div>
        )}
      </div>
      {/* Sheet mounter — reads ?sheet= param and renders the matching sheet */}
      <Suspense>
        <MisTurnosSheetMounter appointmentToken={appointmentToken} />
      </Suspense>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gob-text-muted  uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gob-text  mt-0.5">{children}</dd>
    </div>
  );
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed: {
    label: "Confirmado",
    className: "bg-gob-success/10 text-gob-success  ",
  },
  attended: {
    label: "Asistido",
    className: "bg-gob-info/10 text-gob-azul-link  ",
  },
  cancelled: {
    label: "Cancelado",
    className: "bg-gob-surface-alt text-gob-text  ",
  },
  no_show: {
    label: "No asistió",
    className: "bg-gob-danger/10 text-gob-danger  ",
  },
};
