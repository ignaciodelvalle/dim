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
