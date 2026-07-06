import { chromium } from "@playwright/test";

const BASE = "http://localhost:3002";
const PW = "Test1234!";
const EMAIL = "owner@dim.test";

const hydration = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ timezoneId: "America/Argentina/Buenos_Aires" });
const page = await ctx.newPage();
page.on("console", (msg) => {
  const t = msg.text();
  if (
    /hydrat|did not match|server rendered|Text content|tree will be regenerated|#418|#425/i.test(t)
  ) {
    hydration.push(`[${msg.type()}] ${t}`);
  }
});
page.on("pageerror", (err) => {
  const t = err?.stack || err?.message || String(err);
  if (/hydrat|did not match|#418|#425/i.test(t)) hydration.push("[pageerror] " + t);
});

await page.goto(BASE + "/login");
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(2500);
await page.getByLabel(/correo electrónico/i).fill(EMAIL);
await page.getByLabel(/contraseña/i).fill(PW);
await page.getByRole("button", { name: /iniciar sesión/i }).click();
try {
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
} catch {
  await page.getByLabel(/contraseña/i).press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 });
}
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(3000);

// hard-load /inicio to force fresh SSR + hydration
await page.goto(BASE + "/inicio", { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForTimeout(4000);

// find a real pet and load its libreta
await page.goto(BASE + "/mis-mascotas", { waitUntil: "domcontentloaded" }).catch(() => {});
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(2000);
const links = await page
  .locator('a[href^="/mis-mascotas/"]')
  .evaluateAll((els) =>
    els
      .map((e) => e.getAttribute("href"))
      .filter(
        (h) =>
          h && !h.includes("/nueva") && !h.includes("/reclamar") && !h.includes("/postulaciones"),
      ),
  );
const token = (links[0] || "").split("/mis-mascotas/")[1]?.split(/[/?#]/)[0] ?? "";
console.log("REAL petToken=" + token);
if (token) {
  await page
    .goto(BASE + `/mis-mascotas/${token}`, { waitUntil: "domcontentloaded" })
    .catch(() => {});
  await page.waitForTimeout(4000);
  await page
    .goto(BASE + `/mis-mascotas/${token}/libreta`, { waitUntil: "domcontentloaded" })
    .catch(() => {});
  await page.waitForTimeout(4000);
}

await browser.close();
console.log("=== HYDRATION MESSAGES (" + hydration.length + ") ===");
for (const h of [...new Set(hydration)].slice(0, 12)) console.log(h.slice(0, 900) + "\n----");
