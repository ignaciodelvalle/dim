import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  expect,
} from "@playwright/test";

import {
  BRANDED_NOT_FOUND_TESTID,
  CRASH_BOUNDARY,
  NOT_FOUND_HEADING,
  type OwnerPii,
} from "../_page-identity";

export const SHARED_PASSWORD = "Test1234!";

// Demo accounts (all password Test1234!).
//
// TIERS MATTER — read this before pointing a spec at one of these.
// `pnpm db:bootstrap` (what CI runs) seeds reference data and
// scripts/seed-test-users.ts, and STOPS. Everything below marked "demo tier"
// comes from scripts/seed-demo.ts + the storyline/owner-demo scripts, which CI
// never executes, so a spec that reaches for one is green only on a laptop
// where those were run by hand (see commit 51b2eff1 — six specs, one cause).
export const ACCOUNTS = {
  // ---- bootstrap tier: guaranteed to exist on any freshly seeded database ----
  owner: "owner@dim.test",
  owner2: "owner2@dim.test", // Owner B — cross-tenant target + adoption applicant (seed-test-users.ts ensureOwnerB)
  orgAdmin: "orgadmin@dim.test", // admin of "Refugio Test (Seed)"
  // Matriculated vet (matriculaVerified=true) AND an active `vet_individual`
  // member of "Refugio Test (Seed)" — VET_INDIVIDUAL_IMPLICIT_CAPS grants
  // `event.write`, which is exactly what the Atender walk-in surface gates on.
  // This is the bootstrap-tier stand-in for a clinic signer: it signs as
  // authorRole "vet" / authorVerified true, so the asiento lands as
  // professional_verified provenance, not a bare org record.
  vet: "vet@dim.test",
  // Jurisdiction matters and these two are NOT interchangeable — a spec that
  // asserts on scope must pick the one whose coverage it means:
  //   govt      → Ushuaia (Tierra del Fuego) + El Calafate (Santa Cruz)
  //   govtLocal → La Plata (Buenos Aires) + Palermo (CABA)
  // (scripts/seed-test-users.ts GOVT_REMOTE_LOCALITIES / GOVT_LOCAL_LOCALITIES.)
  govt: "govt@dim.test",
  govtLocal: "govt-local@dim.test",
  admin: "admin@dim.test",
  // ---- demo tier: seed-demo.ts only — ABSENT in CI, do not add new uses ----
  vetOrgAdmin: "alejo@dim.test", // admin of Clínica Veterinaria Recoleta (clinic org)
} as const;

// Real animal photos shipped in the repo, reused for live upload flows.
const here = path.dirname(fileURLToPath(import.meta.url));
export const PHOTO_DIR = path.resolve(here, "../../docs/archive/Fotos");
export const DEMO_PHOTOS = ["bolt.jpg", "courage.jpg", "hachi.jpg"].map((f) =>
  path.join(PHOTO_DIR, f),
);

// Login is rate-limited per client IP, and the middleware trusts x-real-ip.
// A spec that logs in once per test drains the bucket and every later login
// answers "Demasiados intentos. Esperá un momento y volvé a probar." — measured
// on e2e/a11y-regression.spec.ts, whose 5 tests each log in as the same owner:
// 4 passed and the 5th could not get past /login.
//
// Handing every login a distinct address makes each one look like a fresh
// visitor. TEST-NET-3 (RFC 5737) is the documentation range, so these can never
// collide with a real client. e2e/owner-ia-p6.spec.ts and
// e2e/authz-ab-isolation.spec.ts each grew their own private copy of this; it
// lives here now so the next spec does not have to rediscover the throttle.
let ipCounter = 0;
export function uniqueIp(): string {
  ipCounter += 1;
  return `203.0.113.${(ipCounter % 250) + 1}`;
}

/**
 * Read the login form's error alert, if the server put one there.
 *
 * The login action answers with a rendered message and NO navigation for every
 * refusal — bad credentials, and both rate-limit budgets (per-IP 10/min·100/hr,
 * per-email 5/min·20/hr; see src/modules/auth/application/login.ts). A helper
 * that only waits for the URL to change cannot tell those apart from a slow
 * server, so it burns its whole budget and reports "Test timeout of 30000ms
 * exceeded while running beforeEach hook" — which names the hook and not one
 * thing about the cause. That is precisely how the a11y-regression CI failure
 * of 2026-07-30 read, and it cost a full triage cycle to identify.
 */
