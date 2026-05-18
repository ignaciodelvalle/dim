// /turnos/buscar/[offeringToken]/reservar/[slotId] — Booking confirmation (Fase 4).
//
// Shows offering + slot info, lets the user pick which pet to book for,
// then submits via bookSlotAction.

import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { bookSlotAction } from "@/app/actions/booking";
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

  // Fetch offering.
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

  // Fetch slot.
  const [slot] = await db
    .select()
    .from(timeSlots)
    .where(eq(timeSlots.id, slotId))
    .limit(1);

  if (
    !slot ||
    slot.serviceOfferingId !== offeringRow.offering.id ||
    slot.status === "cancelled" ||
    slot.bookingsCount >= slot.capacity ||
    slot.startsAt <= new Date()
  ) {
    notFound();
  }

  // Fetch user's owned pets.
  const userPets = await db
    .select({ pet: pets })
    .from(pets)
    .innerJoin(ownerships, eq(ownerships.petId, pets.id))
    .where(
      sql`${ownerships.ownerUserId} = ${user.id} AND ${ownerships.endedAt} IS NULL`,
    )
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
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-md mx-auto pt-8 space-y-8">
        <Link
          href={`/turnos/buscar/${offeringToken}`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4"
        >
          ← Volver a los turnos
        </Link>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
            Confirmar reserva
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Revisá los datos antes de confirmar. La reserva es inmediata.
          </p>
        </div>

        {/* Summary card */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
          <div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
              Servicio
            </p>
            <p className="font-medium text-neutral-900 dark:text-neutral-50">
              {offering.displayName}
            </p>
            <p className="text-xs text-neutral-500">{kindDef?.label ?? offering.serviceKind}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
              Prestador
            </p>
            <p className="text-sm text-neutral-900 dark:text-neutral-50">{providerLabel}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
              Fecha y hora
            </p>
            <p className="text-sm text-neutral-900 dark:text-neutral-50 capitalize">
              {slotDate} a las {slotTime}
            </p>
          </div>
          {offering.priceArs !== null && (
            <div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                Precio
              </p>
              <p className="text-sm text-neutral-900 dark:text-neutral-50">
                ${Number(offering.priceArs).toLocaleString("es-AR")}
              </p>
            </div>
          )}
        </div>

        {/* Booking form */}
        {userPets.length === 0 ? (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-2">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Para reservar un turno necesitás tener al menos una mascota registrada.
            </p>
            <Link
              href="/mis-mascotas/nueva"
              className="inline-block text-sm text-amber-900 dark:text-amber-100 underline underline-offset-4"
            >
              Registrar mascota →
            </Link>
          </div>
        ) : (
          <BookingForm slotId={slotId} userPets={userPets.map((r) => r.pet)} />
        )}
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// BookingForm — client wrapper isn't needed; pure server form with hidden fields
// ────────────────────────────────────────────────────────────────────────────

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
    <form action={submit} className="space-y-4">
      <div className="space-y-1">
        <label
          htmlFor="pet_select"
          className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >
          ¿Para qué mascota es el turno?
        </label>
        <select
          id="pet_select"
          name="petId"
          required
          className="w-full text-sm border border-neutral-200 dark:border-neutral-700 rounded-lg px-3 py-2 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50"
        >
          <option value="">Elegí una mascota…</option>
          {userPets.map((pet) => (
            <option key={pet.id} value={pet.id}>
              {pet.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="w-full py-3 rounded-xl bg-neutral-900 dark:bg-neutral-50 text-white dark:text-neutral-900 font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
      >
        Confirmar reserva
      </button>
    </form>
  );
}
