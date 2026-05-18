"use server";

// Server-action wrapper around lib/ar-localidades. Pure search reads — no
// writes. Same writer/wrapper split as bookSlotWriter / bookSlotAction.
//
// Auth gating: requireUserOrRedirect. Anonymous traffic cannot hit the
// catalog (the search is fundamentally a per-session UX affordance).
//
// Rate limit: 60 req/min per session, in-memory token bucket. Below the
// debounced typeahead's call rate by ~3x; if a user hits the limit, the UI
// surfaces a non-fatal "demasiadas búsquedas, esperá un segundo" hint and
// the next call (a tick later) succeeds.

import { type LocalitySearchResult, searchLocalities } from "@/lib/ar-localidades";
import { type ProvinceCode, provinceByCode } from "@/lib/ar-provincias";
import { requireUserOrRedirect } from "@/lib/auth-guards";

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

// Exposed so a test can reset between cases. Not part of the public surface.
export async function __resetRateLimitForTests(): Promise<void> {
  rateLimitMap.clear();
}

export type SearchLocalitiesResult =
  | { results: LocalitySearchResult[] }
  | { error: "rate_limited" | "invalid_province" };

export async function searchLocalitiesAction(input: {
  provinceCode?: string;
  query: string;
}): Promise<SearchLocalitiesResult> {
  const { user } = await requireUserOrRedirect();

  if (!checkRateLimit(user.id)) {
    return { error: "rate_limited" };
  }

  if (input.query.length < 2) return { results: [] };

  let provinceCode: ProvinceCode | undefined;
  if (input.provinceCode) {
    const province = provinceByCode(input.provinceCode);
    if (!province) return { error: "invalid_province" };
    provinceCode = province.code as ProvinceCode;
  }

  const results = await searchLocalities({
    provinceCode,
    query: input.query,
    limit: 20,
  });

  return { results };
}