async function loginErrorText(page: Page): Promise<string> {
  const alert = page.getByRole("alert").filter({ hasText: /intento|contraseñ|inválid|incorrect/i });
  if ((await alert.count().catch(() => 0)) === 0) return "";
  return (
    await alert
      .first()
      .innerText()
      .catch(() => "")
  ).trim();
}

/**
 * Auth cookies + landing path captured from the ONE real sign-in per account,
 * replayed by every later `loginAs` for that account in the same worker.
 *
 * WHY THIS EXISTS — the suite was rate-limiting itself. `auth_login_email` is
 * 5/min AND 20/hour keyed on the EMAIL ADDRESS (src/modules/auth/application/
 * login.ts), and it is enforced BEFORE GoTrue is touched, so it counts failed
 * attempts too. `uniqueIp()` spreads the per-IP budget and does exactly nothing
 * to this one. Static count at the time of writing: 17 `ACCOUNTS.owner` call
 * sites plus owner-shell.spec.ts's own literal login in a 3-test `beforeEach` —
 * comfortably past 20 sign-ins as owner@dim.test per run, and `retries: 1`
 * re-runs the failures on top. Until CI's e2e job was fixed (unit A4) the suite
 * was killed by the job clock at ~24 min and never made enough logins to reach
 * the hourly cap; the first run that COMPLETED hit it, and three tests died on
 * "Demasiados intentos. Esperá un momento y volvé a probar."
 *
 * The limiter is a real security control (it is what stops a distributed
 * brute-force against one account) and is NOT to be weakened for tests. Session
 * reuse is the Playwright-recommended answer and the one e2e/owner-ia-p6.spec.ts
 * already implements privately; this hoists it into the shared helper so every
 * spec gets it without a rewrite.
 *
 * WHAT IS STILL COVERED: the first sign-in per account per worker is a REAL
 * trip through the form, so "login works" is asserted once per role every run.
 * e2e/auth.spec.ts covers the form itself (bad password, empty fields) and does
 * not go through this helper. A spec whose SUBJECT is the sign-in must opt out
 * with `{ fresh: true }` rather than rely on being scheduled first.
 */
type CachedSession = { cookies: Awaited<ReturnType<BrowserContext["cookies"]>>; landing: string };
const sessionCache = new Map<string, CachedSession>();

/** Replay a cached session into `page`'s context. Returns false if unusable. */
async function restoreSession(page: Page, cached: CachedSession): Promise<boolean> {
  const context = page.context();
  await context.clearCookies();
  await context.addCookies(cached.cookies);
  await page.goto(cached.landing, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  // A session that no longer authenticates bounces to /login. Report that
  // rather than letting the caller assert against a sign-in page.
  return !new URL(page.url()).pathname.startsWith("/login");
}

/**
 * Log in through the real UI at /login and wait until we leave the login page.
 *
 * Reuses a cached session for accounts already signed in during this worker —
 * see sessionCache above. Pass `{ fresh: true }` to force a real form sign-in
 * (for specs that are testing the sign-in itself).
 */
export async function loginAs(
  page: Page,
  email: string,
  opts: { fresh?: boolean } = {},
): Promise<void> {
  if (!opts.fresh) {
    const cached = sessionCache.get(email);
    if (cached && (await restoreSession(page, cached))) return;
    // Fall through to a real sign-in when the cached session no longer works
    // (expired, signed out by another spec) — never silently continue anonymous.
    if (cached) sessionCache.delete(email);
  }

  // Fresh apparent origin per login — see uniqueIp above. Note this defeats the
  // per-IP budget ONLY: the per-email budget is keyed on the address, so a spec
  // that logs in as the same account more than 5 times a minute (or 20 an hour)
  // is rate-limited no matter what address it presents.
  await page.setExtraHTTPHeaders({ "x-real-ip": uniqueIp() });
  await page.goto("/login");
  // Let hydration finish before interacting — clicks dispatched before React
  // attaches handlers are silently dropped (clickthrough audit 2026-07-03,
  // task #39), which stranded a whole recording pass on the login screen.
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  await page.waitForTimeout(1_500);
  await page.getByLabel(/correo electrónico/i).fill(email);
  await page.getByLabel(/contraseña/i).fill(SHARED_PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  const leftLogin = (url: URL) => !url.pathname.startsWith("/login");
  try {
    await page.waitForURL(leftLogin, { timeout: 10_000 });
  } catch {
    // Either the click was swallowed before hydration (the #39 workaround), or
    // the server refused. Check for a refusal first so it is reported as one.
    const refusal = await loginErrorText(page);
    if (refusal) throw new Error(`login refused for ${email}: "${refusal}"`);
    await page.getByLabel(/contraseña/i).press("Enter");
    try {
      await page.waitForURL(leftLogin, { timeout: 20_000 });
    } catch (err) {
      const late = await loginErrorText(page);
      throw late ? new Error(`login refused for ${email}: "${late}"`) : err;
    }
  }
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});

  // Cache the session so the next `loginAs` for this account costs no login
  // budget. The landing path is recorded too, so a replayed session leaves the
  // page exactly where a real sign-in would have (callers assert on it).
  const landed = new URL(page.url());
  sessionCache.set(email, {
    cookies: await page.context().cookies(),
    landing: `${landed.pathname}${landed.search}`,
  });
}

