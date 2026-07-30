import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Locator, type Page, expect } from "@playwright/test";

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
  govt: "govt@dim.test",
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

/** Log in through the real UI at /login and wait until we leave the login page. */
export async function loginAs(page: Page, email: string): Promise<void> {
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
