// Application submission validation — pure function, no DB, no Next.js imports.
// Extracted from app/actions/adoption-applications.ts validation block.

import type { ApplicantProfile, ApplicationInput, ExistingApplication } from "./types";

export type ApplicationValidationResult = { ok: true } | { ok: false; error: string };

const MAX_TEXT_LEN = 2000;

/**
 * Validates the inputs for an adoption application submission.
 *
 * @param input - The application form data.
 * @param applicant - Minimal profile shape for the applicant (accountType).
 * @param existingApplication - Non-null when the applicant already has a pending
 *   unresolved application for this pet. The caller (repo) supplies this.
 */
export function validateApplicationInput(
  input: ApplicationInput,
  applicant: ApplicantProfile,
  existingApplication: ExistingApplication | null,
): ApplicationValidationResult {
  // Institutional accounts cannot apply.
  if (applicant.accountType === "institutional") {
    return {
      ok: false,
      error:
        "Las cuentas institucionales no pueden postularse para adoptar. Si querés adoptar como persona, creá una cuenta personal con otro email.",
    };
  }

  // Consent is mandatory.
  if (input.profileSharingConsent !== true) {
    return {
      ok: false,
      error: "Tu consentimiento para compartir el perfil es obligatorio para postularte.",
    };
  }

  // Duplicate pending application.
  if (existingApplication !== null) {
    return {
      ok: false,
      error:
        "Ya postulaste para esta mascota. El refugio recibió tu postulación y la está revisando.",
    };
  }

  // Text length caps.
  const textFields: Array<[string, string | null]> = [
    ["Otras mascotas", input.otherPets],
    ["Rutina diaria", input.dailyRoutine],
    ["Notas", input.notes],
  ];

  for (const [label, val] of textFields) {
    if (val && val.trim().length > MAX_TEXT_LEN) {
      return { ok: false, error: `${label}: máximo ${MAX_TEXT_LEN} caracteres.` };
    }
  }

  return { ok: true };
}
