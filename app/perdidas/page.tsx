import Link from "next/link";

import { PROVINCES } from "@/lib/ar-provincias";
import {
  type LostListingFilters,
  type LostListingItem,
  buildSearchParams,
  lostTimeLabel,
  lostUrgencyFor,
  parseSearchParams,
} from "@/lib/lost-listing";
import { countAllLost, countLostInWindow, queryLostListing } from "@/lib/lost-listing-query";
import { petPhotoUrl } from "@/lib/storage";

import { LostFiltersBar } from "./LostFiltersBar";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

const PROVINCE_BY_NAME = new Map<string, (typeof PROVINCES)[number]>(
  PROVINCES.map((p) => [p.name as string, p]),
);

// Public landing — no auth required. Each search param maps to a query
// filter; the URL is the source of truth (D11). Server-rendered for
// SEO and shareability. Mirrors /adoptar.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { filters } = parseSearchParams(params);
  const bits: string[] = [];
  if (filters.species === "dog") bits.push("perros");
  else if (filters.species === "cat") bits.push("gatos");
  else bits.push("mascotas");
  bits.push("perdidas");
  if (filters.locality) bits.push(`en ${filters.locality}`);
  else if (filters.province) bits.push(`en ${filters.province}`);
  const title = `${bits.join(" ")} — MiMAR`;
  return {
    title,
    description:
      "Mascotas marcadas como perdidas por sus dueños en Argentina. Si reconocés alguna o la viste cerca, abrí su credencial y dejá tu contacto.",
  };
}

export default async function PerdidasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { filters, cursor } = parseSearchParams(params);

  // Fetch the catalog + the four KPI counts in parallel. The counts ignore
  // the user's current filters so the strip always reflects the universe,
  // not the narrowed view.
  const [{ items, nextCursor }, totalActive, last24h, last7d] = await Promise.all([
    queryLostListing(filters, cursor, 24),
    countAllLost(),
    countLostInWindow(ONE_DAY_MS),
    countLostInWindow(SEVEN_DAYS_MS),
  ]);

  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined);

  return (
    <main className="min-h-screen bg-white dark:bg-neutral-950">
      {/* Red urgency band — only when there is at least one critical pet to
          announce. Stays out of the way on a quiet day. */}
      {last24h > 0 && (
        <div className="bg-red-600 text-white">
          <div className="max-w-6xl mx-auto px-6 py-2.5 text-sm flex items-center gap-3 flex-wrap">
            <span className="font-semibold">
              {last24h} mascota{last24h === 1 ? "" : "s"} perdida{last24h === 1 ? "" : "s"} en las
              últimas 24 horas
            </span>
            <span className="opacity-80">·</span>
            <span className="opacity-90">
              Si encontraste alguna, dejá tu contacto desde su credencial — el dueño recibe la
              notificación al instante.
            </span>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
            Mascotas <span className="text-red-600 dark:text-red-500">perdidas</span> cerca tuyo
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-2xl">
            Animales marcados como perdidos por sus dueños. Si reconocés alguno o lo viste cerca,
            abrí su credencial y dejá tu contacto — el dueño recibe la notificación al instante.
          </p>
        </header>

        {/* KPI strip — universe counts, not filter-scoped */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Activas" value={totalActive} tone="red" />
          <KpiCard label="Críticas (24h)" value={last24h} tone="red" />
          <KpiCard label="Últimas 24h" value={last24h} tone="amber" />
          <KpiCard label="Últimos 7 días" value={last7d} tone="neutral" />
        </section>

        <LostFiltersBar filters={filters} />

        {/* Quick-filter chip row — server-rendered toggles. Each chip
            navigates to a URL that flips its own param while preserving
            the rest of the active filters. */}
        <QuickFilterRow filters={filters} />

        {items.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-6 py-10 text-center space-y-2">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              No encontramos mascotas perdidas con esos filtros.
            </p>
            {hasActiveFilters ? (
              <Link href="/perdidas" className="text-sm text-red-600 dark:text-red-400 underline">
                Limpiar filtros
              </Link>
            ) : (
              <p className="text-xs text-neutral-500">
                Buena noticia: no hay mascotas reportadas como perdidas en este momento.
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-neutral-500">
              {items.length} mascota{items.length === 1 ? "" : "s"} perdida
              {items.length === 1 ? "" : "s"}
              {nextCursor ? " (mostrando los más recientes)" : ""}
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <LostListingCard key={item.petId} item={item} />
              ))}
            </ul>

            {nextCursor && (
              <div className="flex justify-center pt-4">
                <Link
                  href={`/perdidas?${buildSearchParams(filters, nextCursor).toString()}`}
                  className="px-5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  Mostrar más
                </Link>
              </div>
            )}
          </>
        )}

        {/* Bottom CTA — owner-side entry point. Anchor to /mis-mascotas;
            anonymous users land on /login with the destination preserved
            by the existing auth flow. */}
        <aside className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 border-l-4 border-l-red-600 dark:border-l-red-500 p-5 flex flex-wrap items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 grid place-items-center text-xl shrink-0">
            🐾
          </div>
          <div className="flex-1 min-w-[200px] space-y-0.5">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              ¿Perdiste a tu mascota?
            </p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Marcala como perdida desde su libreta. Aparece en este listado al instante y su
              credencial pública pasa a modo emergencia.
            </p>
          </div>
          <Link
            href="/mis-mascotas"
            className="shrink-0 inline-flex items-center px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold"
          >
            Reportar pérdida →
          </Link>
        </aside>
      </div>
    </main>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "neutral";
}) {
  const valueClass =
    tone === "red"
      ? "text-red-600 dark:text-red-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : "text-neutral-700 dark:text-neutral-200";
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-500">
        {label}
      </p>
      <p className={`text-3xl font-semibold leading-tight ${valueClass}`}>{value}</p>
    </div>
  );
}

