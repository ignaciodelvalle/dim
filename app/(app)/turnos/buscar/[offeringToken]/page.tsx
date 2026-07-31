// /turnos/buscar/[offeringToken] — Libreta Nacional redesign.

import { LnSectionHead } from "@/components/ui/DocElements";
import { db, organizations, profiles, serviceOfferings, timeSlots } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { findServiceKind } from "@/lib/reference/service-kinds";
import { pluralizeEs } from "@/lib/utils/format";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

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
          AND ${timeSlots.startsAt} >= ${now.toISOString()}
          AND ${timeSlots.startsAt} <= ${windowEnd.toISOString()}
          AND ${timeSlots.bookingsCount} < ${timeSlots.capacity}`,
    )
    .orderBy(timeSlots.startsAt);

  const groupedByDay = new Map<string, typeof availableSlots>();
  for (const slot of availableSlots) {
    const dayKey = slot.startsAt.toLocaleDateString("es-AR", {
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
    <div className="mx-auto max-w-2xl px-8 py-7 pb-12">
      {/* Back */}
      <Link
        href={`/turnos/buscar?${backParams.toString()}`}
        className="mb-5 inline-block font-ln-mono text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
      >
        ← Resultados
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-start gap-4">
        {offering.organizationId && org?.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={org.avatarUrl}
            alt={org.displayName}
            className="h-[56px] w-[56px] flex-shrink-0 rounded-full object-cover border border-[var(--color-ln-line-strong)]"
          />
        )}
        <div>
          <h1 className="m-0 font-ln-serif text-2xl font-semibold leading-tight tracking-[-0.01em] text-[var(--color-ln-ink)]">
            {offering.displayName}
          </h1>
          <p className="mt-[3px] text-[13px] text-[var(--color-ln-mute)]">{providerLabel}</p>
          <p className="mt-0.5 font-ln-mono text-[11px] text-[var(--color-ln-mute)]">
            {kindDef?.label ?? offering.serviceKind}
            {offering.priceArs !== null
              ? ` · $${Number(offering.priceArs).toLocaleString("es-AR")}`
              : " · Gratuito"}
            {` · ${offering.durationMinutes} min`}
            {org?.jurisdictionLocality ? ` · ${org.jurisdictionLocality}` : ""}
          </p>
          {offering.description && (
            <p className="mt-1.5 text-[12.5px] text-[var(--color-ln-ink-2)]">
              {offering.description}
            </p>
          )}
        </div>
      </div>

      {/* Slot grid */}
      <LnSectionHead title="Turnos disponibles" className="mb-5" />

      {groupedByDay.size === 0 ? (
        <p className="text-[13px] text-[var(--color-ln-mute)]">
          No hay turnos disponibles en los próximos 60 días.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(groupedByDay.entries()).map(([dayLabel, slots]) => {
            // biome-ignore lint/style/noNonNullAssertion: groupedByDay only contains non-empty slot arrays.
            const firstSlot = slots[0]!;
            const dayHeading = firstSlot.startsAt.toLocaleDateString("es-AR", {
              timeZone: "America/Argentina/Buenos_Aires",
              weekday: "long",
              day: "numeric",
              month: "long",
            });

            return (
              <div key={dayLabel}>
                <p className="mb-2.5 font-ln-mono text-[11px] uppercase tracking-[.08em] text-[var(--color-ln-mute)] capitalize">
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
                        className="inline-flex flex-col items-center rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-3.5 py-2.5 no-underline hover:border-[var(--color-ln-azul)] hover:bg-[var(--color-ln-celeste-050)] transition-colors"
                      >
                        <span className="font-ln-mono text-[13px] font-semibold text-[var(--color-ln-ink)]">
                          {timeLabel}
                        </span>
                        {slot.capacity > 1 && (
                          <span className="mt-px font-ln-mono text-[9.5px] text-[var(--color-ln-mute)]">
                            {remaining} {pluralizeEs(remaining, "lugar")}
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
  );
}
