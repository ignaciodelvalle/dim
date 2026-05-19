// Role-based post-login landing page resolution.
//
// Centralises the "where do I send this user after login?" logic so the
// three call-sites (loginAction, LoginPage, root page) stay in sync.
//
// Rules (priority order):
//  1. admin  → /admin
//  2. govt   → /gob
//  3. vet    → /pro
//  4. owner with active org-admin membership → /org  (index redirects to their org)
//  5. everyone else → /mis-mascotas

export function pathForRole(role: string, hasOrgMembership: boolean): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "govt":
      return "/gob";
    case "vet":
      return "/pro";
    case "owner":
      return hasOrgMembership ? "/org" : "/mis-mascotas";
    default:
      return "/mis-mascotas";
  }
}

// Validate a post-auth returnTo URL. Only same-origin paths starting with a
// single "/" are allowed — rejects protocol-relative ("//evil.com"),
// backslash tricks, and absolute URLs. Returns null when the input is unsafe,
// so callers can fall back to their role-based default.
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  const decoded = (() => {
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  })();
  if (!decoded) return null;
  if (!decoded.startsWith("/")) return null;
  if (decoded.startsWith("//")) return null;
  if (decoded.includes("\\")) return null;
  return decoded;
}
