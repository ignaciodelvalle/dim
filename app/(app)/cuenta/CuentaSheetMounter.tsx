"use client";

/**
 * CuentaSheetMounter — deep-link driven sheets for the cuenta dashboard.
 *
 * Opens the appropriate form Sheet based on `?sheet=<id>` URL state.
 * Closing removes the `sheet` param from the URL via router.replace.
 *
 * Supported sheet IDs:
 *   editar-perfil | renunciar-rol | solicitar-upgrade-vet | verificar-dni
 *
 * Flows deferred (too complex for a sheet in this slice):
 *   desactivar — requires per-locality coverage data fetched server-side
 *   ofrecerme-como-transito — 3-step wizard with complex controlled state
 *   crear-consultorio — 3-step wizard
 *   privacidad — destructive (account erasure); better as a full page
 */

import { Sheet } from "@/components/poncho";
import { buildCloseSheetUrl } from "@/components/poncho/Sheet.helpers";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { EditProfileForm } from "./editar/EditProfileForm";
import { VetSelfResignForm } from "./renunciar/VetSelfResignForm";
import { VetUpgradeForm } from "./upgrade/VetUpgradeForm";
import { DniVerifyForm } from "./verificar-dni/DniVerifyForm";

type InitialProfile = {
  displayName: string;
  phone: string;
  avatarUrl: string;
  preferredVetName: string;
  preferredVetPhone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

type Props = {
  /** Profile fields needed by the editar-perfil sheet. */
  initialProfile: InitialProfile;
  /** Role gates — controls which sheets are available. */
  role: string;
  /** Whether the user's DNI is already verified (gates verificar-dni). */
  dniVerified: boolean;
};

export function CuentaSheetMounter({ initialProfile, role, dniVerified }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sheet = searchParams.get("sheet");

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    router.replace(buildCloseSheetUrl(pathname, params));
  }, [router, pathname, searchParams]);

  if (sheet === "editar-perfil") {
    return (
      <Sheet id="editar-perfil" title="Editar mi información" open onClose={close} size="lg">
        <EditProfileForm initialProfile={initialProfile} />
      </Sheet>
    );
  }

  if (sheet === "renunciar-rol") {
    if (role !== "vet") return null;
    return (
      <Sheet id="renunciar-rol" title="Renunciar a rol veterinario/a" open onClose={close}>
        <VetSelfResignForm />
      </Sheet>
    );
  }

  if (sheet === "solicitar-upgrade-vet") {
    if (role === "vet") return null; // already a vet — sheet doesn't apply
    return (
      <Sheet
        id="solicitar-upgrade-vet"
        title="Convertirme en profesional"
        open
        onClose={close}
        size="lg"
      >
        <VetUpgradeForm />
      </Sheet>
    );
  }

  if (sheet === "verificar-dni") {
    if (dniVerified) return null; // already verified — no-op
    return (
      <Sheet id="verificar-dni" title="Verificar DNI" open onClose={close}>
        <DniVerifyForm next="/cuenta" />
      </Sheet>
    );
  }

  // Unknown or absent sheet param — render nothing.
  return null;
}
