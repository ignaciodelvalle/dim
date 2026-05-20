"use server";

// Server action wrapper around lib/performed-by-search. Auth-gated +
// rate-limited (60 req/min per session) — same shape as
// searchLocalitiesAction. Returns suggestions directly when ok,
// otherwise a typed error so the combobox can render a hint instead
// of throwing.

import { requireUserOrRedirect } from "@/lib/auth-guards";
import {
  type PerformedBySuggestion,
  type SearchJurisdiction,
  searchVetsAndClinics,
} from "@/lib/performed-by-search";

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

export async function __resetPerformedByRateLimitForTests(): Promise<void> {
  rateLimitMap.clear();
}

export type SearchPerformedByResult =
  | { results: PerformedBySuggestion[] }
  | { error: "rate_limited" };

export async function searchVetsAndClinicsAction(input: {
  query: string;
  jurisdiction?: SearchJurisdiction;
}): Promise<SearchPerformedByResult> {
  const { user } = await requireUserOrRedirect();
  if (!checkRateLimit(user.id)) return { error: "rate_limited" };
  const results = await searchVetsAndClinics(input.query, input.jurisdiction);
  return { results };
}
