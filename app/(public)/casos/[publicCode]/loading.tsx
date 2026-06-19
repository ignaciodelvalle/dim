/**
 * loading.tsx — skeleton for /casos/[publicCode] (public case detail).
 */

import { LnCardSkeleton } from "@/components/ui/LnCardSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

export default function CasoLoading() {
  return (
    <output
      aria-busy="true"
      aria-label="Cargando…"
      className="mx-auto max-w-3xl px-[24px] py-[28px] pb-[48px] block"
    >
      <span className="sr-only">Cargando…</span>

      {/* Case header placeholder */}
      <div className="flex flex-col gap-[10px] mb-[24px]">
        <div className="flex items-center gap-[10px]">
          <Skeleton w="90px" h="22px" radius="4px" />
          <Skeleton w="70px" h="22px" radius="9999px" />
        </div>
        <Skeleton w="65%" h="20px" radius="4px" />
      </div>

      <div className="flex flex-col gap-[20px]">
        <LnCardSkeleton />
        <LnCardSkeleton />
      </div>
    </output>
  );
}
