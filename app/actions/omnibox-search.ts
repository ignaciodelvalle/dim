"use server";

// Operator omnibox search actions — Wave 2 Item 10.1 / UX 1.1.
//
// Two actions:
//   searchOmniboxAction       — admin / govt portal. Returns persons + cases.
//   searchOmniboxOrgAction    — org portal. Returns org-held pets only.
//
// Both are read-only, PII-logged. Auth is enforced before any DB access.
//
// PII logging: every non-empty query writes ONE pii_queried audit row with the
// authenticated actor and the actual result count, mirroring /gob/usuarios.
// The log is fire-and-forget (void) so the dropdown is not blocked on the
// insert, but it is awaited-safe inside the action's lifetime.

import { logPiiQueryForAuthority } from "@/app/actions/admin-proposals";
import { requireAdminOrGovtOrRedirect, requireOrgAccessByToken } from "@/lib/auth-guards";
import { type OmniboxResults, searchOmnibox } from "@/lib/omnibox-search";
import { getGrantedCapabilities } from "@/src/modules/organizations/infrastructure/authz-resolver";

// Minimum query length before we touch the DB or log a PII read. A single
// character is too broad to be a meaningful lookup and would log noise.
const MIN_QUERY_LENGTH = 2;

const EMPTY: OmniboxResults = { pets: [], persons: [], cases: [], total: 0 };

export async function searchOmniboxAction(query: string): Promise<OmniboxResults> {
  const { user, profile, jurisdictions } = await requireAdminOrGovtOrRedirect();

  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return EMPTY;

  const results = await searchOmnibox(
    trimmed,
    profile.role === "admin" ? { role: "admin" } : { role: "govt", jurisdictions },
  );

  // PII-query trail — same pattern as /gob/usuarios. Awaited: under Ley 25.326
  // the access audit must be durable. Fire-and-forget loses the insert if the
  // serverless function is frozen/killed after the response, leaving an
  // unlogged PII access.
  await logPiiQueryForAuthority(user.id, trimmed, results.total, "omnibox");

  return results;
}

export async function searchOmniboxOrgAction(
  orgToken: string,
  query: string,
): Promise<OmniboxResults> {
  const { user, organization, membership } = await requireOrgAccessByToken(orgToken);

  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return EMPTY;

  // Capability gate — same canRead check the mascotas page uses.
  const granted = await getGrantedCapabilities(membership);
  if (!(granted.has("pet.read_held") || membership.role === "admin")) return EMPTY;

  const results = await searchOmnibox(trimmed, {
    role: "org",
    organizationId: organization.id,
    orgToken,
  });

  await logPiiQueryForAuthority(user.id, trimmed, results.total, "omnibox");

  return results;
}
