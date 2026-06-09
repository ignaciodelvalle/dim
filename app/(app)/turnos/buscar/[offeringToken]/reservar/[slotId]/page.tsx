// Confirmar reserva — Libreta Nacional redesign.

import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { bookSlotAction } from "@/app/actions/booking";
import { LnButton } from "@/components/ui/Button";
import { LnCard, LnCardBody, LnCardHead } from "@/components/ui/Card";
import { LnCallout } from "@/components/ui/DocElements";
import { LnField } from "@/components/ui/Field";
import { db, organizations, ownerships, pets, profiles, serviceOfferings, timeSlots } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";

export default async function ReservarTurnoPage({
  params,
}: {
  params: Promise<{ offeringToken: string; slotId: string }>;
}) {
  const { user } = await requireUserOrRedirect();
  const { offeringToken, slotId } = await params;

  const [offeringRow] = await db
    .select({
      offering: serviceOfferings,
      org: {
        displayName: organizations.displayName,
        avatarUrl: organizations.avatarUrl,
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

  if (!offeringRow || offeringRow.offering.status !== "approved") notFound();

  const [slot] = await db.select().from(timeSlots).where(eq(timeSlots.id, slotId)).limit(1);

  if (
    !slot ||
    slot.serviceOfferingId !== offeringRow.offering.id ||
    slot.status === "cancelled" ||
    slot.bookingsCount >= slot.capacity ||
    slot.startsAt <= new Date()
  ) {
    notFound();
  }

  const userPets = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(sql`${ownerships.ownerUserId} = ${user.id} AND ${ownerships.endedAt} IS NULL`)
    .orderBy(pets.name);

  const { offering, org, provider } = offeringRow;
  const kindDef = findServiceKind(offering.serviceKind);

  const providerLabel =
    offering.organizationId && org
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

  return (
    <div className="mx-auto max-w-md px-[32px] py-[28px] pb-[48px]">
      {/* Back */}
      <Link
        href={`/turnos/buscar/${offeringToken}`}
        className="mb-[20px] inline-block font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Volver a los turnos
      </Link>

      {/* Header */}
      <div className="mb-[24px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[26px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          Confirmar reserva
        </h1>
        <p className="mt-[5px] text-[14px] text-[var(--color-ln-mute)]">
          Revisá los datos antes de confirmar. La reserva es inmediata.
        </p>
      </div>

      {/* Summary card */}
      <LnCard className="mb-[20px]">
        <LnCardHead title="Resumen del turno" />
        <LnCardBody>
          <dl className="flex flex-col gap-[12px]">
            <DetailRow label="Servicio">
              <span className="font-medium">{offering.displayName}</span>
              <span className="ml-[6px] font-[var(--font-ln-mono)] text-[11px] text-[var(--color-ln-mute)]">
                {kindDef?.label ?? offering.serviceKind}
              </span>
            </DetailRow>
            <DetailRow label="Prestador">{providerLabel}</DetailRow>
            <DetailRow label="Fecha y hora">
              <span className="capitalize">{slotDate}</span> a las {slotTime}
            </DetailRow>
            {offering.priceArs !== null && (
              <DetailRow label="Precio">
                ${Number(offering.priceArs).toLocaleString("es-AR")}
              </DetailRow>
            )}
          </dl>
        </LnCardBody>
      </LnCard>

      {/* Booking form */}
      {userPets.length === 0 ? (
        <LnCallout tone="warn" title="Necesitás una mascota registrada">
          <Link
            href="/mis-mascotas/nueva"
            className="text-[var(--color-ln-azul)] no-underline hover:underline"
          >
            Registrar mascota →
          </Link>
        </LnCallout>
      ) : (
        <BookingForm slotId={slotId} userPets={userPets.map((r) => r.pet)} />
      )}
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

function BookingForm({
  slotId,
  userPets,
}: {
  slotId: string;
  userPets: Array<{ id: string; name: string; species: string }>;
}) {
  async function submit(formData: FormData) {
    "use server";
    const petId = String(formData.get("petId") ?? "").trim();
    if (!petId) return;
    await bookSlotAction(slotId, petId);
  }

  return (
    <form action={submit} className="flex flex-col gap-[16px]">
      <div>
        <label
          htmlFor="pet_select"
          className="mb-[6px] block font-[var(--font-ln-mono)] text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-ln-mute)]"
        >
          ¿Para qué mascota?
        </label>
        <select
          id="pet_select"
          name="petId"
          required
          className="w-full appearance-none rounded-[4px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-[12px] py-[10px] font-[var(--font-ln-sans)] text-[13.5px] text-[var(--color-ln-ink)] outline-none focus:border-[var(--color-ln-azul)] focus:shadow-[0_0_0_3px_var(--color-ln-celeste-050)]"
        >
          <option value="">Elegí una mascota…</option>
          {userPets.map((pet) => (
            <option key={pet.id} value={pet.id}>
              {pet.name}
            </option>
          ))}
        </select>
      </div>

      <LnButton type="submit" variant="primary" size="lg" block>
        Confirmar reserva
      </LnButton>
    </form>
  );
}
