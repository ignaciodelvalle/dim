// /turnos/buscar — Owner-facing service search (Fase 4).
//
// Query params:
//   service_kind  (required) — filters by serviceKind
//   province      (optional) — filters by jurisdictionProvince
//   locality      (optional) — filters by jurisdictionLocality
//
// If province/locality are absent, we try to default to the user's first
// owned pet's jurisdiction. If the user has no pets or the params are blank,
// the empty-state prompts them to provide a service kind first.
//
// For each approved offering we show up to 7 days of available slots
// (bookings_count < capacity AND starts_at >= now()).

import { and, eq, sql } from "drizzle-orm";
import Link from "next/link";

import {
  db,
  organizations,
  ownerships,
  pets,
  profiles,
  serviceOfferings,
  timeSlots,
} from "@/db";
import { requireUserOrRedirect } from "@/lib/auth-guards";
import { findServiceKind, SERVICE_KINDS } from "@/lib/service-kinds";

export default async function BuscarTurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ service_kind?: string; province?: string; locality?: string }>;
}) {
  const { user } = await requireUserOrRedirect();
  const params = await searchParams;

  const serviceKind = params.service_kind?.trim() ?? "";

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
      .where(
        sql`${ownerships.ownerUserId} = ${user.id} AND ${ownerships.endedAt} IS NULL`,
      )
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
      <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
        <div className="max-w-2xl mx-auto pt-10 space-y-8">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Buscar turno
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Indicá qué servicio buscás.
          </p>
          <ServiceKindSelector />
          <Link
            href="/mis-mascotas"
            className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4"
          >
            ← Volver a mis mascotas
          </Link>
        </div>
      </main>
    );
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Build offering filter conditions.
  const offeringConditions = [
    eq(serviceOfferings.serviceKind, serviceKind),
    eq(serviceOfferings.status, "approved"),
  ] as ReturnType<typeof eq>[];

  if (province) {
    offeringConditions.push(
      eq(serviceOfferings.jurisdictionProvince, province),
    );
  }
  if (locality) {
    offeringConditions.push(
      eq(serviceOfferings.jurisdictionLocality, locality),
    );
  }

  // Fetch approved offerings matching the filter.
  const offeringRows = await db
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
            AND ${timeSlots.startsAt} >= ${now}
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
  const locationLabel = locality
    ? locality
    : province
      ? province
      : null;

  return (
    <main className="min-h-screen p-6 bg-white dark:bg-neutral-950">
      <div className="max-w-2xl mx-auto pt-10 space-y-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            {kindDef?.label ?? serviceKind}
          </h1>
          {locationLabel && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{locationLabel}</p>
          )}
        </header>

        {/* Search form — allows refining filters */}
        <SearchFilters
          currentServiceKind={serviceKind}
          currentProvince={province}
          currentLocality={locality}
        />

        {offeringsWithSlots.length === 0 ? (
          <p className="text-sm text-neutral-600 dark:text-neutral-400 py-6">
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
                  className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden"
                >
                  <Link
                    href={`/turnos/buscar/${offering.publicToken}`}
                    className="block px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="font-medium text-neutral-900 dark:text-neutral-50">
                          {offering.displayName}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {providerLabel}
                          {offering.priceArs !== null
                            ? ` · $${Number(offering.priceArs).toLocaleString("es-AR")}`
                            : " · Gratuito"}
                          {` · ${offering.durationMinutes} min`}
                        </p>
                      </div>
                      {offering.organizationId && org?.avatarUrl && (
                        <img
                          src={org.avatarUrl}
                          alt={org.displayName}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                      )}
                    </div>
                    <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
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
          className="inline-block text-sm text-neutral-600 dark:text-neutral-400 underline underline-offset-4"
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
      <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        ¿Qué servicio buscás?
      </p>
      <ul className="space-y-2">
        {SERVICE_KINDS.map((kind) => (
          <li key={kind.code}>
            <Link
              href={`/turnos/buscar?service_kind=${kind.code}`}
              className="block px-4 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 text-sm text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
            >
              {kind.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SearchFilters({
  currentServiceKind,
  currentProvince,
  currentLocality,
}: {
  currentServiceKind: string;
  currentProvince: string;
  currentLocality: string;
}) {
  const kinds = SERVICE_KINDS;
  return (
    <form method="GET" className="flex flex-wrap gap-2 items-end">
      <div className="space-y-1">
        <label
          htmlFor="service_kind_sel"
          className="text-xs text-neutral-500 dark:text-neutral-400"
        >
          Servicio
        </label>
        <select
          id="service_kind_sel"
          name="service_kind"
          defaultValue={currentServiceKind}
          className="text-sm border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50"
        >
          {kinds.map((k) => (
            <option key={k.code} value={k.code}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="locality_inp" className="text-xs text-neutral-500 dark:text-neutral-400">
          Localidad
        </label>
        <input
          id="locality_inp"
          name="locality"
          type="text"
          defaultValue={currentLocality}
          placeholder="Ej: Palermo"
          className="text-sm border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 w-40"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="province_inp" className="text-xs text-neutral-500 dark:text-neutral-400">
          Provincia
        </label>
        <input
          id="province_inp"
          name="province"
          type="text"
          defaultValue={currentProvince}
          placeholder="Ej: Buenos Aires"
          className="text-sm border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 w-40"
        />
      </div>
      <button
        type="submit"
        className="text-sm px-4 py-1.5 rounded bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
      >
        Buscar
      </button>
    </form>
  );
}
