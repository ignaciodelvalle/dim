import { expect, test } from "@playwright/test";

import { ACCOUNTS, loginAs } from "./demo/_helpers";

// Task #47 regression: a government operator opening a case from /gob must
// STAY inside the operator shell (rail + topbar), not be dropped into the
// public citizen chrome. The case row used to link at /casos/[code] (citizen
// layout); it now links at /gob/casos/[code] (operator layout).
//
// In-scope seed case for govt@dim.test (Palermo/CABA assignment):
const IN_SCOPE_CASE = "CAS-99DF-75CC";

test("govt case detail keeps the operator shell", async ({ page }) => {
  await loginAs(page, ACCOUNTS.govt);

  // 1. Direct navigation to the gob-scoped case detail must NOT redirect away
  //    (out-of-shell to /casos, or bounced to / by an auth gate).
  await page.goto(`/gob/casos/${IN_SCOPE_CASE}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  expect(new URL(page.url()).pathname).toBe(`/gob/casos/${IN_SCOPE_CASE}`);

  // 2. Operator rail is present (a /gob nav link only the operator shell renders).
  await expect(page.locator('a[href="/gob/panorama"]').first()).toBeVisible();

  // 3. The public citizen browse nav is ABSENT — this is the exact chrome the
  //    bug exposed ("Adoptar / Mascotas perdidas / Refugios / Denuncias" plus
  //    the "← Volver a mi app" escape link).
  await expect(page.locator('a[href="/adoptar"]')).toHaveCount(0);
  await expect(page.locator('a[href="/refugios"]')).toHaveCount(0);
  await expect(page.getByText("Volver a mi app")).toHaveCount(0);

  // 4. The case CONTENT is preserved (the shared CaseDetailView renders the
  //    case code + the timeline heading).
  await expect(page.getByText(IN_SCOPE_CASE).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Línea de tiempo" })).toBeVisible();

  // 5. Clicking through from the list lands on the in-shell detail route.
  await page.goto("/gob/casos");
  await page.waitForLoadState("networkidle").catch(() => {});
  const firstDetail = page.locator('a[href^="/gob/casos/"]').first();
  if (await firstDetail.count()) {
    const href = await firstDetail.getAttribute("href");
    expect(href).toMatch(/^\/gob\/casos\//);
  }
});
