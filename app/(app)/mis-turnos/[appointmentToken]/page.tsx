// /mis-turnos/[appointmentToken] — Libreta Nacional redesign.
// CancelButton, MisTurnosSheetMounter (client components) unchanged.

import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Suspense } from "react";

import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnCallout } from "@/components/ui/DocElements";
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

  const statusConfig = STATUS_CONFIG[appointment.status] ?? STATUS_CONFIG.confirmed;
  const canCancel = appointment.status === "confirmed" && slot.startsAt > new Date();

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
    <div className="mx-auto max-w-md px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href="/mis-turnos"
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Mis turnos
      </Link>

      {/* Header */}
      <div className="mb-[24px] flex items-start justify-between gap-3">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[24px] font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-ink)]">
          {offering.displayName}
        </h1>
        <span
          className={`flex-shrink-0 inline-flex items-center rounded-[2px] border px-[8px] py-[2px] font-[var(--font-ln-mono)] text-[9.5px] font-semibold uppercase tracking-[.1em] ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}
        >
          {statusConfig.label}
        </span>
      </div>

      {/* Details */}
      <LnCard className="mb-[20px]">
        <LnCardHead title="Detalle del turno" />
        <LnCardBody>
          <dl className="flex flex-col gap-[12px]">
            <DetailRow label="Mascota">
              <Link
                href={`/mis-mascotas/${pet.publicToken}`}
                className="text-[var(--color-ln-azul)] no-underline hover:underline"
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
            <DetailRow label="Precio">
              {offering.priceArs !== null
                ? `$${Number(offering.priceArs).toLocaleString("es-AR")}`
                : "Gratuito"}
            </DetailRow>
            {org?.jurisdictionLocality && (
              <DetailRow label="Localidad">{org.jurisdictionLocality}</DetailRow>
            )}
            {org?.phone && <DetailRow label="Teléfono">{org.phone}</DetailRow>}
            {!org && provider?.phone && <DetailRow label="Teléfono">{provider.phone}</DetailRow>}
          </dl>
        </LnCardBody>
      </LnCard>

      {/* QR check-in */}
      {showCheckInQr && qrSvg && (
        <LnCard className="mb-[20px]">
          <LnCardHead title="Check-in en la clínica" label="QR" />
          <LnCardBody className="flex flex-col items-center gap-[10px]">
            <p className="self-start text-[12.5px] text-[var(--color-ln-ink-2)]">
              Mostrá este QR cuando llegues. Si el escáner no lo lee, dictá el código de abajo.
            </p>
            <div
              className="rounded-[4px] border border-[var(--color-ln-line)] bg-white p-[8px]"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: server-rendered SVG from qrcode lib
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="select-all text-center font-[var(--font-ln-mono)] text-[18px] font-bold tracking-widest text-[var(--color-ln-ink)]">
              {appointmentToken}
            </p>
          </LnCardBody>
        </LnCard>
      )}

      {/* Attended notice */}
      {appointment.status === "attended" && (
        <div className="mb-[20px]">
          <LnCallout tone="azul">
            Asististe a este turno. El registro médico quedó guardado en la libreta de {pet.name}.
          </LnCallout>
        </div>
      )}

      {/* Cancel */}
      {canCancel && (
        <div className="border-t border-[var(--color-ln-line-2)] pt-[16px]">
          <Suspense>
            <CancelButton />
          </Suspense>
        </div>
      )}

      {/* Sheet mounter */}
      <Suspense>
        <MisTurnosSheetMounter appointmentToken={appointmentToken} />
      </Suspense>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-[var(--font-ln-mono)] text-[10px] uppercase tracking-[.08em] text-[var(--color-ln-mute)]">
        {label}
      </dt>
      <dd className="mt-[2px] text-[13px] text-[var(--color-ln-ink-2)]">{children}</dd>
    </div>
  );
}

type StatusConfig = { label: string; bg: string; text: string; border: string };

const STATUS_CONFIG: Record<string, StatusConfig> = {
  confirmed: {
    label: "Confirmado",
    bg: "bg-[#eef6f0]",
    text: "text-[var(--color-ln-ok)]",
    border: "border-[#c8e2d2]",
  },
  attended: {
    label: "Asistido",
    bg: "bg-[var(--color-ln-celeste-050)]",
    text: "text-[var(--color-ln-azul)]",
    border: "border-[var(--color-ln-celeste-100)]",
  },
  cancelled: {
    label: "Cancelado",
    bg: "bg-[var(--color-ln-stripe)]",
    text: "text-[var(--color-ln-mute)]",
    border: "border-[var(--color-ln-line-strong)]",
  },
  cancelled_by_owner: {
    label: "Cancelado por vos",
    bg: "bg-[var(--color-ln-stripe)]",
    text: "text-[var(--color-ln-mute)]",
    border: "border-[var(--color-ln-line-strong)]",
  },
  no_show: {
    label: "No asistió",
    bg: "bg-[#fbe9e6]",
    text: "text-[var(--color-ln-err)]",
    border: "border-[#f1c6bf]",
  },
};
