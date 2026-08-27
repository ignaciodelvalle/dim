// check-api-v1-envelope — every `/api/v1` route answers through ONE door
// (RN-1 G1-G4, 2026-08-22).
//
// THE DEFECT THIS EXISTS FOR
// ---------------------------------------------------------------------------
// docs/architecture/api-invariants.md §2/§4/§6/§9 say what every `/api/v1`
// response must carry: `cache-control: no-store` set explicitly (it is NOT
// inherited — middleware's allowlist is a path-prefix list `/api/` is not on),
// the single-key `{ error: "snake_case" }` envelope from the contract
// package's vocabulary, and `payloadVersion` / `issuedAt` / `staleAfter` on
// reads. The first endpoint satisfied all of it through a PRIVATE helper in
// its own file. That is file-local discipline: the second route has to know to
// copy it, and the one that forgets is the one that reopens the stale
// "SE BUSCA + owner phone" class closed on 2026-07-07. A checklist in a doc is
// not a fence.
//
// WHAT IS BANNED, AND WHY IT IS THE SUBJECT AND NOT A SPELLING
// ---------------------------------------------------------------------------
// (a) BUILDING A RESPONSE BY HAND in a `/api/v1` route — `NextResponse.json(`,
//     `new NextResponse(`, `new Response(`, `Response.json(` — and not
//     importing `apiV1Json` / `apiV1Error` from lib/infra/api-v1.ts. The
//     subject is "a response the helper did not build"; the four spellings are
//     the ways Next and the platform offer to do that, and the import check is
//     what catches a fifth one this list does not name (a route that builds
//     nothing through the helper has no reason to import it).
// (b) A COMPUTED LIMITER BUCKET — the surface bucket handed to
//     `publicTokenThrottle(` AND, when the route layers a per-lookup limiter,
//     the `perLookup.bucket` too (G4). A variable bucket is how one surface
//     starts spending another's counter, and it makes "which surface is being
//     hammered" unanswerable from the limiter's own storage. The throttle
//     coverage TEST enforces the same rule over every door caller; this fence
//     repeats it for `/api/v1` so the rule is visible from `pnpm verify`, not
//     only from the suite.
// (c) AUTHORIZATION — the route handler rule from scripts/check-authz-guards.ts
//     (D4), reused verbatim: each exported handler calls a recognised guard or
//     carries `@no-auth-required: <reason>`. lint:authz already runs it over
//     every route.ts; repeating it here keeps "is this v1 route ready" one
//     command.
//
// Comments are stripped before every check (scripts/lib/strip-comments.mjs),
// so a docblock that names `NextResponse.json(` while explaining why it is
// banned does not trip the fence — a fence that penalises correct
// documentation teaches worse comments.
//
// STATED BLIND SPOTS: a response built in a helper module the route imports
// (the fence reads the route file only; the import check catches the route
// that never touches the helper, not one that wraps it); a bucket literal
// assembled from a template with no `${}` (reads as a literal — it IS one); and
// string-literal contents, which stripComments keeps.
//
// Run: pnpm tsx scripts/check-api-v1-envelope.ts   (or: pnpm lint:api-v1)

import { globSync, readFileSync } from "node:fs";

import { findRouteHandlerOffenders } from "./check-authz-guards";
import { stripComments } from "./lib/strip-comments.mjs";

export const V1_ROUTE_GLOB = "app/api/v1/**/route.ts";

