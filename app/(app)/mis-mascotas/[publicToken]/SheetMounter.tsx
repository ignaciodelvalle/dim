"use client";

/**
 * SheetMounter — deep-link driven quick-capture sheets for the pet detail page.
 *
 * Opens the appropriate form Sheet based on `?sheet=<id>` URL state.
 * Closing removes the `sheet` (and `text`) params from the URL via router.replace.
 *
 * Supported sheet IDs: vacuna | peso | sintoma | medicacion | nota
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

type Props = {
  petToken: string;
  petName: string;
  species: string;
};

export function SheetMounter({ petToken, petName, species }: Props) {
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

  // Unknown or absent sheet param — render nothing.
  return null;
}
