import { expect, test } from "@playwright/test";

/**
 * `/api/v1` — the auth failure space a native client writes ONE handler for.
 *
 * WHY THIS SPEC AND NOT AN AUTHENTICATED HAPPY PATH
 * ---------------------------------------------------------------------------
 * The unit tests already prove every branch of this mapping against a real
 * local GoTrue (`__tests__/api-v1-me-route.test.ts` and siblings). What they
 * cannot prove is that the mapping SURVIVES DEPLOYMENT: middleware, the Vercel
 * edge, a WAF, and `next build`'s route resolution all sit between a phone and
 * the handler, and every one of them can turn a 401 with a code into a 401 with
 * an HTML body, a redirect, or a 200 that is not the endpoint's.
 *
 * That is the native-client regression this catches, and it is a real one:
 * `/api/v1` was built with "no redirects, there is no browser to redirect to"
 * as an explicit decision (ADR 2026-07-18, Decision 3). A framework upgrade or a
 * middleware matcher edit is exactly how a 401 becomes a 307 to `/login`, and a
 * native client handed that renders a login page inside a JSON parser.
 *
 * NO SIGN-IN, AND THAT IS THE DESIGN
 * ---------------------------------------------------------------------------
 * Every case here is a REFUSAL, so the spec never needs a credential. Which
 * means it never spends `auth_login_email` — 5/min · 20/hr keyed on the EMAIL,
 * where a unique `x-real-ip` does nothing, and whose only reset helper is
 * local-DB-only (`e2e/demo/_db-cleanup.ts`). In a serial nightly run against
 * staging, sharing that budget with every spec that logs in as `owner@dim.test`
 * is how a spec becomes the reason a LATER spec fails, which is the failure mode
 * `e2e/README.md`'s "Hard-won rules" section was written about.
 *
 * It costs one thing, stated: this proves the refusals and NOT that a valid
 * token works. The 200 path is covered by the unit suite against real GoTrue and
 * by `scripts/load-probe-api-v1.ts` against the deployed origin (which asserts a
 * per-route expected status, so a run of 401s fails instead of reporting a
 * flattering p95).
 *
 * NO FIXTURE, EITHER. Nothing here reads a seeded row, so there is no
 * `test.skip` in this file and there must never be one: every assertion is about
 * the SURFACE, and a surface is present or the deploy is broken.
 *
 * RATE LIMITS. These requests spend the `/api/v1` per-IP buckets, which
 * `playwright.staging.config.ts` already handles by stamping one random RFC 5737
 * documentation IP per run into `x-real-ip`. WU-EAS-2 raised the authenticated
 * read ceiling to 600/min (`lib/infra/api-v1-limits.ts`), so this file's ~20
 * requests are not close either way — but the header regex runs BEFORE the
 * limiter on every one of these routes, so a request with no `Authorization`
 * header costs no counter write at all.
 */

/** GET routes, and the refusal each must produce. */
const READ_ROUTES = [
  "/api/v1/me",
  "/api/v1/me/pets",
  "/api/v1/me/transfers",
  "/api/v1/me/caretaker-grants",
] as const;

/**
 * POST routes. Driven ONLY with a refused credential, so nothing is written.
 *
 * The order inside each handler is what makes this safe rather than merely
 * lucky: `createClientFromBearer` runs first, before the limiter and long before
 * the body is parsed, so a request with no usable header cannot reach a
 * use-case. Sending a body would not change that, and this spec sends none.
 */
const WRITE_ROUTES = [
  "/api/v1/me/transfers",
  "/api/v1/me/caretaker-grants",
  "/api/v1/me/revoke-sessions",
] as const;

/** A syntactically fine bearer that resolves to nobody. */
const DEAD_TOKEN = "Bearer not-a-real-jwt.but-shaped-like-one.aaaaaaaaaaaa";

