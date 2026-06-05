// Pure helpers for org membership role classification.
// Kept in lib/ (not app/actions/) so they can be imported in tests
// without triggering Next.js "use server" restrictions.

const MANAGER_ROLES = ["admin", "coordinator"] as const;

/** Returns true when the given membership role has manager-level access
 *  (i.e. is allowed to add/remove/set-primary coverage zones). */
export function isManagerRole(role: string): boolean {
  return (MANAGER_ROLES as readonly string[]).includes(role);
}
