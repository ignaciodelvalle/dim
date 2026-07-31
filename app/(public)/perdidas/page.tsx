import Link from "next/link";

import {
  type LostListingFilters,
  type LostListingItem,
  buildSearchParams,
  lostTimeLabel,
  lostUrgencyFor,
  parseSearchParams,
} from "@/lib/infra/lost-listing";
import { petPhotoUrl } from "@/lib/infra/storage";
import { PROVINCES } from "@/lib/reference/ar-provincias";
import { formatCount, lostLabel, pluralizeEs, sterilizedLabel } from "@/lib/utils/format";
import {
  countAllLost,
  countLostInWindow,
  queryLostListing,
} from "@/src/modules/lost/infrastructure/lost-listing-read";

import { LostFiltersBar } from "./LostFiltersBar";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

const PROVINCE_BY_NAME = new Map<string, (typeof PROVINCES)[number]>(
  PROVINCES.map((p) => [p.name as string, p]),
);

// Public landing — no auth required. Each search param maps to a query
// filter; the URL is the source of truth (D11). Server-rendered for
// SEO and shareability. Mirrors /adoptar.
//
// Cache policy: ALWAYS LIVE. force-dynamic + `Cache-Control: no-store` (stamped
// in middleware — see lib/infra/public-cache-policy.ts). The listing and its
// KPI counts reflect live lost/found state; a recovered pet must drop off the
// grid promptly, so this route is never held by a shared/CDN cache.
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
  const title = `${bits.join(" ")} — miMAR`;
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

  // Fetch the catalog + the KPI counts in parallel. The counts ignore
  // the user's current filters so the strip always reflects the universe.
  const [{ items, nextCursor }, totalActive, last24h, last7d] = await Promise.all([
    queryLostListing(filters, cursor, 24),
    countAllLost(),
    countLostInWindow(ONE_DAY_MS),
    countLostInWindow(SEVEN_DAYS_MS),
  ]);

  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined);

  return (
    <main className="bg-[var(--color-ln-paper)]">
      {/* Red urgency band — only rendered when there is at least one critical
          pet to announce. Stays out of the way on a quiet day. */}
      {last24h > 0 && (
        <div className="bg-[var(--color-ln-err)]">
          <div className="max-w-6xl mx-auto px-6 py-2.5 text-sm flex items-center gap-3 flex-wrap text-white">
            <span className="font-semibold">
              {`${last24h} ${pluralizeEs(last24h, "mascota")} ${pluralizeEs(
                last24h,
                "perdida",
              )} en las últimas 24 horas`}
            </span>
            <span className="opacity-80">·</span>
            <span className="opacity-90">
              Si encontraste alguna, dejá tu contacto desde su credencial — el dueño recibe la
              notificación al instante.
            </span>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        {/* Hero heading */}
        <header className="space-y-2 max-w-[720px]">
          <h1 className="m-0 font-[var(--font-ln-serif)] text-5xl font-semibold leading-[1.05] tracking-[-0.025em] text-[var(--color-ln-ink)]">
            Mascotas <span className="text-[var(--color-ln-err)]">perdidas</span>
          </h1>
          <p className="text-base leading-[1.55] text-[var(--color-ln-ink-2)]">
            Animales marcados como perdidos por sus dueños. Si reconocés alguno o lo viste cerca,
            abrí su credencial y dejá tu contacto — el dueño recibe la notificación al instante.
          </p>
        </header>

        {/* KPI strip — universe counts, not filter-scoped. The two recency tiles
            measure NEW reports in a window, not the active total; labelling them
            "Nuevas en …" stops "0 / 0" from reading as a contradiction next to
            "Activas ahora" when the active pool is older than the window
            (Cowork B5). */}
        <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCard label="Activas ahora" value={totalActive} tone="err" />
          <KpiCard label="Nuevas en 24h" value={last24h} tone="warn" />
          <KpiCard label="Nuevas en 7 días" value={last7d} tone="mute" />
        </section>

        <LostFiltersBar filters={filters} />

        {/* Quick-filter chip row — server-rendered toggles. Each chip
            navigates to a URL that flips its own param while preserving
            the rest of the active filters. */}
        <QuickFilterRow filters={filters} />

        {items.length === 0 ? (
          <div className="rounded-[5px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-6 py-10 text-center space-y-2">
            <p className="text-sm font-medium text-[var(--color-ln-ink)]">
              No encontramos mascotas perdidas con esos filtros.
            </p>
            {hasActiveFilters ? (
              <Link href="/perdidas" className="text-sm text-[var(--color-ln-err)] underline">
                Limpiar filtros
              </Link>
            ) : (
              <p className="text-xs text-[var(--color-ln-mute)]">
                Buena noticia: no hay mascotas reportadas como perdidas en este momento.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Count line. The grid is a filtered, paginated PAGE — it must not
                read as a total that contradicts the "Activas ahora" KPI (a page
                of 24 next to "107 activas" looked like a discrepancy; citizen
                validation 2026-07-06). When there are more pages we lead with
                "Mostrando …" and, on an unfiltered view, tie it to the universe
                total so 24 and 107 are visibly the same scope (page vs total),
                not two conflicting counts. */}
            <p className="font-[var(--font-ln-mono)] text-sm text-[var(--color-ln-mute)]">
              <strong className="text-[var(--color-ln-ink)] font-semibold">
                {nextCursor
                  ? `Mostrando las ${items.length} más recientes`
                  : `${items.length} ${pluralizeEs(items.length, "mascota")}`}
              </strong>
              {nextCursor && !hasActiveFilters ? ` de ${totalActive} activas en total` : ""}
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[18px]">
              {items.map((item) => (
                <LostListingCard key={item.petId} item={item} />
              ))}
            </ul>

            {nextCursor && (
              <div className="flex justify-center pt-4">
                <Link
                  href={`/perdidas?${buildSearchParams(filters, nextCursor).toString()}`}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-5 py-2.5 text-sm font-semibold text-[var(--color-ln-ink)] hover:bg-[var(--color-ln-stripe)]"
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
        <aside className="rounded-[5px] border border-[var(--color-ln-line)] border-l-[3px] border-l-[var(--color-ln-err)] bg-[var(--color-ln-card)] p-5 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px] space-y-0.5">
            <p className="text-sm font-semibold text-[var(--color-ln-ink)]">
              ¿Perdiste a tu mascota?
            </p>
            <p className="text-xs text-[var(--color-ln-ink-2)]">
              Marcala como perdida desde su libreta. Aparece en este listado al instante y su
              credencial pública pasa a modo emergencia.
            </p>
          </div>
          <Link
            href="/mis-mascotas"
            className="shrink-0 inline-flex items-center rounded-[var(--radius-sm)] bg-[var(--color-ln-err)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
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
  tone: "err" | "warn" | "mute";
}) {
  const valueClass =
    tone === "err"
      ? "text-[var(--color-ln-err)]"
      : tone === "warn"
        ? "text-[var(--color-ln-warn)]"
        : "text-[var(--color-ln-mute)]";
  return (
    <div className="rounded-[5px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-4 py-3">
      <p className="font-[var(--font-ln-mono)] text-xs uppercase tracking-[0.1em] font-semibold text-[var(--color-ln-mute)] mb-1">
        {label}
      </p>
      <p className={`text-3xl font-semibold leading-tight tabular-nums ${valueClass}`}>
        {formatCount(value)}
      </p>
    </div>
  );
}

// Builds a URL that toggles one filter param while preserving the rest.
function toggleFilterHref(
  filters: LostListingFilters,
  patch: Partial<LostListingFilters>,
  isActive: boolean,
): string {
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
      <span className="font-[var(--font-ln-mono)] text-xs uppercase tracking-[0.1em] font-semibold text-[var(--color-ln-mute)] mr-1">
        Filtros rápidos:
      </span>
      {chips.map((chip) => (
        <Link
          key={chip.label}
          href={toggleFilterHref(filters, chip.patch, chip.isActive)}
          aria-pressed={chip.isActive}
          className={
            chip.isActive
              ? "px-3 py-1 rounded-full border bg-[var(--color-ln-err)] border-[var(--color-ln-err)] text-white font-medium"
              : "px-3 py-1 rounded-full border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] text-[var(--color-ln-ink-2)] hover:border-[var(--color-ln-mute)]"
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
  const lostWord = lostLabel(item.sex);
  // Shared so all four surfaces agree, and so an unknown-sex pet reads
  // "Castrado/a" instead of being silently called male.
  const sterilizedText = sterilizedLabel(item.sex);

  // Urgency colour grading uses LN semantic tokens only:
  //   critical  → ln-err   (bright red)
  //   recent    → ln-warn  (amber)
  //   older     → ln-mute  (neutral)
  const urgencyChipClass =
    urgency === "critical"
      ? "bg-[var(--color-ln-err)] text-white"
      : urgency === "recent"
        ? "bg-[var(--color-ln-warn)] text-white"
        : "bg-[var(--color-ln-mute)] text-white";

  return (
    <li className="rounded-xl border border-[var(--color-ln-line)] overflow-hidden bg-[var(--color-ln-card)] hover:shadow-lg transition-shadow">
      <Link href={`/p/${item.petPublicToken}`} className="block">
        <div className="aspect-square bg-[var(--color-ln-stripe)] relative">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={item.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-5xl text-[var(--color-ln-mute)]">
              {item.name.charAt(0).toUpperCase()}
            </div>
          )}
          {/* PERDIDA/PERDIDO pennant — top left */}
          <span className="absolute top-0 left-0 px-3 py-1 bg-[var(--color-ln-err)] text-white text-xs font-bold uppercase tracking-wider">
            {lostWord}
          </span>
          {/* Time-since chip — top right */}
          <span
            className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${urgencyChipClass}`}
          >
            {timeLabel}
          </span>
        </div>

        <div className="p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--color-ln-ink)]">{item.name}</h2>
            {provinceLabel && (
              <span className="text-xs text-[var(--color-ln-mute)]">
                {item.jurisdictionLocality
                  ? `${item.jurisdictionLocality}, ${provinceLabel}`
                  : provinceLabel}
              </span>
            )}
          </div>

          <p className="text-xs text-[var(--color-ln-ink-2)]">
            {[item.breed, item.color].filter(Boolean).join(" · ") || "Mascota"}
          </p>

          {/* Last-seen box — gated by the owner's privacy flag. When there is no
              disclosed sighting location we say so EXPLICITLY rather than omit the
              line: on a lost-pet board an absent last-seen is decision-relevant
              (the searcher shouldn't assume a location that isn't there). */}
          {item.lastSeenDescription ? (
            <div className="rounded-[var(--radius-sm)] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-stripe)] px-3 py-2 space-y-0.5">
              <p className="font-[var(--font-ln-mono)] text-xs uppercase tracking-[0.1em] font-semibold text-[var(--color-ln-seal)]">
                Visto por última vez
              </p>
              <p className="text-xs text-[var(--color-ln-ink)] font-medium line-clamp-2">
                {item.lastSeenDescription}
              </p>
            </div>
          ) : (
            <p className="text-sm italic text-[var(--color-ln-mute)]">
              Sin ubicación de avistaje registrada
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-ln-line)] text-sm text-[var(--color-ln-mute)]">
            {item.microchipId && (
              <span className="text-[var(--color-ln-celeste)] font-medium">Con chip</span>
            )}
            {item.isSterilized && (
              <span className="text-[var(--color-ln-ok)] font-medium">{sterilizedText}</span>
            )}
            <span className="flex-1" />
            <span className="text-[var(--color-ln-err)] font-semibold">Ver credencial →</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
