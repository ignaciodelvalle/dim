// GET /api/v1/localities?q=…&province=AR-C — the INDEC locality typeahead.
//
// The endpoint a native client needs BEFORE it can register anything: a pet must
// always carry a jurisdiction (PO decision 2026-07-08 — a national registry
// needs at least the barrio/localidad as epidemiological signal), and a
// jurisdiction is not something a person types. They pick one from here, and
// `POST /api/v1/pets` re-resolves the pair they picked.
//
// WHY IT IS PUBLIC, AND WHY THAT IS PARITY RATHER THAN A LOOSENING
// ---------------------------------------------------------------------------
// The web has BOTH variants of this search and has since the strangler
// migration: `searchLocalitiesAction` (session-gated, used by the alta wizard
// and every authenticated picker) and `searchLocalitiesPublicAction` (no guard,
// used by the `/perdidas` and `/adoptar` filter bars). The public one is not an
// exception someone forgot to close — `ar_localities` is INDEC reference data,
// locality names and nothing else, with no PII of any kind in the table.
//
// This endpoint follows the PUBLIC variant, and the reason is a screen that does
// not exist yet on the web: a native signup can ask "¿dónde vivís?" before the
// account is confirmed, and an endpoint that 401s there would force a client to
// either bundle a stale copy of the national catalogue or reorder its onboarding
// around an authorization rule that protects nothing. Gating public reference
// data teaches clients to hoard it.
//
// It is BOUNDED instead of authorized, and by its OWN bucket
// (`api_v1_localities`, per IP) rather than the module's shared
// `localities_search:__public__` sentinel. Two reasons, both about being able to
// answer a question later: a single global window means one scraper starves
// every anonymous web filter bar at once, and a shared bucket makes "which
// surface is being hammered" unanswerable from the limiter's own storage.
//
// WHAT A SHORT QUERY ANSWERS, AND WHY IT IS NOT AN ERROR
// ---------------------------------------------------------------------------
// Under two characters returns 200 with `results: []`, exactly as the web action
// does. A typeahead fires on every keystroke; the first one is not a client
// error and must not be reported as one, or every native search box would flash
// a message on its way to working.

import {
  LOCALITIES_PAYLOAD_VERSION,
  LOCALITIES_STALE_AFTER_MS,
  type LocalitiesV1,
} from "@dim/contract/api";

import { apiV1Envelope, apiV1Error, apiV1Json } from "@/lib/infra/api-v1";
import { DbBudgetExceededError, withDbBudgetOrThrow } from "@/lib/infra/db-budget";
import { RateLimitError, callerIp, enforceRateLimit } from "@/lib/infra/rate-limit";
import { reportError } from "@/lib/infra/report-error";
import { runLocalitySearch } from "@/src/modules/localities/application/search/search-localities";

export const dynamic = "force-dynamic";

/**
 * One `LIKE` over `ar_localities.locality_slug`, capped at 20 rows.
 *
 * This comment used to say "one INDEXED ILIKE" and both halves were wrong
 * (WU-B review). The predicate is a `LIKE` on `locality_slug` — the
 * accent- and case-folded column, which is why it is not an ILIKE — and the
 * `pg_trgm` GIN index built by migration 0019 is on `locality_name`, a
 * different column, so it does not apply to this query at all. On a table of a
 * few thousand rows the sequential scan is fine and the budget below is sized
 * for it; what is NOT fine is a comment asserting an index that would have to
 * be built before anyone could rely on it.
 */
const LOCALITIES_BUDGET_MS = 3_000;

const UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

/**
 * Per-IP ceiling: 60/min, 600/hour.
 *
 * A typeahead is the highest-frequency legitimate request this API has, and the
 * budget is sized against the WORST honest client rather than the average one: a
 * 250 ms debounce firing continuously is 4 req/s in theory but ~1/s in practice
 * once a person is actually typing a locality name, and 60/min sits above that
 * with room for a user who backspaces and retypes. Someone filling in an
 * address, changing their mind and doing it again spends well under 20.
 *
 * The hour ceiling is what actually bounds a scraper: 600/hour × 20 rows is
 * 12.000 rows an hour against a catalogue of 4.141 rows (measured on the local
 * database, 2026-08-25 — the figure here said ~15.000 and was never checked)
 * that is already published by INDEC. So the limiter never made the catalogue
 * hard to obtain and was never trying to: a scraper clears the whole thing in
 * under half an hour either way. What it protects is the pooler. Kept generous
 * on purpose: this endpoint stands between a citizen and a completed
 * registration, and a false throttle here costs a pet its credential.
 */
