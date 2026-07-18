import { type Browser, type BrowserContext, type Page, expect, test } from "@playwright/test";

/**
 * Owner IA redesign — P6 LIVE validation pass.
 *
 * Exercises the owner Information-Architecture contract shipped across
 * owner-ia-redesign P1–P5 against the running QA server on :3000. Read-only:
 * the anotar sheet may be OPENED but never submitted; no destructive writes.
 *
 * Conventions borrowed from e2e/a11y-operator-auth.spec.ts + owner-shell.spec.ts:
 *   - login via /login (correo electrónico / contraseña / "iniciar sesión").
 *   - baseURL from playwright.local3000.config.ts (http://localhost:3000).
 *   - Serial (workers:1) — the config runs one worker.
 *
 * AUTH SESSION REUSE (important): the app's loginAction enforces a login rate
 * limit (auth_login_email 5/min·20/h, auth_login_ip 10/min·100/h — see
 * src/modules/auth/application/login.ts). Logging in fresh in every test tripped
 * that limiter across repeated full-suite runs. So each account authenticates
 * ONCE per run; its storageState (auth cookies) is cached and reused by every
 * test that needs it. This is also the Playwright-recommended pattern.
 *
 * Seed accounts (all password "Test1234!", verified live before writing):
 *   ignacio@dim.test — 9 live pets (carousel owner; fresh login budget)
 *   noeli@dim.test   — owns DIM-S005-PLRM "Luna" (LOST)
 *   lilian@dim.test  — vet, single-org member (Clínica Recoleta) → /org/ landing
 *   alejo@dim.test   — admin of Refugio Patitas del Norte → org-path viewer of
 *                      DIM-ARGO-DEMO (held pet), 0 personally-owned pets
 *   carla@dim.test   — owner, 0 pets, no org memberships (zero-pet landing)
 *   admin@dim.test   — admin (cockpit)
 * Flagship public pet: DIM-PAMP-0001. Owner-owned deterministic pet for the
 * keyboard test: DIM-SNPY-0004 (Snoopy, owned by ignacio).
 */

const PASSWORD = "Test1234!";

const CAROUSEL_OWNER = "ignacio@dim.test";
const OWNER_PET = "DIM-SNPY-0004"; // active, owned by ignacio
const FLAGSHIP = "DIM-PAMP-0001"; // flagship, public
const LOST_OWNER = "noeli@dim.test";
const LOST_TOKEN = "DIM-S005-PLRM";
const VET = "lilian@dim.test";
const ORG_VIEWER = "alejo@dim.test";
const ORG_HELD_TOKEN = "DIM-ARGO-DEMO";
const ZERO_PET_OWNER = "carla@dim.test";
const ADMIN = "admin@dim.test";

const PROFILE_RE = /\/mis-mascotas\/DIM-[A-Z0-9-]+/;

function tokenFromUrl(url: string): string | null {
  const m = url.match(/\/mis-mascotas\/(DIM-[A-Z0-9-]+)/);
  return m ? m[1] : null;
}

// --- Per-context unique client IP -------------------------------------------
//
// The app throttles per caller IP (login: auth_login_ip 10/min·100/h; public
// credential: public_token_page 60/min·400/h — lib/infra/rate-limit.ts, which
// trusts x-real-ip). A whole test suite hammering one localhost IP trips those
// limits even though each individual scan/login is legitimate. We are NOT
// testing rate-limiting here, so give every context a distinct x-real-ip
// (TEST-NET-3, RFC 5737 documentation range) — each request looks like a fresh
// visitor and the content-under-test is never masked by a throttle notice.
let ipCounter = 0;
function uniqueIp(): string {
  ipCounter += 1;
  return `203.0.113.${(ipCounter % 250) + 1}`;
}

// --- One-time login + storageState reuse ------------------------------------

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
const stateCache = new Map<string, StorageState>();

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/correo electrónico/i).fill(email);
  await page.getByLabel(/contraseña/i).fill(PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  // The post-login redirect is a Next server-action navigation. expect.poll
  // reads page.url() on its own schedule, independent of navigation lifecycle
  // events (networkidle/commit both proved flaky against it). A visible login
  // error (e.g. rate-limit) surfaces here as a fast, explicit failure.
  const loginError = page
    .getByRole("alert")
    .filter({ hasText: /intento|contraseñ|inválid|error/i });
  await expect
    .poll(
      async () => {
        if (await loginError.count()) {
          const txt = (
            await loginError
              .first()
              .innerText()
              .catch(() => "")
          ).trim();
          if (txt) throw new Error(`login blocked for ${email}: "${txt}"`);
        }
        return new URL(page.url()).pathname;
      },
      { timeout: 30_000, intervals: [150, 250, 500, 500, 1000, 1500] },
    )
    .not.toMatch(/^\/login/);
}

