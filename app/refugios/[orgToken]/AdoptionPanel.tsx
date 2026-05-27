import Link from "next/link";

import { AdoptionListingCard } from "@/components/AdoptionListingCard";
import { EmptyState } from "@/components/poncho/EmptyState";
import { Panel, PanelBody, PanelHeader } from "@/components/poncho/Panel";
import type { queryAdoptionListing } from "@/lib/adoption-listing-query";

// "Mascotas en adopción" panel (handoff P2-4).
//
// Wraps the AdoptionListingCard grid inside a Panel. Renders:
//   - header with count + "Ver todas →" link when nextCursor present
//   - 1/2/3-column grid of AdoptionListingCard (showPublisher=false)
//   - EmptyState fallback when items.length === 0
//
// Variant=compact on the cards when items.length >= 12 (per handoff)
// keeps the card density readable inside the panel.

type ListingItems = Awaited<ReturnType<typeof queryAdoptionListing>>["items"];

interface Props {
  orgToken: string;
  displayName: string;
  items: ListingItems;
  hasMore: boolean;
}

export function AdoptionPanel({ orgToken, displayName, items, hasMore }: Props) {
  const cardVariant = items.length >= 12 ? "compact" : "default";

  return (
    <Panel aria-labelledby="adopcion-title">
      <PanelHeader
        title={
          <span id="adopcion-title">
            Mascotas en adopción
            {items.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gob-text-muted">· {items.length}</span>
            )}
          </span>
        }
        actions={
          hasMore && (
            <Link href={`/adoptar?org=${orgToken}`} className="text-sm text-gob-azul-link">
              Ver todas →
            </Link>
          )
        }
      />
      <PanelBody>
        {items.length === 0 ? (
          <EmptyState
            title={`${displayName} no tiene mascotas publicadas en adopción en este momento.`}
            description="Cuando publiquen una, va a aparecer acá."
            action={
              <Link
                href="/adoptar"
                className="inline-flex items-center justify-center rounded-lg border border-gob-border bg-white px-4 py-2 text-sm font-medium text-gob-text hover:bg-gob-surface-alt"
              >
                Ver mascotas de otros refugios
              </Link>
            }
          />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.slice(0, 12).map((item) => (
              <AdoptionListingCard
                key={item.petId}
                item={item}
                variant={cardVariant}
                showPublisher={false}
              />
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
