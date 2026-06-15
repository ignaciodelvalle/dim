// PetCurrentStateSection — Estado actual section for the pet profile v2 page.
//
// Server component. Renders a concise summary of the pet's current state:
// weight, vaccination, sterilization, microchip, tattoo (R5), allergies,
// training, favourite foods, pregnancy, and rabies observation.
//
// Each field is suppressed when null / empty. When ALL fields are absent,
// a signposted empty state is shown with entry points to the relevant flows.

import { formatDate } from "@/lib/format";
import Link from "next/link";
import {
  type CanonicalIdentificationSnapshot,
  type CurrentStateEvent,
  type CurrentStatePet,
  deriveCurrentStateFields,
  hacoLabel,
  pregnancyStatusLabel,
  tattooLocationLabel,
  trainingLevelLabel,
} from "./PetCurrentStateSection.helpers";

// Re-export types so callers only need to import from this module.
export type { CanonicalIdentificationSnapshot, CurrentStateEvent, CurrentStatePet };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RowProps {
  label: string;
  value: string;
}

function Row({ label, value }: RowProps) {
  return (
    <div className="flex justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-ln-mute ">{label}</span>
      <span className="text-right font-medium text-ln-ink ">{value}</span>
    </div>
  );
}

export function PetCurrentStateSection({
  pet,
  typedEvents,
  canonicalIds = { microchip: null, tattoo: null },
  petToken,
}: {
  pet: CurrentStatePet;
  typedEvents: CurrentStateEvent[];
  canonicalIds?: CanonicalIdentificationSnapshot;
  /** Public token of the pet — used to build empty-state action links. */
  petToken?: string;
}) {
  const fields = deriveCurrentStateFields(pet, typedEvents, canonicalIds);

  const hasAnyField =
    fields.weight !== null ||
    fields.microchip !== null ||
    fields.tattoo !== null ||
    fields.sterilized ||
    fields.allergies !== null ||
    fields.trainingLevel !== null ||
    fields.favouriteFoods !== null ||
    fields.pregnancy !== null ||
    fields.rabiesObservation !== null;

  return (
    <section
      aria-labelledby="pp-estado-h"
      className="rounded-2xl border border-ln-line bg-ln-card p-4  "
    >
      <h2 id="pp-estado-h" className="mb-3 text-base font-semibold text-ln-ink ">
        Estado actual
      </h2>

      {!hasAnyField ? (
        <div className="rounded-xl border border-dashed border-ln-line-strong p-5 text-center">
          <p className="text-sm text-ln-mute ">Sin datos de estado cargados.</p>
          <p className="mt-1 text-xs text-ln-mute ">
            Registrá el peso o el microchip para que aparezca el resumen de salud.
          </p>
          {petToken && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={`/mis-mascotas/${petToken}?sheet=peso`}
                className="text-xs font-medium text-ln-azul hover:underline"
              >
                Registrar peso →
              </Link>
              <Link
                href={`/mis-mascotas/${petToken}/eventos/nuevo/microchip`}
                className="text-xs font-medium text-ln-azul hover:underline"
              >
                Registrar microchip →
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-ln-line ">
          {fields.weight && (
            <Row
              label="Peso"
              value={`${fields.weight.kg} kg${fields.weight.lastRecordedAt ? ` · ${hacoLabel(fields.weight.lastRecordedAt)}` : ""}`}
            />
          )}
          {fields.microchip && (
            <Row
              label="Microchip"
              value={`${fields.microchip.id}${fields.microchip.implantedAt ? ` · ${formatDate(fields.microchip.implantedAt)}` : ""}`}
            />
          )}
          {fields.tattoo && (
            <Row
              label="Tatuaje"
              value={`${fields.tattoo.code}${fields.tattoo.location ? ` · ${tattooLocationLabel(fields.tattoo.location)}` : ""}`}
            />
          )}
          {fields.sterilized && <Row label="Esterilización" value="Esterilizado/a" />}
          {fields.allergies && (
            <Row label="Alergias conocidas" value={fields.allergies.join(", ")} />
          )}
          {fields.trainingLevel && (
            <Row label="Entrenamiento" value={trainingLevelLabel(fields.trainingLevel)} />
          )}
          {fields.favouriteFoods && (
            <Row label="Comidas favoritas" value={fields.favouriteFoods.join(", ")} />
          )}
          {fields.pregnancy && (
            <Row label="Gestación" value={pregnancyStatusLabel(fields.pregnancy.status)} />
          )}
          {fields.rabiesObservation && (
            <Row label="Obs. antirrábica" value={fields.rabiesObservation.status} />
          )}
        </div>
      )}
    </section>
  );
}
