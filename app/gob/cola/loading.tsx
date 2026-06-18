/**
 * loading.tsx — skeleton for /gob/cola (govt approval queue).
 * Heavy fetch: paginated pending approval_requests with jurisdiction scoping.
 */

import { OpCardSkeleton } from "@/components/ui/dashboard/OpCardSkeleton";

export default function GobColaLoading() {
  return (
    <output
      aria-busy="true"
      aria-label="Cargando…"
      className="mx-auto max-w-5xl px-[32px] py-[28px] pb-[48px] block"
    >
      <span className="sr-only">Cargando…</span>
      <OpCardSkeleton rows={8} />
    </output>
  );
}
