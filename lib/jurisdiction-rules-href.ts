// Pure href builders for the /admin/jurisdicciones rules drill-down.
//
// The dynamic route is /admin/jurisdicciones/[country]/[province]/[locality]/reglas
// where the "_" segment is the sentinel for "null" (country-wide or
// province-wide). These helpers centralize the segment encoding so the index
// page and the locality drill-down (AC4) can't diverge — in particular so a
// real locality name lands in the [locality] segment instead of "_".
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
 *     -> /admin/jurisdicciones/AR/_/_/reglas
 *   buildJurisdictionRulesHref({ country: "AR", province: "Buenos Aires" })
 *     -> /admin/jurisdicciones/AR/Buenos%20Aires/_/reglas
 *   buildJurisdictionRulesHref({ country: "AR", province: "Buenos Aires", locality: "La Plata" })
 *     -> /admin/jurisdicciones/AR/Buenos%20Aires/La%20Plata/reglas
 */
export function buildJurisdictionRulesHref(input: {
  country: string;
  province?: string | null;
  locality?: string | null;
}): string {
  const country = seg(input.country);
  const province = seg(input.province);
  const locality = seg(input.locality);
  return `/admin/jurisdicciones/${country}/${province}/${locality}/reglas`;
}
