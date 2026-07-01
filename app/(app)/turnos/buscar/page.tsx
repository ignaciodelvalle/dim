// /turnos/buscar — Libreta Nacional redesign.
// SearchFiltersForm (client component) unchanged.

import { and, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";

import { LnSectionHead } from "@/components/ui/DocElements";
import { db, organizations, ownerships, pets, profiles, serviceOfferings, timeSlots } from "@/db";
import { requireUserOrRedirect } from "@/lib/infra/auth-guards";
import { SERVICE_KINDS, findServiceKind } from "@/lib/reference/service-kinds";

import { SearchFiltersForm } from "./SearchFiltersForm";

export default async function BuscarTurnosPage({
  searchParams,
}: {
  searchParams: Promise<{
    service_kind?: string;
    province?: string;
    locality?: string;
    fecha_desde?: string;
    solo_gratis?: string;
  }>;
}) {
  const { user } = await requireUserOrRedirect();
  const params = await searchParams;

  const serviceKind = params.service_kind?.trim() ?? "";
  const fechaDesde = params.fecha_desde?.trim() ?? "";
  const soloGratis = params.solo_gratis === "true";

  let province = params.province?.trim() ?? "";
  let locality = params.locality?.trim() ?? "";

  if ((!province || !locality) && serviceKind) {
    const [firstPet] = await db
      .select({
        jurisdictionProvince: pets.jurisdictionProvince,
        jurisdictionLocality: pets.jurisdictionLocality,
      })
      .from(pets)
      .innerJoin(ownerships, eq(ownerships.petId, pets.id))
      .where(sql`${ownerships.ownerUserId} = ${user.id} AND ${ownerships.endedAt} IS NULL`)
      .orderBy(pets.createdAt)
      .limit(1);

    if (firstPet) {
      if (!province) province = firstPet.jurisdictionProvince ?? "";
      if (!locality) locality = firstPet.jurisdictionLocality ?? "";
    }
  }

  if (!serviceKind) {
    return (
      <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
        <div className="mb-[24px]">
          <h1 className="m-0 font-[var(--font-ln-serif)] text-[30px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
            Buscar turno
          </h1>
          <p className="mt-[5px] text-md text-[var(--color-ln-mute)]">
            Indicá qué servicio buscás.
          </p>
        </div>
        <ServiceKindSelector />
        <div className="mt-[32px]">
          <Link
            href="/mis-mascotas"
            className="font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
          >
            ← Mis mascotas
          </Link>
        </div>
      </div>
    );
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const slotWindowStart =
    fechaDesde && /^\d{4}-\d{2}-\d{2}$/.test(fechaDesde)
      ? new Date(Math.max(now.getTime(), new Date(fechaDesde).getTime()))
      : now;

  const offeringConditions = [
    eq(serviceOfferings.serviceKind, serviceKind),
    eq(serviceOfferings.status, "approved"),
  ] as ReturnType<typeof eq>[];

  if (province) offeringConditions.push(eq(serviceOfferings.jurisdictionProvince, province));
  if (locality) offeringConditions.push(eq(serviceOfferings.jurisdictionLocality, locality));
  if (soloGratis) offeringConditions.push(isNull(serviceOfferings.priceArs));

  const offeringRows = await db
    .select({
      offering: serviceOfferings,
      org: {
        displayName: organizations.displayName,
        avatarUrl: organizations.avatarUrl,
        tier0ShowBranding: organizations.tier0ShowBranding,
        verified: organizations.verified,
      },
      provider: {
        displayName: profiles.displayName,
        matriculaNumber: profiles.matriculaNumber,
      },
    })
    .from(serviceOfferings)
    .leftJoin(organizations, eq(organizations.id, serviceOfferings.organizationId))
    .leftJoin(profiles, eq(profiles.id, serviceOfferings.providerUserId))
    .where(and(...offeringConditions));

  const offeringIds = offeringRows.map((r) => r.offering.id);
  type TimeSlotRow = typeof timeSlots.$inferSelect;
  const slotsByOffering = new Map<string, TimeSlotRow[]>();

  if (offeringIds.length > 0) {
    const slotsRaw = await db
      .select()
      .from(timeSlots)
      .where(
        sql`${timeSlots.serviceOfferingId} = ANY(${sql.raw(`ARRAY[${offeringIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})
            AND ${timeSlots.status} = 'open'
            AND ${timeSlots.startsAt} >= ${slotWindowStart}
            AND ${timeSlots.startsAt} <= ${windowEnd}
            AND ${timeSlots.bookingsCount} < ${timeSlots.capacity}`,
      )
      .orderBy(timeSlots.startsAt);

    for (const slot of slotsRaw) {
      const list = slotsByOffering.get(slot.serviceOfferingId) ?? [];
      list.push(slot);
      slotsByOffering.set(slot.serviceOfferingId, list);
    }
  }

  const offeringsWithSlots = offeringRows.filter(
    (r) => (slotsByOffering.get(r.offering.id)?.length ?? 0) > 0,
  );

  const kindDef = findServiceKind(serviceKind);
  const locationLabel = locality ? locality : province ? province : null;

  return (
    <div className="mx-auto max-w-2xl px-[32px] py-[28px] pb-[48px]">
      {/* Header */}
      <div className="mb-[20px]">
        <h1 className="m-0 font-[var(--font-ln-serif)] text-[28px] font-semibold leading-tight tracking-[-0.02em] text-[var(--color-ln-ink)]">
          {kindDef?.label ?? serviceKind}
        </h1>
        {locationLabel && (
          <p className="mt-[4px] font-[var(--font-ln-mono)] text-sm text-[var(--color-ln-mute)]">
            {locationLabel}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="mb-[24px]">
        <SearchFiltersForm
          currentServiceKind={serviceKind}
          currentProvince={province}
          currentLocality={locality}
          currentFechaDesde={fechaDesde}
          currentSoloGratis={soloGratis}
        />
      </div>

      {/* Results */}
      {offeringsWithSlots.length === 0 ? (
        <p className="py-[24px] text-[13px] text-[var(--color-ln-mute)]">
          {locationLabel
            ? `Sin servicios disponibles en ${locationLabel}. Probá otra localidad.`
            : "No hay turnos disponibles para este servicio en los próximos 7 días."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
          {offeringsWithSlots.map(({ offering, org, provider }) => {
            const slots = slotsByOffering.get(offering.id) ?? [];
            const providerLabel =
              offering.organizationId && org
                ? org.displayName
                : provider
                  ? `Dr/a. ${provider.displayName.split(" ")[0]}${provider.matriculaNumber ? ` · Mat. ${provider.matriculaNumber}` : ""}`
                  : "Profesional independiente";

            return (
              <Link
                key={offering.id}
                href={`/turnos/buscar/${offering.publicToken}`}
                className="flex items-center justify-between gap-4 border-b border-[var(--color-ln-line-2)] px-[16px] py-[14px] no-underline last:border-b-0 hover:bg-[var(--color-ln-stripe)] transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-[var(--font-ln-serif)] text-[15px] font-semibold text-[var(--color-ln-ink)]">
                    {offering.displayName}
                  </p>
                  <p className="mt-[2px] font-[var(--font-ln-mono)] text-[10.5px] text-[var(--color-ln-mute)]">
                    {providerLabel}
                    {offering.priceArs !== null
                      ? ` · $${Number(offering.priceArs).toLocaleString("es-AR")}`
                      : " · Gratuito"}
                    {` · ${offering.durationMinutes} min`}
                  </p>
                  <p className="mt-[4px] text-sm text-[var(--color-ln-ok)]">
                    {slots.length} turno{slots.length === 1 ? "" : "s"} disponible
                    {slots.length === 1 ? "" : "s"} en 7 días
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-[10px]">
                  {offering.organizationId &&
                    org?.avatarUrl &&
                    org.tier0ShowBranding &&
                    org.verified && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={org.avatarUrl}
                        alt={org.displayName}
                        className="h-[36px] w-[36px] rounded-full object-cover"
                      />
                    )}
                  <span aria-hidden="true" className="text-base text-[var(--color-ln-mute)]">
                    ›
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-[32px]">
        <Link
          href="/mis-mascotas"
          className="font-[var(--font-ln-mono)] text-[11px] uppercase tracking-[.06em] text-[var(--color-ln-azul)] no-underline hover:underline"
        >
          ← Mis mascotas
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ServiceKindSelector() {
  return (
    <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
      {SERVICE_KINDS.map((kind) => (
        <Link
          key={kind.code}
          href={`/turnos/buscar?service_kind=${kind.code}`}
          className="flex items-center justify-between border-b border-[var(--color-ln-line-2)] px-[16px] py-[13px] no-underline last:border-b-0 hover:bg-[var(--color-ln-stripe)] transition-colors"
        >
          <span className="text-[13.5px] text-[var(--color-ln-ink)]">{kind.label}</span>
          <span aria-hidden="true" className="text-base text-[var(--color-ln-mute)]">
            ›
          </span>
        </Link>
      ))}
    </div>
  );
}
