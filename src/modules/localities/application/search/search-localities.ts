// search-localities.ts — use-cases moved verbatim from app/actions/localities.ts
// (strangler 46/61). Rate-limit state, both search functions, and
// __resetRateLimitForTests are co-located so the reset helper resets the same
// state the searches use.
//
// Auth guard (requireUserOrRedirect) for searchLocalitiesAction is enforced by
// the caller (shim). This function receives the already-resolved userId.

import { type LocalitySearchResult, searchLocalities } from "@/lib/ar-localidades";
import { type ProvinceCode, provinceByCode } from "@/lib/reference/ar-provincias";

import type { SearchLocalitiesResult } from "./types";

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
// Exposed so a test can reset between cases. Not part of the public surface.
export async function __resetRateLimitForTests(): Promise<void> {
  rateLimitMap.clear();
}

export async function searchLocalitiesAction(
  userId: string,
  input: {
    provinceCode?: string;
    query: string;
  },
): Promise<SearchLocalitiesResult> {
  if (!checkRateLimit(userId)) {
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

// Public variant — identical logic but no auth guard. Safe because ar_localities
// is INDEC reference data (locality names only, no PII). Rate-limited by a
// dedicated bucket keyed on a fixed sentinel so anonymous callers share one
// window (generous enough for real typeahead use, tight enough against scraping).
const PUBLIC_RATE_LIMIT_SENTINEL = "__public__";

// @no-auth-required: ar_localities is public INDEC reference data (locality
// names only, no PII). Rate-limited via the shared __public__ bucket. Powers the
// public filter typeaheads (perdidas / adoptar) where there is no session.
export async function searchLocalitiesPublicAction(input: {
  provinceCode?: string;
  query: string;
}): Promise<SearchLocalitiesResult> {
  if (!checkRateLimit(PUBLIC_RATE_LIMIT_SENTINEL)) {
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
