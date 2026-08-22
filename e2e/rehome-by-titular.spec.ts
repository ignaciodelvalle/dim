import { type Page, expect, test } from "@playwright/test";

import { ACCOUNTS, loginAs, resolveOrgToken } from "./demo/_helpers";

/**
 * Acompañamiento de adopción (rehome-by-titular) — the one browser-level walk
 * the change is judged on (WU5, spec REQ-1/2/4/8):
 *
 *   RT1  the titular asks a verified org from their own pet surface → the
 *        org finds the request in its Casos inbox and accepts it from the
 *        case detail → the titular sees the accompaniment and ends it
 *        unilaterally, from the same surface.
 *
 * WHY THIS IS ONE SERIAL TEST. Both sides need the same expensive
 * precondition — a real request between two real accounts — and `loginAs`
 * caches sessions per worker (auth_login_email is 5/min · 20/hour on the
 * EMAIL). Serial ordering keeps the shared case in a known state.
 *
 * CONVENTIONS HONOURED (e2e/README.md)
 *   · No hardcoded tokens: the pet comes from owner@dim.test's registry, the
 *     org token from the org picker, the case code from the titular's own
 *     "Ver la solicitud" link — which is the path a person takes too.
 *   · Never wait on a post-action URL: every step asserts the OUTCOME the
 *     mutation produces, after an explicit goto.
 *   · Bootstrap tier only: owner@dim.test (pets in CABA / Palermo) and
 *     orgadmin@dim.test's "Refugio Test (Seed)" (coverage: Palermo) are both
 *     seeded by scripts/seed-test-users.ts, so the picker is non-empty on CI's
 *     fresh DB. Should a seed change empty it, the walk SKIPS naming the hole.
 *
 * IDEMPOTENCE. The walk starts by resolving whatever the page shows (a
 * pending request or an active accompaniment from an earlier run) and ends
 * with the sponsorship withdrawn. Closed cases and ended rows accumulate
 * harmlessly; `cases_open_per_pet_kind_idx` only constrains OPEN ones.
 */

const TITULAR = ACCOUNTS.owner;
const ORG_ADMIN = ACCOUNTS.orgAdmin;
const SEED_ORG = /Refugio Test/i;

/** The first ACTIVE pet in the titular's registry (same locator as the sibling specs). */
async function pickActivePetToken(page: Page): Promise<string> {
  await page.goto("/mis-mascotas", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const petLink = page
    .locator('a[href^="/mis-mascotas/"]:has(img)', { hasText: /registrad[ao]/i })
    .first();
  test.skip(
    (await petLink.count()) === 0,
    "owner@dim.test has no active pet — the rehome walk needs one.",
  );
  const href = (await petLink.getAttribute("href")) ?? "";
  const token = href.split("/mis-mascotas/")[1] ?? "";
  expect(token, "publicToken parsed from the registry link").toBeTruthy();
  return token;
}

/**
 * The one thing every state of the page renders. Gate every `count()` read
 * behind it: `Locator.count()` is a one-shot read that does not auto-retry,
 * and this route streams under the segment's Suspense boundary, so a count
 * taken straight after `goto` can see an empty DOM and turn a real assertion
 * into a silent `test.skip` with a false reason (the repo's own helpers —
 * e2e/demo/_helpers.ts discoverPetToken / resolveOrgToken — wait first).
 */
async function waitForRehomePage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: /Acompañamiento de adopción para/ })).toBeVisible({
    timeout: 20_000,
  });
  await page.waitForLoadState("networkidle").catch(() => {});
}

/** Resolve whatever the page is showing, so a re-run starts from "none". */
async function resetToNone(page: Page, token: string): Promise<void> {
  await page.goto(`/mis-mascotas/${token}/buscar-hogar`, { waitUntil: "domcontentloaded" });
  await waitForRehomePage(page);
  for (const [trigger, confirm] of [
    ["Dar de baja el acompañamiento", "Confirmar la baja"],
    ["Cancelar el pedido", "Confirmar la cancelación"],
  ] as const) {
    const button = page.getByRole("button", { name: trigger });
    if ((await button.count()) === 0) continue;
    await button.click();
    await page.getByRole("button", { name: confirm }).click();
    // The page reloads itself (navigateAfterActionSuccess) — wait for the
    // picker that only the "none" state renders.
    await expect(
      page.getByRole("button", { name: /Pedir acompañamiento a/ }).first(),
    ).toBeVisible();
    return;
  }
}

