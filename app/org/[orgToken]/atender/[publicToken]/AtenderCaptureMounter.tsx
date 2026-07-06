"use client";

// Clinical-event capture for the walk-in signing surface.
//
// Reads `?evento=` and mounts the matching EXISTING owner-flow clinical form
// (reused verbatim — presentation only), bound to the org-scoped atender
// action. The action carries the #43 provenance via resolveAtenderPet; the
// form is unaware it is signing a non-custody event. On success each form
// performs the full-document redirect returned by the action (N3 contract),
// landing back on this surface with ?firmado=1.
//
// Only clinical event kinds are exposed — no custody/transfer/adoption.

import { useSearchParams } from "next/navigation";

import { LnSheetCard, LnSheetWrap } from "@/components/ui/Sheet";

import { DewormingForm } from "@/app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/antiparasitario/DewormingForm";
import { ClinicalInfoForm } from "@/app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/clinico/ClinicalInfoForm";
import { MedicationStartForm } from "@/app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/medicacion-inicio/MedicationStartForm";
import { NoteForm } from "@/app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/nota/NoteForm";
import { VaccinationForm } from "@/app/(app)/mis-mascotas/[publicToken]/eventos/nuevo/vacuna/VaccinationForm";

import {
  atenderClinicalInfoAction,
  atenderDewormingAction,
  atenderMedicationStartAction,
  atenderNoteAction,
  atenderVaccinationAction,
} from "../actions";

// ATENDER_EVENTOS + AtenderEvento moved to ./atender-eventos (server-safe) so
// the Server Component page.tsx can import the array without the client-boundary
// proxy that crashed `.map` (val-4-org blocker).

export function AtenderCaptureMounter({
  orgToken,
  publicToken,
  species,
}: {
  orgToken: string;
  publicToken: string;
  species: string;
}) {
  const searchParams = useSearchParams();
  const evento = searchParams.get("evento");

  if (!evento) return null;

  let form: React.ReactNode = null;

  if (evento === "vacuna") {
    const action = atenderVaccinationAction.bind(null, orgToken, publicToken);
    form = (
      <VaccinationForm
        action={action}
        species={species}
        defaults={{ occurredAt: null, notes: null }}
      />
    );
  } else if (evento === "desparasitacion") {
    const action = atenderDewormingAction.bind(null, orgToken, publicToken);
    form = (
      <DewormingForm action={action} defaults={{ product: null, occurredAt: null, notes: null }} />
    );
  } else if (evento === "cirugia") {
    const action = atenderClinicalInfoAction.bind(null, orgToken, publicToken);
    form = <ClinicalInfoForm action={action} defaults={{ occurredAt: null, notes: null }} />;
  } else if (evento === "medicacion") {
    const action = atenderMedicationStartAction.bind(null, orgToken, publicToken);
    form = <MedicationStartForm action={action} species={species} />;
  } else if (evento === "nota") {
    const action = atenderNoteAction.bind(null, orgToken, publicToken);
    form = <NoteForm action={action} defaults={{ text: null, occurredAt: null }} />;
  } else {
    return null;
  }

  return (
    <LnSheetWrap>
      <LnSheetCard>{form}</LnSheetCard>
    </LnSheetWrap>
  );
}
