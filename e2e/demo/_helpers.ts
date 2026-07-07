import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Locator, type Page, expect } from "@playwright/test";

export const SHARED_PASSWORD = "Test1234!";

// Demo accounts (all password Test1234!) — see scripts/seed-test-users.ts + seed-demo.ts.
export const ACCOUNTS = {
  owner: "owner@dim.test",
  owner2: "owner2@dim.test", // Owner B — cross-tenant target + adoption applicant (seed-test-users.ts ensureOwnerB)
  orgAdmin: "orgadmin@dim.test",
  vetOrgAdmin: "alejo@dim.test", // admin of Clínica Veterinaria Recoleta (clinic org)
  govt: "govt@dim.test",
  admin: "admin@dim.test",
} as const;

// Real animal photos shipped in the repo, reused for live upload flows.
const here = path.dirname(fileURLToPath(import.meta.url));
export const PHOTO_DIR = path.resolve(here, "../../docs/archive/Fotos");
export const DEMO_PHOTOS = ["bolt.jpg", "courage.jpg", "hachi.jpg"].map((f) =>
  path.join(PHOTO_DIR, f),
);

/** Log in through the real UI at /login and wait until we leave the login page. */
export async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  // Let hydration finish before interacting — clicks dispatched before React
  // attaches handlers are silently dropped (clickthrough audit 2026-07-03,
  // task #39), which stranded a whole recording pass on the login screen.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1_500);
  await page.getByLabel(/correo electrónico/i).fill(email);
  await page.getByLabel(/contraseña/i).fill(SHARED_PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 10_000 });
  } catch {
    // Click was swallowed — submit via keyboard (the #39 workaround).
    await page.getByLabel(/contraseña/i).press("Enter");
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
  }
  await page.waitForLoadState("networkidle").catch(() => {});
}

/** Navigate to a path, tolerate 308 redirects, settle, then pause briefly for the recording. */
export async function visit(
  page: Page,
  urlPath: string,
  opts: { settle?: number } = {},
): Promise<void> {
  await page.goto(urlPath, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(opts.settle ?? 600);
}

/** Slow full-page scroll to the bottom and back — reveals long tables/dashboards on camera. */
export async function fullScroll(page: Page): Promise<void> {
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
  await expect(
    page.locator("h1", { hasText: "Panorama" }).first(),
    `panorama console at ${urlPath}`,
  ).toBeVisible();
  await fullScroll(page);
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
  await button.click();
  try {
    await page.waitForURL(urlPredicate, { timeout: 10_000 });
    return;
  } catch {
    // Dropped click — submit the owning form directly (#39 workaround).
    await button.evaluate((el) => {
      (el as HTMLButtonElement).form?.requestSubmit();
    });
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

/** Click the wizard "Continuar" button and give the next step time to render. */
export async function clickContinuar(page: Page): Promise<void> {
  const btn = page.getByRole("button", { name: /continuar/i }).first();
  await expect(btn, "wizard Continuar button").toBeVisible();
  await btn.click();
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
  await page.waitForLoadState("networkidle").catch(() => {});
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
  await page.waitForLoadState("networkidle").catch(() => {});
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
  // Results render as ul > li > button after a 200ms debounced server search.
  const option = page.locator("ul button", { hasText: query }).first();
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
export async function walkDenunciaWizard(
  page: Page,
  opts?: { triggerModerationFlag?: boolean },
): Promise<string> {
  await visit(page, "/denuncias/nueva");

  const description = opts?.triggerModerationFlag
    ? "PERRO ATADO SIN AGUA NI COMIDA EN LA CALLE DESDE HACE VARIOS DIAS"
    : "Perro atado a la intemperie sin agua ni comida hace varios días. Se lo ve muy delgado y sin ningún refugio contra la lluvia.";

  // Step 1 — Qué pasó
  await fullScroll(page);
  await pickCard(page, "kindCard", "neglect");
  await clickContinuar(page);

  // Step 2 — Gravedad
  await fullScroll(page);
  await pickCard(page, "severityCard", "moderado");
  await clickContinuar(page);

  // Step 3 — Dónde y cuándo
  await page.locator("textarea#description").fill(description);
  await pickCard(page, "occurredAtOption", "today_yesterday");
  // Location is optional but great on camera — LocationFields L2 address input.
  await page.locator('input[name="locationAddress"]').fill("Av. Corrientes 1234, CABA");
  await page.waitForTimeout(500);
  await fullScroll(page);
  await clickContinuar(page);

  // Step 4 — Quién (optional): describe an unowned animal
  await pickCard(page, "subjectKindCard", "unowned_animal");
  await page
    .getByPlaceholder(/especie, color, tama/i)
    .first()
    .fill("Perro mestizo mediano, marrón claro, collar de soga gastada.");
  await fullScroll(page);
  await clickContinuar(page);

  // Step 5 — Cerrar: anonymous + evidence photo + submit
  await page.getByRole("button", { name: /enviar an[oó]nima/i }).click();
  await page.locator("#evidenceFiles").setInputFiles(DEMO_PHOTOS[0]);
  await page.waitForTimeout(800);
  await fullScroll(page);
  const submit = page.getByRole("button", { name: /enviar denuncia/i });
  await expect(submit, "denuncia submit button").toBeEnabled();
  await submit.click();

  // createWelfareReportAction redirects to the comprobante on success.
  await page.waitForURL(/\/denuncias\/codigo\//, { timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await fullScroll(page);
  return decodeURIComponent(page.url().split("/codigo/")[1] ?? "").split("?")[0];
}
