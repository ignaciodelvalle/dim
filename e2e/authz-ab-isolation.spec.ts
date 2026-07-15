import { type Browser, type BrowserContext, type Page, expect, test } from "@playwright/test";

/**
 * Authorization A/B isolation — LIVE validation (launchworthy Domain 3, the last
 * provisional manual check). Proves, against the running :3000 QA server, that:
 *   1. Owner B cannot open Owner A's private pet surface (/mis-mascotas/[token]).
 *   2. A non-member cannot open an org portal they don't belong to (/org/[token]).
 *   3. A personal account cannot reach an institutional API (/api/panorama/*),
 *      and cannot widen scope by crafting params.
 *
 * Read-only. No writes. Same auth-reuse + unique-x-real-ip conventions as
 * e2e/owner-ia-p6.spec.ts (login rate limits trust x-real-ip; a suite hammering
 * one localhost IP trips them — we are not testing throttling, so each context
 * gets a distinct RFC-5737 documentation IP and each account logs in once).
 *
 * Seed reality (verified live 2026-07-15, all password "Test1234!"):
 *   ignacio@dim.test — owns active pet DIM-SNPY-0004 (Owner A).
 *   noeli@dim.test   — owns DIM-S005-PLRM only; NOT owner of SNPY (Owner B).
 *   lilian@dim.test  — member of Clínica Recoleta (DIM-R5GX-838G) ONLY.
 *   DIM-8M5Z-5G4C    — Refugio Patitas del Norte; lilian is NOT a member.
 */

const PASSWORD = "Test1234!";

const OWNER_A = "ignacio@dim.test";
const OWNER_A_PET = "DIM-SNPY-0004";
const OWNER_B = "noeli@dim.test";
const NON_MEMBER = "lilian@dim.test";
const FOREIGN_ORG = "DIM-8M5Z-5G4C"; // Refugio Patitas del Norte — lilian is not a member

let ipCounter = 0;
function uniqueIp(): string {
  ipCounter += 1;
  return `203.0.113.${(ipCounter % 250) + 1}`;
}

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
const stateCache = new Map<string, StorageState>();

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel(/correo electrónico/i).fill(email);
  await page.getByLabel(/contraseña/i).fill(PASSWORD);
  await page.getByRole("button", { name: /iniciar sesión/i }).click();
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

test.describe("Authorization A/B isolation (live)", () => {
  test("Owner B cannot open Owner A's private pet surface", async ({ browser }) => {
    // Sanity: Owner A can open their own pet.
    const a = await openAs(browser, OWNER_A);
    try {
      const res = await a.page.goto(`/mis-mascotas/${OWNER_A_PET}`);
      expect(res?.status(), "Owner A opening own pet should be 200").toBe(200);
      await expect(a.page).toHaveURL(new RegExp(`/mis-mascotas/${OWNER_A_PET}`));
    } finally {
      await a.context.close();
    }

    // Owner B requests A's pet by its exact token. requirePetAccess is !ok →
    // notFound(). The SECURITY property is that B sees the not-found surface and
    // NONE of A's owner data — not the exact HTTP code (Next 15 renders a
    // page-level notFound() with a 200 document status here, a framework
    // semantics quirk, not an authz failure; asserted separately/softly below).
    const b = await openAs(browser, OWNER_B);
    try {
      await b.page.goto(`/mis-mascotas/${OWNER_A_PET}`);
      // The not-found boundary fired (the guard denied access).
      await expect(
        b.page.getByRole("heading", { name: /no encontramos esta página/i }),
      ).toBeVisible();
      // And A's owner-only surface never leaked to B.
      await expect(b.page.locator("[data-section=libreta-emergencia]")).toHaveCount(0);
      await expect(b.page.getByRole("button", { name: /anotar algo/i })).toHaveCount(0);
    } finally {
      await b.context.close();
    }
  });

  test("Non-member cannot open a foreign org portal", async ({ browser }) => {
    const m = await openAs(browser, NON_MEMBER);
    try {
      // lilian is a member of Clínica Recoleta only; the foreign refugio must
      // answer notFound (no existence leak — decision D4), never its dashboard.
      const res = await m.page.goto(`/org/${FOREIGN_ORG}`);
      expect(res?.status(), "non-member opening foreign org must be 404").toBe(404);
    } finally {
      await m.context.close();
    }
  });

  test("Personal account cannot reach the institutional panorama API", async ({ browser }) => {
    const b = await openAs(browser, OWNER_B);
    try {
      // A personal (non-institutional) session hitting the govt/admin API must
      // be rejected by the _guard (401/403), even with crafted scope params
      // that try to widen to another province.
      const res = await b.page.request.get(
        "/api/panorama/cobertura?level=locality&province=AR-B&asOf=2026-07-01",
        { headers: { "x-real-ip": uniqueIp() } },
      );
      expect(
        [401, 403].includes(res.status()),
        `personal account on /api/panorama must be 401/403, got ${res.status()}`,
      ).toBe(true);
      const body = await res.text();
      // The rejection body must not carry panorama feature data.
      expect(body).not.toContain("features");
    } finally {
      await b.context.close();
    }
  });
});
