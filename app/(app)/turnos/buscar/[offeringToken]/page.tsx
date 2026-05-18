// /turnos/buscar/[offeringToken] — Offering detail + 60-day slot grid (Fase 4).
//
// Shows the full offering info and a grid of available slots for the next
// 60 days, grouped by day. Each available slot links to the confirmation page.

import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db, organizations, profiles, serviceOfferings, timeSlots } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { findServiceKind } from "@/lib/service-kinds";

export default async function OfferingDetailPage({
  params,
}: {
  params: Promise<{ offeringToken: string }>;
}) {
  await requireUserOrRedirect();
  const { offeringToken } = await params;

  const [row] = await db
    .select({
      offering: serviceOfferings,
      org: {
        displayName: organizations.displayName,
        avatarUrl: organizations.avatarUrl,
        jurisdictionLocality: organizations.jurisdictionLocality,
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

  if (!row || row.offering.status !== "approved") notFound();

  const { offering, org, provider } = row;

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  // Fetch all available slots in the 60-day window.
  const availableSlots = await db
    .select({
      id: timeSlots.id,
      startsAt: timeSlots.startsAt,
      endsAt: timeSlots.endsAt,
      capacity: timeSlots.capacity,
      bookingsCount: timeSlots.bookingsCount,
    })
    .from(timeSlots)
    .where(
      sql`${timeSlots.serviceOfferingId} = ${offering.id}
          AND ${timeSlots.status} = 'open'
          AND ${timeSlots.startsAt} >= ${now}
          AND ${timeSlots.startsAt} <= ${windowEnd}
          AND ${timeSlots.bookingsCount} < ${timeSlots.capacity}`,
    )
    .orderBy(timeSlots.startsAt);

  // Group slots by day (YYYY-MM-DD in Buenos Aires time).
  const groupedByDay = new Map<string, typeof availableSlots>();
  for (const slot of availableSlots) {
    const dayKey = slot.startsAt
      .toLocaleDateString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    const list = groupedByDay.get(dayKey) ?? [];
    list.push(slot);
    groupedByDay.set(dayKey, list);
  }

  const kindDef = findServiceKind(offering.serviceKind);

  const providerLabel =
    offering.organizationId && org
      ? org.displayName
      : provider
        ? `Dr/a. ${provider.displayName.split(" ")[0]}${provider.matriculaNumber ? ` · Mat. ${provider.matriculaNumber}` : ""}`
        : "Profesional independiente";

  const backParams = new URLSearchParams({ service_kind: offering.serviceKind });

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-8 space-y-8">
        <Link
          href={`/turnos/buscar?${backParams.toString()}`}
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4"
        >
          ← Volver a resultados
        </Link>

        {/* Offering header */}
        <div className="flex items-start gap-4">
          {offering.organizationId && org?.avatarUrl && (
            <img
              src={org.avatarUrl}
              alt={org.displayName}
              className="w-16 h-16 rounded-full object-cover shrink-0"
            />
          )}
          <div className="space-y-1 flex-1 min-w-0">
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
              {offering.displayName}
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{providerLabel}</p>
            <p className="text-xs text-neutral-400 dark:text-neutral-500">
              {kindDef?.label ?? offering.serviceKind}
              {offering.priceArs !== null
                ? ` · $${Number(offering.priceArs).toLocaleString("es-AR")}`
                : " · Gratuito"}
              {` · ${offering.durationMinutes} min`}
              {org?.jurisdictionLocality ? ` · ${org.jurisdictionLocality}` : ""}
            </p>
            {offering.description && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 pt-1">
                {offering.description}
              </p>
            )}
          </div>
        </div>

        {/* Slot grid */}
        <div className="space-y-6">
          <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-50">
            Turnos disponibles
          </h2>
          {groupedByDay.size === 0 ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              No hay turnos disponibles en los próximos 60 días.
            </p>
          ) : (
            <div className="space-y-6">
              {Array.from(groupedByDay.entries()).map(([dayLabel, slots]) => {
                // Parse a proper date label using the first slot's date.
                const firstSlot = slots[0]!;
                const dayHeading = firstSlot.startsAt.toLocaleDateString("es-AR", {
                  timeZone: "America/Argentina/Buenos_Aires",
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                });

                return (
                  <div key={dayLabel} className="space-y-2">
                    <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 capitalize">
                      {dayHeading}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {slots.map((slot) => {
                        const timeLabel = slot.startsAt.toLocaleTimeString("es-AR", {
                          timeZone: "America/Argentina/Buenos_Aires",
                          hour: "2-digit",
                          minute: "2-digit",
                        });
                        const remaining = slot.capacity - slot.bookingsCount;
                        return (
                          <Link
                            key={slot.id}
                            href={`/turnos/buscar/${offeringToken}/reservar/${slot.id}`}
                            className="inline-flex flex-col items-center px-4 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 hover:border-neutral-900 dark:hover:border-neutral-50 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors text-center"
                          >
                            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                              {timeLabel}
                            </span>
                            {slot.capacity > 1 && (
                              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                                {remaining} lugar{remaining === 1 ? "" : "es"}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
