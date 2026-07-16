import { expect, test } from "@playwright/test";

import { ACCOUNTS, loginAs } from "./demo/_helpers";

// Admin half of the task #47 shell-loss class (sibling of
// e2e/gob-case-detail-shell.spec.ts). Only the govt half was fixed then: admin
// kept linking cases at the public /casos/[code], so a national operator
// opening a case still dropped out of the operator shell into the citizen
// chrome.
//
// QA ronda 5 (2026-07-16) caught it from the outside: the tester opened a
// denuncia from /admin/casos, got "Adoptar · Mascotas perdidas · Refugios ·
// Denuncias · ← Volver a mi app", found zero operator actions, and reported
// being unable to do the job at all.
//
// Admin has universal scope, so any seed case serves; this one is the same
// in-scope CABA case the govt sibling spec uses.
const CASE_CODE = "CAS-99DF-75CC";

test("admin case detail keeps the operator shell", async ({ page }) => {
  await loginAs(page, ACCOUNTS.admin);

  // 1. Direct navigation to the admin-scoped case detail must NOT redirect away
  //    (out-of-shell to /casos, or bounced by an auth gate).
  await page.goto(`/admin/casos/${CASE_CODE}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  expect(new URL(page.url()).pathname).toBe(`/admin/casos/${CASE_CODE}`);

  // 2. Operator rail is present (an /admin nav link only the operator shell
  //    renders — the admin analogue of the gob spec's /gob/panorama probe).
  await expect(page.locator('a[href="/admin/panorama"]').first()).toBeVisible();

  // 3. The public citizen browse nav is ABSENT — the exact chrome the bug
  //    exposed to the QA tester.
  await expect(page.locator('a[href="/adoptar"]')).toHaveCount(0);
  await expect(page.locator('a[href="/refugios"]')).toHaveCount(0);
  await expect(page.getByText("Volver a mi app")).toHaveCount(0);

  // 4. The case CONTENT is preserved (the shared CaseDetailView renders the
  //    case code + the timeline heading).
  await expect(page.getByText(CASE_CODE).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Línea de tiempo" })).toBeVisible();

  // 5. Clicking through from the list lands on the in-shell detail route — the
  //    queue row's detailHref, which is what actually regressed.
  await page.goto("/admin/casos");
  await page.waitForLoadState("networkidle").catch(() => {});
  const firstDetail = page.locator('a[href^="/admin/casos/"]').first();
  if (await firstDetail.count()) {
    const href = await firstDetail.getAttribute("href");
    expect(href).toMatch(/^\/admin\/casos\//);
  }
  // No queue row may point at the public citizen route.
  await expect(page.locator('a[href^="/casos/"]')).toHaveCount(0);
});
