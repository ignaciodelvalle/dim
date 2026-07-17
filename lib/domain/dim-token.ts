// The DIM public-token shape, in one place.
//
// `DIM-XXXX-XXXX` — the credential token that resolves to a pet's public page.
// Invariant #1 ("the pet is the credential") makes this shape load-bearing, so
// it had drifted into five private copies (omnibox server + client, decomiso
// lookup, denuncia public lookup, Atender access) — all now import from here.
//
// This module holds NO dependencies on purpose: the omnibox needs the shape on
// both sides of the wire, and the server module that used to own it imports the
// database — so a client importing from there would drag `db` into the browser
// bundle. Keep it dependency-free or the duplication comes back.

/** `DIM-XXXX-XXXX`, case-insensitive. Anchored: a full-string match, not a scan. */
export const DIM_TOKEN_PATTERN = /^DIM-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

/** True when `value` is exactly a DIM public token (surrounding space ignored). */
export function isDimToken(value: string): boolean {
  return DIM_TOKEN_PATTERN.test(value.trim());
}
