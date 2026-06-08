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
    <main className="bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight text-gob-text">Adoptar en MiMAR</h1>
          <p className="text-sm text-gob-text-gray">
            Mascotas publicadas por refugios verificados en Argentina. Si ves alguna que te resuene,
            postulate y el refugio te contacta.
          </p>
        </header>

        <AdoptionFiltersBar filters={filters} />

        {items.length === 0 ? (
          <div className="rounded-lg border border-gob-border px-6 py-10 text-center space-y-2">
            <p className="text-sm font-medium text-gob-text">
              No encontramos mascotas con esos filtros.
            </p>
            {hasActiveFilters ? (
              <Link href="/adoptar" className="text-sm text-gob-success underline">
                Limpiar filtros
              </Link>
            ) : (
              <p className="text-xs text-gob-text-muted">
                Volvé en unos días — los refugios suben mascotas seguido.
              </p>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-gob-text-muted">
              {items.length} mascota{items.length === 1 ? "" : "s"}
              {nextCursor ? " (mostrando los más recientes)" : ""}
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <AdoptionListingCard key={item.petId} item={item} />
              ))}
            </ul>

            {nextCursor && (
              <div className="flex justify-center pt-4">
                <Link
                  href={`/adoptar?${buildSearchParams(filters, nextCursor).toString()}`}
                  className="px-5 py-2.5 rounded-lg border border-gob-border-strong text-sm font-medium hover:bg-gob-surface-alt"
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
