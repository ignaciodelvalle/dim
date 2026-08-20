// check-api-guard-headers — no /api route may authorize on a middleware-stamped
// header (B51, native-readiness RN-8 #2).
//
// THE DEFECT THIS EXISTS FOR
// ---------------------------------------------------------------------------
// middleware.ts stamps request headers that server code reads back: `x-nonce`,
// `x-pathname`, `x-full-path`, `x-portal-base`. They are convenient and they are
// NOT a security input. Two reasons:
//
//   1. THEY DEFAULT SILENTLY. lib/ui/portal-base.ts is the live example RN-8
//      found: `headers().get("x-portal-base")` with `value === "/admin" ? … :
//      "/gob"`. A MISSING header does not error — it resolves to /gob. On a link
//      builder that is a cosmetic bug. On a guard it is an authorization
//      decision made by the absence of a header.
//   2. THE STAMP IS NOT GUARANTEED. middleware.ts carries a `matcher`, and the
//      headers are set on the REQUEST. Anything that reaches a handler outside
//      that matcher — a rewrite, an internal invocation, a future runtime
//      change — arrives with none of them, and a caller can send their own
//      `x-portal-base` freely.
//
// The repo's authorization invariant is that authority is 100% DB-resolved
// (zero `auth.jwt()` across 276 RLS policies). A header-derived default is the
// same class of mistake as a claim-derived one: a value the request influences,
// deciding what the caller may do.
//
// WHAT IS BANNED, AND WHY IT IS THE SUBJECT AND NOT A SPELLING
// ---------------------------------------------------------------------------
// Under app/api/**, READING a middleware-stamped header at all — directly, or
// through a module whose job is to read one. Not "reading it with `??`", not
// "reading it with a ternary": banning the FORMS is how a fence ends up
// enumerating three of the four ways to write a default. Banning the read is
// unambiguous, and an /api route that genuinely needs the path has `request.url`
// and its own route params, which are not spoofable-by-omission.
//
// The header NAMES are derived from middleware.ts at scan time, never listed
// here. Add a `request.headers.set("x-whatever", …)` to the middleware and this
// fence covers it on the next run with no edit.
//
// The WRAPPER form is derived too: any module under lib/ or components/ that
// reads a stamped header becomes a "reader module", and an app/api file that
// IMPORTS one is flagged. That is what catches `portalBase()` without this file
// ever naming it.
//
// STATUS AT INTRODUCTION: zero offenders. This fence is preventive — it lands
// green and stays honest because of the floors below, not because nothing is
// wrong today.
//
// Run: pnpm tsx scripts/check-api-guard-headers.ts   (or: pnpm lint:api-headers)

import { globSync, readFileSync } from "node:fs";

import { stripComments } from "./lib/strip-comments.mjs";

export const MIDDLEWARE_PATH = "middleware.ts";

// Non-vacuity floors. A fence that scans nothing reports success; these make a
// broken glob or a moved middleware fail LOUDLY instead of silently passing.
// Measured 2026-08-20: 4 stamped headers, 47 route.ts + 2 _guard.ts under
// app/api. Floors sit below the measurement with room for churn, and above zero.
export const MIN_STAMPED_HEADERS = 3;
export const MIN_API_FILES_SCANNED = 20;

// Documented exceptions: `"<relPath>"` → reason. Use ONLY when the value is
// provably not an authorization input AND cannot be obtained from the request
// itself. Empty is the goal, and it is empty.
export const ALLOWLIST: Record<string, string> = {};

/**
 * Every header middleware.ts stamps on the REQUEST.
 *
 * Derived, not listed. `response.headers.set(...)` is deliberately excluded —
 * those go out to the browser and are never read back by server code.
 */
