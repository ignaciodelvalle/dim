"use client";

/**
 * SheetMounter — deep-link driven quick-capture sheets for the pet detail page.
 *
 * Opens the appropriate form Sheet based on `?sheet=<id>` URL state.
 * Closing removes the `sheet` (and `text`) params from the URL via router.replace.
 *
 * Supported sheet IDs:
 *   vacuna | peso | sintoma | medicacion | nota
 *   mostrar-tier2 | compartir-libreta | transferir-mascota
 *
 * NOTE: Full reminder pre-fill (initialVaccineName / sourceReminderId) is
 * intentionally omitted from the VaccinationForm sheet path. The full route
 * at /eventos/nuevo/vacuna/page.tsx does the reminder lookup — the sheet is
 * opt-in quick-capture only. The reminder-linked vaccination flow continues
 * to use the dedicated route.
 *
 * NOTE: SymptomForm has no `defaults` or `freeText` prop, so the `text` param
 * is dropped for the "sintoma" sheet.
 */

import { Button, Sheet } from "@/components/poncho";
import { buildCloseSheetUrl } from "@/components/poncho/Sheet.helpers";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { MedicationStartForm } from "./eventos/nuevo/medicacion-inicio/MedicationStartForm";
import { NoteForm } from "./eventos/nuevo/nota/NoteForm";
import { WeightForm } from "./eventos/nuevo/peso/WeightForm";
import { SymptomForm } from "./eventos/nuevo/sintoma/SymptomForm";
import { VaccinationForm } from "./eventos/nuevo/vacuna/VaccinationForm";
import { MarkLostWizard } from "./perdida/MarkLostWizard";

import {
  createMedicationStartAction,
  createNoteAction,
  createSymptomObservedAction,
  createVaccinationAction,
  createWeightAction,
  setPetFoundAction,
  setPetLostAction,
} from "@/app/actions/events";
import { createLibretaShareAction } from "@/app/actions/libreta-share";
import { updatePetAction } from "@/app/actions/pets";
import { enableTier2PublicAction, revokeTier2PublicAction } from "@/app/actions/tier2-public";
import { PetForm } from "@/components/PetForm";
import type { Pet } from "@/db";

import { ShareLibretaSheet } from "./_share-libreta/ShareLibretaSheet";
import { Tier2PublicView } from "./_tier2-public/Tier2PublicView";
import { TransferSenderForm } from "./_transfer/TransferSenderForm";

type MarkLostData = {
  discloseFirstNameWhenLost: boolean;
  disclosePhoneWhenLost: boolean;
  discloseEmailWhenLost: boolean;
  discloseLastLocationWhenLost: boolean;
  allowFinderFormWhenLost: boolean;
  petHasMicrochip: boolean;
  petHasTattoo: boolean;
  petColor: string | null;
  petDistinguishingFeatures: string | null;
  petJurisdictionProvince: string | null;
  petJurisdictionLocality: string | null;
};

type Props = {
  petToken: string;
  petName: string;
  species: string;
  /** ISO string of pet.tier2PublicEnabledUntil — null when not set. */
  tier2PublicEnabledUntil: string | null;
  /** Data required by MarkLostForm. Null when pet is not active (already lost or deceased). */
  markLostData: MarkLostData | null;
  /** Data required by the editar-mascota sheet. Always set. */
  editPetData: {
    existingPet: Pet;
    existingPhotoUrl: string | null;
  };
  /** Pet status — needed to gate the marcar-encontrada sheet. */
  petStatus: "active" | "lost" | "deceased";
};