test.describe("/api/v1 — refusals a native client can act on", () => {
  for (const path of READ_ROUTES) {
    test(`GET ${path} with NO header → 401 auth_required`, async ({ request }) => {
      const res = await request.get(path, { failOnStatusCode: false });

      // `auth_required` and not `auth_expired`, and the distinction is the whole
      // point of having two codes: this is a client BUG — it forgot the header.
      // Answering `auth_expired` is how a refresh loop gets written for a
      // request that never carried a token in the first place.
      expect(res.status(), `${path} must refuse an absent header with 401`).toBe(401);
      expect(await res.json()).toEqual({ error: "auth_required" });
    });

    test(`GET ${path} with a dead bearer → 401 auth_expired`, async ({ request }) => {
      const res = await request.get(path, {
        headers: { authorization: DEAD_TOKEN },
        failOnStatusCode: false,
      });

      // `auth_expired`: refresh once, then retry. The client's refresh logic
      // hangs off exactly this code.
      expect(res.status()).toBe(401);
      expect(await res.json()).toEqual({ error: "auth_expired" });
    });
  }

  for (const path of WRITE_ROUTES) {
    test(`POST ${path} with NO header → 401 auth_required`, async ({ request }) => {
      const res = await request.post(path, { failOnStatusCode: false });
      expect(res.status()).toBe(401);
      expect(await res.json()).toEqual({ error: "auth_required" });
    });
  }
});

test.describe("/api/v1 — what a refusal must never become in production", () => {
  test("never redirects — there is no browser to redirect", async ({ request }) => {
    // ADR 2026-07-18 Decision 3, asserted against the DEPLOYED stack rather than
    // against the handler. `maxRedirects: 0` makes a 3xx visible instead of
    // silently followed into an HTML login page — which is what a native client
    // would hand to `JSON.parse`.
    //
    // ASSERTED AS "NOT A 3XX", NOT AS "BELOW 300". This line read
    // `toBeLessThan(300)` on its first run and failed on the correct answer:
    // these routes refuse with 401, which is above 300 and is not a redirect.
    // A bound in the wrong direction is a check that can only pass by accident,
    // and it is worth leaving the note — the tempting fix is `toBeLessThan(400)`,
    // which would also accept a 307 to `/login`, the exact thing this asserts
    // against.
    for (const path of READ_ROUTES) {
      const res = await request.get(path, { maxRedirects: 0, failOnStatusCode: false });
      const status = res.status();
      expect(status >= 300 && status < 400, `${path} answered a redirect (${status})`).toBe(false);
    }
  });

  test("answers JSON, not an HTML error page", async ({ request }) => {
    // A refusal served by an edge/WAF layer instead of the handler is still a
    // 401 — with `text/html` and no code in it. The status alone cannot tell
    // those apart, which is why the content type is asserted separately.
    for (const path of READ_ROUTES) {
      const res = await request.get(path, { failOnStatusCode: false });
      expect(res.headers()["content-type"], `${path} content-type`).toContain("application/json");
    }
  });

  test("carries cache-control: no-store on every refusal", async ({ request }) => {
    // §4 of docs/architecture/api-invariants.md: `no-store` is NOT inherited —
    // middleware stamps it from a path-prefix allowlist that `/api/` is not on,
    // so every response sets it itself. A cached 401 would pin a client to a
    // refusal it has already fixed by refreshing.
    for (const path of READ_ROUTES) {
      const res = await request.get(path, { failOnStatusCode: false });
      expect(res.headers()["cache-control"], `${path} cache-control`).toContain("no-store");
    }
  });

  test("the error envelope is exactly one key", async ({ request }) => {
    // §2/§3: a single-key `{ error: "snake_case" }` body, no message, no field
    // detail, no stack. A refusal that grew a second key is a refusal that
    // started disclosing something, and it is the shape a client parses.
    const res = await request.get("/api/v1/me", { failOnStatusCode: false });
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["error"]);
    expect(typeof body.error).toBe("string");
  });
});
