"use server";

// Operator omnibox search action — Wave 2 Item 10.1.
//
// Read-only, jurisdiction-scoped, PII-logged global search across pets,
// persons and cases. Backs components/ui/dashboard/OpOmnibox.tsx.
//
// Auth: requireAdminOrGovtOrRedirect — only admin / govt reach this. The
// returned jurisdictions drive the scope (empty for admin = universal).
//
// PII logging: every non-empty query writes ONE pii_queried audit row with the
// authenticated actor and the actual result count, mirroring /gob/usuarios.
// The log is fire-and-forget (void) so the dropdown is not blocked on the
// insert, but it is awaited-safe inside the action's lifetime.

import { logPiiQueryForAuthority } from "@/app/actions/admin-proposals";
import { requireAdminOrGovtOrRedirect } from "@/lib/auth-guards";
import { type OmniboxResults, searchOmnibox } from "@/lib/omnibox-search";

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

  // PII-query trail — same pattern as /gob/usuarios. Fire-and-forget so the
  // operator gets results immediately; the audit insert finishes in the
  // background within the request.
  void logPiiQueryForAuthority(user.id, trimmed, results.total, "omnibox");

  return results;
}
