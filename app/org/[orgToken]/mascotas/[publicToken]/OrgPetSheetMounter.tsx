"use client";

/**
 * OrgPetSheetMounter — deep-link driven sheets for the org pet detail page.
 *
 * Opens the appropriate form Sheet based on `?sheet=<id>` URL state.
 * Closing removes the `sheet` param from the URL via router.replace.
 *
 * Supported sheet IDs:
 *   elegibilidad | reemplazar-microchip | fin-transito | devolver-al-dueno
 *
 * Props are threaded from the server page so no client-side fetching is needed.
 */

import { Sheet } from "@/components/ui/VaulSheet";
import { buildCloseSheetUrl } from "@/lib/ui/sheet-helpers";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { replaceMicrochipVetAction } from "@/app/org/[orgToken]/mascotas/[publicToken]/microchip/reemplazar/action";

import { ProposeReturnForm } from "./devolver-al-dueno/ProposeReturnForm";
import { EligibilityForm } from "./eligibility/EligibilityForm";
import { EndFosterForm } from "./foster-fin/EndFosterForm";
import { ReplaceMicrochipForm } from "./microchip/reemplazar/ReplaceMicrochipForm";

type EligibilityData = {
  eligible: boolean | null;
  reason: string | null;
  notes: string | null;
  until: string | null;
};

type Props = {
  orgToken: string;
  petPublicToken: string;
  petName: string;
  /** Adoption eligibility data for the EligibilityForm. */
  eligibility: EligibilityData;
  /** Current microchip ID — null if the pet has no microchip. */
  currentChip: string | null;
  /**
   * Active foster's display name — null when there is no active foster.
   * Sheet is gated on this being non-null.
   */
  fosterName: string | null;
  /**
   * Whether the devolver-al-dueno sheet should be available.
   * True only when: pet is lost, org has shelter_custody, no pending proposal.
   */
  canProposeReturn: boolean;
};

export function OrgPetSheetMounter({
  orgToken,
  petPublicToken,
  petName,
  eligibility,
  currentChip,
  fosterName,
  canProposeReturn,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sheet = searchParams.get("sheet");

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    router.replace(buildCloseSheetUrl(pathname, params));
  }, [router, pathname, searchParams]);

  if (sheet === "elegibilidad") {
    return (
      <Sheet
        id="elegibilidad"
        title={`Elegibilidad para adopción · ${petName}`}
        open
        onClose={close}
        size="lg"
      >
        <EligibilityForm
          petPublicToken={petPublicToken}
          orgToken={orgToken}
          current={eligibility}
        />
      </Sheet>
    );
  }

  if (sheet === "reemplazar-microchip") {
    if (!currentChip) {
      return (
        <Sheet
          id="reemplazar-microchip"
          title={`Reemplazar microchip · ${petName}`}
          open
          onClose={close}
        >
          <p className="text-[13px] text-ln-op-ink-2">
            {petName} no tiene microchip registrado todavía. No hay chip que reemplazar.
          </p>
        </Sheet>
      );
    }
    const action = replaceMicrochipVetAction.bind(null, orgToken, petPublicToken);
    return (
      <Sheet
        id="reemplazar-microchip"
        title={`Reemplazar microchip · ${petName}`}
        open
        onClose={close}
        size="lg"
      >
        <ReplaceMicrochipForm action={action} currentChip={currentChip} />
      </Sheet>
    );
  }

  if (sheet === "fin-transito") {
    if (!fosterName) {
      return (
        <Sheet id="fin-transito" title={`Cerrar tránsito · ${petName}`} open onClose={close}>
          <p className="text-[13px] text-ln-op-ink-2">
            {petName} no tiene un tránsito activo para cerrar.
          </p>
        </Sheet>
      );
    }
    return (
      <Sheet
        id="fin-transito"
        title={`Cerrar tránsito · ${petName}`}
        open
        onClose={close}
        size="lg"
      >
        <EndFosterForm orgToken={orgToken} publicToken={petPublicToken} fosterName={fosterName} />
      </Sheet>
    );
  }

  if (sheet === "devolver-al-dueno") {
    if (!canProposeReturn) {
      return (
        <Sheet id="devolver-al-dueno" title={`Devolver · ${petName}`} open onClose={close}>
          <p className="text-[13px] text-ln-op-ink-2">
            Esta acción no está disponible para {petName} en este momento. La mascota debe estar en
            estado perdida y sin propuesta de devolución pendiente.
          </p>
        </Sheet>
      );
    }
    return (
      <Sheet id="devolver-al-dueno" title={`Devolver · ${petName}`} open onClose={close} size="lg">
        <ProposeReturnForm orgToken={orgToken} petPublicToken={petPublicToken} petName={petName} />
      </Sheet>
    );
  }

  // Unknown or absent sheet param — render nothing.
  return null;
}