test.describe
  .serial("acompañamiento de adopción", () => {
    test("RT1 — el titular pide, la organización acepta desde su bandeja, el titular da de baja", async ({
      page,
      browser,
    }) => {
      test.setTimeout(150_000);

      await loginAs(page, TITULAR);
      const token = await pickActivePetToken(page);
      await resetToNone(page, token);

      // ---- the ask, from the titular's own surface ---------------------------
      // The "none" state renders either the picker or its empty state; wait
      // for one of them before the count() that decides whether to skip.
      await expect(
        page
          .getByRole("button", { name: /Pedir acompañamiento a/ })
          .first()
          .or(page.getByText(/No encontramos refugios ni redes de rescate/)),
      ).toBeVisible({ timeout: 20_000 });
      const ask = page.getByRole("button", { name: /Pedir acompañamiento a .*Refugio Test/i });
      test.skip(
        (await ask.count()) === 0,
        "the seed refugio does not cover this pet's zone — the org picker is empty for it.",
      );
      await ask.first().click();
      // The OUTCOME: the same surface, in its pending state, under the same name.
      await expect(page.getByText(/Pedido enviado a .*Refugio Test/i)).toBeVisible();
      const caseHref = await page
        .getByRole("link", { name: /Ver la solicitud/ })
        .getAttribute("href");
      expect(caseHref, "the request's case code, from the titular's own link").toMatch(
        /^\/casos\/CAS-/,
      );

      // ---- the org finds it in its inbox and answers from the detail ----------
      const orgContext = await browser.newContext();
      const orgPage = await orgContext.newPage();
      try {
        await loginAs(orgPage, ORG_ADMIN);
        const orgToken = await resolveOrgToken(orgPage, SEED_ORG);

        await orgPage.goto(`/org/${orgToken}/casos?kind=rehome_request&status=open`, {
          waitUntil: "domcontentloaded",
        });
        await expect(
          orgPage.locator(`a[href="${caseHref}"]`).first(),
          "the request is in the org's Casos inbox (REQ-2)",
        ).toBeVisible();

        await orgPage.goto(caseHref as string, { waitUntil: "domcontentloaded" });
        await orgPage.getByRole("button", { name: "Aceptar el acompañamiento" }).click();
        // The consequence, BEFORE the click: the animal is not in the org's possession.
        await expect(orgPage.getByText(/no lo tiene en su poder/)).toBeVisible();
        await orgPage.getByRole("button", { name: "Confirmar el acompañamiento" }).click();

        await orgPage.goto(caseHref as string, { waitUntil: "domcontentloaded" });
        await expect(orgPage.getByText("Solicitud aceptada por la organización")).toBeVisible();
        await expect(
          orgPage.getByRole("button", { name: "Aceptar el acompañamiento" }),
        ).toHaveCount(0);
      } finally {
        await orgContext.close();
      }

      // ---- the titular sees the accompaniment and ends it, unilaterally -------
      await page.goto(`/mis-mascotas/${token}/buscar-hogar`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText(/acompaña la adopción de/)).toBeVisible();
      await page.getByRole("button", { name: "Dar de baja el acompañamiento" }).click();
      await expect(page.getByText(/se retira de la búsqueda de hogar/)).toBeVisible();
      await page.getByRole("button", { name: "Confirmar la baja" }).click();

      await page.goto(`/mis-mascotas/${token}/buscar-hogar`, { waitUntil: "domcontentloaded" });
      await expect(
        page.getByRole("button", { name: /Pedir acompañamiento a/ }).first(),
      ).toBeVisible();
      await expect(page.getByText(/acompaña la adopción de/)).toHaveCount(0);
    });
  });
