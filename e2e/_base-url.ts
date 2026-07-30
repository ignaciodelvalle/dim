import { readFileSync } from "node:fs";

/**
 * Resolve the base URL the QA-night specs (race battery + synthetic monitor)
 * point at. Unlike the operator/crisis suites — which run against the local
 * :3000 QA server — these two suites are meant to be aimed at the DEPLOYED
 * staging origin, which changes on every deploy (the PO drops the current URL
 * into a scratchpad file and/or exports it).
 *
 * Resolution order (first non-empty wins):
 *   1. process.env.STAGING_URL         — explicit override (CI, ad-hoc runs).
 *   2. file at process.env.STAGING_URL_FILE — a text file whose first line is
 *      the current staging origin (the per-deploy scratchpad file).
 *   3. the known local scratchpad staging_url file, if present (PO's Windows
 *      box) — best-effort, never fatal.
 *   4. http://localhost:${QA_PORT ?? 3000} — the local QA server fallback so
 *      the specs still run under playwright.local3000.config.ts with no env
 *      set. QA_PORT is that config's port override (same var as
 *      `qa-up.ps1 -Port`); honoring it here keeps these two specs on the same
 *      origin as the rest of the suite when the QA server is not on :3000.
 *
 * The returned value never carries a trailing slash so callers can safely do
 * `base + "/login"`.
 */

const DEFAULT_LOCAL = `http://localhost:${Number(process.env.QA_PORT?.trim() || 3000)}`;

// Best-effort default location of the per-deploy staging_url file on the PO's
// machine. Never hardcode this into an assertion — it is only a convenience
// fallback and is wrapped in a try/catch so a missing file is silent.
const DEFAULT_STAGING_URL_FILE =
  "C:\\Users\\ignac\\AppData\\Local\\Temp\\claude\\C--dev-dim\\f865ea47-2ddf-45de-9c72-6f2876e187ac\\scratchpad\\staging_url";

function readFirstLine(path: string): string | null {
  try {
    const raw = readFileSync(path, "utf8");
    const first = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    return first ?? null;
  } catch {
    return null;
  }
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function resolveBaseUrl(): string {
  const envUrl = process.env.STAGING_URL?.trim();
  if (envUrl) return stripTrailingSlash(envUrl);

  const fileFromEnv = process.env.STAGING_URL_FILE?.trim();
  if (fileFromEnv) {
    const fromFile = readFirstLine(fileFromEnv);
    if (fromFile) return stripTrailingSlash(fromFile);
  }

  const fromDefaultFile = readFirstLine(DEFAULT_STAGING_URL_FILE);
  if (fromDefaultFile) return stripTrailingSlash(fromDefaultFile);

  return DEFAULT_LOCAL;
}

/**
 * True when the resolved origin is a remote staging deploy (not localhost).
 * Specs use this to relax timeouts (cold serverless starts) and to decide
 * whether to attempt data-mutating races (safe on a throwaway staging DB).
 */
export function isRemoteStaging(base: string): boolean {
  return !/localhost|127\.0\.0\.1/.test(base);
}