/**
 * Non-vacuity floor. A glob that stops matching produces an empty list, an
 * empty list produces no offenders, and no offenders reads exactly like a
 * clean run.
 *
 * FOUR since WU-A (2026-08-25): the public credential, plus `/auth/login`,
 * `/auth/signup` and `/me`. Raised in the same commit that added them, because
 * a floor of 1 over a surface of 4 stops being a floor — three routes could
 * fall out of the glob (a directory rename, a `route.tsx`) and this check would
 * still report success over the one that remained. Raise it with every route
 * that lands; that is the whole job of the number.
 *
 * SEVEN since WU-B: `GET /api/v1/localities`, `GET /api/v1/me/pets` and
 * `POST /api/v1/pets`. Note that `/me` and `/pets` each now have a route
 * alongside a CHILD route — `app/api/v1/pets/route.ts` next to
 * `app/api/v1/pets/[publicToken]/credential/route.ts` — which is precisely the
 * arrangement a `**` glob can silently stop matching after a directory rename.
 *
 * TEN since WU-J. The floor had drifted: `GET /api/v1/me/revoke-sessions` and
 * `GET /api/v1/pets/{publicToken}` both landed without raising it, so a fence
 * whose whole job is "the glob still matches" was checking 7 against 9 — two
 * routes could have fallen out and this would still have read as clean. Caught
 * while adding `libreta`, which makes 10. RAISE THIS WITH EVERY ROUTE THAT
 * LANDS; a floor nobody raises is a floor that stops being one.
 *
 * ELEVEN with the event detail (`pets/{token}/events/{eventId}`), which adds a
 * THIRD level of dynamic segment under `pets/` — the arrangement a `**` glob is
 * most likely to stop matching after a rename. TWELVE with the correction
 * write (`.../events/{eventId}/amend`).
 *
 * FOURTEEN with lost mode (`pets/{token}/lost`), AND IT HAD DRIFTED AGAIN: the
 * count was 12 against a surface of 13, because `POST .../events` landed in WU-K
 * without raising it. That is the second time — the paragraph above records the
 * first — which says something about the instruction and not about the two
 * authors who missed it: a number that has to be edited by hand in a file nobody
 * opens while adding a route will keep drifting. Until the floor is derived (a
 * committed manifest of route paths would do it, and would also catch a rename),
 * RAISING IT IS PART OF ADDING A ROUTE. A floor nobody raises stops being one.
 *
 * FIFTEEN with compartir (`pets/{token}/shares`), raised in the same commit that
 * added the route — which is the whole instruction above, followed for once
 * without a paragraph having to be written about it afterwards. The count was
 * 14 against a surface of 14 when this landed, so the two paragraphs of drift
 * recorded above had been closed and stayed closed.
 *
 * SIXTEEN with transferencias (`me/transfers`), raised in the same commit again.
 * Note what this one adds to the shape the glob has to keep matching: it is the
 * first CHILD route under `me/` that is a directory rather than a leaf —
 * `app/api/v1/me/route.ts`, `me/pets/route.ts`, `me/revoke-sessions/route.ts`
 * and now `me/transfers/route.ts` — so `me/` has three siblings a rename could
 * take out together, which is exactly the arrangement this floor exists for.
 *
 * SEVENTEEN with cuidador temporal (`me/caretaker-grants`), raised in the same
 * commit that added the route — the fourth in a row, which is what turns an
 * instruction into a habit. It is the first route on this surface whose
 * directory name contains a HYPHEN, so it is also the first that would be missed
 * by any future narrowing of the glob to a word-character segment.
 *
 * EIGHTEEN with the inbox (`me/notifications`), raised in the same commit that
 * added the route — the fifth in a row. `me/` now has FIVE siblings a directory
 * rename could take out together, which is the arrangement this floor was raised
 * to seventeen for one route ago and is the reason it keeps being worth raising.
 *
 * NINETEEN with password recovery (`auth/password-reset`), raised in the same
 * commit that added the route — the sixth in a row. It is the first route to
 * JOIN `auth/` since that directory was created, and `auth/` is the arrangement
 * this floor exists for in its other half: a set of siblings that no `me/`-shaped
 * glob covers, which a single directory rename would take out together and which
 * nothing but this number would then notice. The count of them is not written
 * here on purpose — `listV1RouteFiles()` is the list that cannot lie.
 */
export const MIN_V1_ROUTE_FILES = 19;

export const HELPER_MODULE = "@/lib/infra/api-v1";

