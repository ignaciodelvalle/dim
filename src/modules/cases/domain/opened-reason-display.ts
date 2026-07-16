// opened-reason-display — es-AR display entry point for cases.opened_reason
// and cases.closed_reason.
//
// Dispatch, in one line: a row with a structured code renders from the code;
// everything else renders from prose via the frozen regex layer.
//
//   opened_reason_code present  → opened-reason-render.ts  (post-cutover)
//   opened_reason_code null     → opened-reason-legacy.ts  (pre-cutover, FROZEN)
//
// The two columns are mutually redundant by design: a structured row whose
// params fail to parse (older deploy, hand-fixed row, seed) still renders
// correctly from its prose. That redundancy is what the dual-write buys, and
// it is why this function never throws.
//
// Import path is unchanged from before the structured path existed — callers
// keep importing `openedReasonDisplay` / `caseClosedReasonLabel` from here.

export { LEGACY_RULE_COUNT, openedReasonDisplay } from "./opened-reason-legacy";

/**
 * Render `cases.closed_reason` (CASE_CLOSED_REASONS in db/schema.ts) as
 * es-AR. Feminine agreement matches the case-ish nouns these appear next to
 * ("Investigación", "Denuncia"). Unknown values pass through; null renders
 * empty (callers guard for presence).
 */
export function caseClosedReasonLabel(reason: string | null): string {
  switch (reason) {
    case "resolved":
      return "Resuelta";
    case "cancelled":
      return "Cancelada";
    case "auto_expired":
      return "Cerrada automáticamente";
    case "merged":
      return "Fusionada";
    case null:
      return "";
    default:
      return reason;
  }
}
