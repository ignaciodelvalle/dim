// /pro/agenda — vet provider booking dashboard (Fase 8).
//
// Gated by requireVetProviderOrRedirect. Shows today's appointments scoped to
// provider_user_id = actor.id. Filterable by ?fecha=YYYY-MM-DD.

import { and, eq, gte, lt } from "drizzle-orm";
import Link from "next/link";

import {
  appointments,
  db,
  pets,
  profiles,
  serviceOfferings,
  timeSlots,
} from "@/db";
import { requireVetProviderOrRedirect } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  confirmed: {
    label: "Confirmado",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  attended: {
    label: "Asistido",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  },
  cancelled_by_org: {
    label: "Cancelado",
    className: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-300",
  },
  cancelled_by_owner: {
    label: "Cancelado",
    className: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900 dark:text-neutral-300",
  },
  no_show: {
    label: "Ausente",
    className: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  },
};

export default async function ProAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const { user, profile } = await requireVetProviderOrRedirect();
  const { fecha } = await searchParams;

  const targetDateStr =
    fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha)
      ? fecha
      : new Date().toLocaleDateString("en-CA", {
          timeZone: "America/Argentina/Buenos_Aires",
        });

  const localMidnight = new Date(`${targetDateStr}T00:00:00.000-03:00`);
  const localNextMidnight = new Date(localMidnight.getTime() + 24 * 60 * 60 * 1000);

  // Load appointments scoped to this vet's offerings.
  const rows = await db
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
    .where(
      and(
        eq(serviceOfferings.providerUserId, user.id),
        gte(timeSlots.startsAt, localMidnight),
        lt(timeSlots.startsAt, localNextMidnight),
      ),
    )
    .orderBy(timeSlots.startsAt);

  const current = new Date(`${targetDateStr}T00:00:00`);
  const prevDate = new Date(current.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const nextDate = new Date(current.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-neutral-500">Portal profesional</p>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
              Mi agenda
            </h1>
          </div>
          <Link
            href="/pro"
            className="text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4"
          >
            ← Volver al portal
          </Link>
        </div>

        {/* Date nav */}
        <div className="flex items-center gap-3">
          <Link
            href={`/pro/agenda?fecha=${prevDate}`}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
          >
            ← Anterior
          </Link>
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
            {new Date(`${targetDateStr}T12:00:00`).toLocaleDateString("es-AR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          <Link
            href={`/pro/agenda?fecha=${nextDate}`}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
          >
            Siguiente →
          </Link>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 py-8 text-center">
            No hay turnos para este día.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-800">
            {rows.map(({ appointment, slot, offering, pet, ownerProfile }) => {
              const kindDef = findServiceKind(offering.serviceKind);
              const badge = STATUS_BADGE[appointment.status] ?? STATUS_BADGE.confirmed;
              const slotTime = slot.startsAt.toLocaleTimeString("es-AR", {
                timeZone: "America/Argentina/Buenos_Aires",
                hour: "2-digit",
                minute: "2-digit",
              });
              const ownerLabel = ownerProfile?.displayName?.split(" ")[0] ?? "Propietario";
              const canAct = appointment.status === "confirmed";

              return (
                <li key={appointment.id} className="p-4 flex items-start gap-4">
                  <div className="shrink-0 text-sm font-mono text-neutral-600 dark:text-neutral-400 w-14 pt-0.5">
                    {slotTime}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                        {pet.name}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {kindDef?.label ?? offering.serviceKind} · {ownerLabel}
                      {ownerProfile?.phone && <> · {ownerProfile.phone}</>}
                    </p>
                  </div>
                  {canAct && (
                    <div className="shrink-0">
                      <Link
                        href={`/pro/agenda/turnos/${appointment.publicToken}`}
                        className="text-xs px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors text-neutral-700 dark:text-neutral-300"
                      >
                        Gestionar
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
