/**
 * Link-integrity guard test
 *
 * Deterministic, no-DB, no-network.
 *
 * WHAT IT DOES
 * ─────────────
 * 1. Builds a route map by walking app/ for page.tsx + route.ts files.
 *    - Strips the leading "app/" prefix.
 *    - Strips route-group segments (parenthesised, e.g. "(public)", "(app)").
 *    - Strips the trailing "/page.tsx" or "/route.ts" filename.
 *    - Converts [...segment] → "**" (catch-all) and [segment] → "*" (dynamic).
 *
 * 2. Collects every STATIC internal link path from:
 *    - components/layout/nav-presets.ts  → PUBLIC_NAV, OWNER_NAV, GOB_NAV,
 *                                          ADMIN_NAV, buildOrgNav (placeholder token)
 *    - components/layout/AppFooter.tsx   → DEFAULT_COLUMNS constant
 *    - lib/event-capture-registry.ts     → entries whose route starts with "/"
 *                                          (prefixed with /mis-mascotas/[token])
 *    - Regex scan of href="/…" string literals across app/ and components/
 *
 * 3. SKIPS:
 *    - External URLs (http:// / https://)
 *    - Template-literal hrefs (dynamic — cannot be statically resolved)
 *    - ?sheet= param-only links (SheetMounter sheets — no dedicated page.tsx)
 *    - /api/* routes
 *    - Dev-only pages: /design, /design/dashboards
 *    - mailto: / tel: schemes
 *    - Query-string suffixes (stripped before resolution)
 *
 * 4. RESOLVES a link against the route map:
 *    - Exact match wins.
 *    - Dynamic patterns: * matches a single path segment ([^/?]+),
 *      ** matches any path (catch-all, [^?]+).
 *    - Root "/" resolves against the top-level app/page.tsx pattern.
 *
 * 5. ASSERTS every collected link resolves; failure message names the dead link.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

// ─── 1. Build route map ──────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(REPO_ROOT, "app");

/**
 * Walk a directory recursively and call collect() for every file.
 */
function walkDir(dir: string, collect: (filePath: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, collect);
    } else if (entry.isFile()) {
      collect(full);
    }
  }
}

/**
 * Convert a filesystem path under app/ to a URL pattern string.
 *
 * Steps:
 *   1. Make relative to app/, normalise separators to "/".
 *   2. Strip trailing "/page.tsx" or "/route.ts".
 *   3. Remove route-group segments: segments matching /^\([^)]+\)$/.
 *   4. Replace [...segment] with "**" and [segment] with "*".
 *   5. Prepend "/" to form a URL-like pattern.
 *
 * Root page.tsx → "/" (the root route).
 */
function filePathToRoutePattern(absolutePath: string): string {
  // Relative to app/, forward-slashes.
  let rel = path.relative(APP_DIR, absolutePath).replace(/\\/g, "/");

  // Strip the filename.
  // Two cases:
  //   a) "some/dir/page.tsx"  → strip "/page.tsx"  → "some/dir"
  //   b) "page.tsx"           → root page, no leading slash; strip directly → ""
  if (rel === "page.tsx" || rel === "route.ts") {
    rel = "";
  } else {
    rel = rel.replace(/\/(page\.tsx|route\.ts)$/, "");
  }

  // Split into segments, drop route-group segments (e.g. "(public)", "(app)").
  const segments = rel.split("/").filter((seg) => !/^\([^)]+\)$/.test(seg));

  // Replace Next.js dynamic segment syntax.
  const normalised = segments.map((seg) => {
    if (/^\[\.{3}[^\]]+\]$/.test(seg)) return "**"; // [...catchAll]
    if (/^\[[^\]]+\]$/.test(seg)) return "*"; // [dynamic]
    return seg;
  });

  const joined = normalised.join("/");
  return joined === "" ? "/" : `/${joined}`;
}

// Collect all page.tsx and route.ts → route patterns.
const routePatterns = new Set<string>();

walkDir(APP_DIR, (filePath) => {
  const name = path.basename(filePath);
  if (name === "page.tsx" || name === "route.ts") {
    routePatterns.add(filePathToRoutePattern(filePath));
  }
});

// ─── 2. Resolve a link path against the route map ────────────────────────────

/**
 * Compile a route pattern to a regex for matching.
 *   *  → matches a single non-slash, non-query segment  ([^/?]+)
 *   ** → matches any non-empty path                      ([^?]+)
 */
