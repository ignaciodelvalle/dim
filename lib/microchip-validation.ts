// ISO 11784/11785 microchip ID validation.
//
// The ICAR standard mandates a 15-digit numeric identifier. This helper:
//   1. Trims surrounding whitespace.
//   2. Strips separators (spaces, hyphens) that users commonly include.
//   3. Validates that the result is exactly 15 decimal digits.
//
// Returns either { ok: true; normalized: string } or { error: string }.
// The normalized form contains only the 15 digits and is safe to persist.

export type MicrochipValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; error: string };

/**
 * Validates and normalizes a microchip ID string against ISO 11784/11785.
 *
 * Accepts digits optionally separated by spaces or hyphens.
 * Rejects anything that does not reduce to exactly 15 digits.
 */
export function validateMicrochipId(raw: string): MicrochipValidationResult {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { ok: false, error: "El número de microchip no puede estar vacío." };
  }

  // Strip separators: spaces and hyphens are the only allowed non-digit chars.
  const stripped = trimmed.replace(/[\s-]/g, "");

  // After stripping separators, the string must consist of digits only.
  if (!/^\d+$/.test(stripped)) {
    return {
      ok: false,
      error: "El microchip solo puede contener dígitos (y separadores opcionales como espacios o guiones).",
    };
  }

  if (stripped.length < 15) {
    return {
      ok: false,
      error: `El microchip debe tener exactamente 15 dígitos (ISO 11784/11785). Ingresaste ${stripped.length}.`,
    };
  }

  if (stripped.length > 15) {
    return {
      ok: false,
      error: `El microchip debe tener exactamente 15 dígitos (ISO 11784/11785). Ingresaste ${stripped.length}.`,
    };
  }

  return { ok: true, normalized: stripped };
}