// Builds a URL that toggles one filter param while preserving the rest.
// Returns the empty-filter URL when toggling clears the only active filter.
function toggleFilterHref(
  filters: LostListingFilters,
  patch: Partial<LostListingFilters>,
  isActive: boolean,
): string {
  // If the chip is active, unset its keys; otherwise apply the patch.
  const next: LostListingFilters = { ...filters };
  if (isActive) {
    for (const key of Object.keys(patch)) {
      delete (next as Record<string, unknown>)[key];
    }
  } else {
    Object.assign(next, patch);
  }
  const qs = buildSearchParams(next, null).toString();
  return qs ? `/perdidas?${qs}` : "/perdidas";
}

function QuickFilterRow({ filters }: { filters: LostListingFilters }) {
  const chips: Array<{
    label: string;
    patch: Partial<LostListingFilters>;
    isActive: boolean;
  }> = [
    {
      label: "Visto hoy",
      patch: { visto: "today" },
      isActive: filters.visto === "today",
    },
    {
      label: "Esta semana",
      patch: { visto: "week" },
      isActive: filters.visto === "week",
    },
    {
      label: "Con microchip",
      patch: { hasMicrochip: true },
      isActive: filters.hasMicrochip === true,
    },
    {
      label: "Castrado/a",
      patch: { isSterilized: true },
      isActive: filters.isSterilized === true,
    },
    {
      label: "Crítica",
      patch: { criticality: "critical" },
      isActive: filters.criticality === "critical",
    },
  ];

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      <span className="text-neutral-500 dark:text-neutral-400 font-semibold mr-1">
        Filtros rápidos:
      </span>
      {chips.map((chip) => (
        <Link
          key={chip.label}
          href={toggleFilterHref(filters, chip.patch, chip.isActive)}
          aria-pressed={chip.isActive}
          className={
            chip.isActive
              ? "px-3 py-1 rounded-full border bg-red-600 border-red-600 text-white font-medium"
              : "px-3 py-1 rounded-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 hover:border-red-300 dark:hover:border-red-800"
          }
        >
          {chip.label}
        </Link>
      ))}
    </div>
  );
}

function LostListingCard({ item }: { item: LostListingItem }) {
  const photoUrl = petPhotoUrl(item.primaryPhotoStoragePath);
  const provinceLabel =
    (item.jurisdictionProvince && PROVINCE_BY_NAME.get(item.jurisdictionProvince)?.name) ||
    item.jurisdictionProvince ||
    null;

  const urgency = lostUrgencyFor(item.markedLostAt);
  const timeLabel = lostTimeLabel(item.markedLostAt);
  const lostFemale = item.sex === "female";
  const lostWord = lostFemale ? "Perdida" : "Perdido";
  const sterilizedLabel = lostFemale ? "Castrada" : "Castrado";

  // Urgency colour grading: red <24h, amber <7d, neutral otherwise. Tailwind
  // utility names match the gob-danger tone used elsewhere for lost mode.
  const urgencyChipClass =
    urgency === "critical"
      ? "bg-red-600 text-white"
      : urgency === "recent"
        ? "bg-amber-500 text-white"
        : "bg-neutral-600 text-white";

  return (
    <li className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-950 hover:shadow-lg hover:shadow-red-500/10 transition-shadow">
      <Link href={`/p/${item.petPublicToken}`} className="block">
        <div className="aspect-square bg-neutral-100 dark:bg-neutral-900 relative">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={item.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-5xl text-neutral-400 dark:text-neutral-600">
              {item.name.charAt(0).toUpperCase()}
            </div>
          )}
          {/* PERDIDA/PERDIDO pennant — top left */}
          <span className="absolute top-0 left-0 px-3 py-1 bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider">
            {lostWord}
          </span>
          {/* Time-since chip — top right */}
          <span
            className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${urgencyChipClass}`}
          >
            {timeLabel}
          </span>
        </div>

        <div className="p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {item.name}
            </h2>
            {provinceLabel && (
              <span className="text-xs text-neutral-500 dark:text-neutral-500">
                {item.jurisdictionLocality
                  ? `${item.jurisdictionLocality}, ${provinceLabel}`
                  : provinceLabel}
              </span>
            )}
          </div>

          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {[item.breed, item.color].filter(Boolean).join(" · ") || "Mascota"}
          </p>

          {/* Last-seen box — gated by privacy flag, only shown when present */}
          {item.lastSeenDescription && (
            <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30 px-3 py-2 space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-red-700 dark:text-red-400">
                Visto por última vez
              </p>
              <p className="text-xs text-neutral-900 dark:text-neutral-100 font-medium line-clamp-2">
                {item.lastSeenDescription}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-900 text-[11px] text-neutral-500 dark:text-neutral-500">
            {item.microchipId && (
              <span className="text-sky-700 dark:text-sky-400 font-medium">Con chip</span>
            )}
            {item.isSterilized && (
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                {sterilizedLabel}
              </span>
            )}
            <span className="flex-1" />
            <span className="text-red-600 dark:text-red-400 font-semibold">Ver credencial →</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
