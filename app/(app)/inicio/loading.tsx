/**
 * loading.tsx — full-segment navigation skeleton for /inicio (owner home).
 *
 * Heavy fetch: pets, reminders, appointments, open workflows, profile.
 * Shell renders immediately outside this boundary.
 */

import { LnCardSkeleton } from "@/components/ui/LnCardSkeleton";
import { Skeleton } from "@/components/ui/Skeleton";

const SIDEBAR_KEYS = ["x", "y"] as const;

export default function InicioLoading() {
  return (
    <output
      aria-busy="true"
      aria-label="Cargando…"
      className="mx-auto max-w-5xl px-[32px] py-[28px] pb-[48px] md:px-[32px] block"
    >
      <span className="sr-only">Cargando…</span>

      {/* Greeting placeholder */}
      <div className="mb-[24px] flex items-start justify-between gap-4">
        <div className="flex flex-col gap-[10px]">
          <Skeleton w="280px" h="34px" radius="4px" />
          <Skeleton w="200px" h="14px" radius="3px" />
        </div>
        <Skeleton w="80px" h="36px" radius="4px" />
      </div>

      {/* Capture block placeholder */}
      <div className="mb-[24px] overflow-hidden rounded-[4px] border border-[var(--color-ln-line)] p-[18px]">
        <Skeleton w="50%" h="17px" radius="3px" className="mb-[8px]" />
        <Skeleton w="75%" h="40px" radius="4px" />
      </div>

      {/* 2-col grid placeholder — left: Estado sanitario strip, right: sidebar cards */}
      <div className="grid gap-[24px] lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-[12px]">
          <LnCardSkeleton />
        </div>
        <div className="flex flex-col gap-[20px]">
          {SIDEBAR_KEYS.map((k) => (
            <LnCardSkeleton key={k} />
          ))}
        </div>
      </div>
    </output>
  );
}