function patternToRegex(pattern: string): RegExp {
  // Build the regex in two passes:
  //   1. Escape all regex metacharacters EXCEPT `*` (we handle it ourselves).
  //   2. Replace `**` with a catch-all token, then `*` with a single-segment token.
  //
  // Important: do NOT include `*` in the escape set — we need it unescaped so we
  // can match on it literally in step 2.
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex metacharacters (not *)
    .replace(/\*\*/g, "[^?]+") // ** → any path (catch-all, no query string)
    .replace(/\*/g, "[^/?]+"); // * → single non-slash segment
  return new RegExp(`^${escaped}$`);
}

const compiledPatterns: Array<{ pattern: string; regex: RegExp }> = [];
for (const p of routePatterns) {
  compiledPatterns.push({ pattern: p, regex: patternToRegex(p) });
}

/**
 * Strip query-string AND hash-fragment from a path before resolution.
 * Routing is based purely on the path component; neither params (?…) nor
 * same-page anchors (#…) affect which page.tsx resolves — e.g. the home
 * capture deep-link "/inicio#asentar" resolves via "/inicio".
 */
function stripQuery(href: string): string {
  return href.split(/[?#]/)[0] ?? href;
}

function resolves(href: string): boolean {
  const clean = stripQuery(href);
  // Exact match first (fastest path).
  if (routePatterns.has(clean)) return true;
  // Pattern match (handles dynamic segments like [publicToken]).
  return compiledPatterns.some(({ regex }) => regex.test(clean));
}

// ─── 3. Collect static link sources ──────────────────────────────────────────

/**
 * Skip rules applied before resolution.
 * Add entries here when a link is intentionally unresolvable as a static page.
 */
function shouldSkip(href: string): boolean {
  // Anchor-only / deferred-nav sentinels (e.g. #defer-control-poblacional): client
  // anchors, never a page route. Includes the `deferred` NavItem affordance
  // (plan 2026-06-23-population-cycle-deferred-nav-handoff.md) whose #defer-… hrefs
  // are intentionally unresolvable.
  if (href.startsWith("#")) return true;
  // External URLs.
  if (href.startsWith("http://") || href.startsWith("https://")) return true;
  // Non-HTTP schemes.
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return true;
  // API routes — tested by their own unit/integration tests.
  if (href.startsWith("/api/")) return true;
  // SheetMounter sheets: ?sheet=foo params open a drawer, not a separate page.
  if (href.startsWith("?sheet=")) return true;
  // Dev-only design sandbox pages (no production page.tsx under these paths).
  if (href === "/design" || href === "/design/dashboards") return true;
  return false;
}

// ─── Source 1: nav-presets.ts — PUBLIC_NAV, OWNER_NAV, GOB_NAV, ADMIN_NAV ───

const NAV_PRESETS_PATH = path.join(REPO_ROOT, "components/layout/nav-presets.ts");
const navPresetsSource = fs.readFileSync(NAV_PRESETS_PATH, "utf8");

/**
 * Extract every quoted href value from a TypeScript source string.
 * Matches href: "/path" or href: '/path' (static strings only).
 * Template literals are intentionally skipped — they are dynamic.
 */
function extractQuotedHrefs(src: string): string[] {
  // Matches href: "/path" or href: '/path' (static strings only).
  return Array.from(src.matchAll(/\bhref\s*:\s*["']([^"'`\n]+)["']/g), (m) => m[1] as string);
}

const navPresetsHrefs = extractQuotedHrefs(navPresetsSource);

// buildOrgNav uses template literals: href: `/org/${orgToken}/agenda`.
// We substitute a static placeholder to convert them to checkable paths
// like "/org/PLACEHOLDER/agenda", which resolve via the /org/* pattern.
function extractOrgNavHrefs(src: string): string[] {
  // Template literals: href: `/org/${orgToken}/agenda` → substitute ${orgToken} with a
  // static placeholder so the path resolves via the /org/* pattern in the route map.
  return Array.from(src.matchAll(/\bhref\s*:\s*`([^`\n]+)`/g), (m) =>
    (m[1] as string).replace(/\$\{orgToken\}/g, "PLACEHOLDER"),
  );
}

const orgNavHrefs = extractOrgNavHrefs(navPresetsSource);

// ─── Source 2: AppFooter.tsx DEFAULT_COLUMNS ─────────────────────────────────
// Note: AppHeader (DEFAULT_NAV) was deleted in Item 7 Phase D. Its links
// (/adoptar, /denuncias) are already covered by Source 5 (regex scan of app/).

const APP_FOOTER_PATH = path.join(REPO_ROOT, "components/layout/AppFooter.tsx");
const appFooterHrefs = extractQuotedHrefs(fs.readFileSync(APP_FOOTER_PATH, "utf8"));

// ─── Source 4: event-capture-registry.ts — full-page routes ──────────────────
//
// Routes in the registry are relative to /mis-mascotas/{publicToken}.
// Only entries whose route starts with "/" are full-page routes.
// Routes starting with "?" are SheetMounter sheets — no dedicated page.tsx.

const EVENT_REGISTRY_PATH = path.join(REPO_ROOT, "lib/events/event-capture-registry.ts");
const eventRegistrySource = fs.readFileSync(EVENT_REGISTRY_PATH, "utf8");

// Routes starting with "/" are full-page routes; prefix with /mis-mascotas/*
// to form the canonical URL pattern. Routes starting with "?" are SheetMounter
// sheets (no dedicated page.tsx) — already covered by shouldSkip().
const eventCaptureHrefs: string[] = Array.from(
  eventRegistrySource.matchAll(/\broute\s*:\s*["']([^"'`\n]+)["']/g),
  (m) => m[1] as string,
)
  .filter((route) => route.startsWith("/"))
  .map((route) => `/mis-mascotas/*${route}`);

// ─── Source 5: Regex scan of href="/…" string literals across app/ + components/ ──
//
// Catches any static href not already covered by the structured nav sources above.

const SCAN_DIRS = [path.join(REPO_ROOT, "app"), path.join(REPO_ROOT, "components")];

const scannedHrefs: string[] = [];

for (const scanDir of SCAN_DIRS) {
  walkDir(scanDir, (filePath) => {
    if (!/\.(tsx|ts|jsx|js)$/.test(filePath)) return;
    const src = fs.readFileSync(filePath, "utf8");
    // matchAll requires a new regex instance (or a stateless literal) each call.
    for (const m of src.matchAll(/\bhref="(\/[^"]+)"/g)) {
      scannedHrefs.push(m[1] as string);
    }
  });
}