const LOCALITIES_LIMIT = { maxPerMinute: 60, maxPerHour: 600 };

// @no-auth-required: `ar_localities` is public INDEC reference data — locality
// names, slugs, province codes and department names, no PII in the table at all.
// The web serves the same rows anonymously to the /perdidas and /adoptar filter
// bars (`searchLocalitiesPublicAction`), and a native signup needs them before
// there is a session to gate on. Bounded instead of authorized, by the per-IP
// `api_v1_localities` budget below.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  // Optional narrowing, exactly as the web action takes it. An unknown code is a
  // client error (400) rather than a silent full-country search: a client that
  // asked for one province and got every province would render the wrong list
  // with no way to notice.
  const provinceCode = (url.searchParams.get("province") ?? "").trim();

  // Derived from the REQUEST, never from a middleware-stamped header: those
  // default silently when the matcher does not run, and a value the request
  // influences must not decide what a caller may do (check-api-guard-headers).
  try {
    await enforceRateLimit("api_v1_localities", callerIp(request.headers), LOCALITIES_LIMIT);
  } catch (err) {
    if (err instanceof RateLimitError) return apiV1Error("rate_limited", 429);
    // FAIL OPEN, matching every sibling limiter in this repo. The limiter is
    // itself a DB write; if it cannot answer, refusing here would stop people
    // registering pets over an abuse control on PUBLIC reference data. Reported
    // because a limiter that stopped working is an incident even though the
    // request continues.
    reportError("api-v1-localities/rate-limit", err, {});
  }

  let result: Awaited<ReturnType<typeof runLocalitySearch>>;
  try {
    result = await withDbBudgetOrThrow(
      runLocalitySearch({
        query,
        ...(provinceCode ? { provinceCode } : {}),
      }),
      LOCALITIES_BUDGET_MS,
      "api-v1-localities",
    );
  } catch (err) {
    if (err instanceof DbBudgetExceededError) {
      return apiV1Error("temporarily_unavailable", 503, {
        "retry-after": String(UNAVAILABLE_RETRY_AFTER_SECONDS),
      });
    }
    throw err;
  }

  if ("error" in result) {
    switch (result.error) {
      case "invalid_province":
        return apiV1Error("invalid_request", 400);
      // Unreachable through `runLocalitySearch`, which runs no limiter — it is
      // the two ACTION wrappers that can answer this. Handled anyway so the
      // union stays exhaustive: a future limiter inside the search would
      // otherwise fall through to a 200 with no results, which reads to a client
      // as "no such locality".
      case "rate_limited":
        return apiV1Error("rate_limited", 429);
      default: {
        const unhandled: never = result.error;
        throw new Error(`Unhandled locality search failure: ${JSON.stringify(unhandled)}`);
      }
    }
  }

  const payload: LocalitiesV1 = {
    ...apiV1Envelope({
      payloadVersion: LOCALITIES_PAYLOAD_VERSION,
      staleAfterMs: LOCALITIES_STALE_AFTER_MS,
    }),
    // Projected down to the five fields a client renders and sends back. The
    // catalogue row also carries the `ar_localities` uuid (the app's structural
    // FK) and a `matchKind` ranking signal; neither belongs on a wire. See
    // `LocalityV1` for why each omission is deliberate.
    results: result.results.map((row) => ({
      localityName: row.localityName,
      localitySlug: row.localitySlug,
      provinceCode: row.provinceCode,
      provinceName: row.provinceName,
      departmentName: row.departmentName,
    })),
  };

  return apiV1Json(payload, { status: 200 });
}