export function SheetMounter({
  petToken,
  petName,
  species,
  tier2PublicEnabledUntil,
  markLostData,
  editPetData,
  petStatus,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sheet = searchParams.get("sheet");
  const text = searchParams.get("text") ?? undefined;

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("text");
    router.replace(buildCloseSheetUrl(pathname, params));
  }, [router, pathname, searchParams]);

  if (sheet === "vacuna") {
    const action = createVaccinationAction.bind(null, petToken);
    return (
      <Sheet id="vacuna" title="Registrar vacuna" open onClose={close}>
        <VaccinationForm
          action={action}
          species={species}
          defaults={{ occurredAt: null, notes: text ?? null }}
        />
      </Sheet>
    );
  }

  if (sheet === "peso") {
    const action = createWeightAction.bind(null, petToken);
    return (
      <Sheet id="peso" title="Registrar peso" open onClose={close}>
        <WeightForm
          action={action}
          defaults={{ kg: null, occurredAt: null, notes: text ?? null }}
        />
      </Sheet>
    );
  }

  if (sheet === "sintoma") {
    const action = createSymptomObservedAction.bind(null, petToken);
    return (
      <Sheet id="sintoma" title="Registrar síntoma" open onClose={close}>
        <SymptomForm action={action} petName={petName} />
      </Sheet>
    );
  }

  if (sheet === "medicacion") {
    const action = createMedicationStartAction.bind(null, petToken);
    return (
      <Sheet id="medicacion" title="Inicio de medicación" open onClose={close}>
        <MedicationStartForm
          action={action}
          species={species}
          defaultNotes={text}
          defaultOccurredAt={undefined}
        />
      </Sheet>
    );
  }

  if (sheet === "nota") {
    const action = createNoteAction.bind(null, petToken);
    return (
      <Sheet id="nota" title="Nota" open onClose={close}>
        <NoteForm action={action} defaults={{ text: text ?? null, occurredAt: null }} />
      </Sheet>
    );
  }

  if (sheet === "mostrar-tier2") {
    const now = new Date();
    const activeUntilDate = tier2PublicEnabledUntil ? new Date(tier2PublicEnabledUntil) : null;
    const isActive = !!activeUntilDate && activeUntilDate > now;
    const enable = enableTier2PublicAction.bind(null, petToken);
    const revoke = revokeTier2PublicAction.bind(null, petToken);
    return (
      <Sheet id="mostrar-tier2" title="Mostrar Libreta" open onClose={close}>
        <Tier2PublicView
          petPublicToken={petToken}
          petName={petName}
          isActive={isActive}
          activeUntil={isActive ? activeUntilDate : null}
          enableAction={enable}
          revokeAction={revoke}
        />
      </Sheet>
    );
  }

  if (sheet === "compartir-libreta") {
    // Wrap the action so the sheet only supplies expiresInDays + label;
    // petPublicToken is captured from the outer scope.
    const shareAction = (input: { expiresInDays: number | null; label: string | null }) =>
      createLibretaShareAction({ petPublicToken: petToken, ...input });
    return (
      <Sheet id="compartir-libreta" title="Compartir libreta" open onClose={close}>
        <ShareLibretaSheet
          petPublicToken={petToken}
          petName={petName}
          createShareAction={shareAction}
        />
      </Sheet>
    );
  }

  if (sheet === "transferir-mascota") {
    return (
      <Sheet id="transferir-mascota" title="Transferir mascota" open onClose={close}>
        <TransferStub petName={petName} petToken={petToken} />
      </Sheet>
    );
  }

  if (sheet === "marcar-perdida") {
    if (!markLostData) return null; // pet not active — flow doesn't apply
    const action = setPetLostAction.bind(null, petToken);
    return (
      <Sheet
        id="marcar-perdida"
        title="Marcar como perdida"
        open
        onClose={close}
        side="right"
        size="lg"
      >
        <MarkLostWizard
          action={action}
          disclosureDefaults={{
            discloseFirstNameWhenLost: markLostData.discloseFirstNameWhenLost,
            disclosePhoneWhenLost: markLostData.disclosePhoneWhenLost,
            discloseEmailWhenLost: markLostData.discloseEmailWhenLost,
            discloseLastLocationWhenLost: markLostData.discloseLastLocationWhenLost,
            allowFinderFormWhenLost: markLostData.allowFinderFormWhenLost,
          }}
          petName={petName}
          petPublicToken={petToken}
          petHasMicrochip={markLostData.petHasMicrochip}
          petHasTattoo={markLostData.petHasTattoo}
          petColor={markLostData.petColor}
          petDistinguishingFeatures={markLostData.petDistinguishingFeatures}
          petJurisdictionProvince={markLostData.petJurisdictionProvince}
          petJurisdictionLocality={markLostData.petJurisdictionLocality}
        />
      </Sheet>
    );
  }

  if (sheet === "editar-mascota") {
    const action = updatePetAction.bind(null, petToken);
    return (
      <Sheet
        id="editar-mascota"
        title={`Editar ${petName}`}
        open
        onClose={close}
        side="right"
        size="lg"
      >
        <PetForm
          action={action}
          existingPet={editPetData.existingPet}
          existingPhotoUrl={editPetData.existingPhotoUrl}
        />
      </Sheet>
    );
  }

  if (sheet === "marcar-encontrada") {
    if (petStatus !== "lost") return null; // flow only applies when pet is lost
    const action = setPetFoundAction.bind(null, petToken);
    return (
      <Sheet
        id="marcar-encontrada"
        title="Marcar como encontrada"
        open
        onClose={close}
        side="right"
        size="md"
      >
        <MarkFoundConfirmation action={action} petName={petName} onCancel={close} />
      </Sheet>
    );
  }

  // Unknown or absent sheet param — render nothing.
  return null;
}

// ---------------------------------------------------------------------------
// MarkFoundConfirmation — inline confirmation form for the marcar-encontrada sheet
// ---------------------------------------------------------------------------

function MarkFoundConfirmation({
  action,
  petName,
  onCancel,
}: {
  action: () => Promise<void>;
  petName: string;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Vas a marcar a <strong>{petName}</strong> como encontrada. La credencial pública vuelve al
        modo identidad básica (Tier 0). Podés volver a marcarla como perdida si hace falta.
      </p>
      <form action={action} className="flex gap-2">
        <Button type="submit" variant="success">
          Confirmar
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TransferStub — owner→owner handshake form (P3-2)
// ---------------------------------------------------------------------------

function TransferStub({ petName, petToken }: { petName: string; petToken: string }) {
  return <TransferSenderForm petName={petName} petToken={petToken} />;
}
