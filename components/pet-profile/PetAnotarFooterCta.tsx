// Sticky mobile-only footer CTA on the pet detail page — repurposed from
// "Marcar como perdida" to "Anotar" (two-face redesign, 2026-07-01, design
// ADR-9). Mark-lost is now always visible in the Face 1 action row (T2), so
// this slot is free for the primary capture verb.
//
// Visibility: owner + active pet only. Lost pets show LostCockpit (early
// return, no faces render); deceased pets have no capture surface; org
// viewers never get a capture CTA anywhere on the page (spec: no Anotar
// control exists for org viewers).

import Link from "next/link";

type Props = {
  petPublicToken: string;
  petStatus: string;
  isOwner: boolean;
};

export function PetAnotarFooterCta({ petPublicToken, petStatus, isOwner }: Props) {
  if (!isOwner || petStatus !== "active") return null;

  return (
    <div
      className="md:hidden fixed bottom-0 inset-x-0 z-30 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-ln-card/95 backdrop-blur border-t border-ln-line"
      data-section="anotar-footer-cta"
    >
      <Link
        href={`/mis-mascotas/${petPublicToken}/anotar`}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-ln-azul text-white font-semibold text-sm px-4 py-3 hover:bg-ln-azul-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-ln-azul focus-visible:ring-offset-2 transition-colors"
      >
        Anotar
      </Link>
    </div>
  );
}