export function stampedRequestHeaders(middlewareSource: string): string[] {
  const code = stripComments(middlewareSource);
  const names = [...code.matchAll(/request\.headers\.set\(\s*["'`]([^"'`]+)["'`]/g)].map((m) =>
    m[1].toLowerCase(),
  );
  return [...new Set(names)].sort();
}

/** A `.get("<name>")` read of any of `headerNames`, ignoring comments. */
export function readsStampedHeader(source: string, headerNames: readonly string[]): string[] {
  const code = stripComments(source);
  const hits = new Set<string>();
  for (const name of headerNames) {
    // `.get(` with the header name as a string literal, any quoting, any casing
    // — HTTP header names are case-insensitive and Next's Headers.get() is too.
    const re = new RegExp(`\\.get\\s*\\(\\s*["'\`]${name.replace(/-/g, "-")}["'\`]`, "i");
    if (re.test(code)) hits.add(name);
  }
  return [...hits].sort();
}

/** Files whose PURPOSE includes reading a stamped header — the wrapper form. */
export function listReaderModules(headerNames: readonly string[]): string[] {
  const candidates = ["lib/**/*.ts", "lib/**/*.tsx", "components/**/*.ts", "components/**/*.tsx"];
  const out: string[] = [];
  for (const pattern of candidates) {
    for (const file of globSync(pattern)) {
      const relPath = file.replaceAll("\\", "/");
      if (!isScannable(relPath)) continue;
      if (readsStampedHeader(readFileSync(file, "utf8"), headerNames).length > 0) {
        out.push(relPath);
      }
    }
  }
  return out.sort();
}

/** Import specifiers a source pulls in, normalized from the `@/` alias. */
export function importedModulePaths(source: string): string[] {
  const code = stripComments(source);
  return [...code.matchAll(/from\s+["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((spec) => spec.startsWith("@/"))
    .map((spec) => spec.slice(2));
}

function isScannable(relPath: string): boolean {
  if (relPath.includes("__tests__")) return false;
  if (/\.test\.[jt]sx?$/.test(relPath)) return false;
  return !relPath.endsWith(".d.ts");
}

export function listApiFiles(): string[] {
  return globSync("app/api/**/*.ts")
    .map((f) => f.replaceAll("\\", "/"))
    .filter(isScannable)
    .sort();
}

/**
 * Offender lines for one /api file. `readerModules` are the extension-less
 * module paths (relative to root) whose import counts as an indirect read.
 */
export function findOffenders(
  relPath: string,
  source: string,
  headerNames: readonly string[],
  readerModules: readonly string[],
): string[] {
  if (ALLOWLIST[relPath] !== undefined) return [];

  const offenders: string[] = [];

  const direct = readsStampedHeader(source, headerNames);
  if (direct.length > 0) {
    offenders.push(
      `${relPath} — reads middleware-stamped header(s) ${direct.join(", ")}. A missing stamp resolves to whatever default the expression carries, so the ABSENCE of a header becomes the decision (RN-8: x-portal-base defaults to /gob). An /api handler must derive path/portal from request.url or its own route params, and must fail closed on anything it cannot derive.`,
    );
  }

  const imported = new Set(importedModulePaths(source));
  for (const reader of readerModules) {
    const withoutExt = reader.replace(/\.(ts|tsx)$/, "");
    if (imported.has(withoutExt) || imported.has(reader)) {
      offenders.push(
        `${relPath} — imports ${reader}, whose job is reading a middleware-stamped header with a default. Indirect is the same defect: the /api handler still ends up deciding on a value the request can omit.`,
      );
    }
  }

  return offenders;
}

function runScan(): void {
  const middlewareSource = readFileSync(MIDDLEWARE_PATH, "utf8");
  const headerNames = stampedRequestHeaders(middlewareSource);

  if (headerNames.length < MIN_STAMPED_HEADERS) {
    console.error(
      `✗ check-api-guard-headers: found only ${headerNames.length} stamped request header(s) in ${MIDDLEWARE_PATH} (floor ${MIN_STAMPED_HEADERS}). Either the middleware moved or the extraction broke — a fence that finds nothing to look for is a fence that always passes.`,
    );
    process.exit(1);
  }

  const apiFiles = listApiFiles();
  if (apiFiles.length < MIN_API_FILES_SCANNED) {
    console.error(
      `✗ check-api-guard-headers: scanned only ${apiFiles.length} file(s) under app/api (floor ${MIN_API_FILES_SCANNED}). The glob is broken.`,
    );
    process.exit(1);
  }

  const readerModules = listReaderModules(headerNames);

  const offenders: string[] = [];
  for (const file of apiFiles) {
    offenders.push(...findOffenders(file, readFileSync(file, "utf8"), headerNames, readerModules));
  }

  if (offenders.length > 0) {
    console.error(offenders.join("\n"));
    console.error(
      `\n✗ ${offenders.length} /api file(s) authorizing on a middleware-stamped header.`,
    );
    process.exit(1);
  }

  console.log(
    `✓ api-guard-headers clean — ${apiFiles.length} files under app/api, none reading any of the ${headerNames.length} middleware-stamped headers (${headerNames.join(", ")}) directly or through the ${readerModules.length} reader module(s).`,
  );
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("check-api-guard-headers.ts") ||
    process.argv[1].endsWith("check-api-guard-headers.js") ||
    import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`);

if (isMain) {
  runScan();
}