/**
 * Discover a REAL public DIM token from the signed-in owner's own registry.
 *
 * Bootstrap generates every pet token with `generatePublicToken()` — random by
 * construction (lib/infra/publicToken.ts), so no literal can name a pet that
 * exists on a fresh database. Specs that pinned `DIM-DEMO-0001` / `DIM-PAMP-0001`
 * were asserting against a not-found boundary in CI. Anchor on the `DIM-` prefix
 * so "/mis-mascotas/nueva" (the create-pet CTA) can never be mistaken for a pet.
 *
 * `page` must already be authenticated as the owner whose pet you want.
 *
 * ACTIVE BY DEFAULT. Almost every caller wants a live credential — a lost or
 * deceased pet renders a different surface (lost strip, no band dots), so a
 * bare "first link" pick makes the caller's assertions depend on whatever state
 * a previous suite happened to leave behind. Measured: after one run of the
 * mark-lost journeys, owner@dim.test's first card was a LOST pet and the
 * carousel tests failed on a page that was behaving correctly. The
 * `hasText: /registrad[ao]/i` filter is the status flag on the card — the same
 * anchor e2e/crisis-owner-lost-flow.spec.ts uses to find a non-lost pet. The
 * character class is load-bearing: the flag agrees with the animal's sex
 * (REGISTRADO / REGISTRADA / REGISTRADO/A), and a locator hardcoded to one
 * gender finds nothing for the others — which surfaces as a SKIPPED test, not
 * a failing one.
 */
