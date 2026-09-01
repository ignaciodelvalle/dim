// Every native route carries a DECIDED header, or its absence carries a reason.
//
// THE CLASS THIS CLOSES (walkthrough 2026-08-31 §3): an Expo Router route that
// `_layout.tsx` does not register takes its header from the path segment —
// "turnos/index", lowercase, over a screen whose own title is capitalised.
// Eight accumulated precisely because nothing ever went red; this file is the
// fence the finding called "fence-shaped with no fence", wrapping the same
// recount the doc prescribes as commands.
//
// THE EXEMPTION TABLE IS NOT A LOOPHOLE — it is the integrator's rule made
// checkable: THE TITLE IS TRANSCRIBED, NOT INVENTED, and a route whose
// surfaces disagree on the string is a COPY question no merge may settle. An
// exemption names the disagreement; it dies loudly when the route disappears
// or gets registered (both directions, the REF_EXEMPT pattern from
// scripts/check-scheduled-fence-refs.ts), so it cannot outlive its argument.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const APP_DIR = join(process.cwd(), "apps/mobile/app");
const LAYOUT = join(APP_DIR, "_layout.tsx");

/** Routes deliberately unregistered: two surfaces, two strings — a pending
 * copy decision, written down so it can be answered instead of re-discovered.
 * Removing a route from here without registering it turns the fence red.
 *
 * EMPTY as of 2026-09-01: the original three (perdida / turno detail /
 * caretaker grant) were answered by the PO the same morning they were asked —
 * "Modo perdida", "Turno", "Cuidado temporal" — and registered in _layout.tsx
 * with the reasoning transcribed. The table stays because the RULE stays: the
 * next route whose surfaces disagree gets an entry here, not an invented
 * header. */
const TITLE_PENDING: ReadonlyArray<{ route: string; question: string }> = [];

/** Expo Router's own file — not a screen anybody navigates to by name. */
const ROUTER_OWN = new Set(["+not-found"]);

function routeFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...routeFiles(full, `${prefix}${entry}/`));
      continue;
    }
    if (!entry.endsWith(".tsx")) continue;
    const route = `${prefix}${entry.slice(0, -".tsx".length)}`;
    if (route.endsWith("_layout")) continue;
    out.push(route);
  }
  return out.sort();
}

function registeredNames(): Set<string> {
  const source = readFileSync(LAYOUT, "utf8");
  return new Set([...source.matchAll(/name="([^"]+)"/g)].map((m) => m[1]));
}

describe("mobile screen headers — registered or exempt with a written question", () => {
  const routes = routeFiles(APP_DIR).filter((r) => !ROUTER_OWN.has(r));
  const registered = registeredNames();
  const pending = new Set(TITLE_PENDING.map((e) => e.route));

  it("sees the app directory at all — the sweep must never pass on an empty set", () => {
    expect(routes.length).toBeGreaterThan(20);
    expect(registered.has("turnos/index")).toBe(true);
  });

  it("every route is registered in _layout.tsx or carries a pending copy question", () => {
    const naked = routes.filter((r) => !registered.has(r) && !pending.has(r));
    expect(
      naked,
      "Unregistered routes render their PATH as the header. Register each with a title " +
        "TRANSCRIBED from two agreeing surfaces (see _layout.tsx's own comments for the " +
        "rule), or add it to TITLE_PENDING with the copy question written out.",
    ).toEqual([]);
  });

  it("an exemption dies when its route is registered or gone — it cannot outlive its argument", () => {
    for (const e of TITLE_PENDING) {
      expect(
        routes.includes(e.route),
        `TITLE_PENDING names "${e.route}", which is not a route file any more — remove the entry.`,
      ).toBe(true);
      expect(
        registered.has(e.route),
        `TITLE_PENDING names "${e.route}", but _layout.tsx now registers it — the copy question was answered, so remove the entry.`,
      ).toBe(false);
    }
  });
});
