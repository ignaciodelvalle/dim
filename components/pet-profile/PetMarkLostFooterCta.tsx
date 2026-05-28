// Sticky mobile-only footer CTA on the pet detail page. Surfaces the
// "Marcar como perdida" action — the most time-critical action an owner
// can take — without making them dig into the Acciones panel.
//
// Visibility:
//   - pet.status === "active" → render the red sticky bar (mobile only).
//   - pet.status === "lost"   → don't render here. The LostCockpit on the
//                                same page already surfaces "Marcar como
//                                encontrada" with the full state.
//   - pet.status === "deceased" → don't render.
//
// The bar lives at the bottom on mobile (<768px). On desktop the Acciones
// panel already provides this action; we hide the footer so it doesn't
// duplicate. Bottom padding accounts for any PWA / safe-area chrome.
//
// Trilogy unification handoff §3 PR-022.

import Link from "next/link";

type Props = {
  petPublicToken: string;
  petStatus: string;
};

export function PetMarkLostFooterCta({ petPublicToken, petStatus }: Props) {
  if (petStatus !== "active") return null;

  return (
    <div
      className="md:hidden fixed bottom-0 inset-x-0 z-30 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur border-t border-gob-border  "
      data-section="marklost-footer-cta"
    >
      <Link
        href={`/mis-mascotas/${petPublicToken}?sheet=marcar-perdida`}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gob-warning  text-white font-semibold text-sm px-4 py-3 hover:bg-gob-warning  focus:outline-none focus-visible:ring-2 focus-visible:ring-gob-warning focus-visible:ring-offset-2 transition-colors"
      >
        <span aria-hidden="true">⚠</span>
        Marcar como perdida
      </Link>
    </div>
  );
}
