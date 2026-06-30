// search-performed-by.ts — use-case moved verbatim from app/actions/performed-by.ts
// (strangler 60/61). Rate-limit state, searchVetsAndClinicsAction, and
// __resetPerformedByRateLimitForTests are co-located so the reset helper resets the same
// state the search uses.
//
// Auth guard (requireUserOrRedirect) is enforced by the caller (shim). This
// function receives the already-resolved userId.

import {
  type SearchJurisdiction,
  searchVetsAndClinics,
} from "@/lib/performed-by-search";

import { type SearchPerformedByResult } from "./types";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(sessionKey: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(sessionKey);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(sessionKey, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

// @no-auth-required: test-only utility, prefixed with `__` to mark non-public surface.
export async function __resetPerformedByRateLimitForTests(): Promise<void> {
  rateLimitMap.clear();
}

export async function searchVetsAndClinicsAction(
  userId: string,
  input: {
    query: string;
    jurisdiction?: SearchJurisdiction;
  },
): Promise<SearchPerformedByResult> {
  if (!checkRateLimit(userId)) return { error: "rate_limited" };
  const results = await searchVetsAndClinics(input.query, input.jurisdiction);
  return { results };
}
