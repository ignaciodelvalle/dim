import Link from "next/link";

import { AdoptionListingCard } from "@/components/AdoptionListingCard";
import { buildSearchParams, parseSearchParams } from "@/lib/adoption-listing";
import { queryAdoptionListing } from "@/src/modules/adoption/infrastructure/adoption-listing-read";

import { AdoptionFiltersBar } from "./AdoptionFiltersBar";

// Public landing — no auth required. Each search param maps to a query
// filter; the URL is the source of truth (D11). Server-rendered for
// SEO and shareability.
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
  if (filters.locality) bits.push(`en ${filters.locality}`);
  else if (filters.province) bits.push(`en ${filters.province}`);
  const title = `${bits.join(" ")} en adopción — MiMAR`;
  return {
    title,
    description:
      "Encontrá a tu próxima mascota en MiMAR. Refugios verificados publican animales listos para ser adoptados.",
  };
}

export default async function AdoptarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { filters, cursor } = parseSearchParams(params);
  const { items, nextCursor } = await queryAdoptionListing(filters, cursor, 24);

  const hasActiveFilters = Object.values(filters).some((v) => v !== undefined);

  return (
    <main className="bg-[var(--color-ln-paper)]">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        {/* Hero heading */}
        <header className="space-y-2 max-w-[720px]">
          <h1 className="m-0 font-[var(--font-ln-serif)] text-[42px] font-semibold leading-[1.05] tracking-[-0.025em] text-[var(--color-ln-ink)]">
            Adoptar en <span className="text-[var(--color-ln-azul)]">MiMAR</span>
          </h1>
          <p className="text-[16px] leading-[1.55] text-[var(--color-ln-ink-2)]">
            Mascotas publicadas por refugios verificados en Argentina. Si ves alguna que te resuene,
            postulate y el refugio te contacta.
          </p>
        </header>

        <AdoptionFiltersBar filters={filters} />

        {items.length === 0 ? (
          <div className="rounded-[5px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-6 py-10 text-center space-y-2">
            <p className="text-sm font-medium text-[var(--color-ln-ink)]">
              No encontramos mascotas con esos filtros.
            </p>
            {hasActiveFilters ? (
              <Link href="/adoptar" className="text-sm text-[var(--color-ln-azul)] underline">
                Limpiar filtros
              </Link>
            ) : (
              <p className="text-xs text-[var(--color-ln-mute)]">
                Volvé en unos días — los refugios suben mascotas seguido.
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="font-[var(--font-ln-mono)] text-[12px] text-[var(--color-ln-mute)]">
              <strong className="text-[var(--color-ln-ink)] font-semibold">
                {items.length} mascota{items.length === 1 ? "" : "s"}
              </strong>
              {nextCursor ? " publicadas · mostrando las más recientes" : " publicadas"}
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[18px]">
              {items.map((item) => (
                <AdoptionListingCard key={item.petId} item={item} />
              ))}
            </ul>

            {nextCursor && (
              <div className="flex justify-center pt-4">
                <Link
                  href={`/adoptar?${buildSearchParams(filters, nextCursor).toString()}`}
                  className="rounded-[4px] border border-[var(--color-ln-line-strong)] bg-[var(--color-ln-card)] px-5 py-2.5 text-sm font-semibold text-[var(--color-ln-ink)] hover:bg-[var(--color-ln-stripe)]"
                >
                  Mostrar más
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
