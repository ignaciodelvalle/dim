// Pure href builders for the /gob/reglas admin-lens jurisdiction drill-down
// (design ADR-1 — folded in from the old /admin/jurisdicciones surface).
//
// The dynamic route is /gob/reglas/[country]/[province]/[locality] where the
// "_" segment is the sentinel for "null" (country-wide or province-wide).
// These helpers centralize the segment encoding so the admin lens and the
// locality drill-down (AC4) can't diverge — in particular so a real locality
// name lands in the [locality] segment instead of "_".
//
// No React, no async — kept pure so the resolver is unit-testable in isolation.

const NULL_SEGMENT = "_";

function seg(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return NULL_SEGMENT;
  return encodeURIComponent(value);
}

/**
 * Build the rules list href for a jurisdiction tuple. Pass `null` (or omit) for
 * province/locality to target the country-wide or province-wide scope.
 *
 * Examples:
 *   buildJurisdictionRulesHref({ country: "AR" })
 *     -> /gob/reglas/AR/_/_
 *   buildJurisdictionRulesHref({ country: "AR", province: "Buenos Aires" })
 *     -> /gob/reglas/AR/Buenos%20Aires/_
 *   buildJurisdictionRulesHref({ country: "AR", province: "Buenos Aires", locality: "La Plata" })
 *     -> /gob/reglas/AR/Buenos%20Aires/La%20Plata
 */
export function buildJurisdictionRulesHref(input: {
  country: string;
  province?: string | null;
  locality?: string | null;
}): string {
  const country = seg(input.country);
  const province = seg(input.province);
  const locality = seg(input.locality);
  return `/gob/reglas/${country}/${province}/${locality}`;
}
