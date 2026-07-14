// First-run empty state for /inicio (task #19, owner-process-clarity Lens 1).
//
// Replaces the misleading "Todo en orden" + dead capture card a zero-pet owner
// used to see. Reuses LnEmptyState (design proposal 2026-07-12 §1.6: "Reuse,
// components/ui/EmptyState.tsx") with copy that leads with the real first action.
//
//   - fresh     → "Cargá tu primera mascota" (the owner has nothing yet).
//   - returning → "Tus mascotas activas aparecerán acá" (had pets, none active
//                 now — e.g. all in memoriam), a softer, non-directive line.
//
// The "Asentar un hecho" capture card is hidden by the page pre-first-pet
// (nothing to asentar against), so this is the single directing surface.

import Link from "next/link";

import { LnButton } from "@/components/ui/Button";
import { LnEmptyState } from "@/components/ui/EmptyState";

export function FirstRunEmptyState({ state }: { state: "fresh" | "returning" }) {
  const isFresh = state === "fresh";

  return (
    <LnEmptyState
      variant="dashed"
      icon="paw"
      title={isFresh ? "Cargá tu primera mascota" : "Tus mascotas activas aparecerán acá"}
      description={
        isFresh
          ? "Registrá a tu mascota para empezar su libreta sanitaria y activar su credencial pública."
          : "No tenés mascotas activas en tu libreta. Cuando registres o reclames una, la vas a ver acá."
      }
      action={
        <div className="flex flex-col items-center gap-2">
          <Link href="/mis-mascotas/nueva">
            <LnButton variant="primary" size="md">
              {isFresh ? "Cargar una mascota" : "Registrar una mascota"}
            </LnButton>
          </Link>
          <Link
            href="/mis-mascotas/reclamar"
            className="text-sm text-[var(--color-ln-azul)] no-underline hover:underline"
          >
            Ya tiene chapita o microchip — reclamar con un código
          </Link>
        </div>
      }
    />
  );
}
