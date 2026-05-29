// /turnos/buscar — Owner-facing service search (Fase 4 + Fase 10 polish).
//
// Query params:
//   service_kind  (required) — filters by serviceKind
//   province      (optional) — filters by jurisdictionProvince
//   locality      (optional) — filters by jurisdictionLocality
//   fecha_desde   (optional, Fase 10) — only show slots >= YYYY-MM-DD
//   solo_gratis   (optional, Fase 10) — true = only show free (campaign) offerings
//
// If province/locality are absent, we try to default to the user's first
// owned pet's jurisdiction. If the user has no pets or the params are blank,
// the empty-state prompts them to provide a service kind first.
//
// For each approved offering we show up to 7 days of available slots
// (bookings_count < capacity AND starts_at >= now()).

import { and, eq, isNull, sql } from "drizzle-orm";
import Link from "next/link";

import { db, organizations, ownerships, pets, profiles, serviceOfferings, timeSlots } from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { SERVICE_KINDS, findServiceKind } from "@/lib/service-kinds";

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
  // Fase 10 filters
  const fechaDesde = params.fecha_desde?.trim() ?? "";
  const soloGratis = params.solo_gratis === "true";

  // Resolve province/locality: params → user's first pet's jurisdiction.
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

  // Render empty state when service_kind is missing.
  if (!serviceKind) {
    return (
      <main className="min-h-screen p-6 bg-white ">
        <div className="max-w-2xl mx-auto pt-10 space-y-8">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">Buscar turno</h1>
          <p className="text-sm text-gob-text-gray ">Indicá qué servicio buscás.</p>
          <ServiceKindSelector />
          <Link
            href="/mis-mascotas"
            className="inline-block text-sm text-gob-text-gray  underline underline-offset-4"
          >
            ← Volver a mis mascotas
          </Link>
        </div>
      </main>
    );
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  // Fase 10: fecha_desde — clamp the slot window start to the requested date.
  const slotWindowStart =
    fechaDesde && /^\d{4}-\d{2}-\d{2}$/.test(fechaDesde)
      ? new Date(Math.max(now.getTime(), new Date(fechaDesde).getTime()))
      : now;

  // Build offering filter conditions.
  const offeringConditions = [
    eq(serviceOfferings.serviceKind, serviceKind),
    eq(serviceOfferings.status, "approved"),
  ] as ReturnType<typeof eq>[];

  if (province) {
    offeringConditions.push(eq(serviceOfferings.jurisdictionProvince, province));
  }
  if (locality) {
    offeringConditions.push(eq(serviceOfferings.jurisdictionLocality, locality));
  }

  // Fase 10: solo_gratis filter — only free (campaign) offerings.
  if (soloGratis) {
    offeringConditions.push(isNull(serviceOfferings.priceArs));
  }

  // Fetch approved offerings matching the filter.
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

  // Fetch slots for the next 7 days for each offering.
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

  // Filter offerings to those that actually have available slots in window.
  const offeringsWithSlots = offeringRows.filter(
    (r) => (slotsByOffering.get(r.offering.id)?.length ?? 0) > 0,
  );

  const kindDef = findServiceKind(serviceKind);
  const locationLabel = locality ? locality : province ? province : null;

  return (
    <main className="min-h-screen p-6 bg-white ">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-gob-text ">
            {kindDef?.label ?? serviceKind}
          </h1>
          {locationLabel && <p className="text-sm text-gob-text-muted ">{locationLabel}</p>}
        </header>

        {/* Search form — allows refining filters */}
        <SearchFiltersForm
          currentServiceKind={serviceKind}
          currentProvince={province}
          currentLocality={locality}
          currentFechaDesde={fechaDesde}
          currentSoloGratis={soloGratis}
        />

        {offeringsWithSlots.length === 0 ? (
          <p className="text-sm text-gob-text-gray  py-6">
            {locationLabel
              ? `Sin servicios disponibles en ${locationLabel}. Probá otra localidad.`
              : "No hay turnos disponibles para este servicio en los próximos 7 días."}
          </p>
        ) : (
          <ul className="space-y-4">
            {offeringsWithSlots.map(({ offering, org, provider }) => {
              const slots = slotsByOffering.get(offering.id) ?? [];
              const providerLabel =
                offering.organizationId && org
                  ? org.displayName
                  : provider
                    ? `Dr/a. ${provider.displayName.split(" ")[0]}${provider.matriculaNumber ? ` · Mat. ${provider.matriculaNumber}` : ""}`
                    : "Profesional independiente";

              return (
                <li
                  key={offering.id}
                  className="border border-gob-border  rounded-xl overflow-hidden"
                >
                  <Link
                    href={`/turnos/buscar/${offering.publicToken}`}
                    className="block px-4 py-3 hover:bg-gob-surface-alt  transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="font-medium text-gob-text ">{offering.displayName}</p>
                        <p className="text-xs text-gob-text-muted ">
                          {providerLabel}
                          {offering.priceArs !== null
                            ? ` · $${Number(offering.priceArs).toLocaleString("es-AR")}`
                            : " · Gratuito"}
                          {` · ${offering.durationMinutes} min`}
                        </p>
                      </div>
                      {/* Fase 10: only show logo when tier_0_show_branding AND verified */}
                      {offering.organizationId &&
                        org?.avatarUrl &&
                        org.tier0ShowBranding &&
                        org.verified && (
                          <img
                            src={org.avatarUrl}
                            alt={org.displayName}
                            className="w-10 h-10 rounded-full object-cover shrink-0"
                          />
                        )}
                    </div>
                    <p className="mt-2 text-xs text-gob-success ">
                      {slots.length} turno{slots.length === 1 ? "" : "s"} disponible
                      {slots.length === 1 ? "" : "s"} en los próximos 7 días →
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <Link
          href="/mis-mascotas"
          className="inline-block text-sm text-gob-text-gray  underline underline-offset-4"
        >
          ← Volver a mis mascotas
        </Link>
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function ServiceKindSelector() {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gob-text-gray ">¿Qué servicio buscás?</p>
      <ul className="space-y-2">
        {SERVICE_KINDS.map((kind) => (
          <li key={kind.code}>
            <Link
              href={`/turnos/buscar?service_kind=${kind.code}`}
              className="block px-4 py-2.5 rounded-lg border border-gob-border  text-sm text-gob-text  hover:bg-gob-surface-alt  transition-colors"
            >
              {kind.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
