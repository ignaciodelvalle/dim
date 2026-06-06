// SHIM — delegates to src/modules/surveillance/domain/rabies-observation.
// All importers of @/lib/rabies-observation continue to work unchanged with
// identical signatures and behavior.
// Delete this file when all importers are repointed to the module directly (WU-5).

export {
  RABIES_OBSERVATION_DAYS,
  RABIES_OBSERVATION_STATUSES,
  PROFESSIONAL_OUTCOMES,
  outcomeToStatus,
  computeObservationUntil,
  isRabiesVaccineValid,
} from "@/src/modules/surveillance/domain/rabies-observation";

export type {
  RabiesObservationStatus,
  RabiesObservationOutcome,
  LatestVaccineEvent,
} from "@/src/modules/surveillance/domain/rabies-observation";
