/**
 * loading.tsx — full-segment navigation skeleton for
 * /libreta/compartir/[shareToken] (vet-facing shared libreta view).
 *
 * Tier 2 surface: a vet or third party scanning/opening a shared link. First
 * impression matters here (nav-QOL audit 2026-07-04, finding N4, priority
 * #3), so this mirrors the identity header + grouped event sections instead
 * of a generic spinner. The landing shell (variant="landing") renders
 * immediately outside this boundary.
 */

import { Skeleton } from "@/components/ui/Skeleton";

const SECTION_KEYS = ["a", "b"] as const;

export default function LibretaCompartirLoading() {
  return (
    <output
      aria-busy="true"
      aria-label="Cargando…"
      className="bg-[var(--color-ln-paper)] p-6 block"
    >
      <span className="sr-only">Cargando…</span>
      <div className="mx-auto max-w-2xl space-y-6 pb-20 pt-6">
        {/* Identity header placeholder */}
        <div className="flex items-center gap-[16px]">
          <Skeleton w="72px" h="72px" radius="50%" />
          <div className="flex-1 flex flex-col gap-[8px]">
            <Skeleton w="50%" h="20px" radius="3px" />
            <Skeleton w="35%" h="13px" radius="3px" />
          </div>
        </div>

        {/* Grouped event sections placeholder */}
        {SECTION_KEYS.map((k) => (
          <div
            key={k}
            className="overflow-hidden rounded-[4px] border border-[var(--color-ln-line)] bg-[var(--color-ln-card)]"
          >
            <div className="border-b border-[var(--color-ln-line-2)] px-[16px] py-[10px]">
              <Skeleton w="120px" h="13px" radius="3px" />
            </div>
            <div className="flex flex-col gap-[10px] px-[16px] py-[14px]">
              <Skeleton w="80%" h="13px" radius="3px" />
              <Skeleton w="65%" h="13px" radius="3px" />
            </div>
          </div>
        ))}
      </div>
    </output>
  );
}
