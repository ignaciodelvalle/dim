import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const PW = "Test1234!";
const EMAIL = "owner@dim.test";

const hits = []; // {url, text}
const browser = await chromium.launch();
const ctx = await browser.newContext({ timezoneId: "America/Argentina/Buenos_Aires" });
const page = await ctx.newPage();
function record(text) {
  if (/#418|#423|#425|parentNode|hydrat/i.test(text)) hits.push({ url: page.url(), text });
}
page.on("console", (msg) => {
  if (msg.type() === "error") record(msg.text());
});
page.on("pageerror", (err) => record("PAGEERROR: " + (err?.message ?? String(err))));

async function hardLoad(path, ms = 3500) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

// 1) login page (unauth) hydration
await hardLoad("/login", 3000);
const beforeLogin = hits.length;
await page.getByLabel(/correo electrónico/i).fill(EMAIL);
await page.getByLabel(/contraseña/i).fill(PW);
await page.getByRole("button", { name: /iniciar sesión/i }).click();
try {
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 12000 });
} catch {
  await page.getByLabel(/contraseña/i).press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 22000 });
}
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(3000);

// 2) isolated hard loads of each route
const routes = [
  "/inicio",
  "/mis-mascotas",
  "/mis-mascotas/DEMO-PET-001",
  "/mis-mascotas/DEMO-PET-001/libreta",
  "/cuenta",
  "/cuenta?sheet=editar-perfil",
];
for (const r of routes) await hardLoad(r);

// editar form mount check
const nameInput = await page.locator("#displayName").count();
const phoneInput = await page.locator("#phone").count();
const cargando = await page.locator("text=Cargando").count();

await browser.close();

console.log("beforeLoginHits=" + beforeLogin);
console.log("TOTAL hydration/parentNode hits: " + hits.length);
const byUrl = {};
for (const h of hits) byUrl[h.url] = (byUrl[h.url] || 0) + 1;
console.log("=== BY URL ===");
for (const [u, c] of Object.entries(byUrl)) console.log(`${c}x  ${u}`);
console.log("=== SAMPLES ===");
for (const h of hits.slice(0, 8)) console.log(`@${h.url}\n  ${h.text.slice(0, 200)}`);
console.log(`=== EDITAR: name=${nameInput} phone=${phoneInput} cargando=${cargando} ===`);
