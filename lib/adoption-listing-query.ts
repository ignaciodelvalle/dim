// Backward-compatibility re-export stub.
//
// The implementation has moved to src/modules/adoption/infrastructure/adoption-listing-read.ts
// as part of the hexagonal-lite-foundation refactor (WU-2).
//
// This stub will be removed in WU-4 (thin actions + strangler wiring) once
// all import sites have been updated to point to the new module path.
//
// DO NOT add new imports of this file — use @/src/modules/adoption/infrastructure/adoption-listing-read
// instead.

export { queryAdoptionListing } from "@/src/modules/adoption/infrastructure/adoption-listing-read";