// ─── Merge and deduplicate all collected hrefs ────────────────────────────────

const allCollectedHrefs = [
  ...navPresetsHrefs,
  ...orgNavHrefs,
  ...appFooterHrefs,
  ...eventCaptureHrefs,
  ...scannedHrefs,
];

const uniqueHrefs = [...new Set(allCollectedHrefs)].filter((h) => !shouldSkip(h));

// ─── 4. Tests ─────────────────────────────────────────────────────────────────

describe("link-integrity: every static internal link resolves to a real route", () => {
  it("route map contains at least 50 entries (sanity check)", () => {
    expect(routePatterns.size).toBeGreaterThanOrEqual(50);
  });

  it("collects links from all expected sources (sanity check)", () => {
    expect(navPresetsHrefs.length).toBeGreaterThan(0);
    expect(orgNavHrefs.length).toBeGreaterThan(0);
    // AppHeader (DEFAULT_NAV) deleted in Item 7 Phase D; links covered by scannedHrefs.
    expect(appFooterHrefs.length).toBeGreaterThan(0);
    expect(eventCaptureHrefs.length).toBeGreaterThan(0);
    expect(scannedHrefs.length).toBeGreaterThan(0);
  });

  it("/denuncias resolves — regression guard for the hub page added in-flight", () => {
    // The only confirmed dead link from the 2026-06 dead-end audit.
    // The hub lives at app/(public)/denuncias/page.tsx.
    // This assertion must remain green forever after.
    expect(resolves("/denuncias")).toBe(true);
  });

  it("each nav-preset export contributes known hrefs (source-coverage guard)", () => {
    // If a nav export is renamed, this catches it before the main assertion.
    expect(navPresetsHrefs).toContain("/adoptar"); // PUBLIC_NAV
    expect(navPresetsHrefs).toContain("/inicio"); // OWNER_NAV
    expect(navPresetsHrefs).toContain("/gob"); // GOB_NAV
    expect(navPresetsHrefs).toContain("/admin"); // ADMIN_NAV
  });

  /**
   * Core assertion — every static internal link must point to a real route.
   *
   * If this test fails, the failure message lists the dead link(s). Fix by:
   *   a) Creating the missing page.tsx / route.ts, OR
   *   b) Fixing the link to point to an existing route, OR
   *   c) Adding the path to shouldSkip() above with a comment explaining why
   *      it is intentionally unresolvable (e.g. redirect-only, future route).
   */
  it("every collected static link resolves to a real route", () => {
    const deadLinks: string[] = [];

    for (const href of uniqueHrefs) {
      if (!resolves(href)) {
        deadLinks.push(href);
      }
    }

    expect(
      deadLinks,
      `Dead links found (${deadLinks.length}):\n${deadLinks.map((l) => `  • ${l}`).join("\n")}\n\nFor each dead link above:\n  - Fix the href to point to an existing route, OR\n  - Create the missing page.tsx, OR\n  - Add it to shouldSkip() in __tests__/link-integrity.test.ts with a comment.`,
    ).toEqual([]);
  });
});
