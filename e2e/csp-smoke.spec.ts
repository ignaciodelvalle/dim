import { expect, test } from "@playwright/test";

import { ACCOUNTS, discoverPetToken, loginAs } from "./demo/_helpers";

/**
 * CSP regression guard — public pages only.
 *
 * This session found a real Content-Security-Policy violation on
 * /denuncias/nueva: a modulepreload for the lazy `LocationPicker` (maplibre)
 * chunk loads outside the nonce chain —
 *   "Loading the script '/_next/static/chunks/NNNN.*.js' violates the
 *    following Content Security Policy directive: script-src 'self'
 *    'nonce-...' 'strict-dynamic'"
 * — and was verified COSMETIC: the step-3 map still renders because the
 * chunk reloads via the nonce-trusted runtime. A cheap console listener
 * would have caught it, and will catch any NEW, non-cosmetic CSP
 * regression on these pages going forward.
 *
 * Each test attaches a page.on("console") listener BEFORE navigation,
 * collects messages matching the CSP-violation signature, navigates, waits
 * for the page to settle, then asserts no un-allowlisted violations
 * occurred. The ONLY allowlisted violation is the known-cosmetic
 * /denuncias/nueva chunk preload above — matched by a STABLE signature
 * (chunk path + page), not by the build-specific chunk hash. Any other CSP
 * violation — on any page, including a different chunk on
 * /denuncias/nueva, or any inline-script refusal anywhere — fails the test.
 */

const CSP_VIOLATION_PATTERN =
  /Content Security Policy|violates the following Content Security Policy|Refused to (load|execute)/i;

// The public credential is NOT in this list — it needs a token that exists,
// and it used to be here as the literal `/p/DIM-DEMO-0001`. On a bootstrapped
// database that is a not-found boundary, and a not-found boundary is a small
// static page with no map, no QR and no inline chunk: it raises zero CSP
// violations and this suite printed GREEN for a route it never scanned. That is
// the same silent-pass A7 found in a11y-regression (axe scoring a 404 page
// "critical=0"). It gets its own test below, with a runtime token and a proof
// that the real credential rendered. Do not put a pet route back in this array.
const PUBLIC_PAGES = ["/", "/adoptar", "/perdidas", "/denuncias/nueva", "/refugios"] as const;

// The one verified-cosmetic violation: a modulepreload for the lazy
// LocationPicker (maplibre) chunk on /denuncias/nueva, refused because it
// loads outside the nonce chain. Chunk hashes are build-specific, so we
// match on the stable parts of the signature instead of a hardcoded hash.
function isKnownCosmeticViolation(path: string, message: string): boolean {
  return path === "/denuncias/nueva" && message.includes("_next/static/chunks/");
}

for (const path of PUBLIC_PAGES) {
  test(`${path} → no unexpected CSP violations`, async ({ page }) => {
    const violations: string[] = [];

    page.on("console", (msg) => {
      const text = msg.text();
      if (CSP_VIOLATION_PATTERN.test(text)) {
        violations.push(text);
      }
    });

    await page.goto(path);
    await page.waitForLoadState("networkidle");

    const unexpected = violations.filter((text) => !isKnownCosmeticViolation(path, text));

    expect(unexpected, `Unexpected CSP violation(s) on ${path}:\n${unexpected.join("\n")}`).toEqual(
      [],
    );
  });
}

test("/p/[token] → no unexpected CSP violations (on a credential that exists)", async ({
  browser,
  page,
}) => {
  // Token discovered from the owner's registry, then loaded anonymously.
  const owner = await browser.newContext();
  let token: string;
  try {
    const ownerPage = await owner.newPage();
    await loginAs(ownerPage, ACCOUNTS.owner);
    token = await discoverPetToken(ownerPage);
  } finally {
    await owner.close();
  }

  const violations: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (CSP_VIOLATION_PATTERN.test(text)) violations.push(text);
  });

  await page.goto(`/p/${token}`);
  await page.waitForLoadState("networkidle");

  // PROVE the credential rendered. Without this the test is worth nothing: a
  // not-found boundary raises no CSP violations either, which is exactly how
  // the old hardcoded token passed in CI while scanning a 404.
  await expect(
    page.getByText("Credencial pública", { exact: true }),
    "the public credential actually rendered — not a not-found boundary",
  ).toBeVisible({ timeout: 20_000 });

  expect(
    violations,
    `Unexpected CSP violation(s) on /p/${token}:\n${violations.join("\n")}`,
  ).toEqual([]);
});
