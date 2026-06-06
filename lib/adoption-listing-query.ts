// Backward-compatibility re-export stub.
//
// The implementation has moved to src/modules/adoption/infrastructure/adoption-listing-read.ts
// as part of the hexagonal-lite-foundation refactor (WU-2).
//
// All 6 import sites now use this stub which re-exports from the new module path.
// This stub is intentionally kept: the 6 consuming files (page.tsx, sitemap.ts,
// AdoptionPanel.tsx, AdoptionListingCard.tsx, adoption-listing.test.ts) are
// outside the adoption module boundary and will be migrated in a follow-up.
//
// DO NOT add new imports of this file — use @/src/modules/adoption/infrastructure/adoption-listing-read
// instead.

export { queryAdoptionListing } from "@/src/modules/adoption/infrastructure/adoption-listing-read";
