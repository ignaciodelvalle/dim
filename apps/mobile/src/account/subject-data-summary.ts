// Turning `export_subject_data`'s JSON into something a person can read on a
// phone — and the one place in this app that is allowed to look inside it.
//
// WHY A SEPARATE MODULE AND NOT SIX LINES IN THE SCREEN
// ---------------------------------------------------------------------------
// The same reason `AccountDeletionCard` is a component: this is logic over the
// shape of a legal deliverable, and logic gets a test. It is also the only code
// in the app that reads the export at all, so if it is wrong the failure is
// "the person is told their file holds three pets when it holds none" — a lie
// about a Ley 25.326 art. 14 response, delivered in a friendly card.
//
// THE ONE RULE IT OBEYS: IT NEVER SPEAKS FOR THE FILE
// ---------------------------------------------------------------------------
// The contract deliberately refuses to model the export's tree
// (`my-privacy.ts`), because a TypeScript mirror of "everything we hold about a
// person" is a second declaration nothing checks, and the first table added to
// the RPC and forgotten in the mirror would make it quietly wrong. This module
// takes the same position one level down: it has NO list of expected sections,
// no friendly names table, no opinion about which keys matter. It walks whatever
// arrived. A section the RPC adds tomorrow shows up here tomorrow, unprompted —
// and a section it drops disappears, instead of being rendered as an empty row
// that claims we still hold something.
//
// The cost of that is that the labels are the RPC's own snake_case keys, lightly
// unshouted. That is the honest trade: a key the reader can match against the
// shared file beats a friendly name that may be describing something else.

/** One top-level section of the export, ready to draw as a `Row`. */
export type ExportSection = {
  /** The RPC's own key. Stable, and the React key. */
  key: string;
  /** The key, made readable without being renamed — `pet_events` → "Pet events". */
  label: string;
  /** How much of it there is, in words: "3 registros", "sin datos", "presente". */
  summary: string;
};

/**
 * `schema_version` is the export's own version and is shown separately, as a
 * version rather than as a section — it is metadata ABOUT the file, not a
 * category of data we hold about the person. Listing it beside "mascotas" would
 * be the summary miscounting itself.
 */
const METADATA_KEYS: ReadonlySet<string> = new Set(["schema_version"]);

/** `pet_events` → `Pet events`. Unshouted, never renamed. */
function readableKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  if (spaced.length === 0) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * What one section's value amounts to, in es-AR.
 *
 * FOUR CASES AND NO FIFTH, because the RPC's JSON has four shapes: an array of
 * rows, an object (the profile), a scalar, and null/absent. The counts are said
 * in words rather than as a bare number so "0" cannot be read as a failed load —
 * "sin datos" is a fact about the file, "0" looks like a bug.
 */
function summarize(value: unknown): string {
  if (value === null || value === undefined) return "sin datos";
  if (Array.isArray(value)) {
    if (value.length === 0) return "sin datos";
    return value.length === 1 ? "1 registro" : `${value.length} registros`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length === 0 ? "sin datos" : `${keys.length} campos`;
  }
  // A scalar the RPC put at the top level. It is data about the subject, so it
  // is reported as present — but NOT printed: this summary is a table of
  // contents, and a screen that started spilling values would be re-rendering
  // the file it just decided not to render.
  return "presente";
}

/**
 * Every top-level section of the export, in the RPC's own key order.
 *
 * SORTED BY NOTHING. `Object.keys` preserves insertion order for string keys,
 * which for a `jsonb_build_object` is the order the RPC wrote — so the screen
 * shows the file's own order and a reader comparing it against the shared JSON
 * finds the rows where they expect them. An alphabetical sort here would be this
 * module inventing a presentation the file does not have.
 */
export function exportSections(subject: Record<string, unknown>): ExportSection[] {
  return Object.keys(subject)
    .filter((key) => !METADATA_KEYS.has(key))
    .map((key) => ({
      key,
      label: readableKey(key),
      summary: summarize(subject[key]),
    }));
}

/**
 * The bytes that leave through the OS share sheet.
 *
 * THE FILE ITSELF, PRETTY-PRINTED, AND NOTHING ELSE ADDED. `PrivacyActions.tsx`
 * hands the browser `JSON.stringify(result.data, null, 2)` and this is the same
 * two arguments, so a person who exports from both surfaces gets the same
 * document rather than two dialects of it.
 *
 * WHAT IS DELIBERATELY NOT PREPENDED: a header line, a date, a "generado por
 * miMAR". They would make the payload no longer be valid JSON, which turns a
 * file another system can read into a message only a human can — and the point
 * of art. 14 is portability, not a printout. The envelope's `issuedAt` is
 * already inside the app if a screen ever needs to say when it was minted.
 */
export function exportShareText(view: { subject: Record<string, unknown> }): string {
  return JSON.stringify(view.subject, null, 2);
}
