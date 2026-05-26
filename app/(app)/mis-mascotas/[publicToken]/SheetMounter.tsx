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

import { Sheet } from "@/components/poncho";
import { buildCloseSheetUrl } from "@/components/poncho/Sheet.helpers";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { MedicationStartForm } from "./eventos/nuevo/medicacion-inicio/MedicationStartForm";
import { NoteForm } from "./eventos/nuevo/nota/NoteForm";
import { WeightForm } from "./eventos/nuevo/peso/WeightForm";
import { SymptomForm } from "./eventos/nuevo/sintoma/SymptomForm";
import { VaccinationForm } from "./eventos/nuevo/vacuna/VaccinationForm";

import {
  createMedicationStartAction,
  createNoteAction,
  createSymptomObservedAction,
  createVaccinationAction,
  createWeightAction,
} from "@/app/actions/events";
import { createLibretaShareAction } from "@/app/actions/libreta-share";
import { enableTier2PublicAction, revokeTier2PublicAction } from "@/app/actions/tier2-public";

import { ShareLibretaSheet } from "./_share-libreta/ShareLibretaSheet";
import { Tier2PublicView } from "./_tier2-public/Tier2PublicView";

type Props = {
  petToken: string;
  petName: string;
  species: string;
  /** ISO string of pet.tier2PublicEnabledUntil — null when not set. */
  tier2PublicEnabledUntil: string | null;
};

export function SheetMounter({ petToken, petName, species, tier2PublicEnabledUntil }: Props) {
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
        <TransferStub petName={petName} />
      </Sheet>
    );
  }

  // Unknown or absent sheet param — render nothing.
  return null;
}

// ---------------------------------------------------------------------------
// TransferStub — placeholder for the future transfer flow
// ---------------------------------------------------------------------------

function TransferStub({ petName }: { petName: string }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        La transferencia le traspasa la titularidad de {petName} a otro usuario de dim. El receptor
        recibe una invitación y debe aceptarla — la libreta sanitaria completa viaja con la mascota.
      </p>
      <p className="text-xs text-neutral-500 dark:text-neutral-500">
        Una vez iniciada la transferencia podés cancelarla mientras el receptor no haya aceptado.
      </p>
      <button
        type="button"
        disabled
        title="Próximamente"
        className="w-full px-4 py-3 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm font-medium text-neutral-400 dark:text-neutral-600 cursor-not-allowed"
      >
        Próximamente
      </button>
    </div>
  );
}
