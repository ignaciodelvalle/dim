import { expect, test } from "@playwright/test";

import { ACCOUNTS, loginAs } from "./demo/_helpers";

// Reachability smoke for the flows with NO other e2e coverage.
//
// Mapping the adversarial-review brief's flow inventory against this suite
// (2026-08-08) left four surfaces with zero specs behind them: turnos,
// disputas, the decomiso form, and individual intake. They are built — real
// routes, nothing marked `deferred` in nav-presets — just never exercised
// here, which is exactly where a reviewer is most likely to hit a wall and
// exactly where the untested code lives.
//
// DELIBERATELY READ-ONLY. This runs against the deployed staging origin
// shortly before a review pass, so it must not leave rows behind for someone
// else to explain. It answers one question — "can the right role REACH this
// surface and does it render something honest?" — and does not pretend to
// prove the mutation works. A green run here means a blocked reviewer is a
// finding, not a broken environment.

type Surface = {
  name: string;
  account: string;
  path: string;
  /** Something that only renders when the page actually resolved. */
  expect: RegExp;
};

const SURFACES: Surface[] = [
  {
    name: "turnos — buscador del dueño",
    account: ACCOUNTS.owner,
    path: "/turnos/buscar",
    expect: /turnos?|agenda|buscar/i,
  },
  {
    name: "disputas — cola de gobierno",
    account: ACCOUNTS.govtLocal,
    path: "/gob/disputas",
    expect: /disputas?/i,
  },
  {
    name: "decomiso — formulario de ejecución",
    account: ACCOUNTS.govtLocal,
    path: "/gob/decomisos/nuevo",
    expect: /sujeto del decomiso/i,
  },
];

for (const s of SURFACES) {
  test(`alcanzable: ${s.name}`, async ({ page }) => {
    await loginAs(page, s.account);
    const response = await page.goto(s.path);

    // Not asserting response.status() — streaming routes flush the shell before
    // a scoped lookup resolves, so a denied page answers 200 with the branded
    // boundary (e2e/README.md). Assert the SURFACE.
    expect(response, `sin respuesta para ${s.path}`).not.toBeNull();
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.locator("body")).toContainText(s.expect);

    // The two ways this can be "reachable" and still useless to a reviewer.
    await expect(page.getByText(/algo salió mal/i), `${s.path} cayó al error boundary`).toHaveCount(
      0,
    );
    await expect(
      page.getByText(/no encontramos esta página/i),
      `${s.path} no existe para este rol`,
    ).toHaveCount(0);
  });
}

test("alcanzable: intake individual del refugio", async ({ page }) => {
  // The org token is discovered, never hardcoded — and org tokens are `DIM-`
  // prefixed too, so take the segment after /org/ rather than the first match.
  await loginAs(page, ACCOUNTS.orgAdmin);
  await page.goto("/org");
  const orgHref = await page
    .locator('a[href^="/org/DIM"]')
    .first()
    .getAttribute("href")
    .catch(() => null);
  test.skip(orgHref === null, "la cuenta no llega a ninguna organización");
  const orgToken = orgHref?.split("/")[2];

  await page.goto(`/org/${orgToken}/intake?tab=registrar`);
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page.getByText(/algo salió mal/i)).toHaveCount(0);
});
