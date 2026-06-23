// Pure predicates for the admin govt roster (/admin/govts).

/**
 * A "dead" govt account (C24): active at the profile level but holding zero
 * active locality assignments. Per AGENTS.md a govt needs ≥1 active assignment
 * to enter /gob, so an active govt with 0 localities cannot operate — it is a
 * dead account that the roster must flag ("sin localidades — no puede operar").
 *
 * Deactivated govts are never "dead" in this sense: they are already surfaced as
 * Desactivado, so the 0-localities state carries no additional warning for them.
 */
export function isDeadGovt(active: boolean, activeLocalityCount: number): boolean {
  return active && activeLocalityCount === 0;
}
