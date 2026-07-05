/**
 * loading.tsx — skeleton for /p/[publicToken] (public pet profile / credential).
 *
 * High-visibility mobile surface — marked "must be fast" (Track D).
 * Owner shares this URL from stickers, QR codes, collars, and lost-pet posts.
 * Lighthouse mobile performance budget applies to this route.
 */

import { LnCardSkeleton } from "@/components/ui/LnCardSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

export default function PublicPetLoading() {
  return (
    <output
      aria-busy="true"
      aria-label="Cargando…"
      className="mx-auto max-w-xl px-5 py-7 pb-12 block"
    >
      <span className="sr-only">Cargando…</span>

      {/* Pet hero — photo + name + species */}
      <div className="flex flex-col items-center gap-3.5 mb-7">
        <Skeleton w="112px" h="112px" radius="50%" />
        <Skeleton w="48%" h="26px" radius="4px" />
        <Skeleton w="32%" h="14px" radius="3px" />
      </div>

      {/* Credential / info card placeholders */}
      <div className="flex flex-col gap-5">
        <LnCardSkeleton />
        <LnCardSkeleton />
      </div>
    </output>
  );
}