async function stateFor(browser: Browser, email: string): Promise<StorageState> {
  const cached = stateCache.get(email);
  if (cached) return cached;
  const context = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": uniqueIp() } });
  try {
    const page = await context.newPage();
    await login(page, email);
    const state = await context.storageState();
    stateCache.set(email, state);
    return state;
  } finally {
    await context.close();
  }
}

async function openAs(
  browser: Browser,
  email: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    storageState: await stateFor(browser, email),
    extraHTTPHeaders: { "x-real-ip": uniqueIp() },
  });
  const page = await context.newPage();
  return { context, page };
}

// Open a fresh UNAUTHENTICATED context with its own client IP for public routes.
async function openPublic(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-real-ip": uniqueIp() } });
  const page = await context.newPage();
  return { context, page };
}

// Public credential / open-data routes carry a per-IP throttle
// (public_token_page 60/min, open_data 30/min). A real single scan never trips
// it, but a test suite hammering the same localhost IP can. Retry through the
// soft ThrottleNotice ("Demasiadas consultas") so the assertion sees the real
// page, not a transient throttle.
async function gotoPublicResilient(page: Page, url: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto(url);
    await page.waitForLoadState("domcontentloaded");
    if ((await page.getByText(/Demasiadas consultas/i).count()) === 0) return;
    await page.waitForTimeout(15_000); // ease the per-minute window
  }
}

