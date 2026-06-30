"use server";

// omnibox-search.ts — thin shim (strangler 52/61, 2026-06-30).
//
// Business logic moved to:
//   src/modules/search/application/omnibox/

import { searchOmnibox } from "@/src/modules/search/application/omnibox/search-omnibox";
import { searchOmniboxOrg } from "@/src/modules/search/application/omnibox/search-omnibox-org";
import type { OmniboxResults } from "@/lib/omnibox-search";

export type { OmniboxResults } from "@/lib/omnibox-search";

export async function searchOmniboxAction(query: string): Promise<OmniboxResults> {
  return searchOmnibox(query);
}

export async function searchOmniboxOrgAction(
  orgToken: string,
  query: string,
): Promise<OmniboxResults> {
  return searchOmniboxOrg(orgToken, query);
}
