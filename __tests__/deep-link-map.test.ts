// Fitness test for `@dim/contract/links` — the deep-link table (T3.3).
//
// WHAT THIS PROTECTS
// ---------------------------------------------------------------------------
// A destination table is only worth having if every row in it actually resolves.
// A row naming a route that was renamed or deleted is WORSE than a template
// literal at the call site: the template literal is at least visible next to the
// page it points at, while a stale row is a promise made in a package that
// compiles perfectly and produces a 404 for whoever scanned the QR.
//
// So the table is checked against the file system router itself — the app/
// tree, which cannot lie about which routes exist — rather than against a second
// hand-maintained list, which could rot the same way.
//
// NON-VACUITY. Both sides carry a floor. A glob that stops matching produces an
// empty route set, an empty route set makes every check trivially unsatisfiable
// (or, if inverted, trivially satisfied), and this repo has been bitten by a
// fence whose corpus quietly missed its subject often enough to write the floor
// first and the check second.

import { globSync } from "node:fs";

import {
  APP_SCHEME,
  DEEP_LINK_MAP,
  type DeepLinkName,
  deepLinkAppUrl,
  deepLinkPath,
  deepLinkUrl,
  pathParamNames,
} from "@dim/contract/links";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// The route set, derived from app/
// ---------------------------------------------------------------------------

/** Floors. Both are far below the measurement (18 rows, 300+ routes). */
const MIN_MAP_ENTRIES = 15;
const MIN_DISCOVERED_ROUTES = 150;

/**
 * A pattern with its dynamic segments erased, so `/p/[publicToken]` from the
 * file system and `/p/:publicToken` from the table compare equal.
 *
 * Erasing rather than comparing names is deliberate: Next names the parameter
 * in the DIRECTORY, and several of those names disagree with the table's on
 * purpose (`/r/invite/[token]` vs `:invitationToken`, `/denuncias/codigo/[code]`
 * vs `:referenceCode`). The directory name is an implementation detail of one
 * page; the table's name is what a caller writes. What must match is the SHAPE.
 */
function eraseParams(pattern: string): string {
  return pattern
    .split("/")
    .map((segment) => (segment.startsWith(":") || segment.startsWith("[") ? "*" : segment))
    .join("/");
}

/**
 * Every routable path in `app/`, as an erased pattern.
 *
 * Route groups `(app)` / `(public)` are removed — they organise layouts and
 * contribute nothing to the url. `_`-prefixed directories are Next's private
 * folders and are not routes at all. Catch-alls are skipped: nothing in the
 * table is a catch-all, and pretending `[...slug]` matches one erased segment
 * would let a stale row pass by accident.
 */
function discoverRoutes(): Set<string> {
  const files = [...globSync("app/**/page.tsx"), ...globSync("app/**/route.ts")].map((f) =>
    f.replaceAll("\\", "/"),
  );

  const routes = new Set<string>();
  for (const file of files) {
    if (file.includes("node_modules/")) continue;
    const withoutFile = file.replace(/^app/, "").replace(/\/(page\.tsx|route\.ts)$/, "");
    const segments = withoutFile.split("/").filter((s) => s !== "");
    if (segments.some((s) => s.startsWith("_") || s.startsWith("["))) {
      // `_private` folders are not routes; catch-alls are handled above.
      if (segments.some((s) => s.startsWith("_") || s.startsWith("[..."))) continue;
    }
    const visible = segments.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
    routes.add(eraseParams(`/${visible.join("/")}`));
  }
  return routes;
}

const ROUTES = discoverRoutes();
const NAMES = Object.keys(DEEP_LINK_MAP) as DeepLinkName[];

// ---------------------------------------------------------------------------

describe("the corpus is real", () => {
  it("discovers a plausible number of routes from app/", () => {
    expect(ROUTES.size).toBeGreaterThanOrEqual(MIN_DISCOVERED_ROUTES);
  });

  it("has a table with entries in it", () => {
    expect(NAMES.length).toBeGreaterThanOrEqual(MIN_MAP_ENTRIES);
  });

  // The corpus check that proves eraseParams() is doing its job rather than
  // mapping everything to the same string.
  it("recognises the credential route specifically", () => {
    expect(ROUTES.has("/p/*")).toBe(true);
    expect(ROUTES.has("/p/*/encontre")).toBe(true);
  });
});

describe("every destination resolves to a real route", () => {
  it.each(NAMES)("%s", (name) => {
    const erased = eraseParams(DEEP_LINK_MAP[name].webPath);
    expect(
      ROUTES.has(erased),
      [
        `deepLinkMap.${name} points at "${DEEP_LINK_MAP[name].webPath}", which matches no`,
        "page.tsx or route.ts under app/. Either the route moved and the table was not",
        "updated, or the table names a route that was never built.",
      ].join(" "),
    ).toBe(true);
  });
});

