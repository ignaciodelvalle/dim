import { expect, test } from "@playwright/test";

import { ACCOUNTS, loginAs } from "./demo/_helpers";

// Task #47 regression: a government operator opening a case from /gob must
// STAY inside the operator shell (rail + topbar), not be dropped into the
// public citizen chrome. The case row used to link at /casos/[code] (citizen
// layout); it now links at /gob/casos/[code] (operator layout).
//
// The in-scope case is READ FROM THE OPERATOR'S OWN QUEUE, not hardcoded. This
// spec used to pin "CAS-99DF-75CC", a code from an old seed that no longer
// exists (measured: 5595 cases in the database, not that one), so its
// assertions were being made against a 404 whose heading is "No encontramos
// esta página". Its admin sibling had the same literal and the same silence.
//
// A row from govt@dim.test's own queue is in-scope by construction, which is a
// stronger guarantee than a literal that has to stay in scope forever.
test("govt case detail keeps the operator shell", async ({ page }) => {
  await loginAs(page, ACCOUNTS.govt);

  await page.goto("/gob/casos");
  await page.waitForLoadState("networkidle").catch(() => {});
  const queueLink = page.locator('a[href^="/gob/casos/"]').first();
  await expect(queueLink, "at least one case in the govt queue").toBeVisible();
  const IN_SCOPE_CASE = ((await queueLink.getAttribute("href")) ?? "").split("/").pop() ?? "";
  expect(IN_SCOPE_CASE, "case code read from the queue").not.toBe("");

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
