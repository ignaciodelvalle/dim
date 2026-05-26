import Link from "next/link";

import {
  ageBucketLabel,
  buildSearchParams,
  energyLabel,
  parseSearchParams,
  sizeLabel,
} from "@/lib/adoption-listing";
import { queryAdoptionListing } from "@/lib/adoption-listing-query";
import { PROVINCES } from "@/lib/ar-provincias";
import { petPhotoUrl } from "@/lib/storage";

const PROVINCE_BY_NAME = new Map<string, (typeof PROVINCES)[number]>(
  PROVINCES.map((p) => [p.name as string, p]),
);

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
                <PetListingCard key={item.petId} item={item} />
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

type CardItem = Awaited<ReturnType<typeof queryAdoptionListing>>["items"][number];

function PetListingCard({ item }: { item: CardItem }) {
  const photoUrl = petPhotoUrl(item.primaryPhotoStoragePath);
  const provinceLabel =
    (item.jurisdictionProvince && PROVINCE_BY_NAME.get(item.jurisdictionProvince)?.name) ||
    item.jurisdictionProvince ||
    null;

  const facts: string[] = [];
  if (item.adoptionAgeBucket) facts.push(ageBucketLabel(item.adoptionAgeBucket, item.sex));
  if (item.adoptionSizeEstimate) facts.push(sizeLabel(item.adoptionSizeEstimate));
  if (item.adoptionEnergyLevel) facts.push(energyLabel(item.adoptionEnergyLevel));

  const sterilizedLabel = item.sex === "female" ? "Castrada" : "Castrado";

  return (
    <li className="rounded-xl border border-gob-border overflow-hidden bg-white hover:shadow-lg transition-shadow">
      <Link href={`/adoptar/${item.petPublicToken}`} className="block">
        <div className="aspect-square bg-gob-surface-alt relative">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={item.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-5xl text-gob-text-muted">
              {item.name.charAt(0).toUpperCase()}
            </div>
          )}
          {(item.isSterilized || item.microchipId) && (
            <div className="absolute top-2 left-2 flex flex-wrap gap-1">
              {item.isSterilized && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                  {sterilizedLabel}
                </span>
              )}
              {item.microchipId && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-600 text-white">
                  Con chip
                </span>
              )}
            </div>
          )}
        </div>
        <div className="p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-gob-text">{item.name}</h2>
            {provinceLabel && (
              <span className="text-xs text-gob-text-muted">
                {item.jurisdictionLocality
                  ? `${item.jurisdictionLocality}, ${provinceLabel}`
                  : provinceLabel}
              </span>
            )}
          </div>
          {facts.length > 0 && <p className="text-xs text-gob-text-gray">{facts.join(" · ")}</p>}
          {item.adoptionStory && (
            <p className="text-xs text-gob-text-gray line-clamp-3">{item.adoptionStory}</p>
          )}
          <p className="text-[11px] text-gob-text-muted pt-1 border-t border-gob-surface-alt">
            Publica:{" "}
            <Link
              href={`/refugios/${item.orgPublicToken}`}
              className="underline hover:text-gob-text"
            >
              {item.orgDisplayName}
            </Link>
          </p>
        </div>
      </Link>
    </li>
  );
}
