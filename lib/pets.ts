// Thin compatibility wrapper around `requirePetAccess` for server components
// that previously used the owner-only helper. The new helper accepts both the
// direct-owner path and the org-mediated path; the return shape stays compact
// for back-compat with existing page-side callers.

import { requirePetAccess } from "@/lib/pet-access";
import { notFound } from "next/navigation";

export async function requireOwnedPetByToken(publicToken: string) {
  const access = await requirePetAccess(publicToken);
  if (!access.ok) {
    // The route group's authenticated layout already redirects unauth'd users;
    // by the time we get here, the session is valid. A missing-pet or
    // out-of-scope-pet result becomes a 404 — the user IS logged in but
    // doesn't have any active access path to this pet.
    if (access.error === "Sesión expirada.") return null;
    notFound();
  }
  return {
    user: access.user,
    pet: access.pet,
    accessPath: access.accessPath,
    organization: access.organization,
  };
}
