/**
 * loading.tsx — full-segment navigation skeleton for /cuenta.
 *
 * Heavy fetch: profile row + admin auth email lookup + pet count
 * (Promise.all in page.tsx). Shell renders immediately outside this
 * boundary; this covers the identity card + grouped settings rows so the
 * navigation from /inicio doesn't leave the main area blank (nav-QOL audit
 * 2026-07-04, finding N4).
 */

import { Skeleton } from "@/components/ui/Skeleton";

const SECTION_KEYS = ["a", "b", "c"] as const;

export default function CuentaLoading() {
  return (
    <output
      aria-busy="true"
      aria-label="Cargando…"
      className="mx-auto max-w-4xl px-[32px] py-[28px] pb-[48px] block"
    >
      <span className="sr-only">Cargando…</span>

      {/* Header placeholder */}
      <div className="mb-[28px] flex flex-col gap-[8px]">
        <Skeleton w="180px" h="30px" radius="4px" />
        <Skeleton w="240px" h="14px" radius="3px" />
      </div>

      {/* Identity card placeholder */}
      <div className="mb-[28px] overflow-hidden rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)] px-[16px] py-[16px]">
        <div className="flex items-center gap-[16px]">
          <Skeleton w="64px" h="64px" radius="50%" />
          <div className="flex-1 flex flex-col gap-[8px]">
            <Skeleton w="40%" h="16px" radius="3px" />
            <Skeleton w="55%" h="13px" radius="3px" />
          </div>
        </div>
      </div>

      {/* Grouped settings rows placeholder */}
      {SECTION_KEYS.map((k) => (
        <div key={k} className="mb-[24px]">
          <Skeleton w="140px" h="13px" radius="3px" className="mb-[12px]" />
          <div className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)]">
            <div className="flex items-center justify-between gap-4 border-b border-[var(--color-ln-line-2)] px-[18px] py-[14px] last:border-b-0">
              <Skeleton w="55%" h="14px" radius="3px" />
              <Skeleton w="16px" h="16px" radius="3px" />
            </div>
            <div className="flex items-center justify-between gap-4 px-[18px] py-[14px]">
              <Skeleton w="40%" h="14px" radius="3px" />
              <Skeleton w="16px" h="16px" radius="3px" />
            </div>
          </div>
        </div>
      ))}
    </output>
  );
}