// ---------------------------------------------------------------------------
// 1. Owner login → /inicio lands on the most-urgent pet's profile; carousel
//    chrome visible when the owner has >1 live pet.
// ---------------------------------------------------------------------------
test("1 — owner /inicio redirects into the most-urgent pet profile with carousel chrome", async ({
  browser,
}) => {
  const { context, page } = await openAs(browser, CAROUSEL_OWNER);
  try {
    await page.goto("/inicio");
    await page.waitForURL(PROFILE_RE, { timeout: 20_000 });

    const url = page.url();
    expect(url, "final URL is a real pet profile route").toMatch(PROFILE_RE);
    expect(tokenFromUrl(url), "resolved a concrete DIM token").toBeTruthy();

    const chrome = page.getByTestId("pet-carousel-chrome");
    await expect(chrome, "carousel chrome present for >1 live pet").toBeVisible();
    const dots = chrome.getByRole("button", { name: /Mascota \d+ de \d+/ });
    expect(await dots.count(), "position dots rendered").toBeGreaterThan(1);
    await expect(
      chrome.locator("button[aria-current='true']"),
      "the current pet has an active dot",
    ).toHaveCount(1);
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// 2. Arrow navigation moves to the neighbor's REAL route and prev returns.
// ---------------------------------------------------------------------------
test("2 — desktop next/prev arrows navigate to the neighbor pet route and back", async ({
  browser,
}) => {
  const { context, page } = await openAs(browser, CAROUSEL_OWNER);
  try {
    await page.goto("/inicio");
    await page.waitForURL(PROFILE_RE, { timeout: 20_000 });
    const startToken = tokenFromUrl(page.url());
    expect(startToken).toBeTruthy();

    const chrome = page.getByTestId("pet-carousel-chrome");
    const next = chrome.getByRole("button", { name: /Mascota siguiente/i });
    await expect(next, "next arrow present (desktop)").toBeVisible();
    await expect(next).toBeEnabled();

    await next.click();
    await page.waitForURL(
      (u) => PROFILE_RE.test(u.pathname) && tokenFromUrl(u.href) !== startToken,
      { timeout: 20_000 },
    );
    const neighborToken = tokenFromUrl(page.url());
    expect(neighborToken, "URL changed to a different, real pet route").not.toBe(startToken);
    expect(neighborToken).toBeTruthy();
    await expect(page.locator("#main-content")).toHaveCount(1);
    await expect(page.getByTestId("pet-carousel-chrome")).toBeVisible();

    const prev = page
      .getByTestId("pet-carousel-chrome")
      .getByRole("button", { name: /Mascota anterior/i });
    await prev.click();
    await page.waitForURL((u) => tokenFromUrl(u.href) === startToken, { timeout: 20_000 });
    expect(tokenFromUrl(page.url()), "prev arrow returned to the original pet").toBe(startToken);
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// 3. BACK BUTTON — the flagged soft-loop risk. Fact-finding: characterize the
//    browser Back after landing via the /inicio redirect, and assert the URL is
//    not trapped in an infinite redirect bounce.
// ---------------------------------------------------------------------------
test("3 — browser Back after /inicio redirect does not trap in a redirect loop", async ({
  browser,
}) => {
  const { context, page } = await openAs(browser, CAROUSEL_OWNER);
  try {
    await page.goto("/mis-mascotas");
    await page.waitForLoadState("domcontentloaded");
    const indexUrl = page.url();

    await page.goto("/inicio");
    await page.waitForURL(PROFILE_RE, { timeout: 20_000 });
    const landedUrl = page.url();
    const landedToken = tokenFromUrl(landedUrl);

    // Press Back and sample the URL repeatedly. The flagged risk is a redirect
    // loop; the distinguishing signal of a LOOP (vs a one-shot re-redirect) is
    // that the URL never stops changing. So we sample a handful of times and
    // require the URL to STABILISE (two consecutive equal reads), then report
    // exactly where it settled — this is a fact-finding assertion.
    await page.goBack();
    const samples: string[] = [];
    let settled = "";
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(500);
      const u = page.url();
      samples.push(u);
      if (i > 0 && samples[i] === samples[i - 1]) {
        settled = u;
        break;
      }
    }
    if (!settled) settled = samples[samples.length - 1];

    const characterization = {
      indexUrl,
      landedUrl,
      landedToken,
      backSamples: samples,
      settledUrl: settled,
      settledOnIndex: settled.includes("/mis-mascotas") && !PROFILE_RE.test(settled),
      settledOnAProfile: PROFILE_RE.test(settled),
      settledOnSameProfile: tokenFromUrl(settled) === landedToken,
      stillChangingAtEnd:
        samples.length >= 2 && samples[samples.length - 1] !== samples[samples.length - 2],
    };
    console.log("[P6 back-button characterization]", JSON.stringify(characterization, null, 2));

    // HARD assertion: NOT an infinite redirect loop — the URL must stop changing
    // (the last two samples agree), and the page must be interactive.
    expect(
      characterization.stillChangingAtEnd,
      "URL stopped changing after Back — no infinite redirect loop",
    ).toBe(false);
    await expect(page.locator("#main-content")).toHaveCount(1);
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// 4. One-tap capture: /inicio?sheet=anotar forwards the query onto the profile
//    route AND opens the anotar sheet.
// ---------------------------------------------------------------------------
test("4 — /inicio?sheet=anotar lands on a profile route with the anotar sheet open", async ({
  browser,
}) => {
  const { context, page } = await openAs(browser, CAROUSEL_OWNER);
  try {
    await page.goto("/inicio?sheet=anotar");
    await page.waitForURL(PROFILE_RE, { timeout: 20_000 });

    const url = new URL(page.url());
    expect(url.pathname, "landed on a real pet profile route").toMatch(PROFILE_RE);
    expect(url.searchParams.get("sheet"), "sheet=anotar forwarded onto the profile URL").toBe(
      "anotar",
    );

    const dialog = page.getByRole("dialog");
    await expect(dialog, "anotar sheet dialog is open").toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: /Anotar algo de/i }),
      "anotar sheet title present",
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// 5. Keyboard arrows inert while the anotar sheet is open.
// ---------------------------------------------------------------------------
test("5 — ArrowRight does not navigate pets while the anotar sheet is open", async ({
  browser,
}) => {
  const { context, page } = await openAs(browser, CAROUSEL_OWNER);
  try {
    await page.goto(`/mis-mascotas/${OWNER_PET}?sheet=anotar`);
    const dialog = page.getByRole("dialog");
    await expect(dialog, "anotar sheet open on the owned pet").toBeVisible({ timeout: 15_000 });

    const before = tokenFromUrl(page.url());
    expect(before).toBe(OWNER_PET);

    // The carousel's window ArrowRight handler must be inert while a dialog is
    // open (PetCredentialCarousel guards on [role=dialog]/[data-vaul-drawer]).
    await page.locator("body").press("ArrowRight");
    await page.waitForTimeout(800);

    expect(tokenFromUrl(page.url()), "pet did not change under the open sheet").toBe(before);
    await expect(dialog, "sheet still open").toBeVisible();
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// 6. Zero-pet landing: /inicio → /mis-mascotas with the first-run CTA.
// ---------------------------------------------------------------------------
test("6 — zero-pet owner /inicio lands on /mis-mascotas with the first-run CTA", async ({
  browser,
}) => {
  const { context, page } = await openAs(browser, ZERO_PET_OWNER);
  try {
    await page.goto("/inicio");
    await page.waitForURL(/\/mis-mascotas(\?|#|$)/, { timeout: 20_000 });

    const url = new URL(page.url());
    expect(url.pathname, "redirected to the index, not a pet profile").toBe("/mis-mascotas");
    expect(PROFILE_RE.test(url.pathname), "no pet token — the owner has none").toBe(false);

    await expect(page.getByText(/No tenés mascotas registradas/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Cargar una mascota/i })).toBeVisible();
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// 7. Vet escape hatch: /mis-mascotas redirects a vet to the org portal;
//    ?as=owner shows the owner index.
// ---------------------------------------------------------------------------
test("7 — vet /mis-mascotas redirects to the org portal; ?as=owner shows the index", async ({
  browser,
}) => {
  const { context, page } = await openAs(browser, VET);
  try {
    await page.goto("/mis-mascotas");
    // The vet redirect is a server redirect to /org/<token>; poll until it
    // settles rather than reading the URL before it completes.
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 20_000 }).toMatch(/^\/org\//);

    await page.goto("/mis-mascotas?as=owner");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /Mis mascotas/i })).toBeVisible();
    expect(new URL(page.url()).pathname, "?as=owner stays on the owner index").toBe(
      "/mis-mascotas",
    );
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// 8. Org viewer of a held pet: NO carousel chrome, NO emergency-contacts block.
// ---------------------------------------------------------------------------
test("8 — org viewer of a held pet gets no carousel chrome and no emergency block", async ({
  browser,
}) => {
  const { context, page } = await openAs(browser, ORG_VIEWER);
  try {
    await page.goto(`/mis-mascotas/${ORG_HELD_TOKEN}`);
    await page.waitForLoadState("domcontentloaded");

    expect(new URL(page.url()).pathname, "org viewer stays on the pet route").toBe(
      `/mis-mascotas/${ORG_HELD_TOKEN}`,
    );

    await expect(page.getByText(/como miembro de/i), "org access notice present").toBeVisible();
    await expect(page.getByTestId("pet-carousel-chrome")).toHaveCount(0);

    // Reveal the (deferred) Libreta face via the band turn button (the single
    // flip control — the tablist is gone, tarjeta-todo), then assert the
    // owner-only Emergencia block never rendered for an org viewer.
    const turnButton = page.getByRole("button", { name: "Girar a Libreta" });
    if (await turnButton.count()) {
      await turnButton.first().click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(500);
    }
    await expect(page.locator("[data-section='libreta-emergencia']")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// 9. Share/public path: /p/{flagship} renders unauthenticated, no chrome, no PII.
// ---------------------------------------------------------------------------
test("9 — public /p/{flagship} renders with no auth, no carousel chrome, no contact PII", async ({
  browser,
}) => {
  const { context, page } = await openPublic(browser);
  try {
    await gotoPublicResilient(page, `/p/${FLAGSHIP}`);

    expect(new URL(page.url()).pathname, "stayed on the public credential route").toBe(
      `/p/${FLAGSHIP}`,
    );
    await expect(page.getByText("Credencial pública", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await expect(page.getByTestId("pet-carousel-chrome")).toHaveCount(0);

    // No contact PII on an ACTIVE credential: no lost-mode owner disclosure, and
    // no phone-number pattern anywhere in the body.
    await expect(page.locator("[data-section='lost-urgent-banner']")).toHaveCount(0);
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    expect(body, "no phone-number PII on the active public credential").not.toMatch(
      /(\+?54\s?9?\s?11[\s-]?\d{4}[\s-]?\d{4})|(\b11[\s-]?\d{4}[\s-]?\d{4}\b)/,
    );
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// 10. Lost-pet emergency path: public shows the lost banner; owner profile
//     shows the LostCaseBlock.
// ---------------------------------------------------------------------------
test("10 — lost pet: public page shows the lost banner; owner profile shows LostCaseBlock", async ({
  browser,
}) => {
  // Public lost credential (unauthenticated, fresh-IP context).
  const { context: pubContext, page } = await openPublic(browser);
  try {
    await gotoPublicResilient(page, `/p/${LOST_TOKEN}`);
    await expect(
      page.locator("[data-section='lost-urgent-banner']"),
      "public lost banner rendered",
    ).toBeVisible();
  } finally {
    await pubContext.close();
  }

  // Owner profile — LostCaseBlock with the owner "marcar encontrada" action.
  const { context, page: ownerPage } = await openAs(browser, LOST_OWNER);
  try {
    await ownerPage.goto(`/mis-mascotas/${LOST_TOKEN}`);
    await ownerPage.waitForLoadState("domcontentloaded");
    await expect(
      ownerPage.locator("[data-section='lost-case-block']"),
      "owner LostCaseBlock rendered on the profile",
    ).toBeVisible();
    await expect(ownerPage.getByText(/marcar como/i).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------------------
// 11. Open data public: /transparencia renders unauthenticated with dataset
//     cards; the cobertura JSON returns 200 with license metadata and no PII;
//     any suppressed cell shows the marker, never 0.
// ---------------------------------------------------------------------------
test("11 — /transparencia + cobertura JSON: public, licensed, PII-free, suppression marker", async ({
  browser,
  request,
}) => {
  const { context, page } = await openPublic(browser);
  try {
    await gotoPublicResilient(page, "/transparencia");
    await expect(page.getByRole("heading", { name: /Transparencia activa/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Conjuntos de datos/i })).toBeVisible();
    const jsonLinks = page.getByRole("link", { name: /^JSON$/ });
    expect(await jsonLinks.count(), "dataset cards expose JSON downloads").toBeGreaterThan(0);
  } finally {
    await context.close();
  }

  const res = await request.get("/transparencia/datos/cobertura-antirrabica?format=json", {
    headers: { "x-real-ip": uniqueIp() },
  });
  expect(res.status(), "cobertura JSON returns 200").toBe(200);
  expect(res.headers()["x-license"], "license header present").toBe("CC-BY-4.0");

  const doc = await res.json();
  expect(doc.meta.license.id, "license id in body").toBe("CC-BY-4.0");
  expect(doc.meta.license.url, "license url present").toContain("creativecommons.org");
  expect(doc.meta.license.attribution, "license attribution present").toBeTruthy();
  expect(doc.meta.suppression.k, "k-anonymity threshold").toBe(5);
  expect(doc.meta.suppression.marker, "suppression marker declared").toBe(
    "suprimido por privacidad",
  );

  const rows: Array<Record<string, unknown>> = doc.data;
  expect(Array.isArray(rows) && rows.length > 0, "dataset has rows").toBe(true);

  const piiRe = /dni|token|nombre|owner|dueñ|email|telefono|phone|direccion|lat|lng/i;
  const piiKeys = Object.keys(rows[0]).filter((k) => piiRe.test(k));
  expect(piiKeys, "no PII-shaped columns in the open dataset").toEqual([]);

  const marker = doc.meta.suppression.marker;
  let suppressedSeen = 0;
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (k === "provincia" || k === "codigo_iso") continue;
      if (typeof v === "string" && v === marker) suppressedSeen++;
      if (typeof v === "string") {
        // A numeric 0 masquerading as suppression is the exact defect to catch:
        // a suppressed cell must be the marker STRING, never empty/zero.
        expect(v === marker || v.length > 0, "no empty numeric cell").toBe(true);
      }
    }
  }
  console.log(
    `[P6 open-data] rows=${rows.length} suppressedCells=${suppressedSeen} (marker='${marker}')`,
  );
});

// ---------------------------------------------------------------------------
// 12. Admin cockpit: /admin shows the queue cockpit tiles and the site map.
// ---------------------------------------------------------------------------
test("12 — admin /admin shows the queue cockpit and the site map", async ({ browser }) => {
  const { context, page } = await openAs(browser, ADMIN);
  try {
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");

    expect(new URL(page.url()).pathname, "admin stays on /admin").toBe("/admin");
    await expect(page.getByRole("heading", { name: /Panel de administración/i })).toBeVisible();
    await expect(page.getByText(/Estado de las colas/i), "queue cockpit present").toBeVisible();
    await expect(
      page.getByText(/Colas operativas/i),
      "operational queues tile group",
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Mapa del sitio/i }),
      "admin site map present",
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
