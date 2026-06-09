import Link from "next/link";

import { ageBucketLabel, energyLabel, sizeLabel } from "@/lib/adoption-listing";
import { PROVINCES } from "@/lib/ar-provincias";
import { petPhotoUrl } from "@/lib/storage";
import type { queryAdoptionListing } from "@/src/modules/adoption/infrastructure/adoption-listing-read";

// Single source of truth for the adoption-listing pet card. Consumed by:
//   - /adoptar (public landing — full grid)
//   - /refugios/[orgToken] (scoped to one org)
//
// Both surfaces previously inlined nearly-identical markup. Extracted as
// part of handoff P2-1 to (a) avoid drift and (b) let future tweaks
// (price chip, dangerous-breed badge, etc.) ship in one place.
//
// `variant` controls density. The default tracks the existing /adoptar
// look; `compact` drops the secondary subtitle line so the card fits in
// the 12-pet refugio panel without towering over the layout.

const PROVINCE_BY_NAME = new Map<string, (typeof PROVINCES)[number]>(
  PROVINCES.map((p) => [p.name as string, p]),
);

export type AdoptionListingItem = Awaited<ReturnType<typeof queryAdoptionListing>>["items"][number];

export function AdoptionListingCard({
  item,
  variant = "default",
  showPublisher = true,
}: {
  item: AdoptionListingItem;
  variant?: "default" | "compact";
  /** When false, the "Publica: ..." footer is hidden. Used by the org
   * profile where the publisher is implied by the page itself. */
  showPublisher?: boolean;
}) {
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
    <li className="rounded-xl border border-ln-line overflow-hidden bg-ln-card hover:shadow-lg transition-shadow">
      <Link href={`/adoptar/${item.petPublicToken}`} className="block">
        <div className="aspect-square bg-ln-stripe relative">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={item.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-5xl text-ln-mute">
              {item.name.charAt(0).toUpperCase()}
            </div>
          )}
          {(item.isSterilized || item.microchipId) && (
            <div className="absolute top-2 left-2 flex flex-wrap gap-1">
              {item.isSterilized && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ln-ok text-white">
                  {sterilizedLabel}
                </span>
              )}
              {item.microchipId && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ln-celeste text-white">
                  Con chip
                </span>
              )}
            </div>
          )}
        </div>
        <div className="p-4 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-ln-ink">{item.name}</h2>
            {provinceLabel && (
              <span className="text-xs text-ln-mute">
                {item.jurisdictionLocality
                  ? `${item.jurisdictionLocality}, ${provinceLabel}`
                  : provinceLabel}
              </span>
            )}
          </div>
          {facts.length > 0 && <p className="text-xs text-ln-ink-2">{facts.join(" · ")}</p>}
          {variant === "default" && item.adoptionStory && (
            <p className="text-xs text-ln-ink-2 line-clamp-3">{item.adoptionStory}</p>
          )}
          {showPublisher && (
            <p className="text-[11px] text-ln-mute pt-1 border-t border-ln-stripe">
              Publica:{" "}
              <Link
                href={`/refugios/${item.orgPublicToken}`}
                className="underline hover:text-ln-ink"
              >
                {item.orgDisplayName}
              </Link>
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