export async function discoverPetToken(
  page: Page,
  opts: { index?: number; activeOnly?: boolean } = {},
): Promise<string> {
  const index = opts.index ?? 0;
  const activeOnly = opts.activeOnly ?? true;
  await page.goto("/mis-mascotas", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  const links = activeOnly
    ? page.locator('a[href^="/mis-mascotas/DIM-"]', { hasText: /registrad[ao]/i })
    : page.locator('a[href^="/mis-mascotas/DIM-"]');
  await expect(
    links.nth(index),
    `owner registry has ${activeOnly ? "an ACTIVE" : "a"} pet at index ${index}`,
  ).toBeVisible({ timeout: 20_000 });
  const href = (await links.nth(index).getAttribute("href")) ?? "";
  const token = href.split("/mis-mascotas/")[1]?.split(/[?#]/)[0] ?? "";
  expect(token, "pet token parsed from the registry link").toMatch(/^DIM-/);
  return token;
}

/**
 * The signed-in account's display name, read from /cuenta at runtime.
 *
 * For privacy assertions ("this public surface must not leak the owner's
 * name"). A HARDCODED persona name makes that assertion VACUOUS the moment the
 * fixture changes: e2e/synthetic-monitor.spec.ts checked the public credential
 * for "Ignacio del Valle" — a demo-tier persona — while CI's owner@dim.test is
 * seeded as "Lucía Tester", so the check could not fail no matter what the page
 * leaked. Reading the name from the account under test keeps it honest.
 */
export async function discoverDisplayName(page: Page, email: string): Promise<string> {
  await page.goto("/cuenta", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  // The profile card renders the display name in the first <p> of the same
  // block that carries the account email; anchoring on the email makes the
  // innermost matching div unambiguous.
  const block = page.locator("div").filter({ hasText: email }).last();
  const name = (await block.locator("p").first().innerText()).trim();
  expect(name, `display name read from /cuenta for ${email}`).not.toBe("");
  expect(name, "display name is not the email itself").not.toContain("@");
  return name;
}

/**
 * Refuse to measure a page that is not the page under test.
 *
 * THE gate-integrity primitive. A not-found boundary and a crashed route are
 * both small, clean, quiet pages: axe finds zero violations on them, a CSP
 * console listener hears nothing, and a PII substring check finds no PII. Every
 * such gate therefore reports GREEN for a route it never loaded. It has now
 * happened twice in this repo (a11y-regression scanning /p/DIM-DEMO-0001 as a
 * 404 and printing "critical=0"; csp-smoke doing the same on the same token).
 *
 * This function is the SINGLE implementation. It used to live privately inside
 * e2e/a11y-regression.spec.ts, matching only the heading
 * "No encontramos esta página" — which is the (app)/admin/gob/root copy, NOT
 * the `(public)` group's "No encontramos esa credencial". `/p/[token]` is a
 * (public) route, so the guard did not recognise the one boundary it existed to
 * catch. Fixed here by keying on BrandedNotFound's data-testid first (copy
 * cannot disarm it) and on the full set of headings second — see
 * e2e/_page-identity.ts and its parity test.
 *
 * IT NOW ASSERTS THE URL, NOT JUST "a page rendered". Until 2026-07-31 `route`
 * was a pure error-message string — nothing ever compared `page.url()` — so the
 * function proved "SOME real page" and never "THE page". Any redirect sailed
 * through it, which is not a corner case in this app:
 * `app/(app)/inicio/page.tsx` has NO renderable branch (every path ends in
 * `redirect()`, lines 63 / 89 / 120), so
 *
 *   e2e/a11y-regression.spec.ts  "/inicio — no serious/critical"
 *
 * was scanning /mis-mascotas/{token} — byte-identical to the test on the very
 * next line. The docblock's "four highest-traffic surfaces" was three, one of
 * them measured twice, and /inicio's axe number described a different page.
 *
 * @param expected the pathname the browser must actually be on. A string is
 *   compared exactly (query and hash ignored); pass a RegExp when the
 *   destination is legitimately variable — a redirect target, a discovered
 *   token. Do NOT pass a prose label: it is an assertion now, not a caption.
 * @param marker OPTIONAL positive proof: something only the real page renders.
 *   The right pathname plus no 404 is still not proof the CONTENT rendered —
 *   pass this whenever the route has a stable identifying element.
 */
export async function assertRealPage(
  page: Page,
  expected: string | RegExp,
  marker?: Locator,
): Promise<void> {
  const label = typeof expected === "string" ? expected : String(expected);
  const actual = new URL(page.url()).pathname;

  if (typeof expected === "string") {
    // Normalise through URL so a caller may pass an href carrying ?query#hash
    // (public-smoke discovers hrefs from listings and passes them straight in).
    const wanted = new URL(expected, "http://localhost").pathname;
    expect(
      actual,
      `expected to be measuring ${wanted}, but the browser is on ${actual} — a redirect, not the route under test`,
    ).toBe(wanted);
  } else {
    expect(
      actual,
      `expected to be measuring a path matching ${label}, but the browser is on ${actual}`,
    ).toMatch(expected);
  }

  await expect(
    page.getByTestId(BRANDED_NOT_FOUND_TESTID),
    `${label}: rendered the branded not-found boundary — measuring it would pass vacuously`,
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: NOT_FOUND_HEADING }),
    `${label}: rendered a not-found heading — measuring it would pass vacuously`,
  ).toHaveCount(0);
  await expect(page.getByText(CRASH_BOUNDARY), `${label}: the page crashed`).toHaveCount(0);
  if (marker) {
    await expect(marker, `${label}: the page's own content never rendered`).toBeVisible({
      timeout: 20_000,
    });
  }
}

/**
 * The signed-in account's PII, resolved at runtime, for "this public surface
 * must not leak the owner" assertions.
 *
 * `page` must already be authenticated as that account.
 *
 * The phone is read from the editar-perfil sheet (`/cuenta?sheet=editar-perfil`
 * renders `input#phone` pre-filled from profiles.phone) because /cuenta itself
 * only prints name, email and `••••<dni_last4>`. It is OPTIONAL: an account
 * with no phone on file yields null, and the caller must skip the phone
 * assertion rather than search for the empty string — `body.includes("")` is
 * always true, which would turn the leak detector into a permanent false alarm.
 *
 * See e2e/_page-identity.ts → OwnerPii for the scope decision (why DNI and
 * address are deliberately not in here).
 */
export async function discoverOwnerPii(page: Page, email: string): Promise<OwnerPii> {
  const displayName = await discoverDisplayName(page, email);

  await page.goto("/cuenta?sheet=editar-perfil", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  const phoneInput = page.locator("input#phone");
  let phone: string | null = null;
  if (await phoneInput.count().then((c) => c > 0)) {
    const value = (await phoneInput.inputValue()).trim();
    phone = value === "" ? null : value;
  }

  return { displayName, email, phone };
}

/**
 * File an anonymous denuncia at `coords` in a throwaway context, so an operator
 * queue that `pnpm db:bootstrap` leaves EMPTY has something real in it.
 *
 * Bootstrap creates zero `cases` rows — reference data and test users, nothing
 * else. A denuncia is the honest origin of a first case (create-welfare-report
 * opens a `welfare_denuncia` case in the same transaction), so operator specs
 * manufacture one the way a citizen does rather than skipping or asking CI to
 * carry the demo seed.
 *
 * ⚠ JURISDICTION ROUTING IS NOT LOCAL. Which operator sees the case is decided
 * by `cases.jurisdiction_province/locality`, and those are filled from a
 * SERVER-SIDE fetch to https://nominatim.openstreetmap.org (lib/infra/
 * geocoding.ts) fired when the pin drops — the app never derives jurisdiction
 * from the coordinates itself. If that call fails the report still submits, but
 * the case lands with a NULL jurisdiction and `listCasesForGovt` (which ANDs an
 * exact province/locality pair and falls back to `sql\`false\``) shows it to
 * nobody. Callers that need a govt queue must use `expectCaseInGovtQueue`,
 * which names that cause instead of reporting an empty queue.
 */
export async function fileDenunciaAt(
  browser: Browser,
  coords: { latitude: number; longitude: number },
): Promise<string> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    return await walkDenunciaWizard(page, { coords });
  } finally {
    await context.close();
  }
}

/**
 * Assert an operator queue is non-empty, and when it is empty say WHY in terms
 * a reader can act on. Returns the first queue row's href.
 */
export async function expectQueueRow(page: Page, selector: string, what: string): Promise<string> {
  const row = page.locator(selector).first();
  if ((await row.count()) === 0) {
    throw new Error(
      `${what}: the queue is empty. A denuncia was filed for this run, so either it did not open a case, or its jurisdiction did not resolve — jurisdiction comes from a server-side reverse-geocode against nominatim.openstreetmap.org, and a govt queue matches on an EXACT province/locality pair, so a null jurisdiction is invisible to every govt operator. Check cases.jurisdiction_province.`,
    );
  }
  await expect(row, what).toBeVisible({ timeout: 20_000 });
  return (await row.getAttribute("href")) ?? "";
}

/** Navigate to a path, tolerate 308 redirects, settle, then pause briefly for the recording. */
export async function visit(
  page: Page,
  urlPath: string,
  opts: { settle?: number } = {},
): Promise<void> {
  await page.goto(urlPath, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  await page.waitForTimeout(opts.settle ?? 600);
}

/**
 * Slow full-page scroll to the bottom and back — reveals long tables/dashboards
 * on camera. Pure choreography, NOT an assertion: if the page navigates or
 * streams a re-render mid-scroll, the evaluate's execution context is destroyed
 * and throws. That is benign for a camera pan, so we swallow it rather than
 * failing an otherwise-complete journey (heavier operator surfaces made this a
 * recurring false failure — the flow completed, the scroll just got interrupted).
 */
export async function fullScroll(page: Page): Promise<void> {
  try {
    await page.evaluate(async () => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const height = document.body.scrollHeight;
      const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
      for (let y = 0; y <= height; y += step) {
        window.scrollTo({ top: y, behavior: "smooth" });
        await sleep(350);
      }
      await sleep(300);
      window.scrollTo({ top: 0, behavior: "smooth" });
      await sleep(300);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Only swallow the navigation/teardown races; re-throw anything real.
    if (
      !/execution context was destroyed|target page.*closed|page.*has been closed/i.test(message)
    ) {
      throw err;
    }
  }
}

/** Visit + full scroll, the default "show this screen" beat. */
export async function showScreen(page: Page, urlPath: string): Promise<void> {
  await visit(page, urlPath);
  await fullScroll(page);
}

/**
 * Panorama map beat (segments 05/06): navigate to the geospatial console,
 * give the client-side map time to paint, FAIL LOUD if the console itself
 * errored, full-scroll, then gently switch one map layer when the layer
 * switcher is present (best-effort — layer availability varies by seed data).
 */
export async function panoramaMapBeat(page: Page, urlPath: string): Promise<void> {
  await visit(page, urlPath);
  await page.waitForTimeout(3_000); // first map paint (dynamic client import)
  // PO screenshot fix (2026-07-08): the h1 "Panorama" was removed (redundant
  // with the breadcrumb + nav-rail). The eyebrow line is the stable console-
  // loaded signal now.
  await expect(
    page.getByText("Centro de Situación Nacional").first(),
    `panorama console at ${urlPath}`,
  ).toBeVisible();
  await fullScroll(page);
  // panorama v3 rail (task #38): the layer toggles live inside the "Filtro"
  // rail panel now (uniform floating panel, checkboxes in both tiers). Open it
  // first so the beat can still exercise a real layer toggle; best-effort,
  // same as before (layer availability varies by seed data).
  const filtroButton = page.getByRole("button", { name: "Filtro", exact: true });
  if (
    await filtroButton
      .count()
      .then((c) => c > 0)
      .catch(() => false)
  ) {
    await filtroButton.click().catch(() => {});
    await page.waitForTimeout(300);
  }
  const layerToggle = page.locator('label:has(input[type="checkbox"]:not([disabled]))').first();
  if (
    await layerToggle
      .count()
      .then((c) => c > 0)
      .catch(() => false)
  ) {
    await layerToggle.click().catch(() => {});
    await page.waitForTimeout(2_000);
  }
}

/** Best-effort: fill an input found by label regex, ignore if absent (screens vary by data). */
export async function tryFill(page: Page, label: RegExp, value: string): Promise<void> {
  const field = page.getByLabel(label).first();
  if (
    await field
      .count()
      .then((c) => c > 0)
      .catch(() => false)
  ) {
    await field.fill(value).catch(() => {});
  }
}

/**
 * Click a submit button and wait for the URL to change; when the click is
 * silently dropped (hydration race, task #39 — handlers not yet attached),
 * fall back to submitting the button's form programmatically. Fail-loud if
 * neither attempt navigates.
 */
export async function submitAndWait(
  page: Page,
  button: ReturnType<Page["getByRole"]>,
  urlPredicate: (url: URL) => boolean,
  timeoutMs = 30_000,
): Promise<void> {
  await expect(button, "submit button").toBeEnabled();

  // Resolve the element BEFORE clicking. The #39 fallback below re-submits the
  // owning form, and it used to do that through the same by-name locator — but
  // a submit in flight RENAMES its button ("Registrar vacuna" → "Registrando…"),
  // so the locator stopped matching and `.evaluate` timed out on an element
  // that had merely changed its label. The click had worked; the fallback was
  // what failed. A handle survives the rename.
  const handle = await button.elementHandle();

  await button.click();
  try {
    await page.waitForURL(urlPredicate, { timeout: 10_000 });
    return;
  } catch {
    // A slow-but-working submit and a dropped click look identical from here,
    // so distinguish them: if the button is now DISABLED or renamed to a
    // pending label, the form is already submitting — re-submitting would fire
    // the action twice. Just keep waiting.
    const pending = await handle
      ?.evaluate((el) => {
        const b = el as HTMLButtonElement;
        return b.disabled || /ando…|ando\.\.\.|Guardando|Registrando/i.test(b.textContent ?? "");
      })
      .catch(() => false);

    if (!pending) {
      // Genuinely dropped click — submit the owning form directly (#39).
      await handle?.evaluate((el) => {
        (el as HTMLButtonElement).form?.requestSubmit();
      });
    }
    await page.waitForURL(urlPredicate, { timeout: timeoutMs });
  }
}

/** Assert we are not on an error/404 boundary — a light sanity gate per screen. */
export async function notErrored(page: Page): Promise<void> {
  await expect(page.locator("body")).toBeVisible();
}

// ---------------------------------------------------------------------------
// Explicit wizard drivers. Unlike tryFill, these FAIL LOUD when the expected
// element is missing — a frozen wizard must break the recording, not silently
// produce a dead screen (see docs/audits + demo-recording/wizard-driver-bug).
// ---------------------------------------------------------------------------

/** Click a radio-card label wrapping a hidden input (the wizard card pattern). */
export async function pickCard(page: Page, name: string, value: string): Promise<void> {
  const card = page.locator(`label:has(input[name="${name}"][value="${value}"])`);
  await expect(card, `radio card ${name}=${value}`).toBeVisible();
  await card.click();
  await page.waitForTimeout(400);
}

/**
 * Click the wizard "Continuar" button and give the next step time to render.
 *
 * Pass `expectStep` to ASSERT the wizard actually advanced. Without it a gated
 * step is silently tolerated: `validateAndAdvance` renders a role=alert reason
 * and stays put, the helper walks on, and the run dies several steps later
 * somewhere that names nothing. That is exactly how the CI failure of
 * admin-case-detail-shell read — "page.waitForURL: Timeout 30000ms exceeded" at
 * the submit, when the truth (visible in the trace's DOM snapshot) was that the
 * wizard never left Paso 3. Report the gate where the gate is.
 */
export async function clickContinuar(page: Page, expectStep?: number): Promise<void> {
  const btn = page.getByRole("button", { name: /continuar/i }).first();
  await expect(btn, "wizard Continuar button").toBeVisible();
  await btn.click();
  if (expectStep != null) {
    const bar = page.getByRole("progressbar").first();
    try {
      await expect(bar).toHaveAttribute("aria-valuenow", String(expectStep), { timeout: 8_000 });
    } catch (err) {
      const reason = await page
        .getByRole("alert")
        .first()
        .innerText()
        .catch(() => "");
      throw reason.trim()
        ? new Error(`wizard refused to advance to step ${expectStep}: "${reason.trim()}"`)
        : err;
    }
  }
  await page.waitForTimeout(500);
}

/**
 * Resolve the /org/[orgToken] portal token for the logged-in member AT RUNTIME
 * (tokens are never hardcoded). /org auto-redirects single-membership users to
 * their org dashboard; multi-membership users get a picker where we click the
 * card matching the hint. FAIL LOUD — an org segment without a portal is dead.
 */
export async function resolveOrgToken(page: Page, orgNameHint: RegExp): Promise<string> {
  await page.goto("/org", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  let match = page.url().match(/\/org\/([^/?#]+)/);
  if (!match) {
    // Membership picker — click the org card matching the hint.
    const card = page.locator('a[href^="/org/"]', { hasText: orgNameHint }).first();
    await expect(card, `org picker card matching ${orgNameHint}`).toBeVisible();
    await card.click();
    await page.waitForURL(/\/org\/[^/?#]+/, { timeout: 15_000 });
    match = page.url().match(/\/org\/([^/?#]+)/);
  }
  const token = match?.[1] ?? "";
  expect(token, "org token resolved from /org redirect or picker").toBeTruthy();
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  return token;
}

/**
 * The currently visible step of an LnWizardShell wizard. Inactive steps stay in
 * the DOM as sr-only + aria-hidden, so global getByRole/getByLabel queries can
 * hit hidden duplicates ("Continuar" exists on every step). Scope through this.
 */
export function wizardStep(page: Page): Locator {
  return page.locator('section[aria-hidden="false"]');
}

/** Drive a LocalityPickerAcross typeahead: type, wait for the dropdown, pick the first match. */
export async function pickLocality(
  page: Page,
  inputSelector: string,
  query: string,
): Promise<void> {
  const input = page.locator(inputSelector);
  await expect(input, `locality typeahead ${inputSelector}`).toBeVisible();
  await input.fill(query);
  // Results render as role="option" rows after a 200ms debounced server search.
  // Matched by role rather than markup: this was `ul button` until LnCombobox
  // moved role="option" onto the <li> and dropped the inner button, and the
  // stale selector went unnoticed while CI was not running the e2e suite.
  const option = page.getByRole("option", { name: query }).first();
  await expect(option, `locality result for "${query}"`).toBeVisible({ timeout: 10_000 });
  await option.click();
  await page.waitForTimeout(300);
}

/**
 * Drive the public 5-step denuncia wizard end to end and submit anonymously
 * with an evidence photo. Returns the reference code from the comprobante URL.
 *
 * Steps (see app/(public)/denuncias/nueva/DenunciaWizard.tsx):
 *   1 kindCard radio → Continuar   2 severityCard radio → Continuar
 *   3 description (min 20 chars) + occurredAtOption radio → Continuar
 *   4 subject (optional) → Continuar
 *   5 "Enviar anónima" + evidence file → "Enviar denuncia →" (server redirect)
 */
/**
 * Coordinates whose canonical locality is CABA/Palermo — a coverage zone of the
 * bootstrap-tier `govt-local@dim.test`, so a denuncia filed here lands in that
 * operator's queue. `govt@dim.test` covers Ushuaia + El Calafate instead; use
 * USHUAIA_POINT for that one. Both accounts come from scripts/seed-test-users.ts
 * and exist on any freshly bootstrapped database.
 */
export const PALERMO_POINT = { latitude: -34.578, longitude: -58.424 };
export const USHUAIA_POINT = { latitude: -54.8019, longitude: -68.303 };

export async function walkDenunciaWizard(
  page: Page,
  opts?: {
    triggerModerationFlag?: boolean;
    /** Where the reported animal is — decides which authority receives it. */
    coords?: { latitude: number; longitude: number };
  },
): Promise<string> {
  const coords = opts?.coords ?? PALERMO_POINT;
  await visit(page, "/denuncias/nueva");

  const description = opts?.triggerModerationFlag
    ? "PERRO ATADO SIN AGUA NI COMIDA EN LA CALLE DESDE HACE VARIOS DIAS"
    : "Perro atado a la intemperie sin agua ni comida hace varios días. Se lo ve muy delgado y sin ningún refugio contra la lluvia.";

  // Step 1 — Qué pasó
  await fullScroll(page);
  await pickCard(page, "kindCard", "neglect");
  await clickContinuar(page, 2);

  // Step 2 — Gravedad
  await fullScroll(page);
  await pickCard(page, "severityCard", "moderado");
  await clickContinuar(page, 3);

  // Step 3 — Dónde y cuándo
  await page.locator("textarea#description").fill(description);
  await pickCard(page, "occurredAtOption", "today_yesterday");
  // A PRECISE POINT IS MANDATORY, and a typed address is not one.
  //
  // jurisdiction-compliance (2026-07-03) made the map pin a hard gate:
  // DenunciaWizard.validateAndAdvance() refuses step 3 without
  // `hasLocationPoint` ("Marcá el lugar exacto en el mapa para continuar"),
  // because the canonical locality — and therefore WHICH AUTHORITY receives the
  // denuncia — is inferred server-side from lat/lng. This helper kept filling
  // only the L2 address text, which sets no point, so every caller was walking
  // a wizard that had stopped at Paso 3. e2e/synthetic-monitor.spec.ts's inline
  // copy of this flow was updated at the time; the shared helper was not, and
  // the divergence stayed invisible until the e2e job started reporting.
  //
  // Geolocation is granted+faked rather than clicking the map: it needs no tile
  // server, so it works in a headless CI browser with no reachable map host.
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation(coords);
  await page.getByRole("button", { name: /usar mi ubicación actual/i }).click();
  // The hidden inputs are what the action reads; wait on them, not on a timer.
  await expect(
    page.locator('input[name="locationLat"]'),
    "geolocation dropped a precise point",
  ).not.toHaveValue("", { timeout: 15_000 });
  await fullScroll(page);
  await clickContinuar(page, 4);

  // Step 4 — Quién (optional): describe an unowned animal
  await pickCard(page, "subjectKindCard", "unowned_animal");
  await page
    .getByPlaceholder(/especie, color, tama/i)
    .first()
    .fill("Perro mestizo mediano, marrón claro, collar de soga gastada.");
  await fullScroll(page);
  await clickContinuar(page, 5);

  // Step 5 — Cerrar: anonymous + evidence photo + submit
  await page.getByRole("button", { name: /enviar an[oó]nima/i }).click();
  await page.locator("#evidenceFiles").setInputFiles(DEMO_PHOTOS[0]);
  await page.waitForTimeout(800);
  await fullScroll(page);
  const submit = page.getByRole("button", { name: /enviar denuncia/i });
  await expect(submit, "denuncia submit button").toBeEnabled();

  // Fired, not awaited — same reason as e2e/create-pet.spec.ts's submit: the
  // click's promise never resolves on a client-side post-action navigation.
  //
  // (When this comment was first written it claimed createWelfareReportAction
  // already returned `redirectTo`. It did not — the use case returned it and the
  // ACTION handed it to redirect(). Read one link of the chain, asserted the
  // whole thing. The action follows N3 as of the B.2 migration; the workaround
  // was right for the wrong stated reason.)
  void submit.click().catch(() => {});

  // createWelfareReportAction redirects to the comprobante on success.
  await page.waitForURL(/\/denuncias\/codigo\//, { timeout: 30_000 });
  await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
  await fullScroll(page);
  return decodeURIComponent(page.url().split("/codigo/")[1] ?? "").split("?")[0];
}
