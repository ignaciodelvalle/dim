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

// ---------------------------------------------------------------------------
// Roster console filters (/admin/govts) — pure input normalizers so the page
// can search + status-filter + truncate without special-casing seed rows.
// ---------------------------------------------------------------------------

/**
 * Status filter for the govt roster:
 *   - all      → every govt (default)
 *   - active   → deactivatedAt IS NULL
 *   - inactive → deactivatedAt IS NOT NULL
 *   - dead     → active but holding zero active localities (cannot operate)
 */
export type GovtStatusFilter = "all" | "active" | "inactive" | "dead";

/** Validate an untrusted `?status=` param down to a known filter. */
export function normalizeGovtStatus(raw: string | null | undefined): GovtStatusFilter {
  return raw === "active" || raw === "inactive" || raw === "dead" ? raw : "all";
}

/**
 * Returns the ids whose email contains `query` (case-insensitive substring).
 * Emails live in auth.users, not `profiles`, so an email search cannot be a
 * SQL ILIKE on the profiles query — the caller ORs these ids into the WHERE
 * clause instead. Empty/whitespace query returns no ids.
 */
export function matchEmailIds(emailMap: Map<string, string>, query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const ids: string[] = [];
  for (const [id, email] of emailMap) {
    if (email.toLowerCase().includes(q)) ids.push(id);
  }
  return ids;
}
