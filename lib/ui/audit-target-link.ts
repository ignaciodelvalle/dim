// Pure helper: derives a display href for an audit log target user.
//
// Used by app/admin/auditoria/page.tsx (C12) to render "sobre: {targetName}" with
// a link when the target's role is resolvable to a known admin entity page.
//
// Rules:
//   - role "admin"  → /admin/admins/{id}
//   - role "govt"   → /admin/govts/{id}
//   - any other role → null (render name only, no link)
//
// Returning null is intentional and safe — the RSC renders the name without a link.

export type KnownRole = "admin" | "govt" | "owner" | "vet" | string;

export interface TargetLinkInfo {
  id: string;
  displayName: string;
  href: string | null;
}

/**
 * Given a target's profile row, returns the display name and an href (or null).
 * Pure function — no DB calls, fully unit-testable.
 */
export function deriveTargetHref(id: string, role: KnownRole): string | null {
  if (role === "admin") return `/admin/admins/${id}`;
  if (role === "govt") return `/admin/govts/${id}`;
  return null;
}

/**
 * Builds TargetLinkInfo from a profile row.
 */
export function buildTargetLinkInfo(profile: {
  id: string;
  displayName: string;
  role: KnownRole;
}): TargetLinkInfo {
  return {
    id: profile.id,
    displayName: profile.displayName,
    href: deriveTargetHref(profile.id, profile.role),
  };
}