describe("the table is unambiguous", () => {
  it("has no two names pointing at the same path shape", () => {
    const byShape = new Map<string, DeepLinkName[]>();
    for (const name of NAMES) {
      const shape = eraseParams(DEEP_LINK_MAP[name].webPath);
      byShape.set(shape, [...(byShape.get(shape) ?? []), name]);
    }
    const collisions = [...byShape.entries()].filter(([, names]) => names.length > 1);
    expect(collisions, `collisions: ${JSON.stringify(collisions)}`).toEqual([]);
  });

  it("gives every path an absolute form", () => {
    for (const name of NAMES) {
      expect(DEEP_LINK_MAP[name].webPath.startsWith("/"), name).toBe(true);
      expect(DEEP_LINK_MAP[name].webPath.endsWith("/"), name).toBe(false);
    }
  });

  // A custom-scheme form that needed a parameter the web form does not have
  // could not be built from `DeepLinkParams<N>`, so this is a type hole the
  // compiler cannot see (the two strings are unrelated to it).
  it("never asks a mimar:// form for a parameter the web form lacks", () => {
    for (const name of NAMES) {
      const { webPath, appPath } = DEEP_LINK_MAP[name];
      if (appPath === null) continue;
      const webParams = new Set(pathParamNames(webPath));
      for (const param of pathParamNames(appPath)) {
        expect(webParams.has(param), `${name}: mimar:// form needs ":${param}"`).toBe(true);
      }
    }
  });

  // The custom scheme is a claim only the installed app can honour, so it must
  // stay the exception it is today. If this number grows, someone is building
  // links that resolve for nobody without an install.
  it("keeps the custom scheme to the one destination that has a reader", () => {
    const withAppPath = NAMES.filter((n) => DEEP_LINK_MAP[n].appPath !== null);
    expect(withAppPath).toEqual(["appointment"]);
  });
});

describe("deepLinkPath", () => {
  it("fills the placeholders", () => {
    expect(deepLinkPath("credential", { publicToken: "DIM-PAMP-0001" })).toBe("/p/DIM-PAMP-0001");
    expect(deepLinkPath("credentialFinder", { publicToken: "DIM-PAMP-0001" })).toBe(
      "/p/DIM-PAMP-0001/encontre",
    );
  });

  it("returns a parameterless path unchanged", () => {
    expect(deepLinkPath("myPets", {})).toBe("/mis-mascotas");
  });

  it("encodes a value that would otherwise change the path shape", () => {
    expect(deepLinkPath("welfareReport", { referenceCode: "a/b" })).toBe("/denuncias/codigo/a%2Fb");
  });

  // The failure this guards is a poster with "/p/undefined" printed on it.
  it("refuses a missing or empty value instead of printing it", () => {
    // @ts-expect-error — the compiler already refuses this; the throw is for
    // the caller who reached the builder with data from a database column.
    expect(() => deepLinkPath("credential", {})).toThrow(/missing value for ":publicToken"/);
    expect(() => deepLinkPath("credential", { publicToken: "" })).toThrow(/missing value/);
  });
});

describe("deepLinkUrl", () => {
  it("prefixes the origin", () => {
    expect(deepLinkUrl("https://mimar.ar", "credential", { publicToken: "DIM-PAMP-0001" })).toBe(
      "https://mimar.ar/p/DIM-PAMP-0001",
    );
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(deepLinkUrl("https://mimar.ar/", "credential", { publicToken: "X" })).toBe(
      "https://mimar.ar/p/X",
    );
  });
});

describe("deepLinkAppUrl", () => {
  // BYTE-FOR-BYTE what app/(app)/mis-turnos/[appointmentToken]/page.tsx encoded
  // into its check-in QR before the migration. Keeping the custom scheme working
  // is explicit scope: replacing it with an https url would claim a verified App
  // Link that has no Play-signed fingerprint behind it.
  it("builds the check-in QR payload unchanged", () => {
    expect(deepLinkAppUrl("appointment", { appointmentToken: "APT-123" })).toBe(
      "mimar://appointment/APT-123",
    );
    expect(APP_SCHEME).toBe("mimar");
  });

  it("refuses a destination the app does not claim", () => {
    expect(() => deepLinkAppUrl("credential", { publicToken: "DIM-PAMP-0001" })).toThrow(
      /no mimar:\/\/ form/,
    );
  });
});