/** The ways a handler builds a response without the helper. */
const HAND_BUILT_RESPONSES: ReadonlyArray<{ label: string; re: RegExp }> = [
  { label: "NextResponse.json(", re: /\bNextResponse\.json\s*\(/ },
  { label: "new NextResponse(", re: /\bnew\s+NextResponse\s*\(/ },
  { label: "new Response(", re: /\bnew\s+Response\s*\(/ },
  // Anchored on a non-identifier char so `NextResponse.json(` does not count twice.
  { label: "Response.json(", re: /(?:^|[^\w.$])Response\.json\s*\(/ },
];

const LITERAL_BUCKET = /^"[a-z_]+"$/;

export function listV1RouteFiles(): string[] {
  return globSync(V1_ROUTE_GLOB)
    .map((f) => f.replaceAll("\\", "/"))
    .filter((f) => !/\.test\.[jt]sx?$/.test(f))
    .sort();
}

function importsHelper(code: string): boolean {
  const m = code.match(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/infra\/api-v1["']/);
  if (!m) return false;
  return /\bapiV1(?:Json|Error)\b/.test(m[1]);
}

/** The first argument of every `publicTokenThrottle(` call, trimmed. */
function surfaceBucketArgs(code: string): string[] {
  const out: string[] = [];
  const re = /publicTokenThrottle\(\s*([^,)]*)/g;
  for (let m = re.exec(code); m !== null; m = re.exec(code)) out.push(m[1].trim());
  return out;
}

/** The `bucket:` value inside every `perLookup: { … }` object, trimmed. */
function perLookupBucketArgs(code: string): string[] {
  const out: string[] = [];
  const re = /perLookup\s*:\s*\{([^}]*)\}/g;
  for (let m = re.exec(code); m !== null; m = re.exec(code)) {
    const bucket = m[1].match(/\bbucket\s*:\s*([^,}]*)/);
    if (bucket) out.push(bucket[1].trim());
  }
  return out;
}

/**
 * One problem line per violation in a `/api/v1` route. `relPath` is used for
 * the message and for the reused authz rule.
 */
export function findEnvelopeViolations(relPath: string, src: string): string[] {
  const problems: string[] = [];
  const code = stripComments(src);
  const lines = code.split("\n");

  // (a) the helper, and nothing but the helper
  if (!importsHelper(code)) {
    problems.push(
      `${relPath}: does not import apiV1Json/apiV1Error from ${HELPER_MODULE} — every /api/v1 response goes through them so cache-control: no-store and the error envelope cannot be forgotten per branch.`,
    );
  }
  for (const [i, line] of lines.entries()) {
    for (const { label, re } of HAND_BUILT_RESPONSES) {
      if (re.test(line)) {
        problems.push(
          `${relPath}:${i + 1} builds a response by hand (\`${label}\`) — use apiV1Json/apiV1Error (${HELPER_MODULE}) so no branch can drop cache-control: no-store or the { error } envelope.`,
        );
      }
    }
  }

  // (b) literal buckets, surface and per-lookup
  for (const arg of surfaceBucketArgs(code)) {
    if (!LITERAL_BUCKET.test(arg)) {
      problems.push(`${relPath}: limiter bucket must be a string literal, got \`${arg}\``);
    }
  }
  for (const arg of perLookupBucketArgs(code)) {
    if (!LITERAL_BUCKET.test(arg)) {
      problems.push(
        `${relPath}: perLookup bucket must be a string literal, got \`${arg}\` — a computed per-lookup bucket is the same hole as a computed surface bucket (G4).`,
      );
    }
  }

  // (c) authorization — the route-handler rule, reused
  problems.push(...findRouteHandlerOffenders(relPath, src));

  return problems;
}

function runCheck(): void {
  const files = listV1RouteFiles();
  if (files.length < MIN_V1_ROUTE_FILES) {
    console.error(
      `✗ check-api-v1-envelope: found ${files.length} route(s) under ${V1_ROUTE_GLOB} (floor ${MIN_V1_ROUTE_FILES}). The glob is broken — a fence that scans nothing reports success.`,
    );
    process.exit(1);
  }

  const problems = files.flatMap((f) => findEnvelopeViolations(f, readFileSync(f, "utf8")));
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    console.error(
      `\n✗ ${problems.length} /api/v1 envelope violation(s) across ${files.length} route(s). See docs/architecture/api-invariants.md §9.`,
    );
    process.exit(1);
  }

  console.log(
    `✓ api-v1 envelope clean — ${files.length} /api/v1 route(s) answer only through apiV1Json/apiV1Error, name every limiter bucket (surface and per-lookup) as a literal, and are authorized or justified-public.`,
  );
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-api-v1-envelope.ts") ||
    process.argv[1].endsWith("check-api-v1-envelope.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runCheck();
}
