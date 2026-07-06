import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const PW = "Test1234!";
const EMAIL = "owner@dim.test";

const hits = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ timezoneId: "America/Argentina/Buenos_Aires" });
const page = await ctx.newPage();
function rec(text) {
  if (/#418|#423|#425|parentNode|hydrat/i.test(text)) hits.push({ url: page.url(), text });
}
page.on("console", (m) => { if (m.type() === "error") rec(m.text()); });
page.on("pageerror", (e) => rec("PAGEERROR: " + (e?.message ?? String(e))));

async function hard(path, ms = 3000) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

// login
await hard("/login", 2500);
await page.getByLabel(/correo electrónico/i).fill(EMAIL);
await page.getByLabel(/contraseña/i).fill(PW);
await page.getByRole("button", { name: /iniciar sesión/i }).click();
try { await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 12000 }); }
catch { await page.getByLabel(/contraseña/i).press("Enter"); await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 22000 }); }
await page.waitForLoadState("networkidle").catch(() => {});

// resolve a real pet
await hard("/mis-mascotas", 1500);
const links = await page.locator('a[href^="/mis-mascotas/"]').evaluateAll((els) =>
  els.map((e) => e.getAttribute("href")).filter((h) => h && !/\/(nueva|reclamar|postulaciones)/.test(h)));
const token = (links[0] || "").split("/mis-mascotas/")[1]?.split(/[/?#]/)[0] ?? "DEMO-PET-001";

const routes = ["/inicio", "/mis-mascotas", `/mis-mascotas/${token}`, `/mis-mascotas/${token}/libreta`, "/cuenta"];
const ROUNDS = 3;
for (let r = 0; r < ROUNDS; r++) for (const p of routes) await hard(p, 2200);

// editar sheet mount checks (both entry points), a few times
let editarOk = 0, editarTotal = 0;
for (let i = 0; i < 3; i++) {
  await hard("/cuenta?sheet=editar-perfil", 2800);
  editarTotal++;
  const n = await page.locator("#displayName").count();
  const ph = await page.locator("#phone").count();
  if (n === 1 && ph === 1) editarOk++;
}

await browser.close();
console.log("petToken=" + token);
console.log(`editar mounted: ${editarOk}/${editarTotal}`);
console.log("HYDRATION/parentNode hits: " + hits.length);
const byUrl = {};
for (const h of hits) byUrl[h.url] = (byUrl[h.url] || 0) + 1;
for (const [u, c] of Object.entries(byUrl)) console.log(`  ${c}x ${u}`);
for (const h of hits.slice(0, 6)) console.log("  SAMPLE @" + h.url + ": " + h.text.slice(0, 160));
